/**
 * Audit: find paying customers with multiple non-zero hs_mrr deals
 * These are likely old deals that should have been zeroed after renewal.
 *
 * Usage: HUBSPOT_PRIVATE_APP_TOKEN=xxx node tmp/audit_unzeroed_deals.mjs
 */
import 'dotenv/config'

const TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN
if (!TOKEN) { console.error('Set HUBSPOT_PRIVATE_APP_TOKEN'); process.exit(1) }

const BASE = 'https://api.hubapi.com'
const hdrs = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }

async function searchAll(objectType, filterGroups, properties) {
  const results = []
  let after
  do {
    const body = { filterGroups, properties, limit: 100 }
    if (after) body.after = after
    const res = await fetch(`${BASE}/crm/v3/objects/${objectType}/search`, {
      method: 'POST', headers: hdrs, body: JSON.stringify(body),
    })
    if (!res.ok) { console.error(`Search ${objectType} failed:`, res.status, await res.text()); break }
    const json = await res.json()
    results.push(...(json.results ?? []))
    after = json.paging?.next?.after
  } while (after)
  return results
}

// 1. Get all paying companies
console.log('Fetching paying companies...')
const companies = await searchAll('companies',
  [{ filters: [{ propertyName: 'salesstatus', operator: 'EQ', value: 'paying_customer' }] }],
  ['name'],
)
console.log(`Found ${companies.length} paying companies`)
const companyMap = new Map(companies.map(c => [c.id, c.properties.name ?? '(unnamed)']))

// 2. Get all closed won deals in default pipeline
console.log('Fetching closed won deals...')
const deals = await searchAll('deals',
  [{ filters: [
    { propertyName: 'pipeline', operator: 'EQ', value: 'default' },
    { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
  ] }],
  ['dealname', 'hs_mrr', 'closedate', 'hs_v2_date_entered_closedwon'],
)
console.log(`Found ${deals.length} closed won deals`)

// 3. Get deal to company associations
console.log('Fetching deal associations...')
const dealCompanyMap = new Map()
const dealIds = deals.map(d => d.id)
for (let i = 0; i < dealIds.length; i += 500) {
  const batch = dealIds.slice(i, i + 500)
  const res = await fetch(`${BASE}/crm/v4/associations/deals/companies/batch/read`, {
    method: 'POST', headers: hdrs,
    body: JSON.stringify({ inputs: batch.map(id => ({ id })) }),
  })
  if (!res.ok) { console.error('Association batch failed:', res.status); continue }
  const json = await res.json()
  for (const r of json.results ?? []) {
    if (r.to?.length) {
      dealCompanyMap.set(String(r.from.id), String(r.to[0].toObjectId))
    }
  }
}

// 4. Group deals by paying company, only non-zero hs_mrr
const companyDeals = new Map() // companyId -> [deal, ...]
for (const d of deals) {
  const mrr = parseFloat(d.properties.hs_mrr ?? '0') || 0
  if (mrr === 0) continue
  const cid = dealCompanyMap.get(d.id)
  if (!cid || !companyMap.has(cid)) continue
  if (!companyDeals.has(cid)) companyDeals.set(cid, [])
  companyDeals.get(cid).push(d)
}

// 5. Find companies with more than one non-zero hs_mrr deal
const problems = []
for (const [cid, dls] of companyDeals) {
  if (dls.length > 1) {
    const name = companyMap.get(cid)
    const sorted = dls.sort((a, b) =>
      new Date(b.properties.closedate ?? 0) - new Date(a.properties.closedate ?? 0)
    )
    const totalMrr = sorted.reduce((s, d) => s + (parseFloat(d.properties.hs_mrr ?? '0') || 0), 0)
    const latestMrr = parseFloat(sorted[0].properties.hs_mrr ?? '0') || 0
    const excess = totalMrr - latestMrr
    problems.push({
      company: name,
      companyId: cid,
      dealCount: dls.length,
      totalMrr: totalMrr.toFixed(2),
      latestMrr: latestMrr.toFixed(2),
      excess: excess.toFixed(2),
      deals: sorted.map(d => ({
        id: d.id,
        name: d.properties.dealname,
        mrr: parseFloat(d.properties.hs_mrr ?? '0').toFixed(2),
        closed: d.properties.closedate?.slice(0, 10) ?? 'unknown',
      })),
    })
  }
}

// Sort by excess MRR descending
problems.sort((a, b) => parseFloat(b.excess) - parseFloat(a.excess))

console.log('\n========================================')
console.log(`PAYING COMPANIES WITH MULTIPLE NON ZERO MRR DEALS`)
console.log(`========================================\n`)

if (problems.length === 0) {
  console.log('None found. All paying customers have exactly one non zero MRR deal. Data is clean.')
} else {
  let totalExcess = 0
  for (const p of problems) {
    totalExcess += parseFloat(p.excess)
    console.log(`${p.company}`)
    console.log(`  ${p.dealCount} deals with non zero MRR, total £${p.totalMrr}/mo (latest deal £${p.latestMrr}/mo, excess £${p.excess}/mo)`)
    console.log(`  HubSpot company: https://app.hubspot.com/contacts/145032754/company/${p.companyId}`)
    for (const d of p.deals) {
      console.log(`    Deal "${d.name}" closed ${d.closed} = £${d.mrr}/mo  https://app.hubspot.com/contacts/145032754/deal/${d.id}`)
    }
    console.log()
  }
  console.log(`========================================`)
  console.log(`TOTAL: ${problems.length} companies need cleanup`)
  console.log(`Total excess MRR: £${totalExcess.toFixed(2)}/mo`)
  console.log(`(This is how much our MRR is overstated by unzeroed old deals)`)
  console.log(`========================================`)
}
