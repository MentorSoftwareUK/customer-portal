import 'dotenv/config'

const HUBSPOT_BASE_URL = 'https://api.hubapi.com'
const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN
if (!token) {
  console.error('Missing HUBSPOT_PRIVATE_APP_TOKEN in environment.')
  process.exit(1)
}

const term = process.argv.slice(2).join(' ').trim()
if (!term) {
  console.error('Usage: npx -y tsx scripts/hubspot-kb-search.mts "search term"')
  process.exit(1)
}

const portalId = process.env.HUBSPOT_PORTAL_ID || '145032754'

async function hubspotSearch() {
  const searchUrl = new URL(`${HUBSPOT_BASE_URL}/contentsearch/v2/search`)
  searchUrl.searchParams.set('portalId', portalId)
  searchUrl.searchParams.set('type', 'KNOWLEDGE_ARTICLE')
  searchUrl.searchParams.set('term', term)
  searchUrl.searchParams.set('limit', '50')

  const res = await fetch(searchUrl.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Content Search API failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`)
  }

  return (await res.json()) as {
    total: number
    results: Array<{ id: number; title: string; url: string; description?: string; category?: string; tags?: string[] }>
  }
}

hubspotSearch()
  .then((data) => {
    const results = data.results.map((row) => ({
      id: row.id,
      title: row.title?.replace(/<[^>]+>/g, '') ?? '',
      url: row.url,
      category: row.category ?? null,
      tags: row.tags ?? [],
    }))

    console.log(
      JSON.stringify(
        {
          term,
          total: data.total,
          results,
        },
        null,
        2,
      ),
    )
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  })
