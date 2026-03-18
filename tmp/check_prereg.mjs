import 'dotenv/config'

const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN
const res = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    filterGroups: [{ filters: [{ propertyName: 'pipeline', operator: 'EQ', value: '2933345490' }] }],
    properties: ['dealname', 'amount', 'dealstage', 'pipeline'],
    limit: 100,
  }),
})
const d = await res.json()
console.log('Total:', d.total)
const stages = {}
for (const deal of d.results) {
  const s = deal.properties.dealstage
  stages[s] = (stages[s] || 0) + 1
}
console.log('By stage:', JSON.stringify(stages, null, 2))
for (const deal of d.results) {
  console.log(deal.properties.dealname, '|', deal.properties.dealstage, '|', deal.properties.amount)
}
