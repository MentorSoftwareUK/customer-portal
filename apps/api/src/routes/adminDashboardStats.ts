import type { FastifyPluginAsync } from 'fastify'
import { requireAdmin } from '../auth/requireAdmin'
import { getDb } from '../db'
import { env } from '../env'
import {
  hubspotSearchLiveCustomerCompanyIds,
  hubspotGetCompanyById,
} from '../integrations/hubspot'

export type AdminDashboardStatsDto = {
  liveCompanyCount: number
  liveUserCount: number
  totalHomes: number
  totalChildrensHomes: number
  totalSupportedAccommodation: number
}

// Two-tier cache: in-memory + MongoDB
const CACHE_COLLECTION = 'dashboard_stats_cache'
const CACHE_TTL_MS = 15 * 60_000 // 15 minutes
let statsCache: { ts: number; data: AdminDashboardStatsDto } | null = null

async function getCachedStats(): Promise<{ data: AdminDashboardStatsDto; updatedAt: Date } | null> {
  try {
    const db = getDb()
    const row = await db.collection(CACHE_COLLECTION).findOne({ _id: 'current' as any })
    if (!row) return null
    const age = Date.now() - new Date(row.updatedAt).getTime()
    if (age > CACHE_TTL_MS) return null
    return { data: row.data as AdminDashboardStatsDto, updatedAt: new Date(row.updatedAt) }
  } catch { return null }
}

async function setCachedStats(data: AdminDashboardStatsDto): Promise<void> {
  try {
    const db = getDb()
    await db.collection(CACHE_COLLECTION).updateOne(
      { _id: 'current' as any },
      { $set: { data, updatedAt: new Date() } },
      { upsert: true },
    )
  } catch (e) { console.warn('[dashboard-stats] MongoDB cache write failed:', e) }
}

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

    // In-memory cache first
    if (statsCache && Date.now() - statsCache.ts < CACHE_TTL_MS) {
      return { stats: statsCache.data, cached: true }
    }
    // MongoDB cache fallback (survives cold starts)
    const mongoCached = await getCachedStats()
    if (mongoCached) {
      statsCache = { ts: mongoCached.updatedAt.getTime(), data: mongoCached.data }
      return { stats: mongoCached.data, cached: true }
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

      // 2. Fetch homes + contacts properties for each live company.
      //    number_of_homes is a string type (often empty); compute total from subcategories.
      //    Use num_associated_contacts for user count since portal_users.companyId is sparse.
      let totalHomes = 0
      let totalChildrensHomes = 0
      let totalSupportedAccommodation = 0
      let liveUserCount = 0

      const companyProperties = [
        'number_of_homes',
        'number_of_homes__ch_',
        'number_of_homes__sa_',
        'number_of_homes__18__',
        'number_of_homes__mbu_',
        'number_of_homes__solo_ch_',
        'num_associated_contacts',
      ]

      // Process in batches of 10 to avoid overwhelming HubSpot
      const BATCH_SIZE = 10
      for (let i = 0; i < liveCompanyIds.length; i += BATCH_SIZE) {
        const batch = liveCompanyIds.slice(i, i + BATCH_SIZE)
        const results = await Promise.all(
          batch.map(async (companyId, idx) => {
            if (idx > 0) await rateLimitPause()
            try {
              return await hubspotGetCompanyById({ id: companyId, properties: companyProperties })
            } catch (e) {
              console.warn(`[admin-dashboard-stats] Failed to fetch company ${companyId}:`, e)
              return null
            }
          }),
        )

        for (const company of results) {
          if (!company?.properties) continue
          const ch = Number(company.properties['number_of_homes__ch_']) || 0
          const sa = Number(company.properties['number_of_homes__sa_']) || 0
          const over18 = Number(company.properties['number_of_homes__18__']) || 0
          const mbu = Number(company.properties['number_of_homes__mbu_']) || 0
          const soloCh = Number(company.properties['number_of_homes__solo_ch_']) || 0
          const contacts = Number(company.properties['num_associated_contacts']) || 0

          // number_of_homes is a string type; parse it, fall back to subcategory sum
          const homesRaw = parseFloat(String(company.properties['number_of_homes'] ?? '')) || 0
          const subcategorySum = ch + sa + over18 + mbu + soloCh

          totalChildrensHomes += ch
          totalSupportedAccommodation += sa
          totalHomes += homesRaw > 0 ? homesRaw : subcategorySum
          liveUserCount += contacts
        }

        // Rate limit between batches
        if (i + BATCH_SIZE < liveCompanyIds.length) {
          await rateLimitPause(500)
        }
      }

      const stats: AdminDashboardStatsDto = {
        liveCompanyCount,
        liveUserCount,
        totalHomes,
        totalChildrensHomes,
        totalSupportedAccommodation,
      }

      statsCache = { ts: Date.now(), data: stats }
      setCachedStats(stats).catch(() => {})
      return { stats }
    } catch (e: any) {
      console.error('[admin-dashboard-stats] Failed to fetch dashboard stats:', e)
      return reply.status(502).send({ error: 'hubspot_error', message: e?.message ?? 'Unknown error' })
    }
  })
}
