const { config } = require('dotenv');
config({ path: '/Users/liamkotecha/Documents/mentor-cp/.env' });
const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;

async function hs(path, opts = {}) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  console.log(`${path} => ${res.status}`);
  const text = await res.text();
  try { return JSON.parse(text); } catch { console.log('  Raw:', text.slice(0, 300)); return {}; }
}

async function main() {
  // 1. Lead pipelines
  console.log('=== LEAD PIPELINES ===');
  const pipelines = await hs('/crm/v3/pipelines/leads');
  for (const pl of (pipelines.results || [])) {
    console.log(`\nPipeline: ${pl.label} (${pl.id})`);
    for (const s of (pl.stages || [])) {
      console.log(`  ${s.id} = "${s.label}" (displayOrder: ${s.displayOrder})`);
    }
  }

  // 2. Lead properties
  console.log('\n=== LEAD PROPERTIES ===');
  const leadProps = await hs('/crm/v3/properties/leads');
  for (const p of (leadProps.results || []).filter(p => !p.name.startsWith('hs_') || ['hs_pipeline', 'hs_pipeline_stage', 'hs_lead_status', 'hs_lead_label'].includes(p.name))) {
    console.log(`  ${p.name} - "${p.label}" (type: ${p.type})`);
    if (p.options && p.options.length < 25) {
      for (const o of p.options) {
        console.log(`    ${o.value} = "${o.label}"`);
      }
    }
  }

  // 3. Feb leads
  console.log('\n=== FEB 2026 LEADS ===');
  const febStart = new Date('2026-02-01T00:00:00.000Z').getTime();
  const febEnd = new Date('2026-02-28T23:59:59.999Z').getTime();
  const leads = await hs('/crm/v3/objects/leads/search', {
    method: 'POST',
    body: JSON.stringify({
      filterGroups: [{
        filters: [
          { propertyName: 'createdate', operator: 'GTE', value: String(febStart) },
          { propertyName: 'createdate', operator: 'LTE', value: String(febEnd) },
        ]
      }],
      properties: ['hs_lead_label', 'hs_pipeline_stage', 'hs_pipeline', 'hs_lead_status', 'hs_lead_name'],
      limit: 100,
    })
  });
  console.log(`Total Feb leads: ${leads.total}`);
  
  const stageCount = {};
  for (const l of (leads.results || [])) {
    const stage = l.properties.hs_pipeline_stage || 'unknown';
    stageCount[stage] = (stageCount[stage] || 0) + 1;
  }
  console.log('By stage:', stageCount);

  // Show a few leads
  for (const l of (leads.results || []).slice(0, 5)) {
    console.log(`  ${l.id}: label="${l.properties.hs_lead_label}" stage=${l.properties.hs_pipeline_stage} name="${l.properties.hs_lead_name}"`);
  }

  // 4. Check associations - leads to contacts
  console.log('\n=== LEAD-CONTACT ASSOCIATIONS (first 3) ===');
  for (const l of (leads.results || []).slice(0, 3)) {
    const assoc = await hs(`/crm/v4/objects/leads/${l.id}/associations/contacts`);
    console.log(`  Lead ${l.id} => contacts:`, (assoc.results || []).map(a => a.toObjectId));
  }
}

main().catch(e => console.error(e));
