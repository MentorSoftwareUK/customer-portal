import type { FastifyPluginAsync } from 'fastify'
import { requireAdmin } from '../auth/requireAdmin'
import { env } from '../env'

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type OpsDto = {
  /* Hero KPI cards */
  openTasks: number
  overdueTasks: number
  tasksCompletedThisMonth: number
  tasksCompletedPrev: number
  avgTaskCompletionDays: number
  avgTaskCompletionDaysPrev: number

  /* Engagement counts */
  callsThisMonth: number
  callsPrev: number
  emailsThisMonth: number
  emailsPrev: number
  notesThisMonth: number
  notesPrev: number

  /* KPI sparklines (6 monthly data points, oldest → newest) */
  kpiSpark: {
    tasksCompleted: number[]
    calls: number[]
    emails: number[]
    notes: number[]
  }

  /* Team activity breakdown */
  teamActivity: Array<{
    ownerId: string
    name: string
    department: string
    tasks: number
    calls: number
    emails: number
    notes: number
  }>

  /* Department summary */
  departmentActivity: Array<{
    department: string
    members: string[]
    tasks: number
    calls: number
    emails: number
    notes: number
  }>

  /* Recent activity feed (last 20 activities) */
  recentActivity: Array<{
    type: 'task' | 'call' | 'email' | 'note'
    subject: string
    owner: string
    timestamp: string
    associatedCompany: string | null
  }>

  /* Sequences — placeholder: HubSpot Sequences API requires Marketing Hub */
  sequences: {
    available: false
    note: string
  }

  /* Data quality flags */
  dataQuality: {
    companiesMissingOwner: number
    companiesMissingIndustry: number
    dealsMissingAmount: number
    dealsMissingCloseDate: number
    contactsMissingEmail: number
  }

  /* Scope warnings — engagement types that failed due to missing HubSpot scopes */
  scopeWarnings: string[]
}

/* ------------------------------------------------------------------ */
/*  HubSpot helpers                                                   */
/* ------------------------------------------------------------------ */

const HUBSPOT_BASE = 'https://api.hubapi.com'

/* ── Per-second throttle for HubSpot search endpoint (max ~3 req/s) ── */
let lastRequestTime = 0
const MIN_REQUEST_GAP_MS = 350 // ~2.8 req/s — safely under HubSpot's 4/s limit

async function throttle() {
  const now = Date.now()
  const elapsed = now - lastRequestTime
  if (elapsed < MIN_REQUEST_GAP_MS) {
    await new Promise((r) => setTimeout(r, MIN_REQUEST_GAP_MS - elapsed))
  }
  lastRequestTime = Date.now()
}

async function hsFetch(path: string, init?: RequestInit, _retry = 0): Promise<Response> {
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
): Promise<Array<Record<string, string>>> {
  const results: Array<Record<string, string>> = []
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
      results: Array<{ properties: Record<string, string> }>
      paging?: { next?: { after: string } }
    }
    for (const r of json.results) results.push(r.properties)
    after = json.paging?.next?.after
    if (!after) break
  }
  return results
}

/* ── Owners cache ── */
let ownersCache: Map<string, string> | null = null
let ownersCacheTs = 0
const OWNERS_TTL = 30 * 60 * 1000 // 30 min

async function getOwners(): Promise<Map<string, string>> {
  if (ownersCache && Date.now() - ownersCacheTs < OWNERS_TTL) return ownersCache
  const map = new Map<string, string>()
  let after: string | undefined
  for (let page = 0; page < 10; page++) {
    const qs = after ? `?after=${after}&limit=100` : '?limit=100'
    const res = await hsFetch(`/crm/v3/owners${qs}`)
    const json = (await res.json()) as {
      results: Array<{ id: string; firstName: string; lastName: string }>
      paging?: { next?: { after: string } }
    }
    for (const o of json.results) {
      map.set(o.id, `${o.firstName ?? ''} ${o.lastName ?? ''}`.trim() || `Owner ${o.id}`)
    }
    after = json.paging?.next?.after
    if (!after) break
  }
  ownersCache = map
  ownersCacheTs = Date.now()
  return map
}

/* ------------------------------------------------------------------ */
/*  Date helpers                                                      */
/* ------------------------------------------------------------------ */

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

function last6Months(focusMonth: string): string[] {
  const months: string[] = []
  let key = focusMonth
  for (let i = 0; i < 6; i++) {
    months.unshift(key)
    key = prevMonthKey(key)
  }
  return months
}

/* ------------------------------------------------------------------ */
/*  Builder                                                           */
/* ------------------------------------------------------------------ */

async function buildOpsStats(month?: string): Promise<OpsDto> {
  const now = new Date()
  const focusMonth =
    month && /^\d{4}-\d{2}$/.test(month)
      ? month
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const prev = prevMonthKey(focusMonth)
  const spark6 = last6Months(focusMonth)
  const { startIso: focusStart, endIso: focusEnd } = monthBounds(focusMonth)
  const { startIso: prevStart, endIso: prevEnd } = monthBounds(prev)

  const owners = await getOwners()

  /* Helper: search with graceful 403 handling */
  async function safeSearch(
    objectType: string,
    body: Record<string, unknown>,
    properties: string[],
  ): Promise<Array<Record<string, string>>> {
    try {
      return await searchObjects(objectType, body, properties)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('403') || msg.includes('MISSING_SCOPES')) return []
      throw err
    }
  }

  /* ── Tasks: open + overdue ── */
  const openTasksRaw = await safeSearch(
    'tasks',
    {
      filterGroups: [
        {
          filters: [
            { propertyName: 'hs_task_status', operator: 'NEQ', value: 'COMPLETED' },
          ],
        },
      ],
    },
    ['hs_task_subject', 'hubspot_owner_id', 'hs_task_status', 'hs_timestamp', 'hs_task_completion_date'],
  )

  const openTasks = openTasksRaw.length
  const overdueTasks = openTasksRaw.filter((t) => {
    const due = t.hs_timestamp ? new Date(t.hs_timestamp) : null
    return due && due < now
  }).length

  /* ── Tasks: completed in focus month ── */
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
    ['hs_task_subject', 'hubspot_owner_id', 'hs_timestamp', 'hs_task_completion_date'],
  )
  const tasksCompletedThisMonth = completedFocusRaw.length

  /* Average task completion time (days between creation and completion) */
  const completionDays: number[] = []
  for (const t of completedFocusRaw) {
    const created = t.hs_timestamp ? new Date(t.hs_timestamp).getTime() : 0
    const completed = t.hs_task_completion_date ? new Date(t.hs_task_completion_date).getTime() : 0
    if (created && completed && completed > created) {
      completionDays.push((completed - created) / (1000 * 60 * 60 * 24))
    }
  }
  const avgTaskCompletionDays =
    completionDays.length > 0
      ? Math.round((completionDays.reduce((a, b) => a + b, 0) / completionDays.length) * 10) / 10
      : 0

  /* ── Tasks: completed in prev month ── */
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
    ['hs_task_subject', 'hubspot_owner_id', 'hs_timestamp', 'hs_task_completion_date'],
  )
  const tasksCompletedPrev = completedPrevRaw.length

  const prevCompletionDays: number[] = []
  for (const t of completedPrevRaw) {
    const created = t.hs_timestamp ? new Date(t.hs_timestamp).getTime() : 0
    const completed = t.hs_task_completion_date ? new Date(t.hs_task_completion_date).getTime() : 0
    if (created && completed && completed > created) {
      prevCompletionDays.push((completed - created) / (1000 * 60 * 60 * 24))
    }
  }
  const avgTaskCompletionDaysPrev =
    prevCompletionDays.length > 0
      ? Math.round((prevCompletionDays.reduce((a, b) => a + b, 0) / prevCompletionDays.length) * 10) / 10
      : 0

  /* ── Engagement counts (calls, emails, notes) ── */
  /* Track engagement types that fail due to missing HubSpot scopes */
  const scopeWarnings: string[] = []
  const unavailableTypes = new Set<string>()

  async function countEngagements(
    objectType: string,
    startIso: string,
    endIso: string,
    properties: string[],
  ): Promise<Array<Record<string, string>>> {
    if (unavailableTypes.has(objectType)) return []
    try {
      return await searchObjects(objectType, {
        filterGroups: [
          {
            filters: [
              { propertyName: 'hs_timestamp', operator: 'GTE', value: startIso },
              { propertyName: 'hs_timestamp', operator: 'LT', value: endIso },
            ],
          },
        ],
      }, properties)
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

  const engProps = ['hs_timestamp', 'hubspot_owner_id', 'hs_call_title', 'hs_email_subject', 'hs_note_body']

  // Serialise engagement fetches to avoid 429 rate limits
  const callsFocus = await countEngagements('calls', focusStart, focusEnd, engProps)
  const callsPrevRaw = await countEngagements('calls', prevStart, prevEnd, engProps)
  const emailsFocus = await countEngagements('emails', focusStart, focusEnd, engProps)
  const emailsPrevRaw = await countEngagements('emails', prevStart, prevEnd, engProps)
  const notesFocus = await countEngagements('notes', focusStart, focusEnd, engProps)
  const notesPrevRaw = await countEngagements('notes', prevStart, prevEnd, engProps)

  /* ── Sparkline data (6 months) — serialised per month to avoid 429s ── */
  const sparkTasks: number[] = []
  const sparkCalls: number[] = []
  const sparkEmails: number[] = []
  const sparkNotes: number[] = []

  for (const mk of spark6) {
    if (mk === focusMonth) {
      sparkTasks.push(tasksCompletedThisMonth)
      sparkCalls.push(callsFocus.length)
      sparkEmails.push(emailsFocus.length)
      sparkNotes.push(notesFocus.length)
    } else if (mk === prev) {
      sparkTasks.push(tasksCompletedPrev)
      sparkCalls.push(callsPrevRaw.length)
      sparkEmails.push(emailsPrevRaw.length)
      sparkNotes.push(notesPrevRaw.length)
    } else {
      const { startIso: s, endIso: e } = monthBounds(mk)
      // Fetch sequentially per type to stay within rate limits
      const tc = await safeSearch('tasks', {
        filterGroups: [{
          filters: [
            { propertyName: 'hs_task_status', operator: 'EQ', value: 'COMPLETED' },
            { propertyName: 'hs_task_completion_date', operator: 'GTE', value: s },
            { propertyName: 'hs_task_completion_date', operator: 'LT', value: e },
          ],
        }],
      }, ['hs_task_subject'])
      const cc = await countEngagements('calls', s, e, ['hs_timestamp'])
      const ec = await countEngagements('emails', s, e, ['hs_timestamp'])
      const nc = await countEngagements('notes', s, e, ['hs_timestamp'])
      sparkTasks.push(tc.length)
      sparkCalls.push(cc.length)
      sparkEmails.push(ec.length)
      sparkNotes.push(nc.length)
    }
  }

  /* ── Team activity breakdown (focus month) ── */
  const teamMap = new Map<string, { tasks: number; calls: number; emails: number; notes: number }>()

  function tally(entries: Array<Record<string, string>>, field: 'tasks' | 'calls' | 'emails' | 'notes') {
    for (const e of entries) {
      const oid = e.hubspot_owner_id ?? 'unknown'
      let row = teamMap.get(oid)
      if (!row) {
        row = { tasks: 0, calls: 0, emails: 0, notes: 0 }
        teamMap.set(oid, row)
      }
      row[field]++
    }
  }

  tally(completedFocusRaw, 'tasks')
  tally(callsFocus, 'calls')
  tally(emailsFocus, 'emails')
  tally(notesFocus, 'notes')

  /* ── Department mapping (first name → department) ── */
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
    josh: 'Sales',
    jonathan: 'Sales',
    dean: 'Support',
  }

  function getDept(fullName: string): string {
    const first = fullName.split(' ')[0]?.toLowerCase() ?? ''
    return DEPT_MAP[first] ?? 'Other'
  }

  const teamActivity = [...teamMap.entries()]
    .map(([ownerId, counts]) => {
      const name = owners.get(ownerId) ?? `Owner ${ownerId}`
      return { ownerId, name, department: getDept(name), ...counts }
    })
    .sort((a, b) => (b.tasks + b.calls + b.emails + b.notes) - (a.tasks + a.calls + a.emails + a.notes))

  /* ── Department aggregation ── */
  const deptMap = new Map<string, { members: Set<string>; tasks: number; calls: number; emails: number; notes: number }>()
  for (const m of teamActivity) {
    let d = deptMap.get(m.department)
    if (!d) {
      d = { members: new Set(), tasks: 0, calls: 0, emails: 0, notes: 0 }
      deptMap.set(m.department, d)
    }
    d.members.add(m.name)
    d.tasks += m.tasks
    d.calls += m.calls
    d.emails += m.emails
    d.notes += m.notes
  }

  const DEPT_ORDER = ['Sales', 'Success', 'Training', 'Retention', 'Support', 'Marketing', 'Other']
  const departmentActivity = [...deptMap.entries()]
    .map(([department, d]) => ({
      department,
      members: [...d.members],
      tasks: d.tasks,
      calls: d.calls,
      emails: d.emails,
      notes: d.notes,
    }))
    .sort((a, b) => DEPT_ORDER.indexOf(a.department) - DEPT_ORDER.indexOf(b.department))

  /* ── Recent activity feed (last 20 across all types) ── */
  type ActivityItem = { type: 'task' | 'call' | 'email' | 'note'; subject: string; owner: string; timestamp: string; associatedCompany: string | null }
  const feed: ActivityItem[] = []

  for (const t of completedFocusRaw.slice(0, 20)) {
    feed.push({
      type: 'task',
      subject: t.hs_task_subject || 'Untitled task',
      owner: owners.get(t.hubspot_owner_id ?? '') ?? 'Unknown',
      timestamp: t.hs_task_completion_date || t.hs_timestamp || '',
      associatedCompany: null,
    })
  }
  for (const c of callsFocus.slice(0, 20)) {
    feed.push({
      type: 'call',
      subject: c.hs_call_title || 'Call',
      owner: owners.get(c.hubspot_owner_id ?? '') ?? 'Unknown',
      timestamp: c.hs_timestamp || '',
      associatedCompany: null,
    })
  }
  for (const e of emailsFocus.slice(0, 20)) {
    feed.push({
      type: 'email',
      subject: e.hs_email_subject || 'Email',
      owner: owners.get(e.hubspot_owner_id ?? '') ?? 'Unknown',
      timestamp: e.hs_timestamp || '',
      associatedCompany: null,
    })
  }
  for (const n of notesFocus.slice(0, 20)) {
    feed.push({
      type: 'note',
      subject: (n.hs_note_body || 'Note').slice(0, 120),
      owner: owners.get(n.hubspot_owner_id ?? '') ?? 'Unknown',
      timestamp: n.hs_timestamp || '',
      associatedCompany: null,
    })
  }

  feed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  const recentActivity = feed.slice(0, 20)

  /* ── Data quality checks ── */
  const [compNoOwner, compNoIndustry, dealNoAmt, dealNoClose, contactNoEmail] = await Promise.all([
    safeSearch('companies', {
      filterGroups: [{
        filters: [{ propertyName: 'hubspot_owner_id', operator: 'NOT_HAS_PROPERTY' }],
      }],
    }, ['name']).then((r) => r.length),
    safeSearch('companies', {
      filterGroups: [{
        filters: [{ propertyName: 'industry', operator: 'NOT_HAS_PROPERTY' }],
      }],
    }, ['name']).then((r) => r.length),
    safeSearch('deals', {
      filterGroups: [{
        filters: [
          { propertyName: 'amount', operator: 'NOT_HAS_PROPERTY' },
          { propertyName: 'dealstage', operator: 'NEQ', value: 'closedlost' },
        ],
      }],
    }, ['dealname']).then((r) => r.length),
    safeSearch('deals', {
      filterGroups: [{
        filters: [
          { propertyName: 'closedate', operator: 'NOT_HAS_PROPERTY' },
          { propertyName: 'dealstage', operator: 'NEQ', value: 'closedlost' },
        ],
      }],
    }, ['dealname']).then((r) => r.length),
    safeSearch('contacts', {
      filterGroups: [{
        filters: [{ propertyName: 'email', operator: 'NOT_HAS_PROPERTY' }],
      }],
    }, ['firstname']).then((r) => r.length),
  ])

  return {
    openTasks,
    overdueTasks,
    tasksCompletedThisMonth,
    tasksCompletedPrev,
    avgTaskCompletionDays,
    avgTaskCompletionDaysPrev,
    callsThisMonth: callsFocus.length,
    callsPrev: callsPrevRaw.length,
    emailsThisMonth: emailsFocus.length,
    emailsPrev: emailsPrevRaw.length,
    notesThisMonth: notesFocus.length,
    notesPrev: notesPrevRaw.length,
    kpiSpark: {
      tasksCompleted: sparkTasks,
      calls: sparkCalls,
      emails: sparkEmails,
      notes: sparkNotes,
    },
    teamActivity,
    departmentActivity,
    recentActivity,
    sequences: {
      available: false,
      note: 'Sequences API requires Marketing Hub Enterprise or Sales Hub Enterprise with Sequences scope. Not available with current private app token.',
    },
    dataQuality: {
      companiesMissingOwner: compNoOwner,
      companiesMissingIndustry: compNoIndustry,
      dealsMissingAmount: dealNoAmt,
      dealsMissingCloseDate: dealNoClose,
      contactsMissingEmail: contactNoEmail,
    },
    scopeWarnings,
  }
}

/* ------------------------------------------------------------------ */
/*  In-memory cache                                                   */
/* ------------------------------------------------------------------ */

const CACHE_TTL_MS = 10 * 60 * 1000 // 10 min
const memCacheMap = new Map<string, { data: OpsDto; ts: number }>()

/* ------------------------------------------------------------------ */
/*  Route                                                             */
/* ------------------------------------------------------------------ */

export const adminOpsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAdmin)

  app.get('/', async (req, reply) => {
    const q = req.query as Record<string, string>
    const refresh = q.refresh === 'true'
    const month = q.month && /^\d{4}-\d{2}$/.test(q.month) ? q.month : undefined
    const cacheKey = month ?? 'current'

    if (!refresh) {
      const mem = memCacheMap.get(cacheKey)
      if (mem && Date.now() - mem.ts < CACHE_TTL_MS) {
        return reply.send({
          stats: mem.data,
          cached: true,
          cachedAt: new Date(mem.ts).toISOString(),
        })
      }
    }

    const stats = await buildOpsStats(month)
    memCacheMap.set(cacheKey, { data: stats, ts: Date.now() })
    return reply.send({
      stats,
      cached: false,
      cachedAt: new Date().toISOString(),
    })
  })
}
