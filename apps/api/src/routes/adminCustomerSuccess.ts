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
    total: number
    completed: number
    noShow: number
    companiesAssigned: number
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
    reasons: string[]
    daysSinceLastContact: number | null
    daysSinceLastMeeting: number | null
    daysSinceLastActivity: number | null
    tenureMonths: number | null
  }>
  atRiskSummary: {
    high: number
    medium: number
    low: number
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
  'date_left',
  'hubspot_owner_id',
  'what_prompted_you_to_consider_cancelling_mentor_software',
  'the_main_reason_you_re_leaving__other_',
  'notes_last_contacted',
  'hs_last_sales_activity_timestamp',
  'hs_latest_meeting_activity',
  'num_notes',
  'num_contacted_notes',
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

async function buildCustomerSuccessStats(): Promise<CustomerSuccessDto> {
  const now = new Date()
  const currentMK = monthKey(now)

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
  const totalPayingCustomers = paying.length

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
  const totalCustomerBase = totalPayingCustomers + totalChurned + totalOffboarding
  const retentionRate =
    totalCustomerBase > 0
      ? Math.round((totalPayingCustomers / totalCustomerBase) * 100)
      : 100

  /* ── 5. Churn timing ── */
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1)

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
  const recentChurned = churned
    .filter((c) => c.properties.date_left)
    .sort(
      (a, b) =>
        new Date(b.properties.date_left!).getTime() -
        new Date(a.properties.date_left!).getTime(),
    )
    .slice(0, 10)
    .map((c) => ({
      name: c.properties.name ?? 'Unknown',
      dateLeft: c.properties.date_left ?? '',
      reason:
        c.properties.what_prompted_you_to_consider_cancelling_mentor_software ||
        c.properties.the_main_reason_you_re_leaving__other_ ||
        '—',
    }))

  /* ── 8. Meetings (last 30 days) ── */
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000)
    .toISOString()
    .split('T')[0]!

  const meetings = await searchMeetings(
    [
      {
        filters: [
          {
            propertyName: 'hs_meeting_start_time',
            operator: 'GTE',
            value: thirtyDaysAgo,
          },
          {
            propertyName: 'hs_meeting_start_time',
            operator: 'LTE',
            value: now.toISOString(),
          },
        ],
      },
    ],
    MEETING_PROPERTIES,
  )

  const meetingsThisMonth = meetings.length
  const meetingsCompleted = meetings.filter(
    (m) => m.properties.hs_meeting_outcome === 'COMPLETED',
  ).length
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

  /* Count companies assigned to each success team member */
  const allCompanies = [...paying, ...churned, ...offboarding]
  const companyCounts = new Map<string, number>()
  for (const c of allCompanies) {
    const oid = c.properties.hubspot_owner_id ?? ''
    if (SUCCESS_TEAM[oid]) {
      companyCounts.set(oid, (companyCounts.get(oid) ?? 0) + 1)
    }
  }

  /* Ensure all success team members appear, even with 0 meetings */
  const meetingsByAgent = Object.entries(SUCCESS_TEAM)
    .map(([ownerId, name]) => {
      const bucket = agentMeetingMap.get(ownerId) ?? { total: 0, completed: 0, noShow: 0 }
      return {
        name,
        ownerId,
        ...bucket,
        companiesAssigned: companyCounts.get(ownerId) ?? 0,
      }
    })
    .sort((a, b) => b.total - a.total)

  /* ── 10. Churn trend (last 6 months) ── */
  const churnTrend: Array<{
    month: string
    churned: number
    newCustomers: number
  }> = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const mk = monthKey(d)
    const churnCount = churned.filter((c) => {
      const dl = c.properties.date_left
      if (!dl) return false
      return monthKey(new Date(dl)) === mk
    }).length
    const newCustCount = paying.filter((c) => {
      const cs = c.properties.contract_start_date
      if (!cs) return false
      return monthKey(new Date(cs)) === mk
    }).length
    churnTrend.push({ month: mk, churned: churnCount, newCustomers: newCustCount })
  }

  /* ── 11. Customer tenure ── */
  const tenureMonths: number[] = []
  for (const c of paying) {
    const start = c.properties.contract_start_date
    if (!start) continue
    const months =
      (now.getTime() - new Date(start).getTime()) / (30.44 * 86_400_000)
    if (months > 0) tenureMonths.push(months)
  }

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

  /* ── 12. At-risk customers ── */
  const OWNER_NAMES: Record<string, string> = {
    ...SUCCESS_TEAM,
    '711739855': 'Naheed Dad',
    '1774092550': 'Raj Singh',
    '193457719': 'Liam Kotecha',
    '231709811': 'Joe Hardstaff',
    '29942907': 'Josh Ireland',
    '78021788': 'Jonathan Hebbes',
    '29285963': 'Dean Bennett',
    '508706004': 'Ian Born',
  }

  function daysSince(isoOrNull: string | null | undefined): number | null {
    if (!isoOrNull) return null
    const d = new Date(isoOrNull)
    if (isNaN(d.getTime())) return null
    return Math.floor((now.getTime() - d.getTime()) / 86_400_000)
  }

  const atRiskCustomers: CustomerSuccessDto['atRiskCustomers'] = []

  for (const c of paying) {
    const daysSinceContact = daysSince(c.properties.notes_last_contacted)
    const daysSinceMeeting = daysSince(c.properties.hs_latest_meeting_activity)
    const daysSinceActivity = daysSince(c.properties.hs_last_sales_activity_timestamp)
    const tenure = c.properties.contract_start_date
      ? Math.floor((now.getTime() - new Date(c.properties.contract_start_date).getTime()) / (30.44 * 86_400_000))
      : null
    const salesActivities = parseInt(c.properties.num_notes ?? '0', 10) || 0

    const reasons: string[] = []
    let score = 0

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
      reasons,
      daysSinceLastContact: daysSinceContact,
      daysSinceLastMeeting: daysSinceMeeting,
      daysSinceLastActivity: daysSinceActivity,
      tenureMonths: tenure,
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

  return {
    totalPayingCustomers,
    totalChurned,
    totalOffboarding,
    retentionRate,
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
  }
}

/* ------------------------------------------------------------------ */
/*  Cache                                                             */
/* ------------------------------------------------------------------ */

const CACHE_COLLECTION = 'customer_success_cache'
const CACHE_TTL_MS = 15 * 60 * 1000 // 15 minutes

let memCache: { data: CustomerSuccessDto; ts: number } | null = null

async function getCachedSuccess(): Promise<{
  data: CustomerSuccessDto
  updatedAt: Date
} | null> {
  const db = await getDb()
  if (!db) return null
  return db
    .collection<{ _id: string; data: CustomerSuccessDto; updatedAt: Date }>(
      CACHE_COLLECTION,
    )
    .findOne({ _id: 'current' as any })
}

async function setCachedSuccess(data: CustomerSuccessDto): Promise<void> {
  const db = await getDb()
  if (!db) return
  await db
    .collection(CACHE_COLLECTION)
    .updateOne(
      { _id: 'current' as any },
      { $set: { _id: 'current' as any, data, updatedAt: new Date() } },
      { upsert: true },
    )
}

/* ------------------------------------------------------------------ */
/*  Route                                                             */
/* ------------------------------------------------------------------ */

export const adminCustomerSuccessRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAdmin)

  app.get('/', async (req, reply) => {
    const refresh = (req.query as Record<string, string>).refresh === 'true'

    if (!refresh) {
      // In-memory cache
      if (memCache && Date.now() - memCache.ts < CACHE_TTL_MS) {
        return reply.send({
          stats: memCache.data,
          cached: true,
          cachedAt: new Date(memCache.ts).toISOString(),
        })
      }
      // MongoDB cache
      const cached = await getCachedSuccess()
      if (cached) {
        memCache = { data: cached.data, ts: cached.updatedAt.getTime() }
        return reply.send({
          stats: cached.data,
          cached: true,
          cachedAt: cached.updatedAt.toISOString(),
        })
      }
    }

    const stats = await buildCustomerSuccessStats()
    memCache = { data: stats, ts: Date.now() }
    await setCachedSuccess(stats).catch(() => {})
    return reply.send({
      stats,
      cached: false,
      cachedAt: new Date().toISOString(),
    })
  })
}
