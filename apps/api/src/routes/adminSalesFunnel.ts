import type { FastifyPluginAsync } from 'fastify'
import { requireAdmin } from '../auth/requireAdmin'
import { env } from '../env'

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type MonthSummary = {
  month: string
  mqls: number
  sql: number
  demos: number
}

export type SalesFunnelDto = {
  month: string
  mqls: number
  sql: number
  demos: number
  perForm: Array<{
    formName: string
    submissions: number
    sql: number
    demos: number
  }>
  byStage: Array<{
    stageId: string
    label: string
    count: number
    order: number
  }>
  /** Previous month summary for delta comparison. */
  previous: MonthSummary | null
  /** Last 6 months oldest → newest (for sparklines). */
  trend: MonthSummary[]
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

const FORM_SELF_SCHEDULING = {
  id: 'b189dcc1-fe5a-40a6-b016-5844ec22f082',
  name: 'Self Scheduling Form Map',
}
const FORM_CHECKLIST = {
  id: '3bdbd33d-bf01-47a2-8020-cc81c353a3be',
  name: 'Ofsted Registration Checklist',
}
const FORM_REG32 = {
  id: '68e78eba-b6a5-4900-8f59-613a0aec400c',
  name: 'Reg 32 template download',
}
const FORM_CONTACT = {
  id: '2e2ce646-a095-46a9-9cc9-94bfdec91dc2',
  name: 'New Site - Contact',
}

const TRACKED_FORMS = [FORM_SELF_SCHEDULING, FORM_CHECKLIST, FORM_REG32, FORM_CONTACT]

type FormSub = {
  submittedAt: number
  email?: string
  department?: string // only present on contact form
  stage?: string // "What stage are you at?" — self-scheduling form
}

/**
 * Contact stages (internal HubSpot values) that indicate the user can
 * self-schedule a demo. A Self Scheduling form submission with one of
 * these stages counts as a demo automatically.
 */
const SELF_SCHEDULE_DEMO_STAGES = new Set([
  'Just Opened',
  'Single Home',
  'Multi Home',
])

/** Convert epoch-ms to YYYY-MM (UTC). */
function msToMonth(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Fetch form submissions in a time range, capturing email + department.
 */
async function hsFormSubmissions(
  formId: string,
  startMs: number,
  endMs: number,
): Promise<FormSub[]> {
  const results: FormSub[] = []
  let after: string | undefined
  const MAX_PAGES = 20

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
      if (sub.submittedAt < startMs || sub.submittedAt >= endMs) continue
      const vals = new Map(sub.values?.map((v) => [v.name, v.value]))
      results.push({
        submittedAt: sub.submittedAt,
        email: vals.get('email')?.toLowerCase(),
        department: vals.get('department'),
        stage: vals.get('what_stage_are_you_at_'),
      })
    }

    if (!data.paging?.next?.after) break
    const last = data.results[data.results.length - 1]
    if (last && last.submittedAt < startMs) break
    after = data.paging.next.after
  }

  return results
}

/* ------------------------------------------------------------------ */
/*  Contact bot detection                                             */
/* ------------------------------------------------------------------ */

/**
 * Batch-check which emails belong to contacts flagged as bots.
 */
async function hsBatchCheckBots(emails: string[]): Promise<Set<string>> {
  const bots = new Set<string>()
  if (emails.length === 0) return bots

  // Search contacts by email, checking disqualification_reason
  // Use the batch read by email approach
  const BATCH = 100
  for (let i = 0; i < emails.length; i += BATCH) {
    const batch = emails.slice(i, i + BATCH)
    const res = await hsFetch('/crm/v3/objects/contacts/search', {
      method: 'POST',
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'disqualification_reason',
                operator: 'EQ',
                value: 'Bot',
              },
            ],
          },
        ],
        properties: ['email', 'disqualification_reason'],
        limit: 100,
      }),
    })
    const data = (await res.json()) as {
      results: Array<{ properties: { email?: string } }>
    }
    for (const c of data.results ?? []) {
      if (c.properties.email) bots.add(c.properties.email.toLowerCase())
    }
    break // One search gets all bots, no need to batch by email
  }

  return bots
}

/* ------------------------------------------------------------------ */
/*  Lead pipeline: check if email reached Demo Completed+             */
/* ------------------------------------------------------------------ */

type HSLead = {
  id: string
  createdAt: string
  properties: Record<string, string | null>
  associations?: {
    contacts?: { results: Array<{ id: string; type: string }> }
  }
}

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

async function hsBatchContactEmails(
  contactIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
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
      if (c.properties.email) map.set(c.id, c.properties.email.toLowerCase())
    }
  }

  return map
}
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
/** Demo Completed (order 6) or beyond (excl. disqualified). */
const DEMO_THRESHOLD_ORDER = 6

function stageOrder(stageId: string): number {
  return STAGE_MAP.get(stageId)?.order ?? 0
}

/* ------------------------------------------------------------------ */
/*  Per-submission classification                                     */
/* ------------------------------------------------------------------ */

function classifySub(
  formId: string,
  sub: FormSub,
  botEmails: Set<string>,
  emailReachedDemo: (email?: string) => boolean,
): { isSql: boolean; isDemo: boolean } {
  const isBot = sub.email ? botEmails.has(sub.email) : false
  if (formId === FORM_SELF_SCHEDULING.id) {
    if (!isBot) {
      const isDemo =
        emailReachedDemo(sub.email) ||
        SELF_SCHEDULE_DEMO_STAGES.has(sub.stage ?? '')
      return { isSql: true, isDemo }
    }
    return { isSql: false, isDemo: false }
  }
  if (formId === FORM_CONTACT.id) {
    const isSales = (sub.department ?? '').toLowerCase().trim() === 'sales'
    if (isSales && !isBot) return { isSql: true, isDemo: emailReachedDemo(sub.email) }
    return { isSql: false, isDemo: false }
  }
  if (formId === FORM_CHECKLIST.id || formId === FORM_REG32.id) {
    if (emailReachedDemo(sub.email) && !isBot) return { isSql: true, isDemo: true }
    return { isSql: false, isDemo: false }
  }
  return { isSql: false, isDemo: false }
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
    const endMs = new Date(`${nextMonth}T00:00:00.000Z`).getTime()

    try {
      /* ========== 1. Compute 6-month trend window ========== */
      const TREND_COUNT = 6
      const trendMonths: string[] = []
      for (let i = TREND_COUNT - 1; i >= 0; i--) {
        const d = new Date(Date.UTC(year, mon - 1 - i, 1))
        trendMonths.push(
          `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
        )
      }
      const windowStartMs = new Date(Date.UTC(year, mon - TREND_COUNT, 1)).getTime()

      /* ========== 2. Form submissions (6-month window) ========== */
      const formResults = await Promise.all(
        TRACKED_FORMS.map(async (f) => {
          const subs = await hsFormSubmissions(f.id, windowStartMs, endMs)
          return { formId: f.id, name: f.name, subs }
        }),
      )

      /* ========== 3. Build email → demo lookup from lead pipeline ========== */
      const allLeads = await hsListAllLeads(['hs_pipeline_stage', 'hs_createdate'])

      const leadContactIds = new Map<string, string[]>()
      for (const l of allLeads) {
        for (const c of l.associations?.contacts?.results ?? []) {
          const arr = leadContactIds.get(c.id) ?? []
          arr.push(l.id)
          leadContactIds.set(c.id, arr)
        }
      }

      const contactEmails =
        leadContactIds.size > 0
          ? await hsBatchContactEmails([...leadContactIds.keys()])
          : new Map<string, string>()

      const emailMaxStage = new Map<string, number>()
      for (const l of allLeads) {
        const order = stageOrder(l.properties.hs_pipeline_stage ?? '')
        for (const c of l.associations?.contacts?.results ?? []) {
          const email = contactEmails.get(c.id)
          if (email) {
            emailMaxStage.set(email, Math.max(emailMaxStage.get(email) ?? 0, order))
          }
        }
      }

      function emailReachedDemo(email?: string): boolean {
        if (!email) return false
        const order = emailMaxStage.get(email) ?? 0
        return order >= DEMO_THRESHOLD_ORDER && order !== 9
      }

      /* ========== 4. Bot detection ========== */
      const allEmails = formResults.flatMap((f) =>
        f.subs.map((s) => s.email).filter(Boolean),
      ) as string[]
      const botEmails = await hsBatchCheckBots(allEmails)

      /* ========== 5. Per-form detail for selected month ========== */
      const perForm = formResults.map((f) => {
        const monthSubs = f.subs.filter(
          (s) => msToMonth(s.submittedAt) === monthParam,
        )
        let sql = 0
        let demos = 0
        for (const sub of monthSubs) {
          const c = classifySub(f.formId, sub, botEmails, emailReachedDemo)
          if (c.isSql) sql++
          if (c.isDemo) demos++
        }
        return { formName: f.name, submissions: monthSubs.length, sql, demos }
      })

      const totalMqls = perForm.reduce((s, f) => s + f.submissions, 0)
      const totalSql = perForm.reduce((s, f) => s + f.sql, 0)
      const totalDemos = perForm.reduce((s, f) => s + f.demos, 0)

      /* ========== 6. Trend (6-month summaries) ========== */
      const trend: MonthSummary[] = trendMonths.map((m) => {
        let mqls = 0
        let sql = 0
        let demos = 0
        for (const f of formResults) {
          for (const sub of f.subs) {
            if (msToMonth(sub.submittedAt) !== m) continue
            mqls++
            const c = classifySub(f.formId, sub, botEmails, emailReachedDemo)
            if (c.isSql) sql++
            if (c.isDemo) demos++
          }
        }
        return { month: m, mqls, sql, demos }
      })

      const prevIdx = trendMonths.indexOf(monthParam) - 1
      const previous = prevIdx >= 0 ? trend[prevIdx] : null

      /* ========== 7. Lead pipeline stage breakdown (reference) ========== */
      const monthLeads = allLeads.filter((l) => {
        const d = l.properties.hs_createdate ?? l.createdAt ?? ''
        return d >= monthStart && d < nextMonth
      })

      const stageCounts = new Map<string, number>()
      for (const l of monthLeads) {
        const sid = l.properties.hs_pipeline_stage ?? 'unknown'
        stageCounts.set(sid, (stageCounts.get(sid) ?? 0) + 1)
      }

      const byStage = LEAD_STAGES.map((s) => ({
        stageId: s.id,
        label: s.label,
        count: stageCounts.get(s.id) ?? 0,
        order: s.order,
      })).filter((s) => s.count > 0)

      const funnel: SalesFunnelDto = {
        month: monthParam,
        mqls: totalMqls,
        sql: totalSql,
        demos: totalDemos,
        perForm,
        byStage,
        previous,
        trend,
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
