import 'dotenv/config'

const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN

// Check Hope's owner details
const ownerRes = await fetch(`https://api.hubapi.com/crm/v3/owners/588615646`, {
  headers: { Authorization: `Bearer ${token}` },
})
const owner = await ownerRes.json()
console.log('Hope owner record:', JSON.stringify(owner, null, 2))

// Check all owners to see if there's another Hope entry
const allOwners = await fetch('https://api.hubapi.com/crm/v3/owners?limit=100', {
  headers: { Authorization: `Bearer ${token}` },
}).then(r => r.json())

const hopes = (allOwners.results || []).filter(o => 
  (o.firstName || '').toLowerCase().includes('hope') || 
  (o.email || '').toLowerCase().includes('hope') ||
  (o.email || '').toLowerCase().includes('renewal')
)
console.log('\nOwners matching "hope" or "renewal":')
for (const h of hopes) {
  console.log(`  ${h.id}: ${h.firstName} ${h.lastName} <${h.email}>`)
}

// Check companies owned by Hope
const compRes = await fetch('https://api.hubapi.com/crm/v3/objects/companies/search', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    filterGroups: [{ filters: [
      { propertyName: 'hubspot_owner_id', operator: 'EQ', value: '588615646' },
    ]}],
    properties: ['name', 'hubspot_owner_id', 'salesstatus'],
    limit: 5,
  })
})
const compData = await compRes.json()
console.log('\nCompanies owned by Hope:', compData.total)
for (const c of (compData.results || []).slice(0, 5)) {
  console.log(`  ${c.properties.name} (${c.properties.salesstatus})`)
}
