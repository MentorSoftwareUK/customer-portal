/** Shared helpers for dashboard pages */

export function pctDelta(curr: number, prev: number | undefined) {
  if (prev == null || prev === 0) return { value: 0, dir: 'flat' as const }
  const d = ((curr - prev) / prev) * 100
  return { value: Math.abs(Math.round(d)), dir: d > 0 ? 'up' as const : d < 0 ? 'down' as const : 'flat' as const }
}

export function formatCurrency(v: number): string {
  if (v >= 1000) return `£${(v / 1000).toFixed(1)}k`
  return `£${v.toLocaleString('en-GB')}`
}

export function relativeDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 86_400_000)
  if (diff < 0) return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return `${diff}d ago`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
