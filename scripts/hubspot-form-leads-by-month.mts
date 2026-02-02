import 'dotenv/config'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const HUBSPOT_BASE_URL = 'https://api.hubapi.com'

const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN
if (!token) {
  console.error('Missing HUBSPOT_PRIVATE_APP_TOKEN in environment.')
  process.exit(1)
}

const targetForms = [
  'Self Scheduling Form Map (DO NOT EDIT)',
  'Download Your Free Ofsted Registration Checklist',
  'New Site - Contact',
  'New website funnel',
]

const formGuidOverridesRaw = process.env.HUBSPOT_FORM_GUIDS

function parseFormGuidOverrides(value: string | undefined) {
  if (!value) return null
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [guid, ...nameParts] = entry.split('|').map((part) => part.trim())
      return {
        guid,
        name: nameParts.join('|') || guid,
      }
    })
    .filter((entry) => entry.guid)

  return entries.length ? entries : null
}

type HubSpotForm = {
  guid: string
  name: string
}

type HubSpotFormV3 = {
  id: string
  guid?: string
  name: string
}

type HubSpotSubmission = {
  submittedAt?: number
}

type HubSpotSubmissionResponse = {
  results?: HubSpotSubmission[]
  hasMore?: boolean
  offset?: number
}

async function hubspotFetch(pathname: string) {
  const res = await fetch(`${HUBSPOT_BASE_URL}${pathname}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const error = new Error(`HubSpot request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`)
    ;(error as Error & { status?: number }).status = res.status
    throw error
  }

  return res
}

async function listFormsV2(): Promise<HubSpotForm[]> {
  const res = await hubspotFetch('/forms/v2/forms')
  return (await res.json()) as HubSpotForm[]
}

async function listFormsV3(): Promise<HubSpotForm[]> {
  const results: HubSpotForm[] = []
  let after: string | undefined

  for (let i = 0; i < 20; i += 1) {
    const qs = new URLSearchParams()
    qs.set('limit', '100')
    if (after) qs.set('after', after)

    const res = await hubspotFetch(`/marketing/v3/forms?${qs.toString()}`)
    const data = (await res.json()) as { results?: HubSpotFormV3[]; paging?: { next?: { after?: string } } }

    for (const form of data.results ?? []) {
      if (!form.guid) continue
      results.push({ guid: form.guid, name: form.name })
    }

    const nextAfter = data.paging?.next?.after
    if (!nextAfter) break
    after = nextAfter
  }

  return results
}

async function listForms(): Promise<HubSpotForm[]> {
  try {
    return await listFormsV2()
  } catch (err) {
    const status = (err as Error & { status?: number }).status
    if (status === 404) {
      return await listFormsV3()
    }
    throw err
  }
}

async function listSubmissionsV2(formGuid: string, since: number) {
  const results: HubSpotSubmission[] = []
  let offset: number | undefined

  for (let i = 0; i < 200; i += 1) {
    const qs = new URLSearchParams()
    qs.set('count', '100')
    qs.set('since', String(since))
    if (offset != null) qs.set('offset', String(offset))

    const res = await hubspotFetch(`/form/v2/forms/${encodeURIComponent(formGuid)}/submissions?${qs.toString()}`)
    const data = (await res.json()) as HubSpotSubmissionResponse
    results.push(...(data.results ?? []))

    if (!data.hasMore || data.offset == null) break
    offset = data.offset
  }

  return results
}

async function listSubmissionsV3(formGuid: string, since: number) {
  const results: HubSpotSubmission[] = []
  let after: string | undefined

  for (let i = 0; i < 200; i += 1) {
    const qs = new URLSearchParams()
    qs.set('limit', '100')
    qs.set('since', String(since))
    if (after) qs.set('after', after)

    const res = await hubspotFetch(`/marketing/v3/forms/${encodeURIComponent(formGuid)}/submissions?${qs.toString()}`)
    const data = (await res.json()) as { results?: HubSpotSubmission[]; paging?: { next?: { after?: string } } }
    results.push(...(data.results ?? []))

    const nextAfter = data.paging?.next?.after
    if (!nextAfter) break
    after = nextAfter
  }

  return results
}

async function listSubmissions(formGuid: string, since: number) {
  try {
    return await listSubmissionsV2(formGuid, since)
  } catch (err) {
    const status = (err as Error & { status?: number }).status
    if (status === 404) {
      return await listSubmissionsV3(formGuid, since)
    }
    throw err
  }
}

function monthKeyUtc(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function buildMonthBuckets(now: Date) {
  const months = [] as string[]
  const buckets = new Map<string, number>()

  for (let i = 11; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const key = monthKeyUtc(date)
    months.push(key)
    buckets.set(key, 0)
  }

  return { months, buckets }
}

async function main() {
  const now = new Date()
  const lastYearStart = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1))
  const since = lastYearStart.getTime()

  const overrideForms = parseFormGuidOverrides(formGuidOverridesRaw)
  const forms = overrideForms ?? (await listForms())
  const targetSet = new Set(targetForms.map((name) => name.toLowerCase()))
  const matchedForms = overrideForms
    ? overrideForms
    : forms.filter((form) => targetSet.has(form.name.toLowerCase()))

  if (matchedForms.length === 0) {
    console.log(
      JSON.stringify(
        {
          window: { from: lastYearStart.toISOString(), to: now.toISOString() },
          error: 'No forms matched the requested names.',
          availableForms: forms.slice(0, 20).map((form) => ({ name: form.name, guid: form.guid })),
        },
        null,
        2,
      ),
    )
    return
  }

  const { months, buckets } = buildMonthBuckets(now)
  const perFormBuckets = new Map<string, Map<string, number>>()

  for (const form of matchedForms) {
    perFormBuckets.set(form.name, new Map(buckets))
  }

  for (const form of matchedForms) {
    const submissions = await listSubmissions(form.guid, since)
    const formBuckets = perFormBuckets.get(form.name)
    if (!formBuckets) continue

    for (const submission of submissions) {
      const submittedAt = submission.submittedAt
      if (!submittedAt) continue
      if (submittedAt < since || submittedAt > now.getTime()) continue
      const key = monthKeyUtc(new Date(submittedAt))
      if (!buckets.has(key)) continue
      buckets.set(key, (buckets.get(key) ?? 0) + 1)
      formBuckets.set(key, (formBuckets.get(key) ?? 0) + 1)
    }
  }

  const totalsByMonth = months.map((month) => ({ month, leads: buckets.get(month) ?? 0 }))
  const totalLeads = totalsByMonth.reduce((sum, row) => sum + row.leads, 0)
  const averageLeadsPerMonth = totalsByMonth.length ? Math.round((totalLeads / totalsByMonth.length) * 10) / 10 : 0

  const perForm = matchedForms.map((form) => {
    const formBuckets = perFormBuckets.get(form.name) ?? new Map()
    return {
      name: form.name,
      guid: form.guid,
      monthly: months.map((month) => ({ month, leads: formBuckets.get(month) ?? 0 })),
      total: months.reduce((sum, month) => sum + (formBuckets.get(month) ?? 0), 0),
    }
  })

  const csvHeader = ['month', 'total', ...matchedForms.map((form) => form.name)]
  const csvRows = months.map((month) => {
    const row = [String(month), String(buckets.get(month) ?? 0)]
    for (const form of matchedForms) {
      const formBuckets = perFormBuckets.get(form.name) ?? new Map()
      row.push(String(formBuckets.get(month) ?? 0))
    }
    return row
      .map((value) => {
        const escaped = value.replace(/"/g, '""')
        return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped
      })
      .join(',')
  })

  const csvPath = resolve(process.cwd(), 'tmp', 'hubspot-form-leads-by-month.csv')
  writeFileSync(csvPath, `${csvHeader.join(',')}\n${csvRows.join('\n')}\n`, 'utf8')

  console.log(
    JSON.stringify(
      {
        window: { from: lastYearStart.toISOString(), to: now.toISOString() },
        matchedForms: matchedForms.map((form) => ({ name: form.name, guid: form.guid })),
        totalLeads,
        averageLeadsPerMonth,
        totalsByMonth,
        perForm,
        csvPath,
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
