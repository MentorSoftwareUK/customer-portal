import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../auth/requireAdmin'
import { addAdminAuditEntry } from '../store/audit'
import { createUser, detachUser, listUsers, updateUser } from '../store/users'

const ListQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
})

const CreateUserSchema = z.object({
  email: z.string().trim().email(),
  firstName: z.string().trim().max(120).optional(),
  lastName: z.string().trim().max(120).optional(),
  companyId: z.string().trim().max(120).optional(),
  companyName: z.string().trim().max(200).optional(),
  hubspotContactId: z.string().trim().max(200).optional(),
})

const UpdateUserSchema = CreateUserSchema.partial().extend({
  status: z.enum(['active', 'inactive']).optional(),
  accessStatus: z.enum(['active', 'temp_blocked', 'perm_blocked']).optional(),
  blockedUntil: z.string().trim().datetime().nullable().optional(),
  blockedReason: z.string().trim().max(500).optional(),
})

const DetachSchema = z.object({ reason: z.string().trim().max(500).optional() })
const OffboardSchema = z.object({ reason: z.string().trim().max(500).optional() })

export const usersRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const ok = await requireAdmin(req, reply)
    if (!ok) return reply
  })

  app.get('/', async (req, reply) => {
    const parsed = ListQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: parsed.error.issues })
    }

    const { items, total } = await listUsers(parsed.data)
    return { users: items, total }
  })

  app.post('/', async (req, reply) => {
    const parsed = CreateUserSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: parsed.error.issues })
    }

    const user = await createUser(parsed.data)
    return reply.status(201).send({ user })
  })

  app.patch('/:id', async (req, reply) => {
    const parsed = UpdateUserSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: parsed.error.issues })
    }

    const user = await updateUser((req.params as any).id, parsed.data)
    if (!user) return reply.status(404).send({ error: 'not_found' })
    return { user }
  })

  app.post('/:id/detach', async (req, reply) => {
    const parsed = DetachSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: parsed.error.issues })
    }

    const user = await detachUser((req.params as any).id, parsed.data.reason)
    if (!user) return reply.status(404).send({ error: 'not_found' })
    return { user }
  })

  app.post('/:id/offboard', async (req, reply) => {
    const parsed = OffboardSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: parsed.error.issues })
    }

    const user = await detachUser((req.params as any).id, parsed.data.reason ?? 'Offboarded by admin')
    if (!user) return reply.status(404).send({ error: 'not_found' })

    const auth = (req as any).auth as { email: string }
    await addAdminAuditEntry({
      actorEmail: auth.email,
      action: 'user_offboarded',
      targetUserId: user.id,
      targetEmail: user.email ?? user.emailHistory[user.emailHistory.length - 1]?.email ?? null,
      reason: parsed.data.reason ?? null,
    })

    return { user }
  })
}
