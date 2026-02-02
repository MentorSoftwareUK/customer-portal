import { config as loadDotEnv } from 'dotenv'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

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

function assertFfmpeg() {
  const res = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' })
  if (res.error) {
    console.error('ffmpeg is required. Install it and try again.')
    process.exit(1)
  }
}

async function hubspotFetch(pathname, init) {
  const token = requireEnv('HUBSPOT_PRIVATE_APP_TOKEN')
  const res = await fetch(`${HUBSPOT_BASE_URL}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
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

async function updateHubDbRow(tableId, rowId, values) {
  const res = await hubspotFetch(`/cms/v3/hubdb/tables/${encodeURIComponent(tableId)}/rows/${encodeURIComponent(rowId)}/draft`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  })
  return await res.json()
}

async function uploadThumbnail(filePath, fileName) {
  const folderId = process.env.HUBSPOT_VIDEO_THUMBNAILS_FOLDER_ID || ''
  const folderPath = process.env.HUBSPOT_VIDEO_THUMBNAILS_FOLDER_PATH || '/'
  const buffer = await fs.promises.readFile(filePath)
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: 'image/jpeg' }), fileName)
  if (folderId) form.append('folderId', folderId)
  else form.append('folderPath', folderPath)
  form.append('options', JSON.stringify({ access: 'PUBLIC_NOT_INDEXABLE' }))

  const res = await hubspotFetch('/filemanager/api/v3/files/upload', {
    method: 'POST',
    body: form,
  })

  const data = await res.json()
  if (Array.isArray(data.objects) && data.objects.length > 0) {
    return data.objects[0]
  }
  return data
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

function extractVideoUrl(row) {
  const values = row.values ?? {}
  const raw = normalizeValue(values.video_url) ?? normalizeValue(values.videoUrl) ?? normalizeValue(values.url)
  return raw ? String(raw) : ''
}

function extractThumbnailUrl(row) {
  const values = row.values ?? {}
  const raw = normalizeValue(values.thumbnail_url) ?? normalizeValue(values.thumbnailUrl)
  return raw ? String(raw) : ''
}

function safeFileName(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, '_').toLowerCase()
}

async function main() {
  loadEnv()
  assertFfmpeg()

  const tableId = requireEnv('HUBSPOT_VIDEOS_HUBDB_TABLE_ID')
  const frameSeconds = Number(process.env.HUBSPOT_VIDEO_THUMBNAILS_FRAME_SECONDS || 1)

  const rows = await listHubDbRows(tableId)
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mentor-video-thumbs-'))

  let updated = 0
  for (const row of rows) {
    const videoUrl = extractVideoUrl(row)
    if (!videoUrl) continue
    if (extractThumbnailUrl(row)) continue

    const baseName = safeFileName(row.values?.title || row.id)
    const thumbPath = path.join(tmpDir, `${baseName || row.id}.jpg`)

    const ffmpeg = spawnSync('ffmpeg', [
      '-y',
      '-ss',
      `00:00:${String(frameSeconds).padStart(2, '0')}`,
      '-i',
      videoUrl,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      thumbPath,
    ], { stdio: 'ignore' })

    if (ffmpeg.status !== 0 || !fs.existsSync(thumbPath)) {
      continue
    }

    const uploaded = await uploadThumbnail(thumbPath, path.basename(thumbPath))
    const thumbnailUrl = uploaded?.url || uploaded?.friendly_url || uploaded?.default_hosting_url
    if (!thumbnailUrl) continue

    await updateHubDbRow(tableId, row.id, { thumbnail_url: thumbnailUrl })
    updated += 1
  }

  console.log(`Updated ${updated} HubDB row(s) with thumbnails.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
