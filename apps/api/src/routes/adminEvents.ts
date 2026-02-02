import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../auth/requireAdmin'
import { cancelEventStore, getEventByIdStore, listEventsStore, updateEventStore } from '../store/events'
import { listRegistrationsByEventId } from '../store/registrations'

const EventIdParamsSchema = z.object({
  id: z.string().trim().min(1),
})

const WebinarSlideSchema = z.object({
  label: z.string().trim().optional(),
  url: z.string().trim().url(),
})

const EventPatchSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  type: z.enum(['Webinar', 'Lunch & Learn', 'Podcast', 'Other']).optional(),
  startAt: z.string().trim().optional(),
  dateLabel: z.string().trim().optional(),
  timezoneLabel: z.string().trim().optional(),
  status: z.string().trim().optional(),
  completed: z.boolean().optional(),
  eligibility: z.enum(['customer', 'non-customer', 'both']).optional(),
  eligibilityLabel: z.string().trim().optional(),
  provision: z.enum(['childrens-home', 'supported-accommodation', 'over-18', 'all']).optional(),
  provisionLabel: z.string().trim().optional(),
  priceForNonCustomers: z.number().nullable().optional(),
  durationMins: z.number().int().positive().optional(),
  commentsCount: z.number().int().nonnegative().optional(),
  hostName: z.string().trim().optional(),
  hostTitle: z.string().trim().optional(),
  platform: z.enum(['Teams', 'Riverside', 'TBD']).optional(),
  joinUrl: z.string().trim().nullable().optional(),
  registeredCount: z.number().int().nonnegative().optional(),
  attendeesCount: z.number().int().nonnegative().optional(),
  noShowCount: z.number().int().nonnegative().optional(),
  webinarSlides: z.array(WebinarSlideSchema).optional(),
  webinarRecordingUrl: z.string().trim().nullable().optional(),
  emailStats: z
    .object({
      sent: z.number().int().nonnegative().optional(),
      delivered: z.number().int().nonnegative().optional(),
      bounced: z.number().int().nonnegative().optional(),
      ctr: z.number().nonnegative().optional(),
    })
    .optional(),
})

function formatDateLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  const day = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date)
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
  return `${day} · ${time}`
}

function inferEligibilityLabel(value?: 'customer' | 'non-customer' | 'both') {
  if (value === 'customer') return 'Customers only'
  if (value === 'non-customer') return 'Non-customers'
  if (value === 'both') return 'Customers & non-customers'
  return undefined
}

function inferProvisionLabel(value?: 'childrens-home' | 'supported-accommodation' | 'over-18' | 'all') {
  if (value === 'childrens-home') return 'Children’s homes'
  if (value === 'supported-accommodation') return 'Supported accommodation'
  if (value === 'over-18') return '18+ provision'
  if (value === 'all') return 'All provision types'
  return undefined
}

export const adminEventsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const ok = await requireAdmin(req, reply)
    if (!ok) return reply
  })

  app.get('/', async () => ({ events: await listEventsStore() }))

  app.get('/:id', async (req, reply) => {
    const parsed = EventIdParamsSchema.safeParse(req.params)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: parsed.error.issues })
    }

    const found = await getEventByIdStore(parsed.data.id)
    if (!found) return reply.status(404).send({ error: 'not_found' })

    return { event: found }
  })

  app.patch('/:id', async (req, reply) => {
    const paramsParsed = EventIdParamsSchema.safeParse(req.params)
    if (!paramsParsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: paramsParsed.error.issues })
    }

    const bodyParsed = EventPatchSchema.safeParse(req.body)
    if (!bodyParsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: bodyParsed.error.issues })
    }

    const patch = { ...bodyParsed.data }

    if (patch.startAt && !patch.dateLabel) {
      const derived = formatDateLabel(patch.startAt)
      if (derived) patch.dateLabel = derived
    }

    if (patch.eligibility && !patch.eligibilityLabel) {
      patch.eligibilityLabel = inferEligibilityLabel(patch.eligibility)
    }

    if (patch.provision && !patch.provisionLabel) {
      patch.provisionLabel = inferProvisionLabel(patch.provision)
    }

    const updated = await updateEventStore(paramsParsed.data.id, patch)
    if (!updated) return reply.status(404).send({ error: 'not_found' })

    return { event: updated }
  })

  app.post('/:id/cancel', async (req, reply) => {
    const parsed = EventIdParamsSchema.safeParse(req.params)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: parsed.error.issues })
    }

    const updated = await cancelEventStore(parsed.data.id)
    if (!updated) return reply.status(404).send({ error: 'not_found' })

    return { event: updated }
  })

  app.get('/:id/registrations', async (req, reply) => {
    const parsed = EventIdParamsSchema.safeParse(req.params)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: parsed.error.issues })
    }

    const regs = await listRegistrationsByEventId(parsed.data.id)
    return { registrations: regs }
  })
}
