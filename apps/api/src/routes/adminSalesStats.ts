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

  /* MRR trend (last 6 months) */
  mrrTrend: Array<{ month: string; mrr: number }>

  /* Free customer stats */
  freeCustomers: {
    totalFreeDeals: number
    freeDealsThisMonth: number
    convertedThisMonth: number
    convertedRevenue: number
    conversionRate: number
    notConvertedCount: number
    notConvertedPipelineValue: number
  }

  /* Trend — last 6 months, oldest → newest */
  trend: SalesMonthSummary[]

  /* Previous month for delta badges */
  previous: SalesMonthSummary | null
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

/* ── Key sales agent IDs ── */
const OWNER_MAP: Record<string, string> = {
  '711739855': 'Naheed Dad',
  '1774092550': 'Raj Singh',
  '588615646': 'Hope Schindler',
  '193457719': 'Liam Kotecha',
  '231709811': 'Joe Hardstaff',
  '29942907': 'Josh Ireland',
  '78021788': 'Jonathan Hebbes',
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
        map.set(r.from.id, r.to[0]!.toObjectId)
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
    'registration_status',
  ]

  /* ── Query 1: All closed deals in last 6 months ── */
  const closedDeals = await searchDeals(
    [
      {
        filters: [
          { propertyName: 'pipeline', operator: 'EQ', value: MAIN_PIPELINE_ID },
          {
            propertyName: 'closedate',
            operator: 'GTE',
            value: sixMonthsAgo.toISOString(),
          },
          ...(isHistorical ? [{
            propertyName: 'closedate',
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
            propertyName: 'closedate',
            operator: 'GTE',
            value: sixMonthsAgo.toISOString(),
          },
          ...(isHistorical ? [{
            propertyName: 'closedate',
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

  /* ── Helpers ── */
  const amt = (d: HsDeal) => parseFloat(d.properties.amount ?? '0') || 0
  const isWon = (d: HsDeal) => d.properties.dealstage === 'closedwon'
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

  /* ── MRR: sum of hs_mrr for all open deals + current-month won deals ── */
  const mrr =
    openDeals.reduce(
      (s, d) => s + (parseFloat(d.properties.hs_mrr ?? '0') || 0),
      0,
    ) +
    wonThisMonth.reduce(
      (s, d) => s + (parseFloat(d.properties.hs_mrr ?? '0') || 0),
      0,
    )

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

  /* ── MRR trend (sum of hs_mrr from won deals each month) ── */
  const mrrTrendMap = new Map<string, number>()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(focusDate.getFullYear(), focusDate.getMonth() - i, 1)
    mrrTrendMap.set(monthKey(d), 0)
  }
  for (const d of closedDeals) {
    if (!isWon(d)) continue
    const mk = monthOfDeal(d)
    if (!mk || !mrrTrendMap.has(mk)) continue
    mrrTrendMap.set(mk, mrrTrendMap.get(mk)! + (parseFloat(d.properties.hs_mrr ?? '0') || 0))
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

  /* ── Free customer stats (company-level) ── */
  const allWonDeals = closedDeals.filter(isWon)
  const isFree = (d: HsDeal) => d.properties.registration_status === 'Pre-registered (Free)'
  const allFreeWon = allWonDeals.filter(isFree)
  const freeWonThisMonth = allFreeWon.filter((d) => monthOfDeal(d) === currentMonthKey)

  // Fetch deal→company associations so we can track free→paid per company
  const allDealIds = [...closedDeals, ...openDeals].map((d) => d.id)
  const dealToCompany = allDealIds.length > 0
    ? await batchDealCompanyMap(allDealIds)
    : new Map<string, string>()

  // Group all deals by company
  const companyDeals = new Map<string, HsDeal[]>()
  for (const deal of [...closedDeals, ...openDeals]) {
    const cid = dealToCompany.get(deal.id)
    if (!cid) continue
    if (!companyDeals.has(cid)) companyDeals.set(cid, [])
    companyDeals.get(cid)!.push(deal)
  }

  // "Free company" = has at least one closed-won deal with registration_status = 'Pre-registered (Free)'
  const freeCompanyIds = new Set<string>()
  for (const [cid, deals] of companyDeals) {
    if (deals.some((d) => isWon(d) && isFree(d))) freeCompanyIds.add(cid)
  }

  // Converted = free company with a non-free paying deal won this month
  const convertedCompanyIds = new Set<string>()
  let convertedRevenue = 0
  for (const cid of freeCompanyIds) {
    const deals = companyDeals.get(cid)!
    const payingThisMonth = deals.filter(
      (d) => isWon(d) && !isFree(d) && amt(d) > 0 && monthOfDeal(d) === currentMonthKey,
    )
    if (payingThisMonth.length > 0) {
      convertedCompanyIds.add(cid)
      convertedRevenue += payingThisMonth.reduce((s, d) => s + amt(d), 0)
    }
  }

  // Not-yet-converted = free companies with no paying won deal (ever, within 6-month window)
  let notConvertedPipelineValue = 0
  let notConvertedCount = 0
  for (const cid of freeCompanyIds) {
    if (convertedCompanyIds.has(cid)) continue
    const deals = companyDeals.get(cid)!
    const hasPayingWon = deals.some((d) => isWon(d) && !isFree(d) && amt(d) > 0)
    if (!hasPayingWon) {
      notConvertedCount++
      // Sum their open deal values
      const opens = deals.filter(
        (d) => d.properties.dealstage !== 'closedwon' && d.properties.dealstage !== 'closedlost',
      )
      notConvertedPipelineValue += opens.reduce((s, d) => s + amt(d), 0)
    }
  }

  const totalFreeAllTime = allFreeWon.length
  const freeConversionRate =
    freeCompanyIds.size > 0
      ? Math.round((convertedCompanyIds.size / freeCompanyIds.size) * 100)
      : 0

  const freeCustomers = {
    totalFreeDeals: totalFreeAllTime,
    freeDealsThisMonth: freeWonThisMonth.length,
    convertedThisMonth: convertedCompanyIds.size,
    convertedRevenue: Math.round(convertedRevenue * 100) / 100,
    conversionRate: freeConversionRate,
    notConvertedCount,
    notConvertedPipelineValue: Math.round(notConvertedPipelineValue * 100) / 100,
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
      if (cached && cached.data.freeCustomers?.notConvertedPipelineValue !== undefined) {
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
