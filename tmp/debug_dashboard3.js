const { config } = require('dotenv');
config({ path: '/Users/liamkotecha/Documents/mentor-cp/.env' });
const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;

async function main() {
  // Use the hubspotGetCompanyById approach (individual GET, same as the API route)
  // Grab a few company IDs from search first
  const liveProp = process.env.HUBSPOT_LIVE_CUSTOMER_PROPERTY;
  const trueVal = 'paying_customer';
  
  const HUBSPOT_TIMEOUT = 10000;
  
  const res = await fetch('https://api.hubapi.com/crm/v3/objects/companies/search', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: liveProp, operator: 'EQ', value: trueVal }] }],
      properties: [liveProp],
      limit: 10,
    }),
    signal: AbortSignal.timeout(HUBSPOT_TIMEOUT),
  });
  
  if (!res.ok) {
    const txt = await res.text();
    console.log('Search failed:', res.status, txt);
    return;
  }
  
  const data = await res.json();
  console.log('Found', (data.results || []).length, 'companies');
  
  // Fetch each with homes properties (same way hubspotGetCompanyById works)
  for (const r of (data.results || []).slice(0, 5)) {
    const props = ['name', 'number_of_homes', 'number_of_homes__ch_', 'number_of_homes__sa_', 'homes'].join(',');
    const cRes = await fetch(`https://api.hubapi.com/crm/v3/objects/companies/${r.id}?properties=${encodeURIComponent(props)}`, {
      headers: { Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(HUBSPOT_TIMEOUT),
    });
    const c = await cRes.json();
    console.log('\nCompany', c.id, '-', c.properties?.name);
    console.log('  number_of_homes:', JSON.stringify(c.properties?.number_of_homes));
    console.log('  homes:', JSON.stringify(c.properties?.homes));
    console.log('  number_of_homes__ch_:', JSON.stringify(c.properties?.number_of_homes__ch_));
    console.log('  number_of_homes__sa_:', JSON.stringify(c.properties?.number_of_homes__sa_));
  }
}

main().catch(e => console.error(e));
