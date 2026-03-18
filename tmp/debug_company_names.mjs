import 'dotenv/config'
const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN
const BASE = 'https://api.hubapi.com'

// Get a few free deals
const res = await fetch(`${BASE}/crm/v3/objects/deals/search`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    filterGroups: [{ filters: [
      { propertyName: 'pipeline', operator: 'EQ', value: 'default' },
      { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
      { propertyName: 'amount', operator: 'EQ', value: '0' },
    ] }],
    properties: ['dealname', 'amount'],
    limit: 5,
  }),
})
const deals = (await res.json()).results
console.log('Sample deals:', deals.map(d => `${d.id}: ${d.properties.dealname}`))

// Get associations
const assocRes = await fetch(`${BASE}/crm/v4/associations/deals/companies/batch/read`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ inputs: deals.map(d => ({ id: d.id })) }),
})
const assocJson = await assocRes.json()
const companyIds = []
for (const r of assocJson.results) {
  const cid = r.to?.[0]?.toObjectId
  console.log(`Deal ${r.from.id} -> Company ${cid}`)
  if (cid) companyIds.push(String(cid))
}

// Try to read those companies
console.log('\nBatch reading companies:', companyIds)
const compRes = await fetch(`${BASE}/crm/v3/objects/companies/batch/read`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ inputs: companyIds.map(id => ({ id })), properties: ['name'] }),
})
const compJson = await compRes.json()
console.log('Results:', compJson.results?.length, 'Errors:', compJson.numErrors)
for (const c of compJson.results || []) {
  console.log(`  ${c.id}: ${c.properties.name}`)
}
if (compJson.errors) {
  for (const e of compJson.errors) {
    console.log(`  ERROR: ${e.message}`, e.context?.ids)
  }
}
