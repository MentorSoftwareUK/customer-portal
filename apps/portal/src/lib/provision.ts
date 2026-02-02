export type Provision = 'childrens-home' | 'supported-accommodation' | 'over-18'
export type ProvisionFilter = 'all' | Provision

const STORAGE_KEY = 'provisionFilter'

export function provisionFilterLabel(provision: ProvisionFilter): string {
  if (provision === 'childrens-home') return 'Children’s home'
  if (provision === 'supported-accommodation') return 'Supported accommodation'
  if (provision === 'over-18') return '18+ provision'
  return 'All provision types'
}

export function readProvisionFilter(): ProvisionFilter {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'all' || raw === 'childrens-home' || raw === 'supported-accommodation' || raw === 'over-18') return raw
  } catch {
    // ignore
  }
  return 'all'
}

export function writeProvisionFilter(value: ProvisionFilter): void {
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // ignore
  }
}
