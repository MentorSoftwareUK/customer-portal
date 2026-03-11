import 'dotenv/config'

const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN

// 1. Check ticket properties available
const propsRes = await fetch('https://api.hubapi.com/crm/v3/properties/tickets', {
  headers: { Authorization: `Bearer ${token}` },
})
const propsData = await propsRes.json()
const relevantProps = (propsData.results || [])
  .filter(p => ['subject', 'content', 'hs_pipeline', 'hs_pipeline_stage', 'hs_ticket_priority',
    'createdate', 'closed_date', 'hubspot_owner_id', 'hs_ticket_category', 'source_type'].includes(p.name)
    || p.name.includes('create') || p.name.includes('status') || p.name.includes('priority')
  )
  .map(p => `${p.name} (${p.type}) - ${p.label}`)
  .sort()

console.log('Relevant ticket properties:')
for (const p of relevantProps) console.log(`  ${p}`)

// 2. Recent tickets
const ticketRes = await fetch('https://api.hubapi.com/crm/v3/objects/tickets/search', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    filterGroups: [{ filters: [
      { propertyName: 'createdate', operator: 'GTE', value: new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0] },
    ]}],
    properties: ['subject', 'hs_pipeline', 'hs_pipeline_stage', 'hs_ticket_priority', 'createdate', 'closed_date', 'hubspot_owner_id', 'source_type'],
    limit: 100,
    sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
  })
})
const ticketData = await ticketRes.json()
console.log('\nTickets in last 90 days:', ticketData.total || (ticketData.results || []).length)

// Show first few
for (const t of (ticketData.results || []).slice(0, 5)) {
  const p = t.properties
  console.log(`  ${p.subject} | priority: ${p.hs_ticket_priority} | stage: ${p.hs_pipeline_stage} | created: ${p.createdate}`)
}

// 3. Can we get ticket-company associations?
if (ticketData.results?.length > 0) {
  const ticketId = ticketData.results[0].id
  const assocRes = await fetch(`https://api.hubapi.com/crm/v3/objects/tickets/${ticketId}/associations/companies`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const assocData = await assocRes.json()
  console.log('\nSample ticket associations (companies):', JSON.stringify(assocData, null, 2))
}

// 4. Meetings - check if we can get company associations
const meetingRes = await fetch('https://api.hubapi.com/crm/v3/objects/meetings/search', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    filterGroups: [{ filters: [
      { propertyName: 'hs_meeting_start_time', operator: 'GTE', value: new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0] },
    ]}],
    properties: ['hs_meeting_title', 'hs_meeting_start_time', 'hubspot_owner_id'],
    limit: 5,
  })
})
const meetingData = await meetingRes.json()

if (meetingData.results?.length > 0) {
  const meetingId = meetingData.results[0].id
  const assocRes = await fetch(`https://api.hubapi.com/crm/v3/objects/meetings/${meetingId}/associations/companies`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const assocData = await assocRes.json()
  console.log('\nSample meeting associations (companies):', JSON.stringify(assocData, null, 2))
}

// 5. Check company properties for last activity date
const compPropsRes = await fetch('https://api.hubapi.com/crm/v3/properties/companies', {
  headers: { Authorization: `Bearer ${token}` },
})
const compPropsData = await compPropsRes.json()
const activityProps = (compPropsData.results || [])
  .filter(p => p.name.includes('last_') || p.name.includes('activity') || p.name.includes('notes_') 
    || p.name.includes('num_') || p.name.includes('ticket') || p.name.includes('meeting'))
  .map(p => `${p.name} (${p.type}) - ${p.label}`)
  .sort()

console.log('\nCompany activity-related properties:')
for (const p of activityProps) console.log(`  ${p}`)

// 6. Sample paying company with these properties
const sampleRes = await fetch('https://api.hubapi.com/crm/v3/objects/companies/search', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    filterGroups: [{ filters: [
      { propertyName: 'salesstatus', operator: 'EQ', value: 'paying_customer' },
    ]}],
    properties: [
      'name', 'salesstatus', 'notes_last_contacted', 'notes_last_updated',
      'num_associated_deals', 'num_notes', 'num_contacted_notes',
      'hs_last_sales_activity_timestamp', 'hs_last_logged_call_date',
      'hs_latest_meeting_activity', 'engagements_last_meeting_booked',
      'hs_num_open_deals', 'hubspot_owner_id', 'contract_start_date',
    ],
    limit: 10,
  })
})
const sampleData = await sampleRes.json()
console.log('\nSample paying companies with activity data:')
for (const c of (sampleData.results || []).slice(0, 5)) {
  const p = c.properties
  console.log(`  ${p.name}:`)
  console.log(`    notes_last_contacted: ${p.notes_last_contacted}`)
  console.log(`    hs_last_sales_activity: ${p.hs_last_sales_activity_timestamp}`)
  console.log(`    hs_latest_meeting: ${p.hs_latest_meeting_activity}`)
  console.log(`    last_meeting_booked: ${p.engagements_last_meeting_booked}`)
  console.log(`    owner: ${p.hubspot_owner_id}`)
}
