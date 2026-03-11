import 'dotenv/config'

const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN
const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
const now = new Date().toISOString()

const res = await fetch('https://api.hubapi.com/crm/v3/objects/meetings/search', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    filterGroups: [{ filters: [
      { propertyName: 'hs_meeting_start_time', operator: 'GTE', value: thirtyDaysAgo },
      { propertyName: 'hs_meeting_start_time', operator: 'LTE', value: now },
    ]}],
    properties: ['hubspot_owner_id', 'hs_meeting_title', 'hs_meeting_outcome'],
    limit: 100,
  })
})
const data = await res.json()

const ownerCounts = {}
for (const m of data.results || []) {
  const oid = m.properties.hubspot_owner_id || 'none'
  ownerCounts[oid] = (ownerCounts[oid] || 0) + 1
}

console.log('Total meetings:', (data.results || []).length)
console.log('Paging:', data.paging)
console.log('\nOwner distribution:')
for (const [id, count] of Object.entries(ownerCounts).sort((a,b) => b[1] - a[1])) {
  console.log(`  ${id}: ${count}`)
}

console.log('\nHope (588615646):', ownerCounts['588615646'] || 0)
console.log('Simone (146100483):', ownerCounts['146100483'] || 0)
console.log('Shaun (29248247):', ownerCounts['29248247'] || 0)

// Now let's also specifically search for Hope's meetings
const hopeRes = await fetch('https://api.hubapi.com/crm/v3/objects/meetings/search', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    filterGroups: [{ filters: [
      { propertyName: 'hubspot_owner_id', operator: 'EQ', value: '588615646' },
    ]}],
    properties: ['hubspot_owner_id', 'hs_meeting_title', 'hs_meeting_start_time', 'hs_meeting_outcome'],
    limit: 10,
    sorts: [{ propertyName: 'hs_meeting_start_time', direction: 'DESCENDING' }],
  })
})
const hopeData = await hopeRes.json()
console.log('\n--- Hope meetings (any time, last 10) ---')
console.log('Count:', hopeData.total)
for (const m of (hopeData.results || []).slice(0, 5)) {
  console.log(`  ${m.properties.hs_meeting_start_time} | ${m.properties.hs_meeting_title} | ${m.properties.hs_meeting_outcome}`)
}
