import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function readDotEnvValue(key) {
  const envPath = path.resolve(process.cwd(), '.env')
  const raw = fs.readFileSync(envPath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const k = trimmed.slice(0, idx)
    if (k !== key) continue
    return trimmed.slice(idx + 1)
  }
  return null
}

async function httpJson(method, url, body, token) {
  const res = await fetch(url, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await res.text().catch(() => '')
  if (!res.ok) {
    throw new Error(`${method} ${url} failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }

  return text ? JSON.parse(text) : null
}

async function main() {
  const baseUrl = process.env.API_BASE_URL?.trim() || 'http://localhost:3001'
  const stripeKey = readDotEnvValue('STRIPE_SECRET_KEY')

  if (!stripeKey) {
    throw new Error('Missing STRIPE_SECRET_KEY in .env')
  }

  const email = `dev+${Date.now()}@example.com`

  const start = await httpJson('POST', `${baseUrl}/auth/start`, { email })
  const code = start?.devCode
  if (!code) {
    throw new Error(`No devCode returned for ${email}. If SMTP is configured, check API logs for the code.`)
  }

  const verify = await httpJson('POST', `${baseUrl}/auth/verify`, { email, code })
  const token = verify?.accessToken
  if (!token) throw new Error('Auth verify did not return accessToken')

  const events = await httpJson('GET', `${baseUrl}/events`)
  const paidEvent = (events?.events || []).find((e) => e.priceForNonCustomers != null)
  if (!paidEvent) throw new Error('No paid event found in /events (seed data)')

  const eventId = paidEvent.id

  const reg = await httpJson(
    'POST',
    `${baseUrl}/events/${encodeURIComponent(eventId)}/register`,
    { name: 'Dev Test', company: 'Example Co', phone: '', customField: '' },
    token,
  )

  const registrationId = reg?.registrationId
  if (!registrationId) throw new Error(`Register did not return registrationId: ${JSON.stringify(reg)}`)

  const before = await httpJson('GET', `${baseUrl}/events/${encodeURIComponent(eventId)}/registration/me`, undefined, token)
  const statusBefore = before?.registration?.status

  console.log('Event:', eventId)
  console.log('Registration:', registrationId)
  console.log('Status before webhook:', statusBefore)

  const trigger = spawnSync(
    'stripe',
    [
      'trigger',
      'checkout.session.completed',
      '--api-key',
      stripeKey,
      '--override',
      `checkout_session:metadata[registrationId]=${registrationId}`,
      '--override',
      `checkout_session:metadata[eventId]=${eventId}`,
    ],
    { stdio: 'pipe', encoding: 'utf8' },
  )

  if (trigger.status !== 0) {
    throw new Error(`stripe trigger failed:\n${trigger.stdout}\n${trigger.stderr}`)
  }

  await new Promise((r) => setTimeout(r, 2000))

  const after = await httpJson('GET', `${baseUrl}/events/${encodeURIComponent(eventId)}/registration/me`, undefined, token)
  const statusAfter = after?.registration?.status

  console.log('Status after webhook:', statusAfter)

  if (statusAfter !== 'paid') {
    throw new Error('Expected status to become paid. Ensure `stripe listen` is running and forwarding to /stripe/webhook.')
  }

  console.log('OK: webhook updated registration to paid')
}

main().catch((err) => {
  console.error(err?.message || err)
  process.exit(1)
})
