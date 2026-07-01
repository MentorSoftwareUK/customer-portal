<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { authMe, listEvents, listMyEventRegistrations, type Audience, type EventDto, type Provision, type EventRegistrationDto } from '../lib/api'
import EventTypeChip from '../components/EventTypeChip.vue'
import PageHeader from '../components/PageHeader.vue'

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

const expandedLunchAndLearns = ref<string[]>([])

const lunchAndLearnEvents = computed(() => {
  if (!viewerType.value) return []
  const now = Date.now()
  return events.value
    .filter((e) => {
      const type = (e.type ?? '').toLowerCase()
      return (
        type === 'lunch & learn' &&
        (e.eligibility === 'both' || e.eligibility === viewerType.value) &&
        (e.status ?? 'upcoming') !== 'cancelled' &&
        !e.completed &&
        Number.isFinite(new Date(e.startAt).getTime()) &&
        new Date(e.startAt).getTime() >= now
      )
    })
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
})

function toggleLunchAndLearn(id: string) {
  const idx = expandedLunchAndLearns.value.indexOf(id)
  if (idx !== -1) expandedLunchAndLearns.value.splice(idx, 1)
  else expandedLunchAndLearns.value.push(id)
}

function formatLunchAndLearnRow(e: EventDto) {
  const start = new Date(e.startAt)
  const end = new Date(start.getTime() + e.durationMins * 60000)
  const date = start.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const startTime = start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  const endTime = end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${date} ${startTime}-${endTime}`
}

function googleCalendarUrl(e: EventDto) {
  const start = new Date(e.startAt)
  const end = new Date(start.getTime() + e.durationMins * 60000)
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: e.description ?? '',
    location: e.joinUrl ?? '',
  })
  return `https://calendar.google.com/calendar/render?${params}`
}

function downloadIcs(e: EventDto) {
  const start = new Date(e.startAt)
  const end = new Date(start.getTime() + e.durationMins * 60000)
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mentor Software//Customer Portal//EN',
    'BEGIN:VEVENT',
    `UID:${e.id}@mentorsoftware.co.uk`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${e.title}`,
    ...(e.description ? [`DESCRIPTION:${e.description.replace(/\n/g, '\\n')}`] : []),
    ...(e.joinUrl ? [`URL:${e.joinUrl}`, `LOCATION:${e.joinUrl}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${e.title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')}.ics`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="space-y-6">
      <div v-if="loadError" class="rounded-lg border border-rose-500/20 bg-rose-50 p-4 text-sm text-rose-600">
        {{ loadError }}
      </div>

      <div v-else-if="loading" role="status" class="rounded-lg border border-gray-200 bg-white p-4 animate-pulse">
        <div class="space-y-3">
          <div class="h-3 w-32 rounded-full bg-gray-100" />
          <div class="h-2.5 w-80 rounded-full bg-gray-100" />
          <div class="h-2.5 w-64 rounded-full bg-gray-100" />
        </div>
        <span class="sr-only">Loading...</span>
      </div>

      <PageHeader title="Training &amp; Events" subtitle="Upcoming sessions, webinars, and recordings for your team.">
        <template #actions>
          <div class="w-full lg:w-72">
            <label for="event-search" class="sr-only">Search events</label>
            <div class="relative">
              <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <svg aria-hidden="true" class="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
                </svg>
              </div>
              <input
                id="event-search"
                v-model="query"
                type="text"
                class="bg-white border border-gray-200 text-gray-900 text-sm rounded focus:ring-primary-500 focus:border-primary-500 block w-full pl-9 p-2 placeholder:text-gray-400"
                placeholder="Search events"
              >
            </div>
          </div>
        </template>
      </PageHeader>

      <div>
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-base font-semibold tracking-tight text-black">Next up</h3>
        </div>

        <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div
            v-for="e in nextThree"
            :key="e.id"
            class="w-full p-6 rounded-lg bg-white border border-gray-200"
          >
            <div class="flex items-center justify-between">
              <EventTypeChip :type="e.type" />
              <span class="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                {{ provisionChipLabel(e) }}
              </span>
            </div>

            <div class="mt-5">
              <h4 class="text-xl font-semibold tracking-tight leading-snug text-gray-900">{{ displayEventTitle(e) }}</h4>
              <p class="mt-3 text-sm text-gray-500">{{ e.description && e.description.length > 180 ? e.description.slice(0, 180) + '\u2026' : e.description }}</p>
            </div>

            <div class="mt-6 flex items-center justify-between gap-3">
              <div class="flex items-center gap-3 min-w-0">
                <div class="h-9 w-9 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                  <span class="text-xs font-semibold text-gray-900">{{ initialsFromName(e.hostName || 'Mentor') }}</span>
                </div>
                <div class="min-w-0">
                  <div class="text-sm font-medium text-gray-900 truncate">{{ e.hostName || 'Mentor' }}</div>
                  <div class="text-xs text-gray-500 truncate">{{ e.hostTitle || 'Host' }}</div>
                </div>
              </div>

              <div class="text-right">
                <div class="text-sm font-medium text-gray-900">{{ e.dateLabel }}</div>
                <div class="text-sm text-gray-500">{{ formatDuration(e.durationMins) }} · {{ e.commentsCount }} comments</div>
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
                class="w-full mt-2 inline-flex items-center justify-center rounded px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 hover:bg-gray-100 focus:outline-none focus:ring-4 focus:ring-gray-200"
              >
                Details
              </RouterLink>
            </div>
          </div>
        </div>

        <div v-if="nextThree.length === 0" class="bg-white border border-gray-200 rounded-lg p-6">
          <div class="text-sm text-gray-600">No upcoming events are available for your account.</div>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div class="order-2 lg:col-span-2 bg-white border border-gray-200 rounded-lg shadow-sm">
          <div class="flex items-center justify-between border-b border-gray-100 p-4">
            <div>
              <h3 class="text-base font-semibold tracking-tight text-black">Further ahead</h3>
              <p class="mt-1 text-sm text-gray-500">Plan upcoming sessions beyond the next three.</p>
            </div>
          </div>
          <div class="flow-root px-4 pb-4 pt-2">
            <ul role="list" class="divide-y divide-gray-200">
              <li v-for="e in furtherAhead" :key="e.id" class="py-4">
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
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
                    <div class="mt-1 text-sm font-medium text-gray-900 truncate">
                      {{ displayEventTitle(e) }}
                    </div>
                    <div class="mt-1 text-sm text-gray-500 truncate">
                      {{ e.dateLabel }} · {{ provisionLabel(e.provision) }} · {{ eligibilityLabel(e.eligibility) }}
                    </div>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <RouterLink
                      :to="`/app/events/${e.id}`"
                      class="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-gray-900 bg-gray-50 border border-gray-200 hover:bg-gray-100 focus:outline-none focus:ring-4 focus:ring-gray-200"
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
              <li v-if="furtherAhead.length === 0" class="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <div class="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100">
                  <svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p class="text-sm font-medium text-gray-700">Nothing further ahead</p>
                <p class="text-sm text-gray-500">No additional sessions match your search.</p>
              </li>
            </ul>
          </div>
        </div>

        <div class="order-1 bg-white border border-gray-200 rounded-lg shadow-sm">
          <div class="flex items-center justify-between border-b border-gray-100 p-4">
            <div>
              <h3 class="text-base font-semibold tracking-tight text-black">Your registrations</h3>
              <p class="mt-1 text-sm text-gray-500">Events you’re already registered for.</p>
            </div>
          </div>
          <div class="flow-root px-4 pb-4 pt-2">
            <ul role="list" class="divide-y divide-gray-200">
              <li v-for="e in pendingPaymentEvents" :key="`pending_${e.id}`" class="py-4">
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="inline-flex items-center rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-medium text-amber-600">
                        Payment pending
                      </span>
                    </div>
                    <div class="mt-1 text-sm font-medium text-gray-900 truncate">{{ displayEventTitle(e) }}</div>
                    <div class="mt-1 text-sm text-gray-500 truncate">{{ e.dateLabel }}</div>
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
                  class="block p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
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
                      <p class="text-sm font-semibold text-gray-900 truncate">{{ displayEventTitle(e) }}</p>
                      <p class="text-sm text-gray-500 mt-0.5 truncate">{{ e.dateLabel }}</p>
                    </div>
                    <div class="shrink-0 text-primary-600">
                      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </RouterLink>
              </li>
              <li v-if="registeredEvents.length === 0 && pendingPaymentEvents.length === 0" class="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <div class="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100">
                  <svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p class="text-sm font-medium text-gray-700">No registrations yet</p>
                <p class="text-sm text-gray-500">Register for a session and it’ll appear here.</p>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Lunch & Learns -->
      <div v-if="lunchAndLearnEvents.length > 0" class="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div class="flex items-center justify-between border-b border-gray-100 p-4">
          <div>
            <h3 class="text-base font-semibold tracking-tight text-black">Upcoming Lunch &amp; Learns</h3>
            <p class="mt-1 text-sm text-gray-500">Training sessions hosted by Shaun — open to your team.</p>
          </div>
          <span class="text-xs text-gray-400 tabular-nums">{{ lunchAndLearnEvents.length }} sessions</span>
        </div>
        <div class="divide-y divide-gray-100">
          <div v-for="e in lunchAndLearnEvents" :key="e.id">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-gray-50"
              @click="toggleLunchAndLearn(e.id)"
            >
              <span class="text-sm font-medium text-gray-900">{{ formatLunchAndLearnRow(e) }} | {{ displayEventTitle(e) }}</span>
              <svg
                class="h-4 w-4 shrink-0 text-primary-600 transition-transform duration-150"
                :class="{ 'rotate-180': expandedLunchAndLearns.includes(e.id) }"
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div v-if="expandedLunchAndLearns.includes(e.id)" class="px-4 pb-4 pt-2 space-y-3 bg-gray-50 border-t border-gray-100">
              <p v-if="e.description" class="text-sm text-gray-600">{{ e.description }}</p>
              <div class="flex flex-wrap gap-2">
                <a
                  v-if="e.joinUrl"
                  :href="e.joinUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition"
                  @click.stop
                >
                  Join on Teams
                </a>
                <a
                  :href="googleCalendarUrl(e)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition"
                  @click.stop
                >
                  + Google Calendar
                </a>
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition"
                  @click.stop="downloadIcs(e)"
                >
                  + Download .ics
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
  </div>
</template>
