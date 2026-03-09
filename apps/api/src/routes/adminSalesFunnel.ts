import type { FastifyPluginAsync } from 'fastify'
import { requireAdmin } from '../auth/requireAdmin'
import { env } from '../env'

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type SalesFunnelDto = {
  month: string // e.g. "2026-02"
  /** Total form submissions across all tracked forms. */
  formSubmissions: number
  /** Leads created in the lead pipeline (excl. disqualified). */
  leads: number
  /** Leads that reached SQL stage or beyond (Discovery Call Made+). */
  sql: number
  /** Leads that reached Demo Completed or beyond. */
  demos: number
  /** Per-form breakdown: submissions + MQLs (leads traceable to this form). */
  perForm: Array<{
    formName: string
    submissions: number
    mqls: number
  }>
  /** Breakdown by current lead pipeline stage. */
  byStage: Array<{
    stageId: string
    label: string
    count: number
    order: number
  }>
}

/* ------------------------------------------------------------------ */
/*  HubSpot helpers                                                   */
/* ------------------------------------------------------------------ */

const HUBSPOT_BASE = 'https://api.hubapi.com'

async function hsFetch(path: string, init?: RequestInit) {
  const token = env.HUBSPOT_PRIVATE_APP_TOKEN
  if (!token) throw new Error('Missing HUBSPOT_PRIVATE_APP_TOKEN')

  const res = await fetch(`${HUBSPOT_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HubSpot ${res.status}: ${text}`)
  }
  return res
}

/* ------------------------------------------------------------------ */
/*  Tracked forms                                                     */
/* ------------------------------------------------------------------ */

const TRACKED_FORMS = [
  { id: 'b189dcc1-fe5a-40a6-b016-5844ec22f082', name: 'Self Scheduling Form Map' },
  { id: '3bdbd33d-bf01-47a2-8020-cc81c353a3be', name: 'Ofsted Registration Checklist' },
  { id: '68e78eba-b6a5-4900-8f59-613a0aec400c', name: 'Reg 32 template download' },
  { id: '2e2ce646-a095-46a9-9cc9-94bfdec91dc2', name: 'New Site - Contact' },
]

type FormSubmission = { submittedAt: number; email?: string }

/**
 * Fetch form submissions for a single form in a time range.
 * Uses the v1 submissions endpoint (paginated).
 */
async function hsFormSubmissions(
  formId: string,
  startMs: number,
  endMs: number,
): Promise<FormSubmission[]> {
  const results: FormSubmission[] = []
  let after: string | undefined
  const MAX_PAGES = 10

  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ limit: '50' })
    if (after) qs.set('after', after)

    const res = await hsFetch(
      `/form-integrations/v1/submissions/forms/${formId}?${qs.toString()}`,
    )
    const data = (await res.json()) as {
      results: Array<{
        submittedAt: number
        values: Array<{ name: string; value: string }>
      }>
      paging?: { next?: { after: string } }
    }

    for (const sub of data.results ?? []) {
      if (sub.submittedAt < startMs) continue // past our window
      if (sub.submittedAt >= endMs) continue
      const emailField = sub.values?.find((v) => v.name === 'email')
      results.push({
        submittedAt: sub.submittedAt,
        email: emailField?.value?.toLowerCase(),
      })
    }

    if (!data.paging?.next?.after) break
    // Stop paginating if we've gone past our window
    const last = data.results[data.results.length - 1]
    if (last && last.submittedAt < startMs) break
    after = data.paging.next.after
  }

  return results
}

/* ------------------------------------------------------------------ */
/*  Lead pipeline                                                     */
/* ------------------------------------------------------------------ */

type HSLead = {
  id: string
  createdAt: string
  properties: Record<string, string | null>
  associations?: {
    contacts?: {
      results: Array<{ id: string; type: string }>
    }
  }
}

/**
 * Paginate through ALL leads, requesting contact associations too.
 */
async function hsListAllLeads(properties: string[]): Promise<HSLead[]> {
  const results: HSLead[] = []
  let after: string | undefined
  const MAX_PAGES = 20

  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ limit: '100' })
    for (const p of properties) qs.append('properties', p)
    qs.append('associations', 'contacts')
    if (after) qs.set('after', after)

    const res = await hsFetch(`/crm/v3/objects/leads?${qs.toString()}`)
    const data = (await res.json()) as {
      results: HSLead[]
      paging?: { next?: { after: string } }
    }

    results.push(...(data.results ?? []))
    if (!data.paging?.next?.after) break
    after = data.paging.next.after
  }

  return results
}

/**
 * Batch-read contact emails for a set of contact IDs.
 */
async function hsBatchContactEmails(
  contactIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>() // contactId → email
  const BATCH = 100

  for (let i = 0; i < contactIds.length; i += BATCH) {
    const batch = contactIds.slice(i, i + BATCH)
    const res = await hsFetch('/crm/v3/objects/contacts/batch/read', {
      method: 'POST',
      body: JSON.stringify({
        inputs: batch.map((id) => ({ id })),
        properties: ['email'],
      }),
    })
    const data = (await res.json()) as {
      results: Array<{ id: string; properties: { email?: string } }>
    }
    for (const c of data.results ?? []) {
      if (c.properties.email) {
        map.set(c.id, c.properties.email.toLowerCase())
      }
    }
  }

  return map
}

/* ------------------------------------------------------------------ */
/*  Lead pipeline stage definitions                                   */
/* ------------------------------------------------------------------ */

const LEAD_STAGES: Array<{ id: string; label: string; order: number }> = [
  { id: 'new-stage-id', label: 'New Enquiry', order: 1 },
  { id: 'attempting-stage-id', label: 'Attempting to contact', order: 2 },
  { id: 'connected-stage-id', label: 'Connected', order: 3 },
  { id: '1701461197', label: 'Discovery Call Made', order: 4 },
  { id: '1701461226', label: 'Demo Scheduled', order: 5 },
  { id: '1701461227', label: 'Demo Completed', order: 6 },
  { id: '1701461228', label: 'Second Demo', order: 7 },
  { id: 'qualified-stage-id', label: 'Qualified', order: 8 },
  { id: 'unqualified-stage-id', label: 'Disqualified', order: 9 },
]

const STAGE_MAP = new Map(LEAD_STAGES.map((s) => [s.id, s]))
const SQL_THRESHOLD_ORDER = 4
const DEMO_THRESHOLD_ORDER = 6

function stageOrder(stageId: string): number {
  return STAGE_MAP.get(stageId)?.order ?? 0
}

/* ------------------------------------------------------------------ */
/*  Cache                                                             */
/* ------------------------------------------------------------------ */

const cache = new Map<string, { ts: number; data: SalesFunnelDto }>()
const CACHE_TTL_MS = 5 * 60_000

/* ------------------------------------------------------------------ */
/*  Route                                                             */
/* ------------------------------------------------------------------ */

export const adminSalesFunnelRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const ok = await requireAdmin(req, reply)
    if (!ok) return reply
  })

  app.get<{ Querystring: { month?: string } }>('/', async (req, reply) => {
    if (!env.HUBSPOT_PRIVATE_APP_TOKEN) {
      return reply.status(503).send({ error: 'hubspot_not_configured' })
    }

    const now = new Date()
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const monthParam =
      req.query.month ??
      `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`

    if (!/^\d{4}-\d{2}$/.test(monthParam)) {
      return reply.status(400).send({ error: 'invalid_month', message: 'Use format YYYY-MM' })
    }

    const cached = cache.get(monthParam)
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return { funnel: cached.data }
    }

    const [year, mon] = monthParam.split('-').map(Number)
    const monthStart = `${year}-${String(mon).padStart(2, '0')}-01`
    const nextMonth =
      mon === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(mon + 1).padStart(2, '0')}-01`
    const startMs = new Date(`${monthStart}T00:00:00.000Z`).getTime()
    const endMs = new Date(`${nextMonth}T00:00:00.000Z`).getTime()

    try {
      /* ---------- 1. Form submissions ---------- */
      const formResults = await Promise.all(
        TRACKED_FORMS.map(async (f) => {
          const subs = await hsFormSubmissions(f.id, startMs, endMs)
          const emails = new Set(subs.map((s) => s.email).filter(Boolean) as string[])
          return { name: f.name, submissions: subs.length, emails }
        }),
      )

      const totalFormSubmissions = formResults.reduce((s, f) => s + f.submissions, 0)

      /* ---------- 2. Lead pipeline ---------- */
      const allLeads = await hsListAllLeads(['hs_pipeline_stage', 'hs_createdate'])

      const monthLeads = allLeads.filter((l) => {
        const d = l.properties.hs_createdate ?? l.createdAt ?? ''
        return d >= monthStart && d < nextMonth
      })

      // Collect unique contact IDs from lead associations
      const leadContactIds = new Map<string, string[]>() // contactId → leadIds
      for (const l of monthLeads) {
        const contacts = l.associations?.contacts?.results ?? []
        for (const c of contacts) {
          const arr = leadContactIds.get(c.id) ?? []
          arr.push(l.id)
          leadContactIds.set(c.id, arr)
        }
      }

      // Batch-fetch contact emails
      const contactEmails = leadContactIds.size > 0
        ? await hsBatchContactEmails([...leadContactIds.keys()])
        : new Map<string, string>()

      // Build email → lead mapping (for MQL matching)
      const emailToLeadIds = new Map<string, Set<string>>()
      for (const [contactId, leadIds] of leadContactIds) {
        const email = contactEmails.get(contactId)
        if (email) {
          const existing = emailToLeadIds.get(email) ?? new Set()
          for (const lid of leadIds) existing.add(lid)
          emailToLeadIds.set(email, existing)
        }
      }

      /* ---------- 3. MQLs per form ---------- */
      const perForm = formResults.map((f) => {
        let mqls = 0
        const counted = new Set<string>()
        for (const email of f.emails) {
          const leadIds = emailToLeadIds.get(email)
          if (leadIds) {
            for (const lid of leadIds) {
              if (!counted.has(lid)) {
                counted.add(lid)
                mqls++
              }
            }
          }
        }
        return { formName: f.name, submissions: f.submissions, mqls }
      })

      /* ---------- 4. Pipeline aggregates ---------- */
      const activeLeads = monthLeads.filter(
        (l) => l.properties.hs_pipeline_stage !== 'unqualified-stage-id',
      )
      const leads = activeLeads.length

      const sql = activeLeads.filter(
        (l) => stageOrder(l.properties.hs_pipeline_stage ?? '') >= SQL_THRESHOLD_ORDER,
      ).length

      const demos = activeLeads.filter(
        (l) => stageOrder(l.properties.hs_pipeline_stage ?? '') >= DEMO_THRESHOLD_ORDER,
      ).length

      // Per-stage breakdown
      const stageCounts = new Map<string, number>()
      for (const l of monthLeads) {
        const sid = l.properties.hs_pipeline_stage ?? 'unknown'
        stageCounts.set(sid, (stageCounts.get(sid) ?? 0) + 1)
      }

      const byStage = LEAD_STAGES
        .map((s) => ({
          stageId: s.id,
          label: s.label,
          count: stageCounts.get(s.id) ?? 0,
          order: s.order,
        }))
        .filter((s) => s.count > 0)

      const funnel: SalesFunnelDto = {
        month: monthParam,
        formSubmissions: totalFormSubmissions,
        leads,
        sql,
        demos,
        perForm,
        byStage,
      }
      cache.set(monthParam, { ts: Date.now(), data: funnel })
      return { funnel }
    } catch (e: any) {
      console.error('[admin-sales-funnel]', e)
      return reply
        .status(502)
        .send({ error: 'hubspot_error', message: e?.message ?? 'Unknown error' })
    }
  })
}
