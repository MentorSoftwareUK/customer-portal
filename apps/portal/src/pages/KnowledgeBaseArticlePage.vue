<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DOMPurify from 'dompurify'
import { getKnowledgeBaseArticle, listKnowledgeBaseArticles, type KnowledgeBaseArticleDto, getKnowledgeBaseArticleFeaturedImage, getKnowledgeBaseArticleSnippet, trackKbView } from '../lib/api'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const error = ref<string | null>(null)
const articleHtml = ref('')
const articleTitle = ref('')
const articleUrl = ref('')
const articleCategory = ref('')
const articlePublishedDate = ref('')
const relatedArticles = ref<KnowledgeBaseArticleDto[]>([])
const authorName = ref('Shaun Ward')
const authorTeam = ref('Training Team')

const sanitizedArticleHtml = computed(() => {
  if (!articleHtml.value) return ''
  
  // Allow iframes and video elements needed for HubSpot-embedded content.
  // data-* attributes and scrolling/target are excluded — they are not required
  // for video rendering and widen the XSS surface unnecessarily.
  return DOMPurify.sanitize(articleHtml.value, {
    ADD_TAGS: ['iframe', 'video', 'source'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'controls', 'autoplay', 'loop', 'muted', 'playsinline', 'target', 'rel'],
  })
})

const formattedDate = computed(() => {
  if (!articlePublishedDate.value) return ''
  const date = new Date(articlePublishedDate.value)
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
})

const authorInitials = computed(() => {
  return authorName.value
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
})

function getArticleSnippet(article: KnowledgeBaseArticleDto): string {
  return article.snippet || 'Read this article to learn more...'
}

async function loadArticle(url: string, title: string, category: string) {
  articleUrl.value = url
  articleTitle.value = title || 'Loading...'
  articleCategory.value = category || ''

  loading.value = true
  error.value = null

  try {
    const data = await getKnowledgeBaseArticle(url)
    articleTitle.value = data.title
    articleHtml.value = data.html
    articlePublishedDate.value = (data as any).publishedDate || ''

    trackKbView({ articleId: url, title: data.title, url })

    // Load related articles
    const articlesData = await listKnowledgeBaseArticles({})
    const allArticles = articlesData.articles

    // Filter to same category, exclude current article
    let related = allArticles.filter(a =>
      a.url !== url &&
      (category ? a.category === category : true)
    )

    // If we don't have enough, add from other categories
    if (related.length < 3) {
      const others = allArticles.filter(a => a.url !== url && !related.includes(a))
      related = [...related, ...others]
    }

    relatedArticles.value = related.slice(0, 3)

    // Fetch featured images and snippets for related articles
    for (const article of relatedArticles.value) {
      if (article.url) {
        getKnowledgeBaseArticleFeaturedImage(article.url)
          .then(imageUrl => {
            if (imageUrl) article.featuredImageUrl = imageUrl
          })
          .catch(() => {})

        getKnowledgeBaseArticleSnippet(article.url)
          .then(snippet => {
            if (snippet) article.snippet = snippet
          })
          .catch(() => {})
      }
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load article'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  const url = route.query.url as string

  if (!url) {
    router.push('/app/knowledge-base')
    return
  }

  loadArticle(url, route.query.title as string, route.query.category as string)
})

// Watch for route query changes so related-article navigation works without a full reload.
watch(
  () => route.query.url,
  (newUrl) => {
    if (!newUrl) return
    window.scrollTo(0, 0)
    loadArticle(
      newUrl as string,
      route.query.title as string,
      route.query.category as string,
    )
  },
)

function goBack() {
  router.push('/app/knowledge-base')
}

function openRelatedArticle(article: KnowledgeBaseArticleDto) {
  router.push({
    path: '/app/knowledge-base/article',
    query: {
      url: article.url,
      title: article.title,
      category: article.category,
    },
  })
  window.scrollTo(0, 0)
}
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6">
    <!-- Back button -->
    <button
      @click="goBack"
      class="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-900 transition-colors"
    >
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
      Back to Knowledge Base
    </button>

    <!-- Article header -->
    <div class="border-b border-gray-300 pb-6 mb-6 dark:border-gray-600">
      <h1 class="text-2xl font-semibold tracking-tight text-black dark:text-gray-900 mb-4">{{ articleTitle }}</h1>
      
      <!-- Author and date metadata -->
      <div class="flex items-center justify-between text-sm">
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <div class="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-gray-900 font-semibold text-sm">
              {{ authorInitials }}
            </div>
            <div>
              <div class="font-medium text-gray-900 dark:text-gray-900">{{ authorName }}</div>
              <div class="text-xs text-gray-500 dark:text-gray-400">{{ authorTeam }}</div>
            </div>
          </div>
        </div>
        <div v-if="formattedDate" class="text-right">
          <div class="text-xs text-gray-500 dark:text-gray-400">Published</div>
          <div class="font-medium text-gray-900 dark:text-gray-900">{{ formattedDate }}</div>
        </div>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="animate-pulse space-y-4">
      <div class="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
      <div class="h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
      <div class="h-4 w-5/6 rounded bg-gray-200 dark:bg-gray-700" />
      <div class="h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
      <div class="h-4 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
    </div>

    <!-- Error state -->
    <div
      v-else-if="error"
      class="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-200"
    >
      <p class="font-semibold">Failed to load article</p>
      <p class="mt-1 text-sm">{{ error }}</p>
    </div>

    <!-- Article content with white background -->
    <div v-else class="space-y-8">
      <article
        class="rounded-lg bg-white p-8 shadow-sm dark:bg-gray-800 prose prose-gray max-w-none dark:prose-invert prose-headings:font-semibold prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-img:rounded-lg prose-video:rounded-lg"
        v-html="sanitizedArticleHtml"
      />

      <!-- Related articles - Flowbite style -->
      <div v-if="relatedArticles.length > 0" class="space-y-4">
        <h2 class="text-2xl font-semibold tracking-tight text-black dark:text-gray-900">Related articles</h2>
        <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
          <button
            v-for="article in relatedArticles"
            :key="article.id"
            @click="openRelatedArticle(article)"
            class="group flex flex-col overflow-hidden rounded-lg shadow-sm border border-gray-200 text-left bg-white"
          >
            <!-- Featured Image / Placeholder -->
            <div class="relative h-48 w-full overflow-hidden bg-gradient-to-br from-blue-400 to-blue-600">
              <img 
                v-if="article.featuredImageUrl" 
                :src="article.featuredImageUrl" 
                :alt="article.title"
                class="absolute inset-0 h-full w-full object-cover"
              />
              <div v-if="!article.featuredImageUrl" class="absolute inset-0 flex items-center justify-center">
                <svg class="h-16 w-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
            
            <!-- Card Content -->
            <div class="flex flex-col gap-3 p-5">
              <h3 class="text-lg font-semibold tracking-tight text-black line-clamp-2">
                {{ article.title }}
              </h3>
              
              <p class="text-sm text-gray-400">
                {{ getArticleSnippet(article) }}
              </p>
              
              <div class="flex items-center justify-between mt-auto pt-2">
                <span class="inline-flex items-center text-sm font-medium text-primary-400 group-hover:underline">
                  Read in {{ article.readMins }} minutes
                  <svg class="ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Ensure videos and iframes are responsive */
:deep(iframe),
:deep(video) {
  max-width: 100%;
  height: auto;
  aspect-ratio: 16 / 9;
  border-radius: 0.5rem;
}

/* Better paragraph spacing */
:deep(p) {
  margin-bottom: 1rem;
}

:deep(p:last-child) {
  margin-bottom: 0;
}

/* Ensure lists have proper spacing and bullets/numbers visible */
:deep(ul),
:deep(ol) {
  margin-bottom: 1.5rem;
  padding-left: 2rem;
  list-style-position: outside;
}

:deep(ul) {
  list-style-type: disc;
}

:deep(ol) {
  list-style-type: decimal;
}

:deep(li) {
  margin-bottom: 0.75rem;
  padding-left: 0.5rem;
}

:deep(li::marker) {
  color: inherit;
}

/* Nested lists */
:deep(ul ul),
:deep(ol ul) {
  list-style-type: circle;
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
}

:deep(ul ol),
:deep(ol ol) {
  list-style-type: lower-alpha;
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
}

/* Ensure borders are light grey with proper spacing */
:deep(hr) {
  border-color: #d1d5db;
  margin-top: 2rem;
  margin-bottom: 2rem;
}

:deep(table) {
  border-color: #d1d5db;
  margin-bottom: 1.5rem;
}

:deep(th),
:deep(td) {
  border-color: #d1d5db;
  padding: 0.75rem 1rem;
}

:deep(blockquote) {
  border-left-color: #d1d5db;
  padding-left: 1.5rem;
  margin-top: 1.5rem;
  margin-bottom: 1.5rem;
}

/* Headings spacing */
:deep(h1),
:deep(h2),
:deep(h3),
:deep(h4),
:deep(h5),
:deep(h6) {
  margin-top: 2rem;
  margin-bottom: 1rem;
}

:deep(h1:first-child),
:deep(h2:first-child),
:deep(h3:first-child) {
  margin-top: 0;
}

/* Handle embedded content containers */
:deep(.hs-responsive-embed-wrapper),
:deep(.video-wrapper) {
  position: relative;
  padding-bottom: 56.25%; /* 16:9 aspect ratio */
  height: 0;
  overflow: hidden;
  margin-bottom: 1.5rem;
}

:deep(.hs-responsive-embed-wrapper iframe),
:deep(.video-wrapper iframe) {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
</style>
