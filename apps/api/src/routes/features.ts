import type { FastifyPluginAsync } from 'fastify'
import { requireAuth } from '../auth/requireAuth'
import { getFeatureFlags } from '../store/settings'

export const featuresRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const ok = await requireAuth(req, reply)
    if (!ok) return reply
  })

  app.get('/', async () => {
    const features = await getFeatureFlags()
    return { features }
  })
}
