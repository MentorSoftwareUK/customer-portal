const { config } = require('dotenv');
config({ path: '/Users/liamkotecha/Documents/mentor-cp/.env' });
const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;

async function hs(path, opts = {}) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text();
    console.log(`${path} => ${res.status}: ${text.slice(0, 200)}`);
    return {};
  }
  return res.json();
}

async function searchAll(path, body) {
  const results = [];
  let after;
  for (let i = 0; i < 10; i++) {
    const b = { ...body, limit: 100 };
    if (after) b.after = after;
    const r = await hs(path, { method: 'POST', body: JSON.stringify(b) });
    results.push(...(r.results || []));
    if (!r.paging?.next?.after) break;
    after = r.paging.next.after;
  }
  return results;
}

async function main() {
  // Lead pipeline stages (discovered)
  const STAGES = {
    'new-stage-id': 'New Enquiry',
    'attempting-stage-id': 'Attempting to contact',
    'connected-stage-id': 'Connected via phone or email',
    '1701461197': 'Discovery Call Made',
    '1701461226': 'Demo Scheduled',
    '1701461227': 'Demo Completed',
    '1701461228': 'Second Demo',
    'qualified-stage-id': 'Qualified',
    'unqualified-stage-id': 'Disqualified',
  };

  // Try listing leads with hs_createdate filter
  console.log('=== Trying different search approaches ===');
  
  // Approach 1: List all leads (no filter)
  const allLeads = await hs('/crm/v3/objects/leads?limit=100&properties=hs_pipeline_stage,hs_lead_label,hs_lead_name,hs_createdate,createdate');
  console.log(`All leads (first page): ${(allLeads.results || []).length}`);
  
  // Show createdate range
  const dates = (allLeads.results || []).map(l => l.properties.hs_createdate || l.createdAt).filter(Boolean);
  if (dates.length > 0) {
    dates.sort();
    console.log(`Date range: ${dates[0]} to ${dates[dates.length - 1]}`);
  }

  // Count by stage
  const stageCount = {};
  for (const l of (allLeads.results || [])) {
    const stage = l.properties.hs_pipeline_stage || 'unknown';
    const label = STAGES[stage] || stage;
    stageCount[label] = (stageCount[label] || 0) + 1;
  }
  console.log('\nAll leads by stage:', stageCount);

  // Now page through ALL leads
  console.log('\n=== Fetching ALL leads ===');
  const all = [];
  let after;
  for (let i = 0; i < 20; i++) {
    const url = `/crm/v3/objects/leads?limit=100&properties=hs_pipeline_stage,hs_lead_label,hs_createdate,createdate${after ? '&after=' + after : ''}`;
    const r = await hs(url);
    all.push(...(r.results || []));
    if (!r.paging?.next?.after) break;
    after = r.paging.next.after;
  }
  console.log(`Total leads: ${all.length}`);

  // Filter to Feb 2026
  const febLeads = all.filter(l => {
    const d = l.properties.hs_createdate || l.createdAt;
    return d && d >= '2026-02-01' && d < '2026-03-01';
  });
  console.log(`Feb 2026 leads: ${febLeads.length}`);

  const febStages = {};
  for (const l of febLeads) {
    const stage = l.properties.hs_pipeline_stage || 'unknown';
    const label = STAGES[stage] || stage;
    febStages[label] = (febStages[label] || 0) + 1;
  }
  console.log('Feb by stage:', febStages);

  // Check associations for a few Feb leads
  console.log('\n=== Feb lead associations ===');
  for (const l of febLeads.slice(0, 5)) {
    const assoc = await hs(`/crm/v4/objects/leads/${l.id}/associations/contacts`);
    const contactIds = (assoc.results || []).map(a => a.toObjectId);
    console.log(`  Lead ${l.id} (${STAGES[l.properties.hs_pipeline_stage] || l.properties.hs_pipeline_stage}) => contacts: ${contactIds.join(', ')}`);
  }

  // Key question: can we get lead stage from the contact?
  // Check hs_latest_qualified_lead_date on contacts associated with qualified leads
  const qualifiedLeads = febLeads.filter(l => l.properties.hs_pipeline_stage === 'qualified-stage-id');
  const demoCompleteLeads = febLeads.filter(l => l.properties.hs_pipeline_stage === '1701461227');
  console.log(`\nFeb qualified leads: ${qualifiedLeads.length}`);
  console.log(`Feb demo complete leads: ${demoCompleteLeads.length}`);

  // Get contact IDs for demo complete leads
  console.log('\n=== Demo Complete lead contacts ===');
  for (const l of demoCompleteLeads.slice(0, 10)) {
    const assoc = await hs(`/crm/v4/objects/leads/${l.id}/associations/contacts`);
    const contactIds = (assoc.results || []).map(a => a.toObjectId);
    if (contactIds.length > 0) {
      const contact = await hs(`/crm/v3/objects/contacts/${contactIds[0]}?properties=email,lifecyclestage,first_conversion_event_name`);
      console.log(`  Lead ${l.id} => Contact ${contactIds[0]} (${contact.properties?.email}) lc=${contact.properties?.lifecyclestage}`);
    }
  }
}

main().catch(e => console.error(e));
