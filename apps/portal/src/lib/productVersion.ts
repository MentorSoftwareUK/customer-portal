export type ProductVersionFilter = 'all' | 'v2' | 'v3'

const STORAGE_KEY = 'productVersion'

export function readProductVersionFilter(): ProductVersionFilter {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === 'v2' || raw === 'v3' || raw === 'all') return raw
  return 'all'
}

export function writeProductVersionFilter(value: ProductVersionFilter) {
  localStorage.setItem(STORAGE_KEY, value)
}

export function productVersionLabel(value: ProductVersionFilter) {
  if (value === 'all') return 'All versions'
  if (value === 'v2') return 'Version 2 (FileMaker)'
  return 'Version 3 (Web)'
}
