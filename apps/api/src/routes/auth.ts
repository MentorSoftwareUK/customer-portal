import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  canEditCompanyFromJobTitle,
  hubspotAssociateContactToCompany,
  hubspotFindCompaniesByDomain,
  hubspotFindContactByEmail,
  hubspotGetCompanyById,
  hubspotGetPrimaryCompanyIdForContact,
} from '../integrations/hubspot'
import { env } from '../env'
import { createAuthCode, verifyAndConsumeAuthCode } from '../auth/codes'
import { hasPassword, setPassword, verifyPassword } from '../auth/passwords'
import { isSmtpConfigured, sendLoginCodeEmail } from '../integrations/email'
import { getBearerToken, signAccessToken, verifyAccessToken, type AuthTokenPayload } from '../auth/jwt'
import { hubspotUpsertContactByEmail } from '../integrations/hubspot'

const LookupBodySchema = z.object({
  email: z.string().trim().email(),
})

const StartBodySchema = z.object({
  email: z.string().trim().email(),
})

const VerifyBodySchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().min(4).max(12),
})

const LoginBodySchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
})

const OnboardBodySchema = z.object({
  email: z.string().trim().email(),
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().max(50).optional(),
  company: z.string().trim().max(255).optional(),
})

const SetPasswordBodySchema = z.object({
  password: z.string().trim().min(8).max(72),
})

function parseTrueValues(value: string | undefined) {
  if (!value) return []
  return value
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
}

function inferLiveCustomer(params: { properties: Record<string, string | null> | null }) {
  const propertyName = env.HUBSPOT_LIVE_CUSTOMER_PROPERTY
  const trueValues = parseTrueValues(env.HUBSPOT_LIVE_CUSTOMER_TRUE_VALUES)

  if (!propertyName || trueValues.length === 0) return null
  const raw = params.properties?.[propertyName]
  if (raw === null || raw === undefined || String(raw).trim() === '') return null

  return trueValues.includes(String(raw).trim().toLowerCase())
}

type ProvisionType = 'supported-accommodation' | 'childrens-home' | 'over-18'

type ProductVersion = 'v2' | 'v3'

function inferProvisionType(params: { properties: Record<string, string | null> | null }): ProvisionType | null {
  const propertyName = env.HUBSPOT_PROVISION_TYPE_PROPERTY
  if (!propertyName) return null

  const raw = params.properties?.[propertyName]
  if (!raw) return null

  const normalized = String(raw).trim().toLowerCase()
  if (!normalized) return null

  // Keep this intentionally forgiving: HubSpot values vary by portal.
  // We normalize a handful of common labels into our internal provision keys.
  if (normalized.includes('supported')) return 'supported-accommodation'
  if (normalized.includes('children')) return 'childrens-home'
  if (normalized.includes('18') || normalized.includes('over')) return 'over-18'
  return null
}

function inferProductVersion(params: { properties: Record<string, string | null> | null }): ProductVersion | null {
  const propertyName = env.HUBSPOT_PRODUCT_VERSION_PROPERTY
  if (!propertyName) return null

  const raw = params.properties?.[propertyName]
  if (!raw) return null

  const normalized = String(raw).trim().toLowerCase()
  if (!normalized) return null

  // Keep this forgiving: portals use different formats ("2", "v2", "version 2", "FileMaker", etc)
  if (normalized.includes('3') || normalized.includes('v3') || normalized.includes('version 3') || normalized.includes('web')) return 'v3'
  if (normalized.includes('2') || normalized.includes('v2') || normalized.includes('version 2') || normalized.includes('filemaker') || normalized.includes('file maker')) return 'v2'
  return null
}

function inferEmailDomain(email: string): string | null {
  const at = email.lastIndexOf('@')
  if (at < 0) return null
  const domain = email.slice(at + 1).trim().toLowerCase()
  if (!domain) return null
  // Avoid trying to map obvious personal emails to customer companies.
  const personal = new Set(['gmail.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'yahoo.com', 'aol.com'])
  if (personal.has(domain)) return null
  return domain
}

function parseAllowlist(raw: string | undefined) {
  return (raw ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

function isAdminEmail(email: string) {
  const allowlist = parseAllowlist(env.ADMIN_EMAIL_ALLOWLIST)
  if (allowlist.length === 0 && email.toLowerCase() === 'liam@mentorsoftware.co.uk') return true
  return allowlist.includes(email.toLowerCase())
}

async function buildAuthPayload(email: string): Promise<AuthTokenPayload> {
  const isAdmin = isAdminEmail(email)

  // If HubSpot isn't configured, allow login with a minimal payload.
  if (!env.HUBSPOT_PRIVATE_APP_TOKEN) {
    return {
      email,
      viewerType: 'non-customer',
      hubspotContactId: null,
      isLiveCustomer: null,
      provisionType: null,
      productVersion: null,
      jobTitle: null,
      buyingRole: null,
      canEditCompany: false,
      isAdmin,
    }
  }

  // Enrich token with HubSpot-derived context when available.
    try {
      const extraProps = [
        env.HUBSPOT_LIVE_CUSTOMER_PROPERTY,
        env.HUBSPOT_PROVISION_TYPE_PROPERTY,
        env.HUBSPOT_PRODUCT_VERSION_PROPERTY,
      ].filter((v): v is string => Boolean(v))

      const contactPromise = hubspotFindContactByEmail({
        email,
        properties: ['email', 'firstname', 'lastname', 'jobtitle', 'hs_buying_role', ...extraProps],
      })

      const contact = await Promise.race([
        contactPromise,
        new Promise<null>((_resolve, reject) => {
          const timeout = setTimeout(() => {
            clearTimeout(timeout)
            const err = new Error('HubSpot lookup timed out')
            ;(err as any).code = 'HUBSPOT_TIMEOUT'
            reject(err)
          }, env.HUBSPOT_TIMEOUT_MS)
        }),
      ])

    let isLiveCustomer = inferLiveCustomer({ properties: contact?.properties ?? null })
    if (isLiveCustomer === null && contact?.id) {
      try {
        const companyId = await hubspotGetPrimaryCompanyIdForContact(contact.id)
        if (companyId) {
          const company = await hubspotGetCompanyById({
            id: companyId,
            properties: [env.HUBSPOT_LIVE_CUSTOMER_PROPERTY].filter((v): v is string => Boolean(v)),
          })
          const fromCompany = inferLiveCustomer({ properties: company?.properties ?? null })
          if (fromCompany !== null) isLiveCustomer = fromCompany
        }
      } catch {
        // Best-effort fallback.
      }
    }

    // If we couldn't find a contact, try to infer customer status from the company's domain.
    // This supports portals where the "customer status" lives on the Company record.
    if (!contact && isLiveCustomer === null) {
      const domain = inferEmailDomain(email)
      if (domain) {
        try {
          const companies = await hubspotFindCompaniesByDomain({
            domain,
            properties: [env.HUBSPOT_LIVE_CUSTOMER_PROPERTY].filter((v): v is string => Boolean(v)),
          })

          // Prefer any company that matches our "true" values.
          let selected = companies[0] ?? null
          for (const c of companies) {
            const v = inferLiveCustomer({ properties: c?.properties ?? null })
            if (v === true) {
              selected = c
              break
            }
          }

          const fromCompany = selected ? inferLiveCustomer({ properties: selected.properties ?? null }) : null
          if (fromCompany !== null) isLiveCustomer = fromCompany

          // If the company is live and the contact doesn't exist yet, create it now so the
          // user can use the portal immediately (email verification has already happened).
          if (fromCompany === true && selected?.id) {
            const created = await hubspotUpsertContactByEmail({ email, properties: {} })
            try {
              await hubspotAssociateContactToCompany({ contactId: created.contact.id, companyId: selected.id })
            } catch {
              // Best-effort association.
            }

            // Refresh contact so token includes a contact id.
            const refreshed = await hubspotFindContactByEmail({
              email,
              properties: ['email', 'firstname', 'lastname', 'jobtitle', 'hs_buying_role', ...extraProps],
            })
            if (refreshed) {
              const jobTitle = refreshed.properties?.jobtitle ?? null
              const buyingRole = refreshed.properties?.hs_buying_role ?? null
              return {
                email,
                viewerType: 'customer',
                hubspotContactId: refreshed.id,
                isLiveCustomer: true,
                provisionType: inferProvisionType({ properties: refreshed.properties ?? null }),
                productVersion: inferProductVersion({ properties: refreshed.properties ?? null }),
                jobTitle,
                buyingRole,
                canEditCompany: canEditCompanyFromJobTitle(jobTitle),
                isAdmin,
              }
            }
          }
        } catch {
          // ignore
        }
      }
    }

    const viewerType = isLiveCustomer === true ? 'customer' : 'non-customer'

    const jobTitle = contact?.properties?.jobtitle ?? null
    const buyingRole = contact?.properties?.hs_buying_role ?? null

    return {
      email,
      viewerType,
      hubspotContactId: contact?.id ?? null,
      isLiveCustomer,
      provisionType: inferProvisionType({ properties: contact?.properties ?? null }),
      productVersion: inferProductVersion({ properties: contact?.properties ?? null }),
      jobTitle,
      buyingRole,
      canEditCompany: canEditCompanyFromJobTitle(jobTitle),
      isAdmin,
    }
    } catch (err) {
      const missingToken = err instanceof Error && (err as any).code === 'HUBSPOT_NOT_CONFIGURED'
      const timedOut = err instanceof Error && (err as any).code === 'HUBSPOT_TIMEOUT'

    // HubSpot not configured: allow login anyway.
      return {
        email,
        viewerType: 'non-customer',
        hubspotContactId: null,
        isLiveCustomer: null,
        provisionType: null,
        productVersion: null,
        jobTitle: null,
        buyingRole: null,
        canEditCompany: false,
        isAdmin,
      }
  }
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me', async (req, reply) => {
    const token = getBearerToken(req)
    if (!token) {
      return reply.status(401).send({ error: 'unauthorized' })
    }

    try {
      const payload = await verifyAccessToken(token)
      return { user: payload }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Invalid token'
      return reply.status(401).send({ error: 'unauthorized', message })
    }
  })

  // Step 1: begin login by issuing a short-lived code.
  app.post('/start', async (req, reply) => {
    const parsed = StartBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: parsed.error.issues })
    }

    const email = parsed.data.email
    const { code } = await createAuthCode(email)

    let warning: string | undefined
    let devCode: string | undefined

    // Dev ergonomics: when SMTP isn't configured, return the code so local/dev testing isn't blocked.
    if (env.NODE_ENV !== 'production' && !isSmtpConfigured()) {
      devCode = code
      app.log.info({ email, code }, 'Login code (dev)')
      return reply.status(200).send({ ok: true, email, warning, devCode })
    }

    try {
      await sendLoginCodeEmail({ to: email, code })
    } catch (e) {
      warning = e instanceof Error ? e.message : 'Failed to send email'
      if (env.NODE_ENV !== 'production') devCode = code
    }

    return reply.status(200).send({ ok: true, email, warning, devCode })
  })

  // Step 2: verify the code and mint an access token.
  app.post('/verify', async (req, reply) => {
    const parsed = VerifyBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: parsed.error.issues })
    }

    const email = parsed.data.email
    const check = await verifyAndConsumeAuthCode({ email, code: parsed.data.code })
    if (!check.ok) {
      return reply.status(401).send({ error: 'invalid_code', reason: check.error })
    }

    const payload = await buildAuthPayload(email)

    const accessToken = await signAccessToken(payload)
    return reply.status(200).send({ accessToken, user: payload })
  })

  // Email/password login (optional; mainly for live customers).
  app.post('/login', async (req, reply) => {
    const parsed = LoginBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: parsed.error.issues })
    }

    const email = parsed.data.email
    const ok = await verifyPassword({ email, password: parsed.data.password })
    if (!ok) {
      return reply.status(401).send({ error: 'invalid_password' })
    }

    const payload = await buildAuthPayload(email)
    const accessToken = await signAccessToken(payload)
    return reply.status(200).send({ accessToken, user: payload })
  })

  // Onboarding: create/update a contact for non-customers.
  app.post('/onboard', async (req, reply) => {
    const parsed = OnboardBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: parsed.error.issues })
    }

    const { email, firstName, lastName, phone, company } = parsed.data

    try {
      const props: Record<string, string | null> = {
        firstname: firstName ?? null,
        lastname: lastName ?? null,
        phone: phone ?? null,
        company: company ?? null,
      }

      const res = await hubspotUpsertContactByEmail({
        email,
        properties: props,
      })

      return reply.status(200).send({
        ok: true,
        action: res.action,
        hubspotContactId: res.contact.id,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to onboard'
      return reply.status(501).send({ error: 'not_configured', message })
    }
  })

  // Set password (requires a valid login). Restrict to live customers.
  app.post('/password/set', async (req, reply) => {
    const token = getBearerToken(req)
    if (!token) return reply.status(401).send({ error: 'unauthorized' })

    let auth: AuthTokenPayload
    try {
      auth = await verifyAccessToken(token)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Invalid token'
      return reply.status(401).send({ error: 'unauthorized', message })
    }

    if (auth.isLiveCustomer !== true) {
      return reply.status(403).send({ error: 'forbidden', message: 'Password is only available for live customers.' })
    }

    const parsed = SetPasswordBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: parsed.error.issues })
    }

    await setPassword({ email: auth.email, password: parsed.data.password })
    return reply.status(200).send({ ok: true })
  })

  // Phase 1: email-first lookup.
  // Later: determine "live customer" via a configured HubSpot property.
  app.post('/lookup', async (req, reply) => {
    const parsed = LookupBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid_request',
        issues: parsed.error.issues,
      })
    }

    const email = parsed.data.email

    const password = await hasPassword(email)

    // When HubSpot isn't configured, return a minimal lookup response without a warning
    // so the portal can proceed smoothly in dev/demo mode.
    if (!env.HUBSPOT_PRIVATE_APP_TOKEN) {
      return {
        email,
        auth: { hasPassword: password },
        hubspot: {
          found: false,
          contactId: null,
          properties: null,
        },
        isLiveCustomer: null as boolean | null,
        provisionType: null as ProvisionType | null,
        productVersion: null as ProductVersion | null,
      }
    }

    try {
      const extraProps = [
        env.HUBSPOT_LIVE_CUSTOMER_PROPERTY,
        env.HUBSPOT_PROVISION_TYPE_PROPERTY,
        env.HUBSPOT_PRODUCT_VERSION_PROPERTY,
      ].filter(
        (v): v is string => Boolean(v),
      )
      const contactPromise = hubspotFindContactByEmail({
        email,
        properties: ['email', 'firstname', 'lastname', 'phone', ...extraProps],
      })

      const contact = await Promise.race([
        contactPromise,
        new Promise<null>((_resolve, reject) => {
          const timeout = setTimeout(() => {
            clearTimeout(timeout)
            const err = new Error('HubSpot lookup timed out')
            ;(err as any).code = 'HUBSPOT_TIMEOUT'
            reject(err)
          }, env.HUBSPOT_TIMEOUT_MS)
        }),
      ])

      let isLiveCustomer = inferLiveCustomer({ properties: contact?.properties ?? null })
      if (isLiveCustomer === null && contact?.id) {
        try {
          const companyId = await hubspotGetPrimaryCompanyIdForContact(contact.id)
          if (companyId) {
            const company = await hubspotGetCompanyById({
              id: companyId,
              properties: [env.HUBSPOT_LIVE_CUSTOMER_PROPERTY].filter((v): v is string => Boolean(v)),
            })
            const fromCompany = inferLiveCustomer({ properties: company?.properties ?? null })
            if (fromCompany !== null) isLiveCustomer = fromCompany
          }
        } catch {
          // ignore
        }
      }

      if (!contact && isLiveCustomer === null) {
        const domain = inferEmailDomain(email)
        if (domain) {
          try {
            const companies = await hubspotFindCompaniesByDomain({
              domain,
              properties: [env.HUBSPOT_LIVE_CUSTOMER_PROPERTY].filter((v): v is string => Boolean(v)),
            })

            let selected = companies[0] ?? null
            for (const c of companies) {
              const v = inferLiveCustomer({ properties: c?.properties ?? null })
              if (v === true) {
                selected = c
                break
              }
            }

            const fromCompany = selected ? inferLiveCustomer({ properties: selected.properties ?? null }) : null
            if (fromCompany !== null) isLiveCustomer = fromCompany
          } catch {
            // ignore
          }
        }
      }

      return {
        email,
        auth: {
          hasPassword: password,
        },
        hubspot: {
          found: Boolean(contact),
          contactId: contact?.id ?? null,
          properties: contact?.properties ?? null,
        },
        isLiveCustomer,
        provisionType: inferProvisionType({ properties: contact?.properties ?? null }),
        productVersion: inferProductVersion({ properties: contact?.properties ?? null }),
      }
    } catch (err) {
      // If HubSpot isn't configured or fails, return a safe response without blocking.
      const missingToken = err instanceof Error && (err as any).code === 'HUBSPOT_NOT_CONFIGURED'
      const timedOut = err instanceof Error && (err as any).code === 'HUBSPOT_TIMEOUT'
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(200).send({
        email,
        auth: {
          hasPassword: password,
        },
        hubspot: {
          found: false,
          contactId: null,
          properties: null,
        },
        isLiveCustomer: null as boolean | null,
        provisionType: null as ProvisionType | null,
        productVersion: null as ProductVersion | null,
        warning: missingToken ? undefined : timedOut ? 'HubSpot lookup timed out; continuing.' : message,
      })
    }
  })
}
