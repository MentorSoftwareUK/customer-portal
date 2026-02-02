import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { env } from '../env'
import { requireAuth } from '../auth/requireAuth'
import { getAdminSettings } from '../store/settings'
import { hubspotListHubDbRows } from '../integrations/hubspot'

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

const demoRecentVideos: VideoDto[] = [
  {
    youtubeId: 'dQw4w9WgXcQ',
    title: 'Portal walkthrough: getting started',
    category: 'Training',
    authorName: 'Mentor Training',
    timeAgo: '2 hours ago',
    provision: 'all',
    productVersion: 'v3',
    keywords: ['feature'],
    videoUrl: 'https://145032754.fs1.hubspotusercontent-eu1.net/hubfs/145032754/Plans.mp4',
  },
  {
    youtubeId: '9bZkp7q19f0',
    title: 'Webinar: Reporting basics',
    category: 'Webinar',
    authorName: 'Mentor Customer Success',
    timeAgo: '6 hours ago',
    provision: 'supported-accommodation',
    productVersion: 'all',
    keywords: ['webinar'],
  },
  {
    youtubeId: '3JZ_D3ELwOQ',
    title: 'Support tickets: raise and track issues',
    category: 'Support',
    authorName: 'Mentor Support',
    timeAgo: 'Yesterday',
    provision: 'childrens-home',
    productVersion: 'v3',
    keywords: ['support'],
  },
  {
    youtubeId: 'L_jWHffIx5E',
    title: 'Knowledge base: finding the right article fast',
    category: 'Knowledge Base',
    authorName: 'Mentor Training',
    timeAgo: '2 days ago',
    provision: 'all',
    productVersion: 'all',
    keywords: ['kb'],
  },
]

const demoPopularVideos: VideoDto[] = [
  {
    youtubeId: 'kJQP7kiw5Fk',
    title: 'Provision types: tailoring your setup',
    category: 'Training',
    authorName: 'Mentor Training',
    timeAgo: '7 hours ago',
    provision: 'all',
    productVersion: 'all',
    keywords: ['provision'],
  },
  {
    youtubeId: 'hTWKbfoikeg',
    title: 'Meetings: what to expect and how to prepare',
    category: 'Customer Success',
    authorName: 'Mentor Customer Success',
    timeAgo: 'Yesterday',
    provision: 'over-18',
    productVersion: 'v2',
    keywords: ['meetings'],
  },
  {
    youtubeId: 'fJ9rUzIMcZQ',
    title: 'Invoices: downloading and understanding your bill',
    category: 'Invoices',
    authorName: 'Mentor Finance',
    timeAgo: '2 days ago',
    provision: 'supported-accommodation',
    productVersion: 'v2',
    keywords: ['invoices'],
  },
  {
    youtubeId: 'uelHwf8o7_U',
    title: 'Document library: templates and version updates',
    category: 'Documents',
    authorName: 'Mentor Training',
    timeAgo: 'Last week',
    provision: 'childrens-home',
    productVersion: 'v3',
    keywords: ['documents'],
  },
]

const QuerySchema = z.object({
  productVersion: z.enum(['all', 'v2', 'v3']).optional(),
  keyword: z.string().trim().min(1).optional(),
})

export const videosRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const ok = await requireAuth(req, reply)
    if (!ok) return reply
  })

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

  const parseTags = (value: unknown) => {
    const normalized = normalizeValue(value)
    if (!normalized) return []
    if (Array.isArray(normalized)) return normalized.map((v) => String(v)).filter(Boolean)
    return String(normalized)
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
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

  const getValue = (values: Record<string, unknown>, keys: string[]) => {
    for (const key of keys) {
      if (values[key] !== undefined && values[key] !== null) return normalizeValue(values[key])
    }
    return undefined
  }

  const extractYoutubeId = (value: unknown) => {
    const raw = String(normalizeValue(value) ?? '')
    if (!raw) return ''
    if (!raw.includes('http')) return raw
    const match = raw.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{6,})/)
    return match?.[1] ?? ''
  }

  app.get('/', async (req) => {
    const hubspotConfigured = Boolean(env.HUBSPOT_PRIVATE_APP_TOKEN)
    const hubdbTableId = env.HUBSPOT_VIDEOS_HUBDB_TABLE_ID

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

    if (!hubspotConfigured || !hubdbTableId) {
      const recentVideos = demoRecentVideos.filter(filterForProductVersion).filter(filterForKeyword)
      const popularVideos = demoPopularVideos.filter(filterForProductVersion).filter(filterForKeyword)

      return {
        recentVideos,
        popularVideos,
        warning: hubspotConfigured
          ? 'HubSpot videos table is not configured (missing HUBSPOT_VIDEOS_HUBDB_TABLE_ID). Returning demo videos.'
          : 'HubSpot is not configured (missing HUBSPOT_PRIVATE_APP_TOKEN). Returning demo videos.',
      }
    }

    try {
      const settings = await getAdminSettings()
      const defaultProvision = settings.contentGating.videosDefaultProvision ?? 'all'
      const rows = await hubspotListHubDbRows({ tableId: hubdbTableId })

      const mapped: Array<VideoDto & { _popular: boolean }> = rows.map((row) => {
        const values = row.values ?? {}
        const youtubeId = extractYoutubeId(getValue(values, ['youtube_id', 'youtubeId', 'youtube', 'youtube_url', 'youtubeUrl', 'youtube_link']))
        const videoUrl = String(getValue(values, ['video_url', 'videoUrl', 'url', 'file', 'video', 'video_file']) ?? '')
        const thumbnailUrl = String(getValue(values, ['thumbnail_url', 'thumbnailUrl', 'thumbnail', 'thumb']) ?? '')
        const title = String(getValue(values, ['title', 'video_title', 'name']) ?? 'Untitled video')
        const category = String(getValue(values, ['category', 'topic', 'type']) ?? 'Training')
        const authorName = String(getValue(values, ['author_name', 'author', 'presenter', 'owner']) ?? 'Mentor')
        const provision = parseProvision(getValue(values, ['provision', 'audience']), defaultProvision)
        const productVersion = parseProductVersion(getValue(values, ['product_version', 'productVersion', 'version']))
        const keywords = parseTags(getValue(values, ['keywords', 'tags', 'tag', 'labels']))
        const popularRaw = getValue(values, ['popular', 'is_popular', 'featured', 'is_featured'])
        const isPopular = String(popularRaw ?? '').toLowerCase() === 'true'
        const publishedAt = String(getValue(values, ['published_at', 'publish_date', 'date']) ?? row.updatedAt ?? row.createdAt ?? '')

        return {
          youtubeId: youtubeId || (videoUrl ? `hubdb-${row.id}` : `hubdb-${row.id}`),
          title,
          category,
          authorName,
          timeAgo: relativeTime(publishedAt),
          provision,
          productVersion,
          keywords,
          videoUrl: videoUrl || undefined,
          thumbnailUrl: thumbnailUrl || undefined,
          _popular: isPopular,
        }
      })

      const normalize = (video: VideoDto & { _popular: boolean }) => {
        const { _popular, ...rest } = video
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
      const recentVideos = demoRecentVideos.filter(filterForProductVersion).filter(filterForKeyword)
      const popularVideos = demoPopularVideos.filter(filterForProductVersion).filter(filterForKeyword)

      return {
        recentVideos,
        popularVideos,
        warning: 'Failed to load HubSpot videos. Returning demo videos.',
      }
    }
  })
}
