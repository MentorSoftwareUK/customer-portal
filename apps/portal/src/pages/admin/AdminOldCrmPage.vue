<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getAdminAccessToken } from '../../lib/auth'

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'
const BASE = `${API}/admin/old-crm`

function authHeaders(): Record<string, string> {
  const token = getAdminAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

type HubSpotStatus = 'customer' | 'past_customer' | 'in_pipeline' | 'lead' | 'subscriber' | 'other' | 'not_found'

type Contact = {
  name: string
  company: string
  phone: string
  email: string
  address: string
  postcode: string
  role: string
  provisionType: string
  source: string
  hubspotMatch: HubSpotStatus
  hubspotCompany: string
  hubspotDetail: string
}

type Stats = {
  total: number
  hasEmail: number
  hasPhone: number
  hasEmailAndPhone: number
  reEngageable: number
  customer: number
  pastCustomer: number
  inPipeline: number
  lead: number
  subscriber: number
  other: number
  notFound: number
}

const contacts = ref<Contact[]>([])
const stats = ref<Stats | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const search = ref('')
const sourceFilter = ref<string>('all')
const statusFilter = ref<string>('all')

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await fetch(BASE, { headers: authHeaders() })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    contacts.value = data.contacts ?? []
    stats.value = data.stats ?? null
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load'
  } finally {
    loading.value = false
  }
}

const sources = computed(() => {
  const s = new Set(contacts.value.map((c) => c.source))
  return ['all', ...Array.from(s).sort()]
})

const filtered = computed(() => {
  let list = contacts.value
  if (sourceFilter.value !== 'all') {
    list = list.filter((c) => c.source === sourceFilter.value)
  }
  if (statusFilter.value !== 'all') {
    list = list.filter((c) => c.hubspotMatch === statusFilter.value)
  }
  const q = search.value.toLowerCase().trim()
  if (q) {
    list = list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.postcode.toLowerCase().includes(q),
    )
  }
  return list
})

function pct(n: number, total: number): string {
  if (!total) return '0%'
  return Math.round((n / total) * 100) + '%'
}

function filterByStatus(status: string) {
  statusFilter.value = statusFilter.value === status ? 'all' : status
}

onMounted(load)
</script>

<template>
  <div>
    <!-- Header -->
    <div class="mb-6">
      <p class="text-xs font-semibold uppercase tracking-wider text-gray-500">Admin &rsaquo; Tools</p>
      <h2 class="mt-1 text-2xl font-bold text-gray-900">Old CRM Data</h2>
      <p class="mt-1 text-sm text-gray-500">Legacy contacts for re-engagement &mdash; cross-referenced with HubSpot</p>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-16">
      <span class="mr-3 inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600"></span>
      <span class="text-sm text-gray-500">Loading &amp; cross-referencing with HubSpot…</span>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">
      {{ error }}
    </div>

    <template v-else>
      <!-- Stat Cards -->
      <div v-if="stats" class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <!-- Total -->
        <div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div class="text-xs font-semibold uppercase tracking-wider text-gray-400">Total Contacts</div>
          <div class="mt-1 text-2xl font-bold tabular-nums text-gray-900">{{ stats.total }}</div>
          <div class="mt-1 text-xs text-gray-400">from 3 CSV files</div>
        </div>

        <!-- Have Email -->
        <div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div class="text-xs font-semibold uppercase tracking-wider text-gray-400">Have Email</div>
          <div class="mt-1 text-2xl font-bold tabular-nums text-gray-900">{{ stats.hasEmail }}</div>
          <div class="mt-1 text-xs text-gray-400">{{ pct(stats.hasEmail, stats.total) }} of total</div>
        </div>

        <!-- Have Phone -->
        <div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div class="text-xs font-semibold uppercase tracking-wider text-gray-400">Have Phone</div>
          <div class="mt-1 text-2xl font-bold tabular-nums text-gray-900">{{ stats.hasPhone }}</div>
          <div class="mt-1 text-xs text-gray-400">{{ pct(stats.hasPhone, stats.total) }} of total</div>
        </div>

        <!-- Became Customers -->
        <button
          class="rounded-xl border p-4 text-left shadow-sm transition-colors"
          :class="statusFilter === 'customer' ? 'border-green-400 bg-green-50 ring-1 ring-green-300' : 'border-gray-200 bg-white hover:border-green-300'"
          @click="filterByStatus('customer')"
        >
          <div class="text-xs font-semibold uppercase tracking-wider text-green-600">Customers</div>
          <div class="mt-1 text-2xl font-bold tabular-nums text-green-700">{{ stats.customer }}</div>
          <div class="mt-1 text-xs text-green-500">became paying customers</div>
        </button>

        <!-- Past Customers -->
        <button
          class="rounded-xl border p-4 text-left shadow-sm transition-colors"
          :class="statusFilter === 'past_customer' ? 'border-orange-400 bg-orange-50 ring-1 ring-orange-300' : 'border-gray-200 bg-white hover:border-orange-300'"
          @click="filterByStatus('past_customer')"
        >
          <div class="text-xs font-semibold uppercase tracking-wider text-orange-600">Past Customers</div>
          <div class="mt-1 text-2xl font-bold tabular-nums text-orange-700">{{ stats.pastCustomer }}</div>
          <div class="mt-1 text-xs text-orange-500">churned &mdash; win-back?</div>
        </button>

        <!-- Already in HubSpot -->
        <button
          class="rounded-xl border p-4 text-left shadow-sm transition-colors"
          :class="['lead', 'in_pipeline', 'subscriber', 'other'].includes(statusFilter) ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300' : 'border-gray-200 bg-white hover:border-blue-300'"
          @click="filterByStatus('lead')"
        >
          <div class="text-xs font-semibold uppercase tracking-wider text-blue-600">In HubSpot</div>
          <div class="mt-1 text-2xl font-bold tabular-nums text-blue-700">{{ stats.lead + stats.inPipeline + stats.subscriber + stats.other }}</div>
          <div class="mt-1 text-xs text-blue-500">already tracked</div>
        </button>

        <!-- Re-engageable (KEY METRIC) -->
        <button
          class="rounded-xl border p-4 text-left shadow-sm transition-colors"
          :class="statusFilter === 'not_found' ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300' : 'border-indigo-200 bg-indigo-50 hover:border-indigo-400'"
          @click="filterByStatus('not_found')"
        >
          <div class="text-xs font-semibold uppercase tracking-wider text-indigo-600">Re-engageable</div>
          <div class="mt-1 text-2xl font-bold tabular-nums text-indigo-700">{{ stats.reEngageable }}</div>
          <div class="mt-1 text-xs text-indigo-500">not in HubSpot + have email</div>
        </button>
      </div>

      <!-- Filters -->
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-gray-500">
          <span class="font-semibold text-gray-900">{{ filtered.length }}</span> of {{ contacts.length }} contacts
          <button v-if="statusFilter !== 'all' || sourceFilter !== 'all'" class="ml-2 text-xs text-indigo-600 hover:underline" @click="statusFilter = 'all'; sourceFilter = 'all'">Clear filters</button>
        </p>
        <div class="flex items-center gap-3">
          <div class="relative">
            <svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" clip-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"></path></svg>
            <input
              v-model="search"
              type="text"
              placeholder="Search name, company, email, phone, postcode…"
              class="ui-input w-80 pl-9"
            />
          </div>
          <select v-model="sourceFilter" class="ui-input">
            <option v-for="s in sources" :key="s" :value="s">
              {{ s === 'all' ? 'All sources' : s }}
            </option>
          </select>
          <select v-model="statusFilter" class="ui-input">
            <option value="all">All statuses</option>
            <option value="customer">Customer</option>
            <option value="past_customer">Past Customer</option>
            <option value="in_pipeline">In Pipeline</option>
            <option value="lead">Lead / MQL</option>
            <option value="subscriber">Subscriber</option>
            <option value="other">Other (in HS)</option>
            <option value="not_found">Not in HubSpot</option>
          </select>
        </div>
      </div>

      <!-- Table -->
      <div class="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th class="px-4 py-3">Name</th>
              <th class="px-4 py-3">Company</th>
              <th class="px-4 py-3">Phone</th>
              <th class="px-4 py-3">Email</th>
              <th class="px-4 py-3">Postcode</th>
              <th class="px-4 py-3">Role</th>
              <th class="px-4 py-3">Provision Type</th>
              <th class="px-4 py-3">Source</th>
              <th class="px-4 py-3">HubSpot Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="(c, i) in filtered" :key="i" class="hover:bg-gray-50">
              <td class="px-4 py-3 font-medium text-gray-900">{{ c.name }}</td>
              <td class="px-4 py-3 text-gray-900">{{ c.company }}</td>
              <td class="whitespace-nowrap px-4 py-3">
                <a v-if="c.phone" :href="'tel:' + c.phone" class="text-blue-600 hover:underline">{{ c.phone }}</a>
                <span v-else class="text-gray-300">&mdash;</span>
              </td>
              <td class="px-4 py-3">
                <a v-if="c.email" :href="'mailto:' + c.email" class="text-blue-600 hover:underline">{{ c.email }}</a>
                <span v-else class="text-gray-300">&mdash;</span>
              </td>
              <td class="whitespace-nowrap px-4 py-3">{{ c.postcode || '—' }}</td>
              <td class="px-4 py-3 text-gray-500">{{ c.role || '—' }}</td>
              <td class="px-4 py-3 text-gray-500">{{ c.provisionType || '—' }}</td>
              <td class="whitespace-nowrap px-4 py-3">
                <span
                  class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="{
                    'bg-emerald-100 text-emerald-800': c.source === 'Wants to Purchase',
                    'bg-blue-100 text-blue-800': c.source === 'Demo Completed',
                    'bg-amber-100 text-amber-800': c.source === 'Interested in Demo',
                  }"
                >{{ c.source }}</span>
              </td>
              <td class="whitespace-nowrap px-4 py-3">
                <span
                  class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="{
                    'bg-green-100 text-green-800': c.hubspotMatch === 'customer',
                    'bg-orange-100 text-orange-800': c.hubspotMatch === 'past_customer',
                    'bg-violet-100 text-violet-800': c.hubspotMatch === 'in_pipeline',
                    'bg-blue-100 text-blue-800': c.hubspotMatch === 'lead',
                    'bg-cyan-100 text-cyan-700': c.hubspotMatch === 'subscriber',
                    'bg-slate-100 text-slate-600': c.hubspotMatch === 'other',
                    'bg-gray-100 text-gray-500': c.hubspotMatch === 'not_found',
                  }"
                >{{ c.hubspotDetail || 'Not Found' }}</span>
                <span v-if="c.hubspotCompany" class="ml-1 text-xs text-gray-400">{{ c.hubspotCompany }}</span>
              </td>
            </tr>
            <tr v-if="filtered.length === 0">
              <td colspan="9" class="px-4 py-8 text-center text-gray-400">No contacts found</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
