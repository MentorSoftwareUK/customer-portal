#!/usr/bin/env node
/**
 * Looks up old CRM companies against Companies House to check
 * if they are still active or dissolved.
 *
 * Usage:
 *   COMPANIES_HOUSE_API_KEY=your_key node tmp/companies_house_lookup.mjs
 *
 * Get a free key at: https://developer.company-information.service.gov.uk
 */

import { readFileSync, writeFileSync } from 'fs'
import { parse } from 'path'

const API_KEY = process.env.COMPANIES_HOUSE_API_KEY
if (!API_KEY) {
  console.error(
    'Missing COMPANIES_HOUSE_API_KEY env var.\n' +
      'Get a free key at https://developer.company-information.service.gov.uk\n' +
      'Then run: COMPANIES_HOUSE_API_KEY=your_key node tmp/companies_house_lookup.mjs',
  )
  process.exit(1)
}

const AUTH = `Basic ${Buffer.from(`${API_KEY}:`).toString('base64')}`
const CH_BASE = 'https://api.company-information.service.gov.uk'

// ── Rate-limit: 600 requests / 5 min = ~500ms between requests ───────────────
const MIN_GAP_MS = 520

async function chSearch(query) {
  const url = `${CH_BASE}/search/companies?q=${encodeURIComponent(query)}&items_per_page=5`
  const res = await fetch(url, { headers: { Authorization: AUTH } })
  if (res.status === 429) {
    console.log('  ⏳ Rate-limited, waiting 5s...')
    await sleep(5000)
    return chSearch(query)
  }
  if (!res.ok) throw new Error(`CH search ${res.status}: ${await res.text()}`)
  return res.json()
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// ── Read all 3 CSVs ──────────────────────────────────────────────────────────
function readCsv(filepath) {
  const raw = readFileSync(filepath, 'utf8')
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  const rows = []
  for (const line of lines) {
    // Simple CSV parse (handles quoted fields)
    const fields = []
    let inQuotes = false
    let field = ''
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (ch === ',' && !inQuotes) {
        fields.push(field)
        field = ''
      } else {
        field += ch
      }
    }
    fields.push(field)
    rows.push(fields)
  }
  return rows
}

const files = [
  { path: 'tmp/old crm/demo completed.csv', label: 'Demo Completed' },
  { path: 'tmp/old crm/interested in demo.csv', label: 'Interested in Demo' },
  { path: 'tmp/old crm/Wants to purchase.csv', label: 'Wants to Purchase' },
]

const companies = new Map() // name -> { label, name }
for (const f of files) {
  const rows = readCsv(f.path)
  for (const row of rows) {
    if (row.length > 5 && row[5].trim()) {
      const name = row[5].trim()
      if (!companies.has(name)) {
        companies.set(name, { name, label: f.label })
      }
    }
  }
}

console.log(`Found ${companies.size} unique companies across 3 CSVs\n`)

// ── Look up each company ─────────────────────────────────────────────────────
const results = []
let i = 0
for (const [name, info] of companies) {
  i++
  process.stdout.write(`[${i}/${companies.size}] Searching: ${name}...`)

  try {
    const data = await chSearch(name)
    const items = data.items || []

    // Try exact match first (case-insensitive), then best fuzzy match
    const normName = name.toLowerCase().replace(/\s+/g, ' ').replace(/ltd$/, 'limited').replace(/\blimited\b/, 'limited')
    let match = items.find(
      (it) => it.title?.toLowerCase().replace(/\s+/g, ' ') === normName,
    )
    if (!match) {
      // Try contains
      match = items.find((it) =>
        it.title?.toLowerCase().includes(normName.split(' ')[0].toLowerCase()),
      )
    }
    if (!match && items.length > 0) {
      match = items[0] // best search result
    }

    if (match) {
      const status = (match.company_status || 'unknown').toLowerCase()
      const emoji =
        status === 'active' ? '✅' : status === 'dissolved' ? '❌' : status === 'liquidation' ? '⚠️' : '❓'
      console.log(` ${emoji} ${match.title} — ${status} (${match.company_number})`)
      results.push({
        crmName: name,
        source: info.label,
        chName: match.title,
        companyNumber: match.company_number,
        status: match.company_status || 'unknown',
        dateCreated: match.date_of_creation || '',
        address: match.address
          ? [match.address.address_line_1, match.address.locality, match.address.postal_code]
              .filter(Boolean)
              .join(', ')
          : '',
      })
    } else {
      console.log(' ⬜ No match found')
      results.push({
        crmName: name,
        source: info.label,
        chName: '',
        companyNumber: '',
        status: 'NOT FOUND',
        dateCreated: '',
        address: '',
      })
    }
  } catch (err) {
    console.log(` 💥 Error: ${err.message}`)
    results.push({
      crmName: name,
      source: info.label,
      chName: '',
      companyNumber: '',
      status: `ERROR: ${err.message}`,
      dateCreated: '',
      address: '',
    })
  }

  await sleep(MIN_GAP_MS)
}

// ── Summary ──────────────────────────────────────────────────────────────────
const active = results.filter((r) => r.status === 'active')
const dissolved = results.filter((r) => r.status === 'dissolved')
const liquidation = results.filter((r) => r.status === 'liquidation')
const notFound = results.filter((r) => r.status === 'NOT FOUND')
const other = results.filter(
  (r) => !['active', 'dissolved', 'liquidation', 'NOT FOUND'].includes(r.status) && !r.status.startsWith('ERROR'),
)

console.log('\n═══════════════════════════════════════════')
console.log('SUMMARY')
console.log('═══════════════════════════════════════════')
console.log(`✅ Active:      ${active.length}`)
console.log(`❌ Dissolved:   ${dissolved.length}`)
console.log(`⚠️  Liquidation: ${liquidation.length}`)
console.log(`⬜ Not Found:   ${notFound.length}`)
if (other.length) console.log(`❓ Other:       ${other.length}`)
console.log()

if (dissolved.length) {
  console.log('── DISSOLVED COMPANIES ──────────────────────')
  for (const r of dissolved) {
    console.log(`  ${r.crmName}  →  ${r.chName} (${r.companyNumber})  [${r.source}]`)
  }
  console.log()
}

if (liquidation.length) {
  console.log('── IN LIQUIDATION ──────────────────────────')
  for (const r of liquidation) {
    console.log(`  ${r.crmName}  →  ${r.chName} (${r.companyNumber})  [${r.source}]`)
  }
  console.log()
}

// ── Write CSV output ─────────────────────────────────────────────────────────
const csvHeader = 'CRM Name,Source,CH Name,Company Number,Status,Date Created,Address,CH Link'
const csvRows = results.map((r) => {
  const link = r.companyNumber
    ? `https://find-and-update.company-information.service.gov.uk/company/${r.companyNumber}`
    : ''
  return [r.crmName, r.source, r.chName, r.companyNumber, r.status, r.dateCreated, r.address, link]
    .map((v) => `"${String(v).replace(/"/g, '""')}"`)
    .join(',')
})

const csvOut = [csvHeader, ...csvRows].join('\n')
writeFileSync('tmp/old crm/companies_house_status.csv', csvOut, 'utf8')
console.log('📄 Full results written to: tmp/old crm/companies_house_status.csv')
