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

// Query: all closed-won deals from default pipeline, closedate >= 6 months ago
const sixMonthsAgo = new Date()
sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
sixMonthsAgo.setDate(1)
sixMonthsAgo.setHours(0, 0, 0, 0)

console.log('sixMonthsAgo filter:', sixMonthsAgo.toISOString())

const closedWonDeals = await searchDeals(
  [{ filters: [
    { propertyName: 'pipeline', operator: 'EQ', value: 'default' },
    { propertyName: 'closedate', operator: 'GTE', value: sixMonthsAgo.toISOString() },
    { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
  ]}],
  ['dealname', 'amount', 'closedate', 'hs_v2_date_entered_closedwon']
)

const closedLostDeals = await searchDeals(
  [{ filters: [
    { propertyName: 'pipeline', operator: 'EQ', value: 'default' },
    { propertyName: 'closedate', operator: 'GTE', value: sixMonthsAgo.toISOString() },
    { propertyName: 'dealstage', operator: 'EQ', value: 'closedlost' },
  ]}],
  ['dealname', 'amount', 'closedate', 'hs_v2_date_entered_closedlost']
)

console.log(`\nTotal closed-won deals (closedate >= ${sixMonthsAgo.toISOString().slice(0,10)}): ${closedWonDeals.length}`)
console.log(`Total closed-lost deals: ${closedLostDeals.length}`)

// Bucket by hs_v2_date_entered_closedwon month
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
const buckets = {}

for (const d of closedWonDeals) {
  const raw = d.properties.hs_v2_date_entered_closedwon
  const mk = raw ? monthKey(new Date(raw)) : 'no-date'
  buckets[mk] = (buckets[mk] || 0) + 1
}

console.log('\n=== Won deals by ACTUAL close month (hs_v2_date_entered_closedwon) ===')
for (const [mk, count] of Object.entries(buckets).sort()) {
  console.log(`  ${mk}: ${count} won`)
}

// Also bucket lost by actual date
const lostBuckets = {}
for (const d of closedLostDeals) {
  const raw = d.properties.hs_v2_date_entered_closedlost
  const mk = raw ? monthKey(new Date(raw)) : 'no-date'
  lostBuckets[mk] = (lostBuckets[mk] || 0) + 1
}

console.log('\n=== Lost deals by ACTUAL close month (hs_v2_date_entered_closedlost) ===')
for (const [mk, count] of Object.entries(lostBuckets).sort()) {
  console.log(`  ${mk}: ${count} lost`)
}

// Show what the trend map would look like
const now = new Date()
console.log('\n=== Trend map (last 6 months) ===')
for (let i = 5; i >= 0; i--) {
  const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
  const mk = monthKey(d)
  const won = buckets[mk] || 0
  const lost = lostBuckets[mk] || 0
  console.log(`  ${mk}: won=${won}, lost=${lost}, total=${won+lost}`)
}

const currentMK = monthKey(now)
const prevMK = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))
console.log(`\ncurrentMonthKey: ${currentMK}`)
console.log(`prevMonthKey: ${prevMK}`)
console.log(`dealsWonThisMonth: ${buckets[currentMK] || 0}`)
console.log(`previous.dealsWon: ${buckets[prevMK] || 0}`)

const curr = buckets[currentMK] || 0
const prev = buckets[prevMK] || 0
if (prev > 0) {
  const pct = ((curr - prev) / prev) * 100
  console.log(`pctDelta: ${Math.round(pct)}% (${pct > 0 ? 'up' : 'down'})`)
}
