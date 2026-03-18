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

const sixMonthsAgo = new Date()
sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
sixMonthsAgo.setDate(1)
sixMonthsAgo.setHours(0, 0, 0, 0)

// ─── All closedwon + closedlost from default pipeline (no date filter) ───
const allWon = await searchDeals(
  [{ filters: [
    { propertyName: 'pipeline', operator: 'EQ', value: 'default' },
    { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
  ]}],
  ['dealname', 'amount', 'closedate', 'hs_v2_date_entered_closedwon', 'hs_v2_date_entered_closedlost']
)

const allLost = await searchDeals(
  [{ filters: [
    { propertyName: 'pipeline', operator: 'EQ', value: 'default' },
    { propertyName: 'dealstage', operator: 'EQ', value: 'closedlost' },
  ]}],
  ['dealname', 'amount', 'closedate', 'hs_v2_date_entered_closedwon', 'hs_v2_date_entered_closedlost']
)

console.log(`Total closedwon (all time, default pipeline): ${allWon.length}`)
console.log(`Total closedlost (all time, default pipeline): ${allLost.length}`)

// Bucket won deals by ACTUAL won date
const wonByMonth = {}
for (const d of allWon) {
  const raw = d.properties.hs_v2_date_entered_closedwon
  if (!raw) continue
  const mk = monthKey(new Date(raw))
  wonByMonth[mk] = (wonByMonth[mk] || 0) + 1
}

// Bucket lost deals by ACTUAL lost date
const lostByMonth = {}
for (const d of allLost) {
  const raw = d.properties.hs_v2_date_entered_closedlost
  if (!raw) continue
  const mk = monthKey(new Date(raw))
  lostByMonth[mk] = (lostByMonth[mk] || 0) + 1
}

console.log(`\n=== Deals by ACTUAL close date (all-time query, no closedate filter) ===`)
console.log(`${'Month'.padEnd(10)} ${'Won'.padEnd(6)} ${'Lost'.padEnd(6)}`)
// Show last 12 months
for (let i = 11; i >= 0; i--) {
  const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1)
  const mk = monthKey(d)
  console.log(`${mk.padEnd(10)} ${String(wonByMonth[mk]||0).padEnd(6)} ${String(lostByMonth[mk]||0).padEnd(6)}`)
}

// ─── Now: what the CURRENT closedDeals query returns (closedate >= 6mo) ───
const closedWonFiltered = await searchDeals(
  [{ filters: [
    { propertyName: 'pipeline', operator: 'EQ', value: 'default' },
    { propertyName: 'closedate', operator: 'GTE', value: sixMonthsAgo.toISOString() },
    { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
  ]}],
  ['dealname', 'amount', 'closedate', 'hs_v2_date_entered_closedwon']
)
const closedLostFiltered = await searchDeals(
  [{ filters: [
    { propertyName: 'pipeline', operator: 'EQ', value: 'default' },
    { propertyName: 'closedate', operator: 'GTE', value: sixMonthsAgo.toISOString() },
    { propertyName: 'dealstage', operator: 'EQ', value: 'closedlost' },
  ]}],
  ['dealname', 'amount', 'closedate', 'hs_v2_date_entered_closedlost']
)

const filteredWonByMonth = {}
for (const d of closedWonFiltered) {
  const raw = d.properties.hs_v2_date_entered_closedwon
  if (!raw) continue
  const mk = monthKey(new Date(raw))
  filteredWonByMonth[mk] = (filteredWonByMonth[mk] || 0) + 1
}
const filteredLostByMonth = {}
for (const d of closedLostFiltered) {
  const raw = d.properties.hs_v2_date_entered_closedlost
  if (!raw) continue
  const mk = monthKey(new Date(raw))
  filteredLostByMonth[mk] = (filteredLostByMonth[mk] || 0) + 1
}

console.log(`\n=== Comparison: all-time vs closedate-filtered (last 6 months) ===`)
console.log(`${'Month'.padEnd(10)} ${'Won(real)'.padEnd(12)} ${'Won(filtered)'.padEnd(15)} ${'Lost(real)'.padEnd(12)} ${'Lost(filtered)'.padEnd(15)} ${'Diff(won)'.padEnd(10)}`)
for (let i = 5; i >= 0; i--) {
  const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1)
  const mk = monthKey(d)
  const realW = wonByMonth[mk] || 0
  const filtW = filteredWonByMonth[mk] || 0
  const realL = lostByMonth[mk] || 0
  const filtL = filteredLostByMonth[mk] || 0
  const diff = realW - filtW
  console.log(`${mk.padEnd(10)} ${String(realW).padEnd(12)} ${String(filtW).padEnd(15)} ${String(realL).padEnd(12)} ${String(filtL).padEnd(15)} ${diff > 0 ? '+'+diff : diff}`)
}

// Show specific deals missed
const filteredIds = new Set(closedWonFiltered.map(d => d.id))
const missedThisMonth = allWon.filter(d => {
  const raw = d.properties.hs_v2_date_entered_closedwon
  if (!raw) return false
  const mk = monthKey(new Date(raw))
  return (mk === '2026-02' || mk === '2026-03') && !filteredIds.has(d.id)
})
if (missedThisMonth.length > 0) {
  console.log(`\n=== Deals won in Feb/Mar 2026 MISSED by closedate filter ===`)
  for (const d of missedThisMonth) {
    console.log(`  ${d.properties.dealname} | closedate=${d.properties.closedate?.slice(0,10)} | won=${d.properties.hs_v2_date_entered_closedwon?.slice(0,10)} | £${d.properties.amount}`)
  }
}
