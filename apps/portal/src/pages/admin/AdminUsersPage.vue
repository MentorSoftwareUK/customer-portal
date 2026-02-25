<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { adminCreateUser, adminGetKbViewMetrics, adminGetUserUsageMetrics, adminListUsers, adminOffboardUser, adminUpdateUser, type KbViewMetric, type PortalUser, type UserUsageMetric } from '../../lib/api'

const users = ref<PortalUser[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref<string | null>(null)
const search = ref('')
const status = ref<'active' | 'inactive' | ''>('')
const usageMetrics = ref<UserUsageMetric[]>([])
const kbMetrics = ref<KbViewMetric[]>([])
const analyticsLoading = ref(false)

const email = ref('')
const firstName = ref('')
const lastName = ref('')
const companyName = ref('')
const hubspotContactId = ref('')
const creating = ref(false)
const createError = ref<string | null>(null)

const filteredStatus = computed(() => (status.value === '' ? undefined : status.value))
const usageByEmail = computed(() => {
  const map = new Map<string, UserUsageMetric>()
  usageMetrics.value.forEach((row) => map.set(row.email, row))
  return map
})

function getUsage(email: string | null) {
  if (!email) return null
  return usageByEmail.value.get(email) ?? null
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await adminListUsers({ search: search.value || undefined, status: filteredStatus.value })
    users.value = res.users
    total.value = res.total
    analyticsLoading.value = true
    const [usageRes, kbRes] = await Promise.all([
      adminGetUserUsageMetrics({ days: 30 }).catch(() => ({ metrics: [] })),
      adminGetKbViewMetrics({ days: 30 }).catch(() => ({ metrics: [] })),
    ])
    usageMetrics.value = usageRes.metrics
    kbMetrics.value = kbRes.metrics
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load users'
  } finally {
    loading.value = false
    analyticsLoading.value = false
  }
}

async function offboard(id: string) {
  try {
    const res = await adminOffboardUser(id, 'Offboarded by admin')
    users.value = users.value.map((u) => (u.id === id ? res.user : u))
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to offboard user'
  }
}

async function setAccess(user: PortalUser, accessStatus: 'active' | 'temp_blocked' | 'perm_blocked', days?: number) {
  const blockedUntil = accessStatus === 'temp_blocked' && days
    ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
    : null
  const res = await adminUpdateUser(user.id, {
    accessStatus,
    blockedUntil,
    blockedReason: accessStatus === 'active' ? null : 'Admin restriction',
  })
  users.value = users.value.map((u) => (u.id === user.id ? res.user : u))
}

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

async function create() {
  createError.value = null
  creating.value = true
  try {
    const res = await adminCreateUser({
      email: email.value,
      firstName: firstName.value || undefined,
      lastName: lastName.value || undefined,
      companyName: companyName.value || undefined,
      hubspotContactId: hubspotContactId.value || undefined,
    })
    users.value = [res.user, ...users.value]
    email.value = ''
    firstName.value = ''
    lastName.value = ''
    companyName.value = ''
    hubspotContactId.value = ''
  } catch (e) {
    createError.value = e instanceof Error ? e.message : 'Failed to create user'
  } finally {
    creating.value = false
  }
}

onMounted(() => {
  load()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-2">
      <p class="text-xs uppercase tracking-[0.08em] text-gray-600">Control center</p>
      <h2 class="text-2xl font-semibold text-gray-900">User management</h2>
      <p class="text-sm text-gray-700">View, search and manage portal users.</p>
    </div>
    <div class="ui-surface relative shadow-md sm:rounded-lg overflow-hidden">
      <div class="flex flex-col md:flex-row items-center justify-between space-y-3 md:space-y-0 md:space-x-4 p-4">
        <div class="w-full md:w-1/2">
          <form class="flex items-center" @submit.prevent="load">
            <label for="simple-search" class="sr-only">Search</label>
            <div class="relative w-full">
              <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <svg aria-hidden="true" class="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fill-rule="evenodd"
                    d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                    clip-rule="evenodd"
                  />
                </svg>
              </div>
              <input
                v-model="search"
                type="text"
                id="simple-search"
                class="bg-white/5 border border-white/10 text-white text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block w-full pl-10 p-2"
                placeholder="Search by email, name, company"
              >
            </div>
          </form>
        </div>

        <div class="w-full md:w-auto flex flex-col md:flex-row space-y-2 md:space-y-0 items-stretch md:items-center justify-end md:space-x-3 flex-shrink-0">
          <select
            v-model="status"
            class="ui-input w-full md:w-auto"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button type="button" class="ui-btn-primary" @click="create" :disabled="creating">
            <span v-if="creating">Adding…</span>
            <span v-else>Add user</span>
          </button>
        </div>
      </div>

      <div class="px-4 pb-4">
        <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3 bg-white/5 border border-white/10 rounded-xl p-4">
          <input v-model="email" type="email" placeholder="Email" class="ui-input" autocomplete="off">
          <input v-model="firstName" type="text" placeholder="First name" class="ui-input" autocomplete="off">
          <input v-model="lastName" type="text" placeholder="Last name" class="ui-input" autocomplete="off">
          <input v-model="companyName" type="text" placeholder="Company" class="ui-input md:col-span-2" autocomplete="off">
          <input v-model="hubspotContactId" type="text" placeholder="HubSpot contact id (optional)" class="ui-input" autocomplete="off">
          <p v-if="createError" class="text-sm text-rose-300 md:col-span-3">{{ createError }}</p>
        </div>
      </div>

      <div class="px-4 pb-3 text-xs text-white/60">
        Usage and knowledge base metrics reflect the last 30 days.
        <span v-if="analyticsLoading">Loading analytics…</span>
      </div>

      <div class="overflow-x-auto">
        <table class="ui-table">
          <thead>
            <tr>
              <th scope="col" class="px-4 py-3">User</th>
              <th scope="col" class="px-4 py-3">Company</th>
              <th scope="col" class="px-4 py-3">Status</th>
              <th scope="col" class="px-4 py-3">Access</th>
              <th scope="col" class="px-4 py-3">Last seen</th>
              <th scope="col" class="px-4 py-3">Time (30d)</th>
              <th scope="col" class="px-4 py-3">Page views</th>
              <th scope="col" class="px-4 py-3">Tickets</th>
              <th scope="col" class="px-4 py-3"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id" class="border-b border-white/5">
              <th scope="row" class="px-4 py-3 font-medium text-white">
                <div class="flex flex-col">
                  <span>{{ user.email || 'Email removed' }}</span>
                  <span class="text-xs text-white/60">{{ [user.firstName, user.lastName].filter(Boolean).join(' ') }}</span>
                  <span v-if="user.hubspotContactId" class="text-xs text-white/50">HS: {{ user.hubspotContactId }}</span>
                </div>
              </th>
              <td class="px-4 py-3">{{ user.companyName || '—' }}</td>
              <td class="px-4 py-3">
                <span :class="user.status === 'active' ? 'ui-pill ui-pill-success' : 'ui-pill ui-pill-neutral'">{{ user.status }}</span>
              </td>
              <td class="px-4 py-3">
                <div class="flex flex-col">
                  <span
                    :class="user.accessStatus === 'active'
                      ? 'ui-pill ui-pill-success'
                      : user.accessStatus === 'temp_blocked'
                        ? 'ui-pill ui-pill-warning'
                        : 'ui-pill ui-pill-danger'"
                  >
                    {{ user.accessStatus.replace('_', ' ') }}
                  </span>
                  <span v-if="user.accessStatus === 'temp_blocked' && user.blockedUntil" class="text-xs text-white/50">
                    until {{ formatDate(user.blockedUntil) }}
                  </span>
                </div>
              </td>
              <td class="px-4 py-3">
                <div class="flex flex-col">
                  <span>{{ formatDate(getUsage(user.email)?.lastSeenAt || user.lastSeenAt) }}</span>
                  <span v-if="getUsage(user.email)?.sessionsCount" class="text-xs text-white/50">
                    {{ getUsage(user.email)?.sessionsCount }} sessions
                  </span>
                </div>
              </td>
              <td class="px-4 py-3">
                <span v-if="getUsage(user.email)">{{ formatDuration(getUsage(user.email)?.totalTimeMs || 0) }}</span>
                <span v-else>—</span>
              </td>
              <td class="px-4 py-3">
                <span v-if="getUsage(user.email)">{{ getUsage(user.email)?.pageViews }}</span>
                <span v-else>—</span>
              </td>
              <td class="px-4 py-3">{{ user.ticketsCount }}</td>
              <td class="px-4 py-3">
                <div class="flex flex-wrap items-center justify-end gap-2">
                  <template v-if="user.email">
                    <button v-if="user.accessStatus !== 'active'" class="ui-btn-secondary" @click="setAccess(user, 'active')">Restore</button>
                    <button v-if="user.accessStatus === 'active'" class="ui-btn-secondary" @click="setAccess(user, 'temp_blocked', 7)">Block 7d</button>
                    <button v-if="user.accessStatus !== 'perm_blocked'" class="ui-btn-secondary" @click="setAccess(user, 'perm_blocked')">Block perm</button>
                    <button class="ui-btn-secondary" @click="offboard(user.id)">Offboard user</button>
                  </template>
                  <span v-else class="text-xs text-white/60">Detached {{ (user.emailHistory[user.emailHistory.length - 1]?.removedAt || '').slice(0, 10) }}</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="p-4 text-sm text-white/70" v-if="error">{{ error }}</div>
      <div class="p-4 text-sm text-white/70" v-else-if="loading">Loading users…</div>
      <div class="p-4 text-sm text-white/70" v-else>Showing {{ users.length }} of {{ total }}</div>
    </div>

    <div class="ui-surface relative shadow-md sm:rounded-lg overflow-hidden">
      <div class="flex items-center justify-between p-4">
        <div>
          <h3 class="text-base font-semibold text-white">Knowledge base views</h3>
          <p class="text-xs text-white/60">Top articles over the last 30 days</p>
        </div>
        <span v-if="analyticsLoading" class="text-xs text-white/60">Loading…</span>
      </div>
      <div class="overflow-x-auto">
        <table class="ui-table">
          <thead>
            <tr>
              <th scope="col" class="px-4 py-3">Article</th>
              <th scope="col" class="px-4 py-3">Views</th>
              <th scope="col" class="px-4 py-3">Last viewed</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="article in kbMetrics" :key="article.articleId" class="border-b border-white/5">
              <td class="px-4 py-3">
                <a
                  v-if="article.url"
                  :href="article.url"
                  target="_blank"
                  rel="noopener"
                  class="text-primary-200 hover:text-primary-100 underline"
                >
                  {{ article.title || article.url || article.articleId }}
                </a>
                <span v-else>{{ article.title || article.articleId }}</span>
              </td>
              <td class="px-4 py-3">{{ article.views }}</td>
              <td class="px-4 py-3">{{ formatDate(article.lastViewedAt) }}</td>
            </tr>
            <tr v-if="!kbMetrics.length && !analyticsLoading">
              <td colspan="3" class="px-4 py-3 text-sm text-white/60">No knowledge base views in the last 30 days.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
