import 'dotenv/config'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const HUBSPOT_BASE_URL = 'https://api.hubapi.com'

const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN
if (!token) {
  console.error('Missing HUBSPOT_PRIVATE_APP_TOKEN in environment.')
  process.exit(1)
}

const now = new Date()
const lastYearStart = new Date(now)
lastYearStart.setFullYear(now.getFullYear() - 1)

const dateLeftGte = lastYearStart.getTime()
const dateLeftLte = now.getTime()

const churnedSalesStatus = process.env.HUBSPOT_SALESSTATUS_CHURNED_VALUE || 'Past Customer (churned)'

const properties = ['hubspot_owner_id', 'contract_start_date', 'salesstatus', 'date_left', 'name', 'domain']

type HubSpotSearchResponse = {
  results: Array<{ id: string; properties: Record<string, string | null> }>
  paging?: { next?: { after: string } }
}

type HubSpotOwner = {
  id: number
  firstName?: string
  lastName?: string
  email?: string
}

async function hubspotListCompanies(after?: string) {
  const qs = new URLSearchParams()
  qs.set('limit', '100')
  if (after) qs.set('after', after)
  qs.set('properties', properties.join(','))

  const res = await fetch(`${HUBSPOT_BASE_URL}/crm/v3/objects/companies?${qs.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HubSpot list failed: ${res.status} ${res.statusText} - ${text}`)
  }

  return (await res.json()) as HubSpotSearchResponse
}

async function hubspotListOwners(after?: string) {
  const qs = new URLSearchParams()
  qs.set('limit', '500')
  if (after) qs.set('after', after)

  const res = await fetch(`${HUBSPOT_BASE_URL}/crm/v3/owners?${qs.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HubSpot owners list failed: ${res.status} ${res.statusText} - ${text}`)
  }

  return (await res.json()) as { results: HubSpotOwner[]; paging?: { next?: { after: string } } }
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const asNumber = Number(value)
  if (!Number.isNaN(asNumber) && Number.isFinite(asNumber)) {
    const d = new Date(asNumber)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function average(values: number[]) {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

async function main() {
  const all: Array<{ id: string; properties: Record<string, string | null> }> = []
  let after: string | undefined

  for (let i = 0; i < 50; i++) {
    const res = await hubspotListCompanies(after)
    all.push(...res.results)
    after = res.paging?.next?.after
    if (!after) break
  }

  const ownerNameById = new Map<string, string>()
  let ownerLookupWarning: string | null = null
  try {
    const owners: HubSpotOwner[] = []
    let ownerAfter: string | undefined
    for (let i = 0; i < 20; i++) {
      const res = await hubspotListOwners(ownerAfter)
      owners.push(...res.results)
      ownerAfter = res.paging?.next?.after
      if (!ownerAfter) break
    }

    for (const owner of owners) {
      const nameParts = [owner.firstName, owner.lastName].filter(Boolean)
      const label = nameParts.length ? nameParts.join(' ') : owner.email || `Owner ${owner.id}`
      ownerNameById.set(String(owner.id), label)
    }
  } catch (err) {
    ownerLookupWarning = err instanceof Error ? err.message : String(err)
  }

  const salesstatusCounts = new Map<string, number>()
  const durations: number[] = []
  let missingStart = 0
  let missingLeft = 0
  let nonPositive = 0

  const ownerCounts = new Map<string, number>()

  const filtered = all.filter((company) => {
    const salesstatus = company.properties.salesstatus ?? ''
    salesstatusCounts.set(salesstatus, (salesstatusCounts.get(salesstatus) ?? 0) + 1)
    return salesstatus === churnedSalesStatus
  })

  const payingCustomers = all.filter((company) => (company.properties.salesstatus ?? '') === 'paying_customer')
  const payingCustomerCount = payingCustomers.length
  const newPayingCustomers = payingCustomers.filter((company) => {
    const startDate = parseDate(company.properties.contract_start_date)
    if (!startDate) return false
    return startDate.getTime() >= dateLeftGte && startDate.getTime() <= dateLeftLte
  })

  const withinWindow = filtered.filter((company) => {
    const leftDate = parseDate(company.properties.date_left)
    if (!leftDate) return false
    return leftDate.getTime() >= dateLeftGte && leftDate.getTime() <= dateLeftLte
  })

  for (const company of withinWindow) {
    const ownerId = company.properties.hubspot_owner_id || 'unassigned'
    ownerCounts.set(ownerId, (ownerCounts.get(ownerId) ?? 0) + 1)

    const startDate = parseDate(company.properties.contract_start_date)
    const leftDate = parseDate(company.properties.date_left)

    if (!startDate) missingStart++
    if (!leftDate) missingLeft++

    if (startDate && leftDate) {
      const diffMs = leftDate.getTime() - startDate.getTime()
      if (diffMs > 0) {
        durations.push(diffMs / (1000 * 60 * 60 * 24))
      } else {
        nonPositive++
      }
    }
  }

  const avgDays = average(durations)
  const medianDays = median(durations)

  const topSalesStatuses = Array.from(salesstatusCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([value, count]) => ({ value, count }))

  const churnedByOwner = Array.from(ownerCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([hubspotOwnerId, count]) => ({
      hubspotOwnerId,
      ownerName: ownerNameById.get(hubspotOwnerId) || (hubspotOwnerId === 'unassigned' ? 'Unassigned' : hubspotOwnerId),
      count,
    }))

  const churnedByOwnerWithPercent = churnedByOwner.map((row) => ({
    ...row,
    percent: withinWindow.length > 0 ? Math.round((row.count / withinWindow.length) * 10000) / 100 : 0,
  }))

  const unassignedCompanies = withinWindow
    .filter((company) => (company.properties.hubspot_owner_id || 'unassigned') === 'unassigned')
    .map((company) => ({
      id: company.id,
      name: company.properties.name ?? null,
      domain: company.properties.domain ?? null,
    }))
    .sort((a, b) => (a.name ?? a.domain ?? '').localeCompare(b.name ?? b.domain ?? ''))

  const csvHeader = ['id', 'name', 'domain']
  const csvRows = [
    csvHeader.join(','),
    ...unassignedCompanies.map((row) => {
      const values = [row.id, row.name ?? '', row.domain ?? '']
      return values
        .map((value) => {
          const escaped = String(value).replace(/"/g, '""')
          return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped
        })
        .join(',')
    }),
  ]

  const csvPath = resolve(process.cwd(), 'tmp', 'churned-unassigned-companies.csv')
  writeFileSync(csvPath, `${csvRows.join('\n')}\n`, 'utf8')

  const churnByMonthMap = new Map<string, number>()
  for (const company of withinWindow) {
    const leftDate = parseDate(company.properties.date_left)
    if (!leftDate) continue
    const monthKey = `${leftDate.getUTCFullYear()}-${String(leftDate.getUTCMonth() + 1).padStart(2, '0')}`
    churnByMonthMap.set(monthKey, (churnByMonthMap.get(monthKey) ?? 0) + 1)
  }

  const churnedByMonth = Array.from(churnByMonthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, count]) => ({ month, count }))

  const churnRateDenominator = payingCustomerCount + withinWindow.length
  const churnRatePercent = churnRateDenominator > 0 ? (withinWindow.length / churnRateDenominator) * 100 : null

  console.log(
    JSON.stringify(
      {
        window: {
          from: lastYearStart.toISOString(),
          to: now.toISOString(),
        },
        churnedSalesStatusValue: churnedSalesStatus,
        totalCompaniesScanned: all.length,
        totalChurnedCompanies: filtered.length,
        churnedInWindow: withinWindow.length,
        payingCustomerCount,
        newPayingCustomersInWindow: newPayingCustomers.length,
        churnRatePercent: churnRatePercent ? Math.round(churnRatePercent * 100) / 100 : null,
        churnedWithDuration: durations.length,
        avgDurationDays: avgDays ? Math.round(avgDays * 10) / 10 : null,
        medianDurationDays: medianDays ? Math.round(medianDays * 10) / 10 : null,
        missingContractStartDate: missingStart,
        missingDateLeft: missingLeft,
        nonPositiveDurations: nonPositive,
        churnedByOwner,
        churnedByOwnerWithPercent,
        churnedByMonth,
        unassignedCompanies,
        unassignedCompaniesCsv: csvPath,
        ownerLookupWarning,
        topSalesStatuses,
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})