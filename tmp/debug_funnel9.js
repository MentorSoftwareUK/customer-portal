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
  try { return JSON.parse(text); } catch { console.log('  Raw:', text.slice(0, 200)); return {}; }
}

async function main() {
  // Try different lead pipeline endpoints
  console.log('=== Trying different lead pipeline endpoints ===');
  await hs('/crm/v3/pipelines/0-6');
  
  // Try the objects API with objectTypeId
  console.log('\n=== Trying object schemas ===');
  const schemas = await hs('/crm/v3/schemas');
  if (schemas.results) {
    for (const s of schemas.results) {
      console.log(`  ${s.objectTypeId} = "${s.name}" (${s.labels?.singular})`);
    }
  }

  // Try fetching lead pipeline stages directly
  console.log('\n=== Try CRM extensions / lead pipeline ===');
  await hs('/crm/v3/pipelines/0-136');

  // Try the lead/prospect prospecting pipeline
  console.log('\n=== Try /crm/v3/objects/0-6/search ===');
  const febStart = new Date('2026-02-01T00:00:00.000Z').getTime();
  const res = await hs('/crm/v3/objects/0-6/search', {
    method: 'POST',
    body: JSON.stringify({
      filterGroups: [{
        filters: [
          { propertyName: 'createdate', operator: 'GTE', value: String(febStart) },
        ]
      }],
      properties: [],
      limit: 5,
    })
  });
  console.log('0-6 search results:', res.total, (res.results || []).length);

  // Check contact property that might track lead pipeline stage
  console.log('\n=== Contact properties with "lead" ===');
  const props = await hs('/crm/v3/properties/contacts');
  for (const p of (props.results || [])) {
    const n = p.name.toLowerCase();
    const l = (p.label || '').toLowerCase();
    if ((l.includes('lead') || n.includes('lead')) && !n.startsWith('hs_analytics')) {
      console.log(`  ${p.name} - "${p.label}" (type: ${p.type})`);
      if (p.options && p.options.length < 20) {
        for (const o of p.options) {
          console.log(`    ${o.value} = "${o.label}"`);
        }
      }
    }
  }

  // Check form submissions for the contact form to see what data we can get
  console.log('\n=== Recent "New Site - Contact" submissions (Feb) ===');
  const subs = await hs('/form-integrations/v1/submissions/forms/2e2ce646-a095-46a9-9cc9-94bfdec91dc2?limit=10');
  if (subs.results) {
    for (const sub of subs.results.slice(0, 5)) {
      const values = {};
      for (const v of (sub.values || [])) {
        values[v.name] = v.value;
      }
      console.log(`  ${values.email || 'no email'} - dept: ${values.department || 'none'} - submitted: ${new Date(sub.submittedAt).toISOString().slice(0, 10)}`);
    }
  }
}

main().catch(e => console.error(e));
