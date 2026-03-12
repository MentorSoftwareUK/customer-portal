import type { FastifyPluginAsync } from 'fastify'
import { requireAdmin } from '../auth/requireAdmin'
import { env } from '../env'
import { getDb } from '../db'
import { z } from 'zod'
import * as cheerio from 'cheerio'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScrapedProvider = {
  companyNumber: string | null
  name: string
  companyType: string | null
  sicCodes: string[]
  registeredAddress: string | null
  website: string | null
  phone: string | null
  email: string | null
  employeeEstimate: string | null
  incorporatedDate: string | null
  companyStatus: string | null
  accountsCategory: string | null
  providerCategory: string | null
  source: string
  scrapedAt: string
  contactScrapedAt: string | null
  region: string | null
}

const COLLECTION = 'scraped_providers'

// ─── SIC codes relevant to children's homes / supported accommodation ─────────

const PROVIDER_SIC_CODES: Record<string, string> = {
  '87100': 'Residential nursing care',
  '87200': 'Residential care (learning disabilities / mental health)',
  '87300': 'Residential care (elderly and disabled)',
  '87900': 'Other residential care',
  '88910': 'Child day-care activities',
  '88990': 'Other social work without accommodation',
}

const DEFAULT_SIC_CODES = ['87900', '87100', '87200']

// ─── UK regions for systematic scraping ───────────────────────────────────────

const UK_REGIONS: Record<string, string> = {
  'east-midlands': 'East Midlands',
  'east-of-england': 'East of England',
  'london': 'London',
  'north-east': 'North East',
  'north-west': 'North West',
  'south-east': 'South East',
  'south-west': 'South West',
  'west-midlands': 'West Midlands',
  'yorkshire-and-the-humber': 'Yorkshire and the Humber',
  'wales': 'Wales',
  'scotland': 'Scotland',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PHONE_RE =
  /(?:(?:\+44\s?|0)(?:\d[\s.\-]?){9,10}\d)|(?:(?:\+44\s?|0)\d{2,4}[\s.\-]?\d{3,4}[\s.\-]?\d{3,4})/g
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g

function extractPhoneFromText(text: string): string | null {
  const matches = text.match(PHONE_RE)
  return matches?.[0]?.trim() ?? null
}

function extractEmailFromText(text: string): string | null {
  const matches = text.match(EMAIL_RE)
  if (!matches) return null
  const filtered = matches.filter(
    (e) =>
      !e.includes('example.com') &&
      !e.includes('sentry.io') &&
      !e.includes('schema.org') &&
      !e.includes('wix.com') &&
      !e.includes('wordpress.com') &&
      !e.includes('gov.uk'),
  )
  return filtered[0] ?? null
}

function categoriseProvider(name: string, sicCodes: string[]): string | null {
  const lower = name.toLowerCase()
  if (/children'?s?\s*home/i.test(lower)) return "Children's Home"
  if (/supported\s*(accommodation|living)/i.test(lower)) return 'Supported Accommodation'
  if (/semi[\s-]*independent/i.test(lower)) return 'Semi-Independent Living'
  if (/foster/i.test(lower)) return 'Fostering Agency'
  if (/residential\s*care/i.test(lower)) return 'Residential Care'
  if (/respite/i.test(lower)) return 'Respite Care'

  if (sicCodes.includes('87900')) return 'Residential Care (Other)'
  if (sicCodes.includes('87200')) return 'Residential Care (LD/MH)'
  if (sicCodes.includes('88910')) return 'Child Day-Care'
  return null
}

// ─── Companies House helpers ──────────────────────────────────────────────────

const CH_BASE = 'https://api.company-information.service.gov.uk'

async function chFetch(path: string, apiKey: string): Promise<Response> {
  return fetch(`${CH_BASE}${path}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
    },
  })
}

type CHSearchResult = {
  company_number: string
  title: string
  company_status: string
  company_type: string
  date_of_creation: string
  address?: {
    premises?: string
    address_line_1?: string
    address_line_2?: string
    locality?: string
    region?: string
    postal_code?: string
    country?: string
  }
  sic_codes?: string[]
}

type CHCompanyProfile = {
  company_number: string
  company_name: string
  company_status: string
  type: string
  date_of_creation: string
  registered_office_address?: CHSearchResult['address']
  sic_codes?: string[]
  accounts?: {
    accounting_reference_date?: { day: string; month: string }
    last_accounts?: { type: string }
  }
}

async function chFetchWithRetry(path: string, apiKey: string): Promise<Response> {
  const res = await chFetch(path, apiKey)
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 2000))
    return chFetch(path, apiKey)
  }
  return res
}

async function searchBySicCode(
  apiKey: string,
  sicCode: string,
  startIndex = 0,
  itemsPerPage = 100,
): Promise<{ items: CHSearchResult[]; total: number }> {
  const url = `/advanced-search/companies?sic_codes=${sicCode}&company_status=active&size=${itemsPerPage}&start_index=${startIndex}`
  const res = await chFetchWithRetry(url, apiKey)
  if (!res.ok) return { items: [], total: 0 }
  const data = (await res.json()) as { items?: CHSearchResult[]; total_results?: number }
  return { items: data.items ?? [], total: data.total_results ?? 0 }
}

async function searchCompaniesHouse(
  apiKey: string,
  query: string,
  startIndex = 0,
  itemsPerPage = 50,
): Promise<{ items: CHSearchResult[]; total: number }> {
  const url = `/advanced-search/companies?q=${encodeURIComponent(query)}&size=${itemsPerPage}&start_index=${startIndex}&company_status=active`
  const res = await chFetchWithRetry(url, apiKey)
  if (!res.ok) return { items: [], total: 0 }
  const data = (await res.json()) as { items?: CHSearchResult[]; total_results?: number }
  return { items: data.items ?? [], total: data.total_results ?? 0 }
}

async function getCompanyProfile(
  apiKey: string,
  companyNumber: string,
): Promise<CHCompanyProfile | null> {
  const res = await chFetchWithRetry(`/company/${companyNumber}`, apiKey)
  if (!res.ok) return null
  return (await res.json()) as CHCompanyProfile
}

function formatAddress(addr?: CHSearchResult['address']): string | null {
  if (!addr) return null
  return [addr.premises, addr.address_line_1, addr.address_line_2, addr.locality, addr.region, addr.postal_code]
    .filter(Boolean)
    .join(', ')
}

function inferEmployeesFromAccounts(category?: string): string | null {
  if (!category) return null
  const map: Record<string, string> = {
    micro: '1-10',
    small: '10-49',
    medium: '50-249',
    large: '250+',
    dormant: 'Dormant',
    total_exemption_small: '1-49',
    total_exemption_full: 'Unknown',
    group: '50+',
  }
  return map[category.toLowerCase()] ?? null
}

// ─── Website contact scraper ──────────────────────────────────────────────────

async function scrapeWebsiteContacts(
  url: string,
): Promise<{ phone: string | null; email: string | null; website: string }> {
  const result = { phone: null as string | null, email: null as string | null, website: url }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MentorCP/1.0; +https://mentoruk.com)',
        Accept: 'text/html',
      },
      redirect: 'follow',
    })
    clearTimeout(timeout)

    if (!res.ok) return result
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html')) return result

    const html = await res.text()
    const $ = cheerio.load(html)

    // Extract from mailto: links
    $('a[href^="mailto:"]').each((_, el) => {
      if (!result.email) {
        const href = $(el).attr('href')?.replace('mailto:', '').split('?')[0]?.trim()
        if (href && EMAIL_RE.test(href)) result.email = href
      }
    })

    // Extract from tel: links
    $('a[href^="tel:"]').each((_, el) => {
      if (!result.phone) {
        result.phone = $(el).attr('href')?.replace('tel:', '').trim() ?? null
      }
    })

    // Fall back to page text
    const text = $('body').text()
    if (!result.phone) result.phone = extractPhoneFromText(text)
    if (!result.email) result.email = extractEmailFromText(text)

    // Try contact page if still missing info
    if (!result.phone || !result.email) {
      const contactLink = $('a[href*="contact"]').first().attr('href')
      if (contactLink) {
        try {
          const contactUrl = new URL(contactLink, url).toString()
          if (contactUrl !== url) {
            const ctrl2 = new AbortController()
            const t2 = setTimeout(() => ctrl2.abort(), 6000)
            const contactRes = await fetch(contactUrl, {
              signal: ctrl2.signal,
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; MentorCP/1.0; +https://mentoruk.com)',
                Accept: 'text/html',
              },
              redirect: 'follow',
            })
            clearTimeout(t2)

            if (contactRes.ok) {
              const contactHtml = await contactRes.text()
              const $c = cheerio.load(contactHtml)
              if (!result.email) {
                $c('a[href^="mailto:"]').each((_, el) => {
                  if (!result.email) {
                    const href = $c(el).attr('href')?.replace('mailto:', '').split('?')[0]?.trim()
                    if (href && EMAIL_RE.test(href)) result.email = href
                  }
                })
              }
              if (!result.phone) {
                $c('a[href^="tel:"]').each((_, el) => {
                  if (!result.phone) {
                    result.phone = $c(el).attr('href')?.replace('tel:', '').trim() ?? null
                  }
                })
              }
              const contactText = $c('body').text()
              if (!result.phone) result.phone = extractPhoneFromText(contactText)
              if (!result.email) result.email = extractEmailFromText(contactText)
            }
          }
        } catch {
          // ignore contact page errors
        }
      }
    }
  } catch {
    // timeout or fetch error
  }

  return result
}

// ─── Request schemas ──────────────────────────────────────────────────────────

const ScrapeQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  sicCodes: z.string().trim().optional(),
  pages: z.coerce.number().int().min(1).max(10).optional(),
  enrichContacts: z.enum(['true', 'false']).optional(),
})

const ProvidersQuerySchema = z.object({
  search: z.string().trim().optional(),
  category: z.string().trim().optional(),
  region: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

// ─── Plugin ───────────────────────────────────────────────────────────────────

export const adminProviderScraperRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAdmin)

  // ── GET /providers — list stored providers ──────────────────────────────────
  app.get('/providers', async (request, reply) => {
    const db = await getDb()
    if (!db) return reply.status(503).send({ error: 'Database not available' })

    const parsed = ProvidersQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const { search, category, region, page = 1, limit = 100 } = parsed.data
    const filter: Record<string, any> = {}

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { registeredAddress: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { companyNumber: { $regex: search, $options: 'i' } },
      ]
    }
    if (category) filter.providerCategory = category
    if (region) filter.registeredAddress = { $regex: region, $options: 'i' }

    const col = db.collection(COLLECTION)
    const [items, total] = await Promise.all([
      col.find(filter).sort({ scrapedAt: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
      col.countDocuments(filter),
    ])

    return { items, total, page, limit }
  })

  // ── GET /stats — overview counts ───────────────────────────────────────────
  app.get('/stats', async (_request, reply) => {
    const db = await getDb()
    if (!db) return reply.status(503).send({ error: 'Database not available' })

    const col = db.collection(COLLECTION)
    const [total, withEmail, withPhone, categories] = await Promise.all([
      col.countDocuments(),
      col.countDocuments({ email: { $ne: null } }),
      col.countDocuments({ phone: { $ne: null } }),
      col.aggregate([
        { $group: { _id: '$providerCategory', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).toArray(),
    ])

    return {
      total,
      withEmail,
      withPhone,
      categories: categories.map((c) => ({ category: c._id ?? 'Uncategorised', count: c.count })),
    }
  })

  // ── POST /scrape — run Companies House search + optional contact enrichment ─
  app.post('/scrape', async (request, reply) => {
    const chApiKey = env.COMPANIES_HOUSE_API_KEY
    if (!chApiKey) {
      return reply.status(503).send({
        error: 'Companies House API key not configured. Set COMPANIES_HOUSE_API_KEY in .env (free at https://developer.company-information.service.gov.uk)',
      })
    }

    const db = await getDb()
    if (!db) return reply.status(503).send({ error: 'Database not available' })

    const parsed = ScrapeQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const { q: customQuery, sicCodes: sicCodesRaw, pages = 3, enrichContacts: enrichRaw } = parsed.data
    const enrichContacts = enrichRaw !== 'false'
    const sicCodes = sicCodesRaw
      ? sicCodesRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : DEFAULT_SIC_CODES

    const col = db.collection(COLLECTION)
    const allResults: ScrapedProvider[] = []
    const seenCompanyNumbers = new Set<string>()

    // Load existing company numbers to skip duplicates
    const existingNumbers = await col.distinct('companyNumber')
    for (const n of existingNumbers) if (n) seenCompanyNumbers.add(n)

    try {
      // Strategy 1: Search by SIC codes
      for (const sic of sicCodes) {
        for (let page = 0; page < pages; page++) {
          const startIndex = page * 100
          const data = await searchBySicCode(chApiKey, sic, startIndex, 100)
          if (!data.items.length) break

          for (const item of data.items) {
            if (!item.company_number || seenCompanyNumbers.has(item.company_number)) continue
            seenCompanyNumbers.add(item.company_number)

            allResults.push({
              companyNumber: item.company_number,
              name: item.title,
              companyType: item.company_type ?? null,
              sicCodes: item.sic_codes ?? [sic],
              registeredAddress: formatAddress(item.address),
              website: null,
              phone: null,
              email: null,
              employeeEstimate: null,
              incorporatedDate: item.date_of_creation ?? null,
              companyStatus: item.company_status ?? null,
              accountsCategory: null,
              providerCategory: categoriseProvider(item.title, item.sic_codes ?? [sic]),
              source: 'companies-house',
              scrapedAt: new Date().toISOString(),
              contactScrapedAt: null,
              region: item.address?.region ?? item.address?.locality ?? null,
            })
          }

          if (page < pages - 1) await new Promise((r) => setTimeout(r, 200))
        }
      }

      // Strategy 2: Keyword search if provided
      if (customQuery) {
        for (let page = 0; page < Math.min(pages, 5); page++) {
          const startIndex = page * 50
          const data = await searchCompaniesHouse(chApiKey, customQuery, startIndex, 50)
          if (!data.items.length) break

          for (const item of data.items) {
            if (!item.company_number || seenCompanyNumbers.has(item.company_number)) continue
            seenCompanyNumbers.add(item.company_number)

            allResults.push({
              companyNumber: item.company_number,
              name: item.title,
              companyType: item.company_type ?? null,
              sicCodes: item.sic_codes ?? [],
              registeredAddress: formatAddress(item.address),
              website: null,
              phone: null,
              email: null,
              employeeEstimate: null,
              incorporatedDate: item.date_of_creation ?? null,
              companyStatus: item.company_status ?? null,
              accountsCategory: null,
              providerCategory: categoriseProvider(item.title, item.sic_codes ?? []),
              source: 'companies-house',
              scrapedAt: new Date().toISOString(),
              contactScrapedAt: null,
              region: item.address?.region ?? item.address?.locality ?? null,
            })
          }

          if (page < pages - 1) await new Promise((r) => setTimeout(r, 200))
        }
      }

      // Enrich a batch with company profiles for employee estimates
      const toEnrich = allResults.slice(0, 50)
      for (let i = 0; i < toEnrich.length; i++) {
        const provider = toEnrich[i]
        if (!provider.companyNumber) continue
        try {
          const profile = await getCompanyProfile(chApiKey, provider.companyNumber)
          if (profile) {
            const acctType = profile.accounts?.last_accounts?.type
            provider.accountsCategory = acctType ?? null
            provider.employeeEstimate = inferEmployeesFromAccounts(acctType ?? undefined)
            if (profile.sic_codes?.length) provider.sicCodes = profile.sic_codes
          }
        } catch { /* skip */ }
        if (i < toEnrich.length - 1) await new Promise((r) => setTimeout(r, 120))
      }

      // Upsert all results into MongoDB
      let newCount = 0
      let duplicatesSkipped = 0
      for (const provider of allResults) {
        if (!provider.companyNumber) continue
        const result = await col.updateOne(
          { companyNumber: provider.companyNumber },
          { $setOnInsert: provider },
          { upsert: true },
        )
        if (result.upsertedCount) newCount++
        else duplicatesSkipped++
      }

      // Optionally scrape websites for contact details
      let contactsEnriched = 0
      if (enrichContacts) {
        const needContacts = await col.find({ contactScrapedAt: null, companyNumber: { $ne: null } }).limit(20).toArray()

        for (const provider of needContacts) {
          const slug = provider.name
            .toLowerCase()
            .replace(/\blimited\b|\bltd\b|\bcic\b/gi, '')
            .trim()
            .replace(/[^a-z0-9]+/g, '')

          const guessUrls = [
            `https://www.${slug}.co.uk`,
            `https://www.${slug}.com`,
            `https://${slug}.co.uk`,
          ]

          let found = false
          for (const url of guessUrls) {
            try {
              const result = await scrapeWebsiteContacts(url)
              if (result.phone || result.email) {
                await col.updateOne(
                  { companyNumber: provider.companyNumber },
                  { $set: { website: url, phone: result.phone, email: result.email, contactScrapedAt: new Date().toISOString() } },
                )
                contactsEnriched++
                found = true
                break
              }
            } catch { /* next */ }
          }

          if (!found) {
            await col.updateOne(
              { companyNumber: provider.companyNumber },
              { $set: { contactScrapedAt: new Date().toISOString() } },
            )
          }
        }
      }

      const totalStored = await col.countDocuments()
      return { scraped: allResults.length, newCompanies: newCount, duplicatesSkipped, contactsEnriched, totalInDatabase: totalStored }
    } catch (err: any) {
      request.log.error(err, 'Provider scrape error')
      return reply.status(502).send({ error: err.message ?? 'Scrape failed' })
    }
  })

  // ── POST /enrich-contacts — batch scrape websites for contact info ──────────
  app.post('/enrich-contacts', async (_request, reply) => {
    const db = await getDb()
    if (!db) return reply.status(503).send({ error: 'Database not available' })

    const col = db.collection(COLLECTION)
    const needContacts = await col.find({ contactScrapedAt: null, companyNumber: { $ne: null } }).limit(30).toArray()

    let enriched = 0
    let attempted = 0

    for (const provider of needContacts) {
      attempted++
      const slug = provider.name
        .toLowerCase()
        .replace(/\blimited\b|\bltd\b|\bcic\b/gi, '')
        .trim()
        .replace(/[^a-z0-9]+/g, '')

      const guessUrls = [
        `https://www.${slug}.co.uk`,
        `https://www.${slug}.com`,
        `https://${slug}.co.uk`,
      ]

      let found = false
      for (const url of guessUrls) {
        try {
          const result = await scrapeWebsiteContacts(url)
          if (result.phone || result.email) {
            await col.updateOne(
              { _id: provider._id },
              { $set: { website: url, phone: result.phone, email: result.email, contactScrapedAt: new Date().toISOString() } },
            )
            enriched++
            found = true
            break
          }
        } catch { /* next */ }
      }

      if (!found) {
        await col.updateOne(
          { _id: provider._id },
          { $set: { contactScrapedAt: new Date().toISOString() } },
        )
      }
    }

    return { attempted, enriched, remaining: await col.countDocuments({ contactScrapedAt: null }) }
  })

  // ── DELETE /providers/:companyNumber — remove a false positive ──────────────
  app.delete('/providers/:companyNumber', async (request, reply) => {
    const db = await getDb()
    if (!db) return reply.status(503).send({ error: 'Database not available' })
    const { companyNumber } = request.params as { companyNumber: string }
    await db.collection(COLLECTION).deleteOne({ companyNumber })
    return { ok: true }
  })

  // ── GET /sic-codes — available SIC codes for UI ────────────────────────────
  app.get('/sic-codes', async () => {
    return { sicCodes: PROVIDER_SIC_CODES, defaults: DEFAULT_SIC_CODES }
  })

  // ── GET /regions — UK regions for UI ───────────────────────────────────────
  app.get('/regions', async () => {
    return { regions: UK_REGIONS }
  })

  // ── GET /export — CSV download ─────────────────────────────────────────────
  app.get('/export', async (_request, reply) => {
    const db = await getDb()
    if (!db) return reply.status(503).send({ error: 'Database not available' })

    const items = await db.collection(COLLECTION).find().sort({ name: 1 }).toArray()

    const headers = [
      'Company Number', 'Company Name', 'Category', 'Status', 'Registered Address',
      'Region', 'Phone', 'Email', 'Website', 'Employees (Est.)', 'Incorporated',
      'SIC Codes', 'Accounts Category', 'Source', 'Scraped At',
    ]

    const rows = items.map((r) =>
      [
        r.companyNumber ?? '', (r.name ?? '').replace(/"/g, '""'), r.providerCategory ?? '',
        r.companyStatus ?? '', (r.registeredAddress ?? '').replace(/"/g, '""'), r.region ?? '',
        r.phone ?? '', r.email ?? '', r.website ?? '', r.employeeEstimate ?? '',
        r.incorporatedDate ?? '', (r.sicCodes ?? []).join('; '), r.accountsCategory ?? '',
        r.source ?? '', r.scrapedAt ?? '',
      ].map((v) => `"${v}"`).join(','),
    )

    const csv = [headers.join(','), ...rows].join('\n')
    reply.header('Content-Type', 'text/csv')
    reply.header('Content-Disposition', `attachment; filename="providers-${new Date().toISOString().slice(0, 10)}.csv"`)
    return csv
  })
}
