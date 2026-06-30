<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { createTicket, listTickets, type CreateTicketRequest, type TicketDto, type TicketStats } from '../lib/api'
import { useFeatureFlags } from '../lib/featureFlags'
import PageHeader from '../components/PageHeader.vue'

const tickets = ref<TicketDto[]>([])
const apiStats = ref<TicketStats | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const warning = ref<string | null>(null)
const barsReady = ref(false)

const router = useRouter()
const { featureFlags, loadFeatureFlags } = useFeatureFlags()

const showNewTicket = ref(false)
const creating = ref(false)
const createError = ref<string | null>(null)
const createSuccess = ref<string | null>(null)

const selectedIds = ref<Set<string>>(new Set())

const ticketForm = ref<CreateTicketRequest>({
  subject: '',
  description: '',
  category: 'General',
  priority: 'Normal',
})

const canCreate = computed(() => {
  return ticketForm.value.subject.trim().length >= 3 && ticketForm.value.description.trim().length >= 10 && !creating.value
})

const stats = computed(() => apiStats.value ?? {
  total: tickets.value.length,
  open: tickets.value.filter((t) => t.status === 'Open').length,
  pending: tickets.value.filter((t) => t.status === 'Pending').length,
  closed: tickets.value.filter((t) => t.status === 'Closed').length,
  avgResponseMs: null,
  avgResolutionMs: null,
})

function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000)
  const mins = Math.floor(secs / 60)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${mins % 60}m`
  return `${mins}m`
}

function pct(n: number) {
  return stats.value.total > 0 ? Math.round((n / stats.value.total) * 100) : 0
}

function priorityBadgeClass(p?: string) {
  if (p === 'High') return 'ui-pill ui-pill-danger'
  if (p === 'Low') return 'ui-pill ui-pill-neutral'
  return 'ui-pill ui-pill-warning'
}

function statusBadgeClass(s: TicketDto['status']) {
  if (s === 'Closed') return 'ui-pill ui-pill-success'
  if (s === 'Open') return 'ui-pill ui-pill-warning'
  return 'ui-pill ui-pill-info'
}

function toggleSelect(id: string) {
  const s = new Set(selectedIds.value)
  s.has(id) ? s.delete(id) : s.add(id)
  selectedIds.value = s
}

function toggleAll() {
  if (selectedIds.value.size === tickets.value.length) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(tickets.value.map((t) => t.id))
  }
}

async function refreshTickets() {
  loading.value = true
  barsReady.value = false
  error.value = null
  warning.value = null
  try {
    const data = await listTickets()
    tickets.value = data.tickets
    apiStats.value = data.stats ?? null
    warning.value = data.warning ?? null
    await nextTick()
    requestAnimationFrame(() => { barsReady.value = true })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load tickets'
  } finally {
    loading.value = false
  }
}

async function submitTicket() {
  createError.value = null
  createSuccess.value = null
  creating.value = true
  try {
    const payload: CreateTicketRequest = {
      subject: ticketForm.value.subject,
      description: ticketForm.value.description,
      category: ticketForm.value.category?.trim() ? ticketForm.value.category : undefined,
      priority: ticketForm.value.priority,
    }
    const res = await createTicket(payload)
    createSuccess.value = `Created ticket #${res.ticket.id}`
    if (res.warning) warning.value = res.warning
    ticketForm.value = { subject: '', description: '', category: ticketForm.value.category, priority: ticketForm.value.priority }
    await refreshTickets()
    showNewTicket.value = false
  } catch (e) {
    createError.value = e instanceof Error ? e.message : 'Failed to create ticket'
  } finally {
    creating.value = false
  }
}

onMounted(async () => {
  await loadFeatureFlags()
  if (!featureFlags.value.ticketsEnabled) {
    loading.value = false
    router.replace('/app/dashboard')
    return
  }
  await refreshTickets()
})
</script>

<template>
  <div class="space-y-6">
    <PageHeader
      title="Tickets"
      subtitle="Create and track support requests."
      :meta="loading ? 'Loading…' : `${tickets.length} ticket${tickets.length === 1 ? '' : 's'}`"
    >
      <template #actions>
        <RouterLink to="/app/tickets/org" class="ui-btn-secondary">All tickets</RouterLink>
        <button type="button" class="ui-btn-primary" @click="showNewTicket = !showNewTicket">
          <svg class="h-3.5 w-3.5 mr-2" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path clip-rule="evenodd" fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
          </svg>
          New ticket
        </button>
        <button type="button" class="ui-btn-secondary" :disabled="loading" @click="refreshTickets">Refresh</button>
      </template>
    </PageHeader>

    <!-- Stat card skeletons -->
    <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
      <div class="bg-white rounded-lg p-5 border border-gray-200 sm:col-span-2 lg:col-span-1">
        <div class="h-2.5 w-10 rounded-full bg-gray-100 mb-3" />
        <div class="h-9 w-16 rounded-lg bg-gray-100" />
        <div class="mt-3 h-1.5 rounded-full bg-gray-100" />
      </div>
      <div v-for="i in 5" :key="i" class="bg-white rounded-lg p-5 border border-gray-200">
        <div class="h-2.5 w-12 rounded-full bg-gray-100 mb-3" />
        <div class="h-8 w-14 rounded-lg bg-gray-100" />
        <div class="mt-3 h-1.5 rounded-full bg-gray-100" />
      </div>
    </div>

    <!-- Stat cards with animated fill bars -->
    <div v-else-if="!error" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <!-- Total -->
      <div class="bg-white rounded-lg p-5 border border-gray-200 sm:col-span-2 lg:col-span-1">
        <div class="text-xs text-gray-500 mb-2">Total</div>
        <div class="text-3xl font-semibold tracking-tight text-gray-900">{{ stats.total }}</div>
        <div class="mt-3 flex gap-1 h-1.5">
          <div class="rounded-full bg-amber-400 transition-all duration-700 ease-out" :style="{ width: barsReady ? pct(stats.open) + '%' : '0%' }" />
          <div class="rounded-full bg-blue-400 transition-all duration-700 ease-out delay-75" :style="{ width: barsReady ? pct(stats.pending) + '%' : '0%' }" />
          <div class="rounded-full bg-emerald-400 transition-all duration-700 ease-out delay-150" :style="{ width: barsReady ? pct(stats.closed) + '%' : '0%' }" />
        </div>
        <div class="mt-2 flex gap-3 text-xs text-gray-500">
          <span class="flex items-center gap-1"><span class="h-1.5 w-1.5 rounded-full bg-amber-400 inline-block" />Open</span>
          <span class="flex items-center gap-1"><span class="h-1.5 w-1.5 rounded-full bg-blue-400 inline-block" />Pending</span>
          <span class="flex items-center gap-1"><span class="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />Closed</span>
        </div>
      </div>
      <!-- Open -->
      <div class="bg-white rounded-lg p-5 border border-gray-200">
        <div class="text-xs text-gray-500 mb-2">Open</div>
        <div class="text-3xl font-semibold tracking-tight text-gray-900">{{ stats.open }}</div>
        <div class="mt-3 h-1.5 rounded-full bg-gray-50 overflow-hidden">
          <div class="h-full rounded-full bg-amber-400 transition-all duration-700 ease-out" :style="{ width: barsReady ? pct(stats.open) + '%' : '0%' }" />
        </div>
        <div class="mt-2 text-xs text-gray-500">{{ pct(stats.open) }}% of total</div>
      </div>
      <!-- Pending -->
      <div class="bg-white rounded-lg p-5 border border-gray-200">
        <div class="text-xs text-gray-500 mb-2">Pending</div>
        <div class="text-3xl font-semibold tracking-tight text-gray-900">{{ stats.pending }}</div>
        <div class="mt-3 h-1.5 rounded-full bg-gray-50 overflow-hidden">
          <div class="h-full rounded-full bg-blue-400 transition-all duration-700 ease-out" :style="{ width: barsReady ? pct(stats.pending) + '%' : '0%' }" />
        </div>
        <div class="mt-2 text-xs text-gray-500">{{ pct(stats.pending) }}% of total</div>
      </div>
      <!-- Closed -->
      <div class="bg-white rounded-lg p-5 border border-gray-200">
        <div class="text-xs text-gray-500 mb-2">Closed</div>
        <div class="text-3xl font-semibold tracking-tight text-gray-900">{{ stats.closed }}</div>
        <div class="mt-3 h-1.5 rounded-full bg-gray-50 overflow-hidden">
          <div class="h-full rounded-full bg-emerald-400 transition-all duration-700 ease-out" :style="{ width: barsReady ? pct(stats.closed) + '%' : '0%' }" />
        </div>
        <div class="mt-2 text-xs text-gray-500">{{ pct(stats.closed) }}% of total</div>
      </div>
      <!-- Avg Response -->
      <div class="bg-white rounded-lg p-5 border border-gray-200">
        <div class="text-xs text-gray-500 mb-2">Avg response</div>
        <div class="text-2xl font-semibold tracking-tight text-gray-900 leading-tight">
          {{ stats.avgResponseMs ? formatDuration(stats.avgResponseMs) : '—' }}
        </div>
        <div class="mt-3 flex items-center gap-1.5">
          <svg class="h-3.5 w-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span class="text-xs text-gray-500">Time to first reply</span>
        </div>
      </div>
      <!-- Avg Resolution -->
      <div class="bg-white rounded-lg p-5 border border-gray-200">
        <div class="text-xs text-gray-500 mb-2">Avg resolution</div>
        <div class="text-2xl font-semibold tracking-tight text-gray-900 leading-tight">
          {{ stats.avgResolutionMs ? formatDuration(stats.avgResolutionMs) : '—' }}
        </div>
        <div class="mt-3 flex items-center gap-1.5">
          <svg class="h-3.5 w-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span class="text-xs text-gray-500">Time to close</span>
        </div>
      </div>
    </div>

    <!-- New ticket panel -->
    <div v-if="showNewTicket" class="bg-white rounded-lg border border-gray-200 p-5">
      <h3 class="text-base font-semibold tracking-tight text-black mb-1">Create a new support ticket</h3>
      <p class="text-sm text-gray-500 mb-4">Tell us what's happening and our support team will pick it up.</p>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div class="md:col-span-2">
          <label class="ui-label">Subject</label>
          <input v-model="ticketForm.subject" type="text" class="mt-1 ui-input" placeholder="e.g. Cannot access invoices" />
        </div>
        <div class="md:col-span-2">
          <label class="ui-label">Description</label>
          <textarea v-model="ticketForm.description" rows="4" class="mt-1 ui-input" placeholder="Include what you were doing, what you expected, and what happened instead." />
        </div>
        <div>
          <label class="ui-label">Category</label>
          <select v-model="ticketForm.category" class="mt-1 ui-input">
            <option value="General">General</option>
            <option value="Access">Access</option>
            <option value="Events">Events</option>
            <option value="Billing">Billing</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div>
          <label class="ui-label">Priority</label>
          <select v-model="ticketForm.priority" class="mt-1 ui-input">
            <option value="Low">Low</option>
            <option value="Normal">Normal</option>
            <option value="High">High</option>
          </select>
        </div>
        <div v-if="createError" class="md:col-span-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{{ createError }}</div>
        <div v-if="createSuccess" class="md:col-span-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{{ createSuccess }}</div>
        <div class="md:col-span-2 flex items-center justify-end gap-2">
          <button type="button" class="ui-btn-secondary" :disabled="creating" @click="showNewTicket = false">Cancel</button>
          <button type="button" class="ui-btn-primary" :disabled="!canCreate" @click="submitTicket">
            <span v-if="creating">Creating…</span>
            <span v-else>Create ticket</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Alerts -->
    <div v-if="error" class="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{{ error }}</div>
    <div v-else-if="warning" class="rounded-lg border border-amber-500/30 bg-amber-50 p-4 text-sm text-amber-600">{{ warning }}</div>

    <!-- Table -->
    <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead>
            <tr class="border-b border-gray-200 bg-gray-50">
              <th class="px-4 py-3 w-10">
                <input type="checkbox" class="rounded border-gray-300 bg-gray-50 text-primary-500 focus:ring-primary-500/50" :checked="selectedIds.size === tickets.length && tickets.length > 0" :indeterminate="selectedIds.size > 0 && selectedIds.size < tickets.length" @change="toggleAll" />
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">ID</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Subject</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Priority</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Created</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
              <th class="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <!-- Loading skeleton -->
            <template v-if="loading">
              <tr v-for="i in 5" :key="i" class="animate-pulse">
                <td class="px-4 py-3.5"><div class="h-4 w-4 rounded bg-gray-100" /></td>
                <td class="px-4 py-3.5"><div class="h-3 w-20 rounded-full bg-gray-100" /></td>
                <td class="px-4 py-3.5"><div class="h-3 w-64 rounded-full bg-gray-100" /></td>
                <td class="px-4 py-3.5"><div class="h-5 w-14 rounded-full bg-gray-100" /></td>
                <td class="px-4 py-3.5"><div class="h-3 w-24 rounded-full bg-gray-100" /></td>
                <td class="px-4 py-3.5"><div class="h-5 w-16 rounded-full bg-gray-100" /></td>
                <td class="px-4 py-3.5" />
              </tr>
            </template>
            <!-- Empty -->
            <tr v-else-if="!tickets.length">
              <td colspan="7" class="px-4 py-8 text-center text-sm text-gray-500">No tickets found.</td>
            </tr>
            <!-- Rows -->
            <tr
              v-for="ticket in tickets"
              :key="ticket.id"
              class="group hover:bg-gray-50 transition-colors cursor-pointer"
              @click.self="$router.push(`/app/tickets/${encodeURIComponent(ticket.id)}`)"
            >
              <td class="px-4 py-3.5" @click.stop>
                <input type="checkbox" class="rounded border-gray-300 bg-gray-50 text-primary-500 focus:ring-primary-500/50" :checked="selectedIds.has(ticket.id)" @change="toggleSelect(ticket.id)" />
              </td>
              <td class="px-4 py-3.5 font-mono text-xs text-gray-500">#{{ ticket.id }}</td>
              <td class="px-4 py-3.5 text-gray-900 font-medium max-w-xs">
                <RouterLink :to="`/app/tickets/${encodeURIComponent(ticket.id)}`" class="hover:text-primary-700 transition-colors truncate block">
                  {{ ticket.subject }}
                </RouterLink>
              </td>
              <td class="px-4 py-3.5">
                <span :class="priorityBadgeClass(ticket.priority)">
                  {{ ticket.priority ?? 'Normal' }}
                </span>
              </td>
              <td class="px-4 py-3.5 text-sm text-gray-500">{{ ticket.createdLabel }}</td>
              <td class="px-4 py-3.5">
                <span :class="statusBadgeClass(ticket.status)">
                  <!-- Hourglass for Pending -->
                  <svg v-if="ticket.status === 'Pending'" class="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd" /></svg>
                  <!-- Check for Closed -->
                  <svg v-else-if="ticket.status === 'Closed'" class="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>
                  <!-- Dot for Open -->
                  <span v-else class="h-1.5 w-1.5 rounded-full bg-current" />
                  {{ ticket.status }}
                </span>
              </td>
              <td class="px-4 py-3.5 text-right">
                <RouterLink :to="`/app/tickets/${encodeURIComponent(ticket.id)}`" class="text-gray-300 hover:text-gray-500 transition-colors" @click.stop>
                  <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                </RouterLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
