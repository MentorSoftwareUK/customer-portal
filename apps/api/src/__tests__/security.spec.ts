import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Isolate from real env — set BEFORE server import.
process.env.HUBSPOT_PRIVATE_APP_TOKEN = ''
process.env.MONGODB_URI = 'memory://disabled'
process.env.ADMIN_EMAIL_ALLOWLIST = 'admin@test.co.uk'
process.env.NODE_ENV = 'test'
process.env.SENDGRID_API_KEY = ''
process.env.SMTP_HOST = ''
process.env.SMTP_PASS = ''
process.env.SMTP_FROM = ''
process.env.AUTH_JWT_SECRET = 'test-secret-minimum-sixteen'

let app: Awaited<ReturnType<typeof import('../server')['buildServer']>>
let signAccessToken: typeof import('../auth/jwt')['signAccessToken']

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    email: 'user@example.com',
    viewerType: 'non-customer' as const,
    hubspotContactId: null,
    isLiveCustomer: null,
    provisionType: null,
    productVersion: null,
    jobTitle: null,
    buyingRole: null,
    canEditCompany: false,
    isAdmin: false,
    adminRoles: [],
    ...overrides,
  }
}

beforeAll(async () => {
  const [server, jwt] = await Promise.all([
    import('../server'),
    import('../auth/jwt'),
  ])
  app = await server.buildServer()
  signAccessToken = jwt.signAccessToken
}, 30_000)

afterAll(async () => {
  if (app) await app.close()
})

// ─── Auth middleware: unauthenticated access ──────────────────────────────

describe('requireAuth — rejects unauthenticated requests', () => {
  // NOTE: GET /events is intentionally public (event listing).
  // These routes all use preHandler with requireAuth.
  const protectedRoutes = [
    { method: 'GET' as const, url: '/videos' },
    { method: 'GET' as const, url: '/documents' },
    { method: 'GET' as const, url: '/tickets' },
    { method: 'GET' as const, url: '/profile' },
    { method: 'GET' as const, url: '/meetings' },
    { method: 'GET' as const, url: '/notifications' },
    { method: 'POST' as const, url: '/activity/session/start' },
    { method: 'GET' as const, url: '/features' },
    { method: 'GET' as const, url: '/invoices' },
    { method: 'GET' as const, url: '/events/registrations/me' },
  ]

  for (const { method, url } of protectedRoutes) {
    it(`${method} ${url} returns 401 without token`, async () => {
      const res = await app.inject({ method, url })
      expect(res.statusCode).toBe(401)
      expect(res.json()).toHaveProperty('error', 'unauthorized')
    })
  }

  it('rejects a garbage Authorization header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/videos',
      headers: { authorization: 'Bearer garbage.token.here' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('rejects an empty Bearer value', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/videos',
      headers: { authorization: 'Bearer ' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('rejects a non-Bearer scheme', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/videos',
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    })
    expect(res.statusCode).toBe(401)
  })
})

// ─── Admin middleware: privilege escalation ───────────────────────────────

describe('requireAdmin — blocks non-admin users', () => {
  const adminRoutes = [
    { method: 'GET' as const, url: '/admin/users' },
    { method: 'GET' as const, url: '/admin/settings' },
    { method: 'GET' as const, url: '/admin/events' },
  ]

  for (const { method, url } of adminRoutes) {
    it(`${method} ${url} returns 401 without token`, async () => {
      const res = await app.inject({ method, url })
      expect(res.statusCode).toBe(401)
    })

    it(`${method} ${url} returns 403 for regular user`, async () => {
      const token = await signAccessToken(makePayload({ isAdmin: false }))
      const res = await app.inject({
        method,
        url,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(403)
      expect(res.json()).toHaveProperty('error', 'forbidden')
    })
  }

  it('allows admin user through', async () => {
    const token = await signAccessToken(makePayload({
      email: 'admin@test.co.uk',
      isAdmin: true,
      adminRoles: ['super'],
    }))
    const res = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: { authorization: `Bearer ${token}` },
    })
    // Should not be 401 or 403 — it might 500 because Mongo isn't connected
    // but the middleware let it through.
    expect([401, 403]).not.toContain(res.statusCode)
  })

  it('allows allowlisted email through', async () => {
    const token = await signAccessToken(makePayload({
      email: 'admin@test.co.uk',
      isAdmin: false,
      adminRoles: [],
    }))
    const res = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: { authorization: `Bearer ${token}` },
    })
    expect([401, 403]).not.toContain(res.statusCode)
  })
})

// ─── Auth routes: input validation ───────────────────────────────────────

describe('auth routes — Zod validation rejects bad input', () => {
  it('POST /auth/start rejects missing email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/start',
      payload: {},
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toHaveProperty('error', 'invalid_request')
  })

  it('POST /auth/start rejects invalid email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/start',
      payload: { email: 'not-an-email' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('POST /auth/verify rejects missing code', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { email: 'user@example.com' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('POST /auth/verify rejects wrong code', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { email: 'user@example.com', code: '000000' },
    })
    // 401 because the code doesn't match (or no code was issued)
    expect(res.statusCode).toBe(401)
  })

  it('POST /auth/login rejects empty password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'user@example.com', password: '' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('POST /auth/lookup rejects missing email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/lookup',
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })
})

// ─── Auth flow: code issuance + verification (integration) ───────────────

describe('auth flow — code issue and verify', () => {
  it('issues a code and verifies it', async () => {
    const email = 'flow-test@example.com'

    const startRes = await app.inject({
      method: 'POST',
      url: '/auth/start',
      payload: { email },
    })
    expect(startRes.statusCode).toBe(200)
    const { devCode } = startRes.json() as { devCode?: string }
    expect(devCode).toBeTruthy()

    const verifyRes = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { email, code: devCode },
    })
    expect(verifyRes.statusCode).toBe(200)
    const body = verifyRes.json() as { accessToken?: string; user?: { email: string } }
    expect(body.accessToken).toBeTruthy()
    expect(body.user?.email).toBe(email)
  })

  it('code cannot be reused after verification', async () => {
    const email = 'reuse-test@example.com'

    const startRes = await app.inject({
      method: 'POST',
      url: '/auth/start',
      payload: { email },
    })
    const { devCode } = startRes.json() as { devCode?: string }

    // First verify succeeds
    const v1 = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { email, code: devCode },
    })
    expect(v1.statusCode).toBe(200)

    // Second verify with same code fails
    const v2 = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { email, code: devCode },
    })
    expect(v2.statusCode).toBe(401)
  })
})

// ─── JWT: token integrity ────────────────────────────────────────────────

describe('JWT — token signing and verification', () => {
  it('signed token is accepted by protected routes', async () => {
    const token = await signAccessToken(makePayload())
    const res = await app.inject({
      method: 'GET',
      url: '/videos',
      headers: { authorization: `Bearer ${token}` },
    })
    // Not 401 — the middleware accepted the token.
    // May be 500/502 because external deps are stubbed, but auth passed.
    expect(res.statusCode).not.toBe(401)
  })

  it('token with wrong secret is rejected', async () => {
    // Manually craft a JWT with the wrong secret — easiest to just use a random string.
    const res = await app.inject({
      method: 'GET',
      url: '/videos',
      headers: {
        authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImhhY2tlckBleGFtcGxlLmNvbSIsImlzQWRtaW4iOnRydWV9.invalidsignature',
      },
    })
    expect(res.statusCode).toBe(401)
  })
})

// ─── CORS ────────────────────────────────────────────────────────────────

describe('CORS — origin restrictions', () => {
  it('allows configured origin', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/videos',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'GET',
      },
    })
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173')
  })

  it('rejects unknown origin', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/videos',
      headers: {
        origin: 'https://evil.com',
        'access-control-request-method': 'GET',
      },
    })
    // Fastify CORS plugin returns false for disallowed origins — no allow-origin header
    expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.com')
  })
})

// ─── Health endpoints: intentionally public ──────────────────────────────

describe('health endpoints — public access', () => {
  it('GET /health returns 200 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
  })

  it('GET /health/db returns 200 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/db' })
    expect(res.statusCode).toBe(200)
  })
})

// ─── Admin auth route: validation ────────────────────────────────────────

describe('admin-auth — input validation', () => {
  it('POST /admin-auth/login rejects empty body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin-auth/login',
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })

  it('POST /admin-auth/login rejects invalid credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin-auth/login',
      payload: { email: 'nobody@test.com', password: 'wrongpassword' },
    })
    expect(res.statusCode).toBe(401)
  })
})

// ─── Password set: requires live customer ────────────────────────────────

describe('password/set — access control', () => {
  it('rejects unauthenticated request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/password/set',
      payload: { password: 'newpassword123' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('rejects non-live-customer', async () => {
    const token = await signAccessToken(makePayload({ isLiveCustomer: false }))
    const res = await app.inject({
      method: 'POST',
      url: '/auth/password/set',
      payload: { password: 'newpassword123' },
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('rejects short password for live customer', async () => {
    const token = await signAccessToken(makePayload({ isLiveCustomer: true }))
    const res = await app.inject({
      method: 'POST',
      url: '/auth/password/set',
      payload: { password: 'short' },
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(400)
  })
})
