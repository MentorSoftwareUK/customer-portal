import 'dotenv/config'

const TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN
const BASE = 'https://api.hubapi.com'

async function searchCompanies(filterGroups, properties) {
  const results = []
  let after = undefined
  do {
    const body = { filterGroups, properties, limit: 100 }
    if (after) body.after = after
    const res = await fetch(`${BASE}/crm/v3/objects/companies/search`, {
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

async function searchDeals(filterGroups, properties) {
  const results = []
  let after = undefined
  do {
    const body = { filterGroups, properties, limit: 100 }
    if (after) body.after = after
    const res = await fetch(`${BASE}/crm/v3/objects/deals/search`, {
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

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`

// 1. Get all paying companies
const paying = await searchCompanies(
  [{ filters: [
    { propertyName: 'salesstatus', operator: 'EQ', value: 'paying_customer' },
  ]}],
  ['name', 'salesstatus']
)
console.log(`Live paying companies: ${paying.length}`)

// 2. Get all closedwon deals
const allWon = await searchDeals(
  [{ filters: [
    { propertyName: 'pipeline', operator: 'EQ', value: 'default' },
    { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
  ]}],
  ['dealname', 'amount', 'hs_mrr', 'hs_v2_date_entered_closedwon']
)
console.log(`All closedwon deals: ${allWon.length}`)

// 3. Get deal→company associations
const dealIds = allWon.map(d => d.id)
const dealCompanyMap = new Map() // dealId → companyId

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

const payingCompanyIds = new Set(paying.map(c => c.id))
console.log(`Deals with company associations: ${dealCompanyMap.size}`)

// 4. Filter: only deals belonging to LIVE paying companies
const liveDeals = allWon.filter(d => {
  const cid = dealCompanyMap.get(d.id)
  return cid && payingCompanyIds.has(cid)
})
console.log(`Deals belonging to live paying companies: ${liveDeals.length}`)

const liveWithMrr = liveDeals.filter(d => parseFloat(d.properties.hs_mrr ?? '0') > 0)
console.log(`  Of those, with hs_mrr > 0: ${liveWithMrr.length}`)

// 5. Cumulative MRR from ONLY live companies (deal contributes from won date onwards)
const now = new Date()
console.log(`\n=== MRR from live paying companies only (won date onwards) ===`)
console.log(`${'Month'.padEnd(10)} ${'Live MRR'.padEnd(15)} ${'All Won MRR'.padEnd(15)}`)

for (let i = 11; i >= 0; i--) {
  const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
  const mk = monthKey(d)
  
  let liveMrr = 0
  for (const deal of liveWithMrr) {
    const wonRaw = deal.properties.hs_v2_date_entered_closedwon
    if (!wonRaw) continue
    const wonMk = monthKey(new Date(wonRaw))
    if (mk >= wonMk) liveMrr += parseFloat(deal.properties.hs_mrr)
  }
  
  // Compare: all deals regardless of company status
  let allMrr = 0
  const allWithMrr = allWon.filter(d => parseFloat(d.properties.hs_mrr ?? '0') > 0)
  for (const deal of allWithMrr) {
    const wonRaw = deal.properties.hs_v2_date_entered_closedwon
    if (!wonRaw) continue
    const wonMk = monthKey(new Date(wonRaw))
    if (mk >= wonMk) allMrr += parseFloat(deal.properties.hs_mrr)
  }
  
  console.log(`${mk.padEnd(10)} £${liveMrr.toFixed(2).padEnd(13)} £${allMrr.toFixed(2)}`)
}

// 6. Current month: sum of hs_mrr from live company deals  
let currentMrr = 0
const currentMk = monthKey(now)
for (const deal of liveWithMrr) {
  const wonRaw = deal.properties.hs_v2_date_entered_closedwon
  if (!wonRaw) continue
  if (currentMk >= monthKey(new Date(wonRaw))) {
    currentMrr += parseFloat(deal.properties.hs_mrr)
  }
}
console.log(`\nCurrent live MRR: £${currentMrr.toFixed(2)}/mo`)
