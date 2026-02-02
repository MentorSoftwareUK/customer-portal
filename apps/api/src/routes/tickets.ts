import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { env } from '../env'
import { requireAuth } from '../auth/requireAuth'
import { getFeatureFlags } from '../store/settings'
import { createTicketStore, getTicketStore, listTicketsStore, replyToTicketStore } from '../store/tickets'

export type { TicketStatus, TicketDto, TicketMessageDto, TicketDetailDto } from '../store/tickets'

const CreateTicketBodySchema = z.object({
  subject: z.string().trim().min(3),
  description: z.string().trim().min(10),
  category: z.string().trim().min(1).optional(),
  priority: z.enum(['Low', 'Normal', 'High']).optional(),
})

export const ticketsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const ok = await requireAuth(req, reply)
    if (!ok) return reply
  })

  app.addHook('preHandler', async (_req, reply) => {
    const features = await getFeatureFlags()
    if (!features.ticketsEnabled) {
      return reply.status(404).send({ error: 'not_found' })
    }
  })

  app.get('/', async () => {
    const hubspotConfigured = Boolean(env.HUBSPOT_PRIVATE_APP_TOKEN)

    return {
      tickets: listTicketsStore(),
      warning: hubspotConfigured
        ? undefined
        : 'HubSpot is not configured (missing HUBSPOT_PRIVATE_APP_TOKEN). Returning demo tickets.',
    }
  })

  app.get('/:id', async (req, reply) => {
    const hubspotConfigured = Boolean(env.HUBSPOT_PRIVATE_APP_TOKEN)
    const id = String((req.params as { id?: string }).id ?? '')
    const ticket = getTicketStore(id)
    if (!ticket) {
      return reply.status(404).send({ error: 'not_found' })
    }

    return {
      ticket,
      warning: hubspotConfigured
        ? 'HubSpot ticket details are not wired yet. Returning demo ticket details.'
        : 'HubSpot is not configured (missing HUBSPOT_PRIVATE_APP_TOKEN). Returning demo ticket details.',
    }
  })

  // Phase 1: accept and store a demo ticket.
  // Later: create a real ticket in HubSpot Service Hub.
  app.post('/', async (req, reply) => {
    const parsed = CreateTicketBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid_request',
        issues: parsed.error.issues,
      })
    }

    const hubspotConfigured = Boolean(env.HUBSPOT_PRIVATE_APP_TOKEN)
    const ticket = createTicketStore({
      subject: parsed.data.subject,
      description: parsed.data.description,
      category: parsed.data.category,
      priority: parsed.data.priority,
    })

    return {
      ticket,
      warning: hubspotConfigured
        ? 'HubSpot ticket creation is not wired yet. Stored a demo ticket only.'
        : 'HubSpot is not configured (missing HUBSPOT_PRIVATE_APP_TOKEN). Stored a demo ticket only.',
    }
  })

  const ReplyBodySchema = z.object({
    message: z.string().trim().min(1),
  })

  app.post('/:id/reply', async (req, reply) => {
    const parsed = ReplyBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid_request',
        issues: parsed.error.issues,
      })
    }

    const hubspotConfigured = Boolean(env.HUBSPOT_PRIVATE_APP_TOKEN)
    const id = String((req.params as { id?: string }).id ?? '')
    const ticket = replyToTicketStore(id, parsed.data.message)
    if (!ticket) {
      return reply.status(404).send({ error: 'not_found' })
    }

    return {
      ticket,
      warning: hubspotConfigured
        ? 'HubSpot ticket replies are not wired yet. Stored a demo reply only.'
        : 'HubSpot is not configured (missing HUBSPOT_PRIVATE_APP_TOKEN). Stored a demo reply only.',
    }
  })
}
