import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { env } from '../env'
import { requireAuth } from '../auth/requireAuth'
import { getAdminSettings } from '../store/settings'

export type Provision = 'all' | 'supported-accommodation' | 'childrens-home' | 'over-18'
export type ArticleCategory = 'Getting started' | 'Reporting' | 'Support'

export type KnowledgeBaseArticleDto = {
  id: string
  title: string
  category: ArticleCategory
  readMins: number
  provision: Provision
  productVersion: 'all' | 'v2' | 'v3'
  url?: string
  featuredImageUrl?: string
  description?: string
  snippet?: string
}

const demoArticles: KnowledgeBaseArticleDto[] = [
  { id: 'kb-1', title: 'How to onboard a new user', category: 'Getting started', readMins: 5, provision: 'all', productVersion: 'all' },
  {
    id: 'kb-2',
    title: 'Generating monthly reports (v3)',
    category: 'Reporting',
    readMins: 7,
    provision: 'supported-accommodation',
    productVersion: 'v3',
  },
  {
    id: 'kb-3',
    title: 'Troubleshooting login issues (v2)',
    category: 'Support',
    readMins: 4,
    provision: 'all',
    productVersion: 'v2',
  },
  { id: 'kb-4', title: 'Managing permissions (v3)', category: 'Getting started', readMins: 6, provision: 'childrens-home', productVersion: 'v3' },
]

const QuerySchema = z.object({
  productVersion: z.enum(['all', 'v2', 'v3']).optional(),
})

const ArticleQuerySchema = z.object({
  url: z.string().url(),
})

const ARTICLE_CACHE_TTL_MS = 5 * 60 * 1000
const articleCache = new Map<string, { html: string; title: string; expiresAt: number }>()

export const knowledgeBaseRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const ok = await requireAuth(req, reply)
    if (!ok) return reply
  })

  const parseTags = (value: unknown) => {
    if (!value) return []
    if (Array.isArray(value)) return value.map((v) => String(v))
    return String(value)
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
  }

  const parseProvision = (tags: string[], fallback: Provision): Provision => {
    const normalized = tags.map((t) => t.toLowerCase())
    if (normalized.some((t) => t.includes('supported-accommodation') || t.includes('supported_accommodation'))) return 'supported-accommodation'
    if (normalized.some((t) => t.includes('childrens-home') || t.includes('childrens_home') || t.includes('children'))) return 'childrens-home'
    if (normalized.some((t) => t.includes('over-18') || t.includes('over_18') || t.includes('over18') || t.includes('18+'))) return 'over-18'
    return fallback
  }

  const parseProductVersion = (tags: string[]): KnowledgeBaseArticleDto['productVersion'] => {
    const normalized = tags.map((t) => t.toLowerCase())
    if (normalized.some((t) => t.includes('v3') || t.includes('version 3') || t === '3')) return 'v3'
    if (normalized.some((t) => t.includes('v2') || t.includes('version 2') || t === '2')) return 'v2'
    return 'all'
  }

  const normalizeCategory = (value: unknown): ArticleCategory => {
    const raw = typeof value === 'string' ? value : value && typeof value === 'object' && 'name' in value ? String((value as any).name) : ''
    const lowered = raw.trim().toLowerCase()
    if (lowered.includes('getting')) return 'Getting started'
    if (lowered.includes('report')) return 'Reporting'
    if (lowered.includes('support') || lowered.includes('help')) return 'Support'
    return 'Support'
  }

  const decodeXml = (value: string) =>
    value
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')

  const titleFromUrl = (url: string) => {
    const cleaned = url.split('?')[0]?.replace(/\/$/, '') ?? url
    const slug = cleaned.split('/').filter(Boolean).pop() ?? 'Knowledge base article'
    return decodeURIComponent(slug)
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase())
  }

  const extractUrlsFromSitemap = (xml: string) => {
    const matches = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g))
    return matches.map((m) => decodeXml(m[1] ?? '').trim()).filter(Boolean)
  }

  const extractArticleHtml = (html: string) => {
    const articleMatch = html.match(/<article[\s\S]*?<\/article>/i)
    if (articleMatch?.[0]) return articleMatch[0]
    const mainMatch = html.match(/<main[\s\S]*?<\/main>/i)
    if (mainMatch?.[0]) return mainMatch[0]
    const bodyMatch = html.match(/<body[\s\S]*?<\/body>/i)
    return bodyMatch?.[0] ?? html
  }

  const extractTitle = (html: string) => {
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i)
    if (!titleMatch?.[1]) return undefined
    return decodeXml(titleMatch[1].trim())
  }

  const activateHubSpotVideos = (html: string) => {
    // HubSpot videos use data-hsv-src instead of src
    // Convert them so they load properly
    return html.replace(/(<iframe[^>]*)\s+data-hsv-src="([^"]+)"([^>]*>)/gi, '$1 src="$2" data-hsv-src="$2"$3')
  }

  const extractPublishedDate = (html: string) => {
    const timeMatch = html.match(/<time[^>]*datetime="([^"]+)"[^>]*>([^<]+)<\/time>/i)
    if (timeMatch?.[1]) return timeMatch[1]
    return undefined
  }

  const stripArticleTitle = (html: string) => {
    // Remove the first h1 tag which is usually the article title
    return html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, '')
  }

  const stripArticleDate = (html: string) => {
    // Remove the date element that appears at the top of articles
    return html.replace(/<div class="hs-search-hidden">\s*<time[^>]*>[\s\S]*?<\/time>\s*<\/div>/gi, '')
  }

  const extractTextSnippet = (html: string, maxLength: number = 120): string => {
    // Remove all HTML tags and get plain text
    let text = html
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    
    // Decode HTML entities
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
    
    // Remove dates from the beginning (e.g., "04 December 2025", "16 January 2026")
    text = text.replace(/^\s*\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\s*/i, '')
    
    // Remove any leading numbers and titles that repeat (e.g., "1. Adding more information" when title already has this)
    text = text.replace(/^\s*\d+\.\s*/, '')
    
    if (text.length <= maxLength) {
      return text
    }
    
    // Truncate at last space before maxLength
    const truncated = text.substring(0, maxLength)
    const lastSpace = truncated.lastIndexOf(' ')
    
    if (lastSpace > 0) {
      return truncated.substring(0, lastSpace) + '...'
    }
    
    return truncated + '...'
  }

  const extractFeaturedImage = (html: string): string | undefined => {
    // Try to extract first meaningful image from article content
    // Skip logos, icons, and header images
    const imgMatches = html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)
    for (const match of imgMatches) {
      const imgTag = match[0]
      const src = match[1]
      // Skip logos, icons, small images, and header images
      if (!src || 
          src.includes('logo') || 
          src.includes('icon') || 
          imgTag.includes('header__') ||
          imgTag.includes('footer__')) {
        continue
      }
      // Check if image has reasonable dimensions (width/height > 100)
      const widthMatch = imgTag.match(/width=["']?(\d+)/i)
      const heightMatch = imgTag.match(/height=["']?(\d+)/i)
      if (widthMatch && parseInt(widthMatch[1]) < 100) continue
      if (heightMatch && parseInt(heightMatch[1]) < 100) continue
      
      return src
    }
    
    // Try to get video thumbnail (YouTube, Vimeo, or HubSpot video)
    const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["'][^>]*>/i)
    if (iframeMatch?.[1]) {
      const iframeSrc = iframeMatch[1]
      // Extract YouTube thumbnail
      const youtubeMatch = iframeSrc.match(/youtube\.com\/embed\/([^?&]+)/)
      if (youtubeMatch?.[1]) {
        return `https://img.youtube.com/vi/${youtubeMatch[1]}/hqdefault.jpg`
      }
      // Extract Vimeo thumbnail would require API call, skip for now
    }
    
    return undefined
  }

  const listKbArticlesFromSitemap = async (sitemapUrl: string, fallbackProvision: Provision) => {
    const res = await fetch(sitemapUrl)
    if (!res.ok) throw new Error(`KB sitemap request failed (${res.status})`)
    const xml = await res.text()
    const locs = extractUrlsFromSitemap(xml)
    const sitemapLocs = locs.filter((loc) => loc.endsWith('.xml'))

    let articleUrls: string[] = []
    if (sitemapLocs.length > 0) {
      for (const loc of sitemapLocs.slice(0, 20)) {
        const childRes = await fetch(loc)
        if (!childRes.ok) continue
        const childXml = await childRes.text()
        articleUrls.push(...extractUrlsFromSitemap(childXml))
      }
    } else {
      articleUrls = locs
    }

    const deduped = Array.from(new Set(articleUrls)).filter((url) => url.startsWith('http'))
    return deduped.map((url) => ({
      id: url,
      title: titleFromUrl(url),
      category: 'Support' as ArticleCategory,
      readMins: 5,
      provision: fallbackProvision,
      productVersion: 'all' as const,
      url,
    }))
  }

  const extractUrl = (article: any) => {
    const candidate =
      article?.url ||
      article?.publicUrl ||
      article?.public_url ||
      article?.articleUrl ||
      article?.path ||
      article?.slug
    if (!candidate) return undefined
    const value = String(candidate)
    if (value.startsWith('http')) return value
    return undefined
  }

  app.get('/', async (req) => {
    const hubspotConfigured = Boolean(env.HUBSPOT_PRIVATE_APP_TOKEN)

    const parsedQuery = QuerySchema.safeParse(req.query)
    const productVersion = parsedQuery.success ? parsedQuery.data.productVersion : undefined

    if (!hubspotConfigured) {
      const articles =
        productVersion && productVersion !== 'all'
          ? demoArticles.filter((a) => a.productVersion === 'all' || a.productVersion === productVersion)
          : demoArticles

      return {
        articles,
        warning: 'HubSpot is not configured (missing HUBSPOT_PRIVATE_APP_TOKEN). Returning demo knowledge base articles.',
      }
    }

    try {
      const settings = await getAdminSettings()
      const defaultProvision = settings.contentGating.knowledgeBaseDefaultProvision ?? 'all'
      
      // Use Content Search API to get KB articles
      // Search for common version indicator to get most articles
      const searchUrl = new URL('https://api.hubapi.com/contentsearch/v2/search')
      searchUrl.searchParams.set('portalId', '145032754')
      searchUrl.searchParams.set('type', 'KNOWLEDGE_ARTICLE')
      searchUrl.searchParams.set('term', 'V3') // Most articles seem to be V3-prefixed
      searchUrl.searchParams.set('limit', '100')
      
      const searchRes = await fetch(searchUrl.toString(), {
        headers: {
          Authorization: `Bearer ${env.HUBSPOT_PRIVATE_APP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      })

      if (!searchRes.ok) {
        throw new Error(`Content Search API failed: ${searchRes.status}`)
      }

      const searchData: { total: number; results: Array<{ 
        id: number
        title: string
        description: string
        category: string
        url: string
        tags: string[]
      }> } = await searchRes.json()

      const mapped = searchData.results.map((article) => {
        const tags = article.tags || []
        const readMins = 5 // Default since Content Search doesn't provide read time
        const description = article.description ? article.description.replace(/<[^>]+>/g, '') : undefined

        return {
          id: String(article.id),
          title: article.title.replace(/<[^>]+>/g, ''), // Strip HTML highlight tags
          category: normalizeCategory(article.category),
          readMins,
          provision: parseProvision(tags, defaultProvision),
          productVersion: parseProductVersion(tags),
          url: article.url,
          description,
          // Featured image will be populated on-demand when needed
          featuredImageUrl: undefined,
        } satisfies KnowledgeBaseArticleDto
      })

      const articles =
        productVersion && productVersion !== 'all'
          ? mapped.filter((a) => a.productVersion === 'all' || a.productVersion === productVersion)
          : mapped

      return { articles }
    } catch (e) {
      const errMessage = e instanceof Error ? e.message : String(e)
      app.log.error({ err: e }, 'Knowledge base API request failed')
      if (env.HUBSPOT_KB_PUBLIC_SITEMAP_URL) {
        const settings = await getAdminSettings()
        const defaultProvision = settings.contentGating.knowledgeBaseDefaultProvision ?? 'all'
        const articles = await listKbArticlesFromSitemap(env.HUBSPOT_KB_PUBLIC_SITEMAP_URL, defaultProvision)
        return {
          articles,
          warning: 'Using public KB sitemap fallback. API access failed.',
          ...(env.NODE_ENV === 'development' ? { debug: errMessage } : {}),
        }
      }
      const articles =
        productVersion && productVersion !== 'all'
          ? demoArticles.filter((a) => a.productVersion === 'all' || a.productVersion === productVersion)
          : demoArticles

      return {
        articles,
        warning: 'Failed to load HubSpot knowledge base. Returning demo articles.',
      }
    }
  })

  app.get('/article/snippet', async (req, reply) => {
    const parsedQuery = ArticleQuerySchema.safeParse(req.query)
    if (!parsedQuery.success) {
      return reply.code(400).send({ message: 'Invalid URL' })
    }

    const { url } = parsedQuery.data
    
    const allowedHosts = new Set<string>()
    try {
      if (env.HUBSPOT_KB_PUBLIC_SITEMAP_URL) {
        const sitemapHost = new URL(env.HUBSPOT_KB_PUBLIC_SITEMAP_URL).host
        if (sitemapHost) allowedHosts.add(sitemapHost)
      }
    } catch {
      // ignore invalid sitemap URL
    }
    allowedHosts.add('hs-sites-eu1.com')
    allowedHosts.add('hs-sites.com')
    allowedHosts.add('hubspotusercontent.com')
    allowedHosts.add('hubspot.com')

    const urlHost = new URL(url).host
    if (![...allowedHosts].some((host) => urlHost.endsWith(host))) {
      return reply.code(403).send({ message: 'URL not allowed' })
    }

    try {
      const res = await fetch(url)
      if (!res.ok) {
        return { snippet: '' }
      }
      const html = await res.text()
      const articleHtml = extractArticleHtml(html)
      const snippet = extractTextSnippet(articleHtml, 120)
      return { snippet }
    } catch (err) {
      return { snippet: '' }
    }
  })

  app.get('/article/featured-image', async (req, reply) => {
    const parsedQuery = ArticleQuerySchema.safeParse(req.query)
    if (!parsedQuery.success) {
      return reply.code(400).send({ message: 'Invalid URL' })
    }

    const { url } = parsedQuery.data
    
    const allowedHosts = new Set<string>()
    try {
      if (env.HUBSPOT_KB_PUBLIC_SITEMAP_URL) {
        const sitemapHost = new URL(env.HUBSPOT_KB_PUBLIC_SITEMAP_URL).host
        if (sitemapHost) allowedHosts.add(sitemapHost)
      }
    } catch {
      // ignore invalid sitemap URL
    }
    allowedHosts.add('hs-sites-eu1.com')
    allowedHosts.add('hs-sites.com')
    allowedHosts.add('hubspotusercontent.com')
    allowedHosts.add('hubspot.com')

    const urlHost = new URL(url).host
    if (![...allowedHosts].some((host) => urlHost.endsWith(host))) {
      return reply.code(403).send({ message: 'URL not allowed' })
    }

    try {
      const res = await fetch(url)
      if (!res.ok) {
        return { featuredImageUrl: null }
      }
      const html = await res.text()
      const featuredImageUrl = extractFeaturedImage(html)
      return { featuredImageUrl: featuredImageUrl || null }
    } catch (err) {
      return { featuredImageUrl: null }
    }
  })

  app.get('/article', async (req, reply) => {
    const parsedQuery = ArticleQuerySchema.safeParse(req.query)
    if (!parsedQuery.success) {
      return reply.code(400).send({ message: 'Invalid URL' })
    }

    const { url } = parsedQuery.data
    const now = Date.now()
    const cached = articleCache.get(url)
    if (cached && cached.expiresAt > now) {
      return { title: cached.title, html: cached.html, url }
    }

    const allowedHosts = new Set<string>()
    try {
      if (env.HUBSPOT_KB_PUBLIC_SITEMAP_URL) {
        const sitemapHost = new URL(env.HUBSPOT_KB_PUBLIC_SITEMAP_URL).host
        if (sitemapHost) allowedHosts.add(sitemapHost)
      }
    } catch {
      // ignore invalid sitemap URL
    }
    allowedHosts.add('hs-sites-eu1.com')
    allowedHosts.add('hs-sites.com')
    allowedHosts.add('hubspotusercontent.com')
    allowedHosts.add('hubspot.com')

    const urlHost = new URL(url).host
    if (![...allowedHosts].some((host) => urlHost.endsWith(host))) {
      return reply.code(403).send({ message: 'URL not allowed' })
    }

    const controller = new AbortController()
    const timeoutMs = env.HUBSPOT_TIMEOUT_MS ?? 1_200
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) {
        return reply.code(res.status).send({ message: 'Failed to load article' })
      }
      const html = await res.text()
      let articleHtml = extractArticleHtml(html)
      // Activate HubSpot videos by converting data-hsv-src to src
      articleHtml = activateHubSpotVideos(articleHtml)
      // Remove duplicate title and date from article content
      articleHtml = stripArticleTitle(articleHtml)
      articleHtml = stripArticleDate(articleHtml)
      const title = extractTitle(html) ?? titleFromUrl(url)
      const publishedDate = extractPublishedDate(html)
      articleCache.set(url, { html: articleHtml, title, expiresAt: now + ARTICLE_CACHE_TTL_MS })
      return { title, html: articleHtml, url, publishedDate }
    } catch (err) {
      const aborted = err instanceof Error && (err.name === 'AbortError' || (err as any).code === 'ABORT_ERR')
      if (aborted) {
        return reply.code(504).send({ message: 'Article request timed out' })
      }
      return reply.code(502).send({ message: 'Failed to load article' })
    } finally {
      clearTimeout(timeout)
    }
  })
}
