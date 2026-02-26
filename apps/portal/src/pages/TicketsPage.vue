<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { createTicket, listTickets, type CreateTicketRequest, type TicketDto } from '../lib/api'
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

const showNewTicket = ref(false)
const creating = ref(false)
const createError = ref<string | null>(null)
const createSuccess = ref<string | null>(null)

// Subject to change: Support will provide definitive criteria.
// Keep this minimal and easy to adjust.
const ticketForm = ref<CreateTicketRequest>({
  subject: '',
  description: '',
  category: 'General',
  priority: 'Normal',
})

const canCreate = computed(() => {
  return ticketForm.value.subject.trim().length >= 3 && ticketForm.value.description.trim().length >= 10 && !creating.value
})

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
    const data = await listTickets()
    tickets.value = data.tickets
    warning.value = data.warning ?? null
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
        <RouterLink
          to="/app/tickets/org"
          class="ui-btn-secondary"
        >
          Org tickets
        </RouterLink>

        <button
          type="button"
          class="ui-btn-primary"
          @click="showNewTicket = !showNewTicket"
        >
          <svg class="h-3.5 w-3.5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path clip-rule="evenodd" fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
          </svg>
          New ticket
        </button>

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

        <div v-if="showNewTicket" class="border-t border-white/10 p-4">
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div class="md:col-span-2">
              <h3 class="text-base font-semibold text-white">Create a new support ticket</h3>
              <p class="mt-1 text-sm text-white/60">Fields are provisional and will be updated once Support confirms criteria.</p>
            </div>

            <div class="md:col-span-2">
              <label class="ui-label">Subject</label>
              <input
                v-model="ticketForm.subject"
                type="text"
                class="mt-1 ui-input"
                placeholder="e.g. Cannot access invoices"
              >
            </div>

            <div class="md:col-span-2">
              <label class="ui-label">Description</label>
              <textarea
                v-model="ticketForm.description"
                rows="4"
                class="mt-1 ui-input"
                placeholder="Include what you were doing, what you expected, and what happened instead."
              />
            </div>

            <div>
              <label class="ui-label">Category</label>
              <select
                v-model="ticketForm.category"
                class="mt-1 ui-input"
              >
                <option value="General">General</option>
                <option value="Access">Access</option>
                <option value="Events">Events</option>
                <option value="Billing">Billing</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label class="ui-label">Priority</label>
              <select
                v-model="ticketForm.priority"
                class="mt-1 ui-input"
              >
                <option value="Low">Low</option>
                <option value="Normal">Normal</option>
                <option value="High">High</option>
              </select>
            </div>

            <div v-if="createError" class="md:col-span-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {{ createError }}
            </div>

            <div v-if="createSuccess" class="md:col-span-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              {{ createSuccess }}
            </div>

            <div class="md:col-span-2 flex items-center justify-end gap-2">
              <button
                type="button"
                class="ui-btn-secondary"
                :disabled="creating"
                @click="showNewTicket = false"
              >
                Cancel
              </button>
              <button
                type="button"
                class="ui-btn-primary"
                :disabled="!canCreate"
                @click="submitTicket"
              >
                <span v-if="creating">Creating…</span>
                <span v-else>Create ticket</span>
              </button>
            </div>
          </div>
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
