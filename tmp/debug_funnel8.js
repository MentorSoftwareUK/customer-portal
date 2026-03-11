const { config } = require('dotenv');
config({ path: '/Users/liamkotecha/Documents/mentor-cp/.env' });
const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;

async function hs(path, opts = {}) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { console.log('Raw response:', text); return {}; }
}

async function main() {
  // 1. Lead pipelines
  console.log('=== LEAD PIPELINES ===');
  const pipelines = await hs('/crm/v3/pipelines/leads');
  for (const pl of (pipelines.results || [])) {
    console.log(`Pipeline: ${pl.label} (${pl.id})`);
    for (const s of (pl.stages || [])) {
      console.log(`  ${s.id} = "${s.label}" ${s.id === '1701461227' ? ' <<<< MATCH' : ''}`);
    }
  }

  // 2. Lead properties
  console.log('\n=== LEAD PROPERTIES ===');
  const leadProps = await hs('/crm/v3/properties/leads');
  const relevant = (leadProps.results || []).filter(p => 
    !p.name.startsWith('hs_') || p.name === 'hs_lead_status' || p.name === 'hs_pipeline_stage'
  );
  for (const p of relevant.slice(0, 30)) {
    console.log(`  ${p.name} - "${p.label}" (type: ${p.type})`);
    if (p.options && p.options.length > 0 && p.options.length < 20) {
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
      properties: ['hs_lead_label', 'hs_pipeline_stage', 'hs_pipeline', 'hs_lead_status'],
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

  // 4. Check the "New Site - Contact" form structure to find the sales dropdown
  console.log('\n=== New Site - Contact form fields ===');
  const formId = '2e2ce646-a095-46a9-9cc9-94bfdec91dc2';
  const form = await hs(`/marketing/v3/forms/${formId}`);
  if (form.fieldGroups) {
    for (const fg of form.fieldGroups) {
      for (const f of (fg.fields || [])) {
        console.log(`  ${f.name} - "${f.label}" (type: ${f.fieldType})`);
        if (f.options) {
          for (const o of f.options.slice(0, 10)) {
            console.log(`    ${o.value} = "${o.label}"`);
          }
        }
      }
    }
  }
}

main().catch(e => console.error(e));
