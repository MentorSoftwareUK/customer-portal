import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../auth/requireAdmin'
import { getUserUsageMetrics, getKbViewMetrics } from '../store/activity'
import { getTicketMetricsStore } from '../store/tickets'

const QuerySchema = z.object({
  days: z.coerce.number().int().positive().max(365).optional(),
})

export const adminAnalyticsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const ok = await requireAdmin(req, reply)
    if (!ok) return reply
  })

  app.get('/users', async (req, reply) => {
    const parsed = QuerySchema.safeParse(req.query)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: parsed.error.issues })
    }
    const since = parsed.data.days ? new Date(Date.now() - parsed.data.days * 24 * 60 * 60 * 1000) : undefined
    const metrics = await getUserUsageMetrics({ since })
    return { metrics }
  })

  app.get('/kb', async (req, reply) => {
    const parsed = QuerySchema.safeParse(req.query)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: parsed.error.issues })
    }
    const since = parsed.data.days ? new Date(Date.now() - parsed.data.days * 24 * 60 * 60 * 1000) : undefined
    const metrics = await getKbViewMetrics({ since })
    return { metrics }
  })

  app.get('/tickets', async () => {
    const metrics = getTicketMetricsStore()
    return { metrics }
  })
}
