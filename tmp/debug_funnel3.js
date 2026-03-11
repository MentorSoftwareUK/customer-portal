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
  // Search ALL contact properties for anything with "demo" or "lead" or "stage" in label
  const props = await hs('/crm/v3/properties/contacts');
  console.log('Total properties:', (props.results || []).length);
  
  for (const p of (props.results || [])) {
    const nameLC = p.name.toLowerCase();
    const labelLC = (p.label || '').toLowerCase();
    if (labelLC.includes('demo') || nameLC.includes('demo') ||
        labelLC.includes('lead stage') || nameLC.includes('lead_stage')) {
      console.log(`  ${p.name} - "${p.label}" (type: ${p.type})`);
      if (p.options && p.options.length > 0) {
        for (const o of p.options.slice(0, 20)) {
          console.log(`    ${o.value} = "${o.label}"`);
        }
      }
    }
  }

  // Also check hs_lead_status
  console.log('\n=== hs_lead_status ===');
  const lsProp = (props.results || []).find(p => p.name === 'hs_lead_status');
  if (lsProp) {
    console.log(`  ${lsProp.name} - "${lsProp.label}" (type: ${lsProp.type})`);
    if (lsProp.options) {
      for (const o of lsProp.options) {
        console.log(`    ${o.value} = "${o.label}"`);
      }
    }
  }

  // Check for form submission events / meetings
  // Look for the self-scheduling form specifically - it's probably a meetings link
  console.log('\n=== MEETINGS LINKS ===');
  // Search for meetings-related properties  
  for (const p of (props.results || [])) {
    const nameLC = p.name.toLowerCase();
    const labelLC = (p.label || '').toLowerCase();
    if (labelLC.includes('meeting') || nameLC.includes('meeting') || 
        labelLC.includes('schedul') || nameLC.includes('schedul')) {
      if (!nameLC.startsWith('hs_sales_email')) {
        console.log(`  ${p.name} - "${p.label}" (type: ${p.type})`);
      }
    }
  }

  // Get a few contacts with demo/meeting data
  console.log('\n=== Sample SQL contacts from Feb ===');
  const febStart = new Date('2026-02-01T00:00:00.000Z').getTime();
  const febEnd = new Date('2026-02-28T23:59:59.999Z').getTime();
  const sample = await hs('/crm/v3/objects/contacts/search', {
    method: 'POST',
    body: JSON.stringify({
      filterGroups: [{
        filters: [
          { propertyName: 'createdate', operator: 'GTE', value: String(febStart) },
          { propertyName: 'createdate', operator: 'LTE', value: String(febEnd) },
          { propertyName: 'lifecyclestage', operator: 'EQ', value: 'salesqualifiedlead' },
        ]
      }],
      properties: [
        'email', 'lifecyclestage', 'hs_lead_status',
        'num_associated_deals', 'hs_latest_meeting_activity',
        'notes_last_updated', 'first_conversion_event_name',
        'recent_conversion_event_name',
      ],
      limit: 10,
    })
  });
  for (const c of (sample.results || []).slice(0, 10)) {
    console.log(`  ${c.properties.email}`);
    console.log(`    hs_lead_status: ${c.properties.hs_lead_status}`);
    console.log(`    num_associated_deals: ${c.properties.num_associated_deals}`);
    console.log(`    hs_latest_meeting_activity: ${c.properties.hs_latest_meeting_activity}`);
    console.log(`    first_conversion: ${c.properties.first_conversion_event_name}`);
  }
}

main().catch(e => console.error(e));
