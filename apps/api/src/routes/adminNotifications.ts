import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../auth/requireAdmin'
import {
  NotificationCreateSchema,
  NotificationPatchSchema,
  createNotification,
  deleteNotification,
  listNotifications,
  updateNotification,
} from '../store/notifications'

const ParamsSchema = z.object({ id: z.string().trim().min(1).max(200) })

export const adminNotificationsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const ok = await requireAdmin(req, reply)
    if (!ok) return reply
  })

  app.get('/', async () => {
    const notifications = await listNotifications({ includeDisabled: true })
    return { notifications }
  })

  app.post('/', async (req, reply) => {
    const parsed = NotificationCreateSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: parsed.error.issues })
    }

    const notification = await createNotification(parsed.data)
    return reply.status(201).send({ notification })
  })

  app.patch('/:id', async (req, reply) => {
    const paramsParsed = ParamsSchema.safeParse(req.params)
    if (!paramsParsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: paramsParsed.error.issues })
    }

    const bodyParsed = NotificationPatchSchema.safeParse(req.body)
    if (!bodyParsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: bodyParsed.error.issues })
    }

    const notification = await updateNotification(paramsParsed.data.id, bodyParsed.data)
    if (!notification) return reply.status(404).send({ error: 'not_found' })
    return { notification }
  })

  app.delete('/:id', async (req, reply) => {
    const paramsParsed = ParamsSchema.safeParse(req.params)
    if (!paramsParsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: paramsParsed.error.issues })
    }

    const ok = await deleteNotification(paramsParsed.data.id)
    if (!ok) return reply.status(404).send({ error: 'not_found' })
    return { ok: true }
  })
}
