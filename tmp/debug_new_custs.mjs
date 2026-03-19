import 'dotenv/config'

const TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN
const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }

async function go() {
  const r = await fetch('https://api.hubapi.com/crm/v3/objects/companies/search', {
    method: 'POST', headers,
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: 'salesstatus', operator: 'EQ', value: 'paying_customer' }] }],
      properties: ['name', 'installdate', 'contract_start_date', 'lifecyclestage', 'hubspot_owner_id'],
      limit: 200,
      sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
    })
  })
  const d = await r.json()
  const now = Date.now()
  const sixtyDays = 60 * 86400000
  const newCusts = d.results.filter(c => {
    const s = c.properties.installdate || c.properties.contract_start_date
    if (!s) return false
    return (now - new Date(s).getTime()) < sixtyDays
  })
  console.log('New customers in 60d window:', newCusts.length)

  for (const c of newCusts) {
    const s = c.properties.installdate || c.properties.contract_start_date
    const days = Math.floor((now - new Date(s).getTime()) / 86400000)

    // Check all deals for this company
    const aRes = await fetch(`https://api.hubapi.com/crm/v4/objects/companies/${c.id}/associations/deals?limit=100`, { headers })
    const aData = await aRes.json()
    const dealIds = (aData.results || []).map(r => r.toObjectId)

    let pipelines = []
    if (dealIds.length > 0) {
      const dRes = await fetch('https://api.hubapi.com/crm/v3/objects/deals/batch/read', {
        method: 'POST', headers,
        body: JSON.stringify({
          inputs: dealIds.map(id => ({ id })),
          properties: ['pipeline', 'dealname', 'dealstage'],
        })
      })
      const dData = await dRes.json()
      pipelines = (dData.results || []).map(d => d.properties.pipeline)
    }

    const isPreReg = pipelines.includes('2933345490')
    console.log(' ', c.id, c.properties.name, 'Day', days,
      'lifecycle:', c.properties.lifecyclestage,
      'deals:', dealIds.length,
      'pipelines:', pipelines.join(','),
      isPreReg ? '*** PRE-REG ***' : '')
  }
}

go().catch(e => console.error(e))
