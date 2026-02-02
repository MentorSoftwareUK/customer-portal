import { config as loadDotEnv } from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'

const HUBSPOT_BASE_URL = 'https://api.hubapi.com'

function findRepoRoot() {
  const cwd = process.cwd()
  const parts = cwd.split(path.sep)
  const appsIndex = parts.lastIndexOf('apps')
  if (appsIndex > 0) return parts.slice(0, appsIndex).join(path.sep) || path.sep
  return cwd
}

function loadEnv() {
  const repoRoot = findRepoRoot()
  const rootEnv = path.join(repoRoot, '.env')
  const apiEnv = path.join(repoRoot, 'apps', 'api', '.env')

  if (fs.existsSync(rootEnv)) loadDotEnv({ path: rootEnv })
  if (fs.existsSync(apiEnv)) loadDotEnv({ path: apiEnv })
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    console.error(`Missing ${name}. Set it in apps/api/.env or .env.`)
    process.exit(1)
  }
  return value
}

async function hubspotFetch(pathname, init) {
  const token = requireEnv('HUBSPOT_PRIVATE_APP_TOKEN')
  const res = await fetch(`${HUBSPOT_BASE_URL}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HubSpot request failed (${res.status}): ${text}`)
  }

  return res
}

async function listHubDbRows(tableId) {
  const rows = []
  let after
  for (let i = 0; i < 10; i += 1) {
    const qs = new URLSearchParams()
      qs.set('limit', '100')
    if (after) qs.set('after', after)

    const res = await hubspotFetch(`/cms/v3/hubdb/tables/${encodeURIComponent(tableId)}/rows?${qs.toString()}`, {
      method: 'GET',
    })
    const data = await res.json()
    rows.push(...(data.results ?? []))
    after = data.paging?.next?.after
    if (!after) break
  }

  return rows
}

async function createHubDbRow(tableId, values) {
  const res = await hubspotFetch(`/cms/v3/hubdb/tables/${encodeURIComponent(tableId)}/rows`, {
    method: 'POST',
    body: JSON.stringify({ values }),
  })
  return await res.json()
}

async function publishHubDbTable(tableId) {
  await hubspotFetch(`/cms/v3/hubdb/tables/${encodeURIComponent(tableId)}/publish`, {
    method: 'POST',
  })
}

function normalizeValue(value) {
  if (value == null) return undefined
  if (Array.isArray(value)) return value.map((v) => normalizeValue(v)).filter(Boolean)
  if (typeof value === 'object') {
    if (typeof value.url === 'string') return value.url
    if (typeof value.href === 'string') return value.href
    if (typeof value.label === 'string') return value.label
    if (typeof value.name === 'string') return value.name
    if (typeof value.value === 'string' || typeof value.value === 'number') return value.value
  }
  return value
}

function extractFileUrl(file) {
  const raw = normalizeValue(file.url) ?? normalizeValue(file.publicUrl) ?? null
  if (raw) return String(raw)
  if (file.defaultHost && file.path) return `https://${file.defaultHost}${file.path}`
  return null
}

function inferTitle(file) {
  const name = String(file.name ?? file.title ?? '').trim()
  if (!name) return 'Untitled video'
  return name.replace(/\.(mp4|webm|mov|m4v|mkv)$/i, '')
}

function isVideoFile(file) {
  const mime = String(file.mimeType ?? file.mimetype ?? '').toLowerCase()
  if (mime.startsWith('video/')) return true
  const name = String(file.name ?? file.title ?? '').toLowerCase()
  const extension = String(file.extension ?? file.ext ?? '').toLowerCase()
  const fileType = String(file.fileType ?? file.type ?? '').toLowerCase()
  const url = String(extractFileUrl(file) ?? '').toLowerCase()
  if (fileType.includes('video')) return true
  return /\.(mp4|webm|mov|m4v|mkv)$/i.test(name)
    || /\.(mp4|webm|mov|m4v|mkv)$/i.test(extension)
    || /\.(mp4|webm|mov|m4v|mkv)$/i.test(url)
}

async function listFiles() {
  const files = []
  let after
  let offset = 0

  for (let i = 0; i < 30; i += 1) {
    const body = { limit: 100, after }
    let data
    let usedFileManager = false

    try {
      const res = await hubspotFetch(`/files/v3/files/search`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      data = await res.json()
    } catch {
      try {
        const qs = new URLSearchParams()
        qs.set('limit', '100')
        if (after) qs.set('after', after)
        const res = await hubspotFetch(`/files/v3/files?${qs.toString()}`, { method: 'GET' })
        data = await res.json()
      } catch {
        usedFileManager = true
        const qs = new URLSearchParams()
        qs.set('limit', '100')
        qs.set('offset', String(offset))
        const res = await hubspotFetch(`/filemanager/api/v3/files?${qs.toString()}`, { method: 'GET' })
        data = await res.json()
      }
    }

    const results = data.results ?? data.objects ?? data.files ?? []
    files.push(...results)
    if (usedFileManager) {
      const nextOffset = data.offset
      const hasMore = data.hasMore
      if (!hasMore || typeof nextOffset !== 'number') break
      offset = nextOffset
    } else {
      after = data.paging?.next?.after
      if (!after) break
    }
  }

  return files
}

async function main() {
  loadEnv()
  const tableId = requireEnv('HUBSPOT_VIDEOS_HUBDB_TABLE_ID')

  const existingRows = await listHubDbRows(tableId)
  const existingUrls = new Set(
    existingRows
      .map((row) => normalizeValue(row.values?.video_url) ?? normalizeValue(row.values?.youtube_url))
      .filter(Boolean)
      .map((v) => String(v)),
  )

  const files = await listFiles()
  const videos = files.filter(isVideoFile)
  console.log(`Fetched ${files.length} file(s), found ${videos.length} video candidate(s).`)

  let created = 0
  for (const file of videos) {
    const url = extractFileUrl(file)
    if (!url || existingUrls.has(url)) continue

    const values = {
      title: inferTitle(file),
      video_url: url,
      youtube_url: '',
      category: 'Training',
      author_name: 'Mentor Training',
      provision: 'all',
      product_version: 'all',
      keywords: '',
      popular: false,
    }

    await createHubDbRow(tableId, values)
    existingUrls.add(url)
    created += 1
  }

  if (created > 0) {
    await publishHubDbTable(tableId)
  }

  console.log(`Imported ${created} video(s) into HubDB table ${tableId}.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
