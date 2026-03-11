import 'dotenv/config'

const TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN
const FORM_ID = 'b189dcc1-fe5a-40a6-b016-5844ec22f082'
const res = await fetch(`https://api.hubapi.com/form-integrations/v1/submissions/forms/${FORM_ID}?limit=50`, {
  headers: { Authorization: `Bearer ${TOKEN}` }
})
const data = await res.json()
const startMs = new Date('2026-02-01').getTime()
const endMs = new Date('2026-03-01').getTime()
const febSubs = data.results.filter(s => s.submittedAt >= startMs && s.submittedAt < endMs)

console.log(`Feb submissions: ${febSubs.length}`)
for (const s of febSubs.slice(0, 10)) {
  const vals = new Map(s.values.map(v => [v.name, v.value]))
  console.log(vals.get('email'), '| stage:', vals.get('what_stage_are_you_at_'))
}
