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
const sidebarOpen = ref(false)

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
  'Getting started': 'bg-emerald-400/15 text-emerald-300 ring-emerald-400/30',
  'Reporting': 'bg-amber-400/15 text-amber-300 ring-amber-400/30',
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
  <div>
    <!-- Error state -->
    <div v-if="loadError" class="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
      {{ loadError }}
    </div>

    <!-- Loading skeleton -->
    <div v-else-if="loading" class="space-y-6">
      <div class="h-12 w-full rounded-lg bg-white/5 border border-white/10 animate-pulse" />
      <div class="grid gap-6 lg:grid-cols-[240px,1fr]">
        <aside class="space-y-3 animate-pulse">
          <div class="h-2.5 w-24 rounded-full bg-white/10" />
          <div v-for="i in 4" :key="i" class="h-9 rounded-lg bg-white/5" />
          <div class="mt-4 h-2.5 w-16 rounded-full bg-white/10" />
          <div class="h-10 rounded-lg bg-white/5" />
          <div class="h-10 rounded-lg bg-white/5" />
        </aside>
        <div class="space-y-0 rounded-xl border border-white/10 bg-[#14192d] overflow-hidden animate-pulse">
          <div v-for="i in 8" :key="i" class="flex items-center gap-3 px-5 py-4 border-b border-white/10">
            <div class="flex-1 space-y-1.5">
              <div class="h-3 rounded-full bg-white/10" :class="i % 2 === 0 ? 'w-1/2' : 'w-3/4'" />
              <div class="h-2.5 w-1/3 rounded-full bg-white/10" />
            </div>
          </div>
        </div>
      </div>
      <span class="sr-only">Loading...</span>
    </div>

    <!-- Main layout -->
    <div v-else class="space-y-5">
      <!-- Search bar — primary action, top of page -->
      <div class="relative">
        <div class="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
          <svg aria-hidden="true" class="w-5 h-5 text-white/40" fill="currentColor" viewBox="0 0 20 20">
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
          class="bg-[#14192d] border border-white/10 text-white text-sm rounded-xl focus:ring-primary-500 focus:border-primary-500 block w-full pl-12 pr-4 py-3.5 placeholder:text-white/40 shadow-sm"
          placeholder="Search articles, guides, and FAQs…"
        >
        <div class="absolute inset-y-0 right-0 flex items-center pr-4">
          <span class="text-xs text-white/30">{{ filteredArticles.length }} results</span>
        </div>
      </div>

      <!-- Mobile filter toggle -->
      <button
        type="button"
        class="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/70 lg:hidden"
        @click="sidebarOpen = !sidebarOpen"
      >
        <span>
          {{ category === 'All' ? 'All categories' : category }}
          <template v-if="provision !== 'all' || productVersion !== 'all'"> · Filtered</template>
        </span>
        <svg class="h-4 w-4 text-white/40 transition" :class="sidebarOpen ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div class="grid gap-6 lg:grid-cols-[240px,1fr] items-start">
        <!-- Sidebar: categories + filters -->
        <aside :class="['space-y-6', sidebarOpen ? 'block' : 'hidden lg:block']">
          <div v-if="warning" class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            {{ warning }}
          </div>

          <!-- Categories nav -->
          <nav>
            <div class="px-1 text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-2">Categories</div>
            <button
              type="button"
              class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition"
              :class="category === 'All' ? 'bg-white/10 text-white font-semibold' : 'text-white/60 hover:bg-white/5 hover:text-white/80'"
              @click="category = 'All'"
            >
              <span>All articles</span>
              <span class="tabular-nums text-xs" :class="category === 'All' ? 'text-white/50' : 'text-white/30'">{{ baseFilteredArticles.length }}</span>
            </button>
            <button
              v-for="cat in categoryStats"
              :key="cat.name"
              type="button"
              class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition"
              :class="category === cat.name ? 'bg-white/10 text-white font-semibold' : 'text-white/60 hover:bg-white/5 hover:text-white/80'"
              @click="category = cat.name"
            >
              <span>{{ cat.name }}</span>
              <span class="tabular-nums text-xs" :class="category === cat.name ? 'text-white/50' : 'text-white/30'">{{ cat.count }}</span>
            </button>
          </nav>

          <!-- Filters -->
          <div>
            <div class="px-1 text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-2">Filters</div>
            <div class="space-y-2">
              <div>
                <label class="block px-1 mb-1 text-xs text-white/50" for="kb-provision">Provision type</label>
                <select
                  id="kb-provision"
                  v-model="provision"
                  class="bg-white/5 border border-white/10 text-white text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block w-full p-2"
                >
                  <option value="all">{{ provisionFilterLabel('all') }}</option>
                  <option value="supported-accommodation">{{ provisionFilterLabel('supported-accommodation') }}</option>
                  <option value="childrens-home">{{ provisionFilterLabel('childrens-home') }}</option>
                  <option value="over-18">{{ provisionFilterLabel('over-18') }}</option>
                </select>
              </div>
              <div>
                <label class="block px-1 mb-1 text-xs text-white/50" for="kb-product-version">Product version</label>
                <select
                  id="kb-product-version"
                  v-model="productVersion"
                  class="bg-white/5 border border-white/10 text-white text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block w-full p-2"
                >
                  <option value="all">{{ productVersionLabel('all') }}</option>
                  <option value="v2">{{ productVersionLabel('v2') }}</option>
                  <option value="v3">{{ productVersionLabel('v3') }}</option>
                </select>
              </div>
            </div>
          </div>
        </aside>

        <!-- Article list -->
        <section class="rounded-xl border border-white/10 bg-[#14192d] overflow-hidden">
          <!-- Empty state for selected category -->
          <div v-if="!filteredArticles.length" class="flex flex-col items-center justify-center px-5 py-16 text-center">
            <svg class="h-10 w-10 text-white/20 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <p class="text-sm text-white/50">No articles match your search and filters.</p>
            <button
              v-if="category !== 'All' || query.trim()"
              type="button"
              class="mt-3 text-xs text-primary-400 hover:text-primary-300 transition"
              @click="category = 'All'; query = ''"
            >
              Clear filters
            </button>
          </div>

          <!-- Article rows -->
          <div v-else class="divide-y divide-white/[0.06]">
            <button
              v-for="article in filteredArticles"
              :key="article.id"
              type="button"
              :disabled="!article.url"
              class="group flex w-full items-center gap-4 px-5 py-3.5 text-left transition"
              :class="article.url ? 'hover:bg-white/[0.04]' : 'opacity-50 cursor-default'"
              @click="openArticle(article)"
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2.5">
                  <span class="text-sm font-medium text-white truncate">{{ article.title }}</span>
                  <span
                    v-if="category === 'All'"
                    class="ui-pill shrink-0 !text-[10px] !px-2 !py-0"
                    :class="categoryColor[article.category] ?? 'bg-white/5 text-white/70 ring-white/10'"
                  >{{ article.category }}</span>
                </div>
                <div class="mt-0.5 text-xs text-white/40">{{ article.readMins }} min read</div>
              </div>
              <svg
                class="h-4 w-4 shrink-0 text-white/20 transition group-hover:text-white/50 group-hover:translate-x-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
