import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Ensure tests run without external dependencies.
process.env.HUBSPOT_PRIVATE_APP_TOKEN = ''
process.env.MONGODB_URI = 'memory://disabled'
process.env.ADMIN_EMAIL_ALLOWLIST = 'liam@mentorsoftware.co.uk'
process.env.NODE_ENV = 'test'

let app: Awaited<ReturnType<typeof import('../server')['buildServer']>>

beforeAll(async () => {
  const { buildServer } = await import('../server')
  app = await buildServer()
}, 30000)

afterAll(async () => {
  if (app) await app.close()
})

describe('auth flow performance (happy path, no HubSpot/Mongo)', () => {
  it('issues a code fast', async () => {
    const start = Date.now()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/start',
      payload: { email: 'liam@mentorsoftware.co.uk' },
    })
    const duration = Date.now() - start

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('ok', true)
    // Should be well under 1s when external deps are off.
    expect(duration).toBeLessThan(1000)
  })

  it('verifies code and returns admin claim fast', async () => {
    const email = 'liam@mentorsoftware.co.uk'
    const startRes = await app.inject({ method: 'POST', url: '/auth/start', payload: { email } })
    const startBody = startRes.json() as any

    const code = startBody.devCode ?? startBody.code ?? startBody?.warning ?? ''
    expect(code).toBeTruthy()

    const t0 = Date.now()
    const res = await app.inject({ method: 'POST', url: '/auth/verify', payload: { email, code } })
    const duration = Date.now() - t0

    expect(res.statusCode).toBe(200)
    const body = res.json() as any
    expect(body).toHaveProperty('accessToken')
    expect(body.user).toMatchObject({ email, isAdmin: true })
    expect(duration).toBeLessThan(1000)
  })
})
