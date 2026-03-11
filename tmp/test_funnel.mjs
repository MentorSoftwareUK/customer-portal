import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load .env
const envFile = readFileSync(resolve(import.meta.dirname, '../.env'), 'utf8')
for (const line of envFile.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const email = process.env.ADMIN_SEED_EMAIL || ''
const password = process.env.ADMIN_SEED_PASSWORD || ''

const loginRes = await fetch('http://localhost:3001/admin-auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
})
const loginData = await loginRes.json()
const token = loginData.accessToken || loginData.token
if (!token) {
  console.log('Login failed:', loginData)
  process.exit(1)
}
console.log('Login OK')

const funnelRes = await fetch('http://localhost:3001/admin/sales-funnel?month=2026-02', {
  headers: { Authorization: 'Bearer ' + token },
})
const funnelData = await funnelRes.json()
console.log('Status:', funnelRes.status)
console.log(JSON.stringify(funnelData, null, 2))
