import 'dotenv/config'

const TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN
const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }

async function go() {
  // 1. Open pipeline deals - what stages, values, ages
  const openRes = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
    method: 'POST', headers,
    body: JSON.stringify({
      filterGroups: [{ filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: 'default' },
        { propertyName: 'hs_is_closed', operator: 'EQ', value: 'false' },
      ]}],
      properties: ['dealname', 'amount', 'dealstage', 'createdate', 'pipeline', 'days_to_close', 'hubspot_owner_id', 'closedate'],
      limit: 100,
    })
  })
  const openData = await openRes.json()
  console.log('=== OPEN PIPELINE ===')
  console.log('Total open deals:', openData.total)

  const stageMap = {
    appointmentscheduled: 'Discovery Call Made',
    presentationscheduled: 'Demo Scheduled',
    qualifiedtobuy: '1st Demo Completed',
    '4751274190': '2nd Demo Completed',
    '4751274191': '3rd Demo Completed',
    decisionmakerboughtin: 'Agreed To Purchase',
    contractsent: 'Commercials Sent',
  }

  // Group by stage
  const byStage = {}
  for (const d of openData.results) {
    const stage = d.properties.dealstage
    if (!byStage[stage]) byStage[stage] = []
    byStage[stage].push(d)
  }
  for (const [stage, deals] of Object.entries(byStage)) {
    const label = stageMap[stage] || stage
    const totalValue = deals.reduce((s, d) => s + (parseFloat(d.properties.amount) || 0), 0)
    console.log(`\n${label} (${stage}): ${deals.length} deals, £${totalValue}`)
    for (const d of deals.slice(0, 3)) {
      const age = Math.floor((Date.now() - new Date(d.properties.createdate).getTime()) / 86400000)
      console.log(`  ${d.properties.dealname} | £${d.properties.amount || 0} | ${age}d old | close: ${d.properties.closedate || 'n/a'}`)
    }
  }

  // 2. Pre-reg pipeline (unconverted)
  const preRegRes = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
    method: 'POST', headers,
    body: JSON.stringify({
      filterGroups: [{ filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: '2933345490' },
        { propertyName: 'hs_is_closed', operator: 'EQ', value: 'false' },
      ]}],
      properties: ['dealname', 'amount', 'dealstage', 'createdate', 'pipeline'],
      limit: 100,
    })
  })
  const preRegData = await preRegRes.json()
  console.log('\n=== UNCONVERTED PRE-REG ===')
  console.log('Total:', preRegData.total)
  for (const d of (preRegData.results || []).slice(0, 5)) {
    console.log(`  ${d.properties.dealname} | stage: ${d.properties.dealstage} | created: ${d.properties.createdate}`)
  }

  // 3. Historical conversion rates by stage (last 12 months closed deals)
  const closedRes = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
    method: 'POST', headers,
    body: JSON.stringify({
      filterGroups: [
        { filters: [
          { propertyName: 'pipeline', operator: 'EQ', value: 'default' },
          { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
          { propertyName: 'hs_v2_date_entered_closedwon', operator: 'GTE', value: '2025-03-01' },
        ]},
        { filters: [
          { propertyName: 'pipeline', operator: 'EQ', value: 'default' },
          { propertyName: 'dealstage', operator: 'EQ', value: 'closedlost' },
          { propertyName: 'hs_v2_date_entered_closedlost', operator: 'GTE', value: '2025-03-01' },
        ]},
      ],
      properties: ['dealname', 'amount', 'dealstage', 'hs_v2_date_entered_closedwon', 'hs_v2_date_entered_closedlost', 'days_to_close'],
      limit: 200,
    })
  })
  const closedData = await closedRes.json()
  const won = closedData.results.filter(d => d.properties.dealstage === 'closedwon')
  const lost = closedData.results.filter(d => d.properties.dealstage === 'closedlost')
  const avgDeal = won.length > 0 ? won.reduce((s, d) => s + (parseFloat(d.properties.amount) || 0), 0) / won.length : 0
  const avgClose = won.length > 0 ? won.reduce((s, d) => s + (parseInt(d.properties.days_to_close) || 0), 0) / won.length : 0

  console.log('\n=== 12-MONTH DEAL STATS ===')
  console.log('Won:', won.length, '| Lost:', lost.length, '| Win rate:', Math.round(won.length / (won.length + lost.length) * 100) + '%')
  console.log('Avg deal value: £' + Math.round(avgDeal))
  console.log('Avg close time:', Math.round(avgClose), 'days')

  // Monthly breakdown
  const months = {}
  for (const d of won) {
    const dt = d.properties.hs_v2_date_entered_closedwon
    if (!dt) continue
    const mk = dt.slice(0, 7)
    if (!months[mk]) months[mk] = { won: 0, revenue: 0 }
    months[mk].won++
    months[mk].revenue += parseFloat(d.properties.amount) || 0
  }
  console.log('\nMonthly won deals:')
  for (const [m, v] of Object.entries(months).sort()) {
    console.log(`  ${m}: ${v.won} deals, £${Math.round(v.revenue)}`)
  }
}

go().catch(e => console.error(e))
