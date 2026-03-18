import 'dotenv/config'

const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN
const BASE = 'https://api.hubapi.com'

async function searchDeals(filterGroups, properties) {
  const all = []
  let after
  for (;;) {
    const body = { filterGroups, properties, limit: 100 }
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

// Get the last 3 months of closedwon deals
const threeMonthsAgo = new Date(2026, 0, 1) // Jan 2026
const deals = await searchDeals(
  [{ filters: [
    { propertyName: 'pipeline', operator: 'EQ', value: 'default' },
    { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
    { propertyName: 'closedate', operator: 'GTE', value: threeMonthsAgo.toISOString() },
  ] }],
  ['dealname', 'amount', 'closedate', 'days_to_close', 'hs_v2_date_entered_closedwon']
)

// Group by month using hs_v2_date_entered_closedwon
const months = {}
for (const d of deals) {
  const raw = d.properties.hs_v2_date_entered_closedwon
  if (!raw) continue
  const dt = new Date(raw)
  const mk = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
  if (!months[mk]) months[mk] = []
  const days = parseFloat(d.properties.days_to_close || '0') || 0
  months[mk].push({ name: d.properties.dealname, days })
}

for (const [month, deals] of Object.entries(months).sort()) {
  const avg = Math.round(deals.reduce((s, d) => s + d.days, 0) / deals.length)
  console.log(`${month}: avg ${avg}d (${deals.length} deals)`)
  for (const d of deals) {
    console.log(`  ${d.name}: ${d.days}d`)
  }
}
