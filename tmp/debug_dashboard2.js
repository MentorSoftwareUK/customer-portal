const { config } = require('dotenv');
config({ path: '/Users/liamkotecha/Documents/mentor-cp/.env' });
const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
const liveProp = process.env.HUBSPOT_LIVE_CUSTOMER_PROPERTY;
const trueVals = (process.env.HUBSPOT_LIVE_CUSTOMER_TRUE_VALUES || '').split(',').map(v => v.trim()).filter(Boolean);

console.log('Token length:', token.length, 'starts with:', token.slice(0,10));
console.log('Live prop:', JSON.stringify(liveProp), 'True vals:', JSON.stringify(trueVals));

async function main() {
  // Search for live companies (without requesting number_of_homes in search - that caused 400)
  const searchRes = await fetch('https://api.hubapi.com/crm/v3/objects/companies/search', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: liveProp, operator: 'EQ', value: trueVals[0] }] }],
      properties: [liveProp, 'name'],
      limit: 5,
    })
  });
  const searchData = await searchRes.json();
  console.log('Search status:', searchRes.status);
  console.log('Search response:', JSON.stringify(searchData).slice(0, 500));
  const ids = (searchData.results || []).map(r => r.id);
  console.log('Got', ids.length, 'company IDs');

  // Now fetch homes data individually
  const homeProps = ['number_of_homes', 'number_of_homes__ch_', 'number_of_homes__sa_', 'name', 'num_associated_contacts'];
  for (const id of ids.slice(0, 5)) {
    const res = await fetch(`https://api.hubapi.com/crm/v3/objects/companies/${id}?properties=${homeProps.join(',')}`, {
      headers: { Authorization: 'Bearer ' + token }
    });
    const c = await res.json();
    console.log('\nCompany:', c.id, c.properties.name);
    console.log('  number_of_homes:', JSON.stringify(c.properties.number_of_homes), typeof c.properties.number_of_homes);
    console.log('  number_of_homes__ch_:', JSON.stringify(c.properties.number_of_homes__ch_));
    console.log('  number_of_homes__sa_:', JSON.stringify(c.properties.number_of_homes__sa_));
    console.log('  num_associated_contacts:', c.properties.num_associated_contacts);

    // Also check contacts for this company
    const assocRes = await fetch(`https://api.hubapi.com/crm/v4/objects/companies/${id}/associations/contacts`, {
      headers: { Authorization: 'Bearer ' + token }
    });
    const assocData = await assocRes.json();
    console.log('  associated contacts:', (assocData.results || []).length);
  }
}

main().catch(e => console.error(e));
