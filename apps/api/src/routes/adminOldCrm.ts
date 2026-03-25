import type { FastifyPluginAsync } from 'fastify'
import { requireAdmin } from '../auth/requireAdmin'
import { readFileSync, existsSync } from 'fs'
import { join, sep } from 'path'
import { env } from '../env'

/** Walk up from cwd to find the monorepo root (parent of /apps). */
function repoRoot(): string {
  const cwd = process.cwd()
  const parts = cwd.split(sep)
  const appsIdx = parts.lastIndexOf('apps')
  if (appsIdx > 0) return parts.slice(0, appsIdx).join(sep) || sep
  return cwd
}

/* ================================================================== */
/*  Types                                                             */
/* ================================================================== */

export type HubSpotStatus = 'customer' | 'past_customer' | 'in_pipeline' | 'lead' | 'subscriber' | 'other' | 'not_found'

export type CompaniesHouseStatus = 'active' | 'dissolved' | 'liquidation' | 'administration' | 'voluntary-arrangement' | 'converted-closed' | 'insolvency-proceedings' | 'registered' | 'removed' | 'not_found' | 'unknown' | 'skipped'

export type OldCrmContact = {
  name: string
  company: string
  phone: string
  email: string
  address: string
  postcode: string
  role: string
  provisionType: string
  source: string
  hubspotMatch: HubSpotStatus
  hubspotCompany: string
  hubspotDetail: string   // lifecycle stage or extra context
  chStatus: CompaniesHouseStatus
  chName: string
  chNumber: string
}

/* ================================================================== */
/*  Minimal CSV parser (handles quoted fields)                        */
/* ================================================================== */

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      fields.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

function parseCsvFile(content: string): string[][] {
  return content
    .split(/\r\n|\r|\n/)
    .filter((line) => line.trim().length > 0)
    .map(parseCsvLine)
}

/* ================================================================== */
/*  CSV Parsing                                                       */
/* ================================================================== */

/*
  The old CRM CSVs have no header row. Column mapping (0-indexed):
    [0]  = Address line 1
    [5]  = Company name
    [15] = Secondary email (sometimes populated)
    [17] = First name
    [26] = Role / job title
    [27] = Last name
    [39] = Primary email
    [40] = Phone
    [41] = Postcode
    [52] = Provision type
*/

function parseOldCrmCsv(filePath: string, source: string): OldCrmContact[] {
  let raw: string
  try {
    raw = readFileSync(filePath, 'utf-8')
  } catch {
    return []
  }

  const rows = parseCsvFile(raw)
  const contacts: OldCrmContact[] = []
  for (const r of rows) {
    const g = (i: number) => (i < r.length ? r[i].trim() : '')
    const firstName = g(17)
    const lastName = g(27)
    const company = g(5)

    // Skip rows with no useful data
    if (!firstName && !company) continue

    const name = [firstName, lastName].filter(Boolean).join(' ')
    const email = g(39) || g(15)
    const phone = g(40)

    contacts.push({
      name,
      company,
      phone,
      email,
      address: g(0),
      postcode: g(41),
      role: g(26),
      provisionType: g(52),
      source,
      hubspotMatch: 'not_found',
      hubspotCompany: '',
      hubspotDetail: '',
      chStatus: 'skipped',
      chName: '',
      chNumber: '',
    })
  }

  return contacts
}

/* ================================================================== */
/*  In-memory cache (parsed once)                                     */
/* ================================================================== */

let cachedContacts: OldCrmContact[] | null = null

function getAllContacts(): OldCrmContact[] {
  if (cachedContacts) return cachedContacts

  const dir = join(repoRoot(), 'tmp', 'old crm')
  const all = [
    ...parseOldCrmCsv(join(dir, 'Wants to purchase.csv'), 'Wants to Purchase'),
    ...parseOldCrmCsv(join(dir, 'demo completed.csv'), 'Demo Completed'),
    ...parseOldCrmCsv(join(dir, 'interested in demo.csv'), 'Interested in Demo'),
  ]

  cachedContacts = all
  return all
}

/* ================================================================== */
/*  Companies House lookup                                            */
/* ================================================================== */

const CH_BASE = 'https://api.company-information.service.gov.uk'
const CH_MIN_GAP_MS = 520 // 600 requests / 5 min

async function chSearch(query: string, apiKey: string): Promise<{ items?: Array<{ title: string; company_number: string; company_status: string }> }> {
  // Strip common suffixes that hurt search — CH search works better with just the trading name
  const cleaned = query
    .replace(/\b(ltd|limited|plc|inc|llc|uk|the)\b\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  const url = `${CH_BASE}/search/companies?q=${encodeURIComponent(cleaned)}&items_per_page=5`
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}` },
  })
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 5000))
    return chSearch(query, apiKey)
  }
  if (!res.ok) {
    console.error(`[old-crm] CH search failed for "${cleaned}": ${res.status}`)
    return { items: [] }
  }
  return res.json() as Promise<{ items?: Array<{ title: string; company_number: string; company_status: string }> }>
}

function chNormalise(s: string): string {
  return s.toLowerCase().replace(/\b(ltd|limited|plc|inc|llc|group|uk|the|of|children'?s|childrens)\b/g, '').replace(/[^a-z0-9]/g, '').trim()
}

/** Score how well a CH result matches the CRM name (lower = better). */
function chMatchScore(crmNorm: string, chTitle: string): number {
  const chNorm = chNormalise(chTitle)
  if (chNorm === crmNorm) return 0 // exact
  if (chNorm.startsWith(crmNorm) || crmNorm.startsWith(chNorm)) return 1 // prefix
  if (chNorm.includes(crmNorm) || crmNorm.includes(chNorm)) return 2 // contains

  // Word overlap — count shared words
  const crmWords = new Set(crmNorm.match(/[a-z0-9]+/g) || [])
  const chWords = new Set(chNorm.match(/[a-z0-9]+/g) || [])
  let shared = 0
  for (const w of crmWords) if (chWords.has(w)) shared++
  if (shared === 0) return 99 // no overlap at all
  const overlap = shared / Math.max(crmWords.size, chWords.size)
  return overlap >= 0.5 ? 3 : 10 // decent overlap vs poor
}

async function enrichWithCompaniesHouse(contacts: OldCrmContact[]): Promise<void> {
  const apiKey = env.COMPANIES_HOUSE_API_KEY
  if (!apiKey) return

  // Deduplicate company names
  const companySet = new Map<string, string>() // normalised -> original
  for (const c of contacts) {
    if (c.company) {
      const norm = chNormalise(c.company)
      if (norm && !companySet.has(norm)) companySet.set(norm, c.company)
    }
  }

  // Lookup each unique company
  type CHResult = { status: CompaniesHouseStatus; name: string; number: string }
  const results = new Map<string, CHResult>()

  for (const [norm, original] of companySet) {
    try {
      const data = await chSearch(original, apiKey)
      const items = data.items || []

      // Score all results and pick the best one (if it's a reasonable match)
      let bestMatch: (typeof items)[0] | undefined
      let bestScore = 99
      for (const it of items) {
        const score = chMatchScore(norm, it.title)
        if (score < bestScore) {
          bestScore = score
          bestMatch = it
        }
      }

      if (bestMatch && bestScore < 10) {
        results.set(norm, {
          status: (bestMatch.company_status || 'unknown') as CompaniesHouseStatus,
          name: bestMatch.title,
          number: bestMatch.company_number,
        })
      } else {
        results.set(norm, { status: 'not_found', name: '', number: '' })
      }
    } catch {
      results.set(norm, { status: 'not_found', name: '', number: '' })
    }
    await new Promise((r) => setTimeout(r, CH_MIN_GAP_MS))
  }

  // Apply results to contacts
  for (const c of contacts) {
    if (!c.company) continue
    const hit = results.get(chNormalise(c.company))
    if (hit) {
      c.chStatus = hit.status
      c.chName = hit.name
      c.chNumber = hit.number
    }
  }
}

/* ================================================================== */
/*  HubSpot cross-reference                                           */
/* ================================================================== */

const HUBSPOT_BASE = 'https://api.hubapi.com'

async function hsFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = env.HUBSPOT_PRIVATE_APP_TOKEN
  if (!token) throw new Error('HUBSPOT_PRIVATE_APP_TOKEN not set')
  return fetch(`${HUBSPOT_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers as Record<string, string> ?? {}) },
  })
}

/** Paginated search for companies matching a filter. */
async function searchCompanies(
  filterGroups: unknown[],
  properties: string[],
): Promise<Array<{ id: string; properties: Record<string, string> }>> {
  const results: Array<{ id: string; properties: Record<string, string> }> = []
  let after: string | undefined
  for (let page = 0; page < 30; page++) {
    const res = await hsFetch('/crm/v3/objects/companies/search', {
      method: 'POST',
      body: JSON.stringify({ filterGroups, properties, limit: 100, ...(after ? { after } : {}) }),
    })
    if (!res.ok) break
    const json = (await res.json()) as {
      results: Array<{ id: string; properties: Record<string, string> }>
      paging?: { next?: { after: string } }
    }
    for (const r of json.results) results.push(r)
    after = json.paging?.next?.after
    if (!after) break
  }
  return results
}

/** Paginated search for contacts matching a filter. */
async function searchContacts(
  filterGroups: unknown[],
  properties: string[],
): Promise<Array<{ id: string; properties: Record<string, string> }>> {
  const results: Array<{ id: string; properties: Record<string, string> }> = []
  let after: string | undefined
  for (let page = 0; page < 30; page++) {
    const res = await hsFetch('/crm/v3/objects/contacts/search', {
      method: 'POST',
      body: JSON.stringify({ filterGroups, properties, limit: 100, ...(after ? { after } : {}) }),
    })
    if (!res.ok) break
    const json = (await res.json()) as {
      results: Array<{ id: string; properties: Record<string, string> }>
      paging?: { next?: { after: string } }
    }
    for (const r of json.results) results.push(r)
    after = json.paging?.next?.after
    if (!after) break
  }
  return results
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/\b(ltd|limited|plc|inc|llc|group|uk)\b/g, '').replace(/[^a-z0-9]/g, '').trim()
}

let enrichedCache: OldCrmContact[] | null = null
let enrichedCacheTs = 0
const CACHE_TTL = 10 * 60 * 1000 // 10 min

async function getEnrichedContacts(): Promise<OldCrmContact[]> {
  const now = Date.now()
  if (enrichedCache && now - enrichedCacheTs < CACHE_TTL) return enrichedCache

  const contacts = getAllContacts().map((c) => ({ ...c })) // clone

  try {
    // 1. Fetch all companies that are/were customers
    const [paying, past] = await Promise.all([
      searchCompanies(
        [{ filters: [{ propertyName: 'salesstatus', operator: 'EQ', value: 'paying_customer' }] }],
        ['name', 'domain', 'salesstatus'],
      ),
      searchCompanies(
        [{ filters: [{ propertyName: 'salesstatus', operator: 'EQ', value: 'Past Customer' }] }],
        ['name', 'domain', 'salesstatus'],
      ),
    ])

    // 2. Fetch all HubSpot contacts (with lifecycle stage) to match by email
    const hsContacts = await searchContacts(
      [{ filters: [{ propertyName: 'email', operator: 'HAS_PROPERTY' }] }],
      ['email', 'company', 'lifecyclestage', 'hs_lead_status', 'associatedcompanyid'],
    )
    const hsEmailMap = new Map<string, { company: string; lifecycle: string; leadStatus: string }>()
    for (const hc of hsContacts) {
      const em = (hc.properties.email || '').toLowerCase().trim()
      if (em) hsEmailMap.set(em, {
        company: (hc.properties.company || '').trim(),
        lifecycle: (hc.properties.lifecyclestage || '').toLowerCase(),
        leadStatus: (hc.properties.hs_lead_status || '').trim(),
      })
    }

    // 3. Build lookup maps by normalised company name
    type CompanyInfo = { name: string; status: 'customer' | 'past_customer' }
    const companyMap = new Map<string, CompanyInfo>()

    for (const c of paying) {
      const name = (c.properties.name || '').trim()
      if (name) companyMap.set(normalise(name), { name, status: 'customer' })
    }
    for (const c of past) {
      const name = (c.properties.name || '').trim()
      const key = normalise(name)
      if (name && !companyMap.has(key)) companyMap.set(key, { name, status: 'past_customer' })
    }

    // 4. Match old CRM contacts
    for (const c of contacts) {
      // Try company name match first
      const normCompany = normalise(c.company)
      const companyHit = normCompany ? companyMap.get(normCompany) : undefined
      if (companyHit) {
        c.hubspotMatch = companyHit.status
        c.hubspotCompany = companyHit.name
        c.hubspotDetail = companyHit.status === 'customer' ? 'Active customer' : 'Churned'
        continue
      }

      // Try email match — classify by lifecycle stage
      const emailLc = c.email.toLowerCase().trim()
      const hsHit = emailLc ? hsEmailMap.get(emailLc) : undefined
      if (hsHit) {
        const lc = hsHit.lifecycle
        if (lc === 'customer') {
          c.hubspotMatch = 'customer'
          c.hubspotDetail = 'Customer (via contact)'
        } else if (lc === 'opportunity' || lc === 'salesqualifiedlead') {
          c.hubspotMatch = 'in_pipeline'
          c.hubspotDetail = lc === 'opportunity' ? 'Opportunity' : 'SQL'
        } else if (lc === 'marketingqualifiedlead' || lc === 'lead') {
          c.hubspotMatch = 'lead'
          c.hubspotDetail = lc === 'marketingqualifiedlead' ? 'MQL' : 'Lead'
        } else if (lc === 'subscriber') {
          c.hubspotMatch = 'subscriber'
          c.hubspotDetail = 'Subscriber'
        } else {
          c.hubspotMatch = 'other'
          c.hubspotDetail = lc || 'Contact exists'
        }
        if (hsHit.company) c.hubspotCompany = hsHit.company
        continue
      }
    }
  } catch (err) {
    console.error('[old-crm] HubSpot enrichment failed, returning unenriched data:', (err as Error).message)
  }

  // Companies House enrichment
  try {
    await enrichWithCompaniesHouse(contacts)
  } catch (err) {
    console.error('[old-crm] Companies House enrichment failed:', (err as Error).message)
  }

  enrichedCache = contacts
  enrichedCacheTs = now
  return contacts
}

/* ================================================================== */
/*  Route                                                             */
/* ================================================================== */

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAdmin)

  app.get('/', async () => {
    const contacts = await getEnrichedContacts()

    const hasEmail = contacts.filter((c) => c.email).length
    const hasPhone = contacts.filter((c) => c.phone).length
    const hasEmailAndPhone = contacts.filter((c) => c.email && c.phone).length
    const byStatus: Record<string, number> = {}
    for (const c of contacts) byStatus[c.hubspotMatch] = (byStatus[c.hubspotMatch] || 0) + 1
    const reEngageable = contacts.filter((c) => c.email && c.hubspotMatch === 'not_found').length

    const chActive = contacts.filter((c) => c.chStatus === 'active').length
    const chDissolved = contacts.filter((c) => c.chStatus === 'dissolved').length
    const chOther = contacts.filter((c) => !['active', 'dissolved', 'skipped', 'not_found'].includes(c.chStatus)).length
    const chNotFound = contacts.filter((c) => c.chStatus === 'not_found').length

    return {
      contacts,
      stats: {
        total: contacts.length,
        hasEmail,
        hasPhone,
        hasEmailAndPhone,
        reEngageable,
        customer: byStatus.customer || 0,
        pastCustomer: byStatus.past_customer || 0,
        inPipeline: byStatus.in_pipeline || 0,
        lead: byStatus.lead || 0,
        subscriber: byStatus.subscriber || 0,
        other: byStatus.other || 0,
        notFound: byStatus.not_found || 0,
        chActive,
        chDissolved,
        chOther,
        chNotFound,
      },
    }
  })
}

export { routes as adminOldCrmRoutes }
