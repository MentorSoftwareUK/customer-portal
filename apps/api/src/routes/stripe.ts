import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import Stripe from 'stripe'
import { env } from '../env'
import { getStripeClient } from '../integrations/stripe'
import { scheduleEventEmailsForRegistration } from '../jobs/scheduleEventEmails'
import {
  getRegistrationByCheckoutSessionId,
  getRegistrationById,
  markRegistrationCancelled,
  markRegistrationFailed,
  markRegistrationPaid,
} from '../store/registrations'
import { getEventByIdStore } from '../store/events'
import { hubspotUpdateRegistrationObjectByRegistrationId, hubspotUpsertRegistrationDeal } from '../integrations/hubspot'

const ConfirmQuerySchema = z.object({
  session_id: z.string().trim().min(1),
})

type ConfirmResponse =
  | {
      status: 'paid'
      registrationId: string
      eventId: string
    }
  | {
      status: 'pending'
      registrationId: string
      eventId: string
    }

export const stripeRoutes: FastifyPluginAsync = async (app) => {
  // Stripe webhook signature verification needs access to the raw request body.
  // We encapsulate a content-type parser just for this endpoint to avoid impacting other routes.
  await app.register(async (webhookScope) => {
    webhookScope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
      done(null, body)
    })

    webhookScope.post('/webhook', async (req, reply) => {
      if (!env.STRIPE_SECRET_KEY) {
        return reply.status(501).send({ error: 'not_configured', message: 'Missing STRIPE_SECRET_KEY' })
      }

      if (!env.STRIPE_WEBHOOK_SECRET) {
        return reply.status(501).send({ error: 'not_configured', message: 'Missing STRIPE_WEBHOOK_SECRET' })
      }

      const signature = req.headers['stripe-signature']
      if (typeof signature !== 'string' || !signature.trim()) {
        return reply.status(400).send({ error: 'invalid_request', message: 'Missing stripe-signature header' })
      }

      const rawBody = req.body
      if (!Buffer.isBuffer(rawBody)) {
        return reply.status(400).send({ error: 'invalid_request', message: 'Expected raw webhook body as Buffer' })
      }

      const stripe = getStripeClient()

      let event: Stripe.Event
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET)
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Webhook signature verification failed'
        return reply.status(400).send({ error: 'invalid_signature', message })
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session
        const registrationId = session.metadata?.registrationId
        if (registrationId) {
          await markRegistrationPaid(registrationId)
          const registration = await getRegistrationById(registrationId)
          if (registration) {
            // Best-effort HubSpot reporting update.
            if (env.HUBSPOT_PRIVATE_APP_TOKEN && env.HUBSPOT_EVENT_REGISTRATION_OBJECT_TYPE) {
              try {
                const evt = await getEventByIdStore(registration.eventId)
                const amount = registration.attendeeType === 'non-customer' ? (evt?.priceForNonCustomers ?? 0) : 0

                await hubspotUpsertRegistrationDeal({
                  registrationId,
                  hubspotContactId: registration.hubspotContactId ?? null,
                  status: 'paid',
                  amountGbp: amount,
                  email: registration.email,
                  eventId: registration.eventId,
                  eventTitle: evt?.title ?? null,
                  eventStartAt: evt?.startAt ?? null,
                  attendeeType: registration.attendeeType,
                  registeredAt: registration.createdAt,
                  paidAt: new Date().toISOString(),
                  stripeCheckoutSessionId: session.id,
                })

                await hubspotUpdateRegistrationObjectByRegistrationId({
                  registrationId,
                  properties: {
                    mentor_registration_status: 'paid',
                    mentor_paid_at: String(Date.now()),
                    mentor_stripe_checkout_session_id: session.id,
                  },
                })
              } catch (e) {
                app.log.warn({ err: e }, 'HubSpot deal upsert failed after payment')
              }
            }

            await scheduleEventEmailsForRegistration({
              registrationId,
              eventId: registration.eventId,
              to: registration.email,
            })
          }
        }
      }

      if (event.type === 'checkout.session.expired') {
        const session = event.data.object as Stripe.Checkout.Session
        const registrationId = session.metadata?.registrationId
        if (registrationId) {
          await markRegistrationCancelled(registrationId)
          const registration = await getRegistrationById(registrationId)
          if (registration && env.HUBSPOT_PRIVATE_APP_TOKEN && env.HUBSPOT_EVENT_REGISTRATION_OBJECT_TYPE) {
            try {
              const evt = await getEventByIdStore(registration.eventId)
              const amount = registration.attendeeType === 'non-customer' ? (evt?.priceForNonCustomers ?? 0) : 0

              await hubspotUpsertRegistrationDeal({
                registrationId,
                hubspotContactId: registration.hubspotContactId ?? null,
                status: 'cancelled',
                amountGbp: amount,
                email: registration.email,
                eventId: registration.eventId,
                eventTitle: evt?.title ?? null,
                eventStartAt: evt?.startAt ?? null,
                attendeeType: registration.attendeeType,
                registeredAt: registration.createdAt,
                stripeCheckoutSessionId: session.id,
              })

              await hubspotUpdateRegistrationObjectByRegistrationId({
                registrationId,
                properties: {
                  mentor_registration_status: 'cancelled',
                  mentor_stripe_checkout_session_id: session.id,
                },
              })
            } catch (e) {
              app.log.warn({ err: e }, 'HubSpot deal upsert failed after expiry')
            }
          }
        }
      }

      if (event.type === 'checkout.session.async_payment_failed') {
        const session = event.data.object as Stripe.Checkout.Session
        const registrationId = session.metadata?.registrationId
        if (registrationId) {
          await markRegistrationFailed(registrationId)
          const registration = await getRegistrationById(registrationId)
          if (registration && env.HUBSPOT_PRIVATE_APP_TOKEN && env.HUBSPOT_EVENT_REGISTRATION_OBJECT_TYPE) {
            try {
              const evt = await getEventByIdStore(registration.eventId)
              const amount = registration.attendeeType === 'non-customer' ? (evt?.priceForNonCustomers ?? 0) : 0

              await hubspotUpsertRegistrationDeal({
                registrationId,
                hubspotContactId: registration.hubspotContactId ?? null,
                status: 'failed',
                amountGbp: amount,
                email: registration.email,
                eventId: registration.eventId,
                eventTitle: evt?.title ?? null,
                eventStartAt: evt?.startAt ?? null,
                attendeeType: registration.attendeeType,
                registeredAt: registration.createdAt,
                stripeCheckoutSessionId: session.id,
              })

              await hubspotUpdateRegistrationObjectByRegistrationId({
                registrationId,
                properties: {
                  mentor_registration_status: 'failed',
                  mentor_stripe_checkout_session_id: session.id,
                },
              })
            } catch (e) {
              app.log.warn({ err: e }, 'HubSpot deal upsert failed after async payment failure')
            }
          }
        }
      }

      return reply.status(200).send({ received: true })
    })
  })

  // Used by the portal after returning from Stripe to mark the event as registered locally.
  // This avoids needing a DB right now while still completing the user journey.
  app.get('/checkout/confirm', async (req, reply) => {
    const parsed = ConfirmQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: parsed.error.issues })
    }

    if (!env.STRIPE_SECRET_KEY) {
      return reply.status(501).send({ error: 'not_configured', message: 'Missing STRIPE_SECRET_KEY' })
    }

    const stripe = getStripeClient()
    const sessionId = parsed.data.session_id

    const session = await stripe.checkout.sessions.retrieve(sessionId)

    const metadataRegistrationId = session.metadata?.registrationId
    const storeRegistration = await getRegistrationByCheckoutSessionId(sessionId)
    const registrationId = metadataRegistrationId ?? storeRegistration?.id

    if (!registrationId) {
      return reply.status(404).send({ error: 'not_found', message: 'Registration not found for session' })
    }

    const registration = await getRegistrationById(registrationId)
    if (!registration) {
      return reply.status(404).send({ error: 'not_found', message: 'Registration not found' })
    }

    const isPaid = session.payment_status === 'paid'
    if (isPaid) {
      await markRegistrationPaid(registrationId)

      if (env.HUBSPOT_PRIVATE_APP_TOKEN && env.HUBSPOT_EVENT_REGISTRATION_OBJECT_TYPE) {
        try {
          const evt = await getEventByIdStore(registration.eventId)
          const amount = registration.attendeeType === 'non-customer' ? (evt?.priceForNonCustomers ?? 0) : 0

          await hubspotUpsertRegistrationDeal({
            registrationId,
            hubspotContactId: registration.hubspotContactId ?? null,
            status: 'paid',
            amountGbp: amount,
            email: registration.email,
            eventId: registration.eventId,
            eventTitle: evt?.title ?? null,
            eventStartAt: evt?.startAt ?? null,
            attendeeType: registration.attendeeType,
            registeredAt: registration.createdAt,
            paidAt: new Date().toISOString(),
            stripeCheckoutSessionId: session.id,
          })

          await hubspotUpdateRegistrationObjectByRegistrationId({
            registrationId,
            properties: {
              mentor_registration_status: 'paid',
              mentor_paid_at: String(Date.now()),
              mentor_stripe_checkout_session_id: session.id,
            },
          })
        } catch (e) {
          app.log.warn({ err: e }, 'HubSpot deal upsert failed on confirm')
        }
      }

      await scheduleEventEmailsForRegistration({
        registrationId,
        eventId: registration.eventId,
        to: registration.email,
      })
      const res: ConfirmResponse = { status: 'paid', registrationId, eventId: registration.eventId }
      return reply.status(200).send(res)
    }

    const res: ConfirmResponse = { status: 'pending', registrationId, eventId: registration.eventId }
    return reply.status(200).send(res)
  })
}
