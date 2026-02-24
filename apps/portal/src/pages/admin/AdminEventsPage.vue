<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { adminCreateEvent, adminListEvents, type EventDto } from '../../lib/api'

const events = ref<EventDto[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const openMenuId = ref<string | null>(null)
const actionsOpen = ref(false)
const filterOpen = ref(false)

const router = useRouter()

const statusFilter = ref<'all' | 'upcoming' | 'completed' | 'cancelled' | 'draft' | 'published'>('all')

const filteredEvents = computed(() => {
  if (statusFilter.value === 'all') return events.value
  return events.value.filter((event) => (event.status ?? 'upcoming') === statusFilter.value)
})

const total = computed(() => filteredEvents.value.length)

function formatPrice(value: number | null) {
  if (value == null) return '—'
  return `£${value}`
}

function formatAudience(event: EventDto) {
  if (event.eligibility === 'both') return 'Both'
  if (event.eligibility === 'customer') return 'Customer'
  return 'Non-customer'
}

function statusBadge(status?: string) {
  const value = (status ?? 'upcoming').toLowerCase()
  if (value === 'completed') return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
  if (value === 'cancelled') return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200'
  if (value === 'draft') return 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
  if (value === 'published') return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
  return 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200'
}

onMounted(async () => {
  loading.value = true
  loadError.value = null
  try {
    events.value = await adminListEvents()
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load events'
  } finally {
    loading.value = false
  }
})

function toggleMenu(id: string) {
  openMenuId.value = openMenuId.value === id ? null : id
}

function closeMenu() {
  openMenuId.value = null
  actionsOpen.value = false
  filterOpen.value = false
}

function goToEvent(id: string) {
  router.push(`/admin/events/${id}`)
}

// Create event modal
const createModalOpen = ref(false)
const createLoading = ref(false)
const createError = ref<string | null>(null)
const createForm = ref({
  title: '',
  type: 'Webinar' as EventDto['type'],
  startAt: '',
  durationMins: 60,
  platform: 'TBD' as 'Teams' | 'Riverside' | 'TBD',
  eligibility: 'customer' as 'customer' | 'non-customer' | 'both',
  provision: 'all' as 'childrens-home' | 'supported-accommodation' | 'over-18' | 'all',
  description: '',
  hostName: '',
  hostTitle: '',
  joinUrl: '',
})

function openCreateModal() {
  createForm.value = { title: '', type: 'Webinar', startAt: '', durationMins: 60, platform: 'TBD', eligibility: 'customer', provision: 'all', description: '', hostName: '', hostTitle: '', joinUrl: '' }
  createError.value = null
  createModalOpen.value = true
}

async function submitCreate() {
  createError.value = null
  createLoading.value = true
  try {
    const event = await adminCreateEvent({
      title: createForm.value.title,
      type: createForm.value.type,
      startAt: createForm.value.startAt,
      durationMins: createForm.value.durationMins,
      platform: createForm.value.platform,
      eligibility: createForm.value.eligibility,
      provision: createForm.value.provision,
      description: createForm.value.description || undefined,
      hostName: createForm.value.hostName || undefined,
      hostTitle: createForm.value.hostTitle || undefined,
      joinUrl: createForm.value.joinUrl || undefined,
    })
    events.value = [event, ...events.value]
    createModalOpen.value = false
  } catch (e) {
    createError.value = e instanceof Error ? e.message : 'Failed to create event'
  } finally {
    createLoading.value = false
  }
}
</script>

<template>
  <div class="space-y-6" @click="closeMenu">
      <div class="ui-surface relative shadow-md sm:rounded-lg overflow-hidden">
        <div class="flex flex-col md:flex-row items-center justify-between space-y-3 md:space-y-0 md:space-x-4 p-4">
          <div class="w-full md:w-1/2">
            <form class="flex items-center">
              <label for="simple-search" class="sr-only">Search</label>
              <div class="relative w-full">
                <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <svg aria-hidden="true" class="w-5 h-5 text-gray-500 dark:text-gray-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                    <path
                      fill-rule="evenodd"
                      d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                      clip-rule="evenodd"
                    />
                  </svg>
                </div>
                <input
                  type="text"
                  id="simple-search"
                  class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block w-full pl-10 p-2 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-primary-500 dark:focus:border-primary-500"
                  placeholder="Search"
                >
              </div>
            </form>
          </div>

          <div class="w-full md:w-auto flex flex-col md:flex-row space-y-2 md:space-y-0 items-stretch md:items-center justify-end md:space-x-3 flex-shrink-0">
            <button type="button" class="ui-btn-primary" @click.stop="openCreateModal">
              <svg class="h-3.5 w-3.5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path
                  clip-rule="evenodd"
                  fill-rule="evenodd"
                  d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                />
              </svg>
              Create event
            </button>

            <div class="flex items-center space-x-3 w-full md:w-auto">
              <div class="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70">
                <button
                  type="button"
                  class="rounded px-2 py-1"
                  :class="statusFilter === 'all' ? 'bg-white/15 text-white' : 'hover:bg-white/10'"
                  @click="statusFilter = 'all'"
                >
                  All
                </button>
                <button
                  type="button"
                  class="rounded px-2 py-1"
                  :class="statusFilter === 'upcoming' ? 'bg-white/15 text-white' : 'hover:bg-white/10'"
                  @click="statusFilter = 'upcoming'"
                >
                  Upcoming
                </button>
                <button
                  type="button"
                  class="rounded px-2 py-1"
                  :class="statusFilter === 'completed' ? 'bg-white/15 text-white' : 'hover:bg-white/10'"
                  @click="statusFilter = 'completed'"
                >
                  Completed
                </button>
                <button
                  type="button"
                  class="rounded px-2 py-1"
                  :class="statusFilter === 'cancelled' ? 'bg-white/15 text-white' : 'hover:bg-white/10'"
                  @click="statusFilter = 'cancelled'"
                >
                  Cancelled
                </button>
              </div>
              <div class="relative">
                <button
                  class="ui-btn-secondary w-full md:w-auto"
                  type="button"
                  @click.stop="actionsOpen = !actionsOpen; filterOpen = false"
                >
                  <svg class="-ml-1 mr-1.5 w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path
                      clip-rule="evenodd"
                      fill-rule="evenodd"
                      d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    />
                  </svg>
                  Actions
                </button>
                <div v-if="actionsOpen" class="absolute right-0 top-full mt-1 z-50 w-44 rounded-lg border border-white/10 bg-[#1a2035] shadow-xl" @click.stop>
                  <ul class="py-1 text-sm text-white/80">
                    <li>
                      <button type="button" class="block w-full text-left py-2 px-4 hover:bg-white/10">Mass Edit</button>
                    </li>
                  </ul>
                  <div class="border-t border-white/10 py-1">
                    <button type="button" class="block w-full text-left py-2 px-4 text-sm text-white/80 hover:bg-white/10">Delete all</button>
                  </div>
                </div>
              </div>

              <div class="relative">
                <button
                  class="ui-btn-secondary w-full md:w-auto"
                  type="button"
                  @click.stop="filterOpen = !filterOpen; actionsOpen = false"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" class="h-4 w-4 mr-2 text-white/60" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fill-rule="evenodd"
                      d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 008 17v-5.586L3.293 6.707A1 1 0 013 6V3z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  Filter
                  <svg class="-mr-1 ml-1.5 w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path
                      clip-rule="evenodd"
                      fill-rule="evenodd"
                      d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    />
                  </svg>
                </button>
                <div v-if="filterOpen" class="absolute right-0 top-full mt-1 z-50 w-52 rounded-lg border border-white/10 bg-[#1a2035] p-3 shadow-xl" @click.stop>
                  <h6 class="mb-3 text-sm font-medium text-white">Filter by status</h6>
                  <ul class="space-y-1 text-sm">
                    <li v-for="opt in ['all','upcoming','completed','cancelled','draft','published']" :key="opt">
                      <button
                        type="button"
                        class="w-full text-left rounded-lg px-3 py-2 capitalize transition"
                        :class="statusFilter === opt ? 'bg-primary-600/30 text-white font-medium' : 'text-white/70 hover:bg-white/10'"
                        @click="statusFilter = opt as typeof statusFilter; filterOpen = false"
                      >
                        {{ opt }}
                      </button>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="ui-table">
            <thead>
              <tr>
                <th scope="col" class="px-4 py-3">Title</th>
                <th scope="col" class="px-4 py-3">Date</th>
                <th scope="col" class="px-4 py-3">Type</th>
                <th scope="col" class="px-4 py-3">Audience</th>
                <th scope="col" class="px-4 py-3">Price (non-customer)</th>
                <th scope="col" class="px-4 py-3">Status</th>
                <th scope="col" class="px-4 py-3">Registered</th>
                <th scope="col" class="px-4 py-3">Attendees</th>
                <th scope="col" class="px-4 py-3">Did not attend</th>
                <th scope="col" class="px-4 py-3"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading" class="border-b dark:border-gray-700">
                <td colspan="10" class="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">Loading events…</td>
              </tr>
              <tr v-else-if="loadError" class="border-b dark:border-gray-700">
                <td colspan="10" class="px-4 py-4 text-sm text-red-500">{{ loadError }}</td>
              </tr>
              <tr v-else-if="filteredEvents.length === 0" class="border-b dark:border-gray-700">
                <td colspan="10" class="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">No events found.</td>
              </tr>
              <tr
                v-else
                v-for="event in filteredEvents"
                :key="event.id"
                class="border-b dark:border-gray-700 cursor-pointer hover:bg-white/5"
                @click="goToEvent(event.id)"
              >
                <th scope="row" class="px-4 py-3 font-medium text-gray-900 whitespace-nowrap dark:text-white">
                  {{ event.title }}
                </th>
                <td class="px-4 py-3">{{ event.dateLabel }}</td>
                <td class="px-4 py-3">{{ event.type }}</td>
                <td class="px-4 py-3">{{ formatAudience(event) }}</td>
                <td class="px-4 py-3">{{ formatPrice(event.priceForNonCustomers) }}</td>
                <td class="px-4 py-3">
                  <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold" :class="statusBadge(event.status)">
                    {{ event.status ?? 'upcoming' }}
                  </span>
                </td>
                <td class="px-4 py-3">{{ event.registeredCount ?? 0 }}</td>
                <td class="px-4 py-3">{{ event.attendeesCount ?? 0 }}</td>
                <td class="px-4 py-3">{{ event.noShowCount ?? 0 }}</td>
                <td class="px-4 py-3">
                  <div class="relative flex items-center justify-end">
                    <button
                      :id="`admin-event-${event.id}-dropdown-button`"
                      class="inline-flex items-center p-0.5 text-sm font-medium text-center text-gray-500 hover:text-gray-800 rounded-lg focus:outline-none dark:text-gray-400 dark:hover:text-gray-100"
                      type="button"
                      @click.stop="toggleMenu(event.id)"
                    >
                      <svg class="w-5 h-5" aria-hidden="true" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                        <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
                      </svg>
                    </button>
                    <div
                      v-if="openMenuId === event.id"
                      :id="`admin-event-${event.id}-dropdown`"
                      class="absolute right-0 top-full mt-1 z-50 w-44 rounded-lg border border-white/10 bg-[#1a2035] shadow-xl"
                      @click.stop
                    >
                      <ul class="py-1 text-sm text-white/80">
                        <li>
                          <button
                            type="button"
                            class="block w-full text-left py-2 px-4 hover:bg-white/10"
                            @click="goToEvent(event.id); closeMenu()"
                          >
                            View details
                          </button>
                        </li>
                        <li>
                          <button
                            type="button"
                            class="block w-full text-left py-2 px-4 hover:bg-white/10"
                            @click="goToEvent(event.id); closeMenu()"
                          >
                            Edit details
                          </button>
                        </li>
                      </ul>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <nav class="flex flex-col md:flex-row justify-between items-start md:items-center space-y-3 md:space-y-0 p-4" aria-label="Table navigation">
          <span class="text-sm font-normal text-gray-500 dark:text-gray-400">
            Showing
            <span class="font-semibold text-gray-900 dark:text-white">{{ total === 0 ? 0 : 1 }}</span>
            -
            <span class="font-semibold text-gray-900 dark:text-white">{{ total }}</span>
            of
            <span class="font-semibold text-gray-900 dark:text-white">{{ total }}</span>
          </span>
        </nav>
      </div>
  </div>

  <!-- Create Event Modal -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="createModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="createModalOpen = false">
        <div class="absolute inset-0 bg-black/60" />
        <div class="relative w-full max-w-lg bg-[#1a2035] rounded-xl shadow-2xl border border-white/10 overflow-y-auto max-h-[90vh]">
          <div class="flex items-center justify-between p-5 border-b border-white/10">
            <h3 class="text-lg font-semibold text-white">Create event</h3>
            <button type="button" class="text-white/50 hover:text-white" @click="createModalOpen = false">✕</button>
          </div>

          <form class="p-5 space-y-4" @submit.prevent="submitCreate">
            <div>
              <label class="block text-sm font-medium text-white/80 mb-1">Title *</label>
              <input v-model="createForm.title" type="text" required class="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="e.g. Summer Webinar" />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-white/80 mb-1">Type *</label>
                <select v-model="createForm.type" required class="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                  <option value="Webinar">Webinar</option>
                  <option value="Lunch &amp; Learn">Lunch &amp; Learn</option>
                  <option value="Podcast">Podcast</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-white/80 mb-1">Platform *</label>
                <select v-model="createForm.platform" required class="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                  <option value="TBD">TBD</option>
                  <option value="Teams">Teams</option>
                  <option value="Riverside">Riverside</option>
                </select>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-white/80 mb-1">Date &amp; time *</label>
                <input v-model="createForm.startAt" type="datetime-local" required class="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label class="block text-sm font-medium text-white/80 mb-1">Duration (mins)</label>
                <input v-model.number="createForm.durationMins" type="number" min="15" step="15" class="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-white/80 mb-1">Audience</label>
                <select v-model="createForm.eligibility" class="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                  <option value="customer">Customers only</option>
                  <option value="non-customer">Non-customers</option>
                  <option value="both">Both</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-white/80 mb-1">Provision</label>
                <select v-model="createForm.provision" class="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                  <option value="all">All</option>
                  <option value="childrens-home">Children's homes</option>
                  <option value="supported-accommodation">Supported accommodation</option>
                  <option value="over-18">18+</option>
                </select>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-white/80 mb-1">Host name</label>
                <input v-model="createForm.hostName" type="text" class="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="e.g. Jane Smith" />
              </div>
              <div>
                <label class="block text-sm font-medium text-white/80 mb-1">Host title</label>
                <input v-model="createForm.hostTitle" type="text" class="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="e.g. Head of Training" />
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-white/80 mb-1">Join URL</label>
              <input v-model="createForm.joinUrl" type="url" class="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="https://teams.microsoft.com/..." />
            </div>

            <div>
              <label class="block text-sm font-medium text-white/80 mb-1">Description</label>
              <textarea v-model="createForm.description" rows="3" class="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="Optional event description" />
            </div>

            <div v-if="createError" class="rounded-lg bg-rose-500/10 border border-rose-400/30 p-3 text-sm text-rose-200">
              {{ createError }}
            </div>

            <div class="flex justify-end gap-3 pt-2">
              <button type="button" class="ui-btn-secondary" @click="createModalOpen = false">Cancel</button>
              <button type="submit" class="ui-btn-primary" :disabled="createLoading">{{ createLoading ? 'Creating…' : 'Create event' }}</button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
