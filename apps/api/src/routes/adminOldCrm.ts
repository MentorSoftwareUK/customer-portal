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
  hubspotMatch: 'customer' | 'past_customer' | 'in_hubspot' | 'not_found'
  hubspotCompany: string
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

    // 2. Also fetch all HubSpot contacts to match by email
    const hsContacts = await searchContacts(
      [{ filters: [{ propertyName: 'email', operator: 'HAS_PROPERTY' }] }],
      ['email', 'company'],
    )
    const hsEmailSet = new Set(hsContacts.map((c) => (c.properties.email || '').toLowerCase().trim()).filter(Boolean))

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
        continue
      }

      // Try email match
      const emailLc = c.email.toLowerCase().trim()
      if (emailLc && hsEmailSet.has(emailLc)) {
        c.hubspotMatch = 'in_hubspot'
        continue
      }
    }
  } catch (err) {
    console.error('[old-crm] HubSpot enrichment failed, returning unenriched data:', (err as Error).message)
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
    return { contacts }
  })
}

export { routes as adminOldCrmRoutes }
