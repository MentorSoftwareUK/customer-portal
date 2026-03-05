import 'dotenv/config';
const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
const tableId = '1062921417';

const r = await fetch(`https://api.hubapi.com/cms/v3/hubdb/tables/${tableId}/rows?limit=3`, {
  headers: { Authorization: `Bearer ${token}` }
});
const d = await r.json();
console.log('Rows status:', r.status, 'total:', d.total);
if (d.results) {
  for (const row of d.results) {
    console.log('--- row', row.id);
    console.log(JSON.stringify(row.values, null, 2));
  }
}
