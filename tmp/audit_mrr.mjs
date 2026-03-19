import 'dotenv/config'

const TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN
const BASE = 'https://api.hubapi.com'

async function searchAll(objectType, filterGroups, properties) {
  const results = []
  let after = undefined
  do {
    const body = { filterGroups, properties, limit: 100 }
    if (after) body.after = after
    const res = await fetch(`${BASE}/crm/v3/objects/${objectType}/search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    results.push(...(json.results ?? []))
    after = json.paging?.next?.after
  } while (after)
  return results
}

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

console.log('=== MRR AUDIT ===\n')
console.log('Fetching paying companies...')
const paying = await searchAll('companies',
  [{ filters: [{ propertyName: 'salesstatus', operator: 'EQ', value: 'paying_customer' }] }],
  ['name', 'salesstatus'],
)
console.log(`  Paying companies: ${paying.length}`)

console.log('Fetching all closedwon deals (default pipeline)...')
const allWon = await searchAll('deals',
  [{ filters: [
    { propertyName: 'pipeline', operator: 'EQ', value: 'default' },
    { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
  ] }],
  ['dealname', 'amount', 'hs_mrr', 'hs_v2_date_entered_closedwon', 'closedate', 'hubspot_owner_id'],
)
console.log(`  Closedwon deals: ${allWon.length}`)

console.log('Fetching deal→company associations...')
const dealCompanyMap = new Map()
const dealIds = allWon.map(d => d.id)
for (let i = 0; i < dealIds.length; i += 500) {
  const batch = dealIds.slice(i, i + 500)
  const res = await fetch(`${BASE}/crm/v4/associations/deals/companies/batch/read`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: batch.map(id => ({ id })) }),
  })
  const json = await res.json()
  for (const r of json.results ?? []) {
    if (r.to?.length) {
      dealCompanyMap.set(String(r.from.id), String(r.to[0].toObjectId))
    }
  }
}

const payingIds = new Set(paying.map(c => c.id))
const companyNameMap = new Map(paying.map(c => [c.id, c.properties.name ?? 'Unknown']))

// Group live deals by company
const companyDeals = new Map() // companyId → [deal, deal, ...]
let orphanDeals = 0
let nonPayingDeals = 0

for (const d of allWon) {
  const cid = dealCompanyMap.get(d.id)
  if (!cid) { orphanDeals++; continue }
  if (!payingIds.has(cid)) { nonPayingDeals++; continue }
  if (!companyDeals.has(cid)) companyDeals.set(cid, [])
  companyDeals.get(cid).push(d)
}

console.log(`  Orphan deals (no company): ${orphanDeals}`)
console.log(`  Non-paying company deals: ${nonPayingDeals}`)
console.log(`  Deals mapped to live companies: ${[...companyDeals.values()].flat().length}`)

// === ANALYSIS ===
const now = new Date()
const currentMk = monthKey(now)

// Current method: sum ALL deals' hs_mrr from live companies
let mrrAllDeals = 0
let dealsContributing = 0
let dealsSkippedNoMrr = 0
let dealsSkippedNoWon = 0
let dealsSkippedFuture = 0

// Corrected method: only latest deal per company
let mrrLatestOnly = 0

// Per-company breakdown
const companyBreakdown = []
const multiDealCompanies = []

for (const [cid, deals] of companyDeals) {
  const companyName = companyNameMap.get(cid) ?? 'Unknown'
  
  // Sort deals by won date descending (newest first)
  deals.sort((a, b) => {
    const da = a.properties.hs_v2_date_entered_closedwon
    const db = b.properties.hs_v2_date_entered_closedwon
    return (db ? new Date(db).getTime() : 0) - (da ? new Date(da).getTime() : 0)
  })
  
  let companyTotal = 0
  const dealDetails = []
  
  for (const d of deals) {
    const mrr = parseFloat(d.properties.hs_mrr ?? '0') || 0
    const wonRaw = d.properties.hs_v2_date_entered_closedwon
    const closeRaw = d.properties.closedate
    
    if (mrr === 0) { dealsSkippedNoMrr++; continue }
    if (!wonRaw) { dealsSkippedNoWon++; continue }
    if (currentMk < monthKey(new Date(wonRaw))) { dealsSkippedFuture++; continue }
    
    mrrAllDeals += mrr
    dealsContributing++
    companyTotal += mrr
    
    dealDetails.push({
      name: d.properties.dealname,
      mrr,
      wonDate: wonRaw?.slice(0, 10),
      closeDate: closeRaw?.slice(0, 10) ?? 'N/A',
    })
  }
  
  // Latest deal only
  const latestWithMrr = deals.find(d => {
    const mrr = parseFloat(d.properties.hs_mrr ?? '0') || 0
    const wonRaw = d.properties.hs_v2_date_entered_closedwon
    return mrr > 0 && wonRaw && currentMk >= monthKey(new Date(wonRaw))
  })
  if (latestWithMrr) {
    mrrLatestOnly += parseFloat(latestWithMrr.properties.hs_mrr ?? '0') || 0
  }
  
  if (dealDetails.length > 0) {
    companyBreakdown.push({ companyName, cid, total: companyTotal, deals: dealDetails })
  }
  if (dealDetails.length > 1) {
    multiDealCompanies.push({ companyName, cid, total: companyTotal, deals: dealDetails })
  }
}

console.log('\n' + '='.repeat(70))
console.log('MRR COMPARISON')
console.log('='.repeat(70))
console.log(`  Current method (sum ALL deals):   £${mrrAllDeals.toFixed(2)}/mo`)
console.log(`  Latest-deal-only per company:      £${mrrLatestOnly.toFixed(2)}/mo`)
console.log(`  Difference:                        £${(mrrAllDeals - mrrLatestOnly).toFixed(2)}/mo`)
console.log(`  Deals contributing:                ${dealsContributing}`)
console.log(`  Deals skipped (no hs_mrr):         ${dealsSkippedNoMrr}`)
console.log(`  Deals skipped (no won date):       ${dealsSkippedNoWon}`)
console.log(`  Deals skipped (future won):        ${dealsSkippedFuture}`)

if (multiDealCompanies.length > 0) {
  console.log('\n' + '='.repeat(70))
  console.log(`⚠️  COMPANIES WITH MULTIPLE MRR-CONTRIBUTING DEALS (${multiDealCompanies.length})`)
  console.log('   These companies have >1 closedwon deal with hs_mrr > 0')
  console.log('   If deals are replacements (renewals), the older ones are double-counting')
  console.log('='.repeat(70))
  
  // Sort by total MRR descending
  multiDealCompanies.sort((a, b) => b.total - a.total)
  
  for (const c of multiDealCompanies) {
    console.log(`\n  ${c.companyName} — Total: £${c.total.toFixed(2)}/mo (${c.deals.length} deals)`)
    for (const d of c.deals) {
      console.log(`    - ${d.name} | MRR: £${d.mrr.toFixed(2)} | Won: ${d.wonDate} | CloseDate: ${d.closeDate}`)
    }
    // Show what we'd count with latest only
    const latestMrr = c.deals[0].mrr
    if (latestMrr !== c.total) {
      console.log(`    → Latest only: £${latestMrr.toFixed(2)} | Potential overcount: £${(c.total - latestMrr).toFixed(2)}`)
    }
  }
}

// Companies with 0 MRR (paying but no deal contributing)
const payingNoMrr = [...payingIds].filter(cid => {
  if (!companyDeals.has(cid)) return true
  const deals = companyDeals.get(cid)
  return !deals.some(d => parseFloat(d.properties.hs_mrr ?? '0') > 0)
})

if (payingNoMrr.length > 0) {
  console.log('\n' + '='.repeat(70))
  console.log(`⚠️  PAYING COMPANIES WITH NO MRR-CONTRIBUTING DEALS (${payingNoMrr.length})`)
  console.log('   These are salesstatus=paying_customer but have no closedwon deal with hs_mrr')
  console.log('='.repeat(70))
  for (const cid of payingNoMrr.slice(0, 20)) {
    console.log(`  - ${companyNameMap.get(cid) ?? 'Unknown'} (${cid})`)
  }
  if (payingNoMrr.length > 20) console.log(`  ... and ${payingNoMrr.length - 20} more`)
}

// Summary
console.log('\n' + '='.repeat(70))
console.log('SUMMARY')
console.log('='.repeat(70))
console.log(`  Paying companies:         ${paying.length}`)
console.log(`  Companies with MRR deals: ${companyBreakdown.length}`)
console.log(`  Companies without MRR:    ${payingNoMrr.length}`)
console.log(`  Multi-deal companies:     ${multiDealCompanies.length}`)
console.log(`  MRR (all deals):          £${mrrAllDeals.toFixed(2)}/mo`)
console.log(`  MRR (latest deal only):   £${mrrLatestOnly.toFixed(2)}/mo`)
console.log(`  Potential overcount:       £${(mrrAllDeals - mrrLatestOnly).toFixed(2)}/mo`)

// Full breakdown sorted by MRR
console.log('\n' + '='.repeat(70))
console.log('FULL COMPANY MRR BREAKDOWN (sorted by MRR descending)')
console.log('='.repeat(70))
companyBreakdown.sort((a, b) => b.total - a.total)
for (const c of companyBreakdown) {
  const flag = c.deals.length > 1 ? ' ⚠️' : ''
  console.log(`  £${c.total.toFixed(2).padStart(8)} | ${c.companyName}${flag} (${c.deals.length} deal${c.deals.length > 1 ? 's' : ''})`)
}
