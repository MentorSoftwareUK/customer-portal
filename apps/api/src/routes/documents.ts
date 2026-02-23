import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { env } from '../env'
import { requireAuth } from '../auth/requireAuth'

export type Provision = 'all' | 'supported-accommodation' | 'childrens-home' | 'over-18'
export type DocumentCategory = 'Guides' | 'Templates' | 'Policies'

export type DocumentDto = {
  id: string
  title: string
  category: DocumentCategory
  version: string
  downloadLabel: string
  provision: Provision
  productVersion: 'all' | 'v2' | 'v3'
  url?: string
}

/* Demo documents array removed — empty arrays are returned when HubSpot is not configured. */

const QuerySchema = z.object({
  productVersion: z.enum(['all', 'v2', 'v3']).optional(),
  keywords: z.string().optional(),
})

type HubSpotFile = {
  id?: string
  fileId?: string
  name?: string
  title?: string
  extension?: string
  url?: string
  publicUrl?: string
  public_url?: string
  path?: string
}

type HubSpotContentSearchResult = {
  id: number
  title: string
  url: string
  description?: string
}

async function hubspotFetch(pathname: string, init?: RequestInit) {
  const res = await fetch(`https://api.hubapi.com${pathname}`, {
    method: init?.method ?? 'GET',
    body: init?.body,
    headers: {
      Authorization: `Bearer ${env.HUBSPOT_PRIVATE_APP_TOKEN}`,
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

async function listHubSpotFiles() {
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

function normalize(value: unknown) {
  return String(value ?? '').toLowerCase()
}

function parseKeywords(input?: string | null) {
  return (input ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

function extractExtension(value: string | null | undefined) {
  if (!value) return ''
  const clean = value.split('?')[0] ?? value
  const parts = clean.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
}

async function searchHubSpotFilesByKeyword(keyword: string) {
  const searchUrl = new URL('https://api.hubapi.com/contentsearch/v2/search')
  searchUrl.searchParams.set('portalId', '145032754')
  searchUrl.searchParams.set('type', 'FILE')
  searchUrl.searchParams.set('term', keyword)
  searchUrl.searchParams.set('limit', '100')

  const res = await fetch(searchUrl.toString(), {
    headers: {
      Authorization: `Bearer ${env.HUBSPOT_PRIVATE_APP_TOKEN}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Content Search API failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`)
  }

  const data = (await res.json()) as { results?: HubSpotContentSearchResult[] }
  return data.results ?? []
}

export const documentsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const ok = await requireAuth(req, reply)
    if (!ok) return reply
  })

  app.get('/', async (req) => {
    const hubspotConfigured = Boolean(env.HUBSPOT_PRIVATE_APP_TOKEN)

    const parsedQuery = QuerySchema.safeParse(req.query)
    const productVersion = parsedQuery.success ? parsedQuery.data.productVersion : undefined
    const keywordFilter = parsedQuery.success ? parsedQuery.data.keywords : undefined

    if (!hubspotConfigured) {
      return {
        documents: [] as DocumentDto[],
        warning: 'HubSpot is not configured (missing HUBSPOT_PRIVATE_APP_TOKEN).',
      }
    }

    const keywords = ['Slides', 'Webinar']

    try {
      const files = await listHubSpotFiles()
      const loweredKeywords = keywords.map((k) => k.toLowerCase())

      const allowedExtensions = new Set([
        'pdf',
        'doc',
        'docx',
        'ppt',
        'pptx',
        'xls',
        'xlsx',
        'csv',
        'txt',
      ])

      const filtered = files.filter((file: any) => {
        const extension = normalize(file.extension || '').replace('.', '')
        if (!allowedExtensions.has(extension)) return false

        const metaKeywords = Array.isArray(file.meta?.keywords)
          ? file.meta.keywords.join(' ')
          : file.meta?.keywords || ''
        const metaTags = Array.isArray(file.tags) ? file.tags.join(' ') : file.tags || ''
        const metaDescription = file.meta?.description || file.description || ''
        const haystack = [
          file.name,
          file.title,
          file.path,
          file.folderPath,
          metaKeywords,
          metaTags,
          metaDescription,
        ]
          .map(normalize)
          .join(' ')

        return loweredKeywords.some((k) => haystack.includes(k))
      })

      let mapped = filtered.map((file) => {
        const extension = (file.extension ?? '').toString().toUpperCase() || 'FILE'
        const title = file.title || file.name || 'Untitled document'
        const url = file.url || file.publicUrl || file.public_url
        return {
          id: String(file.id ?? file.fileId ?? title),
          title,
          category: 'Guides' as DocumentCategory,
          version: 'v1.0',
          downloadLabel: extension,
          provision: 'all' as Provision,
          productVersion: 'all' as const,
          url,
        }
      })

      if (mapped.length === 0) {
        const contentResults: HubSpotContentSearchResult[] = []
        for (const keyword of keywords) {
          const results = await searchHubSpotFilesByKeyword(keyword)
          contentResults.push(...results)
        }

        const deduped = Array.from(new Map(contentResults.map((row) => [row.url, row])).values())
        const allowedExtensions = new Set([
          'pdf',
          'doc',
          'docx',
          'ppt',
          'pptx',
          'xls',
          'xlsx',
          'csv',
          'txt',
        ])

        mapped = deduped
          .filter((row) => allowedExtensions.has(extractExtension(row.url)))
          .map((row) => {
            const extension = extractExtension(row.url).toUpperCase() || 'FILE'
            return {
              id: String(row.id ?? row.url),
              title: row.title?.replace(/<[^>]+>/g, '') || 'Untitled document',
              category: 'Guides' as DocumentCategory,
              version: 'v1.0',
              downloadLabel: extension,
              provision: 'all' as Provision,
              productVersion: 'all' as const,
              url: row.url,
            }
          })
      }

      const documents =
        productVersion && productVersion !== 'all'
          ? mapped.filter((d) => d.productVersion === 'all' || d.productVersion === productVersion)
          : mapped

      return {
        documents,
        warning: keywords.length
          ? `Showing documents tagged with keywords: ${keywords.join(', ')}.`
          : undefined,
      }
    } catch (e) {
      return {
        documents: [] as DocumentDto[],
        warning: 'Failed to load HubSpot documents.',
      }
    }
  })
}
