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

// ─── Approach 1: Current query (closedate >= 6mo ago) ───
const sixMonthsAgo = new Date()
sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
sixMonthsAgo.setDate(1)
sixMonthsAgo.setHours(0, 0, 0, 0)

const withClosedateFilter = await searchDeals(
  [{ filters: [
    { propertyName: 'pipeline', operator: 'EQ', value: 'default' },
    { propertyName: 'closedate', operator: 'GTE', value: sixMonthsAgo.toISOString() },
    { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
  ]}],
  ['dealname', 'amount', 'closedate', 'hs_v2_date_entered_closedwon']
)

// ─── Approach 2: Filter by hs_v2_date_entered_closedwon instead ───
const withActualDateFilter = await searchDeals(
  [{ filters: [
    { propertyName: 'pipeline', operator: 'EQ', value: 'default' },
    { propertyName: 'hs_v2_date_entered_closedwon', operator: 'GTE', value: sixMonthsAgo.toISOString() },
    { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
  ]}],
  ['dealname', 'amount', 'closedate', 'hs_v2_date_entered_closedwon']
)

// ─── Approach 3: ALL closedwon deals (no date filter) ───
const allWon = await searchDeals(
  [{ filters: [
    { propertyName: 'pipeline', operator: 'EQ', value: 'default' },
    { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
  ]}],
  ['dealname', 'amount', 'closedate', 'hs_v2_date_entered_closedwon']
)

console.log(`=== Total closedwon deals ===`)
console.log(`  With closedate >= 6mo filter: ${withClosedateFilter.length}`)
console.log(`  With hs_v2_date_entered_closedwon >= 6mo filter: ${withActualDateFilter.length}`)
console.log(`  All time (no date filter): ${allWon.length}`)

// Bucket each approach by actual won month
function bucketByWonMonth(deals) {
  const b = {}
  for (const d of deals) {
    const raw = d.properties.hs_v2_date_entered_closedwon
    const mk = raw ? monthKey(new Date(raw)) : 'no-date'
    b[mk] = (b[mk] || 0) + 1
  }
  return b
}

const b1 = bucketByWonMonth(withClosedateFilter)
const b2 = bucketByWonMonth(withActualDateFilter)
const b3 = bucketByWonMonth(allWon)

console.log(`\n=== Won deals by month (hs_v2_date_entered_closedwon) ===`)
console.log(`${'Month'.padEnd(10)} ${'closedate filter'.padEnd(18)} ${'actual-date filter'.padEnd(20)} ${'all-time'.padEnd(10)}`)
for (let i = 5; i >= 0; i--) {
  const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1)
  const mk = monthKey(d)
  console.log(`${mk.padEnd(10)} ${String(b1[mk]||0).padEnd(18)} ${String(b2[mk]||0).padEnd(20)} ${String(b3[mk]||0).padEnd(10)}`)
}

// Show deals that are in b2 but not b1 (missed by closedate filter)
console.log(`\n=== Deals won recently but MISSED by closedate filter ===`)
const b1Ids = new Set(withClosedateFilter.map(d => d.id))
const missed = withActualDateFilter.filter(d => !b1Ids.has(d.id))
console.log(`Total missed: ${missed.length}`)
for (const d of missed.slice(0, 20)) {
  console.log(`  ${d.properties.dealname} | closedate=${d.properties.closedate?.slice(0,10)} | won=${d.properties.hs_v2_date_entered_closedwon?.slice(0,10)} | £${d.properties.amount}`)
}

// Also check: deals in b1 whose actual won date is OUTSIDE the 6mo window
const outsideWindow = withClosedateFilter.filter(d => {
  const raw = d.properties.hs_v2_date_entered_closedwon
  if (!raw) return true
  return new Date(raw) < sixMonthsAgo
})
console.log(`\n=== Deals included by closedate filter but won BEFORE window ===`)
console.log(`Total: ${outsideWindow.length}`)
for (const d of outsideWindow.slice(0, 10)) {
  console.log(`  ${d.properties.dealname} | closedate=${d.properties.closedate?.slice(0,10)} | won=${d.properties.hs_v2_date_entered_closedwon?.slice(0,10) || 'NONE'} | £${d.properties.amount}`)
}
