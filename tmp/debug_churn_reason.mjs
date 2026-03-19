import 'dotenv/config'

const TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN
const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }

async function go() {
  const churnRes = await fetch('https://api.hubapi.com/crm/v3/objects/companies/search', {
    method: 'POST', headers,
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: 'salesstatus', operator: 'EQ', value: 'Past Customer' }] }],
      properties: ['name', 'date_left', 'what_prompted_you_to_consider_cancelling_mentor_software', 'the_main_reason_you_re_leaving__other_'],
      limit: 10,
      sorts: [{ propertyName: 'date_left', direction: 'DESCENDING' }],
    }),
  })
  const churnData = await churnRes.json()
  
  console.log('=== Recently churned - company cancellation fields ===')
  for (const c of (churnData.results || []).slice(0, 5)) {
    console.log(c.properties.name, '|', c.properties.date_left,
      '| cancel_reason:', c.properties.what_prompted_you_to_consider_cancelling_mentor_software || '(empty)',
      '| other:', c.properties.the_main_reason_you_re_leaving__other_ || '(empty)')
    
    // Now check deal closed_lost_reason
    const aRes = await fetch(`https://api.hubapi.com/crm/v4/objects/companies/${c.id}/associations/deals?limit=100`, { headers })
    const aData = await aRes.json()
    const dealIds = (aData.results || []).map(r => r.toObjectId)
    
    if (dealIds.length > 0) {
      const dRes = await fetch('https://api.hubapi.com/crm/v3/objects/deals/batch/read', {
        method: 'POST', headers,
        body: JSON.stringify({
          inputs: dealIds.map(id => ({ id })),
          properties: ['closed_lost_reason', 'dealstage', 'closedate', 'dealname'],
        })
      })
      const dData = await dRes.json()
      for (const d of (dData.results || [])) {
        if (d.properties.closed_lost_reason) {
          console.log('  -> Deal:', d.properties.dealname, '| closed_lost_reason:', d.properties.closed_lost_reason)
        }
      }
    } else {
      console.log('  -> No deals found')
    }
  }
}

go().catch(e => console.error(e))
