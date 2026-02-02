import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { signAccessToken, type AuthTokenPayload } from '../auth/jwt'
import { verifyAdminCredentials } from '../store/adminUsers'
import { requireAuth } from '../auth/requireAuth'

const LoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
})

export const adminAuthRoutes: FastifyPluginAsync = async (app) => {
  app.post('/login', async (req, reply) => {
    const parsed = LoginSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: parsed.error.issues })
    }

    const user = await verifyAdminCredentials(parsed.data)
    if (!user) {
      return reply.status(401).send({ error: 'invalid_credentials' })
    }

    const payload: AuthTokenPayload = {
      email: user.email,
      viewerType: 'non-customer',
      hubspotContactId: null,
      isLiveCustomer: null,
      provisionType: null,
      productVersion: null,
      jobTitle: null,
      buyingRole: null,
      canEditCompany: false,
      isAdmin: true,
      adminRoles: user.roles,
    }

    const accessToken = await signAccessToken(payload)
    return reply.status(200).send({
      accessToken,
      admin: {
        email: user.email,
        roles: user.roles,
      },
    })
  })

  app.get('/me', async (req, reply) => {
    const ok = await requireAuth(req, reply)
    if (!ok) return reply

    const auth = (req as any).auth as AuthTokenPayload
    if (!auth.isAdmin) {
      return reply.status(403).send({ error: 'forbidden' })
    }

    return {
      admin: {
        email: auth.email,
        roles: auth.adminRoles ?? [],
      },
    }
  })
}
