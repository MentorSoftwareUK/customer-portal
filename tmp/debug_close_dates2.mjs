import 'dotenv/config'

const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN

const res = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    filterGroups: [{ filters: [
      { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
    ]}],
    properties: [
      'dealname', 'closedate', 'createdate',
      'hs_v2_date_entered_closedwon',
      'hs_v2_date_entered_closedlost',
    ],
    sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
    limit: 10,
  })
})
const data = await res.json()

console.log('Deal comparison: closedate vs hs_v2_date_entered_closedwon\n')
for (const d of data.results || []) {
  const p = d.properties
  console.log(`${p.dealname}`)
  console.log(`  closedate:     ${p.closedate}`)
  console.log(`  created:       ${p.createdate}`)
  console.log(`  entered_won:   ${p.hs_v2_date_entered_closedwon}`)
  console.log()
}

// Also check closedlost deals
const res2 = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    filterGroups: [{ filters: [
      { propertyName: 'dealstage', operator: 'EQ', value: 'closedlost' },
    ]}],
    properties: [
      'dealname', 'closedate', 'createdate',
      'hs_v2_date_entered_closedwon',
      'hs_v2_date_entered_closedlost',
    ],
    sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
    limit: 5,
  })
})
const data2 = await res2.json()

console.log('--- Closed Lost deals ---\n')
for (const d of data2.results || []) {
  const p = d.properties
  console.log(`${p.dealname}`)
  console.log(`  closedate:     ${p.closedate}`)
  console.log(`  created:       ${p.createdate}`)
  console.log(`  entered_lost:  ${p.hs_v2_date_entered_closedlost}`)
  console.log()
}
