  import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { env } from '../env'
import { createCheckoutSession, getStripeClient } from '../integrations/stripe'
import {
  attachCheckoutSession,
  createRegistration,
  getLatestRegistrationForEventByEmail,
  listRegistrationsByEmail,
  markRegistrationPaid,
    updateRegistrationById,
} from '../store/registrations'
import { getEventByIdStore, listEventsStore } from '../store/events'
  import { requireAuth } from '../auth/requireAuth'
import { scheduleEventEmailsForRegistration } from '../jobs/scheduleEventEmails'
  import {
    hubspotUpdateContact,
    hubspotUpsertContactByEmail,
    hubspotUpsertRegistrationDeal,
    hubspotUpsertRegistrationObject,
  } from '../integrations/hubspot'

const EventIdParamsSchema = z.object({
  id: z.string().trim().min(1),
})

const RegisterBodySchema = z.object({
  name: z.string().trim().min(1),
  company: z.string().trim().optional().default(''),
  phone: z.string().trim().optional().default(''),
  customField: z.string().trim().optional().default(''),
  // These are now derived from the authenticated user.
  // Kept optional to avoid breaking older clients.
  email: z.string().trim().email().optional(),
  attendeeType: z.enum(['customer', 'non-customer']).optional(),
})

export type Audience = 'customer' | 'non-customer' | 'both'
export type Provision = 'childrens-home' | 'supported-accommodation' | 'over-18' | 'all'

export type EventDto = {
  id: string
  title: string
  description: string
  type: 'Webinar' | 'Lunch & Learn' | 'Podcast' | 'Other'
  startAt: string
  dateLabel: string
  timezoneLabel: string
  status?: string
  completed?: boolean
  eligibility: Audience
  eligibilityLabel: string
  provision: Provision
  provisionLabel: string
  priceForNonCustomers: number | null
  durationMins: number
  commentsCount: number
  hostName?: string
  hostTitle?: string
  platform: 'Teams' | 'Riverside' | 'TBD'
  joinUrl?: string | null
  registeredCount?: number
  attendeesCount?: number
  noShowCount?: number
  webinarSlides?: Array<{ label?: string; url: string }>
  webinarRecordingUrl?: string | null
  emailStats?: {
    sent?: number
    delivered?: number
    bounced?: number
    ctr?: number
  }
}

function mapAudienceForHubspot(value: Audience) {
  if (value === 'non-customer') return 'non_customer'
  if (value === 'customer') return 'customer'
  return 'both'
}

function mapEventTypeForHubspot(value: EventDto['type']) {
  if (value === 'Lunch & Learn') return 'lunch_and_learn'
  if (value === 'Podcast') return 'podcast'
  if (value === 'Webinar') return 'webinar'
  return 'other'
}

function buildEventContactProperties(params: { event: EventDto; status: 'registered' | 'cancelled' | 'attended' | 'no_show' }) {
  const startAtMs = Number(new Date(params.event.startAt))
  const startAt = Number.isFinite(startAtMs) ? String(startAtMs) : null
  const registeredAt = String(Date.now())

  return {
    mentor_event_id: params.event.id,
    mentor_event_title: params.event.title,
    mentor_event_start_at: startAt,
    mentor_event_status: params.status,
    mentor_event_audience: mapAudienceForHubspot(params.event.eligibility),
    mentor_event_join_url: params.event.joinUrl ?? null,
    mentor_event_type: mapEventTypeForHubspot(params.event.type),
    mentor_event_source: 'portal',
    mentor_event_last_registered_at: registeredAt,
  }
}

type RegistrationResult =
  | {
      status: 'registered'
      registrationId: string
      eventId: string
    }
  | {
      status: 'payment_required'
      registrationId: string
      eventId: string
      amount: number
      currency: 'GBP'
      paymentProvider: 'stripe'
      checkoutUrl?: string
      checkoutSessionId?: string
      checkoutClientSecret?: string
      warning?: string
    }

export const eventsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => {
    const events = await listEventsStore()
    return {
      events: events.filter((e) => (e.status ?? 'upcoming') !== 'draft'),
    }
  })

  // Server-backed replacement for localStorage "registeredEventIds".
  app.get('/registrations/me', async (req, reply) => {
    const ok = await requireAuth(req, reply)
    if (!ok) return reply

    const auth = (req as any).auth as { email: string }
    const regs = await listRegistrationsByEmail(auth.email)

    return {
      registrations: regs.map((r) => ({
        id: r.id,
        eventId: r.eventId,
        status: r.status,
        attendeeType: r.attendeeType,
        createdAt: r.createdAt,
        paidAt: r.paidAt ?? null,
      })),
    }
  })

  app.get('/:id', async (req, reply) => {
    const parsed = EventIdParamsSchema.safeParse(req.params)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: parsed.error.issues })
    }

    const found = await getEventByIdStore(parsed.data.id)
    if (!found) {
      return reply.status(404).send({ error: 'not_found' })
    }

    return { event: found }
  })

  app.get('/:id/registration/me', async (req, reply) => {
    const ok = await requireAuth(req, reply)
    if (!ok) return reply

    const parsed = EventIdParamsSchema.safeParse(req.params)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: parsed.error.issues })
    }

    const auth = (req as any).auth as { email: string }
    const reg = await getLatestRegistrationForEventByEmail({ eventId: parsed.data.id, email: auth.email })

    return {
      registration: reg
        ? {
            id: reg.id,
            eventId: reg.eventId,
            status: reg.status,
            attendeeType: reg.attendeeType,
            createdAt: reg.createdAt,
            paidAt: reg.paidAt ?? null,
          }
        : null,
    }
  })

  // Phase 2 (thin slice): register for an event.
  // Persists nothing yet (no DB), but enforces audience rules and returns payment-required status.
  app.post('/:id/register', async (req, reply) => {
    const ok = await requireAuth(req, reply)
    if (!ok) return reply

    const paramsParsed = EventIdParamsSchema.safeParse(req.params)
    if (!paramsParsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: paramsParsed.error.issues })
    }

    const event = await getEventByIdStore(paramsParsed.data.id)
    if (!event) {
      return reply.status(404).send({ error: 'not_found' })
    }

    const auth = (req as any).auth as { email: string; viewerType: 'customer' | 'non-customer' }
    const attendeeType = auth.viewerType
    const email = auth.email

    const requiresPayment = attendeeType === 'non-customer' && event.priceForNonCustomers != null
    if (requiresPayment && !env.STRIPE_SECRET_KEY) {
      return reply.status(501).send({
        error: 'not_configured',
        message: 'Stripe is not configured (missing STRIPE_SECRET_KEY).',
      })
    }

    const isEligible = event.eligibility === 'both' || event.eligibility === attendeeType
    if (!isEligible) {
      return reply.status(403).send({
        error: 'not_eligible',
        message: 'You are not eligible to register for this event.',
        eventEligibility: event.eligibility,
        attendeeType,
      })
    }

    // If the user already registered, don't create duplicates.
    // This also makes "payment_pending" a temporary state: we guide them back to the same Checkout session.
    const existing = await getLatestRegistrationForEventByEmail({ eventId: event.id, email })
    if (existing) {
      if (existing.status === 'registered' || existing.status === 'paid') {
        const res: RegistrationResult = {
          status: 'registered',
          registrationId: existing.id,
          eventId: event.id,
        }
        return reply.status(200).send(res)
      }

      if (existing.status === 'payment_pending' && attendeeType === 'non-customer' && event.priceForNonCustomers != null) {
        const amount = event.priceForNonCustomers as number

        if (existing.checkoutSessionId) {
          const stripe = getStripeClient()
          const session = await stripe.checkout.sessions.retrieve(existing.checkoutSessionId)

          if (session.payment_status === 'paid') {
            await markRegistrationPaid(existing.id)
            await scheduleEventEmailsForRegistration({
              registrationId: existing.id,
              eventId: event.id,
              to: email,
            })
            const res: RegistrationResult = {
              status: 'registered',
              registrationId: existing.id,
              eventId: event.id,
            }
            return reply.status(200).send(res)
          }

          // If the session is still open, send them back to pay.
          const checkoutUrl = (session as any).url ?? undefined
          const checkoutClientSecret = (session as any).client_secret ?? undefined
          if (session.status === 'open' && (checkoutUrl || checkoutClientSecret)) {
            const res: RegistrationResult = {
              status: 'payment_required',
              registrationId: existing.id,
              eventId: event.id,
              amount,
              currency: 'GBP',
              paymentProvider: 'stripe',
              checkoutUrl,
              checkoutSessionId: session.id,
              checkoutClientSecret,
            }
            return reply.status(200).send(res)
          }
        }
      }
    }

    const bodyParsed = RegisterBodySchema.safeParse(req.body)
    if (!bodyParsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: bodyParsed.error.issues })
    }

    // Best-effort HubSpot sync: ensure the registrant exists as a contact.
    // Never updates company name fields for existing contacts (enforced in hubspotUpdateContact).
    let hubspotContactId: string | null = null
    if (env.HUBSPOT_PRIVATE_APP_TOKEN && env.HUBSPOT_EVENT_REGISTRATION_OBJECT_TYPE) {
      try {
        const fullName = bodyParsed.data.name.trim()
        const parts = fullName.split(/\s+/).filter(Boolean)
        const firstName = parts[0] ?? ''
        const lastName = parts.slice(1).join(' ')

        const props: Record<string, string | null> = {}
        if (firstName) props.firstname = firstName
        if (lastName) props.lastname = lastName
        if (bodyParsed.data.phone) props.phone = bodyParsed.data.phone
        if (bodyParsed.data.company) props.company = bodyParsed.data.company

        const upsert = await hubspotUpsertContactByEmail({ email, properties: props })
        hubspotContactId = upsert.contact.id

        const eventProps = buildEventContactProperties({
          event,
          status: 'registered',
        })
        await hubspotUpdateContact({
          id: hubspotContactId,
          properties: eventProps,
        })
      } catch (e) {
        app.log.warn({ err: e }, 'HubSpot contact upsert failed during event registration')
      }
    }

    const registrationId = `reg_${Date.now()}_${Math.random().toString(16).slice(2)}`

    await createRegistration({
      id: registrationId,
      eventId: event.id,
      attendeeType,
      hubspotContactId,
      name: bodyParsed.data.name,
      email,
      company: bodyParsed.data.company,
      phone: bodyParsed.data.phone,
      customField: bodyParsed.data.customField,
      status: requiresPayment ? 'payment_pending' : 'registered',
      attendanceStatus: null,
      createdAt: new Date().toISOString(),
    })

    if (env.HUBSPOT_PRIVATE_APP_TOKEN) {
      try {
        const status = requiresPayment ? 'payment_pending' : 'registered'
        const record = await hubspotUpsertRegistrationObject({
          registrationId,
          hubspotContactId,
          status,
          email,
          eventId: event.id,
          eventTitle: event.title,
          eventStartAt: event.startAt,
          attendeeType,
          registeredAt: new Date().toISOString(),
          platform: event.platform,
          joinUrl: event.joinUrl ?? null,
        })
        if (record?.id) {
          await updateRegistrationById(registrationId, { hubspotRegistrationId: record.id })
        }
      } catch (e) {
        app.log.warn({ err: e }, 'HubSpot registration object upsert failed')
      }
    }

    // Best-effort HubSpot reporting via Deals.
    if (env.HUBSPOT_PRIVATE_APP_TOKEN) {
      try {
        const status = requiresPayment ? 'payment_pending' : 'registered'
        const amount = attendeeType === 'non-customer' ? (event.priceForNonCustomers ?? 0) : 0

        await hubspotUpsertRegistrationDeal({
          registrationId,
          hubspotContactId,
          status,
          amountGbp: amount,
          email,
          eventId: event.id,
          eventTitle: event.title,
          eventStartAt: event.startAt,
          attendeeType,
          registeredAt: new Date().toISOString(),
        })
      } catch (e) {
        app.log.warn({ err: e }, 'HubSpot deal upsert failed for event registration')
      }
    }

    if (!requiresPayment) {
      // For free registrations, schedule comms immediately.
      await scheduleEventEmailsForRegistration({
        registrationId,
        eventId: event.id,
        to: email,
      })
    }

    let result: RegistrationResult
    if (!requiresPayment) {
      // Free registrations can be considered immediately complete.
      result = {
        status: 'registered',
        registrationId,
        eventId: event.id,
      }
    } else {
      const amount = event.priceForNonCustomers as number
      const successUrl =
        env.STRIPE_CHECKOUT_SUCCESS_URL ??
        `${env.PORTAL_BASE_URL}/app/events/${encodeURIComponent(event.id)}/register?payment=success&session_id={CHECKOUT_SESSION_ID}`
      const cancelUrl =
        env.STRIPE_CHECKOUT_CANCEL_URL ??
        `${env.PORTAL_BASE_URL}/app/events/${encodeURIComponent(event.id)}/register?payment=cancel`

      // For embedded checkout, Stripe uses a single return_url. We reuse the success URL so the portal can confirm the session.
      const returnUrl = successUrl

      const session = await createCheckoutSession({
        amountGbp: amount,
        eventTitle: event.title,
        uiMode: env.STRIPE_CHECKOUT_UI_MODE,
        successUrl,
        cancelUrl,
        returnUrl,
        customerEmail: email,
        clientReferenceId: registrationId,
        metadata: {
          eventId: event.id,
          registrationId,
          attendeeType,
        },
      })

      await attachCheckoutSession(registrationId, session.id)

      result = {
        status: 'payment_required',
        registrationId,
        eventId: event.id,
        amount,
        currency: 'GBP',
        paymentProvider: 'stripe',
        checkoutUrl: 'url' in session ? session.url : undefined,
        checkoutSessionId: session.id,
        checkoutClientSecret: 'clientSecret' in session ? session.clientSecret : undefined,
      }
    }

    return reply.status(200).send(result)
  })
}
