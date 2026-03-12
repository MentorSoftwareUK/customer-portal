import type { FastifyPluginAsync } from 'fastify'
import { requireAdmin } from '../auth/requireAdmin'
import { env } from '../env'
import { z } from 'zod'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScrapedProvider = {
  name: string
  website: string | null
  snippet: string | null
  phone: string | null
  email: string | null
  address: string | null
  employeeEstimate: string | null
  companyType: string | null
  source: string
}

type GoogleSearchItem = {
  title: string
  link: string
  snippet?: string
  pagemap?: {
    metatags?: Record<string, string>[]
    localbusiness?: Record<string, string>[]
    organization?: Record<string, string>[]
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PHONE_RE =
  /(?:(?:\+44\s?|0)(?:\d[\s.-]?){9,10}\d)|(?:(?:\+44\s?|0)\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4})/g
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g

function extractPhoneFromText(text: string): string | null {
  const matches = text.match(PHONE_RE)
  return matches?.[0]?.trim() ?? null
}

function extractEmailFromText(text: string): string | null {
  const matches = text.match(EMAIL_RE)
  if (!matches) return null
  // Filter out common false positives
  const filtered = matches.filter(
    (e) =>
      !e.includes('example.com') &&
      !e.includes('sentry.io') &&
      !e.includes('schema.org'),
  )
  return filtered[0] ?? null
}

function cleanCompanyName(raw: string): string {
  // Remove trailing " - Home", " | Official Site", etc.
  return raw
    .replace(/\s*[-|–]\s*(home|official|about|contact|care|services).*$/i, '')
    .replace(/\s*\.\.\.\s*$/, '')
    .trim()
}

async function fetchGoogleResults(
  query: string,
  apiKey: string,
  cseId: string,
  start = 1,
): Promise<GoogleSearchItem[]> {
  const url = new URL('https://www.googleapis.com/customsearch/v1')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('cx', cseId)
  url.searchParams.set('q', query)
  url.searchParams.set('num', '10')
  url.searchParams.set('start', String(start))
  url.searchParams.set('gl', 'uk')

  const res = await fetch(url.toString())
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Google API ${res.status}: ${body}`)
  }
  const data = (await res.json()) as { items?: GoogleSearchItem[] }
  return data.items ?? []
}

function parseProviderFromResult(item: GoogleSearchItem): ScrapedProvider {
  const meta = item.pagemap?.metatags?.[0] ?? {}
  const biz = item.pagemap?.localbusiness?.[0]
  const org = item.pagemap?.organization?.[0]

  const combinedText = [item.snippet, item.title, meta['og:description']].filter(Boolean).join(' ')

  const phone =
    biz?.telephone ??
    org?.telephone ??
    meta['business:contact_data:phone_number'] ??
    extractPhoneFromText(combinedText)

  const email =
    biz?.email ??
    org?.email ??
    meta['business:contact_data:email'] ??
    extractEmailFromText(combinedText)

  const address =
    biz?.address ?? org?.address ?? meta['business:contact_data:street_address'] ?? null

  // Try to infer company size from meta or snippet
  let employeeEstimate: string | null = null
  const empMatch = combinedText.match(
    /(\d[\d,]*)\s*(?:\+\s*)?(?:employees?|staff|workers|team\s*(?:members?)?)/i,
  )
  if (empMatch) {
    employeeEstimate = empMatch[1].replace(/,/g, '')
  }

  let companyType: string | null = null
  const lower = combinedText.toLowerCase()
  if (/children'?s?\s*home/i.test(lower)) companyType = "Children's Home"
  else if (/supported\s*(?:accommodation|living)/i.test(lower))
    companyType = 'Supported Accommodation'
  else if (/semi[\s-]*independent/i.test(lower))
    companyType = 'Semi-Independent Living'
  else if (/foster/i.test(lower)) companyType = 'Fostering Agency'
  else if (/residential\s*care/i.test(lower)) companyType = 'Residential Care'

  return {
    name: cleanCompanyName(item.title),
    website: item.link ?? null,
    snippet: item.snippet ?? null,
    phone,
    email,
    address,
    employeeEstimate,
    companyType,
    source: 'google',
  }
}

// ─── Query schema ─────────────────────────────────────────────────────────────

const SearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  region: z.string().trim().max(100).optional(),
  pages: z.coerce.number().int().min(1).max(5).optional(),
})

// ─── Plugin ───────────────────────────────────────────────────────────────────

export const adminProviderScraperRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAdmin)

  app.get('/search', async (request, reply) => {
    const googleApiKey = env.GOOGLE_API_KEY
    const googleCseId = env.GOOGLE_CSE_ID

    if (!googleApiKey || !googleCseId) {
      return reply.status(503).send({
        error:
          'Google Custom Search not configured. Set GOOGLE_API_KEY and GOOGLE_CSE_ID in .env',
      })
    }

    const parsed = SearchQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() })
    }

    const {
      q: customQuery,
      region,
      pages = 2,
    } = parsed.data

    const baseQuery =
      customQuery ||
      "children's homes OR supported accommodation providers UK"
    const query = region ? `${baseQuery} ${region}` : baseQuery

    try {
      const allResults: ScrapedProvider[] = []
      const seenDomains = new Set<string>()

      for (let page = 0; page < pages; page++) {
        const start = page * 10 + 1
        const items = await fetchGoogleResults(query, googleApiKey, googleCseId, start)

        for (const item of items) {
          // Deduplicate by domain
          try {
            const domain = new URL(item.link).hostname.replace(/^www\./, '')
            if (seenDomains.has(domain)) continue
            seenDomains.add(domain)
          } catch {
            // skip invalid URLs
            continue
          }

          allResults.push(parseProviderFromResult(item))
        }
      }

      return {
        query,
        total: allResults.length,
        results: allResults,
      }
    } catch (err: any) {
      request.log.error(err, 'Provider scraper error')
      return reply.status(502).send({ error: err.message ?? 'Search failed' })
    }
  })
}
