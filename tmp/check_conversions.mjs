import 'dotenv/config'

const TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN
const BASE = 'https://api.hubapi.com'

async function searchDeals(filterGroups, properties) {
  const results = []
  let after = undefined
  do {
    const body = { filterGroups, properties, limit: 100 }
    if (after) body.after = after
    const res = await fetch(`${BASE}/crm/v3/objects/deals/search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    results.push(...(json.results ?? []))
    after = json.paging?.next?.after
  } while (after)
  return results
}

async function batchDealCompanyMap(dealIds) {
  const map = new Map()
  for (let i = 0; i < dealIds.length; i += 100) {
    const batch = dealIds.slice(i, i + 100)
    const res = await fetch(`${BASE}/crm/v4/associations/deals/companies/batch/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: batch.map(id => ({ id })) }),
    })
    const json = await res.json()
    for (const r of json.results ?? []) {
      if (r.to?.length) map.set(String(r.from.id), String(r.to[0].toObjectId))
    }
  }
  return map
}

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
const PREREG = '2933345490'

// All closedwon from default + pre-reg pipelines
const allWon = await searchDeals(
  [{ filters: [
    { propertyName: 'pipeline', operator: 'EQ', value: 'default' },
    { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
  ]}],
  ['dealname', 'amount', 'hs_v2_date_entered_closedwon', 'pipeline', 'dealstage']
)

const preRegWon = await searchDeals(
  [{ filters: [
    { propertyName: 'pipeline', operator: 'EQ', value: PREREG },
    { propertyName: 'dealstage', operator: 'EQ', value: '4014021838' },
  ]}],
  ['dealname', 'amount', 'hs_v2_date_entered_closedwon', 'pipeline', 'dealstage']
)

console.log(`All default closedwon: ${allWon.length}`)
console.log(`Pre-reg closedwon: ${preRegWon.length}`)

const allDeals = [...allWon, ...preRegWon]
const dealCompanyMap = await batchDealCompanyMap(allDeals.map(d => d.id))

// Group by company
const companyDeals = new Map()
for (const d of allDeals) {
  const cid = dealCompanyMap.get(d.id)
  if (!cid) continue
  if (!companyDeals.has(cid)) companyDeals.set(cid, [])
  companyDeals.get(cid).push(d)
}

const isFreeWon = (d) =>
  d.properties.pipeline === PREREG
    ? d.properties.dealstage === '4014021838'
    : (d.properties.dealstage === 'closedwon' && (parseFloat(d.properties.amount ?? '0') || 0) === 0)

// Find free companies
const freeCompanyIds = new Set()
for (const [cid, deals] of companyDeals) {
  if (deals.some(isFreeWon)) freeCompanyIds.add(cid)
}

// Find conversions and "this month" conversions
const currentMK = monthKey(new Date())
console.log(`\nCurrent month: ${currentMK}`)
console.log(`Free companies: ${freeCompanyIds.size}`)

let convertedThisMonth = 0
let convertedTotal = 0

// Fetch company names
const companyIdArr = [...freeCompanyIds]
const companyNames = new Map()
for (let i = 0; i < companyIdArr.length; i += 100) {
  const batch = companyIdArr.slice(i, i + 100)
  const res = await fetch(`${BASE}/crm/v3/objects/companies/batch/read`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: batch.map(id => ({ id })), properties: ['name'] }),
  })
  const json = await res.json()
  for (const c of json.results ?? []) {
    companyNames.set(c.id, c.properties.name)
  }
}

console.log(`\n=== All free companies with conversion details ===`)
for (const cid of freeCompanyIds) {
  const deals = companyDeals.get(cid)
  const name = companyNames.get(cid) || `Company ${cid}`
  
  const freeDeals = deals.filter(isFreeWon)
  const payingDeals = deals.filter(d =>
    d.properties.dealstage === 'closedwon'
    && d.properties.pipeline === 'default'
    && (parseFloat(d.properties.amount ?? '0') || 0) > 0
  )
  
  const isConverted = payingDeals.length > 0
  if (isConverted) convertedTotal++
  
  const payingThisMonth = payingDeals.filter(d => {
    const raw = d.properties.hs_v2_date_entered_closedwon
    return raw ? monthKey(new Date(raw)) === currentMK : false
  })
  
  if (payingThisMonth.length > 0) convertedThisMonth++
  
  // Show all companies
  console.log(`\n${name} (${cid}): ${isConverted ? 'CONVERTED' : 'STILL FREE'}`)
  for (const d of freeDeals) {
    const wonDate = d.properties.hs_v2_date_entered_closedwon?.slice(0,10) || 'no date'
    console.log(`  FREE: ${d.properties.dealname} | won=${wonDate} | £${d.properties.amount}`)
  }
  for (const d of payingDeals) {
    const wonDate = d.properties.hs_v2_date_entered_closedwon?.slice(0,10) || 'no date'
    const wonMk = d.properties.hs_v2_date_entered_closedwon ? monthKey(new Date(d.properties.hs_v2_date_entered_closedwon)) : 'none'
    console.log(`  PAID: ${d.properties.dealname} | won=${wonDate} (${wonMk}) | £${d.properties.amount} ${wonMk === currentMK ? '*** THIS MONTH ***' : ''}`)
  }
}

console.log(`\n=== Summary ===`)
console.log(`Free companies: ${freeCompanyIds.size}`)
console.log(`Converted total: ${convertedTotal}`)
console.log(`Converted this month (${currentMK}): ${convertedThisMonth}`)
console.log(`Still free: ${freeCompanyIds.size - convertedTotal}`)
