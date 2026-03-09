import type { FastifyPluginAsync } from 'fastify'
import { requireAdmin } from '../auth/requireAdmin'
import { env } from '../env'

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type SalesFunnelDto = {
  month: string // e.g. "2026-02"
  /** Total leads created in the lead pipeline. */
  submissions: number
  /** Leads that are NOT disqualified. */
  leads: number
  /** Leads that reached SQL stage or beyond (Discovery Call Made+). */
  sql: number
  /** Leads that reached Demo Completed or beyond. */
  demos: number
  /** Breakdown by current lead stage. */
  byStage: Array<{
    stageId: string
    label: string
    count: number
    order: number
  }>
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
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HubSpot ${res.status}: ${text}`)
  }
  return res
}

type HSLead = {
  id: string
  createdAt: string
  properties: Record<string, string | null>
}

/**
 * Paginate through ALL leads via the list endpoint.
 * The /search endpoint doesn't support createdate filters on leads,
 * so we list everything and filter client-side.
 */
async function hsListAllLeads(properties: string[]): Promise<HSLead[]> {
  const results: HSLead[] = []
  let after: string | undefined
  const MAX_PAGES = 20 // up to 2 000 leads

  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ limit: '100' })
    for (const p of properties) qs.append('properties', p)
    if (after) qs.set('after', after)

    const res = await hsFetch(`/crm/v3/objects/leads?${qs.toString()}`)
    const data = (await res.json()) as {
      results: HSLead[]
      paging?: { next?: { after: string } }
    }

    results.push(...(data.results ?? []))
    if (!data.paging?.next?.after) break
    after = data.paging.next.after
  }

  return results
}

/* ------------------------------------------------------------------ */
/*  Lead pipeline stage definitions                                   */
/* ------------------------------------------------------------------ */

/**
 * Lead pipeline stages in order (from HubSpot "Lead pipeline").
 * Stages at or above SQL_THRESHOLD_ORDER count as SQL.
 * Stages at or above DEMO_THRESHOLD_ORDER count as Demo.
 */
const LEAD_STAGES: Array<{ id: string; label: string; order: number }> = [
  { id: 'new-stage-id',        label: 'New Enquiry',           order: 1 },
  { id: 'attempting-stage-id', label: 'Attempting to contact',  order: 2 },
  { id: 'connected-stage-id',  label: 'Connected',              order: 3 },
  { id: '1701461197',          label: 'Discovery Call Made',     order: 4 },
  { id: '1701461226',          label: 'Demo Scheduled',          order: 5 },
  { id: '1701461227',          label: 'Demo Completed',          order: 6 },
  { id: '1701461228',          label: 'Second Demo',             order: 7 },
  { id: 'qualified-stage-id',  label: 'Qualified',               order: 8 },
  { id: 'unqualified-stage-id', label: 'Disqualified',           order: 9 },
]

const STAGE_MAP = new Map(LEAD_STAGES.map((s) => [s.id, s]))

/** Discovery Call Made (order 4) or above counts as SQL. */
const SQL_THRESHOLD_ORDER = 4
/** Demo Completed (order 6) or above (excluding Disqualified). */
const DEMO_THRESHOLD_ORDER = 6

function stageOrder(stageId: string): number {
  return STAGE_MAP.get(stageId)?.order ?? 0
}

/* ------------------------------------------------------------------ */
/*  Cache                                                             */
/* ------------------------------------------------------------------ */

const cache = new Map<string, { ts: number; data: SalesFunnelDto }>()
const CACHE_TTL_MS = 5 * 60_000

/* ------------------------------------------------------------------ */
/*  Route                                                             */
/* ------------------------------------------------------------------ */

export const adminSalesFunnelRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const ok = await requireAdmin(req, reply)
    if (!ok) return reply
  })

  app.get<{ Querystring: { month?: string } }>('/', async (req, reply) => {
    if (!env.HUBSPOT_PRIVATE_APP_TOKEN) {
      return reply.status(503).send({ error: 'hubspot_not_configured' })
    }

    // Default to previous month
    const now = new Date()
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const monthParam =
      req.query.month ?? `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`

    if (!/^\d{4}-\d{2}$/.test(monthParam)) {
      return reply.status(400).send({ error: 'invalid_month', message: 'Use format YYYY-MM' })
    }

    const cached = cache.get(monthParam)
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return { funnel: cached.data }
    }

    const [year, mon] = monthParam.split('-').map(Number)
    const monthStart = `${year}-${String(mon).padStart(2, '0')}-01`
    const nextMonth = mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, '0')}-01`

    try {
      // Fetch all leads and filter to the requested month client-side
      const allLeads = await hsListAllLeads(['hs_pipeline_stage', 'hs_createdate'])

      const monthLeads = allLeads.filter((l) => {
        const d = l.properties.hs_createdate ?? l.createdAt ?? ''
        return d >= monthStart && d < nextMonth
      })

      const submissions = monthLeads.length

      // Leads = not disqualified
      const activeLeads = monthLeads.filter(
        (l) => l.properties.hs_pipeline_stage !== 'unqualified-stage-id',
      )
      const leads = activeLeads.length

      // SQL = stage order ≥ 4 (Discovery Call Made+), excluding disqualified
      const sql = activeLeads.filter(
        (l) => stageOrder(l.properties.hs_pipeline_stage ?? '') >= SQL_THRESHOLD_ORDER,
      ).length

      // Demo = stage order ≥ 6 (Demo Completed+), excluding disqualified
      const demos = activeLeads.filter(
        (l) => stageOrder(l.properties.hs_pipeline_stage ?? '') >= DEMO_THRESHOLD_ORDER,
      ).length

      // Per-stage breakdown (for the table)
      const stageCounts = new Map<string, number>()
      for (const l of monthLeads) {
        const sid = l.properties.hs_pipeline_stage ?? 'unknown'
        stageCounts.set(sid, (stageCounts.get(sid) ?? 0) + 1)
      }

      const byStage = LEAD_STAGES
        .map((s) => ({
          stageId: s.id,
          label: s.label,
          count: stageCounts.get(s.id) ?? 0,
          order: s.order,
        }))
        .filter((s) => s.count > 0)

      const funnel: SalesFunnelDto = { month: monthParam, submissions, leads, sql, demos, byStage }
      cache.set(monthParam, { ts: Date.now(), data: funnel })
      return { funnel }
    } catch (e: any) {
      console.error('[admin-sales-funnel]', e)
      return reply.status(502).send({ error: 'hubspot_error', message: e?.message ?? 'Unknown error' })
    }
  })
}
