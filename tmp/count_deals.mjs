import 'dotenv/config'
const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN
const res = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    filterGroups: [{ filters: [
      { propertyName: 'pipeline', operator: 'EQ', value: 'default' },
      { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
    ] }],
    properties: ['dealname'],
    limit: 1,
  }),
})
const json = await res.json()
console.log('Total closedwon deals (all time):', json.total)
