<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { authMe, listEvents, listMyEventRegistrations, type Audience, type EventDto, type Provision, type EventRegistrationDto } from '../lib/api'
import EventTypeChip from '../components/EventTypeChip.vue'

const query = ref('')

type EventListItem = EventDto & { registrationStatus: EventRegistrationDto['status'] | null }

const events = ref<EventDto[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const viewerType = ref<'customer' | 'non-customer' | null>(null)

const registrationsByEventId = ref<Map<string, EventRegistrationDto['status']>>(new Map())

const filtered = computed(() => {
  if (!viewerType.value) return []
  return events.value.filter((e) => {
    const matchesQuery = !query.value.trim() || e.title.toLowerCase().includes(query.value.toLowerCase())
    const eligible = e.eligibility === 'both' || e.eligibility === viewerType.value
    return matchesQuery && eligible
  })
})

const upcomingSorted = computed(() => {
  const now = Date.now()
  return [...filtered.value]
    .filter((e) => {
      if (e.completed) return false
      if ((e.status ?? 'upcoming') === 'cancelled') return false
      const start = new Date(e.startAt).getTime()
      return Number.isFinite(start) && start >= now
    })
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
})

const nextThree = computed<EventListItem[]>(() => {
  return upcomingSorted.value
    .slice(0, 3)
    .map((e) => ({ ...e, registrationStatus: registrationsByEventId.value.get(e.id) ?? null }))
})

const furtherAhead = computed<EventListItem[]>(() => {
  return upcomingSorted.value
    .slice(3)
    .map((e) => ({ ...e, registrationStatus: registrationsByEventId.value.get(e.id) ?? null }))
})
const registeredEvents = computed(() => {
  if (!viewerType.value) return []
  return [...events.value]
    .filter((e) => {
      const status = registrationsByEventId.value.get(e.id)
      return status === 'registered' || status === 'paid'
    })
    .filter((e) => e.eligibility === 'both' || e.eligibility === viewerType.value)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    .map((e) => ({ ...e, registrationStatus: registrationsByEventId.value.get(e.id) ?? null }))
})

const pendingPaymentEvents = computed(() => {
  if (!viewerType.value) return []
  return [...events.value]
    .filter((e) => registrationsByEventId.value.get(e.id) === 'payment_pending')
    .filter((e) => e.eligibility === 'both' || e.eligibility === viewerType.value)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    .map((e) => ({ ...e, registrationStatus: 'payment_pending' as const }))
})

const eligibilityLabel = (audience: Audience) => {
  if (audience === 'customer') return 'Customers only'
  if (audience === 'non-customer') return 'Non-customers'
  return 'Customers & non-customers'
}

const provisionLabel = (provision: Provision) => {
  if (provision === 'childrens-home') return 'Children’s home'
  if (provision === 'supported-accommodation') return 'Supported accommodation'
  if (provision === 'over-18') return '18+ provision'
  return 'All provision types'
}

const provisionChipLabel = (e: EventDto) => {
  if (e.provision === 'supported-accommodation') return 'Supported accom.'
  if (e.provision === 'childrens-home') return 'Children’s homes'
  if (e.provision === 'all') return 'All provision'
  return e.provisionLabel || provisionLabel(e.provision)
}

const initialsFromName = (name: string) => {
  const cleaned = name.trim().replace(/\s+/g, ' ')
  if (!cleaned) return '?'
  const parts = cleaned.split(' ')
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : ''
  const two = `${first}${last}`.trim()
  return two ? two.toUpperCase() : (first || '?').toUpperCase()
}

const displayEventTitle = (e: EventDto) => {
  const title = e.title.trim()
  const prefixFromType = `${e.type}:`
  if (title.toLowerCase().startsWith(prefixFromType.toLowerCase())) {
    return title.slice(prefixFromType.length).trim()
  }

  const m = title.match(/^(Webinar|Lunch\s*&\s*Learn|Podcast|Other):\s*/i)
  if (m) return title.slice(m[0].length).trim()

  return title
}

const formatDuration = (mins: number) => {
  if (mins < 60) return `${mins} min`
  const hours = Math.floor(mins / 60)
  const remainder = mins % 60
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}

onMounted(async () => {
  loading.value = true
  loadError.value = null
  try {
    const [me, ev, regs] = await Promise.all([authMe(), listEvents(), listMyEventRegistrations()])
    viewerType.value = me.user.viewerType
    events.value = ev
    registrationsByEventId.value = new Map(regs.map((r) => [r.eventId, r.status]))
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load events'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="space-y-6">
      <div v-if="loadError" class="rounded-lg border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
        {{ loadError }}
      </div>

      <div v-else-if="loading" role="status" class="rounded-lg border border-white/10 bg-[#14192d] p-4 animate-pulse">
        <div class="space-y-3">
          <div class="h-3 w-32 rounded-full bg-white/10" />
          <div class="h-2.5 w-80 rounded-full bg-white/10" />
          <div class="h-2.5 w-64 rounded-full bg-white/10" />
        </div>
        <span class="sr-only">Loading...</span>
      </div>

      <div class="bg-[#14192d] rounded-lg p-6 sm:p-8 border border-white/10">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 class="text-2xl sm:text-3xl font-bold text-white">Training & Events</h2>
            <p class="mt-2 text-base text-gray-400">Find upcoming sessions, webinars, and recordings that support your team.</p>
          </div>

          <div class="w-full lg:w-96">
            <label for="event-search" class="sr-only">Search events</label>
            <div class="relative">
              <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <svg aria-hidden="true" class="w-5 h-5 text-white/60" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                  <path
                    fill-rule="evenodd"
                    d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                    clip-rule="evenodd"
                  />
                </svg>
              </div>
              <input
                id="event-search"
                v-model="query"
                type="text"
                class="bg-white/5 border border-white/10 text-white text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block w-full pl-10 p-2.5 placeholder:text-white/40"
                placeholder="Search events"
              >
            </div>
          </div>
        </div>
      </div>

      <div>
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-base font-semibold text-white">Next up</h3>
        </div>

        <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div
            v-for="e in nextThree"
            :key="e.id"
            class="w-full p-6 rounded-lg bg-[#14192d] border border-white/10"
          >
            <div class="flex items-center justify-between">
              <EventTypeChip :type="e.type" />
              <span class="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium text-white/80">
                {{ provisionChipLabel(e) }}
              </span>
            </div>

            <div class="mt-5">
              <h4 class="text-xl font-semibold leading-snug text-white">{{ displayEventTitle(e) }}</h4>
              <p class="mt-3 text-sm text-white/70">{{ e.description && e.description.length > 180 ? e.description.slice(0, 180) + '\u2026' : e.description }}</p>
            </div>

            <div class="mt-6 flex items-center justify-between gap-3">
              <div class="flex items-center gap-3 min-w-0">
                <div class="h-9 w-9 rounded-full bg-white/10 border border-white/10 flex items-center justify-center shrink-0">
                  <span class="text-xs font-semibold text-white">{{ initialsFromName(e.hostName || 'Mentor') }}</span>
                </div>
                <div class="min-w-0">
                  <div class="text-sm font-medium text-white truncate">{{ e.hostName || 'Mentor' }}</div>
                  <div class="text-xs text-white/60 truncate">{{ e.hostTitle || 'Host' }}</div>
                </div>
              </div>

              <div class="text-right">
                <div class="text-sm font-medium text-white">{{ e.dateLabel }}</div>
                <div class="text-sm text-white/70">{{ formatDuration(e.durationMins) }} · {{ e.commentsCount }} comments</div>
              </div>
            </div>

            <div class="mt-6">
              <RouterLink
                :to="e.registrationStatus === 'registered' || e.registrationStatus === 'paid' ? `/app/events/${e.id}` : `/app/events/${e.id}/register`"
                class="ui-btn-primary w-full"
              >
                {{ e.registrationStatus === 'payment_pending' ? 'Complete payment' : e.registrationStatus === 'registered' || e.registrationStatus === 'paid' ? 'View event' : 'Register' }}
              </RouterLink>
              <RouterLink
                :to="`/app/events/${e.id}`"
                class="w-full mt-2 inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-white bg-white/5 border border-white/10 hover:bg-white/10 focus:outline-none focus:ring-4 focus:ring-white/10"
              >
                Details
              </RouterLink>
            </div>
          </div>
        </div>

        <div v-if="nextThree.length === 0" class="bg-[#14192d] border border-white/10 rounded-lg p-6">
          <div class="text-sm text-white/80">No upcoming events are available for your account.</div>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div class="order-2 lg:col-span-2 bg-[#14192d] border border-white/10 rounded-lg">
          <div class="flex items-center justify-between p-4">
            <div>
              <h3 class="text-base font-semibold text-white">Further ahead</h3>
              <p class="mt-1 text-sm text-white/60">Plan upcoming sessions beyond the next three.</p>
            </div>
          </div>
          <div class="flow-root px-4 pb-4">
            <ul role="list" class="divide-y divide-white/10">
              <li v-for="e in furtherAhead" :key="e.id" class="py-4">
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="inline-flex items-center rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/80">
                        {{ e.type }}
                      </span>
                      <span
                        v-if="e.registrationStatus === 'registered' || e.registrationStatus === 'paid'"
                        class="ui-pill ui-pill-success"
                      >
                        <span class="ui-pill-dot" aria-hidden="true" />
                        Registered
                      </span>
                      <span
                        v-else-if="e.registrationStatus === 'payment_pending'"
                        class="ui-pill ui-pill-warning"
                      >
                        <span class="ui-pill-dot" aria-hidden="true" />
                        Payment pending
                      </span>
                    </div>
                    <div class="mt-1 text-sm font-medium text-white truncate">
                      {{ displayEventTitle(e) }}
                    </div>
                    <div class="mt-1 text-sm text-white/60 truncate">
                      {{ e.dateLabel }} · {{ provisionLabel(e.provision) }} · {{ eligibilityLabel(e.eligibility) }}
                    </div>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <RouterLink
                      :to="`/app/events/${e.id}`"
                      class="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-white bg-white/5 border border-white/10 hover:bg-white/10 focus:outline-none focus:ring-4 focus:ring-white/10"
                    >
                      Details
                    </RouterLink>
                    <RouterLink
                      :to="
                        e.registrationStatus === 'registered' || e.registrationStatus === 'paid'
                          ? `/app/events/${e.id}`
                          : `/app/events/${e.id}/register`
                      "
                      class="ui-btn-primary"
                    >
                      {{ e.registrationStatus === 'payment_pending' ? 'Complete payment' : e.registrationStatus === 'registered' || e.registrationStatus === 'paid' ? 'View event' : 'Register' }}
                    </RouterLink>
                  </div>
                </div>
              </li>
              <li v-if="furtherAhead.length === 0" class="py-8 text-sm text-white/60">
                Nothing further ahead matches your search.
              </li>
            </ul>
          </div>
        </div>

        <div class="order-1 bg-[#14192d] border border-white/10 rounded-lg">
          <div class="flex items-center justify-between p-4">
            <div>
              <h3 class="text-base font-semibold text-white">Your registrations</h3>
              <p class="mt-1 text-sm text-white/60">Events you’re already registered for.</p>
            </div>
          </div>
          <div class="flow-root px-4 pb-4">
            <ul role="list" class="divide-y divide-white/10">
              <li v-for="e in pendingPaymentEvents" :key="`pending_${e.id}`" class="py-4">
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="inline-flex items-center rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-medium text-amber-300">
                        Payment pending
                      </span>
                    </div>
                    <div class="mt-1 text-sm font-medium text-white truncate">{{ displayEventTitle(e) }}</div>
                    <div class="mt-1 text-sm text-white/60 truncate">{{ e.dateLabel }}</div>
                  </div>
                  <RouterLink
                    :to="`/app/events/${e.id}/register`"
                    class="shrink-0 ui-link"
                  >
                    Complete
                  </RouterLink>
                </div>
              </li>
              <li v-for="e in registeredEvents" :key="e.id" class="py-4">
                <RouterLink
                  :to="`/app/events/${e.id}`"
                  class="block p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <div class="flex items-center gap-3">
                    <div class="shrink-0">
                      <div class="h-10 w-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                        <svg class="h-5 w-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-semibold text-white truncate">{{ displayEventTitle(e) }}</p>
                      <p class="text-sm text-white/60 mt-0.5 truncate">{{ e.dateLabel }}</p>
                    </div>
                    <div class="shrink-0 text-primary-400">
                      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </RouterLink>
              </li>
              <li v-if="registeredEvents.length === 0 && pendingPaymentEvents.length === 0" class="py-8 text-sm text-white/60">
                You haven’t registered for any events yet.
              </li>
            </ul>
          </div>
        </div>
      </div>
  </div>
</template>
