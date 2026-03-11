const { config } = require('dotenv');
config({ path: '.env' });
const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
if (!token) { console.log('No HubSpot token'); process.exit(1); }

const liveProp = process.env.HUBSPOT_LIVE_CUSTOMER_PROPERTY;
const trueVals = (process.env.HUBSPOT_LIVE_CUSTOMER_TRUE_VALUES || '').split(',').map(v => v.trim()).filter(Boolean);
console.log('Live prop:', liveProp, 'True vals:', trueVals);

async function main() {
  // Check what ALL properties look like on a company (find the right home count property)
  const res = await fetch('https://api.hubapi.com/crm/v3/objects/companies/search', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: liveProp, operator: 'EQ', value: trueVals[0] }] }],
      properties: ['name', 'number_of_homes', 'number_of_homes__ch_', 'number_of_homes__sa_', 'numberofemployees', 'num_associated_contacts'],
      limit: 5,
    })
  });
  const d = await res.json();
  console.log('Search status:', res.status);
  console.log('Total:', d.total);
  if (d.message) console.log('Error:', d.message);
  for (const c of (d.results || []).slice(0, 5)) {
    console.log('Company:', c.id, c.properties.name);
    // Print all properties
    for (const [k, v] of Object.entries(c.properties)) {
      if (v !== null && v !== '' && k !== 'name' && !k.startsWith('hs_') && !k.startsWith('createdate') && !k.startsWith('lastmodified')) {
        console.log('  ', k, '=', v);
      }
    }
  }

  // Also search for properties with "home" in the name
  const propsRes = await fetch('https://api.hubapi.com/crm/v3/properties/companies', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const propsData = await propsRes.json();
  const homeProps = (propsData.results || []).filter(p => p.name.includes('home') || p.name.includes('num') || p.label.toLowerCase().includes('home'));
  console.log('\nProperties containing "home" or "num":');
  for (const p of homeProps) {
    console.log('  ', p.name, '-', p.label, '(type:', p.type + ')');
  }

  // Check portal users with companyId
  const { MongoClient } = require('mongodb');
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'mentor_cp';
  if (!uri) { console.log('No MONGODB_URI'); return; }
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const totalUsers = await db.collection('portal_users').countDocuments({ status: 'active' });
  const usersWithCompany = await db.collection('portal_users').countDocuments({ status: 'active', companyId: { $ne: null } });
  const sample = await db.collection('portal_users').find({ status: 'active', companyId: { $ne: null } }).limit(3).toArray();
  console.log('\nTotal active users:', totalUsers);
  console.log('Users with companyId:', usersWithCompany);
  for (const u of sample) {
    console.log('  User:', u.email, 'companyId:', u.companyId);
  }
  await client.close();
}

main().catch(e => console.error(e));
