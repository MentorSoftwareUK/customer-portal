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
  // Find "lead stage tracker" property
  console.log('=== PROPERTIES WITH "lead" or "stage" or "tracker" or "demo" ===');
  const props = await hs('/crm/v3/properties/contacts');
  for (const p of (props.results || [])) {
    if (p.name.includes('lead_stage') || 
        p.name.includes('tracker') || 
        p.label.toLowerCase().includes('lead stage') ||
        p.label.toLowerCase().includes('tracker') ||
        (p.label.toLowerCase().includes('demo') && !p.name.startsWith('hs_'))) {
      console.log(`  ${p.name} - "${p.label}" (type: ${p.type})`);
      if (p.options && p.options.length > 0) {
        for (const o of p.options) {
          console.log(`    ${o.value} = "${o.label}"`);
        }
      }
    }
  }

  // Now do the actual Feb funnel query
  // Form submissions in Feb from the 4 target forms
  const febStart = new Date('2026-02-01T00:00:00.000Z').getTime();
  const febEnd = new Date('2026-02-28T23:59:59.999Z').getTime();
  
  const formNames = [
    'Self Scheduling Form Map',
    'Download Your Free Ofsted Registration Checklist',
    'Reg 32 template download',
    'New Site - Contact',
  ];

  // Search for all contacts created in Feb
  console.log('\n=== Feb 2026 contacts by lifecycle stage (excluding bots) ===');
  
  // Get all Feb contacts with relevant properties (paginate)
  let allContacts = [];
  let after = undefined;
  for (let page = 0; page < 10; page++) {
    const body = {
      filterGroups: [{
        filters: [
          { propertyName: 'createdate', operator: 'GTE', value: String(febStart) },
          { propertyName: 'createdate', operator: 'LTE', value: String(febEnd) },
        ]
      }],
      properties: [
        'email', 'lifecyclestage', 'hs_lead_status', 'disqualification_reason',
        'recent_conversion_event_name', 'first_conversion_event_name',
        'hs_analytics_first_url', 'hs_latest_source',
      ],
      limit: 100,
    };
    if (after) body.after = after;
    
    const data = await hs('/crm/v3/objects/contacts/search', { method: 'POST', body: JSON.stringify(body) });
    allContacts.push(...(data.results || []));
    if (!data.paging?.next?.after) break;
    after = data.paging.next.after;
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log('Total Feb contacts fetched:', allContacts.length);
  
  // Filter out bots
  const nonBots = allContacts.filter(c => {
    const dr = (c.properties.disqualification_reason || '').toLowerCase();
    return dr !== 'bot';
  });
  console.log('Non-bot contacts:', nonBots.length);
  
  // Filter to those from target forms
  const fromTargetForms = nonBots.filter(c => {
    const conv = (c.properties.first_conversion_event_name || '') + ' ' + (c.properties.recent_conversion_event_name || '');
    return formNames.some(fn => conv.toLowerCase().includes(fn.toLowerCase().slice(0, 15)));
  });
  console.log('From target forms:', fromTargetForms.length);
  
  // Count by lifecycle stage
  const stageCounts = {};
  for (const c of nonBots) {
    const stage = c.properties.lifecyclestage || 'unknown';
    stageCounts[stage] = (stageCounts[stage] || 0) + 1;
  }
  console.log('\nAll non-bot Feb contacts by lifecycle:');
  for (const [k, v] of Object.entries(stageCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }
  
  // Also check form-specific contacts
  const formStageCounts = {};
  for (const c of fromTargetForms) {
    const stage = c.properties.lifecyclestage || 'unknown';
    formStageCounts[stage] = (formStageCounts[stage] || 0) + 1;
  }
  console.log('\nTarget form contacts by lifecycle:');
  for (const [k, v] of Object.entries(formStageCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }
}

main().catch(e => console.error(e));
