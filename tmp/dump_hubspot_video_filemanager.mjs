import { config as loadDotEnv } from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'

function loadEnv() {
  const repoRoot = process.cwd()
  const rootEnv = path.join(repoRoot, '.env')
  const apiEnv = path.join(repoRoot, 'apps', 'api', '.env')
  if (fs.existsSync(rootEnv)) loadDotEnv({ path: rootEnv })
  if (fs.existsSync(apiEnv)) loadDotEnv({ path: apiEnv })
}

loadEnv()

const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN
if (!token) {
  console.error('Missing HUBSPOT_PRIVATE_APP_TOKEN (set in apps/api/.env or .env)')
  process.exit(1)
}

const HUBSPOT_BASE_URL = 'https://api.hubapi.com'

async function hubspotFetch(pathname) {
  const res = await fetch(`${HUBSPOT_BASE_URL}${pathname}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  const text = await res.text().catch(() => '')
  if (!res.ok) {
    console.error('HubSpot error', res.status, res.statusText, text.slice(0, 400))
    process.exit(1)
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const videoExtRe = /\.(mp4|webm|mov|m4v|mkv)$/i
function isVideo(file) {
  const mime = String(file.mimetype ?? file.mimeType ?? '').toLowerCase()
  if (mime.startsWith('video/')) return true
  const name = String(file.name ?? file.title ?? '')
  const ext = String(file.ext ?? file.extension ?? '')
  const url = String(file.url ?? file.public_url ?? file.publicUrl ?? '')
  return videoExtRe.test(name) || videoExtRe.test(ext) || videoExtRe.test(url)
}

const data = await hubspotFetch('/filemanager/api/v3/files?limit=200&offset=0')
const files = data.objects ?? data.results ?? data.files ?? []
const videos = files.filter(isVideo)

const firstId = videos[0]?.id ?? videos[0]?.fileId
let firstDetail = null
if (firstId) {
  try {
    firstDetail = await hubspotFetch(`/filemanager/api/v3/files/${encodeURIComponent(String(firstId))}`)
  } catch {
    firstDetail = null
  }
}

const pick = (f) => ({
  id: f.id ?? f.fileId,
  name: f.name,
  title: f.title,
  ext: f.ext ?? f.extension,
  mimetype: f.mimetype ?? f.mimeType,
  type: f.type ?? f.fileType,
  folderPath: f.folderPath,
  path: f.path,
  defaultHost: f.defaultHost,

  // common url fields
  url: f.url,
  public_url: f.public_url,
  publicUrl: f.publicUrl,
  friendly_url: f.friendly_url,
  default_hosting_url: f.default_hosting_url,
  defaultHostingUrl: f.defaultHostingUrl,
  cdnUrl: f.cdnUrl,

  // common preview/thumb fields
  thumbnail_url: f.thumbnail_url,
  thumbnailUrl: f.thumbnailUrl,
  thumb_url: f.thumb_url,
  thumbUrl: f.thumbUrl,
  preview_url: f.preview_url,
  previewUrl: f.previewUrl,

  // meta is often where preview fields live
  meta: f.meta,

  // anything that looks like a thumbnails container
  thumbnails: f.thumbnails,
})

console.log(
  JSON.stringify(
    {
      totalFiles: files.length,
      videoCandidates: videos.length,
      sample: videos.slice(0, 10).map(pick),
      firstDetail: firstDetail
        ? {
            id: firstDetail.id ?? firstDetail.fileId,
            name: firstDetail.name,
            title: firstDetail.title,
            keys: Object.keys(firstDetail).sort(),
            thumbnail_url: firstDetail.thumbnail_url,
            thumbnailUrl: firstDetail.thumbnailUrl,
            thumb_url: firstDetail.thumb_url,
            thumbUrl: firstDetail.thumbUrl,
            preview_url: firstDetail.preview_url,
            previewUrl: firstDetail.previewUrl,
            meta: firstDetail.meta,
            thumbnails: firstDetail.thumbnails,
          }
        : null,
    },
    null,
    2,
  ),
)
