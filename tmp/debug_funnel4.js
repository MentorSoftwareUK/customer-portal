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

async function searchAll(body) {
  const results = [];
  let after;
  for (let i = 0; i < 10; i++) {
    const b = { ...body, limit: 100 };
    if (after) b.after = after;
    const r = await hs('/crm/v3/objects/contacts/search', { method: 'POST', body: JSON.stringify(b) });
    results.push(...(r.results || []));
    if (!r.paging?.next?.after) break;
    after = r.paging.next.after;
  }
  return results;
}

async function main() {
  const febStart = new Date('2026-02-01T00:00:00.000Z').getTime();
  const febEnd = new Date('2026-02-28T23:59:59.999Z').getTime();

  // Get ALL Feb contacts
  const all = await searchAll({
    filterGroups: [{
      filters: [
        { propertyName: 'createdate', operator: 'GTE', value: String(febStart) },
        { propertyName: 'createdate', operator: 'LTE', value: String(febEnd) },
      ]
    }],
    properties: [
      'lifecyclestage', 'disqualification_reason',
      'first_conversion_event_name', 'recent_conversion_event_name',
      'hs_latest_meeting_activity', 'engagements_last_meeting_booked',
    ],
  });

  console.log(`Total Feb contacts: ${all.length}`);
  
  // Filter bots
  const nonBot = all.filter(c => (c.properties.disqualification_reason || '').toLowerCase() !== 'bot');
  console.log(`Non-bot: ${nonBot.length}`);

  // Form names to match in conversion events
  const formNames = [
    'Self Scheduling Form Map',
    'Download Your Free Ofsted Registration Checklist',
    'Reg 32 template download',
    'New Site - Contact',
  ];

  function hasForm(c) {
    const f1 = (c.properties.first_conversion_event_name || '').toLowerCase();
    const f2 = (c.properties.recent_conversion_event_name || '').toLowerCase();
    return formNames.some(n => f1.includes(n.toLowerCase()) || f2.includes(n.toLowerCase()));
  }

  const fromForms = nonBot.filter(hasForm);
  console.log(`From target forms (non-bot): ${fromForms.length}`);

  // FUNNEL: All non-bot Feb contacts
  const stages = ['subscriber', 'lead', 'marketingqualifiedlead', 'salesqualifiedlead', 'opportunity', 'customer'];
  const stageIndex = {};
  stages.forEach((s, i) => stageIndex[s] = i);

  function atLeastStage(c, minStage) {
    const lc = (c.properties.lifecyclestage || '').toLowerCase();
    const idx = stageIndex[lc];
    const minIdx = stageIndex[minStage];
    if (idx === undefined) return false;
    return idx >= minIdx;
  }

  // Count funnel stages for ALL non-bot Feb contacts
  console.log('\n=== FUNNEL: ALL non-bot Feb contacts ===');
  console.log(`Total: ${nonBot.length}`);
  console.log(`MQL+: ${nonBot.filter(c => atLeastStage(c, 'marketingqualifiedlead')).length}`);
  console.log(`SQL+: ${nonBot.filter(c => atLeastStage(c, 'salesqualifiedlead')).length}`);
  console.log(`Opportunity+: ${nonBot.filter(c => atLeastStage(c, 'opportunity')).length}`);
  console.log(`Customer: ${nonBot.filter(c => atLeastStage(c, 'customer')).length}`);
  
  // Demos - contacts with meeting activity
  const withMeeting = nonBot.filter(c => c.properties.hs_latest_meeting_activity || c.properties.engagements_last_meeting_booked);
  console.log(`With meeting activity: ${withMeeting.length}`);

  // FUNNEL: Only target form contacts  
  console.log('\n=== FUNNEL: Target form contacts ===');
  console.log(`Form Submissions: ${fromForms.length}`);
  console.log(`MQL+: ${fromForms.filter(c => atLeastStage(c, 'marketingqualifiedlead')).length}`);
  console.log(`SQL+: ${fromForms.filter(c => atLeastStage(c, 'salesqualifiedlead')).length}`);
  console.log(`Opportunity+: ${fromForms.filter(c => atLeastStage(c, 'opportunity')).length}`);
  console.log(`Customer: ${fromForms.filter(c => atLeastStage(c, 'customer')).length}`);
  const formWithMeeting = fromForms.filter(c => c.properties.hs_latest_meeting_activity || c.properties.engagements_last_meeting_booked);
  console.log(`With meeting (demo): ${formWithMeeting.length}`);

  // Per-form breakdown
  console.log('\n=== Per-form breakdown ===');
  for (const fn of formNames) {
    const contacts = nonBot.filter(c => {
      const f1 = (c.properties.first_conversion_event_name || '').toLowerCase();
      const f2 = (c.properties.recent_conversion_event_name || '').toLowerCase();
      return f1.includes(fn.toLowerCase()) || f2.includes(fn.toLowerCase());
    });
    console.log(`\n${fn}: ${contacts.length}`);
    const byStage = {};
    for (const c of contacts) {
      const s = c.properties.lifecyclestage || 'unknown';
      byStage[s] = (byStage[s] || 0) + 1;
    }
    console.log('  stages:', byStage);
    const demos = contacts.filter(c => c.properties.hs_latest_meeting_activity || c.properties.engagements_last_meeting_booked);
    console.log(`  with meeting: ${demos.length}`);  
  }
}

main().catch(e => console.error(e));
