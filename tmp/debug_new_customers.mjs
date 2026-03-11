import 'dotenv/config'

const TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN
const now = new Date()
const sixtyDaysAgo = new Date(now.getTime() - 60 * 86_400_000)

console.log('Now:', now.toISOString())
console.log('60 days ago:', sixtyDaysAgo.toISOString())
console.log()

async function hsFetch(path, opts = {}) {
  const res = await fetch('https://api.hubapi.com' + path, {
    ...opts,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...opts.headers },
  })
  return res.json()
}

let all = []
let after
for (let page = 0; page < 20; page++) {
  const body = {
    filterGroups: [{ filters: [{ propertyName: 'salesstatus', operator: 'EQ', value: 'paying_customer' }] }],
    properties: ['name', 'contract_start_date'],
    limit: 100,
    sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
  }
  if (after) body.after = after
  const data = await hsFetch('/crm/v3/objects/companies/search', { method: 'POST', body: JSON.stringify(body) })
  if (!data.results) {
    console.log('ERROR:', JSON.stringify(data).slice(0, 300))
    break
  }
  all.push(...data.results)
  if (!data.paging?.next?.after) break
  after = data.paging.next.after
}

console.log('Total paying customers:', all.length)

const withDate = all.filter(c => c.properties.contract_start_date)
const withoutDate = all.filter(c => !c.properties.contract_start_date)
console.log('With contract_start_date:', withDate.length)
console.log('Without contract_start_date:', withoutDate.length)
console.log()

const sorted = withDate
  .map(c => ({ name: c.properties.name, date: c.properties.contract_start_date, id: c.id }))
  .sort((a, b) => new Date(b.date) - new Date(a.date))

console.log('=== 25 most recent contract_start_date values ===')
for (const c of sorted.slice(0, 25)) {
  const d = new Date(c.date)
  const daysAgo = Math.floor((now - d) / 86_400_000)
  const inWindow = d >= sixtyDaysAgo ? ' << IN 60d WINDOW' : ''
  console.log('  ' + (c.name || '?').padEnd(40) + ' ' + c.date.padEnd(28) + ' (' + daysAgo + 'd ago)' + inWindow)
}

const in60 = sorted.filter(c => new Date(c.date) >= sixtyDaysAgo)
const in90 = sorted.filter(c => new Date(c.date) >= new Date(now.getTime() - 90 * 86_400_000))
const in120 = sorted.filter(c => new Date(c.date) >= new Date(now.getTime() - 120 * 86_400_000))
console.log()
console.log('In last 60 days:', in60.length)
console.log('In last 90 days:', in90.length)
console.log('In last 120 days:', in120.length)
