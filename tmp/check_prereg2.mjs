import 'dotenv/config'

const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN

// Check deals in default pipeline with amount = 0 and closedwon
const res = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    filterGroups: [{ filters: [
      { propertyName: 'pipeline', operator: 'EQ', value: 'default' },
      { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
      { propertyName: 'amount', operator: 'EQ', value: '0' },
    ] }],
    properties: ['dealname', 'amount', 'dealstage', 'pipeline', 'closedate'],
    limit: 100,
    sorts: [{ propertyName: 'closedate', direction: 'DESCENDING' }],
  }),
})
const d = await res.json()
console.log('Default pipeline, closedwon, amount=0 total:', d.total)

// Also check deals with "Pre Registered" in name in default pipeline
const res2 = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    filterGroups: [{ filters: [
      { propertyName: 'pipeline', operator: 'EQ', value: 'default' },
      { propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: 'Pre*Registered' },
    ] }],
    properties: ['dealname', 'amount', 'dealstage', 'pipeline'],
    limit: 10,
  }),
})
const d2 = await res2.json()
console.log('\nDefault pipeline, name contains Pre Registered:', d2.total)
if (d2.results) d2.results.forEach(deal => console.log(deal.properties.dealname, '|', deal.properties.dealstage, '|', deal.properties.amount))
