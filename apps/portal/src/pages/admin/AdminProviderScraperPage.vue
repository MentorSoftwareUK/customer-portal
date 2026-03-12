<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'
const BASE = `${API}/admin/provider-scraper`

function getAdminToken() {
  try { return localStorage.getItem('admin_access_token') || '' } catch { return '' }
}
function authHeaders() {
  return { Authorization: `Bearer ${getAdminToken()}` }
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Provider = {
  _id?: string
  companyNumber: string | null
  name: string
  companyType: string | null
  sicCodes: string[]
  registeredAddress: string | null
  website: string | null
  phone: string | null
  email: string | null
  employeeEstimate: string | null
  incorporatedDate: string | null
  companyStatus: string | null
  accountsCategory: string | null
  providerCategory: string | null
  source: string
  scrapedAt: string
  contactScrapedAt: string | null
  region: string | null
}

type Stats = {
  total: number
  withEmail: number
  withPhone: number
  categories: { category: string; count: number }[]
}

type SicCodes = Record<string, string>

// ─── State ────────────────────────────────────────────────────────────────────
const providers = ref<Provider[]>([])
const stats = ref<Stats | null>(null)
const totalProviders = ref(0)
const loading = ref(false)
const scraping = ref(false)
const enriching = ref(false)
const error = ref('')
const scrapeResult = ref<{ scraped: number; newCompanies: number; contactsEnriched: number; totalInDatabase: number } | null>(null)

// Scrape controls
const searchQuery = ref('')
const selectedSicCodes = ref<string[]>([])
const pages = ref(3)
const enrichContacts = ref(true)
const availableSicCodes = ref<SicCodes>({})
const defaultSicCodes = ref<string[]>([])

// Table filters
const filterText = ref('')
const filterCategory = ref('')
const filterRegion = ref('')
const currentPage = ref(1)
const pageSize = 100

const categories = computed(() => stats.value?.categories ?? [])

// ─── API helpers ──────────────────────────────────────────────────────────────
async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { ...authHeaders(), ...opts.headers } })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Server error ${res.status}`)
  }
  return res.json()
}

// ─── Load data ────────────────────────────────────────────────────────────────
async function loadProviders() {
  loading.value = true
  error.value = ''
  try {
    const qs = new URLSearchParams()
    if (filterText.value) qs.set('search', filterText.value)
    if (filterCategory.value) qs.set('category', filterCategory.value)
    if (filterRegion.value) qs.set('region', filterRegion.value)
    qs.set('page', String(currentPage.value))
    qs.set('limit', String(pageSize))

    const data = await apiFetch(`/providers?${qs}`)
    providers.value = data.items ?? []
    totalProviders.value = data.total ?? 0
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function loadStats() {
  try {
    stats.value = await apiFetch('/stats')
  } catch { /* non-critical */ }
}

async function loadSicCodes() {
  try {
    const data = await apiFetch('/sic-codes')
    availableSicCodes.value = data.sicCodes ?? {}
    defaultSicCodes.value = data.defaults ?? []
    if (!selectedSicCodes.value.length) selectedSicCodes.value = [...defaultSicCodes.value]
  } catch { /* non-critical */ }
}

// ─── Actions ──────────────────────────────────────────────────────────────────
async function runScrape() {
  scraping.value = true
  error.value = ''
  scrapeResult.value = null
  try {
    const qs = new URLSearchParams()
    if (searchQuery.value.trim()) qs.set('q', searchQuery.value.trim())
    if (selectedSicCodes.value.length) qs.set('sicCodes', selectedSicCodes.value.join(','))
    qs.set('pages', String(pages.value))
    qs.set('enrichContacts', enrichContacts.value ? 'true' : 'false')

    scrapeResult.value = await apiFetch(`/scrape?${qs}`, { method: 'POST' })
    await Promise.all([loadProviders(), loadStats()])
  } catch (e: any) {
    error.value = e.message
  } finally {
    scraping.value = false
  }
}

async function runEnrichContacts() {
  enriching.value = true
  error.value = ''
  try {
    const data = await apiFetch('/enrich-contacts', { method: 'POST' })
    scrapeResult.value = { scraped: 0, newCompanies: 0, contactsEnriched: data.enriched, totalInDatabase: stats.value?.total ?? 0 }
    await Promise.all([loadProviders(), loadStats()])
  } catch (e: any) {
    error.value = e.message
  } finally {
    enriching.value = false
  }
}

async function removeProvider(companyNumber: string) {
  try {
    await apiFetch(`/providers/${companyNumber}`, { method: 'DELETE' })
    providers.value = providers.value.filter((p) => p.companyNumber !== companyNumber)
    totalProviders.value--
    await loadStats()
  } catch (e: any) {
    error.value = e.message
  }
}

function exportCsv() {
  fetch(`${BASE}/export`, { headers: authHeaders() })
    .then((r) => r.blob())
    .then((blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `providers-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    })
}

function applyFilters() {
  currentPage.value = 1
  loadProviders()
}

function changePage(delta: number) {
  currentPage.value += delta
  loadProviders()
}

const totalPages = computed(() => Math.ceil(totalProviders.value / pageSize))

const sicCodeOptions = computed(() =>
  Object.entries(availableSicCodes.value).map(([code, label]) => ({ code, label: `${code} — ${label}` })),
)

function toggleSic(code: string) {
  const idx = selectedSicCodes.value.indexOf(code)
  if (idx >= 0) selectedSicCodes.value.splice(idx, 1)
  else selectedSicCodes.value.push(code)
}

// ─── Init ─────────────────────────────────────────────────────────────────────
onMounted(async () => {
  await Promise.all([loadProviders(), loadStats(), loadSicCodes()])
})
</script>

<template>
  <div>
    <!-- Header -->
    <div class="mb-6">
      <p class="text-xs font-semibold uppercase tracking-wider text-gray-500">Admin &rsaquo; Tools</p>
      <h2 class="mt-1 text-2xl font-bold text-gray-900">Provider Scraper</h2>
      <p class="mt-1 text-sm text-gray-500">
        Build a comprehensive list of children&rsquo;s homes and supported accommodation providers from Companies House.
        Results are stored in the database and accumulate across runs.
      </p>
    </div>

    <!-- Stats cards -->
    <div v-if="stats" class="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p class="text-xs font-medium uppercase text-gray-400">Total providers</p>
        <p class="mt-1 text-2xl font-bold text-gray-900">{{ stats.total.toLocaleString() }}</p>
      </div>
      <div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p class="text-xs font-medium uppercase text-gray-400">With email</p>
        <p class="mt-1 text-2xl font-bold text-emerald-600">{{ stats.withEmail.toLocaleString() }}</p>
      </div>
      <div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p class="text-xs font-medium uppercase text-gray-400">With phone</p>
        <p class="mt-1 text-2xl font-bold text-blue-600">{{ stats.withPhone.toLocaleString() }}</p>
      </div>
      <div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p class="text-xs font-medium uppercase text-gray-400">Categories</p>
        <div class="mt-1 flex flex-wrap gap-1">
          <span v-for="c in categories.slice(0, 4)" :key="c.category" class="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            {{ c.category }} ({{ c.count }})
          </span>
        </div>
      </div>
    </div>

    <!-- Scrape controls -->
    <div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 class="mb-3 text-sm font-semibold text-gray-700">Run a scrape</h3>
      <div class="grid gap-4 md:grid-cols-3">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-500">Keyword search (optional)</label>
          <input v-model="searchQuery" type="text" class="ui-input w-full" placeholder="e.g. supported accommodation" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-500">Pages per SIC code (1-10)</label>
          <input v-model.number="pages" type="number" min="1" max="10" class="ui-input w-full" />
          <p class="mt-0.5 text-xs text-gray-400">~100 companies per page</p>
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-500">Options</label>
          <label class="flex items-center gap-2 text-sm text-gray-600">
            <input v-model="enrichContacts" type="checkbox" class="rounded border-gray-300" />
            Scrape websites for contact details
          </label>
        </div>
      </div>
      <div class="mt-3">
        <label class="mb-1 block text-xs font-medium text-gray-500">SIC codes</label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="opt in sicCodeOptions"
            :key="opt.code"
            type="button"
            class="rounded-lg border px-3 py-1.5 text-xs font-medium transition"
            :class="selectedSicCodes.includes(opt.code)
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'"
            @click="toggleSic(opt.code)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
      <div class="mt-4 flex flex-wrap items-center gap-3">
        <button
          class="ui-btn-primary rounded-lg px-5 py-2.5 text-sm font-semibold"
          :disabled="scraping"
          @click="runScrape"
        >
          <span v-if="scraping" class="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
          {{ scraping ? 'Scraping…' : 'Run scrape' }}
        </button>
        <button
          class="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          :disabled="enriching"
          @click="runEnrichContacts"
        >
          <span v-if="enriching" class="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"></span>
          {{ enriching ? 'Enriching…' : 'Enrich contacts (batch 30)' }}
        </button>
        <button
          v-if="stats && stats.total > 0"
          class="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          @click="exportCsv"
        >
          Export CSV
        </button>
      </div>
    </div>

    <!-- Scrape result banner -->
    <div v-if="scrapeResult" class="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
      Scraped <strong>{{ scrapeResult.scraped }}</strong> companies &mdash;
      <strong>{{ scrapeResult.newCompanies }}</strong> new,
      <strong>{{ scrapeResult.contactsEnriched }}</strong> contacts enriched.
      Total in database: <strong>{{ scrapeResult.totalInDatabase.toLocaleString() }}</strong>.
    </div>

    <!-- Error -->
    <div v-if="error" class="mt-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">{{ error }}</div>

    <!-- Table filters -->
    <div class="mt-6 mb-4 flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-gray-500">
        <span class="font-semibold text-gray-900">{{ totalProviders.toLocaleString() }}</span> providers
        <span v-if="currentPage > 1 || totalPages > 1" class="text-gray-400"> &mdash; page {{ currentPage }} of {{ totalPages }}</span>
      </p>
      <div class="flex items-center gap-3">
        <div class="relative">
          <svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" clip-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"></path></svg>
          <input v-model="filterText" type="text" class="ui-input w-56 pl-9" placeholder="Search providers…" @keyup.enter="applyFilters" />
        </div>
        <select v-model="filterCategory" class="ui-input" @change="applyFilters">
          <option value="">All categories</option>
          <option v-for="c in categories" :key="c.category" :value="c.category">{{ c.category }} ({{ c.count }})</option>
        </select>
        <button class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50" @click="applyFilters">Apply</button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-16">
      <span class="mr-3 inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600"></span>
      <span class="text-sm text-gray-500">Loading providers…</span>
    </div>

    <!-- Table -->
    <div v-else-if="providers.length" class="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
          <tr>
            <th class="px-4 py-3">Company</th>
            <th class="px-4 py-3">Category</th>
            <th class="px-4 py-3">Phone</th>
            <th class="px-4 py-3">Email</th>
            <th class="px-4 py-3">Address</th>
            <th class="px-4 py-3">Employees</th>
            <th class="px-4 py-3">Website</th>
            <th class="px-4 py-3">Incorporated</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="r in providers" :key="r.companyNumber ?? r.name" class="hover:bg-gray-50">
            <td class="max-w-[240px] px-4 py-3">
              <span class="font-medium text-gray-900">{{ r.name }}</span>
              <p v-if="r.companyNumber" class="mt-0.5 text-xs text-gray-400">
                <a :href="'https://find-and-update.company-information.service.gov.uk/company/' + r.companyNumber" target="_blank" rel="noopener" class="hover:underline">{{ r.companyNumber }}</a>
              </p>
            </td>
            <td class="whitespace-nowrap px-4 py-3">
              <span
                v-if="r.providerCategory"
                class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                :class="{
                  'bg-blue-100 text-blue-800': r.providerCategory?.includes('Children'),
                  'bg-emerald-100 text-emerald-800': r.providerCategory === 'Supported Accommodation',
                  'bg-amber-100 text-amber-800': r.providerCategory === 'Semi-Independent Living',
                  'bg-purple-100 text-purple-800': r.providerCategory === 'Fostering Agency',
                  'bg-rose-100 text-rose-800': r.providerCategory?.includes('Residential Care'),
                  'bg-sky-100 text-sky-800': r.providerCategory === 'Respite Care',
                  'bg-gray-100 text-gray-700': !r.providerCategory?.includes('Children') && r.providerCategory !== 'Supported Accommodation' && r.providerCategory !== 'Semi-Independent Living' && r.providerCategory !== 'Fostering Agency' && !r.providerCategory?.includes('Residential Care') && r.providerCategory !== 'Respite Care',
                }"
              >
                {{ r.providerCategory }}
              </span>
              <span v-else class="text-gray-300">&mdash;</span>
            </td>
            <td class="whitespace-nowrap px-4 py-3">
              <a v-if="r.phone" :href="'tel:' + r.phone" class="text-blue-600 hover:underline">{{ r.phone }}</a>
              <span v-else class="text-gray-300">&mdash;</span>
            </td>
            <td class="px-4 py-3">
              <a v-if="r.email" :href="'mailto:' + r.email" class="text-blue-600 hover:underline">{{ r.email }}</a>
              <span v-else class="text-gray-300">&mdash;</span>
            </td>
            <td class="max-w-[200px] truncate px-4 py-3" :title="r.registeredAddress ?? ''">
              {{ r.registeredAddress ?? '—' }}
            </td>
            <td class="whitespace-nowrap px-4 py-3">{{ r.employeeEstimate ?? '—' }}</td>
            <td class="whitespace-nowrap px-4 py-3">
              <a v-if="r.website" :href="r.website" target="_blank" rel="noopener" class="text-blue-600 hover:underline">
                {{ r.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*/, '') }}
              </a>
              <span v-else class="text-gray-300">&mdash;</span>
            </td>
            <td class="whitespace-nowrap px-4 py-3 text-gray-500">{{ r.incorporatedDate ?? '—' }}</td>
            <td class="px-4 py-3">
              <button
                v-if="r.companyNumber"
                class="text-xs text-red-400 hover:text-red-600"
                title="Remove this provider"
                @click="removeProvider(r.companyNumber!)"
              >
                Remove
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="mt-4 flex items-center justify-between">
      <button
        :disabled="currentPage <= 1"
        class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        @click="changePage(-1)"
      >
        Previous
      </button>
      <span class="text-sm text-gray-500">Page {{ currentPage }} of {{ totalPages }}</span>
      <button
        :disabled="currentPage >= totalPages"
        class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        @click="changePage(1)"
      >
        Next
      </button>
    </div>

    <!-- Empty state -->
    <div v-if="!loading && !providers.length && stats?.total === 0" class="mt-6 rounded-xl border border-gray-200 bg-white p-12 text-center">
      <p class="text-lg font-medium text-gray-400">No providers scraped yet</p>
      <p class="mt-1 text-sm text-gray-400">Run a scrape above to start building your provider database.</p>
    </div>
  </div>
</template>
