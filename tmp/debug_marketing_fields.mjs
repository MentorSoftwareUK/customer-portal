// Explore HubSpot form fields for marketing dashboard enhancements
import 'dotenv/config'

const TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN
const BASE = 'https://api.hubapi.com'

async function hs(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...opts.headers },
  })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json()
}

const FORMS = {
  selfScheduling: 'b189dcc1-fe5a-40a6-b016-5844ec22f082',
  checklist: '3bdbd33d-bf01-47a2-8020-cc81c353a3be',
  reg32: '68e78eba-b6a5-4900-8f59-613a0aec400c',
  contact: '2e2ce646-a095-46a9-9cc9-94bfdec91dc2',
}

async function main() {
  // 1. Get form definitions to see ALL fields
  console.log('=== FORM DEFINITIONS ===')
  for (const [name, id] of Object.entries(FORMS)) {
    try {
      const form = await hs(`/marketing/v3/forms/${id}`)
      console.log(`\n--- ${name} (${id}) ---`)
      if (form.fieldGroups) {
        for (const fg of form.fieldGroups) {
          for (const f of fg.fields || []) {
            console.log(`  ${f.name} | label: "${f.label}" | type: ${f.fieldType}`)
            if (f.options) {
              for (const o of f.options) {
                console.log(`    -> "${o.label}" (value: ${o.value})`)
              }
            }
          }
        }
      }
    } catch (e) { console.log(`  Error: ${e.message}`) }
  }

  // 2. Get sample form submissions to see actual submitted values
  console.log('\n\n=== SAMPLE SUBMISSIONS (Self Scheduling) ===')
  const subs = await hs(`/form-integrations/v1/submissions/forms/${FORMS.selfScheduling}?limit=5`)
  for (const s of subs.results || []) {
    console.log(`\nSubmission at ${new Date(s.submittedAt).toISOString()}:`)
    for (const v of s.values || []) {
      console.log(`  ${v.name} = "${v.value}"`)
    }
  }

  // 3. Contact form sample — look for "where did you hear about us"
  console.log('\n\n=== SAMPLE SUBMISSIONS (Contact Form) ===')
  const contactSubs = await hs(`/form-integrations/v1/submissions/forms/${FORMS.contact}?limit=5`)
  for (const s of contactSubs.results || []) {
    console.log(`\nSubmission at ${new Date(s.submittedAt).toISOString()}:`)
    for (const v of s.values || []) {
      console.log(`  ${v.name} = "${v.value}"`)
    }
  }

  // 4. Deal owners (for agent breakdown)
  console.log('\n\n=== DEAL OWNERS ===')
  const owners = await hs('/crm/v3/owners/?limit=100')
  for (const o of owners.results || []) {
    console.log(`  ${o.id} | ${o.firstName} ${o.lastName} | ${o.email}`)
  }

  // 5. Sample deals with owner
  console.log('\n\n=== RECENT DEALS WITH OWNERS ===')
  const deals = await hs('/crm/v3/objects/deals/search', {
    method: 'POST',
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: 'pipeline', operator: 'EQ', value: 'default' }] }],
      properties: ['dealname', 'dealstage', 'amount', 'hubspot_owner_id', 'closedate', 'hs_mrr'],
      sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
      limit: 10,
    }),
  })
  for (const d of deals.results || []) {
    const p = d.properties
    console.log(`  ${p.dealname} | owner: ${p.hubspot_owner_id} | stage: ${p.dealstage} | amount: ${p.amount} | mrr: ${p.hs_mrr}`)
  }

  // 6. Check contact properties for provision type, how_did_you_hear
  console.log('\n\n=== CONTACT PROPERTIES (provision/hear) ===')
  const props = await hs('/crm/v3/properties/contacts')
  const interesting = (props.results || []).filter(p =>
    /(provision|hear|how_did|referral|source|stage|what_stage)/i.test(p.name) ||
    /(provision|hear|how did|referral|source|stage)/i.test(p.label)
  )
  for (const p of interesting) {
    console.log(`  ${p.name} | "${p.label}" | type: ${p.type} | fieldType: ${p.fieldType}`)
    if (p.options?.length) {
      for (const o of p.options) {
        console.log(`    -> "${o.label}" (value: ${o.value})`)
      }
    }
  }

  // 7. Check all forms in the account — there may be more forms
  console.log('\n\n=== ALL FORMS ===')
  const allForms = await hs('/marketing/v3/forms?limit=50')
  for (const f of allForms.results || []) {
    console.log(`  ${f.id} | "${f.name}" | created: ${f.createdAt}`)
  }
}

main().catch(console.error)
