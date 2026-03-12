import { env } from '../env'
import { getHubSpotOAuthTokens, refreshHubSpotOAuthToken } from '../routes/hubspotOAuth'

const HUBSPOT_BASE_URL = 'https://api.hubapi.com'

type HubSpotSearchResponse = {
  total: number
  results: Array<{
    id: string
    properties: Record<string, string | null>
  }>
}

type HubSpotObjectResponse = {
  id: string
  properties: Record<string, string | null>
}

type HubSpotPipeline = {
  id: string
  label: string
  stages: Array<{ id: string; label: string }>
}

function requireHubSpotToken() {
  const token = env.HUBSPOT_PRIVATE_APP_TOKEN
  if (!token) {
    console.error('[hubspot] Missing HUBSPOT_PRIVATE_APP_TOKEN in env')
    const err = new Error('Missing HUBSPOT_PRIVATE_APP_TOKEN')
    ;(err as any).code = 'HUBSPOT_NOT_CONFIGURED'
    throw err
  }
  console.log('[hubspot] Using token prefix:', token.slice(0, 6))
  return token
}

const MAX_RETRIES = 3

async function hubspotFetch(path: string, init?: RequestInit, _retryCount = 0): Promise<Response> {
  // Check if this is a Knowledge Base API call
  const isKbEndpoint = path.includes('/knowledge-base/') || path.includes('/cms/v3/knowledge-base')
  
  let token: string
  
  if (isKbEndpoint) {
    const oauthTokens = await getHubSpotOAuthTokens()
    
    if (!oauthTokens) {
      const err = new Error('HubSpot OAuth not connected. Please connect in admin settings.')
      ;(err as any).code = 'HUBSPOT_OAUTH_NOT_CONNECTED'
      throw err
    }
    
    // Check if token is expired (with 5 minute buffer)
    const expiresAt = new Date(oauthTokens.expiresAt)
    const now = new Date()
    const bufferMs = 5 * 60 * 1000 // 5 minutes
    
    if (now.getTime() > expiresAt.getTime() - bufferMs) {
      console.log('[hubspot] OAuth token expired or expiring soon, refreshing...')
      token = await refreshHubSpotOAuthToken()
    } else {
      token = oauthTokens.accessToken
    }
  } else {
    // Use private app token for other endpoints
    const privateToken = env.HUBSPOT_PRIVATE_APP_TOKEN
    if (!privateToken) {
      console.error('[hubspot] Missing HUBSPOT_PRIVATE_APP_TOKEN in env')
      const err = new Error('Missing HUBSPOT_PRIVATE_APP_TOKEN')
      ;(err as any).code = 'HUBSPOT_NOT_CONFIGURED'
      throw err
    }
    token = privateToken
  }

  const controller = new AbortController()
  const timeoutMs = env.HUBSPOT_TIMEOUT_MS ?? 1_200
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const finalHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    }
    console.log('[hubspot] Request', path)
    const res = await fetch(`${HUBSPOT_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: finalHeaders,
    })

    // Retry on 429 rate limit with exponential backoff
    if (res.status === 429 && _retryCount < MAX_RETRIES) {
      clearTimeout(timeout)
      const retryAfter = res.headers.get('retry-after')
      const baseDelay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000
      const delay = baseDelay * Math.pow(2, _retryCount) + Math.random() * 500
      console.warn(`[hubspot] 429 rate limited on ${path}, retrying in ${Math.round(delay)}ms (attempt ${_retryCount + 1}/${MAX_RETRIES})`)
      await new Promise((r) => setTimeout(r, delay))
      return hubspotFetch(path, init, _retryCount + 1)
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`HubSpot request failed (${res.status}): ${text}`)
    }

    return res
  } catch (err) {
    const aborted = err instanceof Error && (err.name === 'AbortError' || (err as any).code === 'ABORT_ERR')
    if (aborted) {
      const timeoutErr = new Error(`HubSpot request timed out after ${timeoutMs}ms`)
      ;(timeoutErr as any).code = 'HUBSPOT_TIMEOUT'
      throw timeoutErr
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

type HubSpotMeResponse = {
  portalId?: number
  timeZone?: string
  hubId?: number
  user?: string
}

export async function hubspotGetMe() {
  const res = await hubspotFetch(`/integrations/v1/me`, { method: 'GET' })
  return (await res.json()) as HubSpotMeResponse
}

export async function hubspotFindContactByEmail(params: {
  email: string
  properties?: string[]
}) {
  const res = await hubspotFetch(`/crm/v3/objects/contacts/search`, {
    method: 'POST',
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'email',
              operator: 'EQ',
              value: params.email,
            },
          ],
        },
      ],
      properties: params.properties ?? ['email', 'firstname', 'lastname', 'phone'],
      limit: 1,
    }),
  })

  const data = (await res.json()) as HubSpotSearchResponse
  return data.results[0] ?? null
}

export async function hubspotCreateContact(params: { properties: Record<string, string | null> }) {
  const res = await hubspotFetch(`/crm/v3/objects/contacts`, {
    method: 'POST',
    body: JSON.stringify({ properties: params.properties }),
  })

  return (await res.json()) as HubSpotObjectResponse
}

export async function hubspotUpsertContactByEmail(params: {
  email: string
  properties: Record<string, string | null>
}) {
  const existing = await hubspotFindContactByEmail({ email: params.email, properties: ['email'] })

  if (existing) {
    const updated = await hubspotUpdateContact({ id: existing.id, properties: params.properties })
    return { action: 'updated' as const, contact: updated }
  }

  const created = await hubspotCreateContact({
    properties: {
      email: params.email,
      ...params.properties,
    },
  })

  return { action: 'created' as const, contact: created }
}

// Brief constraint: never update company name for existing contacts.
// When you add contact updates, ensure "company"/"companyname" are not sent.
export function stripCompanyNameFields<T extends Record<string, unknown>>(properties: T) {
  const { company, companyname, ...rest } = properties as Record<string, unknown>
  return rest as Omit<T, 'company' | 'companyname'>
}

export async function hubspotGetContactById(params: { id: string; properties?: string[] }) {
  const props = params.properties?.length ? `?properties=${encodeURIComponent(params.properties.join(','))}` : ''
  const res = await hubspotFetch(`/crm/v3/objects/contacts/${encodeURIComponent(params.id)}${props}`, { method: 'GET' })
  return (await res.json()) as { id: string; properties: Record<string, string | null> }
}

export async function hubspotUpdateContact(params: { id: string; properties: Record<string, string | null> }) {
  const safe = stripCompanyNameFields(params.properties)
  const res = await hubspotFetch(`/crm/v3/objects/contacts/${encodeURIComponent(params.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties: safe }),
  })
  return (await res.json()) as { id: string; properties: Record<string, string | null> }
}

export async function hubspotSearchObjectByProperty(params: {
  objectType: string
  propertyName: string
  value: string
  properties?: string[]
}) {
  const res = await hubspotFetch(`/crm/v3/objects/${encodeURIComponent(params.objectType)}/search`, {
    method: 'POST',
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            {
              propertyName: params.propertyName,
              operator: 'EQ',
              value: params.value,
            },
          ],
        },
      ],
      properties: params.properties ?? [params.propertyName],
      limit: 1,
    }),
  })

  const data = (await res.json()) as HubSpotSearchResponse
  return data.results[0] ?? null
}

export async function hubspotSearchObjectsByProperty(params: {
  objectType: string
  propertyName: string
  value: string
  properties?: string[]
  limit?: number
}) {
  const res = await hubspotFetch(`/crm/v3/objects/${encodeURIComponent(params.objectType)}/search`, {
    method: 'POST',
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            {
              propertyName: params.propertyName,
              operator: 'EQ',
              value: params.value,
            },
          ],
        },
      ],
      properties: params.properties ?? [params.propertyName],
      limit: params.limit ?? 10,
    }),
  })

  const data = (await res.json()) as HubSpotSearchResponse
  return data.results ?? []
}

export async function hubspotFindCompanyByDomain(params: { domain: string; properties?: string[] }) {
  // HubSpot company "domain" is typically stored without protocol.
  const domain = params.domain.trim().toLowerCase()
  if (!domain) return null

  return await hubspotSearchObjectByProperty({
    objectType: 'companies',
    propertyName: 'domain',
    value: domain,
    properties: params.properties ?? ['domain'],
  })
}

export async function hubspotFindCompaniesByDomain(params: { domain: string; properties?: string[]; limit?: number }) {
  const domain = params.domain.trim().toLowerCase()
  if (!domain) return []

  return await hubspotSearchObjectsByProperty({
    objectType: 'companies',
    propertyName: 'domain',
    value: domain,
    properties: params.properties ?? ['domain'],
    limit: params.limit ?? 10,
  })
}

export async function hubspotAssociateContactToCompany(params: { contactId: string; companyId: string }) {
  const assocTypeId = await resolveAssociationTypeId('contacts', 'companies')
  await hubspotAssociateV4({
    fromObjectType: 'contacts',
    fromObjectId: params.contactId,
    toObjectType: 'companies',
    toObjectId: params.companyId,
    associationTypeId: assocTypeId,
  })
}

const dealPipelineCache: { pipelines: HubSpotPipeline[] | null } = { pipelines: null }

async function hubspotListDealPipelines(): Promise<HubSpotPipeline[]> {
  if (dealPipelineCache.pipelines) return dealPipelineCache.pipelines
  const res = await hubspotFetch(`/crm/v3/pipelines/deals`, { method: 'GET' })
  const data = (await res.json()) as { results: HubSpotPipeline[] }
  dealPipelineCache.pipelines = data.results ?? []
  return dealPipelineCache.pipelines
}

async function resolveDealPipelineId(): Promise<string> {
  if (env.HUBSPOT_EVENT_REGISTRATION_DEAL_PIPELINE_ID) return env.HUBSPOT_EVENT_REGISTRATION_DEAL_PIPELINE_ID

  const label = (env.HUBSPOT_EVENT_REGISTRATION_DEAL_PIPELINE_LABEL ?? 'Event Registrations').trim()
  const pipelines = await hubspotListDealPipelines()
  const match = pipelines.find((p) => p.label.trim().toLowerCase() === label.toLowerCase())
  if (!match) {
    const available = pipelines.map((p) => p.label).slice(0, 10).join(', ')
    throw new Error(`HubSpot deal pipeline not found: ${label}. Available (first 10): ${available}`)
  }
  return match.id
}

async function resolveDealStageId(pipelineId: string, stageLabelOrId: string): Promise<string> {
  const pipelines = await hubspotListDealPipelines()
  const pipeline = pipelines.find((p) => p.id === pipelineId)
  if (!pipeline) throw new Error(`HubSpot deal pipeline id not found: ${pipelineId}`)

  // If they provided an id, accept it.
  const byId = pipeline.stages.find((s) => s.id === stageLabelOrId)
  if (byId) return byId.id

  const wanted = stageLabelOrId.trim().toLowerCase()
  const byLabel = pipeline.stages.find((s) => s.label.trim().toLowerCase() === wanted)
  if (!byLabel) {
    const available = pipeline.stages.map((s) => s.label).join(', ')
    throw new Error(`HubSpot deal stage not found in pipeline ${pipeline.label}: ${stageLabelOrId}. Available: ${available}`)
  }
  return byLabel.id
}

type HubSpotAssociationLabelResponse = {
  results: Array<{ typeId: number; label: string; category: string }>
}

const assocTypeCache = new Map<string, number>()

async function resolveAssociationTypeId(fromObjectType: string, toObjectType: string): Promise<number> {
  const key = `${fromObjectType}->${toObjectType}`
  const cached = assocTypeCache.get(key)
  if (cached) return cached

  const res = await hubspotFetch(
    `/crm/v4/associations/${encodeURIComponent(fromObjectType)}/${encodeURIComponent(toObjectType)}/labels`,
    { method: 'GET' },
  )
  const data = (await res.json()) as HubSpotAssociationLabelResponse
  const first = data.results?.[0]
  if (!first) throw new Error(`No association labels found for ${fromObjectType} -> ${toObjectType}`)
  assocTypeCache.set(key, first.typeId)
  return first.typeId
}

export async function hubspotCreateObject(params: { objectType: string; properties: Record<string, string | null> }) {
  const res = await hubspotFetch(`/crm/v3/objects/${encodeURIComponent(params.objectType)}`, {
    method: 'POST',
    body: JSON.stringify({ properties: params.properties }),
  })
  return (await res.json()) as HubSpotObjectResponse
}

export async function hubspotUpdateObject(params: {
  objectType: string
  id: string
  properties: Record<string, string | null>
}) {
  const res = await hubspotFetch(`/crm/v3/objects/${encodeURIComponent(params.objectType)}/${encodeURIComponent(params.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties: params.properties }),
  })
  return (await res.json()) as HubSpotObjectResponse
}

function getRegistrationObjectType() {
  return (env.HUBSPOT_EVENT_REGISTRATION_OBJECT_TYPE ?? '').trim() || null
}

function getRegistrationObjectUniqueProperty() {
  return (env.HUBSPOT_EVENT_REGISTRATION_OBJECT_UNIQUE_PROPERTY ?? 'mentor_registration_id').trim()
}

export async function hubspotUpsertRegistrationObject(params: {
  registrationId: string
  hubspotContactId: string | null
  status: 'registered' | 'payment_pending' | 'paid' | 'cancelled' | 'failed'
  email: string
  eventId: string
  eventTitle: string | null
  eventStartAt: string | null
  attendeeType: 'customer' | 'non-customer'
  registeredAt: string
  paidAt?: string | null
  platform?: string | null
  joinUrl?: string | null
}) {
  const objectType = getRegistrationObjectType()
  if (!objectType) return null

  const uniqueProp = getRegistrationObjectUniqueProperty()
  const existing = await hubspotSearchObjectByProperty({
    objectType,
    propertyName: uniqueProp,
    value: params.registrationId,
    properties: [uniqueProp],
  })

  const name = params.eventTitle
    ? `${params.eventTitle} — ${params.email}`
    : `Event Registration — ${params.email}`

  const startAtMs = params.eventStartAt ? String(new Date(params.eventStartAt).getTime()) : null
  const registeredAtMs = String(new Date(params.registeredAt).getTime())
  const paidAtMs = params.paidAt ? String(new Date(params.paidAt).getTime()) : null

  const coreProperties: Record<string, string | null> = {
    [uniqueProp]: params.registrationId,
    name,
  }

  const properties: Record<string, string | null> = {
    ...coreProperties,
    mentor_event_id: params.eventId,
    mentor_event_title: params.eventTitle,
    mentor_event_start_at: startAtMs,
    mentor_attendee_type: params.attendeeType,
    mentor_registration_status: params.status,
    mentor_registered_at: registeredAtMs,
    mentor_paid_at: paidAtMs,
    mentor_contact_email: params.email,
    mentor_event_platform: params.platform ?? null,
    mentor_event_join_url: params.joinUrl ?? null,
  }

  let record: HubSpotObjectResponse
  try {
    record = existing
      ? await hubspotUpdateObject({ objectType, id: existing.id, properties })
      : await hubspotCreateObject({ objectType, properties })
  } catch (e) {
    record = existing
      ? await hubspotUpdateObject({ objectType, id: existing.id, properties: coreProperties })
      : await hubspotCreateObject({ objectType, properties: coreProperties })
  }

  if (params.hubspotContactId) {
    try {
      const assocTypeId = await resolveAssociationTypeId('contacts', objectType)
      await hubspotAssociateV4({
        fromObjectType: 'contacts',
        fromObjectId: params.hubspotContactId,
        toObjectType: objectType,
        toObjectId: record.id,
        associationTypeId: assocTypeId,
      })
    } catch {
      // Best-effort association.
    }
  }

  return record
}

export async function hubspotUpdateRegistrationObjectByRegistrationId(params: {
  registrationId: string
  properties: Record<string, string | null>
}) {
  const objectType = getRegistrationObjectType()
  if (!objectType) return null
  const uniqueProp = getRegistrationObjectUniqueProperty()

  const existing = await hubspotSearchObjectByProperty({
    objectType,
    propertyName: uniqueProp,
    value: params.registrationId,
    properties: [uniqueProp],
  })
  if (!existing) return null

  return await hubspotUpdateObject({ objectType, id: existing.id, properties: params.properties })
}

export async function hubspotAssociateV4(params: {
  fromObjectType: string
  fromObjectId: string
  toObjectType: string
  toObjectId: string
  associationTypeId: number
}) {
  await hubspotFetch(
    `/crm/v4/objects/${encodeURIComponent(params.fromObjectType)}/${encodeURIComponent(params.fromObjectId)}/associations/${encodeURIComponent(params.toObjectType)}/${encodeURIComponent(params.toObjectId)}/${params.associationTypeId}`,
    { method: 'PUT' },
  )
}

export async function hubspotUpsertRegistrationDeal(params: {
  registrationId: string
  hubspotContactId: string | null
  status: 'registered' | 'payment_pending' | 'paid' | 'cancelled' | 'failed'
  amountGbp: number
  email: string
  eventId: string
  eventTitle: string | null
  eventStartAt: string | null
  attendeeType: 'customer' | 'non-customer'
  registeredAt: string
  paidAt?: string | null
  stripeCheckoutSessionId?: string | null
}) {
  const uniqueProp = env.HUBSPOT_EVENT_REGISTRATION_DEAL_UNIQUE_PROPERTY ?? 'mentor_registration_id'
  const pipelineId = await resolveDealPipelineId()

  const stageLabel =
    params.status === 'registered'
      ? env.HUBSPOT_EVENT_REGISTRATION_STAGE_REGISTERED ?? 'Registered'
      : params.status === 'payment_pending'
        ? env.HUBSPOT_EVENT_REGISTRATION_STAGE_PAYMENT_PENDING ?? 'Payment Pending'
        : params.status === 'paid'
          ? env.HUBSPOT_EVENT_REGISTRATION_STAGE_PAID ?? 'Paid'
          : params.status === 'cancelled'
            ? env.HUBSPOT_EVENT_REGISTRATION_STAGE_CANCELLED ?? 'Cancelled'
            : env.HUBSPOT_EVENT_REGISTRATION_STAGE_FAILED ?? 'Failed'

  const dealstage = await resolveDealStageId(pipelineId, stageLabel)

  const existing = await hubspotSearchObjectByProperty({
    objectType: 'deals',
    propertyName: uniqueProp,
    value: params.registrationId,
    properties: [uniqueProp],
  })

  const dealname = params.eventTitle
    ? `${params.eventTitle} — ${params.email}`
    : `Event Registration — ${params.email}`

  const coreProperties: Record<string, string | null> = {
    [uniqueProp]: params.registrationId,
    dealname,
    pipeline: pipelineId,
    dealstage,
    amount: String(params.amountGbp ?? 0),
  }

  const properties: Record<string, string | null> = {
    ...coreProperties,
    mentor_event_id: params.eventId,
    mentor_event_title: params.eventTitle,
    mentor_event_start_at: params.eventStartAt,
    mentor_attendee_type: params.attendeeType,
    mentor_registration_status: params.status,
    mentor_registered_at: params.registeredAt,
    mentor_paid_at: params.paidAt ?? null,
    mentor_stripe_checkout_session_id: params.stripeCheckoutSessionId ?? null,
    mentor_contact_email: params.email,
  }

  let deal: HubSpotObjectResponse
  try {
    deal = existing
      ? await hubspotUpdateObject({ objectType: 'deals', id: existing.id, properties })
      : await hubspotCreateObject({ objectType: 'deals', properties })
  } catch (e) {
    // If the portal hasn't created the optional `mentor_*` deal properties yet,
    // HubSpot will reject unknown property names. Retry with core fields only.
    deal = existing
      ? await hubspotUpdateObject({ objectType: 'deals', id: existing.id, properties: coreProperties })
      : await hubspotCreateObject({ objectType: 'deals', properties: coreProperties })
  }

  if (params.hubspotContactId) {
    try {
      const assocTypeId = await resolveAssociationTypeId('deals', 'contacts')
      await hubspotAssociateV4({
        fromObjectType: 'deals',
        fromObjectId: deal.id,
        toObjectType: 'contacts',
        toObjectId: params.hubspotContactId,
        associationTypeId: assocTypeId,
      })
    } catch {
      // Best-effort: deal record still exists for reporting.
    }
  }

  return deal
}

type AssociationV4Response = {
  results: Array<{ toObjectId: number }>
  paging?: { next?: { after: string } }
}

export async function hubspotGetPrimaryCompanyIdForContact(contactId: string): Promise<string | null> {
  const res = await hubspotFetch(
    `/crm/v4/objects/contacts/${encodeURIComponent(contactId)}/associations/companies?limit=1`,
    { method: 'GET' },
  )
  const data = (await res.json()) as AssociationV4Response
  const first = data.results?.[0]?.toObjectId
  return typeof first === 'number' ? String(first) : null
}

export async function hubspotListCompanyIdsForContact(contactId: string): Promise<string[]> {
  const ids: string[] = []
  let after: string | undefined

  for (let i = 0; i < 20; i++) {
    const qs = new URLSearchParams()
    qs.set('limit', '500')
    if (after) qs.set('after', after)

    const res = await hubspotFetch(
      `/crm/v4/objects/contacts/${encodeURIComponent(contactId)}/associations/companies?${qs.toString()}`,
      { method: 'GET' },
    )
    const data = (await res.json()) as AssociationV4Response
    for (const r of data.results ?? []) {
      if (typeof r.toObjectId === 'number') ids.push(String(r.toObjectId))
    }

    const nextAfter = data.paging?.next?.after
    if (!nextAfter) break
    after = nextAfter
  }

  return Array.from(new Set(ids))
}

export async function hubspotListContactIdsForCompany(companyId: string): Promise<string[]> {
  const ids: string[] = []
  let after: string | undefined

  // Default HubSpot page size max is typically 500 for v4 associations.
  for (let i = 0; i < 20; i++) {
    const qs = new URLSearchParams()
    qs.set('limit', '500')
    if (after) qs.set('after', after)

    const res = await hubspotFetch(
      `/crm/v4/objects/companies/${encodeURIComponent(companyId)}/associations/contacts?${qs.toString()}`,
      { method: 'GET' },
    )
    const data = (await res.json()) as AssociationV4Response
    for (const r of data.results ?? []) {
      if (typeof r.toObjectId === 'number') ids.push(String(r.toObjectId))
    }

    const nextAfter = data.paging?.next?.after
    if (!nextAfter) break
    after = nextAfter
  }

  return ids
}

// ---------------------------------------------------------------------------
// Tickets (Service Hub)
// ---------------------------------------------------------------------------

const ticketPipelineCache: { pipelines: HubSpotPipeline[] | null; ts: number } = { pipelines: null, ts: 0 }
const TICKET_PIPELINE_CACHE_TTL_MS = 15 * 60_000

export async function hubspotListTicketPipelines(): Promise<HubSpotPipeline[]> {
  const now = Date.now()
  if (ticketPipelineCache.pipelines && now - ticketPipelineCache.ts < TICKET_PIPELINE_CACHE_TTL_MS) {
    return ticketPipelineCache.pipelines
  }

  const res = await hubspotFetch(`/crm/v3/pipelines/tickets`, { method: 'GET' })
  const data = (await res.json()) as { results?: HubSpotPipeline[] }
  ticketPipelineCache.pipelines = data.results ?? []
  ticketPipelineCache.ts = now
  return ticketPipelineCache.pipelines
}

type AssocV3Response = {
  results: Array<{ id: string; type?: string }>
  paging?: { next?: { after?: string } }
}

export async function hubspotListTicketIdsForContact(contactId: string): Promise<string[]> {
  const ids: string[] = []
  let after: string | undefined

  for (let i = 0; i < 30; i++) {
    const qs = new URLSearchParams()
    qs.set('limit', '500')
    if (after) qs.set('after', after)

    const res = await hubspotFetch(
      `/crm/v3/objects/contacts/${encodeURIComponent(contactId)}/associations/tickets?${qs.toString()}`,
      { method: 'GET' },
    )
    const data = (await res.json()) as AssocV3Response
    for (const r of data.results ?? []) {
      if (r?.id) ids.push(String(r.id))
    }

    const nextAfter = data.paging?.next?.after
    if (!nextAfter) break
    after = nextAfter
  }

  return Array.from(new Set(ids))
}

export async function hubspotListTicketIdsForCompany(companyId: string): Promise<string[]> {
  const ids: string[] = []
  let after: string | undefined

  for (let i = 0; i < 30; i++) {
    const qs = new URLSearchParams()
    qs.set('limit', '500')
    if (after) qs.set('after', after)

    const res = await hubspotFetch(
      `/crm/v3/objects/companies/${encodeURIComponent(companyId)}/associations/tickets?${qs.toString()}`,
      { method: 'GET' },
    )
    const data = (await res.json()) as AssocV3Response
    for (const r of data.results ?? []) {
      if (r?.id) ids.push(String(r.id))
    }

    const nextAfter = data.paging?.next?.after
    if (!nextAfter) break
    after = nextAfter
  }

  return Array.from(new Set(ids))
}

export async function hubspotBatchReadTickets(params: { ids: string[]; properties: string[] }) {
  if (params.ids.length === 0) return []
  const res = await hubspotFetch(`/crm/v3/objects/tickets/batch/read`, {
    method: 'POST',
    body: JSON.stringify({
      properties: params.properties,
      inputs: params.ids.map((id) => ({ id })),
    }),
  })
  const data = (await res.json()) as BatchReadResponse
  return data.results ?? []
}

export async function hubspotGetTicketById(params: { id: string; properties: string[] }) {
  const qs = new URLSearchParams()
  if (params.properties.length) qs.set('properties', params.properties.join(','))

  const res = await hubspotFetch(`/crm/v3/objects/tickets/${encodeURIComponent(params.id)}?${qs.toString()}`, {
    method: 'GET',
  })
  return (await res.json()) as { id: string; properties: Record<string, string | null>; createdAt?: string; updatedAt?: string }
}

export async function hubspotListContactIdsForTicket(ticketId: string): Promise<string[]> {
  const ids: string[] = []
  let after: string | undefined

  for (let i = 0; i < 10; i++) {
    const qs = new URLSearchParams()
    qs.set('limit', '500')
    if (after) qs.set('after', after)

    const res = await hubspotFetch(
      `/crm/v3/objects/tickets/${encodeURIComponent(ticketId)}/associations/contacts?${qs.toString()}`,
      { method: 'GET' },
    )
    const data = (await res.json()) as AssocV3Response
    for (const r of data.results ?? []) {
      if (r?.id) ids.push(String(r.id))
    }

    const nextAfter = data.paging?.next?.after
    if (!nextAfter) break
    after = nextAfter
  }

  return Array.from(new Set(ids))
}

export async function hubspotListCompanyIdsForTicket(ticketId: string): Promise<string[]> {
  const ids: string[] = []
  let after: string | undefined

  for (let i = 0; i < 10; i++) {
    const qs = new URLSearchParams()
    qs.set('limit', '500')
    if (after) qs.set('after', after)

    const res = await hubspotFetch(
      `/crm/v3/objects/tickets/${encodeURIComponent(ticketId)}/associations/companies?${qs.toString()}`,
      { method: 'GET' },
    )
    const data = (await res.json()) as AssocV3Response
    for (const r of data.results ?? []) {
      if (r?.id) ids.push(String(r.id))
    }

    const nextAfter = data.paging?.next?.after
    if (!nextAfter) break
    after = nextAfter
  }

  return Array.from(new Set(ids))
}

type HubSpotEngagementNote = {
  engagement: {
    id: number
    type: string
    createdAt: number
    lastUpdated?: number
    timestamp?: number
    source?: string
  }
  metadata?: {
    body?: string
  }
}

type HubSpotEngagementsPagedResponse = {
  results: HubSpotEngagementNote[]
  hasMore: boolean
  offset: number
}

export async function hubspotListTicketEngagementNotes(ticketId: string): Promise<HubSpotEngagementNote[]> {
  const out: HubSpotEngagementNote[] = []
  let offset = 0

  for (let i = 0; i < 20; i++) {
    const qs = new URLSearchParams()
    qs.set('limit', '100')
    qs.set('offset', String(offset))

    const res = await hubspotFetch(
      `/engagements/v1/engagements/associated/ticket/${encodeURIComponent(ticketId)}/paged?${qs.toString()}`,
      { method: 'GET' },
    )
    const data = (await res.json()) as HubSpotEngagementsPagedResponse
    out.push(...(data.results ?? []).filter((r) => (r.engagement?.type ?? '').toUpperCase() === 'NOTE'))

    if (!data.hasMore) break
    offset = data.offset ?? 0
    if (!offset) break
  }

  return out
}

export async function hubspotCreateTicket(params: {
  properties: Record<string, string | null>
  contactId: string | null
  companyId: string | null
}): Promise<{ id: string; properties: Record<string, string | null> }> {
  const res = await hubspotFetch(`/crm/v3/objects/tickets`, {
    method: 'POST',
    body: JSON.stringify({ properties: params.properties }),
  })

  const ticket = (await res.json()) as { id: string; properties: Record<string, string | null> }

  // Best-effort associations
  if (params.contactId) {
    try {
      const assocTypeId = await resolveAssociationTypeId('tickets', 'contacts')
      await hubspotAssociateV4({
        fromObjectType: 'tickets',
        fromObjectId: ticket.id,
        toObjectType: 'contacts',
        toObjectId: params.contactId,
        associationTypeId: assocTypeId,
      })
    } catch {
      // ignore
    }
  }

  if (params.companyId) {
    try {
      const assocTypeId = await resolveAssociationTypeId('tickets', 'companies')
      await hubspotAssociateV4({
        fromObjectType: 'tickets',
        fromObjectId: ticket.id,
        toObjectType: 'companies',
        toObjectId: params.companyId,
        associationTypeId: assocTypeId,
      })
    } catch {
      // ignore
    }
  }

  return ticket
}

export async function hubspotCreateNoteEngagementForTicket(params: {
  ticketId: string
  body: string
}): Promise<{ engagementId: number } | null> {
  const res = await hubspotFetch(`/engagements/v1/engagements`, {
    method: 'POST',
    body: JSON.stringify({
      engagement: { type: 'NOTE' },
      associations: { ticketIds: [Number(params.ticketId)] },
      metadata: { body: params.body },
    }),
  })

  const data = (await res.json()) as { engagement?: { id?: number } }
  const id = data.engagement?.id
  return typeof id === 'number' ? { engagementId: id } : null
}

type BatchReadResponse = {
  results: Array<{ id: string; properties: Record<string, string | null> }>
}

type HubSpotPaging = { next?: { after: string } }

type HubSpotKbArticle = {
  id: string
  title?: string
  name?: string
  category?: { name?: string } | string | null
  categoryName?: string | null
  tags?: string[] | string | null
  tagNames?: string[] | string | null
  readingTime?: number | null
  estimatedReadingTime?: number | null
  updatedAt?: string | null
  publishDate?: string | null
  createdAt?: string | null
}

export async function hubspotListKnowledgeBaseArticles(params?: { language?: string; limit?: number }) {
  const results: HubSpotKbArticle[] = []
  let after: string | undefined
  const limit = params?.limit ?? 100

  for (let i = 0; i < 10; i += 1) {
    const qs = new URLSearchParams()
    qs.set('limit', String(limit))
    qs.set('archived', 'false')
    if (params?.language) qs.set('language', params.language)
    if (after) qs.set('after', after)

    const res = await hubspotFetch(`/cms/v3/knowledge-base/articles?${qs.toString()}`, { method: 'GET' })
    const data = (await res.json()) as { results?: HubSpotKbArticle[]; paging?: HubSpotPaging }
    results.push(...(data.results ?? []))

    const nextAfter = data.paging?.next?.after
    if (!nextAfter) break
    after = nextAfter
  }

  return results
}

type HubSpotHubDbRow = {
  id: string
  values: Record<string, unknown>
  createdAt?: string | null
  updatedAt?: string | null
}

export async function hubspotListHubDbRows(params: { tableId: string; limit?: number }) {
  const results: HubSpotHubDbRow[] = []
  let after: string | undefined
  const limit = params.limit ?? 100

  for (let i = 0; i < 10; i += 1) {
    const qs = new URLSearchParams()
    qs.set('limit', String(limit))
    if (after) qs.set('after', after)

    const res = await hubspotFetch(`/cms/v3/hubdb/tables/${encodeURIComponent(params.tableId)}/rows?${qs.toString()}`, {
      method: 'GET',
    })
    const data = (await res.json()) as { results?: HubSpotHubDbRow[]; paging?: HubSpotPaging }
    results.push(...(data.results ?? []))

    const nextAfter = data.paging?.next?.after
    if (!nextAfter) break
    after = nextAfter
  }

  return results
}

export async function hubspotBatchReadContacts(params: { ids: string[]; properties: string[] }) {
  if (params.ids.length === 0) return []
  const res = await hubspotFetch(`/crm/v3/objects/contacts/batch/read`, {
    method: 'POST',
    body: JSON.stringify({
      properties: params.properties,
      inputs: params.ids.map((id) => ({ id })),
    }),
  })
  const data = (await res.json()) as BatchReadResponse
  return data.results ?? []
}

export async function hubspotBatchUpdateContacts(params: { updates: Array<{ id: string; properties: Record<string, string | null> }> }) {
  if (params.updates.length === 0) return { updated: 0 }

  const inputs = params.updates.map((u) => ({ id: u.id, properties: stripCompanyNameFields(u.properties) }))

  await hubspotFetch(`/crm/v3/objects/contacts/batch/update`, {
    method: 'POST',
    body: JSON.stringify({ inputs }),
  })

  return { updated: inputs.length }
}

export async function hubspotGetCompanyById(params: { id: string; properties?: string[] }) {
  const props = params.properties?.length ? `?properties=${encodeURIComponent(params.properties.join(','))}` : ''
  const res = await hubspotFetch(`/crm/v3/objects/companies/${encodeURIComponent(params.id)}${props}`, { method: 'GET' })
  return (await res.json()) as { id: string; properties: Record<string, string | null> }
}

export async function hubspotUpdateCompany(params: { id: string; properties: Record<string, string | null> }) {
  const res = await hubspotFetch(`/crm/v3/objects/companies/${encodeURIComponent(params.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties: params.properties }),
  })
  return (await res.json()) as { id: string; properties: Record<string, string | null> }
}

export function canEditCompanyFromJobTitle(jobTitle: string | null | undefined) {
  const jt = (jobTitle ?? '').trim().toLowerCase()
  if (!jt) return false

  const keywords = env.HUBSPOT_COMPANY_EDIT_JOB_TITLE_KEYWORDS
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean)

  return keywords.some((k) => jt.includes(k))
}

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------

const MEETING_PROPERTIES = [
  'hs_meeting_title',
  'hs_meeting_start_time',
  'hs_meeting_end_time',
  'hs_meeting_outcome',
  'hubspot_owner_id',
  'hs_meeting_external_url',
  'hs_meeting_location',
]

type HubSpotOwner = {
  id: string
  firstName: string
  lastName: string
  email: string
}

// Map owner first name (lowercase) → MeetingTeam
const OWNER_TEAM_MAP: Record<string, 'Training' | 'Success Team' | 'Renewals'> = {
  shaun: 'Training',
  simone: 'Success Team',
  hope: 'Renewals',
}

async function hubspotGetOwner(ownerId: string): Promise<HubSpotOwner | null> {
  try {
    const res = await hubspotFetch(`/crm/v3/owners/${encodeURIComponent(ownerId)}`, { method: 'GET' })
    return (await res.json()) as HubSpotOwner
  } catch {
    return null
  }
}

export type HubSpotMeeting = {
  id: string
  title: string | null
  startTimeMs: number | null
  endTimeMs: number | null
  outcome: string | null
  joinUrl: string | null
  location: string | null
  ownerId: string | null
  ownerName: string | null
  team: 'Training' | 'Success Team' | 'Renewals'
}

export async function hubspotGetMeetingsForContact(contactId: string): Promise<HubSpotMeeting[]> {
  // 1. Get all meeting IDs associated with this contact
  const assocRes = await hubspotFetch(
    `/crm/v3/objects/contacts/${encodeURIComponent(contactId)}/associations/meetings`,
    { method: 'GET' },
  )
  const assocData = (await assocRes.json()) as { results: Array<{ id: string; type: string }> }
  const meetingIds = assocData.results.map((r) => r.id)

  if (!meetingIds.length) return []

  // 2. Batch-read meeting properties
  const batchRes = await hubspotFetch(`/crm/v3/objects/meetings/batch/read`, {
    method: 'POST',
    body: JSON.stringify({
      inputs: meetingIds.map((id) => ({ id })),
      properties: MEETING_PROPERTIES,
    }),
  })
  const batchData = (await batchRes.json()) as {
    results: Array<{ id: string; properties: Record<string, string | null> }>
  }

  // 3. Resolve unique owner IDs
  const ownerIds = [...new Set(
    batchData.results
      .map((m) => m.properties['hubspot_owner_id'])
      .filter((id): id is string => Boolean(id)),
  )]
  const ownerMap = new Map<string, HubSpotOwner | null>()
  await Promise.all(ownerIds.map(async (id) => {
    ownerMap.set(id, await hubspotGetOwner(id))
  }))

  // 4. Map to HubSpotMeeting
  const now = Date.now()
  return batchData.results
    .map((m): HubSpotMeeting => {
      const p = m.properties
      const startRaw = p['hs_meeting_start_time']
      const endRaw = p['hs_meeting_end_time']
      const startMs = startRaw ? Number(startRaw) : null
      const endMs = endRaw ? Number(endRaw) : null
      const ownerId = p['hubspot_owner_id'] ?? null
      const owner = ownerId ? ownerMap.get(ownerId) ?? null : null
      const ownerFirst = (owner?.firstName ?? '').trim().toLowerCase()
      const team = OWNER_TEAM_MAP[ownerFirst] ?? 'Success Team'
      const ownerName = owner ? `${owner.firstName} ${owner.lastName}`.trim() : null

      return {
        id: m.id,
        title: p['hs_meeting_title'] ?? null,
        startTimeMs: startMs,
        endTimeMs: endMs,
        outcome: p['hs_meeting_outcome'] ?? null,
        joinUrl: p['hs_meeting_external_url'] ?? null,
        location: p['hs_meeting_location'] ?? null,
        ownerId,
        ownerName,
        team,
      }
    })
    // Only upcoming (not yet started or in progress now) and not cancelled
    .filter((m) => {
      if (m.outcome && m.outcome.toUpperCase() === 'CANCELED') return false
      if (m.startTimeMs === null) return false
      return m.startTimeMs >= now - 30 * 60 * 1000 // include if started within last 30 min (allow join)
    })
    .sort((a, b) => (a.startTimeMs ?? 0) - (b.startTimeMs ?? 0))
}

// ─── Contact Lists ────────────────────────────────────────────────────────────

export type HubSpotContactList = {
  listId: number
  name: string
  size: number
  dynamic: boolean
}

/**
 * Returns all HubSpot contact lists (both static and dynamic).
 * Uses the v3 Lists Search API.
 *
 * Note: some HubSpot portals return an empty array for `GET /crm/v3/lists`
 * even when lists exist. `POST /crm/v3/lists/search` returns the v3 list IDs
 * that are compatible with the `/crm/v3/lists/{listId}/memberships` endpoint
 * used by invite sending.
 */
export async function hubspotGetContactLists(): Promise<HubSpotContactList[]> {
  const token = env.HUBSPOT_PRIVATE_APP_TOKEN
  if (!token) return []

  type HubSpotListSearchResponse = {
    offset?: number
    hasMore?: boolean
    lists?: Array<{
      listId: string
      name: string
      processingType?: 'DYNAMIC' | 'STATIC' | string
      additionalProperties?: {
        hs_list_size?: string
      }
    }>
  }

  const allLists: HubSpotContactList[] = []
  let offset = 0
  let pages = 0

  while (true) {
    pages += 1
    if (pages > 50) break

    const res = await hubspotFetch(`/crm/v3/lists/search`, {
      method: 'POST',
      body: JSON.stringify({
        objectTypeId: '0-1',
        limit: 250,
        offset,
      }),
    })

    const data = (await res.json()) as HubSpotListSearchResponse
    const lists = data.lists ?? []

    for (const l of lists) {
      const sizeRaw = l.additionalProperties?.hs_list_size
      const size = sizeRaw ? Number(sizeRaw) : 0

      allLists.push({
        listId: Number(l.listId),
        name: l.name,
        size: Number.isFinite(size) ? size : 0,
        dynamic: l.processingType === 'DYNAMIC',
      })
    }

    if (!data.hasMore) break
    if (typeof data.offset !== 'number') break
    offset = data.offset
  }

  return allLists.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Returns all contacts (email, firstName, lastName) from a given HubSpot list.
 * Uses v3 memberships endpoint + batch read — requires crm.lists.read and
 * crm.objects.contacts.read scopes.
 */
export async function hubspotGetContactsInList(
  listId: number,
): Promise<Array<{ email: string; firstName: string; lastName: string }>> {
  const token = env.HUBSPOT_PRIVATE_APP_TOKEN
  if (!token) return []

  // Step 1: collect all record IDs from the list memberships endpoint
  const recordIds: string[] = []
  let after: string | undefined = undefined

  while (true) {
    const params = new URLSearchParams({ limit: '500' })
    if (after) params.set('after', after)

    const res = await hubspotFetch(`/crm/v3/lists/${listId}/memberships?${params.toString()}`, { method: 'GET' })
    if (!res.ok) break

    const data = await res.json() as {
      results: Array<{ recordId: string }>
      paging?: { next?: { after?: string } }
    }

    for (const r of data.results ?? []) {
      recordIds.push(r.recordId)
    }

    after = data.paging?.next?.after
    if (!after) break
  }

  if (recordIds.length === 0) return []

  // Step 2: batch-read contact properties in chunks of 100
  const contacts: Array<{ email: string; firstName: string; lastName: string }> = []
  const chunkSize = 100

  for (let i = 0; i < recordIds.length; i += chunkSize) {
    const chunk = recordIds.slice(i, i + chunkSize)
    const res = await hubspotFetch('/crm/v3/objects/contacts/batch/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: chunk.map(id => ({ id })),
        properties: ['email', 'firstname', 'lastname'],
      }),
    })
    if (!res.ok) continue

    const data = await res.json() as {
      results: Array<{
        properties: { email?: string; firstname?: string; lastname?: string }
      }>
    }

    for (const c of data.results ?? []) {
      const email = c.properties?.email ?? ''
      if (email) {
        contacts.push({
          email,
          firstName: c.properties?.firstname ?? '',
          lastName: c.properties?.lastname ?? '',
        })
      }
    }
  }

  return contacts
}

/** Small delay helper to stay under HubSpot's per-second rate limit. */
function rateLimitPause(ms = 350): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Search all tickets in HubSpot, paginating through all results.
 * Includes a short pause between pages to avoid HubSpot's per-second rate limit.
 */
export async function hubspotSearchAllTickets(params: {
  properties: string[]
  filterGroups?: Array<{ filters: Array<{ propertyName: string; operator: string; value: string }> }>
  limit?: number
}): Promise<Array<{ id: string; properties: Record<string, string | null> }>> {
  const all: Array<{ id: string; properties: Record<string, string | null> }> = []
  let after: string | undefined
  const pageSize = Math.min(params.limit ?? 100, 100)

  for (let page = 0; page < 50; page++) {
    if (page > 0) await rateLimitPause()

    const body: Record<string, unknown> = {
      properties: params.properties,
      limit: pageSize,
    }
    if (params.filterGroups) body.filterGroups = params.filterGroups
    if (after) body.after = after

    const res = await hubspotFetch('/crm/v3/objects/tickets/search', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    const data = (await res.json()) as {
      total: number
      results: Array<{ id: string; properties: Record<string, string | null> }>
      paging?: { next?: { after?: string } }
    }

    for (const r of data.results ?? []) {
      all.push(r)
    }

    const nextAfter = data.paging?.next?.after
    if (!nextAfter) break
    after = nextAfter
  }

  return all
}

/**
 * Search all companies in HubSpot that match one of the "live customer" true values.
 * Returns company IDs.
 */
export async function hubspotSearchLiveCustomerCompanyIds(params: {
  propertyName: string
  trueValues: string[]
}): Promise<string[]> {
  if (!params.propertyName || params.trueValues.length === 0) return []

  const ids: string[] = []

  // Search per true-value with throttling to avoid HubSpot rate limits.
  let callCount = 0
  for (const val of params.trueValues) {
    let after: string | undefined
    for (let page = 0; page < 20; page++) {
      if (callCount > 0) await rateLimitPause()
      callCount++
      const body: Record<string, unknown> = {
        filterGroups: [
          {
            filters: [
              {
                propertyName: params.propertyName,
                operator: 'EQ',
                value: val,
              },
            ],
          },
        ],
        properties: [params.propertyName],
        limit: 100,
      }
      if (after) body.after = after

      const res = await hubspotFetch('/crm/v3/objects/companies/search', {
        method: 'POST',
        body: JSON.stringify(body),
      })

      const data = (await res.json()) as {
        results: Array<{ id: string }>
        paging?: { next?: { after?: string } }
      }

      for (const r of data.results ?? []) {
        if (r?.id) ids.push(r.id)
      }

      const nextAfter = data.paging?.next?.after
      if (!nextAfter) break
      after = nextAfter
    }
  }

  return Array.from(new Set(ids))
}

/* ------------------------------------------------------------------ */
/*  Batch-read ticket → company associations (v4 API)                */
/* ------------------------------------------------------------------ */

/**
 * Given an array of ticket IDs, returns a Map<ticketId, companyId[]>
 * using the HubSpot v4 batch associations endpoint.  Requests are
 * chunked into groups of 100 (API limit) with a rateLimitPause
 * between each chunk.
 */
export async function hubspotBatchReadTicketCompanyAssociations(
  ticketIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  if (ticketIds.length === 0) return map

  const CHUNK = 100
  for (let i = 0; i < ticketIds.length; i += CHUNK) {
    if (i > 0) await rateLimitPause()

    const chunk = ticketIds.slice(i, i + CHUNK)
    const res = await hubspotFetch(
      '/crm/v4/associations/tickets/companies/batch/read',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: chunk.map((id) => ({ id })),
        }),
        timeout: 15_000,
      },
    )

    if (!res.ok) {
      console.error(
        `[hubspot] batch associations read failed (${res.status})`,
        await res.text().catch(() => ''),
      )
      continue // skip chunk rather than fail entirely
    }

    const data = (await res.json()) as {
      results: Array<{
        from: { id: string }
        to: Array<{ toObjectId: number | string }>
      }>
    }

    for (const result of data.results ?? []) {
      const ticketId = result.from?.id
      if (!ticketId) continue
      const companyIds = (result.to ?? []).map((t) => String(t.toObjectId))
      if (companyIds.length > 0) {
        map.set(ticketId, companyIds)
      }
    }
  }

  return map
}
