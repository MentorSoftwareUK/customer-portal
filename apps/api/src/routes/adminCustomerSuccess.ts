import type { FastifyPluginAsync } from 'fastify'
import { requireAdmin } from '../auth/requireAdmin'
import { env } from '../env'
import { getDb } from '../db'

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type CustomerSuccessDto = {
  /* High-level counts */
  totalPayingCustomers: number
  totalChurned: number
  totalOffboarding: number
  retentionRate: number // percentage

  /* Churn details */
  churnedThisMonth: number
  churnedLast3Months: number
  cancellationReasons: Array<{ reason: string; count: number }>
  recentChurned: Array<{
    name: string
    dateLeft: string
    reason: string
  }>

  /* Meetings */
  meetingsThisMonth: number
  meetingsCompleted: number
  meetingsNoShow: number
  meetingsByAgent: Array<{
    name: string
    ownerId: string
    role: 'success' | 'renewals'
    total: number
    completed: number
    noShow: number
    openTasks: number
    overdueTasks: number
  }>

  /* Monthly churn trend (last 6 months) */
  churnTrend: Array<{ month: string; churned: number; newCustomers: number }>

  /* Customer tenure stats */
  avgTenureMonths: number
  customersByTenure: Array<{ bucket: string; count: number }>

  /* At-risk customers */
  atRiskCustomers: Array<{
    name: string
    companyId: string
    owner: string
    riskScore: number        // 0-100, higher = more at risk
    riskLevel: 'high' | 'medium' | 'low'
    sentiment: 'healthy' | 'neutral' | 'at_risk' | null
    accountRestriction: 'Frozen Support' | 'Unhosted' | null
    hubspotUrl: string
    reasons: string[]
    daysSinceLastContact: number | null
    daysSinceLastMeeting: number | null
    daysSinceLastActivity: number | null
    tenureMonths: number | null
    contractStartDate: string | null
  }>
  atRiskSummary: {
    high: number
    medium: number
    low: number
  }

  /* KPI sparkline data (6 monthly data points, oldest → newest) */
  kpiSpark: {
    paying: number[]
    churned: number[]
    retention: number[]
    meetings: number[]
    completed: number[]
    noShow: number[]
  }

  /* Previous-period values for delta indicators */
  previousPeriod: {
    totalPayingCustomers: number
    retentionRate: number
    churned: number
    meetingsMonth: number
    completedMonth: number
    noShowMonth: number
  }

  /* New customers (within first 60 days of contract start) */
  newCustomers: Array<{
    name: string
    companyId: string
    owner: string
    contractStartDate: string
    daysSinceStart: number
    hubspotUrl: string
    trainingMeeting: 'completed' | 'scheduled' | 'none'
    successMeeting: 'completed' | 'scheduled' | 'none'
    sentiment: 'positive' | 'neutral' | 'negative'
    isPreReg: boolean
  }>

  /* Early churn breakdown */
  earlyChurn: {
    within60: number
    within90: number
    within120: number
    totalWithDates: number
  }
}

/* ------------------------------------------------------------------ */
/*  HubSpot helpers                                                   */
/* ------------------------------------------------------------------ */

const HUBSPOT_BASE = 'https://api.hubapi.com'

async function hsFetch(path: string, init?: RequestInit) {
  const token = env.HUBSPOT_PRIVATE_APP_TOKEN
  if (!token) throw new Error('Missing HUBSPOT_PRIVATE_APP_TOKEN')
  const res = await fetch(`${HUBSPOT_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HubSpot ${res.status}: ${text}`)
  }
  return res
}

type HsCompany = {
  id: string
  properties: Record<string, string | null>
}

async function searchCompanies(
  filterGroups: Array<{
    filters: Array<{
      propertyName: string
      operator: string
      value?: string
    }>
  }>,
  properties: string[],
): Promise<HsCompany[]> {
  const all: HsCompany[] = []
  let after: string | undefined

  for (let page = 0; page < 20; page++) {
    const body: any = {
      filterGroups,
      properties,
      limit: 100,
      sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
    }
    if (after) body.after = after

    const res = await hsFetch('/crm/v3/objects/companies/search', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as {
      results: HsCompany[]
      paging?: { next?: { after: string } }
    }
    all.push(...data.results)
    if (!data.paging?.next?.after) break
    after = data.paging.next.after
  }
  return all
}

type HsMeeting = {
  id: string
  properties: Record<string, string | null>
}

async function searchMeetings(
  filterGroups: Array<{
    filters: Array<{
      propertyName: string
      operator: string
      value?: string
    }>
  }>,
  properties: string[],
): Promise<HsMeeting[]> {
  const all: HsMeeting[] = []
  let after: string | undefined

  for (let page = 0; page < 20; page++) {
    const body: any = {
      filterGroups,
      properties,
      limit: 100,
      sorts: [{ propertyName: 'hs_meeting_start_time', direction: 'DESCENDING' }],
    }
    if (after) body.after = after

    const res = await hsFetch('/crm/v3/objects/meetings/search', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as {
      results: HsMeeting[]
      paging?: { next?: { after: string } }
    }
    all.push(...data.results)
    if (!data.paging?.next?.after) break
    after = data.paging.next.after
  }
  return all
}

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

/** Success team owner IDs */
const SUCCESS_TEAM: Record<string, string> = {
  '146100483': 'Simone Mills',
  '588615646': 'Hope Schindler',
  '29248247': 'Shaun Ward',
}

const COMPANY_PROPERTIES = [
  'name',
  'salesstatus',
  'contract_start_date',
  'installdate',
  'date_left',
  'createdate',
  'lifecyclestage',
  'hubspot_owner_id',
  'what_prompted_you_to_consider_cancelling_mentor_software',
  'the_main_reason_you_re_leaving__other_',
  'notes_last_contacted',
  'hs_last_sales_activity_timestamp',
  'hs_latest_meeting_activity',
  'num_notes',
  'num_contacted_notes',
  'registration_status',
  'hs_csm_sentiment',
  'account_restrictions',
]

const MEETING_PROPERTIES = [
  'hs_meeting_title',
  'hs_meeting_start_time',
  'hubspot_owner_id',
  'hs_meeting_outcome',
]

/* ------------------------------------------------------------------ */
/*  Builder                                                           */
/* ------------------------------------------------------------------ */

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

async function buildCustomerSuccessStats(selectedMonth?: string): Promise<CustomerSuccessDto> {
  const now = new Date()

  // If a specific month is selected, pivot date calculations around it
  let focusDate: Date
  if (selectedMonth && /^\d{4}-\d{2}$/.test(selectedMonth)) {
    const [y, m] = selectedMonth.split('-').map(Number)
    focusDate = new Date(y!, m! - 1, 1)
  } else {
    focusDate = now
  }
  const currentMK = monthKey(focusDate)
  const endOfMonth = new Date(focusDate.getFullYear(), focusDate.getMonth() + 1, 1)
  // For meeting window and new-customer window, use end of selected month instead of now
  const refDate = currentMK === monthKey(now) ? now : endOfMonth

  /* ── 1. Paying customers ── */
  const paying = await searchCompanies(
    [
      {
        filters: [
          { propertyName: 'salesstatus', operator: 'EQ', value: 'paying_customer' },
        ],
      },
    ],
    COMPANY_PROPERTIES,
  )
  const livePayingCount = paying.length

  /* ── 2. Churned customers ── */
  const churned = await searchCompanies(
    [
      {
        filters: [
          { propertyName: 'salesstatus', operator: 'EQ', value: 'Past Customer' },
        ],
      },
    ],
    COMPANY_PROPERTIES,
  )
  const totalChurned = churned.length

  /* ── 3. Off-boarding ── */
  const offboarding = await searchCompanies(
    [
      {
        filters: [
          {
            propertyName: 'salesstatus',
            operator: 'CONTAINS_TOKEN',
            value: 'Off-boarding',
          },
        ],
      },
    ],
    ['name', 'salesstatus', 'hubspot_owner_id'],
  )
  const totalOffboarding = offboarding.length

  /* ── 4. Retention rate ── */
  const totalCustomerBase = livePayingCount + totalChurned + totalOffboarding
  const retentionRate =
    totalCustomerBase > 0
      ? Math.round((livePayingCount / totalCustomerBase) * 100)
      : 100

  /* ── 5. Churn timing ── */
  const threeMonthsAgo = new Date(focusDate.getFullYear(), focusDate.getMonth() - 3, 1)

  const churnedThisMonth = churned.filter((c) => {
    const dl = c.properties.date_left
    if (!dl) return false
    return monthKey(new Date(dl)) === currentMK
  }).length

  const churnedLast3Months = churned.filter((c) => {
    const dl = c.properties.date_left
    if (!dl) return false
    return new Date(dl) >= threeMonthsAgo
  }).length

  /* ── 6. Cancellation reasons ── */
  const reasonCounts = new Map<string, number>()
  for (const c of churned) {
    const reason =
      c.properties.what_prompted_you_to_consider_cancelling_mentor_software ||
      c.properties.the_main_reason_you_re_leaving__other_ ||
      ''
    if (reason.trim()) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1)
    }
  }
  const cancellationReasons = [...reasonCounts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)

  /* ── 7. Recent churned (last 10) ── */
  const recentChurnedCompanies = churned
    .filter((c) => c.properties.date_left)
    .sort(
      (a, b) =>
        new Date(b.properties.date_left!).getTime() -
        new Date(a.properties.date_left!).getTime(),
    )
    .slice(0, 10)

  // For each recently churned company, look up the closed-lost reason from its deals
  const recentChurned = await Promise.all(
    recentChurnedCompanies.map(async (c) => {
      let reason = '—'
      try {
        const assocRes = await hsFetch(
          `/crm/v4/objects/companies/${c.id}/associations/deals?limit=100`,
        )
        const assocData = (await assocRes.json()) as {
          results?: Array<{ toObjectId: string }>
        }
        const dealIds = (assocData.results ?? []).map((r) => r.toObjectId)
        if (dealIds.length > 0) {
          const readRes = await hsFetch('/crm/v3/objects/deals/batch/read', {
            method: 'POST',
            body: JSON.stringify({
              inputs: dealIds.map((id) => ({ id })),
              properties: ['closed_lost_reason', 'dealstage', 'closedate'],
            }),
          })
          const readData = (await readRes.json()) as {
            results?: Array<{ properties: Record<string, string | null> }>
          }
          // Pick the most recent closed-lost deal that has a reason
          const withReason = (readData.results ?? [])
            .filter((d) => d.properties.closed_lost_reason)
            .sort((a, b) =>
              (b.properties.closedate ?? '').localeCompare(a.properties.closedate ?? ''),
            )
          if (withReason.length > 0) {
            reason = withReason[0]!.properties.closed_lost_reason!
          }
        }
      } catch {
        /* deal lookup failed – fall back to dash */
      }
      return {
        name: c.properties.name ?? 'Unknown',
        dateLeft: c.properties.date_left ?? '',
        reason,
      }
    }),
  )

  /* ── 8. Meetings (last 6 months for sparkline data) ── */
  const sixMonthsAgoDate = new Date(focusDate.getFullYear(), focusDate.getMonth() - 5, 1)
  const sixMonthsAgoStr = sixMonthsAgoDate.toISOString().split('T')[0]!

  const allMeetings = await searchMeetings(
    [
      {
        filters: [
          {
            propertyName: 'hs_meeting_start_time',
            operator: 'GTE',
            value: sixMonthsAgoStr,
          },
          {
            propertyName: 'hs_meeting_start_time',
            operator: 'LTE',
            value: refDate.toISOString(),
          },
        ],
      },
    ],
    MEETING_PROPERTIES,
  )

  // Filter to the selected month for the main KPI counts
  const monthStart = new Date(focusDate.getFullYear(), focusDate.getMonth(), 1)
  const meetings = allMeetings.filter((m) => {
    const st = m.properties.hs_meeting_start_time
    if (!st) return false
    const d = new Date(st)
    return d >= monthStart && d < endOfMonth
  })

  const meetingsThisMonth = meetings.length
  const now_ = new Date()
  // Count as completed: explicitly marked COMPLETED, OR past start time and not
  // marked as NO_SHOW / CANCELLED (most people never set the outcome field)
  const meetingsCompleted = meetings.filter((m) => {
    if (m.properties.hs_meeting_outcome === 'COMPLETED') return true
    if (m.properties.hs_meeting_outcome === 'NO_SHOW') return false
    if (m.properties.hs_meeting_outcome === 'CANCELLED') return false
    const st = m.properties.hs_meeting_start_time
    return st != null && new Date(st) <= now_
  }).length
  const meetingsNoShow = meetings.filter(
    (m) => m.properties.hs_meeting_outcome === 'NO_SHOW',
  ).length

  /* ── 9. Meetings by Success team agent ── */
  const agentMeetingMap = new Map<
    string,
    { total: number; completed: number; noShow: number }
  >()
  for (const m of meetings) {
    const oid = m.properties.hubspot_owner_id ?? ''
    const name = SUCCESS_TEAM[oid]
    if (!name) continue // only count success team
    const bucket = agentMeetingMap.get(oid) ?? {
      total: 0,
      completed: 0,
      noShow: 0,
    }
    bucket.total++
    if (m.properties.hs_meeting_outcome === 'COMPLETED') bucket.completed++
    if (m.properties.hs_meeting_outcome === 'NO_SHOW') bucket.noShow++
    agentMeetingMap.set(oid, bucket)
  }

  /* Count open & overdue tasks for each success team member */
  const successOwnerIds = Object.keys(SUCCESS_TEAM)
  const ownerTaskCounts = new Map<string, { open: number; overdue: number }>()
  for (const oid of successOwnerIds) {
    ownerTaskCounts.set(oid, { open: 0, overdue: 0 })
  }
  // Brief pause to avoid HubSpot secondly rate limit from preceding requests
  await new Promise((r) => setTimeout(r, 1100))
  try {
    const taskRes = await hsFetch('/crm/v3/objects/tasks/search', {
      method: 'POST',
      body: JSON.stringify({
        filterGroups: successOwnerIds.map((oid) => ({
          filters: [
            { propertyName: 'hubspot_owner_id', operator: 'EQ', value: oid },
            { propertyName: 'hs_task_status', operator: 'NEQ', value: 'COMPLETED' },
          ],
        })),
        properties: ['hubspot_owner_id', 'hs_task_status', 'hs_timestamp'],
        limit: 200,
      }),
    })
    const taskData = (await taskRes.json()) as { results?: Array<{ properties: Record<string, string | null> }> }
    for (const t of taskData.results ?? []) {
      const oid = t.properties.hubspot_owner_id ?? ''
      const row = ownerTaskCounts.get(oid)
      if (!row) continue
      row.open++
      const due = t.properties.hs_timestamp ? new Date(t.properties.hs_timestamp) : null
      if (due && due < refDate) row.overdue++
    }
  } catch { /* task search failed */ }

  const RENEWALS_OWNER_ID = '588615646' // Hope Schindler

  /* Ensure all success team members appear, even with 0 meetings */
  const meetingsByAgent = Object.entries(SUCCESS_TEAM)
    .map(([ownerId, name]) => {
      const bucket = agentMeetingMap.get(ownerId) ?? { total: 0, completed: 0, noShow: 0 }
      const tasks = ownerTaskCounts.get(ownerId) ?? { open: 0, overdue: 0 }
      return {
        name,
        ownerId,
        role: ownerId === RENEWALS_OWNER_ID ? 'renewals' as const : 'success' as const,
        ...bucket,
        openTasks: tasks.open,
        overdueTasks: tasks.overdue,
      }
    })
    .sort((a, b) => b.total - a.total)

  /* ── 10. Churn trend (last 6 months) ── */

  // Fetch closedwon deals (amount > 0) from the last 7 months to capture
  // free-to-paid conversions that may not have an updated installdate.
  const trendStartDate = new Date(focusDate.getFullYear(), focusDate.getMonth() - 6, 1)
  const wonDeals: Array<{ id: string; closedMonth: string }> = []
  try {
    let wdAfter: string | undefined
    for (let page = 0; page < 10; page++) {
      const body: any = {
        filterGroups: [{
          filters: [
            { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
            { propertyName: 'pipeline', operator: 'EQ', value: 'default' },
            { propertyName: 'amount', operator: 'GT', value: '0' },
            { propertyName: 'hs_v2_date_entered_closedwon', operator: 'GTE', value: trendStartDate.toISOString().split('T')[0] },
          ],
        }],
        properties: ['hs_v2_date_entered_closedwon', 'amount'],
        limit: 100,
      }
      if (wdAfter) body.after = wdAfter
      const res = await hsFetch('/crm/v3/objects/deals/search', { method: 'POST', body: JSON.stringify(body) })
      const data = (await res.json()) as { results: Array<{ id: string; properties: Record<string, string | null> }>; paging?: { next?: { after: string } } }
      for (const d of data.results) {
        const dt = d.properties.hs_v2_date_entered_closedwon
        if (dt) wonDeals.push({ id: d.id, closedMonth: monthKey(new Date(dt)) })
      }
      if (!data.paging?.next?.after) break
      wdAfter = data.paging.next.after
    }
  } catch { /* deal search failed – fall back to install dates only */ }

  // Resolve deal → company associations and build month → Set<companyId>
  const wonCompanyByMonth = new Map<string, Set<string>>()
  for (let b = 0; b < wonDeals.length; b += 20) {
    const batch = wonDeals.slice(b, b + 20)
    await Promise.all(
      batch.map(async (deal) => {
        try {
          const aRes = await hsFetch(`/crm/v4/objects/deals/${deal.id}/associations/companies?limit=10`)
          const aData = (await aRes.json()) as { results?: Array<{ toObjectId: string }> }
          for (const a of aData.results ?? []) {
            let s = wonCompanyByMonth.get(deal.closedMonth)
            if (!s) { s = new Set(); wonCompanyByMonth.set(deal.closedMonth, s) }
            s.add(a.toObjectId)
          }
        } catch { /* skip */ }
      }),
    )
  }

  const churnTrend: Array<{
    month: string
    churned: number
    newCustomers: number
  }> = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(focusDate.getFullYear(), focusDate.getMonth() - i, 1)
    const mk = monthKey(d)
    const churnCount = churned.filter((c) => {
      const dl = c.properties.date_left
      if (!dl) return false
      return monthKey(new Date(dl)) === mk
    }).length

    // Combine: companies with install/contract date in this month + companies
    // whose deal closed-won in this month (de-duplicated by company ID)
    const newCompanyIds = new Set<string>()
    for (const c of paying) {
      const cs = c.properties.installdate ?? c.properties.contract_start_date
      if (cs && monthKey(new Date(cs)) === mk) newCompanyIds.add(c.id)
    }
    const wonSet = wonCompanyByMonth.get(mk)
    if (wonSet) {
      for (const cid of wonSet) newCompanyIds.add(cid)
    }

    churnTrend.push({ month: mk, churned: churnCount, newCustomers: newCompanyIds.size })
  }

  /* ── 11. Customer tenure ── */
  const tenureMonths: number[] = []
  let noStartDateCount = 0
  for (const c of paying) {
    const start = c.properties.installdate ?? c.properties.contract_start_date
    if (!start) {
      noStartDateCount++
      continue
    }
    const months =
      (refDate.getTime() - new Date(start).getTime()) / (30.44 * 86_400_000)
    tenureMonths.push(Math.max(0, months))
  }

  // Average tenure only among customers with a known start date
  const avgTenureMonths =
    tenureMonths.length > 0
      ? Math.round(
          tenureMonths.reduce((s, v) => s + v, 0) / tenureMonths.length,
        )
      : 0

  const tenureBuckets = [
    { bucket: '< 3 months', min: 0, max: 3 },
    { bucket: '3–6 months', min: 3, max: 6 },
    { bucket: '6–12 months', min: 6, max: 12 },
    { bucket: '1–2 years', min: 12, max: 24 },
    { bucket: '2+ years', min: 24, max: Infinity },
  ]
  const customersByTenure = tenureBuckets.map((b) => ({
    bucket: b.bucket,
    count: tenureMonths.filter((t) => t >= b.min && t < b.max).length,
  }))
  // Include customers missing an installdate/contract_start_date so grand total matches paying count
  if (noStartDateCount > 0) {
    customersByTenure.push({ bucket: 'No start date', count: noStartDateCount })
  }

  /* ── 12. At-risk customers ── */
  const HUBSPOT_PORTAL_ID = '145032754'
  const OWNER_NAMES: Record<string, string> = {
    ...SUCCESS_TEAM,
    '711739855': 'Naheed Dad',
    '1774092550': 'Raj Singh',
    '193457719': 'Liam Kotecha',
    '231709811': 'Joe Hardstaff',
    '29942907': 'Josh Ireland',
    '29285963': 'Dean Bennett',
    '508706004': 'Ian Born',
  }

  function daysSince(isoOrNull: string | null | undefined): number | null {
    if (!isoOrNull) return null
    const d = new Date(isoOrNull)
    if (isNaN(d.getTime())) return null
    return Math.floor((refDate.getTime() - d.getTime()) / 86_400_000)
  }

  const atRiskCustomers: CustomerSuccessDto['atRiskCustomers'] = []

  for (const c of paying) {
    const daysSinceContact = daysSince(c.properties.notes_last_contacted)
    const daysSinceMeeting = daysSince(c.properties.hs_latest_meeting_activity)
    const daysSinceActivity = daysSince(c.properties.hs_last_sales_activity_timestamp)
    const tenure = (c.properties.installdate ?? c.properties.contract_start_date)
      ? Math.floor((refDate.getTime() - new Date((c.properties.installdate ?? c.properties.contract_start_date)!).getTime()) / (30.44 * 86_400_000))
      : null
    const salesActivities = parseInt(c.properties.num_notes ?? '0', 10) || 0

    const sentiment = (c.properties.hs_csm_sentiment ?? '').toLowerCase() as 'healthy' | 'neutral' | 'at_risk' | ''
    const sentimentValue: 'healthy' | 'neutral' | 'at_risk' | null = sentiment === 'healthy' || sentiment === 'neutral' || sentiment === 'at_risk' ? sentiment : null

    const rawRestriction = c.properties.account_restrictions ?? ''
    const accountRestriction: 'Frozen Support' | 'Unhosted' | null =
      rawRestriction === 'Frozen Support' ? 'Frozen Support'
      : rawRestriction === 'Unhosted' ? 'Unhosted'
      : null

    const reasons: string[] = []
    let score = 0

    // Customer sentiment from CSM
    if (sentiment === 'at_risk') {
      reasons.push('Sentiment: At-Risk')
      score += 30
    } else if (sentiment === 'healthy') {
      score -= 15
    }

    // Account restrictions
    if (accountRestriction === 'Unhosted') {
      reasons.push('Unhosted')
      score += 25
    } else if (accountRestriction === 'Frozen Support') {
      reasons.push('Frozen Support')
      score += 15
    }

    // No contact in 90+ days => high risk signal
    if (daysSinceContact === null) {
      reasons.push('Never contacted')
      score += 35
    } else if (daysSinceContact >= 90) {
      reasons.push(`No contact in ${daysSinceContact}d`)
      score += 30
    } else if (daysSinceContact >= 60) {
      reasons.push(`No contact in ${daysSinceContact}d`)
      score += 15
    }

    // No meetings in 90+ days
    if (daysSinceMeeting === null) {
      reasons.push('No meetings recorded')
      score += 25
    } else if (daysSinceMeeting >= 90) {
      reasons.push(`No meeting in ${daysSinceMeeting}d`)
      score += 20
    } else if (daysSinceMeeting >= 60) {
      reasons.push(`No meeting in ${daysSinceMeeting}d`)
      score += 10
    }

    // No sales activity in 60+ days
    if (daysSinceActivity !== null && daysSinceActivity >= 60) {
      reasons.push(`No activity in ${daysSinceActivity}d`)
      score += 15
    }

    // Very low engagement (few total activities)
    if (salesActivities <= 2) {
      reasons.push('Very low engagement')
      score += 15
    }

    // New customer with no engagement (< 6 months tenure, no meeting)
    if (tenure !== null && tenure <= 6 && daysSinceMeeting === null) {
      reasons.push('New customer, no onboarding meeting')
      score += 10
    }

    if (score < 25) continue // not at risk

    const riskLevel = score >= 60 ? 'high' as const : score >= 40 ? 'medium' as const : 'low' as const

    atRiskCustomers.push({
      name: c.properties.name ?? 'Unknown',
      companyId: c.id,
      owner: OWNER_NAMES[c.properties.hubspot_owner_id ?? ''] ?? 'Unassigned',
      riskScore: Math.min(score, 100),
      riskLevel,
      sentiment: sentimentValue,
      accountRestriction,
      hubspotUrl: `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/company/${c.id}`,
      reasons,
      daysSinceLastContact: daysSinceContact,
      daysSinceLastMeeting: daysSinceMeeting,
      daysSinceLastActivity: daysSinceActivity,
      tenureMonths: tenure,
      contractStartDate: c.properties.installdate ?? c.properties.contract_start_date ?? null,
    })
  }

  // Sort by risk score descending, cap at 25
  atRiskCustomers.sort((a, b) => b.riskScore - a.riskScore)
  const topAtRisk = atRiskCustomers.slice(0, 25)

  const atRiskSummary = {
    high: atRiskCustomers.filter((c) => c.riskLevel === 'high').length,
    medium: atRiskCustomers.filter((c) => c.riskLevel === 'medium').length,
    low: atRiskCustomers.filter((c) => c.riskLevel === 'low').length,
  }

  /* ── 13. Monthly meeting buckets (for sparklines) ── */
  const meetingsByMonthMap = new Map<string, { total: number; completed: number; noShow: number }>()
  for (const m of allMeetings) {
    const st = m.properties.hs_meeting_start_time
    if (!st) continue
    const mDate = new Date(st)
    const mk = monthKey(mDate)
    const b = meetingsByMonthMap.get(mk) ?? { total: 0, completed: 0, noShow: 0 }
    b.total++
    if (m.properties.hs_meeting_outcome === 'NO_SHOW') {
      b.noShow++
    } else if (m.properties.hs_meeting_outcome === 'COMPLETED' || mDate <= now) {
      // Implicitly completed: past start time and not no-show/cancelled
      if (m.properties.hs_meeting_outcome !== 'CANCELLED') b.completed++
    }
    meetingsByMonthMap.set(mk, b)
  }

  /* ── 14. KPI sparklines (6 monthly data points) ── */
  const isHistorical = currentMK !== monthKey(now)

  // For historical months, walk backwards from today's live count through each
  // intervening month's churn/new to estimate the count at end of selected month
  let payingAtFocus = livePayingCount
  if (isHistorical) {
    // Build per-month churn/new from (selectedMonth+1) through today's month
    const startM = new Date(focusDate.getFullYear(), focusDate.getMonth() + 1, 1)
    const endM = now
    const d = new Date(endM.getFullYear(), endM.getMonth(), 1)
    while (d > startM) {
      const mk = monthKey(d)
      const churnCount = churned.filter((c) => {
        const dl = c.properties.date_left
        return dl ? monthKey(new Date(dl)) === mk : false
      }).length
      const newCustCount = paying.filter((c) => {
        const cs = c.properties.installdate ?? c.properties.contract_start_date
        return cs ? monthKey(new Date(cs)) === mk : false
      }).length
      // Reverse: to go back one month, undo its effect
      payingAtFocus = payingAtFocus + churnCount - newCustCount
      d.setMonth(d.getMonth() - 1)
    }
    // Also undo the selected month itself if focus < current month
    const focusMk = monthKey(startM) // month after focus
    // We've already walked down to startM, no need to undo focusDate's own month
  }

  // Estimate sparkline by reversing churn/new within the 6-month window
  const payingSpark: number[] = []
  let payingEst = payingAtFocus
  for (let i = 5; i >= 0; i--) {
    payingSpark.unshift(Math.max(0, payingEst))
    if (i > 0) {
      payingEst = payingEst + (churnTrend[i]?.churned ?? 0) - (churnTrend[i]?.newCustomers ?? 0)
    }
  }

  const totalPayingCustomers = payingAtFocus

  // Recalculate retention rate for historical months
  const finalRetentionRate = isHistorical
    ? (() => {
        const base = totalPayingCustomers + totalChurned + totalOffboarding
        return base > 0 ? Math.round((totalPayingCustomers / base) * 100) : 100
      })()
    : retentionRate

  const meetingsSpark: number[] = []
  const completedSpark: number[] = []
  const noShowSpark: number[] = []
  const churnedSpark: number[] = []
  const retentionSpark: number[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(focusDate.getFullYear(), focusDate.getMonth() - i, 1)
    const mk = monthKey(d)
    const mb = meetingsByMonthMap.get(mk) ?? { total: 0, completed: 0, noShow: 0 }
    meetingsSpark.push(mb.total)
    completedSpark.push(mb.completed)
    noShowSpark.push(mb.noShow)
    churnedSpark.push(churnTrend[5 - i]?.churned ?? 0)
    // Retention % estimate for sparkline
    const estPay = payingSpark[5 - i] ?? livePayingCount
    const totalBase = estPay + (churnTrend.slice(0, 5 - i + 1).reduce((a, t) => a + t.churned, 0))
    retentionSpark.push(totalBase > 0 ? Math.round((estPay / totalBase) * 100) : 100)
  }

  const kpiSpark = {
    paying: payingSpark,
    churned: churnedSpark,
    retention: retentionSpark,
    meetings: meetingsSpark,
    completed: completedSpark,
    noShow: noShowSpark,
  }

  /* ── 15. Previous period for delta comparison ── */
  const prevMK = monthKey(new Date(focusDate.getFullYear(), focusDate.getMonth() - 1, 1))
  const prevMeetingBucket = meetingsByMonthMap.get(prevMK) ?? { total: 0, completed: 0, noShow: 0 }
  const previousPeriod = {
    totalPayingCustomers: payingSpark[4] ?? livePayingCount,
    retentionRate: retentionSpark[4] ?? retentionRate,
    churned: churnTrend[4]?.churned ?? 0,
    meetingsMonth: prevMeetingBucket.total,
    completedMonth: prevMeetingBucket.completed,
    noShowMonth: prevMeetingBucket.noShow,
  }

  /* ── 16. New customers (within first 60 days) ── */
  const sixtyDaysAgo = new Date(refDate.getTime() - 60 * 86_400_000)

  const newCustCandidates = paying.filter((c) => {
    const start = c.properties.installdate ?? c.properties.contract_start_date
    if (!start) return false
    if (new Date(start) < sixtyDaysAgo) return false
    return true
  })

  // Fetch associated meetings for each new customer
  type MeetingClassification = 'training' | 'success' | 'other'
  function classifyMeeting(m: HsMeeting): MeetingClassification {
    const title = (m.properties.hs_meeting_title ?? '').toLowerCase()
    if (title.includes('training') || title.includes('onboarding') || title.includes('setup') || title.includes('implementation')) return 'training'
    if (title.includes('success') || title.includes('review') || title.includes('check-in') || title.includes('check in') || title.includes('qbr') || title.includes('quarterly')) return 'success'
    return 'other'
  }

  function deriveMeetingStatus(
    companyMeetings: HsMeeting[],
    type: 'training' | 'success',
  ): 'completed' | 'scheduled' | 'none' {
    const typed = companyMeetings.filter((m) => classifyMeeting(m) === type)
    if (typed.length === 0) return 'none'
    const hasCompleted = typed.some(
      (m) =>
        m.properties.hs_meeting_outcome === 'COMPLETED' ||
        (m.properties.hs_meeting_start_time &&
          new Date(m.properties.hs_meeting_start_time) < refDate &&
          m.properties.hs_meeting_outcome !== 'CANCELLED' &&
          m.properties.hs_meeting_outcome !== 'NO_SHOW'),
    )
    if (hasCompleted) return 'completed'
    const hasFuture = typed.some(
      (m) =>
        m.properties.hs_meeting_start_time &&
        new Date(m.properties.hs_meeting_start_time) > refDate,
    )
    if (hasFuture) return 'scheduled'
    return 'none'
  }

  const newCustomers: CustomerSuccessDto['newCustomers'] = []
  // Process in parallel, max 10 concurrent
  const batchSize = 10
  for (let b = 0; b < newCustCandidates.length; b += batchSize) {
    const batch = newCustCandidates.slice(b, b + batchSize)
    const results = await Promise.all(
      batch.map(async (c) => {
        let companyMeetings: HsMeeting[] = []
        const isPreReg = c.properties.registration_status === 'Unregistered' || c.properties.registration_status === 'Pre-registered (Paid)'
        const rawSentiment = (c.properties.hs_csm_sentiment ?? '').toLowerCase()
        const sentiment: 'positive' | 'neutral' | 'negative' =
          rawSentiment === 'healthy' ? 'positive'
          : rawSentiment === 'at_risk' ? 'negative'
          : 'neutral'
        try {
          // Fetch meeting associations for this company
          const assocRes = await hsFetch(
            `/crm/v4/objects/companies/${c.id}/associations/meetings?limit=500`,
          )
          const assocData = (await assocRes.json()) as {
            results?: Array<{ toObjectId: string }>
          }
          const meetingIds = (assocData.results ?? []).map((r) => r.toObjectId)

          if (meetingIds.length > 0) {
            const readRes = await hsFetch('/crm/v3/objects/meetings/batch/read', {
              method: 'POST',
              body: JSON.stringify({
                inputs: meetingIds.map((id) => ({ id })),
                properties: MEETING_PROPERTIES,
              }),
            })
            const readData = (await readRes.json()) as { results?: HsMeeting[] }
            companyMeetings = readData.results ?? []
          }
        } catch {
          /* association fetch failed – treat as no meetings */
        }

        const startDate = (c.properties.installdate ?? c.properties.contract_start_date)!
        return {
          name: c.properties.name ?? 'Unknown',
          companyId: c.id,
          owner:
            OWNER_NAMES[c.properties.hubspot_owner_id ?? ''] ?? 'Unassigned',
          contractStartDate: startDate,
          daysSinceStart: Math.floor(
            (refDate.getTime() - new Date(startDate).getTime()) / 86_400_000,
          ),
          hubspotUrl: `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/company/${c.id}`,
          trainingMeeting: deriveMeetingStatus(companyMeetings, 'training'),
          successMeeting: deriveMeetingStatus(companyMeetings, 'success'),
          sentiment,
          isPreReg,
        }
      }),
    )
    newCustomers.push(...results)
  }

  // Sort by most recent first
  newCustomers.sort(
    (a, b) =>
      new Date(b.contractStartDate).getTime() -
      new Date(a.contractStartDate).getTime(),
  )

  /* ── 17. Early churn breakdown ── */
  let within60 = 0
  let within90 = 0
  let within120 = 0
  let totalWithDates = 0
  for (const c of churned) {
    const start = c.properties.installdate ?? c.properties.contract_start_date
    const left = c.properties.date_left
    if (!start || !left) continue
    totalWithDates++
    const tenureDays = Math.floor(
      (new Date(left).getTime() - new Date(start).getTime()) / 86_400_000,
    )
    if (tenureDays <= 60) within60++
    if (tenureDays <= 90) within90++
    if (tenureDays <= 120) within120++
  }

  const earlyChurn = { within60, within90, within120, totalWithDates }

  return {
    totalPayingCustomers,
    totalChurned,
    totalOffboarding,
    retentionRate: finalRetentionRate,
    churnedThisMonth,
    churnedLast3Months,
    cancellationReasons,
    recentChurned,
    meetingsThisMonth,
    meetingsCompleted,
    meetingsNoShow,
    meetingsByAgent,
    churnTrend,
    avgTenureMonths,
    customersByTenure,
    atRiskCustomers: topAtRisk,
    atRiskSummary,
    kpiSpark,
    previousPeriod,
    newCustomers,
    earlyChurn,
  }
}

/* ------------------------------------------------------------------ */
/*  Cache                                                             */
/* ------------------------------------------------------------------ */

const CACHE_COLLECTION = 'customer_success_cache'
const CACHE_TTL_MS = 15 * 60 * 1000 // 15 minutes

const memCacheMap = new Map<string, { data: CustomerSuccessDto; ts: number }>()

async function getCachedSuccess(cacheKey = 'current'): Promise<{
  data: CustomerSuccessDto
  updatedAt: Date
} | null> {
  const db = await getDb()
  if (!db) return null
  return db
    .collection<{ _id: string; data: CustomerSuccessDto; updatedAt: Date }>(
      CACHE_COLLECTION,
    )
    .findOne({ _id: cacheKey as any })
}

async function setCachedSuccess(data: CustomerSuccessDto, cacheKey = 'current'): Promise<void> {
  const db = await getDb()
  if (!db) return
  await db
    .collection(CACHE_COLLECTION)
    .updateOne(
      { _id: cacheKey as any },
      { $set: { _id: cacheKey as any, data, updatedAt: new Date() } },
      { upsert: true },
    )
}

/* ------------------------------------------------------------------ */
/*  Route                                                             */
/* ------------------------------------------------------------------ */

export const adminCustomerSuccessRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAdmin)

  app.get('/', async (req, reply) => {
    const q = req.query as Record<string, string>
    const refresh = q.refresh === 'true'
    const month = q.month && /^\d{4}-\d{2}$/.test(q.month) ? q.month : undefined
    const cacheKey = month ?? 'current'

    if (!refresh) {
      // In-memory cache (only serve if within TTL and has fresh fields)
      const mem = memCacheMap.get(cacheKey)
      if (
        mem &&
        Date.now() - mem.ts < CACHE_TTL_MS &&
        mem.data.kpiSpark && mem.data.newCustomers
      ) {
        return reply.send({
          stats: mem.data,
          cached: true,
          cachedAt: new Date(mem.ts).toISOString(),
        })
      }
      // MongoDB cache (only serve if within TTL and has fresh fields)
      const cached = await getCachedSuccess(cacheKey)
      if (
        cached &&
        Date.now() - cached.updatedAt.getTime() < CACHE_TTL_MS &&
        cached.data.kpiSpark && cached.data.newCustomers
      ) {
        memCacheMap.set(cacheKey, { data: cached.data, ts: cached.updatedAt.getTime() })
        return reply.send({
          stats: cached.data,
          cached: true,
          cachedAt: cached.updatedAt.toISOString(),
        })
      }
    }

    const stats = await buildCustomerSuccessStats(month)
    memCacheMap.set(cacheKey, { data: stats, ts: Date.now() })
    await setCachedSuccess(stats, cacheKey).catch(() => {})
    return reply.send({
      stats,
      cached: false,
      cachedAt: new Date().toISOString(),
    })
  })
}
