<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getAdminAccessToken } from '../../lib/auth'

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'
const BASE = `${API}/admin/old-crm`

function authHeaders(): Record<string, string> {
  const token = getAdminAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

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
}

const contacts = ref<Contact[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const search = ref('')
const sourceFilter = ref<string>('all')

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await fetch(BASE, { headers: authHeaders() })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    contacts.value = data.contacts ?? []
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

onMounted(load)
</script>

<template>
  <div>
    <!-- Header -->
    <div class="mb-6">
      <p class="text-xs font-semibold uppercase tracking-wider text-gray-500">Admin &rsaquo; Tools</p>
      <h2 class="mt-1 text-2xl font-bold text-gray-900">Old CRM Data</h2>
      <p class="mt-1 text-sm text-gray-500">Legacy contacts from previous CRM system</p>
    </div>

    <!-- Filters -->
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-gray-500">
        <span class="font-semibold text-gray-900">{{ filtered.length }}</span> of {{ contacts.length }} contacts
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
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-16">
      <span class="mr-3 inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600"></span>
      <span class="text-sm text-gray-500">Loading contacts…</span>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">
      {{ error }}
    </div>

    <!-- Table -->
    <div v-else class="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
          <tr>
            <th class="px-4 py-3">Name</th>
            <th class="px-4 py-3">Company</th>
            <th class="px-4 py-3">Phone</th>
            <th class="px-4 py-3">Email</th>
            <th class="px-4 py-3">Address</th>
            <th class="px-4 py-3">Postcode</th>
            <th class="px-4 py-3">Role</th>
            <th class="px-4 py-3">Provision Type</th>
            <th class="px-4 py-3">Source</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="(c, i) in filtered" :key="i" class="hover:bg-gray-50">
            <td class="whitespace-nowrap px-4 py-3 font-medium text-gray-900">{{ c.name }}</td>
            <td class="whitespace-nowrap px-4 py-3 text-gray-900">{{ c.company }}</td>
            <td class="whitespace-nowrap px-4 py-3">
              <a v-if="c.phone" :href="'tel:' + c.phone" class="text-blue-600 hover:underline">{{ c.phone }}</a>
              <span v-else class="text-gray-300">&mdash;</span>
            </td>
            <td class="px-4 py-3">
              <a v-if="c.email" :href="'mailto:' + c.email" class="text-blue-600 hover:underline">{{ c.email }}</a>
              <span v-else class="text-gray-300">&mdash;</span>
            </td>
            <td class="max-w-[200px] truncate px-4 py-3" :title="c.address">{{ c.address || '—' }}</td>
            <td class="whitespace-nowrap px-4 py-3">{{ c.postcode || '—' }}</td>
            <td class="whitespace-nowrap px-4 py-3 text-gray-500">{{ c.role || '—' }}</td>
            <td class="whitespace-nowrap px-4 py-3 text-gray-500">{{ c.provisionType || '—' }}</td>
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
          </tr>
          <tr v-if="filtered.length === 0">
            <td colspan="9" class="px-4 py-8 text-center text-gray-400">No contacts found</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
