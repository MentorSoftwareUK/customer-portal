const { config } = require('dotenv');
config({ path: '/Users/liamkotecha/Documents/mentor-cp/.env' });
const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;

async function hs(path, opts = {}) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    signal: AbortSignal.timeout(15000),
  });
  return res.json();
}

async function main() {
  // 1. List forms to find exact IDs/names
  console.log('=== FORMS ===');
  const forms = await hs('/marketing/v3/forms?limit=100');
  for (const f of (forms.results || [])) {
    const name = f.name || f.configuration?.name || '';
    if (name.toLowerCase().includes('schedul') || 
        name.toLowerCase().includes('ofsted') || 
        name.toLowerCase().includes('reg 32') || 
        name.toLowerCase().includes('contact') ||
        name.toLowerCase().includes('self sch') ||
        name.toLowerCase().includes('checklist') ||
        name.toLowerCase().includes('download')) {
      console.log(`  ID: ${f.id}  Name: "${f.name}"  Created: ${f.createdAt}`);
    }
  }

  // 2. Check contact properties for lifecycle stage, lead stage, disqualification
  console.log('\n=== CONTACT PROPERTIES (lifecycle/lead/disqualification) ===');
  const props = await hs('/crm/v3/properties/contacts');
  for (const p of (props.results || [])) {
    if (p.name.includes('lifecyclestage') || 
        p.name.includes('lead_stage') ||
        p.name.includes('disqualification') ||
        p.name.includes('demo') ||
        p.label.toLowerCase().includes('lead stage') ||
        p.label.toLowerCase().includes('disqualif')) {
      console.log(`  ${p.name} - "${p.label}" (type: ${p.type})`);
      if (p.options && p.options.length > 0) {
        for (const o of p.options.slice(0, 15)) {
          console.log(`    ${o.value} = "${o.label}"`);
        }
      }
    }
  }

  // 3. Check lifecyclestage values
  console.log('\n=== LIFECYCLESTAGE OPTIONS ===');
  const lsProp = (props.results || []).find(p => p.name === 'lifecyclestage');
  if (lsProp && lsProp.options) {
    for (const o of lsProp.options) {
      console.log(`  ${o.value} = "${o.label}"`);
    }
  }

  // 4. Quick test: search contacts from Feb 2026 that submitted forms
  console.log('\n=== SAMPLE: Feb 2026 contacts with recent_conversion ===');
  const febStart = '2026-02-01T00:00:00.000Z';
  const febEnd = '2026-02-28T23:59:59.999Z';
  const sample = await hs('/crm/v3/objects/contacts/search', {
    method: 'POST',
    body: JSON.stringify({
      filterGroups: [{
        filters: [
          { propertyName: 'createdate', operator: 'GTE', value: new Date(febStart).getTime() },
          { propertyName: 'createdate', operator: 'LTE', value: new Date(febEnd).getTime() },
        ]
      }],
      properties: ['email', 'lifecyclestage', 'hs_lead_status', 'disqualification_reason', 'recent_conversion_event_name', 'first_conversion_event_name'],
      limit: 5,
    })
  });
  console.log('Total Feb contacts:', sample.total);
  for (const c of (sample.results || []).slice(0, 5)) {
    console.log(`  ${c.properties.email}`);
    console.log(`    lifecycle: ${c.properties.lifecyclestage}`);
    console.log(`    lead_status: ${c.properties.hs_lead_status}`);
    console.log(`    disqualification: ${c.properties.disqualification_reason}`);
    console.log(`    recent_conversion: ${c.properties.recent_conversion_event_name}`);
    console.log(`    first_conversion: ${c.properties.first_conversion_event_name}`);
  }
}

main().catch(e => console.error(e));
