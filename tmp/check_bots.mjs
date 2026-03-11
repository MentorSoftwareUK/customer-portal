import { readFileSync } from 'fs'
import { resolve } from 'path'
const envFile = readFileSync(resolve(import.meta.dirname, '../.env'), 'utf8')
for (const line of envFile.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN

async function hs(path, opts = {}) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    signal: AbortSignal.timeout(15000),
  })
  return res.json()
}

// Check Feb contacts for bot markers
const data = await hs('/crm/v3/objects/contacts/search', {
  method: 'POST',
  body: JSON.stringify({
    filterGroups: [{
      filters: [
        { propertyName: 'createdate', operator: 'GTE', value: String(new Date('2026-02-01').getTime()) },
        { propertyName: 'createdate', operator: 'LTE', value: String(new Date('2026-02-28T23:59:59').getTime()) },
      ]
    }],
    properties: ['email', 'disqualification_reason', 'hs_lead_status', 'lifecyclestage'],
    limit: 100,
  })
})

const bots = (data.results || []).filter(c => 
  (c.properties.disqualification_reason || '').toLowerCase() === 'bot'
)
console.log(`Total Feb contacts: ${data.total}`)
console.log(`Bots: ${bots.length}`)
for (const b of bots.slice(0, 5)) {
  console.log(`  ${b.properties.email} | reason=${b.properties.disqualification_reason}`)
}
