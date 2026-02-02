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
    <div class="rounded-2xl border border-white/10 bg-[#14192d] p-6 shadow-[0_18px_40px_rgba(15,20,40,0.2)]">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 class="text-2xl font-semibold text-white">Knowledge base</h2>
          <p class="mt-1 text-sm text-white/60">Find guidance, templates, and step-by-step answers.</p>
        </div>
        <div class="text-sm text-white/50">{{ filteredArticles.length }} results</div>
      </div>
      <div class="mt-4">
        <label for="kb-search" class="sr-only">Search</label>
        <div class="relative">
          <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <svg aria-hidden="true" class="w-5 h-5 text-white/50" fill="currentColor" viewBox="0 0 20 20">
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
            class="bg-white/5 border border-white/10 text-white text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block w-full pl-10 p-3 placeholder:text-white/50"
            placeholder="Search articles, guides, and FAQs"
          >
        </div>
      </div>
    </div>

    <div v-if="loadError" class="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
      {{ loadError }}
    </div>

    <div v-else-if="loading" role="status" class="rounded-lg border border-white/10 bg-white/5 p-6 animate-pulse">
      <div class="space-y-3">
        <div class="h-3 w-44 rounded-full bg-white/10" />
        <div class="h-2.5 w-72 rounded-full bg-white/10" />
        <div class="h-2.5 w-60 rounded-full bg-white/10" />
      </div>
      <span class="sr-only">Loading...</span>
    </div>

    <div v-else class="grid gap-6 lg:grid-cols-[280px,1fr]">
      <aside class="space-y-4">
        <div v-if="warning" class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          {{ warning }}
        </div>

        <div class="rounded-xl border border-white/10 bg-[#14192d] p-4">
          <div class="text-xs font-semibold uppercase tracking-wide text-white/50">Browse categories</div>
          <div class="mt-3 space-y-2">
            <button
              type="button"
              class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold transition"
              :class="category === 'All' ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5'"
              @click="category = 'All'"
            >
              <span>All articles</span>
              <span class="text-xs text-white/50">{{ baseFilteredArticles.length }}</span>
            </button>
            <button
              v-for="cat in categoryStats"
              :key="cat.name"
              type="button"
              class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold transition"
              :class="category === cat.name ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5'"
              @click="category = cat.name"
            >
              <span>{{ cat.name }}</span>
              <span class="text-xs text-white/50">{{ cat.count }}</span>
            </button>
          </div>
        </div>

        <div class="rounded-xl border border-white/10 bg-[#14192d] p-4 space-y-3">
          <div class="text-xs font-semibold uppercase tracking-wide text-white/50">Filters</div>
          <div>
            <label class="sr-only" for="kb-provision">Provision type</label>
            <select
              id="kb-provision"
              v-model="provision"
              class="bg-white/5 border border-white/10 text-white text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5"
            >
              <option value="all">{{ provisionFilterLabel('all') }}</option>
              <option value="supported-accommodation">{{ provisionFilterLabel('supported-accommodation') }}</option>
              <option value="childrens-home">{{ provisionFilterLabel('childrens-home') }}</option>
              <option value="over-18">{{ provisionFilterLabel('over-18') }}</option>
            </select>
          </div>
          <div>
            <label class="sr-only" for="kb-product-version">Product version</label>
            <select
              id="kb-product-version"
              v-model="productVersion"
              class="bg-white/5 border border-white/10 text-white text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5"
            >
              <option value="all">{{ productVersionLabel('all') }}</option>
              <option value="v2">{{ productVersionLabel('v2') }}</option>
              <option value="v3">{{ productVersionLabel('v3') }}</option>
            </select>
          </div>
        </div>
      </aside>

      <section class="rounded-xl border border-white/10 bg-[#14192d]">
        <div class="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <div class="text-sm font-semibold text-white">Articles</div>
            <div class="text-xs text-white/50">Browse the latest guidance and how-tos.</div>
          </div>
          <div class="text-xs text-white/50">{{ filteredArticles.length }} results</div>
        </div>

        <div class="divide-y divide-white/10">
          <button
            v-for="article in filteredArticles"
            :key="article.id"
            type="button"
            :disabled="!article.url"
            class="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition"
            :class="article.url ? 'hover:bg-white/5' : 'opacity-60 cursor-default'"
            @click="openArticle(article)"
          >
            <div class="min-w-0">
              <div class="text-sm font-semibold text-white truncate">{{ article.title }}</div>
              <div class="mt-1 text-xs text-white/50">{{ article.readMins }} min read · {{ article.category }}</div>
            </div>
            <span class="text-xs text-white/40">View</span>
          </button>
          <div v-if="!filteredArticles.length" class="px-5 py-6 text-sm text-white/60">
            No articles match your search and filters.
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
