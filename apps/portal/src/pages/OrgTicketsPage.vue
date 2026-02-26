<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { listOrgTickets, type TicketDto } from '../lib/api'
import { useFeatureFlags } from '../lib/featureFlags'
import PageHeader from '../components/PageHeader.vue'

const tickets = ref<TicketDto[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const warning = ref<string | null>(null)

const stats = computed(() => ({
  total: tickets.value.length,
  open: tickets.value.filter((t) => t.status === 'Open').length,
  pending: tickets.value.filter((t) => t.status === 'Pending').length,
  closed: tickets.value.filter((t) => t.status === 'Closed').length,
}))
const router = useRouter()
const { featureFlags, loadFeatureFlags } = useFeatureFlags()

function ticketStatusPillClasses(status: TicketDto['status']) {
  if (status === 'Closed') return 'ui-pill-success'
  if (status === 'Open') return 'ui-pill-warning'
  return 'ui-pill-neutral'
}

async function refreshTickets() {
  loading.value = true
  error.value = null
  warning.value = null
  try {
    const data = await listOrgTickets()
    tickets.value = data.tickets
    warning.value = data.warning ?? null
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load org tickets'
  } finally {
    loading.value = false
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
      title="Org tickets"
      subtitle="Tickets associated with your organisation."
      :meta="loading ? 'Loading…' : `${tickets.length} ticket${tickets.length === 1 ? '' : 's'}`"
    >
      <template #actions>
        <RouterLink
          to="/app/tickets"
          class="ui-btn-secondary"
        >
          My tickets
        </RouterLink>

        <button
          type="button"
          class="ui-btn-secondary"
          :disabled="loading"
          @click="refreshTickets"
        >
          Refresh
        </button>
      </template>
    </PageHeader>

    <!-- Stat cards -->
    <div v-if="!loading && !error && tickets.length > 0" class="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <div class="bg-[#14192d] rounded-lg p-5 border border-white/10">
        <div class="text-3xl font-bold text-white">{{ stats.total }}</div>
        <div class="mt-1 text-sm text-gray-400">Total</div>
      </div>
      <div class="bg-[#14192d] rounded-lg p-5 border border-white/10">
        <div class="text-3xl font-bold text-amber-300">{{ stats.open }}</div>
        <div class="mt-1 text-sm text-gray-400">Open</div>
      </div>
      <div class="bg-[#14192d] rounded-lg p-5 border border-white/10">
        <div class="text-3xl font-bold text-blue-300">{{ stats.pending }}</div>
        <div class="mt-1 text-sm text-gray-400">Pending</div>
      </div>
      <div class="bg-[#14192d] rounded-lg p-5 border border-white/10">
        <div class="text-3xl font-bold text-green-300">{{ stats.closed }}</div>
        <div class="mt-1 text-sm text-gray-400">Closed</div>
      </div>
    </div>

    <div class="ui-surface relative shadow-md sm:rounded-lg overflow-hidden">
      <div v-if="error" class="border-b border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {{ error }}
      </div>

      <div v-else-if="warning" class="border-b border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        {{ warning }}
      </div>

      <div class="overflow-x-auto">
        <table class="ui-table">
          <thead>
            <tr>
              <th scope="col" class="px-4 py-3">Ticket</th>
              <th scope="col" class="px-4 py-3">Status</th>
              <th scope="col" class="px-4 py-3">Last updated</th>
            </tr>
          </thead>
          <tbody>
            <template v-if="loading">
              <tr v-for="i in 5" :key="i" class="border-b dark:border-gray-700 animate-pulse">
                <td class="px-4 py-3" colspan="3">
                  <div class="space-y-2">
                    <div class="h-3 w-64 rounded-full bg-gray-200 dark:bg-gray-700" />
                    <div class="h-2.5 w-40 rounded-full bg-gray-200 dark:bg-gray-700" />
                  </div>
                  <span class="sr-only">Loading...</span>
                </td>
              </tr>
            </template>

            <tr v-else-if="!tickets.length" class="border-b border-white/10">
              <td class="px-4 py-3" colspan="3">No tickets found.</td>
            </tr>

            <tr v-for="ticket in tickets" :key="ticket.id" class="border-b border-white/10">
              <th scope="row" class="px-4 py-3 font-medium text-white whitespace-nowrap">
                <RouterLink :to="`/app/tickets/${encodeURIComponent(ticket.id)}`" class="hover:underline">
                  #{{ ticket.id }} · {{ ticket.subject }}
                </RouterLink>
              </th>
              <td class="px-4 py-3">
                <span class="ui-pill" :class="ticketStatusPillClasses(ticket.status)">
                  <span class="ui-pill-dot" aria-hidden="true" />
                  {{ ticket.status }}
                </span>
              </td>
              <td class="px-4 py-3">{{ ticket.lastUpdatedLabel }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
