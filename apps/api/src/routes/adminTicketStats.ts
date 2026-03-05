import type { FastifyPluginAsync } from 'fastify'
import { requireAdmin } from '../auth/requireAdmin'
import { env } from '../env'
import {
  hubspotSearchAllTickets,
  hubspotSearchLiveCustomerCompanyIds,
  hubspotListTicketIdsForCompany,
  hubspotListTicketPipelines,
} from '../integrations/hubspot'

export type AdminTicketStatsDto = {
  liveCustomerTicketCount: number
  activeTicketCount: number
  avgResponseTimeMs: number | null
  ticketTypeVolume: Array<{ type: string; count: number }>
}

type TicketStatus = 'Open' | 'Pending' | 'Closed'

// Cache for the stats (expensive cross-object query)
let statsCache: { ts: number; data: AdminTicketStatsDto } | null = null
const STATS_CACHE_TTL_MS = 5 * 60_000 // 5 minutes

export const adminTicketStatsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const ok = await requireAdmin(req, reply)
    if (!ok) return reply
  })

  app.get('/', async (_req, reply) => {
    if (!env.HUBSPOT_PRIVATE_APP_TOKEN) {
      return reply.status(503).send({ error: 'hubspot_not_configured' })
    }

    // Return cached result if fresh
    if (statsCache && Date.now() - statsCache.ts < STATS_CACHE_TTL_MS) {
      return { stats: statsCache.data }
    }

    try {
      // 1. Build stage → status map from pipelines
      const pipelines = await hubspotListTicketPipelines()
      const stageMap = new Map<string, TicketStatus>()
      for (const p of pipelines ?? []) {
        for (const s of p.stages ?? []) {
          const label = (s.label ?? '').trim().toLowerCase()
          if (!label) continue
          if (label.includes('closed') || label.includes('resolved') || label.includes('complete')) {
            stageMap.set(s.id, 'Closed')
            continue
          }
          if (label.includes('pending') || label.includes('waiting') || label.includes('on hold')) {
            stageMap.set(s.id, 'Pending')
            continue
          }
          stageMap.set(s.id, 'Open')
        }
      }
      stageMap.set('4', stageMap.get('4') ?? 'Closed')

      // 2. Fetch all tickets with relevant properties
      const allTickets = await hubspotSearchAllTickets({
        properties: [
          'subject',
          'hs_pipeline_stage',
          'hs_ticket_priority',
          'hs_ticket_category',
          'hs_lastmodifieddate',
          'createdate',
          'hs_time_to_first_agent_reply',
          'hs_time_to_close',
        ],
      })

      // 3. Compute active tickets (Open or Pending)
      let activeTicketCount = 0
      const responseTimes: number[] = []
      const categoryMap = new Map<string, number>()

      for (const t of allTickets) {
        const p = t.properties ?? {}
        const stage = p['hs_pipeline_stage']
        const status = (stage && stageMap.get(stage)) || 'Open'

        if (status === 'Open' || status === 'Pending') {
          activeTicketCount++
        }

        // Response time
        const ttr = p['hs_time_to_first_agent_reply'] ? Number(p['hs_time_to_first_agent_reply']) : NaN
        if (Number.isFinite(ttr) && ttr > 0) {
          responseTimes.push(ttr)
        }

        // Category / type
        const category = (p['hs_ticket_category'] ?? '').trim() || 'Uncategorised'
        categoryMap.set(category, (categoryMap.get(category) ?? 0) + 1)
      }

      const avgResponseTimeMs = responseTimes.length
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : null

      const ticketTypeVolume = Array.from(categoryMap.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count)

      // 4. Live customer ticket count
      let liveCustomerTicketCount = 0
      const liveProp = env.HUBSPOT_LIVE_CUSTOMER_PROPERTY
      const liveTrueRaw = env.HUBSPOT_LIVE_CUSTOMER_TRUE_VALUES
      const liveTrue = liveTrueRaw
        ? liveTrueRaw
            .split(',')
            .map((v) => v.trim().toLowerCase())
            .filter(Boolean)
        : []

      if (liveProp && liveTrue.length > 0) {
        try {
          const liveCompanyIds = await hubspotSearchLiveCustomerCompanyIds({
            propertyName: liveProp,
            trueValues: liveTrue,
          })

          if (liveCompanyIds.length > 0) {
            // Get ticket IDs for all live companies
            const liveTicketIdSet = new Set<string>()
            for (const companyId of liveCompanyIds) {
              const ticketIds = await hubspotListTicketIdsForCompany(companyId)
              for (const tid of ticketIds) liveTicketIdSet.add(tid)
            }
            // Count how many of our total tickets are live customer tickets
            const allTicketIdSet = new Set(allTickets.map((t) => t.id))
            for (const tid of liveTicketIdSet) {
              if (allTicketIdSet.has(tid)) liveCustomerTicketCount++
            }
          }
        } catch (e) {
          console.warn('[admin-ticket-stats] Failed to compute live customer ticket count:', e)
          // Continue without live customer data
        }
      }

      const stats: AdminTicketStatsDto = {
        liveCustomerTicketCount,
        activeTicketCount,
        avgResponseTimeMs,
        ticketTypeVolume,
      }

      statsCache = { ts: Date.now(), data: stats }
      return { stats }
    } catch (e: any) {
      console.error('[admin-ticket-stats] Failed to fetch ticket stats:', e)
      return reply.status(502).send({ error: 'hubspot_error', message: e?.message ?? 'Unknown error' })
    }
  })
}
