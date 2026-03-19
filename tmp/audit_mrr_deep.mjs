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

// Get paying companies
const paying = await searchAll('companies',
  [{ filters: [{ propertyName: 'salesstatus', operator: 'EQ', value: 'paying_customer' }] }],
  ['name'],
)
const payingIds = new Set(paying.map(c => c.id))
const companyNameMap = new Map(paying.map(c => [c.id, c.properties.name ?? 'Unknown']))

// Get ALL closedwon deals (with MRR and also those with MRR=0 or null)
const allWon = await searchAll('deals',
  [{ filters: [
    { propertyName: 'pipeline', operator: 'EQ', value: 'default' },
    { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
  ] }],
  ['dealname', 'hs_mrr', 'hs_v2_date_entered_closedwon', 'closedate', 'amount'],
)

// Get associations
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
    if (r.to?.length) dealCompanyMap.set(String(r.from.id), String(r.to[0].toObjectId))
  }
}

// Group deals by company (only paying companies)
const companyAllDeals = new Map() // cid → [all deals including MRR=0]
for (const d of allWon) {
  const cid = dealCompanyMap.get(d.id)
  if (!cid || !payingIds.has(cid)) continue
  if (!companyAllDeals.has(cid)) companyAllDeals.set(cid, [])
  companyAllDeals.get(cid).push(d)
}

// For the 66 multi-MRR companies, show ALL deals (including zeroed ones)
console.log('=== MULTI-DEAL COMPANY DEEP DIVE ===')
console.log('Showing ALL closedwon deals (including hs_mrr=0) for companies with >1 active MRR deal\n')

let confirmedAdditive = 0
let suspicious = 0
const suspiciousList = []

for (const [cid, deals] of companyAllDeals) {
  const activeMrr = deals.filter(d => parseFloat(d.properties.hs_mrr ?? '0') > 0)
  if (activeMrr.length <= 1) continue // skip single-deal companies

  const zeroed = deals.filter(d => {
    const mrr = parseFloat(d.properties.hs_mrr ?? '0')
    return mrr === 0 || isNaN(mrr)
  })

  const name = companyNameMap.get(cid)
  const totalActive = activeMrr.reduce((s, d) => s + parseFloat(d.properties.hs_mrr), 0)

  // Check deal names for additive patterns
  const addPatterns = /new home|new license|extra license|additional|new ch|new registered|new deal.*new home|uplift/i
  const renewPatterns = /renew|upgrade|v2|v3|new contract|replacement/i

  const activeNames = activeMrr.map(d => d.properties.dealname ?? '')
  const hasAdditive = activeNames.some(n => addPatterns.test(n))
  const hasRenewal = activeNames.some(n => renewPatterns.test(n))

  // Sort by won date
  deals.sort((a, b) => {
    const da = a.properties.hs_v2_date_entered_closedwon
    const db = b.properties.hs_v2_date_entered_closedwon
    return (db ? new Date(db).getTime() : 0) - (da ? new Date(da).getTime() : 0)
  })

  const isSuspicious = hasRenewal && !hasAdditive

  if (isSuspicious) {
    suspicious++
    suspiciousList.push({ name, cid, totalActive, activeMrr, zeroed, deals })
  } else {
    confirmedAdditive++
  }

  console.log(`${isSuspicious ? '⚠️ ' : '✅ '}${name} — Active MRR: £${totalActive.toFixed(2)} (${activeMrr.length} active, ${zeroed.length} zeroed)`)
  for (const d of deals) {
    const mrr = parseFloat(d.properties.hs_mrr ?? '0') || 0
    const tag = mrr > 0 ? '💰' : '🔇'
    console.log(`   ${tag} ${d.properties.dealname} | MRR: £${mrr.toFixed(2)} | Won: ${(d.properties.hs_v2_date_entered_closedwon ?? '').slice(0, 10)}`)
  }
  console.log()
}

console.log('='.repeat(60))
console.log(`Likely additive (new homes/licenses): ${confirmedAdditive}`)
console.log(`Potentially suspicious (renewal names): ${suspicious}`)

if (suspiciousList.length > 0) {
  const suspiciousMrr = suspiciousList.reduce((s, c) => {
    // Overcount = total - latest deal only
    const latest = c.activeMrr.sort((a, b) => {
      const da = a.properties.hs_v2_date_entered_closedwon
      const db = b.properties.hs_v2_date_entered_closedwon
      return (db ? new Date(db).getTime() : 0) - (da ? new Date(da).getTime() : 0)
    })[0]
    return s + c.totalActive - parseFloat(latest.properties.hs_mrr)
  }, 0)
  console.log(`Max possible overcount from suspicious: £${suspiciousMrr.toFixed(2)}/mo`)
}

// Also: check how many zeroed-out deals exist (proof Hope is cleaning up)
let totalZeroed = 0
let totalActive = 0
for (const [, deals] of companyAllDeals) {
  for (const d of deals) {
    const mrr = parseFloat(d.properties.hs_mrr ?? '0') || 0
    if (mrr > 0) totalActive++
    else totalZeroed++
  }
}
console.log(`\nTotal closedwon deals for paying companies: ${totalActive + totalZeroed}`)
console.log(`  Active (hs_mrr > 0): ${totalActive}`)
console.log(`  Zeroed (hs_mrr = 0): ${totalZeroed} ← evidence Hope is cleaning up`)
