import 'dotenv/config'

const TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN
const BASE = 'https://api.hubapi.com'

async function hs(path, init) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`${res.status}: ${t}`) }
  return res.json()
}

// 1. List all deal pipelines and stages
console.log('=== DEAL PIPELINES ===')
const pipelines = await hs('/crm/v3/pipelines/deals')
for (const p of pipelines.results) {
  console.log(`\nPipeline: "${p.label}" (id: ${p.id})`)
  for (const s of p.stages.sort((a,b) => a.displayOrder - b.displayOrder)) {
    console.log(`  Stage ${s.displayOrder}: "${s.label}" (id: ${s.id}, isClosed: ${s.metadata?.isClosed ?? 'n/a'}, probability: ${s.metadata?.probability ?? 'n/a'})`)
  }
}

// 2. List deal properties related to revenue/close/amount
console.log('\n=== DEAL PROPERTIES (revenue/amount/close/mrr/recurring) ===')
const props = await hs('/crm/v3/properties/deals')
const interestingProps = props.results.filter(p =>
  /(amount|revenue|mrr|close|won|lost|stage|pipeline|date|time|subscription|recurring|annual|monthly)/i.test(p.name + ' ' + p.label)
)
for (const p of interestingProps) {
  console.log(`  ${p.name} | "${p.label}" | type: ${p.type} | fieldType: ${p.fieldType}`)
  if (p.options?.length > 0 && p.options.length <= 10) {
    for (const o of p.options) console.log(`    -> "${o.label}" (value: "${o.value}")`)
  }
}

// 3. Search deals — just get a count and sample
console.log('\n=== DEAL SUMMARY ===')
const allDeals = await hs('/crm/v3/objects/deals/search', {
  method: 'POST',
  body: JSON.stringify({
    filterGroups: [],
    properties: ['dealname', 'dealstage', 'pipeline', 'amount', 'closedate', 'hs_deal_stage_probability', 'createdate', 'hs_is_closed_won', 'hs_is_closed'],
    sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
    limit: 5,
  })
})
console.log(`Total deals: ${allDeals.total}`)
for (const d of allDeals.results) {
  console.log(`  ${d.properties.dealname} | stage: ${d.properties.dealstage} | pipeline: ${d.properties.pipeline} | amount: ${d.properties.amount} | closedate: ${d.properties.closedate} | created: ${d.properties.createdate}`)
}

// 4. Count deals by pipeline
console.log('\n=== DEALS PER PIPELINE ===')
for (const p of pipelines.results) {
  const count = await hs('/crm/v3/objects/deals/search', {
    method: 'POST',
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: 'pipeline', operator: 'EQ', value: p.id }] }],
      limit: 1,
    })
  })
  console.log(`  "${p.label}" (${p.id}): ${count.total} deals`)
}

// 5. Get deals from Feb 2026 to see recent activity
console.log('\n=== DEALS CREATED FEB-MAR 2026 ===')
const recentDeals = await hs('/crm/v3/objects/deals/search', {
  method: 'POST',
  body: JSON.stringify({
    filterGroups: [{
      filters: [{
        propertyName: 'createdate',
        operator: 'GTE',
        value: new Date('2026-02-01').getTime().toString(),
      }]
    }],
    properties: ['dealname', 'dealstage', 'pipeline', 'amount', 'closedate', 'createdate', 'hs_is_closed_won', 'hs_is_closed', 'num_associated_contacts'],
    sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
    limit: 20,
  })
})
console.log(`Recent deals: ${recentDeals.total}`)
for (const d of recentDeals.results) {
  const p = pipelines.results.find(pl => pl.id === d.properties.pipeline)
  const s = p?.stages.find(st => st.id === d.properties.dealstage)
  console.log(`  ${d.properties.dealname} | pipeline: ${p?.label ?? d.properties.pipeline} | stage: "${s?.label ?? d.properties.dealstage}" | amount: £${d.properties.amount ?? 0} | closed: ${d.properties.hs_is_closed} | won: ${d.properties.hs_is_closed_won} | close_date: ${d.properties.closedate} | created: ${d.properties.createdate}`)
}
