import 'dotenv/config'

const TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN
if (!TOKEN) { console.error('No HUBSPOT_PRIVATE_APP_TOKEN'); process.exit(1) }

const BASE = 'https://api.hubapi.com'

async function hsFetch(path, init) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`HubSpot ${res.status}: ${txt}`)
  }
  return res.json()
}

// 1. Check what the property is actually called
console.log('=== Checking property definition ===')
try {
  const prop = await hsFetch('/crm/v3/properties/contacts/what_stage_are_you_at_')
  console.log('Property found:', prop.name, '| Label:', prop.label, '| Type:', prop.type)
  console.log('Options:', prop.options?.map(o => `"${o.label}" (value: "${o.value}")`))
} catch (e) {
  console.log('Property what_stage_are_you_at_ NOT found, trying without trailing underscore...')
  try {
    const prop = await hsFetch('/crm/v3/properties/contacts/what_stage_are_you_at')
    console.log('Property found:', prop.name, '| Label:', prop.label, '| Type:', prop.type)
    console.log('Options:', prop.options?.map(o => `"${o.label}" (value: "${o.value}")`))
  } catch (e2) {
    console.log('Also not found. Searching all contact properties for "stage"...')
    const all = await hsFetch('/crm/v3/properties/contacts')
    const matches = all.results.filter(p => 
      p.name.includes('stage') || p.label.toLowerCase().includes('stage')
    )
    for (const m of matches) {
      console.log(`  ${m.name} | "${m.label}" | type: ${m.type}`)
      if (m.options?.length) {
        for (const o of m.options) console.log(`    -> "${o.label}" (value: "${o.value}")`)
      }
    }
  }
}

// 2. Search for contacts with that property populated
console.log('\n=== Contacts with what_stage_are_you_at_ populated ===')
try {
  const data = await hsFetch('/crm/v3/objects/contacts/search', {
    method: 'POST',
    body: JSON.stringify({
      filterGroups: [{
        filters: [{
          propertyName: 'what_stage_are_you_at_',
          operator: 'HAS_PROPERTY',
        }]
      }],
      properties: ['email', 'what_stage_are_you_at_', 'firstname', 'lastname'],
      limit: 50,
    })
  })
  console.log(`Found ${data.total} contacts with property set`)
  const stageCounts = {}
  for (const c of data.results ?? []) {
    const stage = c.properties.what_stage_are_you_at_
    stageCounts[stage] = (stageCounts[stage] || 0) + 1
    // Show first few
    if ((data.results.indexOf(c)) < 5) {
      console.log(`  ${c.properties.email} -> "${stage}"`)
    }
  }
  console.log('Stage distribution:', stageCounts)
} catch(e) {
  console.log('Search failed:', e.message)
}

// 3. Check Self Scheduling form submissions for Feb 2026
console.log('\n=== Self Scheduling Form submissions (Feb 2026) ===')
const FORM_ID = 'b189dcc1-fe5a-40a6-b016-5844ec22f082'
const startMs = new Date('2026-02-01T00:00:00.000Z').getTime()
const endMs = new Date('2026-03-01T00:00:00.000Z').getTime()

const qs = new URLSearchParams({ limit: '50' })
const formData = await hsFetch(`/form-integrations/v1/submissions/forms/${FORM_ID}?${qs}`)
const febSubs = (formData.results ?? []).filter(s => s.submittedAt >= startMs && s.submittedAt < endMs)
console.log(`Feb submissions: ${febSubs.length}`)

// Show the field names available in each submission
if (febSubs.length > 0) {
  const first = febSubs[0]
  console.log('Fields in first submission:', first.values?.map(v => v.name))
  
  // Collect emails
  const emails = febSubs.map(s => {
    const vals = new Map(s.values?.map(v => [v.name, v.value]))
    return vals.get('email')?.toLowerCase()
  }).filter(Boolean)
  console.log(`Emails found: ${emails.length}`)
  
  // Look up their contact stages
  if (emails.length > 0) {
    console.log('\n=== Contact stages for Feb self-scheduling submitters ===')
    const contactData = await hsFetch('/crm/v3/objects/contacts/search', {
      method: 'POST',
      body: JSON.stringify({
        filterGroups: [{
          filters: [{
            propertyName: 'email',
            operator: 'IN',
            values: emails.slice(0, 50),
          }]
        }],
        properties: ['email', 'what_stage_are_you_at_'],
        limit: 100,
      })
    })
    
    const demoStages = new Set([
      'Newly Registered',
      'Registered – Single Home',
      'Registered – Multiple Homes',
      'Registered - Single Home',
      'Registered - Multiple Homes',
    ])
    
    let demoCount = 0
    const stageDist = {}
    for (const c of contactData.results ?? []) {
      const stage = c.properties.what_stage_are_you_at_ ?? '(empty)'
      stageDist[stage] = (stageDist[stage] || 0) + 1
      if (demoStages.has(stage)) demoCount++
    }
    console.log(`Contacts found: ${contactData.total}`)
    console.log('Stage distribution:', stageDist)
    console.log(`Would count as demo by stage: ${demoCount}`)
  }
}
