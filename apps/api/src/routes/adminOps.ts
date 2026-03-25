import type { FastifyPluginAsync } from 'fastify'
import { requireAdmin } from '../auth/requireAdmin'
import { env } from '../env'
import { getDb } from '../db'
import { getAllAdminLastLogins } from '../store/adminUsers'

/* ================================================================== */
/*  Types                                                             */
/* ================================================================== */

export type OpsDto = {
  /* 1. Alerts */
  alerts: Array<{
    id: string
    severity: 'red' | 'amber'
    label: string
    count: number
    detail?: string
  }>

  /* 2. Department Health */
  departments: Array<{
    department: string
    headcount: number
    openTasks: number
    overdueTasks: number
    overdueRate: number
    activityThisMonth: number
    lastActivityDate: string | null
    health: 'green' | 'amber' | 'red'
    meetings: number
    demos: number
    tickets: number
    members: Array<{
      name: string
      ownerId: string
      openTasks: number
      overdueTasks: number
      calls: number
      emails: number
      notes: number
      meetings: number
      demos: number
      tickets: number
      lastActivity: string | null
    }>
  }>

  /* 3. Handoff & Onboarding */
  handoff: {
    unassignedWon: Array<{
      company: string
      dealName: string
      owner: string
      daysSinceWon: number
    }>
    noContactNewCustomers: Array<{
      company: string
      owner: string
      daysSinceWon: number
      lastActivity: string | null
    }>
    noNotesNewCustomers: Array<{
      company: string
      owner: string
      daysSinceWon: number
    }>
    avgDaysToFirstContact: number | null
    overdueOnboarding: Array<{
      task: string
      owner: string
      company: string
      daysOverdue: number
    }>
  }

  /* 4. Data Quality */
  dataQuality: {
    contactsMissingEmail: number
    contactsMissingOwner: number
    companiesMissingLifecycle: number
    companiesMissingOwner: number
    dealsNoActivity14d: number
    dealsStuck21d: number
    openDealsNoCloseDate: number
  }

  /* 5. Marketing Signals */
  marketing: {
    available: boolean
    note?: string
    activeCampaigns: number
    emailsSent: number
    avgOpenRate: number
    avgOpenRatePrev: number
    avgClickRate: number
    avgClickRatePrev: number
    unsubscribeRate: number
    hardBounceRate: number
    campaigns: Array<{
      name: string
      sent: number
      openRate: number
      clickRate: number
      bounces: number
      status: string
    }>
  }

  /* 6. Task & Workload */
  taskWorkload: {
    totalOpen: number
    totalOverdue: number
    overdueRate: number
    completedThisMonth: number
    completedPrev: number
    avgCompletionDays: number
    avgCompletionDaysPrev: number
    overdueByOwner: Array<{ name: string; count: number }>
    volumeByDept: Array<{
      department: string
      thisMonth: number
      prevMonth: number
    }>
  }

  /* 7. Inactive Companies */
  inactiveCompanies: {
    count14to30: number
    count30plus: number
    companies: Array<{
      name: string
      companyId: string
      owner: string
      lifecycleStage: string
      lastActivityDate: string | null
      daysInactive: number
    }>
  }

  /* 8. Process Efficiency */
  processEfficiency: {
    avgMqlToDemo: number | null
    avgDemoToClose: number | null
    avgWonToFirstContact: number | null
    meetingNoShowRate: number | null
    meetingNoShowRatePrev: number | null
    taskCompletionRateByDept: Array<{ department: string; rate: number }>
    sparklines: {
      mqlToDemo: number[]
      demoToClose: number[]
      noShowRate: number[]
    }
  }

  /* Meta */
  scopeWarnings: string[]
}

/* ================================================================== */
/*  HubSpot helpers                                                   */
/* ================================================================== */

const HUBSPOT_BASE = 'https://api.hubapi.com'

let lastRequestTime = 0
const MIN_REQUEST_GAP_MS = 350

async function throttle() {
  const now = Date.now()
  const elapsed = now - lastRequestTime
  if (elapsed < MIN_REQUEST_GAP_MS) {
    await new Promise((r) => setTimeout(r, MIN_REQUEST_GAP_MS - elapsed))
  }
  lastRequestTime = Date.now()
}

async function hsFetch(
  path: string,
  init?: RequestInit,
  _retry = 0,
): Promise<Response> {
  const token = env.HUBSPOT_PRIVATE_APP_TOKEN
  if (!token) throw new Error('Missing HUBSPOT_PRIVATE_APP_TOKEN')
  await throttle()
  const res = await fetch(`${HUBSPOT_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  })
  if (res.status === 429 && _retry < 4) {
    const wait = Math.min(1000 * 2 ** _retry, 8000)
    await new Promise((r) => setTimeout(r, wait))
    return hsFetch(path, init, _retry + 1)
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HubSpot ${res.status}: ${text}`)
  }
  return res
}

/* ── Paginated CRM search ── */
async function searchObjects(
  objectType: string,
  body: Record<string, unknown>,
  properties: string[],
): Promise<Array<{ id: string; properties: Record<string, string> }>> {
  const results: Array<{ id: string; properties: Record<string, string> }> = []
  let after: string | undefined
  for (let page = 0; page < 20; page++) {
    const payload: Record<string, unknown> = {
      ...body,
      properties,
      limit: 100,
      ...(after ? { after } : {}),
    }
    const res = await hsFetch(`/crm/v3/objects/${objectType}/search`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    const json = (await res.json()) as {
      results: Array<{ id: string; properties: Record<string, string> }>
      paging?: { next?: { after: string } }
    }
    for (const r of json.results) results.push(r)
    after = json.paging?.next?.after
    if (!after) break
  }
  return results
}

/* ── Owners cache ── */
let ownersCache: Map<string, { firstName: string; lastName: string; full: string; email: string }> | null =
  null
let ownersCacheTs = 0
const OWNERS_TTL = 30 * 60 * 1000

async function getOwners() {
  if (ownersCache && Date.now() - ownersCacheTs < OWNERS_TTL) return ownersCache
  const map = new Map<string, { firstName: string; lastName: string; full: string; email: string }>()
  let after: string | undefined
  for (let page = 0; page < 10; page++) {
    const qs = after ? `?after=${after}&limit=100` : '?limit=100'
    const res = await hsFetch(`/crm/v3/owners${qs}`)
    const json = (await res.json()) as {
      results: Array<{ id: string; firstName: string; lastName: string; email?: string }>
      paging?: { next?: { after: string } }
    }
    for (const o of json.results) {
      const full = `${o.firstName ?? ''} ${o.lastName ?? ''}`.trim() || `Owner ${o.id}`
      map.set(o.id, { firstName: o.firstName ?? '', lastName: o.lastName ?? '', full, email: o.email ?? '' })
    }
    after = json.paging?.next?.after
    if (!after) break
  }
  ownersCache = map
  ownersCacheTs = Date.now()
  return map
}

/* ================================================================== */
/*  Department mapping                                                */
/* ================================================================== */

const DEPT_MAP: Record<string, string> = {
  raj: 'Sales',
  naheed: 'Sales',
  simone: 'Success',
  shaun: 'Training',
  hope: 'Retention',
  jason: 'Support',
  ian: 'Support',
  ahmad: 'Support',
  sam: 'Support',
  joe: 'Support',
  rupert: 'Support',
  liam: 'Marketing',
  debbie: 'Finance',
}

const ACTIVE_DEPTS = ['Sales', 'Success', 'Support', 'Training', 'Retention', 'Finance']

function getDept(fullName: string): string {
  const first = fullName.split(' ')[0]?.toLowerCase() ?? ''
  return DEPT_MAP[first] ?? 'Other'
}

/* Success / Training owner IDs (for handoff checks) */
const SUCCESS_TRAINING_IDS = new Set([
  '146100483', // Simone
  '588615646', // Hope
  '29248247', // Shaun
])

/* ================================================================== */
/*  Date helpers                                                      */
/* ================================================================== */

function monthBounds(monthKey: string) {
  const [y, m] = monthKey.split('-').map(Number) as [number, number]
  const start = new Date(Date.UTC(y, m - 1, 1))
  const end = new Date(Date.UTC(y, m, 1))
  return { start, end, startIso: start.toISOString(), endIso: end.toISOString() }
}

function prevMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number) as [number, number]
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function daysAgo(d: Date, ref: Date): number {
  return Math.floor((ref.getTime() - d.getTime()) / 86_400_000)
}

function last3Months(focusMonth: string): string[] {
  const months: string[] = []
  let key = focusMonth
  for (let i = 0; i < 3; i++) {
    months.unshift(key)
    key = prevMonthKey(key)
  }
  return months
}

/* ================================================================== */
/*  Builder                                                           */
/* ================================================================== */

async function buildOpsStats(month?: string): Promise<OpsDto> {
  const now = new Date()
  const focusMonth =
    month && /^\d{4}-\d{2}$/.test(month)
      ? month
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const prev = prevMonthKey(focusMonth)
  const { startIso: focusStart, endIso: focusEnd } = monthBounds(focusMonth)
  const { startIso: prevStart, endIso: prevEnd } = monthBounds(prev)

  const owners = await getOwners()
  const ownerName = (id: string) => owners.get(id)?.full ?? 'Unassigned'

  const scopeWarnings: string[] = []
  const unavailableTypes = new Set<string>()

  /* ── Safe search wrapper ── */
  async function safeSearch(
    objectType: string,
    body: Record<string, unknown>,
    properties: string[],
  ) {
    if (unavailableTypes.has(objectType)) return []
    try {
      return await searchObjects(objectType, body, properties)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('403') || msg.includes('MISSING_SCOPES')) {
        unavailableTypes.add(objectType)
        scopeWarnings.push(`${objectType}: missing HubSpot scope`)
        return []
      }
      throw err
    }
  }

  /* ── Safe HubSpot GET wrapper ── */
  async function safeGet<T>(path: string, fallback: T): Promise<T> {
    try {
      const res = await hsFetch(path)
      return (await res.json()) as T
    } catch {
      scopeWarnings.push(`${path}: unavailable`)
      return fallback
    }
  }

  /* ────────────────────────────────────────────────────────────────
     PHASE 1: TASKS
  ──────────────────────────────────────────────────────────────── */

  const TASK_PROPS = [
    'hs_task_subject',
    'hubspot_owner_id',
    'hs_task_status',
    'hs_timestamp',
    'hs_task_completion_date',
  ]

  const openTasksRaw = await safeSearch(
    'tasks',
    {
      filterGroups: [
        {
          filters: [{ propertyName: 'hs_task_status', operator: 'NEQ', value: 'COMPLETED' }],
        },
      ],
    },
    TASK_PROPS,
  )

  const completedFocusRaw = await safeSearch(
    'tasks',
    {
      filterGroups: [
        {
          filters: [
            { propertyName: 'hs_task_status', operator: 'EQ', value: 'COMPLETED' },
            { propertyName: 'hs_task_completion_date', operator: 'GTE', value: focusStart },
            { propertyName: 'hs_task_completion_date', operator: 'LT', value: focusEnd },
          ],
        },
      ],
    },
    TASK_PROPS,
  )

  const completedPrevRaw = await safeSearch(
    'tasks',
    {
      filterGroups: [
        {
          filters: [
            { propertyName: 'hs_task_status', operator: 'EQ', value: 'COMPLETED' },
            { propertyName: 'hs_task_completion_date', operator: 'GTE', value: prevStart },
            { propertyName: 'hs_task_completion_date', operator: 'LT', value: prevEnd },
          ],
        },
      ],
    },
    TASK_PROPS,
  )

  /* ────────────────────────────────────────────────────────────────
     PHASE 2: ENGAGEMENTS (calls, emails, notes)
  ──────────────────────────────────────────────────────────────── */

  const ENG_PROPS = ['hs_timestamp', 'hubspot_owner_id']

  async function fetchEngagements(type: string, start: string, end: string) {
    return safeSearch(type, {
      filterGroups: [
        {
          filters: [
            { propertyName: 'hs_timestamp', operator: 'GTE', value: start },
            { propertyName: 'hs_timestamp', operator: 'LT', value: end },
          ],
        },
      ],
    }, ENG_PROPS)
  }

  const callsFocus = await fetchEngagements('calls', focusStart, focusEnd)
  const callsPrev = await fetchEngagements('calls', prevStart, prevEnd)
  const emailsFocus = await fetchEngagements('emails', focusStart, focusEnd)
  const emailsPrev = await fetchEngagements('emails', prevStart, prevEnd)
  const notesFocus = await fetchEngagements('notes', focusStart, focusEnd)
  const notesPrev = await fetchEngagements('notes', prevStart, prevEnd)

  /* ── TICKETS (Support team primary metric) ── */
  const TICKET_PROPS = ['hubspot_owner_id', 'hs_pipeline_stage', 'createdate']
  const ticketsFocus = await safeSearch(
    'tickets',
    {
      filterGroups: [
        {
          filters: [
            { propertyName: 'createdate', operator: 'GTE', value: focusStart },
            { propertyName: 'createdate', operator: 'LT', value: focusEnd },
          ],
        },
      ],
    },
    TICKET_PROPS,
  )

  /* Tally tickets per owner */
  const ownerTickets = new Map<string, number>()
  for (const t of ticketsFocus) {
    const oid = t.properties.hubspot_owner_id ?? 'unknown'
    ownerTickets.set(oid, (ownerTickets.get(oid) ?? 0) + 1)
  }

  /* ────────────────────────────────────────────────────────────────
     PHASE 3: PAYING COMPANIES (for handoff + inactive)
  ──────────────────────────────────────────────────────────────── */

  const COMPANY_PROPS = [
    'name',
    'salesstatus',
    'hubspot_owner_id',
    'lifecyclestage',
    'hs_last_sales_activity_timestamp',
    'notes_last_contacted',
    'hs_latest_meeting_activity',
    'num_notes',
    'installdate',
    'contract_start_date',
  ]

  const payingCompanies = await safeSearch(
    'companies',
    {
      filterGroups: [
        { filters: [{ propertyName: 'salesstatus', operator: 'EQ', value: 'paying_customer' }] },
      ],
    },
    COMPANY_PROPS,
  )

  /* ────────────────────────────────────────────────────────────────
     PHASE 4: RECENT CLOSEDWON DEALS (last 30 days, for handoff)
  ──────────────────────────────────────────────────────────────── */

  const thirtyDaysAgoIso = new Date(now.getTime() - 30 * 86_400_000).toISOString()
  const DEAL_PROPS = [
    'dealname',
    'amount',
    'hubspot_owner_id',
    'dealstage',
    'pipeline',
    'hs_v2_date_entered_closedwon',
    'closedate',
    'hs_lastmodifieddate',
    'createdate',
  ]

  const recentWonDeals = await safeSearch(
    'deals',
    {
      filterGroups: [
        {
          filters: [
            { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
            {
              propertyName: 'hs_v2_date_entered_closedwon',
              operator: 'GTE',
              value: thirtyDaysAgoIso,
            },
          ],
        },
      ],
    },
    DEAL_PROPS,
  )

  /* ────────────────────────────────────────────────────────────────
     PHASE 5: STALE / STUCK DEALS
  ──────────────────────────────────────────────────────────────── */

  const fourteenDaysAgoIso = new Date(now.getTime() - 14 * 86_400_000).toISOString()
  const twentyOneDaysAgoIso = new Date(now.getTime() - 21 * 86_400_000).toISOString()

  const staleDeals14 = await safeSearch(
    'deals',
    {
      filterGroups: [
        {
          filters: [
            { propertyName: 'dealstage', operator: 'NEQ', value: 'closedwon' },
            { propertyName: 'dealstage', operator: 'NEQ', value: 'closedlost' },
            { propertyName: 'hs_lastmodifieddate', operator: 'LT', value: fourteenDaysAgoIso },
          ],
        },
      ],
    },
    ['dealname'],
  )

  const stuckDeals21 = await safeSearch(
    'deals',
    {
      filterGroups: [
        {
          filters: [
            { propertyName: 'dealstage', operator: 'NEQ', value: 'closedwon' },
            { propertyName: 'dealstage', operator: 'NEQ', value: 'closedlost' },
            { propertyName: 'hs_lastmodifieddate', operator: 'LT', value: twentyOneDaysAgoIso },
          ],
        },
      ],
    },
    ['dealname'],
  )

  const dealsNoClose = await safeSearch(
    'deals',
    {
      filterGroups: [
        {
          filters: [
            { propertyName: 'closedate', operator: 'NOT_HAS_PROPERTY' },
            { propertyName: 'dealstage', operator: 'NEQ', value: 'closedlost' },
          ],
        },
      ],
    },
    ['dealname'],
  )

  /* ────────────────────────────────────────────────────────────────
     PHASE 6: DATA QUALITY (contacts + companies)
  ──────────────────────────────────────────────────────────────── */

  const contactsMissingEmail = await safeSearch(
    'contacts',
    { filterGroups: [{ filters: [{ propertyName: 'email', operator: 'NOT_HAS_PROPERTY' }] }] },
    ['firstname'],
  )

  const contactsMissingOwner = await safeSearch(
    'contacts',
    {
      filterGroups: [
        { filters: [{ propertyName: 'hubspot_owner_id', operator: 'NOT_HAS_PROPERTY' }] },
      ],
    },
    ['firstname'],
  )

  const companiesMissingLifecycle = await safeSearch(
    'companies',
    {
      filterGroups: [
        { filters: [{ propertyName: 'lifecyclestage', operator: 'NOT_HAS_PROPERTY' }] },
      ],
    },
    ['name'],
  )

  const companiesMissingOwner = await safeSearch(
    'companies',
    {
      filterGroups: [
        { filters: [{ propertyName: 'hubspot_owner_id', operator: 'NOT_HAS_PROPERTY' }] },
      ],
    },
    ['name'],
  )

  /* ────────────────────────────────────────────────────────────────
     PHASE 7: MEETINGS (for no-show rate)
  ──────────────────────────────────────────────────────────────── */

  const MEETING_PROPS = [
    'hs_meeting_title',
    'hs_meeting_start_time',
    'hubspot_owner_id',
    'hs_meeting_outcome',
  ]

  const meetingsFocus = await safeSearch(
    'meetings',
    {
      filterGroups: [
        {
          filters: [
            { propertyName: 'hs_meeting_start_time', operator: 'GTE', value: focusStart },
            { propertyName: 'hs_meeting_start_time', operator: 'LT', value: focusEnd },
          ],
        },
      ],
    },
    MEETING_PROPS,
  )

  const meetingsPrev = await safeSearch(
    'meetings',
    {
      filterGroups: [
        {
          filters: [
            { propertyName: 'hs_meeting_start_time', operator: 'GTE', value: prevStart },
            { propertyName: 'hs_meeting_start_time', operator: 'LT', value: prevEnd },
          ],
        },
      ],
    },
    MEETING_PROPS,
  )

  /* ────────────────────────────────────────────────────────────────
     PHASE 8: MARKETING SIGNALS
  ──────────────────────────────────────────────────────────────── */

  let marketing: OpsDto['marketing'] = {
    available: false,
    note: 'Marketing Email API requires marketing-email scope.',
    activeCampaigns: 0,
    emailsSent: 0,
    avgOpenRate: 0,
    avgOpenRatePrev: 0,
    avgClickRate: 0,
    avgClickRatePrev: 0,
    unsubscribeRate: 0,
    hardBounceRate: 0,
    campaigns: [],
  }

  try {
    const emailsData = await safeGet<{
      results?: Array<{
        id: string
        name: string
        publishDate?: string
        statistics?: {
          counters?: {
            sent?: number
            open?: number
            click?: number
            bounce?: number
            unsubscribed?: number
          }
          ratios?: {
            openratio?: number
            clickratio?: number
            bounceratio?: number
            unsubscribedratio?: number
          }
        }
        state?: string
        currentState?: string
        isPublished?: boolean
      }>
    }>(
      `/marketing/v3/emails?limit=100&orderBy=-updated&createdAfter=${encodeURIComponent(focusStart)}`,
      { results: undefined },
    )

    if (emailsData.results) {
      console.log(`[ops] Marketing emails API returned ${emailsData.results.length} results`)
      const focusEmails = emailsData.results
      const activeCampaigns = focusEmails.filter(
        (e) => e.isPublished || e.currentState === 'PUBLISHED',
      ).length

      let totalSent = 0
      let totalOpen = 0
      let totalClick = 0
      let totalBounce = 0
      let totalUnsub = 0
      const campaignRows: OpsDto['marketing']['campaigns'] = []

      for (const e of focusEmails) {
        const c = e.statistics?.counters
        const r = e.statistics?.ratios
        const sent = c?.sent ?? 0
        totalSent += sent
        totalOpen += c?.open ?? 0
        totalClick += c?.click ?? 0
        totalBounce += c?.bounce ?? 0
        totalUnsub += c?.unsubscribed ?? 0
        campaignRows.push({
          name: e.name ?? 'Untitled',
          sent,
          openRate: Math.round((r?.openratio ?? 0) * 1000) / 10,
          clickRate: Math.round((r?.clickratio ?? 0) * 1000) / 10,
          bounces: c?.bounce ?? 0,
          status: e.currentState ?? e.state ?? 'Unknown',
        })
      }

      const avgOpenRate =
        totalSent > 0 ? Math.round((totalOpen / totalSent) * 1000) / 10 : 0
      const avgClickRate =
        totalSent > 0 ? Math.round((totalClick / totalSent) * 1000) / 10 : 0

      const prevEmailsData = await safeGet<{
        results?: Array<{
          statistics?: {
            counters?: { sent?: number; open?: number; click?: number }
          }
        }>
      }>(
        `/marketing/v3/emails?limit=100&createdAfter=${encodeURIComponent(prevStart)}&createdBefore=${encodeURIComponent(prevEnd)}`,
        { results: undefined },
      )
      let prevSent = 0
      let prevOpen = 0
      let prevClick = 0
      for (const e of prevEmailsData.results ?? []) {
        prevSent += e.statistics?.counters?.sent ?? 0
        prevOpen += e.statistics?.counters?.open ?? 0
        prevClick += e.statistics?.counters?.click ?? 0
      }

      marketing = {
        available: true,
        activeCampaigns,
        emailsSent: totalSent,
        avgOpenRate,
        avgOpenRatePrev:
          prevSent > 0 ? Math.round((prevOpen / prevSent) * 1000) / 10 : 0,
        avgClickRate,
        avgClickRatePrev:
          prevSent > 0 ? Math.round((prevClick / prevSent) * 1000) / 10 : 0,
        unsubscribeRate:
          totalSent > 0 ? Math.round((totalUnsub / totalSent) * 1000) / 10 : 0,
        hardBounceRate:
          totalSent > 0 ? Math.round((totalBounce / totalSent) * 1000) / 10 : 0,
        campaigns: campaignRows.sort((a, b) => b.sent - a.sent),
      }
    }
  } catch (e) {
    console.warn('[ops] Marketing Email API error (likely missing scope):', e instanceof Error ? e.message : e)
    /* Marketing API not available — keep default */
  }

  /* ────────────────────────────────────────────────────────────────
     PHASE 9: PROCESS EFFICIENCY — deal stage timing
  ──────────────────────────────────────────────────────────────── */

  const STAGE_PROPS = [
    'dealname',
    'createdate',
    'hs_v2_date_entered_closedwon',
    'hs_date_entered_appointmentscheduled',
    'hs_date_entered_presentationscheduled',
    'hs_date_entered_qualifiedtobuy',
    'pipeline',
    'dealstage',
  ]

  const sixMonthsAgoIso = new Date(
    now.getFullYear(),
    now.getMonth() - 6,
    1,
  ).toISOString()

  const recentClosedDeals = await safeSearch(
    'deals',
    {
      filterGroups: [
        {
          filters: [
            { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
            {
              propertyName: 'hs_v2_date_entered_closedwon',
              operator: 'GTE',
              value: sixMonthsAgoIso,
            },
          ],
        },
      ],
    },
    STAGE_PROPS,
  )

  /* ================================================================
     COMPUTE ALL SECTIONS
  ================================================================ */

  function avg(nums: number[]): number | null {
    if (nums.length === 0) return null
    return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
  }

  /* ── Task aggregation per owner ── */
  const ownerTasks = new Map<
    string,
    { open: number; overdue: number; completedFocus: number; completedPrev: number }
  >()

  function ensureOwnerTasks(oid: string) {
    if (!ownerTasks.has(oid))
      ownerTasks.set(oid, { open: 0, overdue: 0, completedFocus: 0, completedPrev: 0 })
    return ownerTasks.get(oid)!
  }

  for (const t of openTasksRaw) {
    const oid = t.properties.hubspot_owner_id ?? 'unknown'
    const row = ensureOwnerTasks(oid)
    row.open++
    const due = t.properties.hs_timestamp ? new Date(t.properties.hs_timestamp) : null
    if (due && due < now) row.overdue++
  }
  for (const t of completedFocusRaw) {
    ensureOwnerTasks(t.properties.hubspot_owner_id ?? 'unknown').completedFocus++
  }
  for (const t of completedPrevRaw) {
    ensureOwnerTasks(t.properties.hubspot_owner_id ?? 'unknown').completedPrev++
  }

  /* ── Engagement aggregation per owner ── */
  const ownerEng = new Map<
    string,
    { calls: number; emails: number; notes: number; lastTs: number }
  >()

  function ensureOwnerEng(oid: string) {
    if (!ownerEng.has(oid))
      ownerEng.set(oid, { calls: 0, emails: 0, notes: 0, lastTs: 0 })
    return ownerEng.get(oid)!
  }

  function tallyEng(
    items: Array<{ properties: Record<string, string> }>,
    field: 'calls' | 'emails' | 'notes',
  ) {
    for (const e of items) {
      const oid = e.properties.hubspot_owner_id ?? 'unknown'
      const row = ensureOwnerEng(oid)
      row[field]++
      const ts = e.properties.hs_timestamp ? new Date(e.properties.hs_timestamp).getTime() : 0
      if (ts > row.lastTs && ts <= Date.now()) row.lastTs = ts
    }
  }

  tallyEng(callsFocus, 'calls')
  tallyEng(emailsFocus, 'emails')
  tallyEng(notesFocus, 'notes')

  /* Tally meetings per owner (meetings excludes demos) */
  const ownerMeetings = new Map<string, { total: number; demos: number }>()
  for (const m of meetingsFocus) {
    const oid = m.properties.hubspot_owner_id ?? 'unknown'
    const row = ownerMeetings.get(oid) ?? { total: 0, demos: 0 }
    const title = (m.properties.hs_meeting_title ?? '').toLowerCase()
    const isDemo = title.includes('demo') || title.includes('demonstration')
    const outcome = (m.properties.hs_meeting_outcome ?? '').toUpperCase()
    if (isDemo && outcome === 'COMPLETED') {
      row.demos++
    } else {
      row.total++
    }
    ownerMeetings.set(oid, row)

    // Include meeting timestamp in lastActivity so meetings update "last active"
    // Only count meetings that have already started (not future scheduled ones)
    const mTs = m.properties.hs_meeting_start_time ? new Date(m.properties.hs_meeting_start_time).getTime() : 0
    if (mTs > 0 && mTs <= Date.now()) {
      const eng = ensureOwnerEng(oid)
      if (mTs > eng.lastTs) eng.lastTs = mTs
    }
  }

  /* ──────────────────────────────────
     SECTION 2: DEPARTMENT HEALTH
  ────────────────────────────────── */

  const allOwnerIds = new Set([...ownerTasks.keys(), ...ownerEng.keys(), ...ownerTickets.keys()])
  for (const [oid, info] of owners.entries()) {
    const dept = getDept(info.full)
    if (ACTIVE_DEPTS.includes(dept)) allOwnerIds.add(oid)
  }

  /* Map owner emails → lastLoginAt from admin portal */
  const adminLogins = await getAllAdminLastLogins()
  const ownerEmailMap = new Map<string, string>()
  for (const [oid, info] of owners.entries()) {
    if (info.email) ownerEmailMap.set(oid, info.email.toLowerCase())
  }

  type MemberRow = {
    name: string
    ownerId: string
    department: string
    openTasks: number
    overdueTasks: number
    calls: number
    emails: number
    notes: number
    meetings: number
    demos: number
    tickets: number
    lastActivity: string | null
    completedFocus: number
    completedPrev: number
  }

  const memberRows: MemberRow[] = []
  for (const oid of allOwnerIds) {
    if (oid === 'unknown') continue
    const name = ownerName(oid)
    const dept = getDept(name)
    if (!ACTIVE_DEPTS.includes(dept)) continue
    const tk = ownerTasks.get(oid) ?? { open: 0, overdue: 0, completedFocus: 0, completedPrev: 0 }
    const eg = ownerEng.get(oid) ?? { calls: 0, emails: 0, notes: 0, lastTs: 0 }
    const mt = ownerMeetings.get(oid) ?? { total: 0, demos: 0 }
    const tix = ownerTickets.get(oid) ?? 0

    // Also consider admin portal login as activity
    let effectiveLastTs = eg.lastTs
    const ownerEmail = ownerEmailMap.get(oid)
    if (ownerEmail) {
      const loginAt = adminLogins.get(ownerEmail)
      if (loginAt) {
        const loginTs = new Date(loginAt).getTime()
        if (loginTs > effectiveLastTs) effectiveLastTs = loginTs
      }
    }

    memberRows.push({
      name,
      ownerId: oid,
      department: dept,
      openTasks: tk.open,
      overdueTasks: tk.overdue,
      calls: eg.calls,
      emails: eg.emails,
      notes: eg.notes,
      meetings: mt.total,
      demos: mt.demos,
      tickets: tix,
      lastActivity: effectiveLastTs > 0 ? new Date(effectiveLastTs).toISOString() : null,
      completedFocus: tk.completedFocus,
      completedPrev: tk.completedPrev,
    })
  }

  const deptGrouped = new Map<string, MemberRow[]>()
  for (const m of memberRows) {
    const arr = deptGrouped.get(m.department) ?? []
    arr.push(m)
    deptGrouped.set(m.department, arr)
  }

  const DEPT_ORDER = ['Sales', 'Success', 'Training', 'Retention', 'Support', 'Finance']
  const departments: OpsDto['departments'] = DEPT_ORDER.filter((d) =>
    deptGrouped.has(d),
  ).map((dept) => {
    const members = deptGrouped.get(dept)!
    const openTasks = members.reduce((s, m) => s + m.openTasks, 0)
    const overdueTasks = members.reduce((s, m) => s + m.overdueTasks, 0)
    const activity = members.reduce((s, m) => s + m.calls + m.emails + m.notes + m.meetings, 0)
    const meetings = members.reduce((s, m) => s + m.meetings, 0)
    const demos = members.reduce((s, m) => s + m.demos, 0)
    const tickets = members.reduce((s, m) => s + m.tickets, 0)
    const latestTs = Math.max(
      ...members.map((m) => (m.lastActivity ? new Date(m.lastActivity).getTime() : 0)),
    )
    const overdueRate = openTasks > 0 ? Math.round((overdueTasks / openTasks) * 100) : 0
    const lastActivityDate = latestTs > 0 ? new Date(latestTs).toISOString() : null
    const daysSinceLastActivity = latestTs > 0 ? daysAgo(new Date(latestTs), now) : 999

    let health: 'green' | 'amber' | 'red' = 'green'
    if (overdueRate > 20 || daysSinceLastActivity >= 7) health = 'red'
    else if (overdueRate >= 10 || daysSinceLastActivity >= 5) health = 'amber'

    return {
      department: dept,
      headcount: members.length,
      openTasks,
      overdueTasks,
      overdueRate,
      activityThisMonth: activity,
      meetings,
      demos,
      tickets,
      lastActivityDate,
      health,
      members: members
        .map((m) => ({
          name: m.name,
          ownerId: m.ownerId,
          openTasks: m.openTasks,
          overdueTasks: m.overdueTasks,
          calls: m.calls,
          emails: m.emails,
          notes: m.notes,
          meetings: m.meetings,
          demos: m.demos,
          tickets: m.tickets,
          lastActivity: m.lastActivity,
        }))
        .sort((a, b) => b.calls + b.emails + b.notes + b.meetings - (a.calls + a.emails + a.notes + a.meetings)),
    }
  })

  /* ──────────────────────────────────
     SECTION 3: HANDOFF & ONBOARDING
  ────────────────────────────────── */

  /* Get company associations for recent won deals */
  const dealCompanyMap = new Map<string, string>()
  if (recentWonDeals.length > 0) {
    try {
      const batchIds = recentWonDeals.map((d) => ({ id: d.id }))
      const res = await hsFetch('/crm/v4/associations/deals/companies/batch/read', {
        method: 'POST',
        body: JSON.stringify({ inputs: batchIds.slice(0, 100) }),
      })
      const json = (await res.json()) as {
        results: Array<{ from: { id: string }; to: Array<{ toObjectId: string }> }>
      }
      for (const r of json.results) {
        if (r.to?.[0]) dealCompanyMap.set(r.from.id, r.to[0].toObjectId)
      }
    } catch {
      /* Associations API may fail — continue without */
    }
  }

  const payingById = new Map(payingCompanies.map((c) => [c.id, c]))

  /* Resolve company names for deals whose company isn't in payingById */
  const missingCompanyIds = new Set<string>()
  for (const deal of recentWonDeals) {
    const cid = dealCompanyMap.get(deal.id)
    if (cid && !payingById.has(cid)) missingCompanyIds.add(cid)
  }
  const extraCompanyNames = new Map<string, string>()
  if (missingCompanyIds.size > 0) {
    const ids = [...missingCompanyIds]
    for (let i = 0; i < ids.length; i += 100) {
      try {
        const batch = ids.slice(i, i + 100)
        const res = await hsFetch('/crm/v3/objects/companies/batch/read', {
          method: 'POST',
          body: JSON.stringify({ inputs: batch.map((id) => ({ id })), properties: ['name'] }),
        })
        const json = (await res.json()) as { results: Array<{ id: string; properties: Record<string, string | null> }> }
        for (const c of json.results) {
          extraCompanyNames.set(c.id, c.properties.name ?? `Company ${c.id}`)
        }
      } catch { /* continue without names */ }
    }
  }

  /* 3a. Deals won but company NOT yet assigned to Success/Training */
  const unassignedWon: OpsDto['handoff']['unassignedWon'] = []
  for (const deal of recentWonDeals) {
    const companyId = dealCompanyMap.get(deal.id)
    const company = companyId ? payingById.get(companyId) : undefined
    const companyOwner = company?.properties.hubspot_owner_id
    const wonDate = deal.properties.hs_v2_date_entered_closedwon
    if (!wonDate) continue
    const daysSinceWon = daysAgo(new Date(wonDate), now)
    if (daysSinceWon < 3) continue // 3-day grace period
    if (!companyOwner || !SUCCESS_TRAINING_IDS.has(companyOwner)) {
      const companyName = company?.properties.name
        ?? (companyId ? extraCompanyNames.get(companyId) : undefined)
        ?? 'Unknown'
      unassignedWon.push({
        company: companyName,
        dealName: deal.properties.dealname ?? 'Untitled',
        owner: ownerName(deal.properties.hubspot_owner_id ?? ''),
        daysSinceWon,
      })
    }
  }

  /* 3b. New customers (won < 30d) with no activity */
  const noContactNew: OpsDto['handoff']['noContactNewCustomers'] = []
  const noNotesNew: OpsDto['handoff']['noNotesNewCustomers'] = []

  for (const c of payingCompanies) {
    const startRaw = c.properties.installdate ?? c.properties.contract_start_date
    if (!startRaw) continue
    const startDate = new Date(startRaw)
    if (isNaN(startDate.getTime())) continue
    const daysSinceWon = daysAgo(startDate, now)
    if (daysSinceWon > 30 || daysSinceWon < 5) continue

    const lastActivity = c.properties.hs_last_sales_activity_timestamp
    const lastMeeting = c.properties.hs_latest_meeting_activity
    const hasRecentContact =
      (lastActivity && new Date(lastActivity) > startDate) ||
      (lastMeeting && new Date(lastMeeting) > startDate)

    if (!hasRecentContact) {
      noContactNew.push({
        company: c.properties.name ?? 'Unknown',
        owner: ownerName(c.properties.hubspot_owner_id ?? ''),
        daysSinceWon,
        lastActivity: lastActivity || null,
      })
    }

    const numNotes = parseInt(c.properties.num_notes ?? '0', 10) || 0
    if (numNotes === 0) {
      noNotesNew.push({
        company: c.properties.name ?? 'Unknown',
        owner: ownerName(c.properties.hubspot_owner_id ?? ''),
        daysSinceWon,
      })
    }
  }

  /* 3c. Avg days from deal won → first customer contact */
  const wonToContactDays: number[] = []
  for (const c of payingCompanies) {
    const startRaw = c.properties.installdate ?? c.properties.contract_start_date
    const firstContact = c.properties.notes_last_contacted
    if (!startRaw || !firstContact) continue
    const start = new Date(startRaw)
    const contact = new Date(firstContact)
    if (isNaN(start.getTime()) || isNaN(contact.getTime())) continue
    if (contact > start) {
      const days = daysAgo(start, contact)
      if (days >= 0 && days < 365) wonToContactDays.push(days)
    }
  }

  /* 3d. Overdue onboarding tasks */
  const EXCLUDED_ONBOARDING_OWNERS = new Set(['231709811']) // Joe Hardstaff
  const overdueOnboarding: OpsDto['handoff']['overdueOnboarding'] = []
  for (const t of openTasksRaw) {
    if (EXCLUDED_ONBOARDING_OWNERS.has(t.properties.hubspot_owner_id ?? '')) continue
    const subject = (t.properties.hs_task_subject ?? '').toLowerCase()
    const due = t.properties.hs_timestamp ? new Date(t.properties.hs_timestamp) : null
    if (
      due &&
      due < now &&
      (subject.includes('onboard') || subject.includes('setup') || subject.includes('training'))
    ) {
      overdueOnboarding.push({
        task: t.properties.hs_task_subject || 'Untitled task',
        owner: ownerName(t.properties.hubspot_owner_id ?? ''),
        company: '',
        daysOverdue: daysAgo(due, now),
      })
    }
  }
  overdueOnboarding.sort((a, b) => b.daysOverdue - a.daysOverdue)

  /* ──────────────────────────────────
     SECTION 4: DATA QUALITY
  ────────────────────────────────── */

  const dataQuality: OpsDto['dataQuality'] = {
    contactsMissingEmail: contactsMissingEmail.length,
    contactsMissingOwner: contactsMissingOwner.length,
    companiesMissingLifecycle: companiesMissingLifecycle.length,
    companiesMissingOwner: companiesMissingOwner.length,
    dealsNoActivity14d: staleDeals14.length,
    dealsStuck21d: stuckDeals21.length,
    openDealsNoCloseDate: dealsNoClose.length,
  }

  /* ──────────────────────────────────
     SECTION 6: TASK & WORKLOAD
  ────────────────────────────────── */

  const totalOpen = openTasksRaw.length
  const totalOverdue = openTasksRaw.filter((t) => {
    const due = t.properties.hs_timestamp ? new Date(t.properties.hs_timestamp) : null
    return due && due < now
  }).length

  function avgCompletionTime(tasks: typeof completedFocusRaw) {
    const days: number[] = []
    for (const t of tasks) {
      const created = t.properties.hs_timestamp ? new Date(t.properties.hs_timestamp).getTime() : 0
      const completed = t.properties.hs_task_completion_date
        ? new Date(t.properties.hs_task_completion_date).getTime()
        : 0
      if (created && completed && completed > created) {
        days.push((completed - created) / 86_400_000)
      }
    }
    return days.length > 0
      ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10
      : 0
  }

  const overdueByOwner: OpsDto['taskWorkload']['overdueByOwner'] = []
  for (const [oid, tk] of ownerTasks.entries()) {
    if (tk.overdue > 0 && oid !== 'unknown') {
      overdueByOwner.push({ name: ownerName(oid), count: tk.overdue })
    }
  }
  overdueByOwner.sort((a, b) => b.count - a.count)

  const volumeByDept: OpsDto['taskWorkload']['volumeByDept'] = DEPT_ORDER.filter((d) =>
    deptGrouped.has(d),
  ).map((dept) => {
    const members = deptGrouped.get(dept)!
    return {
      department: dept,
      thisMonth: members.reduce((s, m) => s + m.completedFocus, 0),
      prevMonth: members.reduce((s, m) => s + m.completedPrev, 0),
    }
  })

  const taskWorkload: OpsDto['taskWorkload'] = {
    totalOpen,
    totalOverdue,
    overdueRate: totalOpen > 0 ? Math.round((totalOverdue / totalOpen) * 100) : 0,
    completedThisMonth: completedFocusRaw.length,
    completedPrev: completedPrevRaw.length,
    avgCompletionDays: avgCompletionTime(completedFocusRaw),
    avgCompletionDaysPrev: avgCompletionTime(completedPrevRaw),
    overdueByOwner,
    volumeByDept,
  }

  /* ──────────────────────────────────
     SECTION 7: INACTIVE COMPANIES
  ────────────────────────────────── */

  const inactiveList: OpsDto['inactiveCompanies']['companies'] = []

  for (const c of payingCompanies) {
    const lastAct = c.properties.hs_last_sales_activity_timestamp
    if (!lastAct) {
      inactiveList.push({
        name: c.properties.name ?? 'Unknown',
        companyId: c.id,
        owner: ownerName(c.properties.hubspot_owner_id ?? ''),
        lifecycleStage: c.properties.lifecyclestage ?? '—',
        lastActivityDate: null,
        daysInactive: 999,
      })
      continue
    }
    const lastDate = new Date(lastAct)
    if (isNaN(lastDate.getTime())) continue
    const days = daysAgo(lastDate, now)
    if (days >= 14) {
      inactiveList.push({
        name: c.properties.name ?? 'Unknown',
        companyId: c.id,
        owner: ownerName(c.properties.hubspot_owner_id ?? ''),
        lifecycleStage: c.properties.lifecyclestage ?? '—',
        lastActivityDate: lastAct,
        daysInactive: days,
      })
    }
  }
  inactiveList.sort((a, b) => b.daysInactive - a.daysInactive)

  const inactiveCompanies: OpsDto['inactiveCompanies'] = {
    count14to30: inactiveList.filter((c) => c.daysInactive >= 14 && c.daysInactive < 30).length,
    count30plus: inactiveList.filter((c) => c.daysInactive >= 30).length,
    companies: inactiveList.slice(0, 50),
  }

  /* ──────────────────────────────────
     SECTION 8: PROCESS EFFICIENCY
  ────────────────────────────────── */

  const mqlToDemoDays: number[] = []
  const demoToCloseDays: number[] = []

  for (const d of recentClosedDeals) {
    const p = d.properties
    const created = p.createdate ? new Date(p.createdate).getTime() : 0
    const demoEntered = p.hs_date_entered_presentationscheduled
      ? new Date(p.hs_date_entered_presentationscheduled).getTime()
      : 0
    const wonEntered = p.hs_v2_date_entered_closedwon
      ? new Date(p.hs_v2_date_entered_closedwon).getTime()
      : 0

    if (created && demoEntered && demoEntered > created) {
      mqlToDemoDays.push((demoEntered - created) / 86_400_000)
    }
    if (demoEntered && wonEntered && wonEntered > demoEntered) {
      demoToCloseDays.push((wonEntered - demoEntered) / 86_400_000)
    }
  }

  /* Meeting no-show rate */
  const noShowCount = meetingsFocus.filter(
    (m) =>
      m.properties.hs_meeting_outcome === 'NO_SHOW' ||
      m.properties.hs_meeting_outcome === 'no_show',
  ).length
  const noShowCountPrev = meetingsPrev.filter(
    (m) =>
      m.properties.hs_meeting_outcome === 'NO_SHOW' ||
      m.properties.hs_meeting_outcome === 'no_show',
  ).length

  /* Task completion rate by dept */
  const taskCompletionRateByDept: OpsDto['processEfficiency']['taskCompletionRateByDept'] =
    DEPT_ORDER.filter((d) => deptGrouped.has(d)).map((dept) => {
      const members = deptGrouped.get(dept)!
      const completed = members.reduce((s, m) => s + m.completedFocus, 0)
      const total = completed + members.reduce((s, m) => s + m.openTasks, 0)
      return {
        department: dept,
        rate: total > 0 ? Math.round((completed / total) * 100) : 0,
      }
    })

  /* 3-month sparklines */
  const spark3 = last3Months(focusMonth)
  const sparkMqlToDemo: number[] = []
  const sparkDemoToClose: number[] = []
  const sparkNoShow: number[] = []

  for (const mk of spark3) {
    const { startIso: s, endIso: e } = monthBounds(mk)
    if (mk === focusMonth) {
      sparkMqlToDemo.push(avg(mqlToDemoDays) ?? 0)
      sparkDemoToClose.push(avg(demoToCloseDays) ?? 0)
      sparkNoShow.push(
        meetingsFocus.length > 0
          ? Math.round((noShowCount / meetingsFocus.length) * 100)
          : 0,
      )
    } else {
      const mkDeals = await safeSearch(
        'deals',
        {
          filterGroups: [
            {
              filters: [
                { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
                { propertyName: 'hs_v2_date_entered_closedwon', operator: 'GTE', value: s },
                { propertyName: 'hs_v2_date_entered_closedwon', operator: 'LT', value: e },
              ],
            },
          ],
        },
        STAGE_PROPS,
      )
      const mkMql: number[] = []
      const mkDemo: number[] = []
      for (const d of mkDeals) {
        const p = d.properties
        const created = p.createdate ? new Date(p.createdate).getTime() : 0
        const demoE = p.hs_date_entered_presentationscheduled
          ? new Date(p.hs_date_entered_presentationscheduled).getTime()
          : 0
        const wonE = p.hs_v2_date_entered_closedwon
          ? new Date(p.hs_v2_date_entered_closedwon).getTime()
          : 0
        if (created && demoE && demoE > created) mkMql.push((demoE - created) / 86_400_000)
        if (demoE && wonE && wonE > demoE) mkDemo.push((wonE - demoE) / 86_400_000)
      }
      sparkMqlToDemo.push(avg(mkMql) ?? 0)
      sparkDemoToClose.push(avg(mkDemo) ?? 0)

      const mkMeetings = await safeSearch(
        'meetings',
        {
          filterGroups: [
            {
              filters: [
                { propertyName: 'hs_meeting_start_time', operator: 'GTE', value: s },
                { propertyName: 'hs_meeting_start_time', operator: 'LT', value: e },
              ],
            },
          ],
        },
        MEETING_PROPS,
      )
      const mkNoShow = mkMeetings.filter(
        (m) =>
          m.properties.hs_meeting_outcome === 'NO_SHOW' ||
          m.properties.hs_meeting_outcome === 'no_show',
      ).length
      sparkNoShow.push(
        mkMeetings.length > 0 ? Math.round((mkNoShow / mkMeetings.length) * 100) : 0,
      )
    }
  }

  const processEfficiency: OpsDto['processEfficiency'] = {
    avgMqlToDemo: avg(mqlToDemoDays),
    avgDemoToClose: avg(demoToCloseDays),
    avgWonToFirstContact: avg(wonToContactDays),
    meetingNoShowRate:
      meetingsFocus.length > 0
        ? Math.round((noShowCount / meetingsFocus.length) * 100)
        : null,
    meetingNoShowRatePrev:
      meetingsPrev.length > 0
        ? Math.round((noShowCountPrev / meetingsPrev.length) * 100)
        : null,
    taskCompletionRateByDept,
    sparklines: {
      mqlToDemo: sparkMqlToDemo,
      demoToClose: sparkDemoToClose,
      noShowRate: sparkNoShow,
    },
  }

  /* ──────────────────────────────────
     SECTION 1: ALERTS
  ────────────────────────────────── */

  const alerts: OpsDto['alerts'] = []

  if (unassignedWon.length > 0) {
    alerts.push({
      id: 'unassigned_won',
      severity: 'red',
      label: 'Deals won — not assigned to Success/Training',
      count: unassignedWon.length,
    })
  }

  if (noContactNew.length > 0) {
    alerts.push({
      id: 'no_contact_new',
      severity: 'red',
      label: 'New customers with zero contact in 5+ days',
      count: noContactNew.length,
    })
  }

  for (const dept of departments) {
    if (dept.overdueRate > 20) {
      alerts.push({
        id: `overdue_dept_${dept.department}`,
        severity: 'red',
        label: `${dept.department}: overdue task rate ${dept.overdueRate}%`,
        count: dept.overdueTasks,
      })
    }
  }

  if (inactiveCompanies.count30plus > 0) {
    alerts.push({
      id: 'inactive_30plus',
      severity: 'amber',
      label: 'Paying customers — no activity in 30+ days',
      count: inactiveCompanies.count30plus,
    })
  }

  const missingDataCount = contactsMissingOwner.length + companiesMissingLifecycle.length
  if (missingDataCount > 10) {
    alerts.push({
      id: 'missing_crm_data',
      severity: 'amber',
      label: 'Contacts/companies missing owner or lifecycle stage',
      count: missingDataCount,
    })
  }

  /* ================================================================
     RETURN
  ================================================================ */

  return {
    alerts,
    departments,
    handoff: {
      unassignedWon,
      noContactNewCustomers: noContactNew,
      noNotesNewCustomers: noNotesNew,
      avgDaysToFirstContact: avg(wonToContactDays),
      overdueOnboarding,
    },
    dataQuality,
    marketing,
    taskWorkload,
    inactiveCompanies,
    processEfficiency,
    scopeWarnings,
  }
}

/* ================================================================== */
/*  MongoDB + in-memory cache                                        */
/* ================================================================== */

const OPS_CACHE_COLLECTION = 'ops_stats_cache'
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes
const memCacheMap = new Map<string, { data: OpsDto; ts: number }>()

async function getCachedOps(cacheKey = 'current'): Promise<{
  data: OpsDto
  updatedAt: Date
} | null> {
  const db = await getDb()
  if (!db) return null
  return db
    .collection<{ _id: string; data: OpsDto; updatedAt: Date }>(
      OPS_CACHE_COLLECTION,
    )
    .findOne({ _id: cacheKey as any })
}

async function setCachedOps(data: OpsDto, cacheKey = 'current'): Promise<void> {
  const db = await getDb()
  if (!db) return
  await db
    .collection(OPS_CACHE_COLLECTION)
    .updateOne(
      { _id: cacheKey as any },
      { $set: { _id: cacheKey as any, data, updatedAt: new Date() } },
      { upsert: true },
    )
}

/* ================================================================== */
/*  Route                                                             */
/* ================================================================== */

export const adminOpsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAdmin)

  app.get('/', async (req, reply) => {
    const q = req.query as Record<string, string>
    const refresh = q.refresh === 'true'
    const month = q.month && /^\d{4}-\d{2}$/.test(q.month) ? q.month : undefined
    const cacheKey = month ?? 'current'

    if (!refresh) {
      // 1. In-memory cache (fastest)
      const mem = memCacheMap.get(cacheKey)
      if (mem && Date.now() - mem.ts < CACHE_TTL_MS) {
        return reply.send({
          stats: mem.data,
          cached: true,
          cachedAt: new Date(mem.ts).toISOString(),
        })
      }

      // 2. MongoDB cache (survives cold starts)
      const mongo = await getCachedOps(cacheKey)
      if (mongo && Date.now() - mongo.updatedAt.getTime() < CACHE_TTL_MS) {
        memCacheMap.set(cacheKey, { data: mongo.data, ts: mongo.updatedAt.getTime() })
        return reply.send({
          stats: mongo.data,
          cached: true,
          cachedAt: mongo.updatedAt.toISOString(),
        })
      }
    }

    const stats = await buildOpsStats(month)
    memCacheMap.set(cacheKey, { data: stats, ts: Date.now() })
    setCachedOps(stats, cacheKey).catch(() => {}) // fire-and-forget
    return reply.send({
      stats,
      cached: false,
      cachedAt: new Date().toISOString(),
    })
  })
}