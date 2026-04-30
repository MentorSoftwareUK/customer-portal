import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { env } from '../env'
import { requireAuth } from '../auth/requireAuth'
import { getFeatureFlags } from '../store/settings'
import {
  hubspotBatchReadTickets,
  hubspotCreateNoteEngagementForTicket,
  hubspotCreateTicket,
  hubspotFindContactByEmail,
  hubspotGetPrimaryCompanyIdForContact,
  hubspotGetTicketById,
  hubspotListCompanyIdsForContact,
  hubspotListCompanyIdsForTicket,
  hubspotListContactIdsForTicket,
  hubspotListTicketEngagementNotes,
  hubspotListTicketIdsForCompany,
  hubspotListTicketIdsForContact,
  hubspotListTicketPipelines,
} from '../integrations/hubspot'

export type TicketStatus = 'Open' | 'Pending' | 'Closed'

export type TicketDto = {
  id: string
  subject: string
  status: TicketStatus
  lastUpdatedLabel: string
  createdLabel: string
  priority?: 'Low' | 'Normal' | 'High'
  timeToCloseMs?: number
  timeToFirstReplyMs?: number
}

export type TicketStats = {
  total: number
  open: number
  pending: number
  closed: number
  avgResponseMs: number | null
  avgResolutionMs: number | null
}

export type TicketMessageDto = {
  id: string
  direction: 'customer' | 'support'
  body: string
  timeLabel: string
}

export type TicketDetailDto = TicketDto & {
  category?: string
  priority?: 'Low' | 'Normal' | 'High'
  messages: TicketMessageDto[]
  canReply?: boolean
}

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

  const cache = new Map<string, { expiresAt: number; value: unknown }>()
  const CACHE_TTL_MS = env.TICKETS_CACHE_TTL_MS

  function cacheGet<T>(key: string): T | null {
    const hit = cache.get(key)
    if (!hit) return null
    if (Date.now() > hit.expiresAt) {
      cache.delete(key)
      return null
    }
    return hit.value as T
  }

  function cacheSet(key: string, value: unknown, ttlMs = CACHE_TTL_MS) {
    cache.set(key, { value, expiresAt: Date.now() + ttlMs })
  }

  function invalidateAllTicketCaches() {
    cache.clear()
  }

  function decodeHtmlEntities(input: string) {
    const entityMap: Record<string, string> = {
      amp: '&',
      lt: '<',
      gt: '>',
      quot: '"',
      apos: "'",
      nbsp: ' ',
    }

    return input.replace(/&(#\d+|#x[\da-fA-F]+|[a-zA-Z]+);/g, (full, token: string) => {
      if (token.startsWith('#x') || token.startsWith('#X')) {
        const code = Number.parseInt(token.slice(2), 16)
        return Number.isFinite(code) ? String.fromCodePoint(code) : full
      }
      if (token.startsWith('#')) {
        const code = Number.parseInt(token.slice(1), 10)
        return Number.isFinite(code) ? String.fromCodePoint(code) : full
      }
      return entityMap[token.toLowerCase()] ?? full
    })
  }

  function sanitizeMessageBody(input: string) {
    const raw = input ?? ''
    const withoutStyleOrScript = raw
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')

    const withLineBreakHints = withoutStyleOrScript
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')

    const withoutTags = withLineBreakHints.replace(/<[^>]*>/g, ' ')
    const decoded = decodeHtmlEntities(withoutTags)

    return decoded
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  function formatDateLabel(iso: string | null | undefined): string {
    if (!iso) return '—'
    const d = new Date(iso)
    if (!Number.isFinite(d.getTime())) return '—'
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  function computeTicketStats(tickets: TicketDto[]): TicketStats {
    const open = tickets.filter((t) => t.status === 'Open').length
    const pending = tickets.filter((t) => t.status === 'Pending').length
    const closed = tickets.filter((t) => t.status === 'Closed').length
    const responseTimes = tickets.map((t) => t.timeToFirstReplyMs).filter((v): v is number => v != null && v > 0)
    const resolutionTimes = tickets.map((t) => t.timeToCloseMs).filter((v): v is number => v != null && v > 0)
    return {
      total: tickets.length,
      open,
      pending,
      closed,
      avgResponseMs: responseTimes.length ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : null,
      avgResolutionMs: resolutionTimes.length ? Math.round(resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length) : null,
    }
  }

  function formatRelativeLabel(iso: string | null | undefined) {
    if (!iso) return 'Unknown'
    const t = new Date(iso).getTime()
    if (!Number.isFinite(t)) return 'Unknown'
    const delta = Date.now() - t
    const mins = Math.floor(delta / 60_000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  let stageStatusCache: { ts: number; map: Map<string, TicketStatus> } | null = null

  async function getStageStatusMap(): Promise<Map<string, TicketStatus>> {
    const now = Date.now()
    if (stageStatusCache && now - stageStatusCache.ts < 15 * 60_000) return stageStatusCache.map

    const pipelines = await hubspotListTicketPipelines()
    const map = new Map<string, TicketStatus>()
    for (const p of pipelines ?? []) {
      for (const s of p.stages ?? []) {
        const label = (s.label ?? '').trim().toLowerCase()
        if (!label) continue
        if (label.includes('closed') || label.includes('resolved') || label.includes('complete')) {
          map.set(s.id, 'Closed')
          continue
        }
        if (label.includes('pending') || label.includes('waiting') || label.includes('on hold')) {
          map.set(s.id, 'Pending')
          continue
        }
        map.set(s.id, 'Open')
      }
    }

    // Fallback for portals with numeric stage ids where stage labels are unknown.
    map.set('4', map.get('4') ?? 'Closed')

    stageStatusCache = { ts: now, map }
    return map
  }

  function mapPriority(raw: string | null | undefined): 'Low' | 'Normal' | 'High' | undefined {
    const v = (raw ?? '').trim().toLowerCase()
    if (!v) return undefined
    if (v === 'low') return 'Low'
    if (v === 'high') return 'High'
    // HubSpot often uses MEDIUM
    if (v === 'medium' || v === 'normal') return 'Normal'
    return 'Normal'
  }

  async function resolveContactId(req: any): Promise<string | null> {
    const auth = req.auth as { email: string; hubspotContactId: string | null } | undefined
    if (auth?.hubspotContactId) return auth.hubspotContactId
    const email = auth?.email
    if (!email) return null
    try {
      const contact = await hubspotFindContactByEmail({ email, properties: ['email'] })
      return contact?.id ?? null
    } catch {
      return null
    }
  }

  async function getAllowedCompanyIdsForViewer(opts: {
    contactId: string
    canEditCompany: boolean
  }): Promise<string[]> {
    if (opts.canEditCompany) {
      const ids = await hubspotListCompanyIdsForContact(opts.contactId)
      return ids.filter(Boolean)
    }
    const primary = await hubspotGetPrimaryCompanyIdForContact(opts.contactId)
    return primary ? [primary] : []
  }

  // My tickets (tickets associated to the logged-in contact)
  app.get('/', async (req) => {
    if (!env.HUBSPOT_PRIVATE_APP_TOKEN) {
      return { tickets: [], warning: 'HubSpot is not configured. No tickets available.' }
    }

    const contactId = await resolveContactId(req as any)
    if (!contactId) return { tickets: [] }

    const key = `mine:${contactId}`
    const cached = cacheGet<{ tickets: TicketDto[] }>(key)
    if (cached) return cached

    const ticketIds = await hubspotListTicketIdsForContact(contactId)
    const stageMap = await getStageStatusMap()

    const items = await hubspotBatchReadTickets({
      ids: ticketIds,
      properties: ['subject', 'hs_pipeline_stage', 'hs_ticket_priority', 'hs_ticket_category', 'hs_lastmodifieddate', 'createdate', 'hs_time_to_close', 'hs_time_to_first_agent_reply'],
    })

    const tickets: TicketDto[] = items
      .map((t) => {
        const p = t.properties ?? {}
        const stage = p['hs_pipeline_stage']
        const status = (stage && stageMap.get(stage)) || 'Open'
        const subject = p['subject'] || p['hs_ticket_subject'] || '(No subject)'
        const updated = p['hs_lastmodifieddate'] || p['createdate']
        const ttc = p['hs_time_to_close'] ? Number(p['hs_time_to_close']) : undefined
        const ttr = p['hs_time_to_first_agent_reply'] ? Number(p['hs_time_to_first_agent_reply']) : undefined

        return {
          id: t.id,
          subject,
          status,
          lastUpdatedLabel: formatRelativeLabel(updated),
          createdLabel: formatDateLabel(p['createdate']),
          priority: mapPriority(p['hs_ticket_priority']),
          timeToCloseMs: Number.isFinite(ttc) ? ttc : undefined,
          timeToFirstReplyMs: Number.isFinite(ttr) ? ttr : undefined,
        }
      })
      .sort((a, b) => a.subject.localeCompare(b.subject))

    const payload = { tickets, stats: computeTicketStats(tickets) }
    cacheSet(key, payload)
    return payload
  })

  // Org tickets (tickets for the user's organisation / associated companies)
  app.get('/org', async (req) => {
    if (!env.HUBSPOT_PRIVATE_APP_TOKEN) {
      return { tickets: [], warning: 'HubSpot is not configured. No tickets available.' }
    }

    const auth = (req as any).auth as { canEditCompany: boolean } | undefined
    const contactId = await resolveContactId(req as any)
    if (!contactId) return { tickets: [] }

    const allowedCompanyIds = await getAllowedCompanyIdsForViewer({
      contactId,
      canEditCompany: Boolean(auth?.canEditCompany),
    })
    if (allowedCompanyIds.length === 0) return { tickets: [] }

    const key = `org:${contactId}:${allowedCompanyIds.slice().sort().join(',')}`
    const cached = cacheGet<{ tickets: TicketDto[] }>(key)
    if (cached) return cached

    const stageMap = await getStageStatusMap()
    const allTicketIds: string[] = []
    for (const companyId of allowedCompanyIds) {
      const ids = await hubspotListTicketIdsForCompany(companyId)
      allTicketIds.push(...ids)
    }
    const uniqueTicketIds = Array.from(new Set(allTicketIds))

    const items = await hubspotBatchReadTickets({
      ids: uniqueTicketIds,
      properties: ['subject', 'hs_pipeline_stage', 'hs_ticket_priority', 'hs_ticket_category', 'hs_lastmodifieddate', 'createdate', 'hs_time_to_close', 'hs_time_to_first_agent_reply'],
    })

    const tickets: TicketDto[] = items
      .map((t) => {
        const p = t.properties ?? {}
        const stage = p['hs_pipeline_stage']
        const status = (stage && stageMap.get(stage)) || 'Open'
        const subject = p['subject'] || p['hs_ticket_subject'] || '(No subject)'
        const updated = p['hs_lastmodifieddate'] || p['createdate']
        const ttc = p['hs_time_to_close'] ? Number(p['hs_time_to_close']) : undefined
        const ttr = p['hs_time_to_first_agent_reply'] ? Number(p['hs_time_to_first_agent_reply']) : undefined

        return {
          id: t.id,
          subject,
          status,
          lastUpdatedLabel: formatRelativeLabel(updated),
          createdLabel: formatDateLabel(p['createdate']),
          priority: mapPriority(p['hs_ticket_priority']),
          timeToCloseMs: Number.isFinite(ttc) ? ttc : undefined,
          timeToFirstReplyMs: Number.isFinite(ttr) ? ttr : undefined,
        }
      })
      .sort((a, b) => a.subject.localeCompare(b.subject))

    const payload = { tickets, stats: computeTicketStats(tickets) }
    cacheSet(key, payload)
    return payload
  })

  app.get('/:id', async (req, reply) => {
    if (!env.HUBSPOT_PRIVATE_APP_TOKEN) {
      return reply.status(503).send({ error: 'hubspot_not_configured' })
    }

    const id = String((req.params as { id?: string }).id ?? '').trim()
    if (!id) return reply.status(400).send({ error: 'invalid_request' })

    const contactId = await resolveContactId(req as any)
    if (!contactId) return reply.status(404).send({ error: 'not_found' })

    const key = `detail:${contactId}:${id}`
    const cached = cacheGet<{ ticket: TicketDetailDto }>(key)
    if (cached) return cached

    const auth = (req as any).auth as { canEditCompany: boolean } | undefined

    const allowedCompanyIds = await getAllowedCompanyIdsForViewer({
      contactId,
      canEditCompany: Boolean(auth?.canEditCompany),
    })

    const [ticketCompanies, ticketContacts] = await Promise.all([
      hubspotListCompanyIdsForTicket(id),
      hubspotListContactIdsForTicket(id),
    ])

    const canReply = ticketContacts.includes(contactId)
    const canView = canReply || ticketCompanies.some((c) => allowedCompanyIds.includes(c))
    if (!canView) return reply.status(404).send({ error: 'not_found' })

    const stageMap = await getStageStatusMap()

    const hsTicket = await hubspotGetTicketById({
      id,
      properties: ['subject', 'hs_pipeline_stage', 'hs_ticket_priority', 'hs_ticket_category', 'hs_lastmodifieddate', 'createdate'],
    })
    const p = hsTicket.properties ?? {}
    const stage = p['hs_pipeline_stage']
    const status = (stage && stageMap.get(stage)) || 'Open'
    const subject = p['subject'] || p['hs_ticket_subject'] || '(No subject)'

    const notes = await hubspotListTicketEngagementNotes(id)
    const messages: TicketMessageDto[] = (notes ?? [])
      .map((n) => {
        const bodyRaw = n.metadata?.body ?? ''
        const body = sanitizeMessageBody(bodyRaw)
        const ts = n.engagement?.timestamp ?? n.engagement?.createdAt
        const tsMs = typeof ts === 'number' ? ts : Number.NaN
        const timeIso = Number.isFinite(tsMs) ? new Date(tsMs).toISOString() : null
        const source = (n.engagement?.source ?? '').toUpperCase()

        return {
          id: String(n.engagement?.id ?? Math.random()),
          direction: source.includes('INTEGRATION') || source.includes('API') ? 'customer' : 'support',
          body,
          timeLabel: formatRelativeLabel(timeIso),
          _tsMs: Number.isFinite(tsMs) ? tsMs : 0,
        } as TicketMessageDto & { _tsMs: number }
      })
      .filter((m) => m.body.length > 0)
      .sort((a, b) => a._tsMs - b._tsMs)
      .map(({ _tsMs, ...rest }) => rest)

    const ticket: TicketDetailDto = {
      id: hsTicket.id,
      subject,
      status,
      lastUpdatedLabel: 'Just now',
      createdLabel: formatDateLabel(p['createdate']),
      category: p['hs_ticket_category'] ?? undefined,
      priority: mapPriority(p['hs_ticket_priority']) ?? undefined,
      messages,
      canReply,
    }

    const payload = { ticket }
    cacheSet(key, payload)
    return payload
  })

  app.post('/', async (req, reply) => {
    const parsed = CreateTicketBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid_request',
        issues: parsed.error.issues,
      })
    }

    if (!env.HUBSPOT_PRIVATE_APP_TOKEN) {
      return reply.status(503).send({ error: 'hubspot_not_configured' })
    }

    const contactId = await resolveContactId(req as any)
    if (!contactId) return reply.status(400).send({ error: 'no_hubspot_contact' })

    const companyId = await hubspotGetPrimaryCompanyIdForContact(contactId)
    const stageMap = await getStageStatusMap()
    const defaultStageId =
      [...stageMap.entries()].find(([, status]) => status === 'Open' || status === 'Pending')?.[0] ??
      [...stageMap.keys()][0] ??
      null

    const priorityMap: Record<string, string> = { Low: 'LOW', Normal: 'MEDIUM', High: 'HIGH' }
    const properties: Record<string, string | null> = {
      subject: parsed.data.subject,
      hs_ticket_category: parsed.data.category ?? null,
      hs_ticket_priority: parsed.data.priority ? (priorityMap[parsed.data.priority] ?? parsed.data.priority) : null,
      hs_pipeline_stage: defaultStageId,
    }

    const created = await hubspotCreateTicket({ properties, contactId, companyId })
    await hubspotCreateNoteEngagementForTicket({ ticketId: created.id, body: parsed.data.description })
    invalidateAllTicketCaches()

    const status = stageMap.get(created.properties?.hs_pipeline_stage ?? '') ?? 'Open'

    return {
      ticket: {
        id: created.id,
        subject: created.properties?.subject ?? parsed.data.subject,
        status,
        lastUpdatedLabel: 'Just now',
        createdLabel: formatDateLabel(new Date().toISOString()),
      },
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

    const id = String((req.params as { id?: string }).id ?? '')

    if (!env.HUBSPOT_PRIVATE_APP_TOKEN) {
      return reply.status(503).send({ error: 'hubspot_not_configured' })
    }

    const contactId = await resolveContactId(req as any)
    if (!contactId) return reply.status(404).send({ error: 'not_found' })

    const ticketContacts = await hubspotListContactIdsForTicket(id)
    if (!ticketContacts.includes(contactId)) {
      return reply.status(403).send({ error: 'forbidden', message: 'You can only reply to your own tickets.' })
    }

    await hubspotCreateNoteEngagementForTicket({ ticketId: id, body: parsed.data.message })
    invalidateAllTicketCaches()

    const stageMap = await getStageStatusMap()
    const hsTicket = await hubspotGetTicketById({
      id,
      properties: ['subject', 'hs_pipeline_stage', 'hs_ticket_priority', 'hs_ticket_category', 'hs_lastmodifieddate', 'createdate'],
    })
    const p = hsTicket.properties ?? {}
    const stage = p['hs_pipeline_stage']
    const status = (stage && stageMap.get(stage)) || 'Open'
    const subject = p['subject'] || p['hs_ticket_subject'] || '(No subject)'
    const updated = p['hs_lastmodifieddate'] || p['createdate']

    const notes = await hubspotListTicketEngagementNotes(id)
    const messages: TicketMessageDto[] = (notes ?? [])
      .map((n) => {
        const bodyRaw = n.metadata?.body ?? ''
        const body = sanitizeMessageBody(bodyRaw)
        const ts = n.engagement?.timestamp ?? n.engagement?.createdAt
        const tsMs = typeof ts === 'number' ? ts : Number.NaN
        const timeIso = Number.isFinite(tsMs) ? new Date(tsMs).toISOString() : null
        const source = (n.engagement?.source ?? '').toUpperCase()

        return {
          id: String(n.engagement?.id ?? Math.random()),
          direction: source.includes('INTEGRATION') || source.includes('API') ? 'customer' : 'support',
          body,
          timeLabel: formatRelativeLabel(timeIso),
          _tsMs: Number.isFinite(tsMs) ? tsMs : 0,
        } as TicketMessageDto & { _tsMs: number }
      })
      .filter((m) => m.body.length > 0)
      .sort((a, b) => a._tsMs - b._tsMs)
      .map(({ _tsMs, ...rest }) => rest)

    const ticket: TicketDetailDto = {
      id: hsTicket.id,
      subject,
      status,
      lastUpdatedLabel: formatRelativeLabel(updated),
      createdLabel: formatDateLabel(p['createdate']),
      category: p['hs_ticket_category'] ?? undefined,
      priority: mapPriority(p['hs_ticket_priority']) ?? undefined,
      messages,
      canReply: true,
    }

    return { ticket }
  })
}
