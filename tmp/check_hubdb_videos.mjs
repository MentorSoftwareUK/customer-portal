import 'dotenv/config';
const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
const tableId = process.env.HUBSPOT_VIDEOS_HUBDB_TABLE_ID;
console.log('Table ID set:', !!tableId, tableId ? `(${tableId})` : '');

if (!tableId) {
  const r = await fetch('https://api.hubapi.com/cms/v3/hubdb/tables?limit=30', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const d = await r.json();
  console.log('Tables status:', r.status);
  if (d.results) {
    for (const t of d.results) {
      console.log(`  ${t.id}  "${t.label}"  (${t.name})`);
    }
  }
} else {
  const r = await fetch(`https://api.hubapi.com/cms/v3/hubdb/tables/${tableId}/rows?limit=5`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const d = await r.json();
  console.log('Rows status:', r.status, 'total:', d.total);
  if (d.results) {
    for (const row of d.results) {
      console.log(JSON.stringify(row.values, null, 2));
    }
  }
}
