import type { FastifyPluginAsync } from 'fastify'
import { requireAdmin } from '../auth/requireAdmin'
import { env } from '../env'
import {
  hubspotSearchLiveCustomerCompanyIds,
  hubspotGetCompanyById,
} from '../integrations/hubspot'
import { getDb } from '../db'

export type AdminDashboardStatsDto = {
  liveCompanyCount: number
  liveUserCount: number
  totalHomes: number
  totalChildrensHomes: number
  totalSupportedAccommodation: number
}

// Cache (HubSpot calls are expensive)
let statsCache: { ts: number; data: AdminDashboardStatsDto } | null = null
const CACHE_TTL_MS = 5 * 60_000 // 5 minutes

function rateLimitPause(ms = 350): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const adminDashboardStatsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const ok = await requireAdmin(req, reply)
    if (!ok) return reply
  })

  app.get('/', async (_req, reply) => {
    if (!env.HUBSPOT_PRIVATE_APP_TOKEN) {
      return reply.status(503).send({ error: 'hubspot_not_configured' })
    }

    // Return cached result if fresh
    if (statsCache && Date.now() - statsCache.ts < CACHE_TTL_MS) {
      return { stats: statsCache.data }
    }

    const liveProp = env.HUBSPOT_LIVE_CUSTOMER_PROPERTY
    const liveTrueRaw = env.HUBSPOT_LIVE_CUSTOMER_TRUE_VALUES
    const liveTrue = liveTrueRaw
      ? liveTrueRaw.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean)
      : []

    if (!liveProp || liveTrue.length === 0) {
      return reply.status(400).send({
        error: 'missing_config',
        message: 'HUBSPOT_LIVE_CUSTOMER_PROPERTY and HUBSPOT_LIVE_CUSTOMER_TRUE_VALUES must be configured.',
      })
    }

    try {
      // 1. Get all live customer company IDs from HubSpot
      const liveCompanyIds = await hubspotSearchLiveCustomerCompanyIds({
        propertyName: liveProp,
        trueValues: liveTrue,
      })

      const liveCompanyCount = liveCompanyIds.length

      // 2. Fetch number_of_homes properties for each live company
      let totalHomes = 0
      let totalChildrensHomes = 0
      let totalSupportedAccommodation = 0

      const homeProperties = ['number_of_homes', 'number_of_homes__ch_', 'number_of_homes__sa_']

      // Process in batches of 10 to avoid overwhelming HubSpot
      const BATCH_SIZE = 10
      for (let i = 0; i < liveCompanyIds.length; i += BATCH_SIZE) {
        const batch = liveCompanyIds.slice(i, i + BATCH_SIZE)
        const results = await Promise.all(
          batch.map(async (companyId, idx) => {
            if (idx > 0) await rateLimitPause()
            try {
              return await hubspotGetCompanyById({ id: companyId, properties: homeProperties })
            } catch (e) {
              console.warn(`[admin-dashboard-stats] Failed to fetch company ${companyId}:`, e)
              return null
            }
          }),
        )

        for (const company of results) {
          if (!company?.properties) continue
          const homes = Number(company.properties['number_of_homes']) || 0
          const ch = Number(company.properties['number_of_homes__ch_']) || 0
          const sa = Number(company.properties['number_of_homes__sa_']) || 0
          totalHomes += homes
          totalChildrensHomes += ch
          totalSupportedAccommodation += sa
        }

        // Rate limit between batches
        if (i + BATCH_SIZE < liveCompanyIds.length) {
          await rateLimitPause(500)
        }
      }

      // 3. Count portal users associated with live companies
      let liveUserCount = 0
      const db = await getDb()
      if (db && liveCompanyIds.length > 0) {
        liveUserCount = await db.collection('portal_users').countDocuments({
          companyId: { $in: liveCompanyIds },
          status: 'active',
        })
      }

      const stats: AdminDashboardStatsDto = {
        liveCompanyCount,
        liveUserCount,
        totalHomes,
        totalChildrensHomes,
        totalSupportedAccommodation,
      }

      statsCache = { ts: Date.now(), data: stats }
      return { stats }
    } catch (e: any) {
      console.error('[admin-dashboard-stats] Failed to fetch dashboard stats:', e)
      return reply.status(502).send({ error: 'hubspot_error', message: e?.message ?? 'Unknown error' })
    }
  })
}
