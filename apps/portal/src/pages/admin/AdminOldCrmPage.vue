<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'
const BASE = `${API}/admin/old-crm`

function getAdminToken() {
  try { return localStorage.getItem('admin_access_token') || '' } catch { return '' }
}
function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${getAdminToken()}` }
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
  <div class="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-white">Old CRM Data</h1>
        <p class="mt-1 text-sm text-white/50">Legacy contacts from previous CRM system</p>
      </div>
      <div v-if="!loading" class="text-sm text-white/50 tabular-nums">
        {{ filtered.length }} of {{ contacts.length }} contacts
      </div>
    </div>

    <!-- Filters -->
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <input
        v-model="search"
        type="text"
        placeholder="Search name, company, email, phone, postcode…"
        class="w-80 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <select
        v-model="sourceFilter"
        class="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        <option v-for="s in sources" :key="s" :value="s">
          {{ s === 'all' ? 'All sources' : s }}
        </option>
      </select>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <svg class="h-8 w-8 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-400">
      {{ error }}
    </div>

    <!-- Table -->
    <div v-else class="overflow-x-auto rounded-xl border border-white/[0.06]">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-white/[0.06] text-left text-xs uppercase tracking-wider text-white/40">
            <th class="px-3 py-3 font-medium">Name</th>
            <th class="px-3 py-3 font-medium">Company</th>
            <th class="px-3 py-3 font-medium">Phone</th>
            <th class="px-3 py-3 font-medium">Email</th>
            <th class="px-3 py-3 font-medium">Address</th>
            <th class="px-3 py-3 font-medium">Postcode</th>
            <th class="px-3 py-3 font-medium">Role</th>
            <th class="px-3 py-3 font-medium">Provision Type</th>
            <th class="px-3 py-3 font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(c, i) in filtered"
            :key="i"
            class="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02]"
          >
            <td class="whitespace-nowrap px-3 py-2.5 text-white/80">{{ c.name }}</td>
            <td class="whitespace-nowrap px-3 py-2.5 text-white/80">{{ c.company }}</td>
            <td class="whitespace-nowrap px-3 py-2.5 text-white/60">{{ c.phone }}</td>
            <td class="whitespace-nowrap px-3 py-2.5 text-indigo-400">{{ c.email }}</td>
            <td class="max-w-[200px] truncate px-3 py-2.5 text-white/50" :title="c.address">{{ c.address }}</td>
            <td class="whitespace-nowrap px-3 py-2.5 text-white/60">{{ c.postcode }}</td>
            <td class="whitespace-nowrap px-3 py-2.5 text-white/50">{{ c.role }}</td>
            <td class="whitespace-nowrap px-3 py-2.5 text-white/50">{{ c.provisionType }}</td>
            <td class="whitespace-nowrap px-3 py-2.5">
              <span
                class="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                :class="{
                  'bg-emerald-500/20 text-emerald-400': c.source === 'Wants to Purchase',
                  'bg-sky-500/20 text-sky-400': c.source === 'Demo Completed',
                  'bg-amber-500/20 text-amber-400': c.source === 'Interested in Demo',
                }"
              >{{ c.source }}</span>
            </td>
          </tr>
          <tr v-if="filtered.length === 0">
            <td colspan="9" class="px-3 py-8 text-center text-white/30">No contacts found</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
