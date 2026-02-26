function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function getPath(obj: Record<string, any>, path: string) {
  const parts = path.split('.')
  let cur: any = obj
  for (const p of parts) {
    if (cur == null) return ''
    cur = cur[p]
  }
  if (cur == null) return ''
  if (typeof cur === 'string') return cur
  if (typeof cur === 'number' || typeof cur === 'boolean') return String(cur)
  try {
    return JSON.stringify(cur)
  } catch {
    return String(cur)
  }
}

export type RenderMode = 'subject' | 'text' | 'html'

/**
 * Very small template helper:
 * - `{{key}}` is escaped for HTML mode
 * - `{{{key}}}` is unescaped
 */
export function renderTemplate(template: string, vars: Record<string, any>, mode: RenderMode): string {
  if (!template) return ''

  const withRaw = template.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_m, key: string) => {
    return getPath(vars, key)
  })

  return withRaw.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const v = getPath(vars, key)
    if (mode === 'html') return escapeHtml(v)
    return v
  })
}
