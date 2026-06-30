<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { listKnowledgeBaseArticles, type KnowledgeBaseArticleDto, type KnowledgeBaseCategory } from '../lib/api'
import { provisionFilterLabel, readProvisionFilter, type ProvisionFilter, writeProvisionFilter } from '../lib/provision'
import { productVersionLabel, readProductVersionFilter, type ProductVersionFilter, writeProductVersionFilter } from '../lib/productVersion'

const router = useRouter()

const query = ref('')
const category = ref<'All' | KnowledgeBaseCategory>('All')
const provision = ref<ProvisionFilter>(readProvisionFilter())
const productVersion = ref<ProductVersionFilter>(readProductVersionFilter())
const warning = ref<string | undefined>(undefined)
const loading = ref(true)
const loadError = ref<string | null>(null)

watch(provision, (value) => writeProvisionFilter(value))
watch(productVersion, (value) => writeProductVersionFilter(value))

const articles = ref<KnowledgeBaseArticleDto[]>([])

onMounted(async () => {
  loading.value = true
  loadError.value = null
  try {
    const data = await listKnowledgeBaseArticles({ productVersion: productVersion.value })
    articles.value = data.articles
    warning.value = data.warning
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load knowledge base'
  } finally {
    loading.value = false
  }
})

const categories: KnowledgeBaseCategory[] = ['Getting started', 'Reporting', 'Support']

const categoryMeta: Record<string, { description: string; icon: string }> = {
  'All': {
    description: 'Browse every article across all topics.',
    icon: 'M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z',
  },
  'Getting started': {
    description: 'Set-up guides and first steps for new users.',
    icon: 'M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5',
  },
  'Reporting': {
    description: 'Dashboards, data exports, and analytics help.',
    icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  },
  'Support': {
    description: 'Troubleshooting, FAQs, and contact details.',
    icon: 'M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z',
  },
}

const baseFilteredArticles = computed(() => {
  const q = query.value.trim().toLowerCase()
  return articles.value.filter((a) => {
    const matchesQuery = !q || a.title.toLowerCase().includes(q)
    const matchesProvision = provision.value === 'all' || a.provision === 'all' || a.provision === provision.value
    const matchesProductVersion =
      productVersion.value === 'all' || a.productVersion === 'all' || a.productVersion === productVersion.value || !a.productVersion
    return matchesQuery && matchesProvision && matchesProductVersion
  })
})

const filteredArticles = computed(() => {
  return baseFilteredArticles.value.filter((a) => category.value === 'All' || a.category === category.value)
})

const categoryStats = computed(() => {
  const counts = new Map<KnowledgeBaseCategory, number>()
  categories.forEach((c) => counts.set(c, 0))
  baseFilteredArticles.value.forEach((article) => {
    counts.set(article.category, (counts.get(article.category) ?? 0) + 1)
  })
  return categories.map((c) => ({ name: c, count: counts.get(c) ?? 0 }))
})

const categoryColor: Record<string, string> = {
  'Getting started': 'bg-emerald-50 text-emerald-600 ring-emerald-200',
  'Reporting': 'bg-amber-50 text-amber-600 ring-amber-200',
  'Support': 'bg-primary-600/20 text-primary-300 ring-primary-500/30',
}

function openArticle(article: KnowledgeBaseArticleDto) {
  if (!article.url) return
  router.push({
    path: '/app/knowledge-base/article',
    query: {
      url: article.url,
      title: article.title,
      category: article.category,
    },
  })
}
</script>

<template>
  <div class="space-y-6">
    <!-- Error state -->
    <div v-if="loadError" class="rounded-lg border border-rose-500/30 bg-rose-50 p-4 text-sm text-rose-600">
      {{ loadError }}
    </div>

    <!-- Loading skeleton -->
    <template v-else-if="loading">
      <div class="animate-pulse space-y-6">
        <!-- Hero skeleton -->
        <div class="rounded-lg border border-gray-200 bg-white p-8 shadow-sm space-y-4">
          <div class="h-2.5 w-28 rounded-full bg-gray-100" />
          <div class="h-6 w-52 rounded-full bg-gray-100" />
          <div class="h-3 w-72 rounded-full bg-gray-100" />
          <div class="h-12 w-full rounded-lg bg-gray-50 border border-gray-200 mt-2" />
        </div>
        <!-- Category cards skeleton -->
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div v-for="i in 4" :key="i" class="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
            <div class="h-8 w-8 rounded-lg bg-gray-100" />
            <div class="h-3 w-24 rounded-full bg-gray-100" />
            <div class="h-2.5 w-full rounded-full bg-gray-100" />
          </div>
        </div>
        <!-- Article list skeleton -->
        <div class="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div class="flex items-center justify-between border-b border-gray-200 px-5 py-3">
            <div class="flex gap-3"><div class="h-9 w-36 rounded-lg bg-gray-50" /><div class="h-9 w-36 rounded-lg bg-gray-50" /></div>
            <div class="h-3 w-16 rounded-full bg-gray-100" />
          </div>
          <div v-for="i in 6" :key="i" class="flex items-center gap-3 border-b border-gray-200 px-5 py-4">
            <div class="flex-1 space-y-1.5">
              <div class="h-3 rounded-full bg-gray-100" :class="i % 2 === 0 ? 'w-1/2' : 'w-3/4'" />
              <div class="h-2.5 w-1/4 rounded-full bg-gray-100" />
            </div>
          </div>
        </div>
      </div>
      <span class="sr-only">Loading...</span>
    </template>

    <!-- Main content -->
    <template v-else>
      <!-- Section 1 — Hero panel -->
      <div class="rounded-lg border border-gray-200 bg-white px-6 pt-8 pb-8 shadow-sm sm:px-8 sm:pt-10 sm:pb-10">
        <div class="mx-auto max-w-2xl text-center">
          <div class="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Knowledge Base</div>
          <h1 class="text-2xl font-semibold tracking-tight text-black sm:text-3xl">How can we help?</h1>
          <p class="mt-2 text-sm text-gray-400">Search our guides, how-tos, and FAQs to find the answer you need.</p>
          <div class="relative mt-6">
            <div class="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
              <svg aria-hidden="true" class="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fill-rule="evenodd"
                  d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                  clip-rule="evenodd"
                />
              </svg>
            </div>
            <input
              id="kb-search"
              v-model="query"
              type="text"
              class="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block w-full pl-12 p-4 placeholder:text-gray-400"
              placeholder="Search articles, guides, and FAQs…"
            >
          </div>
        </div>
      </div>

      <!-- Warning -->
      <div v-if="warning" class="rounded-lg border border-amber-500/30 bg-amber-50 p-4 text-sm text-amber-600">
        {{ warning }}
      </div>

      <!-- Section 2 — Category cards -->
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <!-- All articles card -->
        <button
          type="button"
          class="rounded-lg border bg-white p-5 text-left shadow-sm transition cursor-pointer"
          :class="category === 'All'
            ? 'border-gray-300'
            : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'"
          @click="category = 'All'"
        >
          <div class="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-gray-50">
            <svg class="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" :d="categoryMeta['All']!.icon" />
            </svg>
          </div>
          <div class="text-sm font-semibold text-gray-900">All articles</div>
          <div class="mt-1 text-xs text-gray-400">{{ baseFilteredArticles.length }} articles · {{ categoryMeta['All']!.description }}</div>
        </button>

        <!-- Per-category cards -->
        <button
          v-for="cat in categoryStats"
          :key="cat.name"
          type="button"
          class="rounded-lg border bg-white p-5 text-left shadow-sm transition cursor-pointer"
          :class="category === cat.name
            ? 'border-gray-300'
            : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'"
          @click="category = cat.name"
        >
          <div class="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-gray-50">
            <svg class="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" :d="categoryMeta[cat.name]?.icon ?? categoryMeta['Support']!.icon" />
            </svg>
          </div>
          <div class="text-sm font-semibold text-gray-900">{{ cat.name }}</div>
          <div class="mt-1 text-xs text-gray-400">{{ cat.count }} articles · {{ categoryMeta[cat.name]?.description }}</div>
        </button>
      </div>

      <!-- Section 3 — Article list card -->
      <div class="rounded-lg border border-gray-200 bg-white overflow-hidden shadow-sm">
        <!-- Filter bar -->
        <div class="flex flex-wrap items-center gap-3 border-b border-gray-200 px-5 py-3">
          <div class="flex flex-wrap items-center gap-3 flex-1">
            <div class="flex items-center gap-2">
              <label class="text-xs text-gray-400 shrink-0" for="kb-provision">Provision</label>
              <select
                id="kb-provision"
                v-model="provision"
                class="bg-gray-50 border border-gray-200 text-gray-900 text-xs rounded-lg focus:ring-primary-500 focus:border-primary-500 p-2"
              >
                <option value="all">{{ provisionFilterLabel('all') }}</option>
                <option value="supported-accommodation">{{ provisionFilterLabel('supported-accommodation') }}</option>
                <option value="childrens-home">{{ provisionFilterLabel('childrens-home') }}</option>
                <option value="over-18">{{ provisionFilterLabel('over-18') }}</option>
              </select>
            </div>
            <div class="flex items-center gap-2">
              <label class="text-xs text-gray-400 shrink-0" for="kb-product-version">Version</label>
              <select
                id="kb-product-version"
                v-model="productVersion"
                class="bg-gray-50 border border-gray-200 text-gray-900 text-xs rounded-lg focus:ring-primary-500 focus:border-primary-500 p-2"
              >
                <option value="all">{{ productVersionLabel('all') }}</option>
                <option value="v2">{{ productVersionLabel('v2') }}</option>
                <option value="v3">{{ productVersionLabel('v3') }}</option>
              </select>
            </div>
          </div>
          <div class="text-xs text-gray-400 tabular-nums">{{ filteredArticles.length }} results</div>
        </div>

        <!-- Empty state -->
        <div v-if="!filteredArticles.length" class="flex flex-col items-center justify-center px-5 py-16 text-center">
          <svg class="h-10 w-10 text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <p class="text-sm text-gray-400">No articles match your search and filters.</p>
          <button
            v-if="category !== 'All' || query.trim()"
            type="button"
            class="mt-3 text-xs text-primary-600 hover:text-primary-700 transition"
            @click="category = 'All'; query = ''"
          >
            Clear filters
          </button>
        </div>

        <!-- Article rows -->
        <div v-else class="divide-y divide-gray-200">
          <button
            v-for="article in filteredArticles"
            :key="article.id"
            type="button"
            :disabled="!article.url"
            class="group flex w-full items-center gap-4 px-5 py-4 text-left transition"
            :class="article.url ? 'hover:bg-gray-50' : 'opacity-60 cursor-default'"
            @click="openArticle(article)"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2.5">
                <span class="text-sm font-medium text-gray-900 truncate">{{ article.title }}</span>
                <span
                  class="ui-pill shrink-0 !text-[10px] !px-2 !py-0"
                  :class="categoryColor[article.category] ?? 'bg-gray-50 text-gray-500 ring-gray-200'"
                >{{ article.category }}</span>
              </div>
              <div class="mt-1 text-xs text-gray-400">{{ article.readMins }} min read</div>
            </div>
            <svg
              class="h-4 w-4 shrink-0 text-gray-200 transition group-hover:text-gray-400 group-hover:translate-x-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
