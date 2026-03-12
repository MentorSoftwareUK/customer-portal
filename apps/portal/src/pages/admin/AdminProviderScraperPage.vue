<script setup lang="ts">
import { ref, computed } from 'vue'

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

// ─── Auth helper ──────────────────────────────────────────────────────────────
function getAdminToken() {
  try { return localStorage.getItem('admin_access_token') || '' } catch { return '' }
}

// ─── State ────────────────────────────────────────────────────────────────────
type Provider = {
  name: string
  website: string | null
  snippet: string | null
  phone: string | null
  email: string | null
  address: string | null
  employeeEstimate: string | null
  companyType: string | null
  source: string
}

const results = ref<Provider[]>([])
const loading = ref(false)
const error = ref('')
const searchQuery = ref('')
const regionFilter = ref('')
const pages = ref(2)
const hasSearched = ref(false)

// Table filters
const filterText = ref('')
const filterType = ref('')

const companyTypes = computed(() => {
  const types = new Set<string>()
  for (const r of results.value) {
    if (r.companyType) types.add(r.companyType)
  }
  return Array.from(types).sort()
})

const filteredResults = computed(() => {
  let rows = results.value
  if (filterText.value) {
    const q = filterText.value.toLowerCase()
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.website ?? '').toLowerCase().includes(q) ||
        (r.phone ?? '').includes(q) ||
        (r.email ?? '').toLowerCase().includes(q) ||
        (r.address ?? '').toLowerCase().includes(q),
    )
  }
  if (filterType.value) {
    rows = rows.filter((r) => r.companyType === filterType.value)
  }
  return rows
})

// ─── Actions ──────────────────────────────────────────────────────────────────
async function runSearch() {
  loading.value = true
  error.value = ''
  hasSearched.value = true
  results.value = []

  const qs = new URLSearchParams()
  if (searchQuery.value.trim()) qs.set('q', searchQuery.value.trim())
  if (regionFilter.value.trim()) qs.set('region', regionFilter.value.trim())
  qs.set('pages', String(pages.value))

  try {
    const res = await fetch(`${API}/admin/provider-scraper/search?${qs}`, {
      headers: { Authorization: `Bearer ${getAdminToken()}` },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Server error ${res.status}`)
    }
    const data = await res.json()
    results.value = data.results ?? []
  } catch (e: any) {
    error.value = e.message ?? 'Search failed'
  } finally {
    loading.value = false
  }
}

function exportCsv() {
  const rows = filteredResults.value
  if (!rows.length) return

  const headers = [
    'Company Name',
    'Type',
    'Website',
    'Phone',
    'Email',
    'Address',
    'Est. Employees',
    'Snippet',
  ]

  const csvRows = [
    headers.join(','),
    ...rows.map((r) =>
      [
        r.name,
        r.companyType ?? '',
        r.website ?? '',
        r.phone ?? '',
        r.email ?? '',
        r.address ?? '',
        r.employeeEstimate ?? '',
        (r.snippet ?? '').replace(/"/g, '""'),
      ]
        .map((v) => `"${v}"`)
        .join(','),
    ),
  ]

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `provider-scrape-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div>
    <!-- Header -->
    <div class="mb-6">
      <p class="text-xs font-semibold uppercase tracking-wider text-gray-500">Admin &rsaquo; Tools</p>
      <h2 class="mt-1 text-2xl font-bold text-gray-900">Provider Scraper</h2>
      <p class="mt-1 text-sm text-gray-500">
        Search Google for children&rsquo;s homes, supported accommodation providers and similar organisations.
        Results include contact details and basic company enrichment data.
      </p>
    </div>

    <!-- Controls -->
    <div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div class="grid gap-4 md:grid-cols-4">
        <div class="md:col-span-2">
          <label class="mb-1 block text-xs font-medium text-gray-500">Search query (optional)</label>
          <input
            v-model="searchQuery"
            type="text"
            class="ui-input w-full"
            placeholder="children's homes OR supported accommodation"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-500">Region / location</label>
          <input
            v-model="regionFilter"
            type="text"
            class="ui-input w-full"
            placeholder="e.g. Manchester, West Midlands"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-500">Pages (1-5)</label>
          <input
            v-model.number="pages"
            type="number"
            min="1"
            max="5"
            class="ui-input w-full"
          />
        </div>
      </div>
      <div class="mt-4 flex items-center gap-3">
        <button
          class="ui-btn-primary rounded-lg px-5 py-2.5 text-sm font-semibold"
          :disabled="loading"
          @click="runSearch"
        >
          <span v-if="loading" class="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
          {{ loading ? 'Searching…' : 'Run search' }}
        </button>
        <button
          v-if="results.length"
          class="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          @click="exportCsv"
        >
          Export CSV
        </button>
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="mt-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">
      {{ error }}
    </div>

    <!-- Results table -->
    <div v-if="hasSearched && !loading" class="mt-6">
      <!-- Stats & table filters -->
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-gray-500">
          <span class="font-semibold text-gray-900">{{ filteredResults.length }}</span>
          <span v-if="filterText || filterType"> of {{ results.length }}</span>
          result{{ filteredResults.length === 1 ? '' : 's' }}
        </p>
        <div class="flex items-center gap-3">
          <div class="relative">
            <svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" clip-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"></path></svg>
            <input
              v-model="filterText"
              type="text"
              class="ui-input w-56 pl-9"
              placeholder="Filter results…"
            />
          </div>
          <select
            v-if="companyTypes.length"
            v-model="filterType"
            class="ui-input"
          >
            <option value="">All types</option>
            <option v-for="t in companyTypes" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>
      </div>

      <!-- Table -->
      <div v-if="filteredResults.length" class="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th class="px-4 py-3">Company</th>
              <th class="px-4 py-3">Type</th>
              <th class="px-4 py-3">Phone</th>
              <th class="px-4 py-3">Email</th>
              <th class="px-4 py-3">Address</th>
              <th class="px-4 py-3">Employees</th>
              <th class="px-4 py-3">Website</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="(r, i) in filteredResults" :key="i" class="hover:bg-gray-50">
              <td class="max-w-[220px] px-4 py-3">
                <span class="font-medium text-gray-900">{{ r.name }}</span>
                <p v-if="r.snippet" class="mt-0.5 truncate text-xs text-gray-400" :title="r.snippet">{{ r.snippet }}</p>
              </td>
              <td class="whitespace-nowrap px-4 py-3">
                <span
                  v-if="r.companyType"
                  class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="{
                    'bg-blue-100 text-blue-800': r.companyType?.includes('Children'),
                    'bg-emerald-100 text-emerald-800': r.companyType === 'Supported Accommodation',
                    'bg-amber-100 text-amber-800': r.companyType === 'Semi-Independent Living',
                    'bg-purple-100 text-purple-800': r.companyType === 'Fostering Agency',
                    'bg-rose-100 text-rose-800': r.companyType === 'Residential Care',
                  }"
                >
                  {{ r.companyType }}
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
              <td class="max-w-[180px] truncate px-4 py-3" :title="r.address ?? ''">
                {{ r.address ?? '—' }}
              </td>
              <td class="whitespace-nowrap px-4 py-3">
                {{ r.employeeEstimate ?? '—' }}
              </td>
              <td class="whitespace-nowrap px-4 py-3">
                <a v-if="r.website" :href="r.website" target="_blank" rel="noopener" class="text-blue-600 hover:underline">
                  {{ r.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*/, '') }}
                </a>
                <span v-else class="text-gray-300">&mdash;</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Empty state -->
      <div v-else-if="!filteredResults.length && hasSearched && !loading && !error" class="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <p class="text-lg font-medium text-gray-400">No results found</p>
        <p class="mt-1 text-sm text-gray-400">Try adjusting your search query or region.</p>
      </div>
    </div>
  </div>
</template>
