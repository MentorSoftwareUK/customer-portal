import 'dotenv/config'

const TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN
const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }

async function go() {
  // Get company properties that might indicate pre-reg
  const compPropsRes = await fetch('https://api.hubapi.com/crm/v3/properties/companies', { headers })
  const compProps = await compPropsRes.json()
  const preRegProps = compProps.results.filter(p =>
    p.name.includes('prereg') || p.name.includes('pre_reg') || p.name.includes('free') ||
    p.name.includes('registration') || p.name.includes('trial') ||
    (p.label && (p.label.toLowerCase().includes('pre-reg') || p.label.toLowerCase().includes('free') || p.label.toLowerCase().includes('trial')))
  )
  console.log('=== Company properties related to pre-reg/free/trial ===')
  for (const p of preRegProps) {
    console.log(' ', p.name, '->', JSON.stringify(p.label))
  }

  // Check salesstatus options
  const ssRes = await fetch('https://api.hubapi.com/crm/v3/properties/companies/salesstatus', { headers })
  const ss = await ssRes.json()
  console.log('\n=== salesstatus options ===')
  for (const o of (ss.options || [])) {
    console.log(' ', o.value, '->', o.label)
  }

  // For each new customer, check if they were formerly a free customer
  // by looking at deal stages involving free/prereg
  const companyIds = [
    '400539457771', '392798133465', '371948973279', '373156976848',
    '317410917595', '192342941938', '187665745104', '105947701441', '47456031979'
  ]

  const readRes = await fetch('https://api.hubapi.com/crm/v3/objects/companies/batch/read', {
    method: 'POST', headers,
    body: JSON.stringify({
      inputs: companyIds.map(id => ({ id })),
      properties: ['name', 'salesstatus', 'hs_analytics_source', 'lifecyclestage',
        'hs_lead_status', 'num_associated_deals', 'createdate', 'installdate', 'contract_start_date',
        ...preRegProps.map(p => p.name)],
    })
  })
  const readData = await readRes.json()
  console.log('\n=== New customer details ===')
  for (const c of (readData.results || [])) {
    const props = Object.fromEntries(
      Object.entries(c.properties).filter(([k, v]) => v && k !== 'hs_object_id' && k !== 'hs_lastmodifieddate' && k !== 'createdate')
    )
    console.log(c.properties.name, JSON.stringify(props, null, 2))
  }

  // Check deal stages
  const stagesRes = await fetch('https://api.hubapi.com/crm/v3/pipelines/deals', { headers })
  const stagesData = await stagesRes.json()
  console.log('\n=== Deal pipelines ===')
  for (const p of (stagesData.results || [])) {
    console.log(p.id, p.label)
    for (const s of (p.stages || [])) {
      if (s.label.toLowerCase().includes('free') || s.label.toLowerCase().includes('pre') || s.label.toLowerCase().includes('reg')) {
        console.log('  >>> ', s.id, s.label)
      }
    }
  }
}

go().catch(e => console.error(e))
