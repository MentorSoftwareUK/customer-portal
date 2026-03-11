import { readFileSync } from 'fs'
import { resolve } from 'path'
const envFile = readFileSync(resolve(import.meta.dirname, '../.env'), 'utf8')
for (const line of envFile.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN

async function hs(path) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000),
  })
  return res.json()
}

const forms = await hs('/marketing/v3/forms?limit=100')
for (const f of (forms.results || [])) {
  const name = (f.name || '').toLowerCase()
  if (name.includes('schedul') || name.includes('ofsted') || name.includes('reg 32') ||
      name.includes('contact') || name.includes('funnel')) {
    console.log(`${f.id}  "${f.name}"`)
  }
}
