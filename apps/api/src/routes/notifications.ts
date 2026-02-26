import type { FastifyPluginAsync } from 'fastify'
import { requireAuth } from '../auth/requireAuth'
import { listActiveNotifications } from '../store/notifications'

export const notificationsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const ok = await requireAuth(req, reply)
    if (!ok) return reply
  })

  app.get('/', async () => {
    const notifications = await listActiveNotifications()
    return { notifications }
  })
}
