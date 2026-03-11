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

  // Get all Feb contacts with lead pipeline tracking properties
  const contacts = await searchAll({
    filterGroups: [{
      filters: [
        { propertyName: 'createdate', operator: 'GTE', value: String(febStart) },
        { propertyName: 'createdate', operator: 'LTE', value: String(febEnd) },
      ]
    }],
    properties: [
      'email', 'lifecyclestage', 'disqualification_reason',
      'first_conversion_event_name', 'recent_conversion_event_name',
      'hs_latest_qualified_lead_date', 'hs_latest_disqualified_lead_date',
      'hs_latest_open_lead_date',
      'hs_latest_meeting_activity', 'engagements_last_meeting_booked',
      'hs_lead_status',
      'department',  // from form
      'num_associated_deals',
    ],
  });

  console.log(`Total Feb contacts: ${contacts.length}`);

  // Filter bots
  const nonBot = contacts.filter(c => (c.properties.disqualification_reason || '').toLowerCase() !== 'bot');
  console.log(`Non-bot: ${nonBot.length}`);

  // Count contacts with lead pipeline dates
  const withQualified = nonBot.filter(c => c.properties.hs_latest_qualified_lead_date);
  const withDisqualified = nonBot.filter(c => c.properties.hs_latest_disqualified_lead_date);
  const withOpenLead = nonBot.filter(c => c.properties.hs_latest_open_lead_date);
  console.log(`\nWith hs_latest_qualified_lead_date: ${withQualified.length}`);
  console.log(`With hs_latest_disqualified_lead_date: ${withDisqualified.length}`);
  console.log(`With hs_latest_open_lead_date: ${withOpenLead.length}`);

  // Form matching
  const formNames = [
    'Self Scheduling Form Map',
    'Download Your Free Ofsted Registration Checklist',
    'Reg 32 template download',
    'New Site - Contact',
  ];

  function matchedForm(c) {
    const f1 = (c.properties.first_conversion_event_name || '').toLowerCase();
    const f2 = (c.properties.recent_conversion_event_name || '').toLowerCase();
    for (const fn of formNames) {
      if (f1.includes(fn.toLowerCase()) || f2.includes(fn.toLowerCase())) return fn;
    }
    return null;
  }

  const fromForms = nonBot.filter(c => matchedForm(c));
  console.log(`\nTotal from 4 forms: ${fromForms.length}`);

  // For contact form - check which have "Sales" department
  // Need to get form submissions for department field since it's not a standard contact property
  console.log('\n=== Contact form submissions by department ===');
  const subsRes = await hs('/form-integrations/v1/submissions/forms/2e2ce646-a095-46a9-9cc9-94bfdec91dc2?limit=50');
  const contactFormSubs = {};
  for (const sub of (subsRes.results || [])) {
    const submitted = new Date(sub.submittedAt);
    if (submitted >= new Date('2026-02-01') && submitted < new Date('2026-03-01')) {
      const vals = {};
      for (const v of (sub.values || [])) vals[v.name] = v.value;
      const dept = vals.department || 'none';
      contactFormSubs[dept] = (contactFormSubs[dept] || 0) + 1;
    }
  }
  console.log(contactFormSubs);

  // Check if "department" is stored as a contact property
  const withDept = nonBot.filter(c => c.properties.department);
  console.log(`\nContacts with department property: ${withDept.length}`);

  // Now figure out the actual funnel using contact-level lead properties
  console.log('\n=== REVISED FUNNEL (Feb non-bot, from forms) ===');
  console.log(`1. Form Submissions: ${fromForms.length}`);
  
  // Leads = from forms AND (not disqualified, i.e. has open/qualified lead date)
  const leads = fromForms.filter(c => {
    const lcStage = (c.properties.lifecyclestage || '').toLowerCase();
    // At least lead stage (not just subscriber)
    const stageRank = { subscriber: 0, lead: 1, marketingqualifiedlead: 2, salesqualifiedlead: 3, opportunity: 4, customer: 5 };
    return (stageRank[lcStage] ?? -1) >= 1;
  });
  console.log(`2. Leads (lifecycle >= lead): ${leads.length}`);

  const sql = fromForms.filter(c => {
    const lc = (c.properties.lifecyclestage || '').toLowerCase();
    return ['salesqualifiedlead', 'opportunity', 'customer'].includes(lc);
  });
  console.log(`3. SQL: ${sql.length}`);

  const withMeeting = fromForms.filter(c =>
    c.properties.hs_latest_meeting_activity || c.properties.engagements_last_meeting_booked
  );
  console.log(`4a. Demo (meeting activity): ${withMeeting.length}`);

  const withQualLead = fromForms.filter(c => c.properties.hs_latest_qualified_lead_date);
  console.log(`4b. Qualified lead date set: ${withQualLead.length}`);

  const withOpenLeadDate = fromForms.filter(c => c.properties.hs_latest_open_lead_date);
  console.log(`4c. Open lead date set: ${withOpenLeadDate.length}`);

  // Show some qualified lead contacts
  console.log('\n=== Sample qualified leads from forms ===');
  for (const c of withQualLead.slice(0, 5)) {
    console.log(`  ${c.properties.email} - lc: ${c.properties.lifecyclestage} - qualified: ${c.properties.hs_latest_qualified_lead_date} - meeting: ${c.properties.hs_latest_meeting_activity}`);
  }

  console.log('\n=== Sample contacts with meeting from forms ===');
  for (const c of withMeeting.slice(0, 5)) {
    console.log(`  ${c.properties.email} - lc: ${c.properties.lifecyclestage} - meeting: ${c.properties.hs_latest_meeting_activity} - conversion: ${c.properties.first_conversion_event_name}`);
  }
}

main().catch(e => console.error(e));
