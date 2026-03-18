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

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`

const paying = await searchCompanies(
  [{ filters: [{ propertyName: 'salesstatus', operator: 'EQ', value: 'paying_customer' }] }],
  ['name', 'salesstatus', 'installdate', 'contract_start_date']
)

const churned = await searchCompanies(
  [{ filters: [{ propertyName: 'salesstatus', operator: 'EQ', value: 'Past Customer' }] }],
  ['name', 'salesstatus', 'date_left', 'installdate', 'contract_start_date']
)

console.log(`Live paying: ${paying.length}`)
console.log(`Churned: ${churned.length}`)

const now = new Date()

// Walk backwards from today, showing paying count at end of each month
let est = paying.length
console.log(`\n${'Month'.padEnd(10)} ${'Paying'.padEnd(10)} ${'New'.padEnd(6)} ${'Churned'.padEnd(8)}`)

for (let i = 0; i <= 11; i++) {
  const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
  const mk = monthKey(d)
  
  const churnCount = churned.filter(c => {
    const dl = c.properties.date_left
    return dl ? monthKey(new Date(dl)) === mk : false
  }).length
  
  const newCount = paying.filter(c => {
    const cs = c.properties.installdate ?? c.properties.contract_start_date
    return cs ? monthKey(new Date(cs)) === mk : false
  }).length
  
  console.log(`${mk.padEnd(10)} ${String(est).padEnd(10)} ${String(newCount).padEnd(6)} ${String(churnCount).padEnd(8)}`)
  
  // Undo this month to get previous month's ending count
  est = est + churnCount - newCount
}
