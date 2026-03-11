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
  // 1. Search ALL deal properties for 1701461227
  console.log('=== DEAL PROPERTIES with option 1701461227 ===');
  const dealProps = await hs('/crm/v3/properties/deals');
  for (const p of (dealProps.results || [])) {
    if (p.options) {
      for (const o of p.options) {
        if (o.value === '1701461227') {
          console.log(`  FOUND: ${p.name} ("${p.label}") => "${o.label}"`);
        }
      }
    }
  }

  // 2. Search deal properties for qualified-stage-id / unqualified-stage-id
  console.log('\n=== DEAL PROPERTIES with qualified/unqualified/demo options ===');
  for (const p of (dealProps.results || [])) {
    if (!p.options) continue;
    for (const o of p.options) {
      const v = o.value.toLowerCase();
      const l = (o.label || '').toLowerCase();
      if (v.includes('qualified') || v.includes('demo') || v.includes('1701461227') ||
          l.includes('demo complete') || l.includes('disqualif') || l.includes('qualif')) {
        console.log(`  ${p.name} ("${p.label}") => ${o.value} = "${o.label}"`);
      }
    }
  }

  // 3. Look for contact properties with "stage" or "tracker" in name/label
  console.log('\n=== CONTACT PROPERTIES with "stage" or "tracker" ===');
  const contactProps = await hs('/crm/v3/properties/contacts');
  for (const p of (contactProps.results || [])) {
    const nameLC = p.name.toLowerCase();
    const labelLC = (p.label || '').toLowerCase();
    if ((labelLC.includes('stage') && !nameLC.startsWith('hs_')) || labelLC.includes('tracker') ||
         nameLC.includes('stage') && !nameLC.startsWith('hs_') && nameLC !== 'lifecyclestage') {
      console.log(`  ${p.name} - "${p.label}" (type: ${p.type})`);
      if (p.options && p.options.length > 0) {
        for (const o of p.options) {
          console.log(`    ${o.value} = "${o.label}"`);
        }
      }
    }
  }

  // 4. Search contacts for property with value 1701461227 in ANY property
  // Try a broad search
  console.log('\n=== Search contacts where ANY property = 1701461227 ===');
  // Check if its a form ID
  console.log('\n=== Forms ===');
  const forms = await hs('/marketing/v3/forms?limit=100');
  for (const f of (forms.results || [])) {
    if (f.id === '1701461227' || f.name?.includes('1701461227')) {
      console.log(`  FORM MATCH: ${f.id} = "${f.name}"`);
    }
  }

  // 5. Maybe it's a custom property value - search all contact props with numeric options
  console.log('\n=== Contact props with option containing 1701461 ===');
  for (const p of (contactProps.results || [])) {
    if (p.options) {
      for (const o of p.options) {
        if (o.value.includes('1701461')) {
          console.log(`  ${p.name} ("${p.label}") => ${o.value} = "${o.label}"`);
        }
      }
    }
  }

  // 6. Check deal stage definitions across all pipelines  
  console.log('\n=== All deal stages containing "demo" ===');
  const pipelines = await hs('/crm/v3/pipelines/deals');
  for (const pl of (pipelines.results || [])) {
    for (const s of (pl.stages || [])) {
      if (s.label.toLowerCase().includes('demo') || s.id === '1701461227') {
        console.log(`  Pipeline "${pl.label}" => ${s.id} = "${s.label}"`);
      }
    }
  }
}

main().catch(e => console.error(e));
