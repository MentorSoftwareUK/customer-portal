import 'dotenv/config'

const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN

// Get recent closed-won deals with all date-related properties
const res = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    filterGroups: [{ filters: [
      { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
    ]}],
    properties: [
      'dealname', 'closedate', 'createdate', 'amount',
      'hs_date_entered_closedwon',
      'hs_date_exited_closedwon',
      'hs_lastmodifieddate',
      'notes_last_updated',
      'contract_start_date',
      'contract_end_date',
      'hs_closed_won_date',
      'hs_date_entered_6419013',
      'hs_v2_date_entered_closedwon',
      'hs_v2_date_exited_closedwon',
    ],
    sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
    limit: 10,
  })
})
const data = await res.json()

console.log('Recent closed-won deals — date comparison:\n')
for (const d of data.results || []) {
  const p = d.properties
  console.log(`Deal: ${p.dealname}`)
  console.log(`  closedate:                  ${p.closedate}`)
  console.log(`  createdate:                 ${p.createdate}`)
  console.log(`  hs_date_entered_closedwon:  ${p.hs_date_entered_closedwon}`)
  console.log(`  contract_start_date:        ${p.contract_start_date}`)
  console.log(`  contract_end_date:          ${p.contract_end_date}`)
  console.log(`  amount:                     ${p.amount}`)
  console.log()
}

// Also check all date properties on deals
const propsRes = await fetch('https://api.hubapi.com/crm/v3/properties/deals', {
  headers: { Authorization: `Bearer ${token}` },
})
const propsData = await propsRes.json()
const dateProps = (propsData.results || [])
  .filter(p => p.type === 'date' || p.type === 'datetime' || p.name.includes('date') || p.name.includes('close'))
  .map(p => `${p.name} (${p.type}) - ${p.label}`)
  .sort()

console.log('--- All date-related deal properties ---')
for (const p of dateProps) console.log(`  ${p}`)
