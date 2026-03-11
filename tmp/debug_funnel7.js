const { config } = require('dotenv');
config({ path: '/Users/liamkotecha/Documents/mentor-cp/.env' });
const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;

async function hs(path, opts = {}) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  return res.json();
}

async function main() {
  // Maybe it's a lead/contact status value in the HubSpot lead_stage property
  // or maybe it's from the newer lifecycle stage API
  
  // Check if there's a custom "lead_stage" property we missed
  const props = await hs('/crm/v3/properties/contacts');
  
  console.log('=== ALL contact enumeration properties with numeric-looking options ===');
  for (const p of (props.results || [])) {
    if (p.type === 'enumeration' && p.options) {
      const hasMatch = p.options.some(o => /^\d{8,}$/.test(o.value));
      if (hasMatch) {
        console.log(`\n  ${p.name} - "${p.label}"`);
        for (const o of p.options) {
          console.log(`    ${o.value} = "${o.label}"`);
        }
      }
    }
  }

  // Try fetching the specific property by ID through the API
  console.log('\n=== Try fetching contact property by name "1701461227" ===');
  try {
    const p = await hs('/crm/v3/properties/contacts/1701461227');
    console.log(p);
  } catch(e) { console.log('Not found as property name'); }

  // Check ticket properties
  console.log('\n=== TICKET PROPERTIES with relevant options ===');
  const ticketProps = await hs('/crm/v3/properties/tickets');
  for (const p of (ticketProps.results || [])) {
    if (p.options) {
      for (const o of p.options) {
        if (o.value === '1701461227' || o.value.includes('1701461')) {
          console.log(`  ${p.name} ("${p.label}") => ${o.value} = "${o.label}"`);
        }
      }
    }
  }

  // Maybe it's a workflow or automation ID - let's try to find it in ticket pipelines
  console.log('\n=== TICKET PIPELINES ===');
  const tPipelines = await hs('/crm/v3/pipelines/tickets');
  for (const pl of (tPipelines.results || [])) {
    console.log(`Pipeline: ${pl.label} (${pl.id})`);
    for (const s of (pl.stages || [])) {
      console.log(`  ${s.id} = "${s.label}"`);
    }
  }

  // Check the "Pre-Registered Clients" pipeline more closely
  // The user's flow matches: Submission > Lead > SQL > Demo
  // This could map to deal stages in "Pre-Registered Clients" pipeline
  console.log('\n=== Pre-Reg pipeline deals (Feb) ===');
  const febStart = new Date('2026-02-01T00:00:00.000Z').getTime();
  const febEnd = new Date('2026-02-28T23:59:59.999Z').getTime();
  
  const deals = await hs('/crm/v3/objects/deals/search', {
    method: 'POST',
    body: JSON.stringify({
      filterGroups: [{
        filters: [
          { propertyName: 'createdate', operator: 'GTE', value: String(febStart) },
          { propertyName: 'createdate', operator: 'LTE', value: String(febEnd) },
        ]
      }],
      properties: ['dealname', 'dealstage', 'pipeline', 'amount'],
      limit: 50,
    })
  });
  console.log(`Feb deals total: ${deals.total}`);
  const stageCount = {};
  for (const d of (deals.results || [])) {
    const key = `${d.properties.pipeline}|${d.properties.dealstage}`;
    stageCount[key] = (stageCount[key] || 0) + 1;
  }
  console.log('By pipeline|stage:', stageCount);
}

main().catch(e => console.error(e));
