import 'dotenv/config'

const TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN
const BASE = 'https://api.hubapi.com'

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

// All closedwon deals, default pipeline
const allWon = await searchDeals(
  [{ filters: [
    { propertyName: 'pipeline', operator: 'EQ', value: 'default' },
    { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
  ]}],
  ['dealname', 'amount', 'closedate', 'hs_v2_date_entered_closedwon', 'hs_mrr']
)

console.log(`Total closedwon deals: ${allWon.length}`)

// Breakdown of hs_mrr availability  
const withMrr = allWon.filter(d => parseFloat(d.properties.hs_mrr ?? '0') > 0)
const noMrr = allWon.filter(d => !parseFloat(d.properties.hs_mrr ?? '0'))
console.log(`  With hs_mrr > 0: ${withMrr.length}`)
console.log(`  Without hs_mrr: ${noMrr.length}`)
console.log(`  Total MRR if all active: £${withMrr.reduce((s,d) => s + parseFloat(d.properties.hs_mrr), 0).toFixed(2)}`)

// Check closedate vs won date relationship
let closedateBeforeWon = 0
let closedatePast = 0  // closedate already passed (before now)
let closedateFuture = 0
let closedateMissing = 0
const now = new Date()

for (const d of allWon) {
  const wonRaw = d.properties.hs_v2_date_entered_closedwon
  const cdRaw = d.properties.closedate
  if (!cdRaw) { closedateMissing++; continue }
  const cd = new Date(cdRaw)
  if (cd < now) closedatePast++
  else closedateFuture++
  if (wonRaw && cd < new Date(wonRaw)) closedateBeforeWon++
}

console.log(`\n=== closedate analysis (${allWon.length} deals) ===`)
console.log(`  closedate in past (before today): ${closedatePast}`)
console.log(`  closedate in future: ${closedateFuture}`)
console.log(`  closedate BEFORE won date: ${closedateBeforeWon}`)
console.log(`  closedate missing: ${closedateMissing}`)

// What does the MRR look like if we IGNORE closedate entirely
// (i.e. once won, always contributing until churned)?
console.log(`\n=== MRR by month (ignoring closedate — won date onwards) ===`)
const mrrCumulative = {}
for (let i = 11; i >= 0; i--) {
  const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
  const mk = monthKey(d)
  let monthMrr = 0
  for (const deal of withMrr) {
    const wonRaw = deal.properties.hs_v2_date_entered_closedwon
    if (!wonRaw) continue
    const wonMk = monthKey(new Date(wonRaw))
    // Deal contributes if won on or before this month
    if (mk >= wonMk) {
      monthMrr += parseFloat(deal.properties.hs_mrr)
    }
  }
  mrrCumulative[mk] = monthMrr
}

console.log(`${'Month'.padEnd(10)} ${'Cumulative MRR (won onwards)'.padEnd(30)}`)
for (const [mk, val] of Object.entries(mrrCumulative).sort()) {
  console.log(`${mk.padEnd(10)} £${val.toFixed(2)}`)
}

// Compare with closedate-bounded approach
console.log(`\n=== MRR by month (with closedate boundary) ===`)
const mrrBounded = {}
for (let i = 11; i >= 0; i--) {
  const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
  const mk = monthKey(d)
  let monthMrr = 0
  for (const deal of withMrr) {
    const wonRaw = deal.properties.hs_v2_date_entered_closedwon
    if (!wonRaw) continue
    const wonMk = monthKey(new Date(wonRaw))
    const cdRaw = deal.properties.closedate
    const endMk = cdRaw ? monthKey(new Date(cdRaw)) : '2099-01'
    if (mk >= wonMk && mk <= endMk) {
      monthMrr += parseFloat(deal.properties.hs_mrr)
    }
  }
  mrrBounded[mk] = monthMrr
}

console.log(`${'Month'.padEnd(10)} ${'Bounded MRR'.padEnd(20)} ${'Cumulative MRR'.padEnd(20)} ${'Diff'}`)
for (const mk of Object.keys(mrrCumulative).sort()) {
  const b = mrrBounded[mk] || 0
  const c = mrrCumulative[mk] || 0
  console.log(`${mk.padEnd(10)} £${b.toFixed(2).padEnd(18)} £${c.toFixed(2).padEnd(18)} £${(c-b).toFixed(2)}`)
}

// Check: what does salestatus=paying_customer give us?
const LIVE_PROP = process.env.HUBSPOT_LIVE_CUSTOMER_PROPERTY || 'salestatus'
const LIVE_VAL = process.env.HUBSPOT_LIVE_CUSTOMER_TRUE_VALUES || 'paying_customer'

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

const liveCompanies = await searchCompanies(
  [{ filters: [
    { propertyName: LIVE_PROP, operator: 'EQ', value: LIVE_VAL },
  ]}],
  ['name', LIVE_PROP]
)
console.log(`\n=== Live companies (${LIVE_PROP}=${LIVE_VAL}): ${liveCompanies.length} ===`)
