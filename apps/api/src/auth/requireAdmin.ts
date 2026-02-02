import type { FastifyReply, FastifyRequest } from 'fastify'
import { env } from '../env'
import { requireAuth } from './requireAuth'

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const ok = await requireAuth(req, reply)
  if (!ok) return false

  const auth = (req as any).auth as { email: string; isAdmin?: boolean; adminRoles?: string[] }

  if (auth.isAdmin) return true
  if (Array.isArray(auth.adminRoles) && auth.adminRoles.some((r) => r && r.trim())) return true

  // Backwards compatibility: allow allowlist while migrating to admin credentials.
  const allowlist = (env.ADMIN_EMAIL_ALLOWLIST ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

  if (allowlist.length > 0 && allowlist.includes(auth.email.toLowerCase())) return true

  await reply.status(403).send({ error: 'forbidden' })
  return false

  return true
}
