import 'dotenv/config'

const HUBSPOT_BASE_URL = 'https://api.hubapi.com'
const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN
if (!token) {
  console.error('Missing HUBSPOT_PRIVATE_APP_TOKEN in environment.')
  process.exit(1)
}

const term = process.argv.slice(2).join(' ').trim()
if (!term) {
  console.error('Usage: npx -y tsx scripts/hubspot-files-search.mts "search term"')
  process.exit(1)
}

async function hubspotFetch(pathname: string, init?: RequestInit) {
  const res = await fetch(`${HUBSPOT_BASE_URL}${pathname}`, {
    method: init?.method ?? 'GET',
    body: init?.body,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const err = new Error(`HubSpot request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`)
    ;(err as Error & { status?: number }).status = res.status
    throw err
  }

  return res.json()
}

async function listFiles(): Promise<any[]> {
  const files: any[] = []
  let after: string | undefined
  let offset = 0
  let usedFileManager = false

  for (let i = 0; i < 20; i += 1) {
    let data: any
    try {
      const body = { limit: 100, after }
      data = await hubspotFetch('/files/v3/files/search', { method: 'POST', body: JSON.stringify(body) })
    } catch (err) {
      const status = (err as Error & { status?: number }).status
      if (status !== 404 && status !== 405) throw err
      try {
        const qs = new URLSearchParams()
        qs.set('limit', '100')
        if (after) qs.set('after', after)
        data = await hubspotFetch(`/files/v3/files?${qs.toString()}`)
      } catch (inner) {
        const innerStatus = (inner as Error & { status?: number }).status
        if (innerStatus !== 404 && innerStatus !== 405) throw inner
        usedFileManager = true
        const qs = new URLSearchParams()
        qs.set('limit', '100')
        qs.set('offset', String(offset))
        data = await hubspotFetch(`/filemanager/api/v3/files?${qs.toString()}`)
      }
    }

    const results = data.results ?? data.objects ?? data.files ?? []
    files.push(...results)

    if (usedFileManager) {
      const hasMore = data.hasMore
      const nextOffset = data.offset
      if (!hasMore || typeof nextOffset !== 'number') break
      offset = nextOffset
    } else {
      const nextAfter = data.paging?.next?.after
      if (!nextAfter) break
      after = nextAfter
    }
  }

  return files
}

function normalize(value: unknown) {
  return String(value ?? '').toLowerCase()
}

async function main() {
  const files = await listFiles()
  const needle = term.toLowerCase()
  const matches = files.filter((file) => {
    const name = normalize(file.name)
    const title = normalize(file.title)
    const path = normalize(file.path)
    return name.includes(needle) || title.includes(needle) || path.includes(needle)
  })

  const results = matches.map((file) => ({
    id: file.id ?? file.fileId ?? null,
    name: file.name ?? null,
    title: file.title ?? null,
    extension: file.extension ?? null,
    url: file.url ?? file.publicUrl ?? file.public_url ?? null,
    path: file.path ?? null,
  }))

  console.log(
    JSON.stringify(
      {
        term,
        totalFilesScanned: files.length,
        matchCount: results.length,
        results,
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
