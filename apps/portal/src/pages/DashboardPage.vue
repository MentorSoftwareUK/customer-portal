<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { listInvoices, listMeetings, listEvents, type InvoiceDto, type MeetingDto, type EventDto } from '../lib/api'
import PipelineStageTracker from '../components/PipelineStageTracker.vue'
import HubSpotContactForm from '../components/HubSpotContactForm.vue'
import { useFeatureFlags } from '../lib/featureFlags'
import { provisionFilterLabel, readProvisionFilter, type ProvisionFilter } from '../lib/provision'
import { getUserAccessToken, decodeJwtPayload } from '../lib/auth'

const provision = ref<ProvisionFilter>(readProvisionFilter())
const provisionLabel = computed(() => provisionFilterLabel(provision.value))

const invoices = ref<InvoiceDto[]>([])
const invoicesLoaded = ref(false)
const meetings = ref<MeetingDto[]>([])
const meetingsLoaded = ref(false)
const events = ref<EventDto[]>([])
const eventsLoaded = ref(false)
const { featureFlags, loadFeatureFlags } = useFeatureFlags()

const userName = computed(() => {
  const token = getUserAccessToken()
  if (!token) return ''
  const payload = decodeJwtPayload(token)
  const email = payload?.email as string | undefined
  if (!email) return ''
  // Extract first name from email (e.g., liam.kotecha@example.com -> Liam)
  const namePart = email.split('@')[0] ?? ''
  if (!namePart) return ''
  const firstName = namePart.split('.')[0] || namePart.split('_')[0] || namePart
  if (!firstName) return ''
  return firstName.charAt(0).toUpperCase() + firstName.slice(1)
})

const overdueInvoices = computed(() => invoices.value.filter((i) => i.status === 'Overdue'))
const outstandingInvoices = computed(() => invoices.value.filter((i) => i.status !== 'Paid'))

const mostUrgentInvoice = computed(() => {
  const overdue = overdueInvoices.value
  if (overdue.length) return overdue[0]
  const outstanding = outstandingInvoices.value
  return outstanding.length ? outstanding[0] : null
})

const parseMeetingDate = (label?: string | null) => {
  if (!label) return null
  const match = label.match(/\b(\d{1,2})\s+([A-Za-z]{3})\b/)
  if (!match) return null
  const day = Number(match[1])
  const monthToken = match[2]
  if (!monthToken) return null
  const monthName = monthToken.toLowerCase()
  const months: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  }
  const month = months[monthName]
  if (month === undefined || Number.isNaN(day)) return null
  const now = new Date()
  return new Date(now.getFullYear(), month, day)
}

const parseMeetingTime = (label?: string | null) => {
  if (!label) return null
  const match = label.match(/·\s*(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  return { hours, minutes }
}

const meetingDateTime = (meeting: MeetingDto) => {
  const date = parseMeetingDate(meeting.dateTimeLabel)
  if (!date) return null
  const time = parseMeetingTime(meeting.dateTimeLabel)
  if (time) {
    date.setHours(time.hours, time.minutes, 0, 0)
  } else {
    date.setHours(0, 0, 0, 0)
  }
  return date
}

const upcomingMeetings = computed(() => {
  const now = new Date()
  return meetings.value
    .map((meeting) => ({ meeting, date: meetingDateTime(meeting) }))
    .filter((item) => item.date && item.date >= now)
    .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0))
    .map((item) => item.meeting)
})

const nextMeeting = computed(() => upcomingMeetings.value[0] ?? null)
const meetingsCount = computed(() => upcomingMeetings.value.length)

// Map host first name → meeting type label
const HOST_TEAM_MAP: Record<string, string> = {
  shaun: 'Training',
  simone: 'Customer Success',
  hope: 'Renewals',
}

const meetingTeamLabel = (meeting: MeetingDto): string => {
  const host = meeting.hostName
  if (host) {
    const first = host.split(' ')[0]?.toLowerCase() ?? ''
    return HOST_TEAM_MAP[first] ?? meeting.team
  }
  return meeting.team
}

const meetingTitle = (meeting: MeetingDto) => {
  const host = meeting.hostName
  const label = meetingTeamLabel(meeting)
  if (host) return `${label} — ${host}`
  return `${label} meeting`
}

const upcomingEvents = computed(() => {
  const now = Date.now()
  return events.value
    .filter((e) => {
      if (e.completed) return false
      const status = e.status ?? 'upcoming'
      if (status === 'cancelled' || status === 'completed') return false
      const start = new Date(e.startAt).getTime()
      return Number.isFinite(start) && start >= now
    })
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
})

const upcomingEventsCount = computed(() => upcomingEvents.value.length)

const lifecycleStages = [
  {
    id: 'discovery',
    label: 'Discovery',
    description: 'Discovery completed.',
  },
  {
    id: 'demo',
    label: 'Demo',
    description: 'Demo completed.',
  },
  {
    id: 'contract',
    label: 'Contract',
    description: 'Contract sent.',
  },
  {
    id: 'training',
    label: 'Training',
    description: 'Training underway.',
  },
  {
    id: 'live',
    label: 'Live',
    description: 'Live with success support.',
  },
]

const activeLifecycleStage = ref<'discovery' | 'demo' | 'contract' | 'training' | 'live'>('training')
const lifecycleStageNote = 'Preview mode: this lifecycle step is currently placeholder data until CRM lifecycle sync is enabled.'

// Show the stats grid only when there are enough feature-gated cards to justify the row.
// Events + Meetings alone are not worth the row — they'll reappear when tickets/invoices
// (or other features) are turned back on.
const showStatsGrid = computed(() =>
  featureFlags.value.ticketsEnabled ||
  featureFlags.value.invoicesEnabled
)

// Contact Us modal
const contactModalOpen = ref(false)

function openContactModal() {
  contactModalOpen.value = true
}

function closeContactModal() {
  contactModalOpen.value = false
}

onMounted(async () => {
  await loadFeatureFlags()

  // Load all data sources independently so a disabled feature doesn't
  // prevent the others from loading.
  const loadInvoices = async () => {
    if (!featureFlags.value.invoicesEnabled) { invoicesLoaded.value = true; return }
    try { invoices.value = (await listInvoices()).invoices } catch { invoices.value = [] } finally { invoicesLoaded.value = true }
  }

  const loadMeetings = async () => {
    if (!featureFlags.value.meetingsEnabled) { meetingsLoaded.value = true; return }
    try { meetings.value = (await listMeetings()).meetings } catch { meetings.value = [] } finally { meetingsLoaded.value = true }
  }

  const loadEvents = async () => {
    try { events.value = await listEvents() } catch { events.value = [] } finally { eventsLoaded.value = true }
  }

  await Promise.all([loadInvoices(), loadMeetings(), loadEvents()])
})
</script>

<template>
  <div class="space-y-6">
    <!-- Hero Welcome Section -->
    <div class="bg-white rounded-lg p-6 sm:p-8 border border-gray-200">
      <div class="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 class="text-2xl sm:text-2xl font-semibold tracking-tight text-black mb-2">
            Welcome back<template v-if="userName">, {{ userName }}</template>
          </h1>
          <p class="text-xs text-gray-400 mt-0.5 mb-6">
            {{ provision === 'all' ? "Here's your portal overview." : `Here's today's highlights for ${provisionLabel}.` }}
          </p>

          <!-- Quick Actions -->
          <div class="flex flex-wrap gap-3">
        <RouterLink v-if="featureFlags.knowledgeBaseEnabled" to="/app/knowledge-base" class="inline-flex items-center gap-2 px-4 py-2 rounded bg-gray-100 hover:bg-gray-100 text-gray-900 font-medium transition-colors border border-gray-200">
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          Knowledge Base
        </RouterLink>
        <RouterLink v-if="featureFlags.videosEnabled" to="/app/videos" class="inline-flex items-center gap-2 px-4 py-2 rounded bg-gray-100 hover:bg-gray-100 text-gray-900 font-medium transition-colors border border-gray-200">
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Training Videos
        </RouterLink>
        <button
          type="button"
          class="inline-flex items-center gap-2 px-4 py-2 rounded bg-[#e7007e] hover:bg-[#c9006d] text-white font-medium transition-colors"
          @click="openContactModal"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Contact Us
        </button>
      </div>
        </div>

        <div class="flex items-center gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900">
          <div class="flex h-12 w-12 items-center justify-center rounded-full bg-primary-50">
            <svg class="h-6 w-6 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M8.5 12.5L6 20l4-2 2 2 2-2 4 2-2.5-7.5" />
            </svg>
          </div>
          <div class="min-w-0">
            <div class="text-sm font-semibold">Mentor Champion</div>
            <div class="text-xs text-gray-500">Recognised as your organisation’s Champion</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Urgent Alerts -->
    <div v-if="featureFlags.invoicesEnabled && invoicesLoaded && overdueInvoices.length" class="flex items-start sm:items-center justify-between p-4 text-sm text-red-800 rounded-lg bg-red-50" role="alert">
      <div class="flex items-start sm:items-center">
        <svg class="w-4 h-4 me-2 shrink-0 mt-0.5 sm:mt-0" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
        </svg>
        <p>
          <span class="font-medium me-1">Payment Required!</span>
          You have {{ overdueInvoices.length }} overdue {{ overdueInvoices.length === 1 ? 'invoice' : 'invoices' }} that {{ overdueInvoices.length === 1 ? 'requires' : 'require' }} immediate attention
        </p>
      </div>
      <RouterLink to="/app/invoices" class="shrink-0 inline-flex items-center gap-1 text-sm font-medium hover:underline ml-4">
        Review invoices
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </RouterLink>
    </div>

    <!-- Stats Grid - only shown when enough features are active to fill the row -->
    <div v-if="showStatsGrid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Tickets -->
      <div v-if="featureFlags.ticketsEnabled" class="bg-white rounded-lg p-5 border border-gray-200 shadow-sm">
        <div class="flex items-center justify-between mb-3">
          <div class="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
            <svg class="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
        </div>
        <div class="text-2xl font-semibold tracking-tight text-black mb-1">2</div>
        <div class="text-xs text-gray-500 mb-2">Active Support Tickets</div>
        <RouterLink to="/app/tickets" class="inline-flex items-center text-sm font-medium text-primary-600 hover:text-primary-700">
          View tickets
          <svg class="ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </RouterLink>
      </div>

      <!-- Invoices -->
      <div v-if="featureFlags.invoicesEnabled" class="bg-white rounded-lg p-5 border border-gray-200 shadow-sm">
        <div class="flex items-center justify-between mb-3">
          <div class="h-10 w-10 rounded-lg flex items-center justify-center" :class="overdueInvoices.length ? 'bg-rose-50' : 'bg-amber-50'">
            <svg class="h-5 w-5" :class="overdueInvoices.length ? 'text-rose-600' : 'text-amber-600'" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
        </div>
        <div class="text-2xl font-semibold tracking-tight mb-1" :class="overdueInvoices.length ? 'text-rose-600' : 'text-slate-900'">
          <span v-if="!invoicesLoaded" class="inline-block h-9 w-16 rounded bg-gray-100 animate-pulse"></span>
          <span v-else>{{ outstandingInvoices.length }}</span>
        </div>
        <div class="text-xs text-gray-500 mb-2">{{ overdueInvoices.length ? 'Overdue' : 'Outstanding' }} Invoices</div>
        <RouterLink to="/app/invoices" class="inline-flex items-center text-sm font-medium text-primary-600 hover:text-primary-700">
          View invoices
          <svg class="ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </RouterLink>
      </div>

      <!-- Events -->
      <div class="bg-white rounded-lg p-5 border border-gray-200 shadow-sm">
        <div class="flex items-center justify-between mb-3">
          <div class="h-10 w-10 rounded-lg bg-violet-50 flex items-center justify-center">
            <svg class="h-5 w-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        </div>
        <div class="text-2xl font-semibold tracking-tight text-black mb-1">
          <span v-if="!eventsLoaded" class="inline-block h-9 w-8 rounded bg-gray-100 animate-pulse"></span>
          <span v-else>{{ upcomingEventsCount }}</span>
        </div>
        <div class="text-xs text-gray-500 mb-2">Upcoming Events</div>
        <RouterLink to="/app/events" class="inline-flex items-center text-sm font-medium text-primary-600 hover:text-primary-700">
          Browse events
          <svg class="ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </RouterLink>
      </div>

      <!-- Meetings -->
      <div v-if="featureFlags.meetingsEnabled" class="bg-white rounded-lg p-5 border border-gray-200 shadow-sm">
        <div class="flex items-center justify-between mb-3">
          <div class="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
            <svg class="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
        </div>
        <div class="text-2xl font-semibold tracking-tight text-black mb-1">{{ meetingsLoaded ? meetingsCount : '—' }}</div>
        <div class="text-xs text-gray-500 mb-2">Scheduled Meetings</div>
        <RouterLink to="/app/meetings" class="inline-flex items-center text-sm font-medium text-primary-600 hover:text-primary-700">
          View calendar
          <svg class="ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </RouterLink>
      </div>
    </div>

    <PipelineStageTracker
      :stages="lifecycleStages"
      :active-stage="activeLifecycleStage"
      title="Your onboarding journey"
      subtitle="Track your progress with Mentor"
    />
    <p class="-mt-3 text-xs text-gray-500">{{ lifecycleStageNote }}</p>

    <!-- Main Content Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left Column - Priority Items -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Action Required Section -->
        <div v-if="featureFlags.ticketsEnabled || (featureFlags.invoicesEnabled && mostUrgentInvoice)" class="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-semibold tracking-tight text-black">Requires Your Attention</h2>
            <RouterLink v-if="featureFlags.ticketsEnabled" to="/app/tickets" class="text-xs font-medium text-primary-600 hover:text-primary-700">
              View all
            </RouterLink>
          </div>
          
          <div class="space-y-3">
            <!-- Ticket Item -->
            <div v-if="featureFlags.ticketsEnabled" class="flex items-center gap-4 p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors group">
              <div class="shrink-0">
                <div class="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <svg class="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold text-gray-900">Support ticket awaiting response</p>
                <p class="text-sm text-gray-500 mt-0.5">TKT-104 · Customer requested an update on their query</p>
              </div>
              <RouterLink to="/app/tickets" class="px-3 py-1.5 rounded-lg bg-gray-50 text-gray-900 text-sm font-medium hover:bg-gray-100 transition-colors">
                Reply
              </RouterLink>
            </div>

            <!-- Invoice Item -->
            <div v-if="featureFlags.invoicesEnabled && mostUrgentInvoice" class="flex items-center gap-4 p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors group">
              <div class="shrink-0">
                <div class="h-10 w-10 rounded-lg flex items-center justify-center" :class="mostUrgentInvoice.status === 'Overdue' ? 'bg-rose-50' : 'bg-amber-50'">
                  <svg class="h-5 w-5" :class="mostUrgentInvoice.status === 'Overdue' ? 'text-rose-600' : 'text-amber-600'" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold text-gray-900">
                  {{ mostUrgentInvoice.status === 'Overdue' ? 'Invoice overdue - payment required' : 'Invoice payment outstanding' }}
                </p>
                <p class="text-sm text-gray-500 mt-0.5">{{ mostUrgentInvoice.number }} · {{ mostUrgentInvoice.status }}</p>
              </div>
              <RouterLink to="/app/invoices" class="px-3 py-1.5 rounded-lg bg-gray-50 text-gray-900 text-sm font-medium hover:bg-gray-100 transition-colors">
                View
              </RouterLink>
            </div>
          </div>
        </div>

        <!-- Upcoming Events -->
        <div class="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-semibold tracking-tight text-black">Upcoming Events</h2>
            <RouterLink to="/app/events" class="text-xs font-medium text-primary-600 hover:text-primary-700">
              View all
            </RouterLink>
          </div>

          <!-- Loading skeleton -->
          <div v-if="!eventsLoaded" class="space-y-3">
            <div v-for="i in 2" :key="i" class="h-16 rounded-lg bg-gray-50 animate-pulse"></div>
          </div>

          <div v-else-if="upcomingEvents.length" class="space-y-3">
            <RouterLink
              v-for="event in upcomingEvents.slice(0, 3)"
              :key="event.id"
              :to="`/app/events/${event.id}`"
              class="flex items-center gap-4 p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors group"
            >
              <div class="shrink-0">
                <div class="h-10 w-10 rounded-lg bg-violet-50 flex items-center justify-center">
                  <svg class="h-5 w-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold text-gray-900 truncate">{{ event.title }}</p>
                <p class="text-sm text-gray-500 mt-0.5">{{ event.dateLabel }} · {{ event.platform }}</p>
              </div>
              <span class="shrink-0 text-primary-600">
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </RouterLink>
          </div>

          <div v-else class="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
            No upcoming events scheduled.
          </div>
        </div>
      </div>

      <!-- Right Column - Secondary Items -->
      <div class="space-y-6">
        <!-- Scheduled Meetings -->
        <div v-if="featureFlags.meetingsEnabled" class="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-semibold tracking-tight text-black">Your Meetings</h2>
            <RouterLink to="/app/meetings" class="text-xs font-medium text-primary-600 hover:text-primary-700">
              View all
            </RouterLink>
          </div>
          
          <div class="space-y-3">
            <RouterLink
              v-if="nextMeeting"
              to="/app/meetings"
              class="block p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <div class="flex items-center gap-3">
                <div class="shrink-0">
                  <div class="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <svg class="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-semibold text-gray-900">{{ meetingTitle(nextMeeting) }}</p>
                  <p class="text-sm text-gray-500 mt-0.5">{{ nextMeeting.dateTimeLabel }}</p>
                  <span class="inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{{ meetingTeamLabel(nextMeeting) }}</span>
                </div>
                <div class="shrink-0 text-primary-600">
                  <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </RouterLink>
            <div v-else class="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
              No meetings scheduled yet.
            </div>
          </div>
        </div>

        <!-- Latest Resources (only shown when at least one resource feature is on) -->
        <div v-if="featureFlags.knowledgeBaseEnabled || featureFlags.videosEnabled || featureFlags.documentsEnabled" class="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-semibold tracking-tight text-black">Latest Resources</h2>
            <RouterLink
              :to="featureFlags.knowledgeBaseEnabled ? '/app/knowledge-base' : featureFlags.videosEnabled ? '/app/videos' : '/app/documents'"
              class="text-xs font-medium text-primary-600 hover:text-primary-700"
            >
              View all
            </RouterLink>
          </div>

          <div class="space-y-3">
            <RouterLink v-if="featureFlags.knowledgeBaseEnabled" to="/app/knowledge-base" class="block p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
              <div class="flex items-start gap-3">
                <div class="shrink-0 mt-0.5">
                  <svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-900">Knowledge Base</p>
                  <p class="text-xs text-gray-400 mt-0.5">Guides and how-to articles</p>
                </div>
              </div>
            </RouterLink>

            <RouterLink v-if="featureFlags.videosEnabled" to="/app/videos" class="block p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
              <div class="flex items-start gap-3">
                <div class="shrink-0 mt-0.5">
                  <svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-900">Video Library</p>
                  <p class="text-xs text-gray-400 mt-0.5">Training videos and recordings</p>
                </div>
              </div>
            </RouterLink>

            <RouterLink v-if="featureFlags.documentsEnabled" to="/app/documents" class="block p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
              <div class="flex items-start gap-3">
                <div class="shrink-0 mt-0.5">
                  <svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-900">Document Library</p>
                  <p class="text-xs text-gray-400 mt-0.5">Templates and downloadable files</p>
                </div>
              </div>
            </RouterLink>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Contact Us Modal -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-show="contactModalOpen"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="closeContactModal" />

        <!-- Modal panel -->
        <div class="relative z-10 w-full max-w-lg rounded-xl bg-white border border-gray-200 shadow-2xl overflow-hidden">
          <!-- Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div>
              <h2 class="text-lg font-semibold tracking-tight text-black">Contact Us</h2>
              <p class="text-sm text-gray-500 mt-0.5">We\'ll get back to you as soon as possible.</p>
            </div>
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              aria-label="Close"
              @click="closeContactModal"
            >
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- HubSpot Form -->
          <div class="px-6 py-5 max-h-[70vh] overflow-y-auto">
            <HubSpotContactForm
              portal-id="145032754"
              form-id="2e2ce646-a095-46a9-9cc9-94bfdec91dc2"
              region="eu1"
            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
