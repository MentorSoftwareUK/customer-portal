const { config } = require('dotenv');
config({ path: '/Users/liamkotecha/Documents/mentor-cp/.env' });

async function test() {
  const loginRes = await fetch('http://localhost:3001/admin-auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.ADMIN_SEED_EMAIL,
      password: process.env.ADMIN_SEED_PASSWORD,
    }),
  });
  const loginData = await loginRes.json();
  const token = loginData.accessToken;
  if (!token) { console.log('Login failed:', loginData); return; }
  console.log('Got admin token');

  const res = await fetch('http://localhost:3001/admin/sales-funnel?month=2026-02', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
test().catch(e => console.error(e));
