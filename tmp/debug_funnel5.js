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
  // 1. Check all lifecycle stage options for 1701461227
  const props = await hs('/crm/v3/properties/contacts');
  const lcProp = (props.results || []).find(p => p.name === 'lifecyclestage');
  console.log('=== LIFECYCLE STAGES ===');
  for (const o of (lcProp?.options || [])) {
    console.log(`  ${o.value} = "${o.label}" ${o.value === '1701461227' ? ' <<<< MATCH' : ''}`);
  }

  // 2. Check hs_lead_status for qualified/unqualified/demo
  const lsProp = (props.results || []).find(p => p.name === 'hs_lead_status');
  console.log('\n=== LEAD STATUS ===');
  for (const o of (lsProp?.options || [])) {
    console.log(`  ${o.value} = "${o.label}"`);
  }

  // 3. Search for any property with value 1701461227
  console.log('\n=== Properties with option 1701461227 ===');
  for (const p of (props.results || [])) {
    if (p.options) {
      for (const o of p.options) {
        if (o.value === '1701461227') {
          console.log(`  FOUND in property: ${p.name} ("${p.label}") => option "${o.label}"`);
        }
      }
    }
  }

  // 4. Check deal pipelines for qualified-stage-id / unqualified-stage-id
  console.log('\n=== DEAL PIPELINES ===');
  const pipelines = await hs('/crm/v3/pipelines/deals');
  for (const pl of (pipelines.results || [])) {
    console.log(`Pipeline: ${pl.label} (${pl.id})`);
    for (const s of (pl.stages || [])) {
      console.log(`  ${s.id} = "${s.label}"`);
    }
  }

  // 5. Check for "demo" / "qualified" / "disqualified" in any property
  console.log('\n=== Properties with demo/qualified options ===');
  for (const p of (props.results || [])) {
    if (!p.options) continue;
    for (const o of p.options) {
      const v = o.value.toLowerCase();
      const l = (o.label || '').toLowerCase();
      if (v.includes('demo') || l.includes('demo') || 
          v === 'qualified-stage-id' || v === 'unqualified-stage-id') {
        console.log(`  ${p.name} ("${p.label}") => ${o.value} = "${o.label}"`);
      }
    }
  }

  // 6. Get Feb contacts with the specific ID as lifecycle stage
  console.log('\n=== Contacts with lifecyclestage=1701461227 (Feb) ===');
  const febStart = new Date('2026-02-01T00:00:00.000Z').getTime();
  const febEnd = new Date('2026-02-28T23:59:59.999Z').getTime();
  const demoContacts = await hs('/crm/v3/objects/contacts/search', {
    method: 'POST',
    body: JSON.stringify({
      filterGroups: [{
        filters: [
          { propertyName: 'createdate', operator: 'GTE', value: String(febStart) },
          { propertyName: 'createdate', operator: 'LTE', value: String(febEnd) },
          { propertyName: 'lifecyclestage', operator: 'EQ', value: '1701461227' },
        ]
      }],
      properties: ['email', 'lifecyclestage', 'first_conversion_event_name', 'disqualification_reason'],
      limit: 10,
    })
  });
  console.log(`  Total: ${demoContacts.total}`);
  for (const c of (demoContacts.results || [])) {
    console.log(`  ${c.properties.email} - conversion: ${c.properties.first_conversion_event_name}`);
  }
}

main().catch(e => console.error(e));
