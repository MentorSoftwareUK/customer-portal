import 'dotenv/config'

const TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN
const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }

async function go() {
  const companyIds = [
    '400539457771', '392798133465', '371948973279', '373156976848',
    '317410917595', '192342941938', '187665745104', '105947701441', '47456031979'
  ]

  const res = await fetch('https://api.hubapi.com/crm/v3/objects/companies/batch/read', {
    method: 'POST', headers,
    body: JSON.stringify({
      inputs: companyIds.map(id => ({ id })),
      properties: ['name', 'registration_status', 'hs_v2_date_entered_2520059085', 'hs_v2_date_exited_2520059085'],
    })
  })
  const data = await res.json()
  console.log('=== Pre-reg lifecycle + registration status ===')
  for (const c of (data.results || [])) {
    console.log(c.properties.name,
      '| registration_status:', c.properties.registration_status,
      '| entered pre-reg stage:', c.properties.hs_v2_date_entered_2520059085 || 'never')
  }
}

go().catch(e => console.error(e))
