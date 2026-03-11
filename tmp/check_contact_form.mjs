import { readFileSync } from 'fs'
import { resolve } from 'path'
const envFile = readFileSync(resolve(import.meta.dirname, '../.env'), 'utf8')
for (const line of envFile.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN

async function hs(path, opts = {}) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    signal: AbortSignal.timeout(15000),
  })
  return res.json()
}

// Check contact form submissions for Feb 2026 - what fields are present?
const subs = await hs('/form-integrations/v1/submissions/forms/2e2ce646-a095-46a9-9cc9-94bfdec91dc2?limit=20')
for (const sub of (subs.results || []).slice(0, 5)) {
  const submitted = new Date(sub.submittedAt)
  if (submitted >= new Date('2026-02-01') && submitted < new Date('2026-03-01')) {
    const vals = {}
    for (const v of (sub.values || [])) vals[v.name] = v.value
    console.log(`${submitted.toISOString()} | email=${vals.email} | department=${vals.department}`)
  }
}
