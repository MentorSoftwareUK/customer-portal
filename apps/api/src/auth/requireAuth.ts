import type { FastifyReply, FastifyRequest } from 'fastify'
import { getBearerToken, verifyAccessToken } from './jwt'
import { ensureUserByEmail, updateUserLastSeenByEmail, updateUser } from '../store/users'

// Throttle lastSeenAt writes to once per 60 s per email to avoid DB churn.
const lastSeenCache = new Map<string, number>()
const LAST_SEEN_INTERVAL_MS = 60_000

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const token = getBearerToken(req)
  if (!token) {
    await reply.status(401).send({ error: 'unauthorized' })
    return false
  }

  try {
    const payload = await verifyAccessToken(token)
    ;(req as any).auth = payload
    if (!payload.isAdmin) {
      const user = await ensureUserByEmail(payload.email)
      if (user) {
        if (user.accessStatus === 'perm_blocked') {
          await reply.status(403).send({ error: 'forbidden', message: 'Access restricted.' })
          return false
        }
        if (user.accessStatus === 'temp_blocked') {
          const blockedUntil = user.blockedUntil ? new Date(user.blockedUntil).getTime() : 0
          if (blockedUntil && blockedUntil > Date.now()) {
            await reply.status(403).send({ error: 'forbidden', message: 'Access temporarily restricted.' })
            return false
          }
          if (!blockedUntil || blockedUntil <= Date.now()) {
            await updateUser(user.id, { accessStatus: 'active', blockedUntil: null, blockedReason: null })
          }
        }
        const now = Date.now()
        const lastWritten = lastSeenCache.get(payload.email) ?? 0
        if (now - lastWritten > LAST_SEEN_INTERVAL_MS) {
          lastSeenCache.set(payload.email, now)
          await updateUserLastSeenByEmail(payload.email)
        }
      }
    }
    return true
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Invalid token'
    await reply.status(401).send({ error: 'unauthorized', message })
    return false
  }
}
