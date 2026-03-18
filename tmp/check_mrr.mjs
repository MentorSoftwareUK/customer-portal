import 'dotenv/config'
const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN
const BASE = 'https://api.hubapi.com'

async function searchAll(filterGroups, properties, sorts) {
  const all = []
  let after
  for (;;) {
    const body = { filterGroups, properties, limit: 100, sorts }
    if (after) body.after = after
    const res = await fetch(`${BASE}/crm/v3/objects/deals/search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    all.push(...json.results)
    after = json.paging?.next?.after
    if (!after) break
  }
  return all
}

const deals = await searchAll(
  [{ filters: [
    { propertyName: 'pipeline', operator: 'EQ', value: 'default' },
    { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
  ] }],
  ['dealname', 'amount', 'hs_mrr', 'hs_v2_date_entered_closedwon', 'closedate'],
  [{ propertyName: 'hs_v2_date_entered_closedwon', direction: 'ASCENDING' }]
)

console.log('Total won deals:', deals.length)

// Build cumulative MRR per month
// A deal contributes hs_mrr from its start month to its end month (or now)
const now = new Date()
const mrrByMonth = {}

for (const d of deals) {
  const mrr = parseFloat(d.properties.hs_mrr || '0') || 0
  if (mrr === 0) continue
  
  const startRaw = d.properties.hs_v2_date_entered_closedwon
  const endRaw = d.properties.closedate
  if (!startRaw) continue
  
  const start = new Date(startRaw)
  const end = endRaw ? new Date(endRaw) : now
  
  // Add MRR to each month from start to end
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  const endMonth = new Date(Math.min(end.getTime(), now.getTime()))
  
  while (cursor <= endMonth) {
    const mk = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
    mrrByMonth[mk] = (mrrByMonth[mk] || 0) + mrr
    cursor.setMonth(cursor.getMonth() + 1)
  }
}

// Show last 12 months
const months = Object.keys(mrrByMonth).sort()
const last12 = months.slice(-12)
console.log('\nCumulative MRR by month (last 12):')
for (const m of last12) {
  console.log(`  ${m}: £${mrrByMonth[m].toFixed(2)}`)
}

// Show a few deal examples
console.log('\nSample deals (first 5):')
for (const d of deals.slice(0, 5)) {
  console.log(`  ${d.properties.dealname}`)
  console.log(`    Start: ${d.properties.hs_v2_date_entered_closedwon?.slice(0,10)} | End: ${d.properties.closedate?.slice(0,10)} | MRR: £${d.properties.hs_mrr}`)
}

// How many have 0 or null hs_mrr
const noMrr = deals.filter(d => !parseFloat(d.properties.hs_mrr || '0'))
console.log(`\nDeals with no hs_mrr: ${noMrr.length} / ${deals.length}`)
