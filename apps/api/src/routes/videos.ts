import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { env } from '../env'
import { requireAuth } from '../auth/requireAuth'
import { getAdminSettings } from '../store/settings'

export type Provision = 'all' | 'supported-accommodation' | 'childrens-home' | 'over-18'

export type VideoDto = {
  youtubeId: string
  title: string
  category: string
  authorName: string
  timeAgo: string
  provision: Provision
  productVersion: 'all' | 'v2' | 'v3'
  keywords?: string[]
  videoUrl?: string
  thumbnailUrl?: string
}

/* Demo video arrays removed — empty arrays are returned when HubSpot is not configured. */

const QuerySchema = z.object({
  productVersion: z.enum(['all', 'v2', 'v3']).optional(),
  keyword: z.string().trim().min(1).optional(),
})

export const videosRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const ok = await requireAuth(req, reply)
    if (!ok) return reply
  })

  type HubSpotFile = {
    id?: string | number
    fileId?: string | number
    name?: string
    title?: string
    extension?: string
    url?: string
    publicUrl?: string
    public_url?: string
    path?: string
    folderPath?: string
    defaultHost?: string
    mimeType?: string
    mimetype?: string
    fileType?: string
    type?: string
    createdAt?: string | number
    updatedAt?: string | number
    meta?: {
      description?: string
      keywords?: string[] | string
      thumbnailUrl?: string
      thumbnail_url?: string
      previewUrl?: string
    }
    description?: string
    tags?: string[] | string
    thumbnailUrl?: string
    previewUrl?: string
    createdByName?: string
    createdByUser?: string
  }

  async function hubspotFetch(pathname: string, init?: RequestInit) {
    const token = env.HUBSPOT_PRIVATE_APP_TOKEN
    if (!token) {
      const err = new Error('Missing HUBSPOT_PRIVATE_APP_TOKEN')
      ;(err as any).code = 'HUBSPOT_NOT_CONFIGURED'
      throw err
    }

    const controller = new AbortController()
    const timeoutMs = env.HUBSPOT_TIMEOUT_MS ?? 5_000
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(`https://api.hubapi.com${pathname}`, {
        method: init?.method ?? 'GET',
        body: init?.body,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(init?.headers ?? {}),
        },
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        const err = new Error(`HubSpot request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`)
        ;(err as Error & { status?: number }).status = res.status
        throw err
      }

      return res.json()
    } finally {
      clearTimeout(timeout)
    }
  }

  async function listHubSpotFiles(): Promise<HubSpotFile[]> {
    const files: HubSpotFile[] = []
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

  const normalizeValue = (value: unknown): unknown => {
    if (value == null) return undefined
    if (Array.isArray(value)) return value.map((v) => normalizeValue(v)).filter(Boolean)
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>
      if (typeof obj.url === 'string') return obj.url
      if (typeof obj.href === 'string') return obj.href
      if (typeof obj.label === 'string') return obj.label
      if (typeof obj.name === 'string') return obj.name
      if (typeof obj.value === 'string' || typeof obj.value === 'number') return obj.value
    }
    return value
  }

  const parseProvision = (value: unknown, fallback: Provision): Provision => {
    const raw = String(normalizeValue(value) ?? '').toLowerCase()
    if (!raw) return fallback
    if (raw.includes('supported')) return 'supported-accommodation'
    if (raw.includes('children')) return 'childrens-home'
    if (raw.includes('18') || raw.includes('over')) return 'over-18'
    if (raw.includes('all')) return 'all'
    return fallback
  }

  const parseProductVersion = (value: unknown): VideoDto['productVersion'] => {
    const raw = String(normalizeValue(value) ?? '').toLowerCase()
    if (raw.includes('v3') || raw.includes('3')) return 'v3'
    if (raw.includes('v2') || raw.includes('2')) return 'v2'
    return 'all'
  }

  const relativeTime = (value?: string | null) => {
    if (!value) return 'Recently'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Recently'
    const diffMs = date.getTime() - Date.now()
    const diffMins = Math.round(diffMs / 60000)
    const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
      ['year', 60 * 24 * 365],
      ['month', 60 * 24 * 30],
      ['week', 60 * 24 * 7],
      ['day', 60 * 24],
      ['hour', 60],
      ['minute', 1],
    ]

    for (const [unit, mins] of units) {
      if (Math.abs(diffMins) >= mins) {
        const value = Math.round(diffMins / mins)
        return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(value, unit)
      }
    }
    return 'Just now'
  }

  const extractFileUrl = (file: HubSpotFile) => {
    const raw = normalizeValue(file.url) ?? normalizeValue(file.publicUrl) ?? normalizeValue(file.public_url) ?? null
    if (raw) return String(raw)
    if (file.defaultHost && file.path) return `https://${file.defaultHost}${file.path}`
    return null
  }

  const inferTitle = (file: HubSpotFile) => {
    const name = String(file.title ?? file.name ?? '').trim()
    if (!name) return 'Untitled video'
    return name.replace(/\.(mp4|webm|mov|m4v|mkv)$/i, '')
  }

  const isVideoFile = (file: HubSpotFile) => {
    const mime = String(file.mimeType ?? file.mimetype ?? '').toLowerCase()
    if (mime.startsWith('video/')) return true
    const name = String(file.name ?? file.title ?? '').toLowerCase()
    const extension = String(file.extension ?? '').toLowerCase()
    const fileType = String(file.fileType ?? file.type ?? '').toLowerCase()
    const url = String(extractFileUrl(file) ?? '').toLowerCase()
    if (fileType.includes('video')) return true
    return /\.(mp4|webm|mov|m4v|mkv)$/i.test(name)
      || /\.(mp4|webm|mov|m4v|mkv)$/i.test(extension)
      || /\.(mp4|webm|mov|m4v|mkv)$/i.test(url)
  }

  const inferCategory = (file: HubSpotFile) => {
    const pathLike = String(file.folderPath ?? file.path ?? '').trim()
    if (!pathLike) return 'Training'
    const parts = pathLike.split('/').filter(Boolean)
    const idx = parts.findIndex((p) => ['video', 'videos'].includes(p.toLowerCase()))
    const raw = idx >= 0 ? parts[idx + 1] : parts[0]
    if (!raw) return 'Training'
    return raw
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  }

  const collectKeywords = (file: HubSpotFile) => {
    const raw: unknown[] = []
    raw.push(file.meta?.keywords)
    raw.push(file.tags)
    const values = raw
      .flatMap((v) => (Array.isArray(v) ? v : v ? [v] : []))
      .flatMap((v) => String(v).split(','))
      .map((v) => v.trim())
      .filter(Boolean)
    return Array.from(new Set(values))
  }

  const inferThumbnailUrl = (file: HubSpotFile) => {
    const url =
      (normalizeValue(file.thumbnailUrl) as string | undefined)
      ?? (normalizeValue(file.meta?.thumbnailUrl) as string | undefined)
      ?? (normalizeValue(file.meta?.thumbnail_url) as string | undefined)
      ?? (normalizeValue(file.previewUrl) as string | undefined)
      ?? (normalizeValue(file.meta?.previewUrl) as string | undefined)
    return url ? String(url) : undefined
  }

  const inferAuthorName = (file: HubSpotFile) => {
    const raw = String(file.createdByName ?? file.createdByUser ?? '').trim()
    return raw || 'Mentor'
  }

  const toIso = (value: unknown): string | undefined => {
    if (value == null) return undefined
    if (typeof value === 'number') {
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
    }
    const str = String(value)
    if (!str) return undefined
    const date = new Date(str)
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
  }

  app.get('/', async (req) => {
    const hubspotConfigured = Boolean(env.HUBSPOT_PRIVATE_APP_TOKEN)

    const parsedQuery = QuerySchema.safeParse(req.query)
    const productVersion = parsedQuery.success ? parsedQuery.data.productVersion : undefined
    const keyword = parsedQuery.success ? parsedQuery.data.keyword?.toLowerCase() : undefined

    const filterForProductVersion = (video: VideoDto) =>
      !productVersion || productVersion === 'all' || video.productVersion === 'all' || video.productVersion === productVersion

    const filterForKeyword = (video: VideoDto) => {
      if (!keyword) return true
      const kws = video.keywords ?? []
      return kws.some((k) => k.toLowerCase() === keyword)
    }

    if (!hubspotConfigured) {
      return {
        recentVideos: [] as VideoDto[],
        popularVideos: [] as VideoDto[],
        warning: 'HubSpot is not configured (missing HUBSPOT_PRIVATE_APP_TOKEN).',
      }
    }

    try {
      const settings = await getAdminSettings()
      const defaultProvision = settings.contentGating.videosDefaultProvision ?? 'all'
      const files = await listHubSpotFiles()
      const videos = files.filter(isVideoFile)

      const mapped: Array<VideoDto & { _popular: boolean; _ts: number }> = []
      for (const file of videos) {
        const videoUrl = extractFileUrl(file)
        if (!videoUrl) continue

        const keywords = collectKeywords(file)
        const keywordsLower = keywords.map((k) => k.toLowerCase())
        const haystack = [
          file.name,
          file.title,
          file.path,
          file.folderPath,
          file.meta?.description,
          file.description,
          keywords.join(','),
        ]
          .map((v) => String(v ?? '').toLowerCase())
          .join(' ')

        const provision = parseProvision(haystack, defaultProvision)
        const productVersion = parseProductVersion(haystack)
        const isPopular = keywordsLower.includes('popular')

        const updatedAt = toIso(file.updatedAt)
        const createdAt = toIso(file.createdAt)
        const publishedAt = updatedAt ?? createdAt
        const ts = publishedAt ? new Date(publishedAt).getTime() : 0

        const id = String(file.id ?? file.fileId ?? videoUrl)
        const dto: VideoDto & { _popular: boolean; _ts: number } = {
          youtubeId: `hubspot-file-${id}`,
          title: inferTitle(file),
          category: inferCategory(file),
          authorName: inferAuthorName(file),
          timeAgo: relativeTime(publishedAt),
          provision,
          productVersion,
          videoUrl,
          _popular: isPopular,
          _ts: ts,
        }

        if (keywords.length) dto.keywords = keywords
        const thumbnailUrl = inferThumbnailUrl(file)
        if (thumbnailUrl) dto.thumbnailUrl = thumbnailUrl

        mapped.push(dto)
      }

      mapped.sort((a, b) => b._ts - a._ts)

      const normalize = (video: VideoDto & { _popular: boolean; _ts?: number }) => {
        const { _popular, _ts, ...rest } = video
        return rest
      }

      const recentVideos = mapped
        .filter((v) => !v._popular)
        .map(normalize)
        .filter(filterForProductVersion)
        .filter(filterForKeyword)
      const popularVideos = mapped
        .filter((v) => v._popular)
        .map(normalize)
        .filter(filterForProductVersion)
        .filter(filterForKeyword)

      return {
        recentVideos,
        popularVideos,
      }
    } catch (e) {
      return {
        recentVideos: [] as VideoDto[],
        popularVideos: [] as VideoDto[],
        warning: 'Failed to load HubSpot videos.',
      }
    }
  })
}
