import 'dotenv/config'

const TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }

async function hsSearch(objectType, body) {
  const r = await fetch(`https://api.hubapi.com/crm/v3/objects/${objectType}/search`, {
    method: 'POST', headers, body: JSON.stringify(body),
  })
  return r.json()
}

// 1. Get cancellation reason options
const propsRes = await fetch('https://api.hubapi.com/crm/v3/properties/companies/what_prompted_you_to_consider_cancelling_mentor_software', { headers })
const prop = await propsRes.json()
console.log('Cancellation reason options:')
prop.options?.forEach(o => console.log(`  ${o.value} — ${o.label}`))

// 2. Leaving reason (other) - free text, check a few
const leavingRes = await hsSearch('companies', {
  filterGroups: [{ filters: [{ propertyName: 'the_main_reason_you_re_leaving__other_', operator: 'HAS_PROPERTY' }] }],
  properties: ['name', 'the_main_reason_you_re_leaving__other_', 'salesstatus'], limit: 10
})
console.log('\nCompanies with leaving reason:', leavingRes.total)
leavingRes.results?.forEach(c => console.log(`  ${c.properties.name} | status: ${c.properties.salesstatus} | reason: ${c.properties.the_main_reason_you_re_leaving__other_}`))

// 3. Companies with cancellation reason
const cancelRes = await hsSearch('companies', {
  filterGroups: [{ filters: [{ propertyName: 'what_prompted_you_to_consider_cancelling_mentor_software', operator: 'HAS_PROPERTY' }] }],
  properties: ['name', 'what_prompted_you_to_consider_cancelling_mentor_software', 'salesstatus', 'date_left'], limit: 20
})
console.log('\nCompanies with cancellation reason:', cancelRes.total)
cancelRes.results?.forEach(c => {
  const p = c.properties
  console.log(`  ${p.name} | status: ${p.salesstatus} | reason: ${p.what_prompted_you_to_consider_cancelling_mentor_software} | left: ${p.date_left}`)
})

// 4. Find all owner IDs (find Simone, Shaun)
const ownersRes = await fetch('https://api.hubapi.com/crm/v3/owners', { headers })
const owners = await ownersRes.json()
console.log('\nAll owners:')
owners.results?.forEach(o => console.log(`  ${o.id} — ${o.firstName} ${o.lastName} (${o.email})`))

// 5. Free deals that later converted (check if there are deals with same company that have amount > 0)
// First get free deal company associations
const freeDeals = await hsSearch('deals', {
  filterGroups: [{ filters: [
    { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
    { propertyName: 'amount', operator: 'EQ', value: '0' },
  ] }],
  properties: ['dealname', 'amount', 'closedate', 'hubspot_owner_id', 'pipeline'], limit: 20
})
console.log('\nFree deals (first 10):')
freeDeals.results?.slice(0, 10).forEach(d => {
  console.log(`  ${d.properties.dealname} | close: ${d.properties.closedate} | pipeline: ${d.properties.pipeline}`)
})

// 6. Count paying deals (amount > 0, closed won)
const payDeals = await hsSearch('deals', {
  filterGroups: [{ filters: [
    { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
    { propertyName: 'amount', operator: 'GT', value: '0' },
  ] }],
  properties: ['dealname'], limit: 1
})
console.log('\nPaying deals (amount>0, closedwon):', payDeals.total)

// 7. Meetings by Success team owners (we'll figure out IDs from step 4)
