import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../auth/requireAdmin'
import { updateRegistrationById } from '../store/registrations'

const RegistrationIdParamsSchema = z.object({
  id: z.string().trim().min(1),
})

const RegistrationPatchSchema = z.object({
  attendanceStatus: z.enum(['attended', 'no_show']).nullable().optional(),
})

export const adminRegistrationsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const ok = await requireAdmin(req, reply)
    if (!ok) return reply
  })

  app.patch('/:id', async (req, reply) => {
    const paramsParsed = RegistrationIdParamsSchema.safeParse(req.params)
    if (!paramsParsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: paramsParsed.error.issues })
    }

    const bodyParsed = RegistrationPatchSchema.safeParse(req.body)
    if (!bodyParsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: bodyParsed.error.issues })
    }

    const updated = await updateRegistrationById(paramsParsed.data.id, bodyParsed.data)
    if (!updated) return reply.status(404).send({ error: 'not_found' })

    return { registration: updated }
  })
}
