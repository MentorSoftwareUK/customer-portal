import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../auth/requireAuth'
import { ensureUserByEmail } from '../store/users'
import { startSession, endSession, trackPageView, trackKbView } from '../store/activity'

const SessionStartSchema = z.object({
  path: z.string().trim().optional(),
})

const SessionEndSchema = z.object({
  sessionId: z.string().trim(),
})

const PageViewSchema = z.object({
  path: z.string().trim(),
})

const KbViewSchema = z.object({
  articleId: z.string().trim().optional().nullable(),
  title: z.string().trim().optional().nullable(),
  url: z.string().trim().optional().nullable(),
})

export const activityRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const ok = await requireAuth(req, reply)
    if (!ok) return reply
  })

  app.post('/session/start', async (req, reply) => {
    const parsed = SessionStartSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: parsed.error.issues })
    }

    const auth = (req as any).auth as { email: string }
    const user = await ensureUserByEmail(auth.email)
    const session = await startSession({
      userId: user?.id ?? null,
      email: auth.email,
      path: parsed.data.path ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    })

    return { sessionId: session.id }
  })

  app.post('/session/end', async (req, reply) => {
    const parsed = SessionEndSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: parsed.error.issues })
    }

    const session = await endSession(parsed.data.sessionId)
    if (!session) return reply.status(404).send({ error: 'not_found' })
    return { ok: true }
  })

  app.post('/page-view', async (req, reply) => {
    const parsed = PageViewSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: parsed.error.issues })
    }

    const auth = (req as any).auth as { email: string }
    const user = await ensureUserByEmail(auth.email)
    await trackPageView({ userId: user?.id ?? null, email: auth.email, path: parsed.data.path })
    return { ok: true }
  })

  app.post('/kb-view', async (req, reply) => {
    const parsed = KbViewSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: parsed.error.issues })
    }

    const auth = (req as any).auth as { email: string }
    const user = await ensureUserByEmail(auth.email)
    await trackKbView({
      userId: user?.id ?? null,
      email: auth.email,
      articleId: parsed.data.articleId ?? null,
      title: parsed.data.title ?? null,
      url: parsed.data.url ?? null,
    })
    return { ok: true }
  })
}
