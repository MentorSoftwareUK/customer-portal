import 'dotenv/config'

const TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN
if (!TOKEN) { console.error('No token'); process.exit(1) }

const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }

async function go() {
  // 1. Check pre-reg pipeline deals
  const prRes = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: 'pipeline', operator: 'EQ', value: '2933345490' }] }],
      properties: ['pipeline', 'dealname', 'dealstage'],
      limit: 5,
    }),
  })
  const prData = await prRes.json()
  console.log('=== PRE-REG PIPELINE DEALS ===')
  console.log('Total:', prData.total)
  if (prData.results) {
    for (const d of prData.results.slice(0, 3)) {
      console.log(' ', d.id, d.properties.dealname, 'stage:', d.properties.dealstage)
      const aRes = await fetch(`https://api.hubapi.com/crm/v4/objects/deals/${d.id}/associations/companies?limit=10`, { headers })
      const aData = await aRes.json()
      console.log('   company assocs:', JSON.stringify(aData.results?.map(r => r.toObjectId) ?? []))
    }
  }

  // 2. Check closed_lost_reason property exists
  const propRes = await fetch('https://api.hubapi.com/crm/v3/properties/deals/closed_lost_reason', { headers })
  console.log('\n=== closed_lost_reason property ===')
  console.log('Status:', propRes.status)
  if (propRes.ok) {
    const propData = await propRes.json()
    console.log('Name:', propData.name, 'Type:', propData.type, 'Label:', propData.label)
  } else {
    console.log('NOT FOUND')
  }

  // 3. Search all deal properties with lost/reason/cancel in name
  const allPropsRes = await fetch('https://api.hubapi.com/crm/v3/properties/deals', { headers })
  const allProps = await allPropsRes.json()
  const relevant = allProps.results.filter(p =>
    p.name.includes('lost') || p.name.includes('reason') || p.name.includes('cancel') || (p.label && p.label.toLowerCase().includes('lost reason'))
  )
  console.log('\n=== Deal properties with lost/reason/cancel ===')
  for (const p of relevant) {
    console.log(' ', p.name, '->', JSON.stringify(p.label))
  }

  // 4. Sample a churned company's deals to see what properties have values
  const churnRes = await fetch('https://api.hubapi.com/crm/v3/objects/companies/search', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: 'salesstatus', operator: 'EQ', value: 'Past Customer' }] }],
      properties: ['name', 'date_left'],
      limit: 3,
      sorts: [{ propertyName: 'date_left', direction: 'DESCENDING' }],
    }),
  })
  const churnData = await churnRes.json()
  console.log('\n=== Sample churned company deals ===')
  for (const c of (churnData.results ?? []).slice(0, 2)) {
    console.log('Company:', c.properties.name, 'date_left:', c.properties.date_left)
    const daRes = await fetch(`https://api.hubapi.com/crm/v4/objects/companies/${c.id}/associations/deals?limit=10`, { headers })
    const daData = await daRes.json()
    const dealIds = (daData.results ?? []).map(r => r.toObjectId)
    console.log('  deal IDs:', dealIds)
    if (dealIds.length > 0) {
      const drRes = await fetch('https://api.hubapi.com/crm/v3/objects/deals/batch/read', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          inputs: dealIds.map(id => ({ id })),
          properties: relevant.map(p => p.name),
        }),
      })
      const drData = await drRes.json()
      for (const d of (drData.results ?? [])) {
        const nonNull = Object.entries(d.properties).filter(([k, v]) => v && !k.startsWith('hs_') && k !== 'createdate' && k !== 'hs_object_id' && k !== 'hs_lastmodifieddate')
        console.log('  Deal', d.id, ':', JSON.stringify(Object.fromEntries(nonNull)))
      }
    }
  }
}

go().catch(e => console.error(e))
