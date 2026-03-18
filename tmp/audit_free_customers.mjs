import 'dotenv/config'

const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN
const BASE = 'https://api.hubapi.com'

async function searchAll(filterGroups, properties) {
  const all = []
  let after
  for (;;) {
    const body = { filterGroups, properties, limit: 100 }
    if (after) body.after = after
    const res = await fetch(`${BASE}/crm/v3/objects/deals/search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    all.push(...json.results)
    after = json.paging?.next?.after
    if (!after) break
  }
  return all
}

// 1. All closedwon deals with amount=0 in default pipeline
const freeDefault = await searchAll(
  [{ filters: [
    { propertyName: 'pipeline', operator: 'EQ', value: 'default' },
    { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
    { propertyName: 'amount', operator: 'EQ', value: '0' },
  ] }],
  ['dealname', 'amount', 'dealstage', 'pipeline', 'closedate']
)

// 2. All deals in pre-reg pipeline  
const preReg = await searchAll(
  [{ filters: [
    { propertyName: 'pipeline', operator: 'EQ', value: '2933345490' },
  ] }],
  ['dealname', 'amount', 'dealstage', 'pipeline', 'closedate']
)

// 3. Get company associations for all free deals
const freeIds = [...new Set([...freeDefault, ...preReg].map(d => d.id))]
console.log('Free deals (default pipeline, amount=0, closedwon):', freeDefault.length)
console.log('Pre-reg pipeline deals (any stage):', preReg.length)
console.log('Combined unique free deal IDs:', freeIds.length)

// Batch fetch company associations
const companyMap = new Map()
for (let i = 0; i < freeIds.length; i += 100) {
  const batch = freeIds.slice(i, i + 100)
  const res = await fetch(`${BASE}/crm/v4/associations/deals/companies/batch/read`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: batch.map(id => ({ id })) }),
  })
  const json = await res.json()
  for (const r of json.results) {
    if (r.to.length > 0) companyMap.set(r.from.id, r.to[0].toObjectId)
  }
}

// Get unique free companies
const freeCompanyIds = new Set()
for (const d of [...freeDefault, ...preReg]) {
  const cid = companyMap.get(d.id)
  if (cid) freeCompanyIds.add(cid)
}
console.log('\nUnique free COMPANIES:', freeCompanyIds.size)

// Now get ALL closedwon deals in default pipeline (any amount) to check conversions
const allWon = await searchAll(
  [{ filters: [
    { propertyName: 'pipeline', operator: 'EQ', value: 'default' },
    { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
  ] }],
  ['dealname', 'amount', 'dealstage', 'pipeline', 'closedate']
)

// Get associations for all won deals
const allWonIds = allWon.map(d => d.id)
const wonCompanyMap = new Map()
for (let i = 0; i < allWonIds.length; i += 100) {
  const batch = allWonIds.slice(i, i + 100)
  const res = await fetch(`${BASE}/crm/v4/associations/deals/companies/batch/read`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: batch.map(id => ({ id })) }),
  })
  const json = await res.json()
  for (const r of json.results) {
    if (r.to.length > 0) wonCompanyMap.set(r.from.id, r.to[0].toObjectId)
  }
}

// Check which free companies also have a paying deal
let convertedCount = 0
let convertedRevenue = 0
let stillFreeCount = 0
const convertedCompanies = []
const stillFreeCompanies = []

for (const cid of freeCompanyIds) {
  const payingDeals = allWon.filter(d => {
    const dealCid = wonCompanyMap.get(d.id)
    const amt = parseFloat(d.properties.amount || '0') || 0
    return dealCid === cid && amt > 0
  })
  if (payingDeals.length > 0) {
    convertedCount++
    const rev = payingDeals.reduce((s, d) => s + (parseFloat(d.properties.amount || '0') || 0), 0)
    convertedRevenue += rev
    convertedCompanies.push({ deals: payingDeals.length, revenue: rev })
  } else {
    stillFreeCount++
  }
}

console.log('\n=== SUMMARY ===')
console.log('Total free companies:', freeCompanyIds.size)
console.log('Converted (have a paying deal):', convertedCount)
console.log('Converted total revenue:', convertedRevenue.toFixed(2))
console.log('Still free (no paying deal):', stillFreeCount)
console.log('Check: converted + still free =', convertedCount + stillFreeCount)

// This month
const now = new Date()
const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
const freeThisMonth = freeDefault.filter(d => {
  const cd = d.properties.closedate
  if (!cd) return false
  const dt = new Date(cd)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}` === thisMonthKey
})
console.log('\nNew free deals this month:', freeThisMonth.length)
