import 'dotenv/config'

const TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }

async function hsSearch(objectType, body) {
  const r = await fetch(`https://api.hubapi.com/crm/v3/objects/${objectType}/search`, {
    method: 'POST', headers, body: JSON.stringify(body),
  })
  return r.json()
}

// 1. Company salesstatus values
const statuses = await hsSearch('companies', {
  filterGroups: [{ filters: [{ propertyName: 'salesstatus', operator: 'HAS_PROPERTY' }] }],
  properties: ['name', 'salesstatus', 'contract_start_date', 'date_left', 'hubspot_owner_id'],
  limit: 20,
})
console.log('Total with salesstatus:', statuses.total)
statuses.results?.slice(0, 10).forEach(c => {
  const p = c.properties
  console.log(`  ${p.name} | status: ${p.salesstatus} | contract: ${p.contract_start_date} | left: ${p.date_left} | owner: ${p.hubspot_owner_id}`)
})

// 2. Paying customers count
const paying = await hsSearch('companies', {
  filterGroups: [{ filters: [{ propertyName: 'salesstatus', operator: 'EQ', value: 'paying_customer' }] }],
  properties: ['name'], limit: 1,
})
console.log('\nPaying customers:', paying.total)

// 3. Churned count
const churned = await hsSearch('companies', {
  filterGroups: [{ filters: [{ propertyName: 'salesstatus', operator: 'EQ', value: 'Past Customer (churned)' }] }],
  properties: ['name', 'date_left'], limit: 10,
})
console.log('Churned customers:', churned.total)
churned.results?.forEach(c => console.log(`  ${c.properties.name} | left: ${c.properties.date_left}`))

// 4. Free deals (amount=0, closed won)
const freeDeals = await hsSearch('deals', {
  filterGroups: [{ filters: [
    { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
    { propertyName: 'amount', operator: 'EQ', value: '0' },
  ] }],
  properties: ['dealname', 'amount', 'closedate', 'hs_mrr', 'hubspot_owner_id'], limit: 5,
})
console.log('\nFree deals (amount=0, closedwon):', freeDeals.total)
freeDeals.results?.forEach(c => console.log(`  ${c.properties.dealname} | mrr: ${c.properties.hs_mrr}`))

// 5. All distinct salesstatus values
const allStatuses = await hsSearch('companies', {
  filterGroups: [{ filters: [{ propertyName: 'salesstatus', operator: 'HAS_PROPERTY' }] }],
  properties: ['salesstatus'], limit: 100,
})
const statusCounts = {}
allStatuses.results?.forEach(c => {
  const v = c.properties.salesstatus || 'empty'
  statusCounts[v] = (statusCounts[v] || 0) + 1
})
console.log('\nSalesstatus distribution:', statusCounts)

// 6. Company properties related to churn/reason
const propsRes = await fetch('https://api.hubapi.com/crm/v3/properties/companies', { headers })
const propsData = await propsRes.json()
const relevant = propsData.results?.filter(p =>
  /churn|reason|leav|cancel|renew|free|trial|plan|subscri|tier/i.test(p.name + ' ' + p.label)
)
console.log('\nRelevant company properties:')
relevant?.forEach(p => console.log(`  ${p.name} (${p.type}) — ${p.label}`))

// 7. Meetings in last 30 days
const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
const meetings = await hsSearch('meetings', {
  filterGroups: [{ filters: [
    { propertyName: 'hs_meeting_start_time', operator: 'GTE', value: thirtyAgo },
  ] }],
  properties: ['hs_meeting_title', 'hs_meeting_start_time', 'hubspot_owner_id', 'hs_meeting_outcome'],
  limit: 5,
})
console.log('\nMeetings (last 30d) total:', meetings.total)
meetings.results?.slice(0, 5).forEach(m => {
  const p = m.properties
  console.log(`  ${p.hs_meeting_title} | ${p.hs_meeting_start_time} | owner: ${p.hubspot_owner_id} | outcome: ${p.hs_meeting_outcome}`)
})
