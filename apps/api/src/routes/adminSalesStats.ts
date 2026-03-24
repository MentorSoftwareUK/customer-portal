import type { FastifyPluginAsync } from 'fastify'
import { requireAdmin } from '../auth/requireAdmin'
import { env } from '../env'
import { getDb } from '../db'

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type SalesStatsDto = {
  /* Deal counts — scoped to the selected month */
  dealsWonToday: number
  dealsWonThisWeek: number
  dealsWonThisMonth: number
  dealsLostThisMonth: number

  /* Revenue */
  revenueWonThisMonth: number
  mrr: number

  /* Rates (0-100) */
  winRate: number
  loseRate: number

  /* Timing */
  avgCloseTimeDays: number

  /* Open pipeline */
  openPipelineValue: number
  openDealCount: number

  /* Pipeline breakdown by stage (open deals only) */
  pipelineStages: Array<{
    stageId: string
    label: string
    count: number
    value: number
    order: number
  }>

  /* Last 10 closed deals for the mini table */
  recentDeals: Array<{
    name: string
    amount: number
    stage: string
    won: boolean
    closeDate: string
    createdDate: string
    agent: string
  }>

  /* Deals by agent */
  agentBreakdown: Array<{
    name: string
    ownerId: string
    won: number
    lost: number
    revenue: number
    openDeals: number
    openValue: number
  }>

  /* MRR trend (last 12 months, cumulative active customer MRR) */
  mrrTrend: Array<{ month: string; mrr: number }>

  /* Free customer conversion stats (all-time, company-level) */
  freeCustomers: {
    totalFreeCompanies: number
    converted: number
    convertedRevenue: number
    convertedThisMonth: number
    convertedRevenueThisMonth: number
    notConverted: number
    lostDuringTrial: number
    conversionRate: number
    companies: Array<{
      companyId: string
      name: string
      status: 'converted' | 'free' | 'lost'
      revenue: number
      freeDealName: string
      convertedDate: string | null
    }>
  }

  /* Trend — last 6 months, oldest → newest */
  trend: SalesMonthSummary[]

  /* Previous month for delta badges */
  previous: SalesMonthSummary | null

  /* Sales forecast */
  forecast: {
    /** Sum of open deal values × stage win probability */
    weightedPipelineValue: number
    /** Average monthly revenue from pipeline conversion (weighted pipeline ÷ avg close time) */
    projectedMonthlyRevenue: number
    /** projectedMonthlyRevenue × 3 */
    projectedQuarterlyRevenue: number
    /** Average deals won per month (last 6 months) */
    avgMonthlyDealsWon: number
    /** Breakdown by stage with win probability applied */
    pipelineByStage: Array<{
      stageId: string
      label: string
      count: number
      value: number
      probability: number
      weightedValue: number
    }>
    /** Next 3 months projected revenue & deals */
    monthlyProjection: Array<{
      month: string
      projectedRevenue: number
      projectedDeals: number
    }>
    /** Net projected MRR change per month (new deals + conversions − churn) */
    projectedMonthlyMrr: number
    /** Gross MRR from new deal wins per month */
    newDealMrrPerMonth: number
    /** Gross MRR from free→paid conversions per month */
    monthlyConversionMrr: number
    /** Current MRR + 3 months of projected new MRR */
    projectedQuarterlyMrr: number
    /** MRR chart: actual (last 3 months) + forecast (next 3 months) */
    mrrForecastChart: Array<{
      month: string
      mrr: number
      type: 'actual' | 'forecast'
      layers?: { newDeals: number; conversions: number; churn: number }
    }>
    /** Expected monthly churn MRR based on historical churn rate */
    expectedMonthlyChurnMrr: number
    /** Pre-reg / free customer conversion forecast */
    preRegForecast: {
      /** Companies still on free */
      unconvertedCount: number
      /** Historical conversion rate (0-100) */
      conversionRate: number
      /** Expected conversions (unconverted × rate) */
      expectedConversions: number
      /** Avg revenue per converted company */
      avgRevenuePerConversion: number
      /** Expected revenue from conversions */
      expectedRevenue: number
    }
  }
}

export type SalesMonthSummary = {
  month: string
  dealsWon: number
  revenue: number
  winRate: number
  avgCloseTimeDays: number
}

/* ------------------------------------------------------------------ */
/*  HubSpot helpers (reuse same pattern as sales funnel)              */
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

/* ------------------------------------------------------------------ */
/*  Pipeline / Stage map                                              */
/* ------------------------------------------------------------------ */

const MAIN_PIPELINE_ID = 'default'
const PREREG_PIPELINE_ID = '2933345490'

/* ── Key sales agent IDs ── */
const OWNER_MAP: Record<string, string> = {
  '711739855': 'Naheed Dad',
  '1774092550': 'Raj Singh',
  '588615646': 'Hope Schindler',
  '193457719': 'Liam Kotecha',
  '231709811': 'Joe Hardstaff',
  '29942907': 'Josh Ireland',
}

const STAGE_MAP: Record<string, { label: string; order: number }> = {
  appointmentscheduled: { label: 'Discovery Call Made', order: 0 },
  presentationscheduled: { label: 'Demonstration Scheduled', order: 1 },
  qualifiedtobuy: { label: '1st Demo Completed', order: 2 },
  '4751274190': { label: '2nd Demo Completed', order: 3 },
  '4751274191': { label: '3rd Demo Completed', order: 4 },
  decisionmakerboughtin: { label: 'Agreed To Purchase', order: 5 },
  contractsent: { label: 'Commercials Sent', order: 6 },
  closedwon: { label: 'Closed Won', order: 7 },
  closedlost: { label: 'Closed Lost', order: 8 },
}

/* ------------------------------------------------------------------ */
/*  Paginated deal search                                             */
/* ------------------------------------------------------------------ */

interface HsDeal {
  id: string
  properties: Record<string, string | null>
}

/** Batch-fetch deal → company associations from HubSpot v4 API */
async function batchDealCompanyMap(dealIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>() // dealId → companyId
  const BATCH = 100
  for (let i = 0; i < dealIds.length; i += BATCH) {
    const batch = dealIds.slice(i, i + BATCH)
    const res = await hsFetch('/crm/v4/associations/deals/companies/batch/read', {
      method: 'POST',
      body: JSON.stringify({ inputs: batch.map((id) => ({ id })) }),
    })
    const json = (await res.json()) as {
      results: Array<{ from: { id: string }; to: Array<{ toObjectId: string }> }>
    }
    for (const r of json.results) {
      if (r.to.length > 0) {
        map.set(r.from.id, String(r.to[0]!.toObjectId))
      }
    }
  }
  return map
}

async function searchDeals(
  filterGroups: unknown[],
  properties: string[],
): Promise<HsDeal[]> {
  const all: HsDeal[] = []
  let after: string | undefined
  for (;;) {
    const body: Record<string, unknown> = {
      filterGroups,
      properties,
      limit: 100,
      sorts: [{ propertyName: 'closedate', direction: 'DESCENDING' }],
    }
    if (after) body.after = after
    const res = await hsFetch('/crm/v3/objects/deals/search', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const json = (await res.json()) as {
      results: HsDeal[]
      paging?: { next?: { after: string } }
    }
    all.push(...json.results)
    after = json.paging?.next?.after
    if (!after) break
  }
  return all
}

interface HsCompany {
  id: string
  properties: Record<string, string | null>
}

async function searchCompanies(
  filterGroups: unknown[],
  properties: string[],
): Promise<HsCompany[]> {
  const all: HsCompany[] = []
  let after: string | undefined
  for (;;) {
    const body: Record<string, unknown> = { filterGroups, properties, limit: 100 }
    if (after) body.after = after
    const res = await hsFetch('/crm/v3/objects/companies/search', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const json = (await res.json()) as {
      results: HsCompany[]
      paging?: { next?: { after: string } }
    }
    all.push(...json.results)
    after = json.paging?.next?.after
    if (!after) break
  }
  return all
}

/* ------------------------------------------------------------------ */
/*  Build stats from raw HubSpot data                                 */
/* ------------------------------------------------------------------ */

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function startOfWeek(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1 // Monday-start
  d.setDate(d.getDate() - diff)
  return d
}

function startOfDay(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

async function buildSalesStats(selectedMonth?: string): Promise<SalesStatsDto> {
  const now = new Date()

  // If a specific month is selected, pivot all date calculations around it
  let focusDate: Date
  if (selectedMonth && /^\d{4}-\d{2}$/.test(selectedMonth)) {
    const [y, m] = selectedMonth.split('-').map(Number)
    focusDate = new Date(y!, m! - 1, 1)
  } else {
    focusDate = now
  }
  const currentMonthKey = monthKey(focusDate)
  const isHistorical = currentMonthKey !== monthKey(now)
  const sixMonthsAgo = new Date(focusDate.getFullYear(), focusDate.getMonth() - 5, 1)
  // End of selected month (for HubSpot query upper bound)
  const endOfMonth = new Date(focusDate.getFullYear(), focusDate.getMonth() + 1, 1)
  const todayStart = isHistorical ? endOfMonth : startOfDay()
  const weekStart = isHistorical ? endOfMonth : startOfWeek()

  const DEAL_PROPERTIES = [
    'dealname',
    'amount',
    'closedate',
    'createdate',
    'dealstage',
    'pipeline',
    'days_to_close',
    'hs_mrr',
    'hubspot_owner_id',
    'hs_v2_date_entered_closedwon',
    'hs_v2_date_entered_closedlost',
  ]

  /* ── Query 1: All closed deals in last 6 months (by actual stage-entry date) ── */
  const closedDeals = await searchDeals(
    [
      {
        filters: [
          { propertyName: 'pipeline', operator: 'EQ', value: MAIN_PIPELINE_ID },
          {
            propertyName: 'hs_v2_date_entered_closedwon',
            operator: 'GTE',
            value: sixMonthsAgo.toISOString(),
          },
          ...(isHistorical ? [{
            propertyName: 'hs_v2_date_entered_closedwon',
            operator: 'LT',
            value: endOfMonth.toISOString(),
          }] : []),
          { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
        ],
      },
      {
        filters: [
          { propertyName: 'pipeline', operator: 'EQ', value: MAIN_PIPELINE_ID },
          {
            propertyName: 'hs_v2_date_entered_closedlost',
            operator: 'GTE',
            value: sixMonthsAgo.toISOString(),
          },
          ...(isHistorical ? [{
            propertyName: 'hs_v2_date_entered_closedlost',
            operator: 'LT',
            value: endOfMonth.toISOString(),
          }] : []),
          { propertyName: 'dealstage', operator: 'EQ', value: 'closedlost' },
        ],
      },
    ],
    DEAL_PROPERTIES,
  )

  /* ── Query 2: All open deals ── */
  const openDeals = await searchDeals(
    [
      {
        filters: [
          { propertyName: 'pipeline', operator: 'EQ', value: MAIN_PIPELINE_ID },
          { propertyName: 'hs_is_closed', operator: 'EQ', value: 'false' },
        ],
      },
    ],
    DEAL_PROPERTIES,
  )

  /* ── Query 3: Pre-registered pipeline deals (for free customer stats) ── */
  const preRegClosedDeals = await searchDeals(
    [
      {
        filters: [
          { propertyName: 'pipeline', operator: 'EQ', value: PREREG_PIPELINE_ID },
          { propertyName: 'dealstage', operator: 'EQ', value: '4014021838' }, // Closed Won
        ],
      },
      {
        filters: [
          { propertyName: 'pipeline', operator: 'EQ', value: PREREG_PIPELINE_ID },
          { propertyName: 'dealstage', operator: 'EQ', value: '4014021839' }, // Closed Lost
        ],
      },
    ],
    DEAL_PROPERTIES,
  )
  const preRegOpenDeals = await searchDeals(
    [
      {
        filters: [
          { propertyName: 'pipeline', operator: 'EQ', value: PREREG_PIPELINE_ID },
          { propertyName: 'hs_is_closed', operator: 'EQ', value: 'false' },
        ],
      },
    ],
    DEAL_PROPERTIES,
  )

  /* ── Query 4: ALL closedwon deals (no date filter) for accurate free→paid analysis ── */
  const allTimeWonDeals = await searchDeals(
    [
      {
        filters: [
          { propertyName: 'pipeline', operator: 'EQ', value: MAIN_PIPELINE_ID },
          { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
        ],
      },
    ],
    DEAL_PROPERTIES,
  )

  /* ── Query 5: Live paying companies (for MRR calculation) ── */
  const liveCompanies = await searchCompanies(
    [{ filters: [{ propertyName: 'salesstatus', operator: 'EQ', value: 'paying_customer' }] }],
    ['name'],
  )
  const liveCompanyIds = new Set(liveCompanies.map((c) => c.id))

  /* Deal → company associations for all-time won deals */
  const dealCompanyMap = await batchDealCompanyMap(allTimeWonDeals.map((d) => d.id))
  /* Deals belonging to currently-live paying companies */
  const liveDeals = allTimeWonDeals.filter((d) => {
    const cid = dealCompanyMap.get(d.id)
    return cid != null && liveCompanyIds.has(cid)
  })

  /* ── Helpers ── */
  const amt = (d: HsDeal) => parseFloat(d.properties.amount ?? '0') || 0
  const isWon = (d: HsDeal) =>
    d.properties.dealstage === 'closedwon' || d.properties.dealstage === '4014021838'
  /** Actual date the deal entered closed-won / closed-lost stage (not the
   *  HubSpot "Close Date" field which is often the contract end date). */
  const actualCloseDate = (d: HsDeal): Date | null => {
    const raw = isWon(d)
      ? d.properties.hs_v2_date_entered_closedwon
      : d.properties.hs_v2_date_entered_closedlost
    return raw ? new Date(raw) : null
  }
  const daysToClose = (d: HsDeal) =>
    parseFloat(d.properties.days_to_close ?? '0') || 0
  const monthOfDeal = (d: HsDeal) => {
    const cd = actualCloseDate(d)
    return cd ? monthKey(cd) : null
  }

  /* Sort by actual close date (most recent first) */
  closedDeals.sort((a, b) => {
    const da = actualCloseDate(a)?.getTime() ?? 0
    const db = actualCloseDate(b)?.getTime() ?? 0
    return db - da
  })

  /* ── Current month stats ── */
  const thisMonthDeals = closedDeals.filter(
    (d) => monthOfDeal(d) === currentMonthKey,
  )
  const wonThisMonth = thisMonthDeals.filter(isWon)
  const lostThisMonth = thisMonthDeals.filter((d) => !isWon(d))

  const dealsWonToday = wonThisMonth.filter((d) => {
    const cd = actualCloseDate(d)
    return cd && cd >= todayStart
  }).length

  const dealsWonThisWeek = wonThisMonth.filter((d) => {
    const cd = actualCloseDate(d)
    return cd && cd >= weekStart
  }).length

  const revenueWonThisMonth = wonThisMonth.reduce((s, d) => s + amt(d), 0)
  const totalClosed = thisMonthDeals.length
  const winRate =
    totalClosed > 0
      ? Math.round((wonThisMonth.length / totalClosed) * 100)
      : 0
  const loseRate =
    totalClosed > 0
      ? Math.round((lostThisMonth.length / totalClosed) * 100)
      : 0
  const avgCloseTimeDays =
    wonThisMonth.length > 0
      ? Math.round(
          wonThisMonth.reduce((s, d) => s + daysToClose(d), 0) /
            wonThisMonth.length,
        )
      : 0

  /* ── MRR: sum of hs_mrr for all live paying customers (won date onwards) ── */
  let mrr = 0
  for (const d of liveDeals) {
    const dealMrr = parseFloat(d.properties.hs_mrr ?? '0') || 0
    if (dealMrr === 0) continue
    const startRaw = d.properties.hs_v2_date_entered_closedwon
    if (!startRaw) continue
    if (currentMonthKey >= monthKey(new Date(startRaw))) {
      mrr += dealMrr
    }
  }

  /* ── Open pipeline ── */
  const openPipelineValue = openDeals.reduce((s, d) => s + amt(d), 0)
  const openDealCount = openDeals.length

  /* ── Pipeline stages ── */
  const stageBuckets = new Map<
    string,
    { count: number; value: number }
  >()
  for (const d of openDeals) {
    const stg = d.properties.dealstage ?? 'unknown'
    const b = stageBuckets.get(stg) ?? { count: 0, value: 0 }
    b.count++
    b.value += amt(d)
    stageBuckets.set(stg, b)
  }

  const pipelineStages = [...stageBuckets.entries()]
    .map(([stageId, b]) => ({
      stageId,
      label: STAGE_MAP[stageId]?.label ?? stageId,
      count: b.count,
      value: Math.round(b.value * 100) / 100,
      order: STAGE_MAP[stageId]?.order ?? 99,
    }))
    .sort((a, b) => a.order - b.order)

  /* ── Recent deals (last 10 closed) ── */
  const ownerName = (d: HsDeal) =>
    OWNER_MAP[d.properties.hubspot_owner_id ?? ''] ?? 'Unassigned'

  const recentDeals = closedDeals.slice(0, 10).map((d) => ({
    name: d.properties.dealname ?? 'Untitled',
    amount: amt(d),
    stage: STAGE_MAP[d.properties.dealstage ?? '']?.label ?? d.properties.dealstage ?? '',
    won: isWon(d),
    closeDate: (isWon(d)
      ? d.properties.hs_v2_date_entered_closedwon
      : d.properties.hs_v2_date_entered_closedlost) ?? d.properties.createdate ?? '',
    createdDate: d.properties.createdate ?? '',
    agent: ownerName(d),
  }))

  /* ── Agent breakdown ── */
  const agentMap = new Map<
    string,
    { name: string; won: number; lost: number; revenue: number; openDeals: number; openValue: number }
  >()
  const ensureAgent = (ownerId: string) => {
    if (!agentMap.has(ownerId)) {
      agentMap.set(ownerId, {
        name: OWNER_MAP[ownerId] ?? 'Other',
        won: 0, lost: 0, revenue: 0, openDeals: 0, openValue: 0,
      })
    }
    return agentMap.get(ownerId)!
  }
  for (const d of thisMonthDeals) {
    const oid = d.properties.hubspot_owner_id ?? 'unassigned'
    const a = ensureAgent(oid)
    if (isWon(d)) { a.won++; a.revenue += amt(d) }
    else a.lost++
  }
  for (const d of openDeals) {
    const oid = d.properties.hubspot_owner_id ?? 'unassigned'
    const a = ensureAgent(oid)
    a.openDeals++
    a.openValue += amt(d)
  }
  const agentBreakdown = [...agentMap.entries()]
    .map(([ownerId, a]) => ({ ...a, ownerId }))
    .sort((a, b) => b.revenue - a.revenue)

  /* ── MRR trend (cumulative: live paying customers contributing hs_mrr each month) ── */
  const mrrTrendMap = new Map<string, number>()
  const trendMonths = 12
  for (let i = trendMonths - 1; i >= 0; i--) {
    const d = new Date(focusDate.getFullYear(), focusDate.getMonth() - i, 1)
    mrrTrendMap.set(monthKey(d), 0)
  }
  const mrrMonthKeys = [...mrrTrendMap.keys()]

  for (const d of liveDeals) {
    const dealMrr = parseFloat(d.properties.hs_mrr ?? '0') || 0
    if (dealMrr === 0) continue
    const startRaw = d.properties.hs_v2_date_entered_closedwon
    if (!startRaw) continue
    const startMk = monthKey(new Date(startRaw))

    for (const mk of mrrMonthKeys) {
      if (mk >= startMk) {
        mrrTrendMap.set(mk, mrrTrendMap.get(mk)! + dealMrr)
      }
    }
  }

  const mrrTrend = [...mrrTrendMap.entries()].map(([month, mrr]) => ({
    month,
    mrr: Math.round(mrr * 100) / 100,
  }))

  /* ── Trend (last 6 months, oldest → newest) ── */
  const trendMap = new Map<
    string,
    { won: number; lost: number; revenue: number; closeDays: number[] }
  >()
  // Seed all 6 months
  for (let i = 5; i >= 0; i--) {
    const d = new Date(focusDate.getFullYear(), focusDate.getMonth() - i, 1)
    const mk = monthKey(d)
    trendMap.set(mk, { won: 0, lost: 0, revenue: 0, closeDays: [] })
  }
  for (const d of closedDeals) {
    const mk = monthOfDeal(d)
    if (!mk || !trendMap.has(mk)) continue
    const bucket = trendMap.get(mk)!
    if (isWon(d)) {
      bucket.won++
      bucket.revenue += amt(d)
      bucket.closeDays.push(daysToClose(d))
    } else {
      bucket.lost++
    }
  }

  const trend: SalesMonthSummary[] = [...trendMap.entries()].map(
    ([month, b]) => ({
      month,
      dealsWon: b.won,
      revenue: Math.round(b.revenue * 100) / 100,
      winRate:
        b.won + b.lost > 0 ? Math.round((b.won / (b.won + b.lost)) * 100) : 0,
      avgCloseTimeDays:
        b.closeDays.length > 0
          ? Math.round(
              b.closeDays.reduce((s, v) => s + v, 0) / b.closeDays.length,
            )
          : 0,
    }),
  )

  /* ── Previous month ── */
  const prevMonthDate = new Date(focusDate.getFullYear(), focusDate.getMonth() - 1, 1)
  const prevMK = monthKey(prevMonthDate)
  const prevBucket = trendMap.get(prevMK)
  const previous: SalesMonthSummary | null = prevBucket
    ? {
        month: prevMK,
        dealsWon: prevBucket.won,
        revenue: Math.round(prevBucket.revenue * 100) / 100,
        winRate:
          prevBucket.won + prevBucket.lost > 0
            ? Math.round(
                (prevBucket.won / (prevBucket.won + prevBucket.lost)) * 100,
              )
            : 0,
        avgCloseTimeDays:
          prevBucket.closeDays.length > 0
            ? Math.round(
                prevBucket.closeDays.reduce((s, v) => s + v, 0) /
                  prevBucket.closeDays.length,
              )
            : 0,
      }
    : null

  /* ── Free customer stats (company-level, all-time) ── */
  // Find all companies with lifecyclestage = "Pre-Registration Customer" (2520059085)
  const PREREG_LIFECYCLE_STAGE = '2520059085'
  const preRegCompanies = await searchCompanies(
    [{ filters: [{ propertyName: 'lifecyclestage', operator: 'EQ', value: PREREG_LIFECYCLE_STAGE }] }],
    ['name', 'salesstatus'],
  )

  // Also find companies that WERE pre-reg but have since moved to paying_customer or Past Customer
  // (their lifecyclestage may have changed). Check salesstatus = paying_customer with a pre-reg deal.
  const allPreRegDeals = [...preRegClosedDeals, ...preRegOpenDeals]
  const preRegDealIds = [...new Set(allPreRegDeals.map((d) => d.id))]
  const preRegDealToCompany = preRegDealIds.length > 0
    ? await batchDealCompanyMap(preRegDealIds)
    : new Map<string, string>()

  // Combine: companies currently at pre-reg lifecycle stage + companies that had pre-reg pipeline deals
  const preRegCompanyIds = new Set<string>()
  const companyInfo = new Map<string, { name: string; salesstatus: string | null }>()

  for (const c of preRegCompanies) {
    preRegCompanyIds.add(c.id)
    companyInfo.set(c.id, {
      name: c.properties.name ?? `Company ${c.id}`,
      salesstatus: c.properties.salesstatus ?? null,
    })
  }
  for (const deal of allPreRegDeals) {
    const cid = preRegDealToCompany.get(deal.id)
    if (cid) preRegCompanyIds.add(cid)
  }

  // Batch-fetch details for any company found via deals but not already loaded
  const missingIds = [...preRegCompanyIds].filter((id) => !companyInfo.has(id))
  for (let i = 0; i < missingIds.length; i += 100) {
    const batch = missingIds.slice(i, i + 100)
    const res = await hsFetch('/crm/v3/objects/companies/batch/read', {
      method: 'POST',
      body: JSON.stringify({
        inputs: batch.map((id) => ({ id })),
        properties: ['name', 'salesstatus'],
      }),
    })
    const json = (await res.json()) as { results: Array<{ id: string; properties: Record<string, string | null> }> }
    for (const c of json.results) {
      companyInfo.set(c.id, {
        name: c.properties.name ?? `Company ${c.id}`,
        salesstatus: c.properties.salesstatus ?? null,
      })
    }
  }

  // Map pre-reg companies to their main-pipeline paying deals for revenue info
  const mainPipelineDeals = [...allTimeWonDeals]
  const mainDealIds = [...new Set(mainPipelineDeals.map((d) => d.id))]
  const mainDealToCompany = mainDealIds.length > 0
    ? await batchDealCompanyMap(mainDealIds)
    : new Map<string, string>()
  const preRegMainDeals = new Map<string, HsDeal[]>()
  for (const deal of mainPipelineDeals) {
    const cid = mainDealToCompany.get(deal.id)
    if (!cid || !preRegCompanyIds.has(cid)) continue
    if (!preRegMainDeals.has(cid)) preRegMainDeals.set(cid, [])
    preRegMainDeals.get(cid)!.push(deal)
  }

  // Classify each pre-reg company by their current salesstatus
  const convertedIds = new Set<string>()
  const stillFreeIds = new Set<string>()
  const lostDuringTrialIds = new Set<string>()
  let convertedRevenue = 0
  let convertedThisMonthCount = 0
  let convertedRevenueThisMonth = 0

  for (const cid of preRegCompanyIds) {
    const info = companyInfo.get(cid)
    const status = info?.salesstatus

    if (status === 'paying_customer') {
      convertedIds.add(cid)
      const payingDeals = (preRegMainDeals.get(cid) ?? []).filter(
        (d) => d.properties.dealstage === 'closedwon' && amt(d) > 0,
      )
      convertedRevenue += payingDeals.reduce((s, d) => s + amt(d), 0)
      const payingThisMonth = payingDeals.filter((d) => monthOfDeal(d) === currentMonthKey)
      if (payingThisMonth.length > 0) {
        convertedThisMonthCount++
        convertedRevenueThisMonth += payingThisMonth.reduce((s, d) => s + amt(d), 0)
      }
    } else if (status === 'Past Customer') {
      lostDuringTrialIds.add(cid)
    } else {
      stillFreeIds.add(cid)
    }
  }

  const totalPreReg = preRegCompanyIds.size
  const lostDuringTrialCount = lostDuringTrialIds.size
  const notConvertedCount = stillFreeIds.size
  const conversionRate = totalPreReg > 0
    ? Math.round((convertedIds.size / totalPreReg) * 100)
    : 0

  // Build detail list sorted: converted first, then free, then lost
  const companies: Array<{ companyId: string; name: string; status: 'converted' | 'free' | 'lost'; revenue: number; freeDealName: string; convertedDate: string | null }> = []
  for (const cid of preRegCompanyIds) {
    const info = companyInfo.get(cid)

    let status: 'converted' | 'free' | 'lost' = 'free'
    if (convertedIds.has(cid)) status = 'converted'
    else if (lostDuringTrialIds.has(cid)) status = 'lost'

    const payingDeals = (preRegMainDeals.get(cid) ?? []).filter(
      (d) => d.properties.dealstage === 'closedwon' && amt(d) > 0,
    )
    const rev = payingDeals.reduce((s, d) => s + amt(d), 0)

    let convertedDate: string | null = null
    if (payingDeals.length > 0) {
      const dates = payingDeals
        .map((d) => d.properties.hs_v2_date_entered_closedwon ?? d.properties.closedate)
        .filter(Boolean)
        .map((s) => new Date(s!))
        .sort((a, b) => a.getTime() - b.getTime())
      if (dates.length > 0) convertedDate = dates[0]!.toISOString()
    }

    companies.push({
      companyId: cid,
      name: info?.name ?? `Company ${cid}`,
      status,
      revenue: Math.round(rev * 100) / 100,
      freeDealName: '',
      convertedDate,
    })
  }
  const statusOrder: Record<string, number> = { converted: 0, free: 1, lost: 2 }
  companies.sort((a, b) => {
    if (a.status !== b.status) return (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)
    if (a.status === 'converted') {
      const da = a.convertedDate ? new Date(a.convertedDate).getTime() : 0
      const db = b.convertedDate ? new Date(b.convertedDate).getTime() : 0
      return db - da
    }
    return a.name.localeCompare(b.name)
  })

  const freeCustomers = {
    totalFreeCompanies: totalPreReg,
    converted: convertedIds.size,
    convertedRevenue: Math.round(convertedRevenue * 100) / 100,
    convertedThisMonth: convertedThisMonthCount,
    convertedRevenueThisMonth: Math.round(convertedRevenueThisMonth * 100) / 100,
    notConverted: notConvertedCount,
    lostDuringTrial: lostDuringTrialCount,
    conversionRate,
    companies,
  }

  /* ── Forecast ── */

  // Stage-based win probabilities (empirical)
  const STAGE_PROBABILITY: Record<string, number> = {
    appointmentscheduled: 0.10,
    presentationscheduled: 0.15,
    qualifiedtobuy: 0.30,
    '4751274190': 0.50,
    '4751274191': 0.70,
    decisionmakerboughtin: 0.60,
    contractsent: 0.85,
  }

  const forecastByStage = [...stageBuckets.entries()].map(([stageId, b]) => {
    const prob = STAGE_PROBABILITY[stageId] ?? 0
    return {
      stageId,
      label: STAGE_MAP[stageId]?.label ?? stageId,
      count: b.count,
      value: Math.round(b.value * 100) / 100,
      probability: prob,
      weightedValue: Math.round(b.value * prob * 100) / 100,
    }
  }).sort((a, b) => (STAGE_MAP[a.stageId]?.order ?? 99) - (STAGE_MAP[b.stageId]?.order ?? 99))

  const weightedPipelineValue = forecastByStage.reduce((s, st) => s + st.weightedValue, 0)

  // Projected revenue: weighted pipeline ÷ avg months to close = expected monthly conversion
  const recentTrend = trend.filter((t) => t.dealsWon > 0).slice(-6)
  const avgMonthlyDealsWon = recentTrend.length > 0
    ? Math.round(recentTrend.reduce((s, t) => s + t.dealsWon, 0) / recentTrend.length * 10) / 10
    : 0
  const avgCloseMonths = Math.max(avgCloseTimeDays / 30, 0.5) // floor at 0.5 months
  const projectedMonthlyRevenue = Math.round(weightedPipelineValue / avgCloseMonths)
  const projectedQuarterlyRevenue = projectedMonthlyRevenue * 3

  // Project next 3 months
  const monthlyProjection: Array<{ month: string; projectedRevenue: number; projectedDeals: number }> = []
  for (let i = 1; i <= 3; i++) {
    const d = new Date(focusDate.getFullYear(), focusDate.getMonth() + i, 1)
    monthlyProjection.push({
      month: monthKey(d),
      projectedRevenue: projectedMonthlyRevenue,
      projectedDeals: Math.round(avgMonthlyDealsWon),
    })
  }

  // Pre-reg / free customer conversion forecast (computed first so MRR projection can include it)
  const unconvertedCount = notConvertedCount
  const preRegConversionRate = conversionRate // already 0-100
  const expectedConversions = Math.round(unconvertedCount * (preRegConversionRate / 100) * 10) / 10
  const avgRevenuePerConversion = convertedIds.size > 0
    ? Math.round(convertedRevenue / convertedIds.size)
    : 0
  const expectedPreRegRevenue = Math.round(expectedConversions * avgRevenuePerConversion)

  // Avg MRR per converted free company (from their paying deals)
  let convertedMrrTotal = 0
  for (const cid of convertedIds) {
    const payingWon = (preRegMainDeals.get(cid) ?? []).filter(
      (d) => d.properties.dealstage === 'closedwon'
        && d.properties.pipeline === MAIN_PIPELINE_ID
        && amt(d) > 0,
    )
    for (const d of payingWon) {
      convertedMrrTotal += parseFloat(d.properties.hs_mrr ?? '0') || 0
    }
  }
  const avgMrrPerConversion = convertedIds.size > 0
    ? convertedMrrTotal / convertedIds.size
    : 0
  // Spread expected conversions evenly over 3 months
  const monthlyConversionMrr = Math.round(((expectedConversions / 3) * avgMrrPerConversion) * 100) / 100

  // Churn deduction: estimate monthly MRR loss from historical churn
  const churnCutoff = new Date(focusDate.getFullYear(), focusDate.getMonth() - 6, 1)
  let expectedMonthlyChurnMrr = 0
  try {
    const churnedCompanies = await searchCompanies(
      [{ filters: [{ propertyName: 'salesstatus', operator: 'EQ', value: 'Past Customer' }] }],
      ['name', 'date_left'],
    )
    const recentlyChurned = churnedCompanies.filter((c) => {
      const dl = c.properties.date_left
      return dl && new Date(dl) >= churnCutoff
    })
    const avgMrrPerCustomer = liveCompanies.length > 0 ? mrr / liveCompanies.length : 0
    const avgMonthlyChurnCount = recentlyChurned.length / 6
    expectedMonthlyChurnMrr = Math.round(avgMonthlyChurnCount * avgMrrPerCustomer * 100) / 100
  } catch {
    // If churn query fails, proceed without churn deduction
  }

  // MRR projection: new deal MRR + free→paid MRR − churn MRR
  const recentWonDeals = closedDeals.filter(
    (d) => isWon(d) && recentTrend.some((t) => t.month === monthOfDeal(d)),
  )
  const avgMrrPerDeal = recentWonDeals.length > 0
    ? recentWonDeals.reduce((s, d) => s + (parseFloat(d.properties.hs_mrr ?? '0') || 0), 0) / recentWonDeals.length
    : 0
  const newDealMrrPerMonth = Math.round(avgMrrPerDeal * avgMonthlyDealsWon * 100) / 100
  const projectedMonthlyMrr = Math.round((newDealMrrPerMonth + monthlyConversionMrr - expectedMonthlyChurnMrr) * 100) / 100
  const projectedQuarterlyMrr = Math.round((mrr + projectedMonthlyMrr * 3) * 100) / 100

  // MRR forecast chart: last 3 actual months + 3 projected months (with decomposed layers)
  const mrrForecastChart: SalesStatsDto['forecast']['mrrForecastChart'] = []
  const last3Actual = mrrTrend.slice(-3)
  for (const m of last3Actual) {
    mrrForecastChart.push({ month: m.month, mrr: m.mrr, type: 'actual' })
  }
  const lastActualMrr = last3Actual.length > 0 ? last3Actual[last3Actual.length - 1]!.mrr : mrr
  for (let i = 1; i <= 3; i++) {
    const d = new Date(focusDate.getFullYear(), focusDate.getMonth() + i, 1)
    mrrForecastChart.push({
      month: monthKey(d),
      mrr: Math.round((lastActualMrr + projectedMonthlyMrr * i) * 100) / 100,
      type: 'forecast',
      layers: {
        newDeals: Math.round(newDealMrrPerMonth * i * 100) / 100,
        conversions: Math.round(monthlyConversionMrr * i * 100) / 100,
        churn: Math.round(-expectedMonthlyChurnMrr * i * 100) / 100,
      },
    })
  }

  const forecast = {
    weightedPipelineValue: Math.round(weightedPipelineValue * 100) / 100,
    projectedMonthlyRevenue,
    projectedQuarterlyRevenue,
    avgMonthlyDealsWon,
    pipelineByStage: forecastByStage,
    monthlyProjection,
    projectedMonthlyMrr,
    newDealMrrPerMonth,
    monthlyConversionMrr,
    projectedQuarterlyMrr,
    mrrForecastChart,
    expectedMonthlyChurnMrr,
    preRegForecast: {
      unconvertedCount,
      conversionRate: preRegConversionRate,
      expectedConversions,
      avgRevenuePerConversion,
      expectedRevenue: expectedPreRegRevenue,
    },
  }

  return {
    dealsWonToday,
    dealsWonThisWeek,
    dealsWonThisMonth: wonThisMonth.length,
    dealsLostThisMonth: lostThisMonth.length,
    revenueWonThisMonth: Math.round(revenueWonThisMonth * 100) / 100,
    mrr: Math.round(mrr * 100) / 100,
    winRate,
    loseRate,
    avgCloseTimeDays,
    openPipelineValue: Math.round(openPipelineValue * 100) / 100,
    openDealCount,
    pipelineStages,
    recentDeals,
    agentBreakdown,
    mrrTrend,
    freeCustomers,
    trend,
    previous,
    forecast,
  }
}

/* ------------------------------------------------------------------ */
/*  MongoDB + in-memory cache                                        */
/* ------------------------------------------------------------------ */

const CACHE_COLLECTION = 'sales_stats_cache'
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

const memCacheMap = new Map<string, { data: SalesStatsDto; ts: number }>()

async function getCachedStats(cacheKey = 'current'): Promise<{
  data: SalesStatsDto
  updatedAt: Date
} | null> {
  const db = await getDb()
  if (!db) return null
  return db
    .collection<{ _id: string; data: SalesStatsDto; updatedAt: Date }>(
      CACHE_COLLECTION,
    )
    .findOne({ _id: cacheKey as any })
}

async function setCachedStats(data: SalesStatsDto, cacheKey = 'current'): Promise<void> {
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

export const adminSalesStatsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAdmin)

  app.get('/', async (req, reply) => {
    const q = req.query as Record<string, string>
    const refresh = q.refresh === 'true'
    const month = q.month && /^\d{4}-\d{2}$/.test(q.month) ? q.month : undefined
    const cacheKey = month ?? 'current'

    if (!refresh) {
      // In-memory cache first (fastest)
      const mem = memCacheMap.get(cacheKey)
      if (mem && Date.now() - mem.ts < CACHE_TTL_MS) {
        return reply.send({ stats: mem.data, cached: true, cachedAt: new Date(mem.ts).toISOString() })
      }
      // MongoDB cache fallback
      const cached = await getCachedStats(cacheKey)
      if (cached && Array.isArray(cached.data.freeCustomers?.companies)) {
        memCacheMap.set(cacheKey, { data: cached.data, ts: cached.updatedAt.getTime() })
        return reply.send({
          stats: cached.data,
          cached: true,
          cachedAt: cached.updatedAt.toISOString(),
        })
      }
    }

    const stats = await buildSalesStats(month)
    memCacheMap.set(cacheKey, { data: stats, ts: Date.now() })
    await setCachedStats(stats, cacheKey).catch(() => {})
    return reply.send({
      stats,
      cached: false,
      cachedAt: new Date().toISOString(),
    })
  })
}
