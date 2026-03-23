import type { FastifyPluginAsync } from 'fastify'
import { requireAdmin } from '../auth/requireAdmin'
import { readFileSync } from 'fs'
import { join } from 'path'

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
  source: string // which CSV: "Wants to Purchase" | "Demo Completed" | "Interested in Demo"
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
    .split(/\r?\n/)
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

  const dir = join(__dirname, '..', '..', '..', '..', 'tmp', 'old crm')
  const all = [
    ...parseOldCrmCsv(join(dir, 'Wants to purchase.csv'), 'Wants to Purchase'),
    ...parseOldCrmCsv(join(dir, 'demo completed.csv'), 'Demo Completed'),
    ...parseOldCrmCsv(join(dir, 'interested in demo.csv'), 'Interested in Demo'),
  ]

  cachedContacts = all
  return all
}

/* ================================================================== */
/*  Route                                                             */
/* ================================================================== */

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const ok = await requireAdmin(req, reply)
    if (!ok) return reply
  })

  app.get('/', async () => {
    const contacts = getAllContacts()
    return { contacts }
  })
}

export { routes as adminOldCrmRoutes }
