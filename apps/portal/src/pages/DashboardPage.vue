<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { listInvoices, listMeetings, type InvoiceDto, type MeetingDto } from '../lib/api'
import PipelineStageTracker from '../components/PipelineStageTracker.vue'
import { useFeatureFlags } from '../lib/featureFlags'
import { provisionFilterLabel, readProvisionFilter, type ProvisionFilter } from '../lib/provision'
import { getUserAccessToken, decodeJwtPayload } from '../lib/auth'

const provision = ref<ProvisionFilter>(readProvisionFilter())
const provisionLabel = computed(() => provisionFilterLabel(provision.value))

const invoices = ref<InvoiceDto[]>([])
const invoicesLoaded = ref(false)
const meetings = ref<MeetingDto[]>([])
const meetingsLoaded = ref(false)
const { featureFlags, loadFeatureFlags } = useFeatureFlags()

const userName = computed(() => {
  const token = getUserAccessToken()
  if (!token) return ''
  const payload = decodeJwtPayload(token)
  const email = payload?.email as string | undefined
  if (!email) return ''
  // Extract first name from email (e.g., liam.kotecha@example.com -> Liam)
  const namePart = email.split('@')[0]
  const firstName = namePart.split('.')[0] || namePart.split('_')[0] || namePart
  return firstName.charAt(0).toUpperCase() + firstName.slice(1)
})

const isMentorChampion = computed(() => {
  const token = getUserAccessToken()
  if (!token) return false
  const payload = decodeJwtPayload(token)
  const buyingRole = payload?.buyingRole as string | undefined | null
  if (!buyingRole) return false
  return buyingRole.trim().toLowerCase() === 'champion'
})

const overdueInvoices = computed(() => invoices.value.filter((i) => i.status === 'Overdue'))
const outstandingInvoices = computed(() => invoices.value.filter((i) => i.status !== 'Paid'))

const mostUrgentInvoice = computed(() => {
  const overdue = overdueInvoices.value
  if (overdue.length) return overdue[0]
  const outstanding = outstandingInvoices.value
  return outstanding.length ? outstanding[0] : null
})

const parseMeetingDate = (label: string) => {
  const match = label.match(/\b(\d{1,2})\s+([A-Za-z]{3})\b/)
  if (!match) return null
  const day = Number(match[1])
  const monthName = match[2].toLowerCase()
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

const parseMeetingTime = (label: string) => {
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

const meetingTitle = (meeting: MeetingDto) => {
  const host = meeting.hostName
  if (host) return `Meeting with ${host}`
  return `${meeting.team} meeting`
}

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
] as const

const activeLifecycleStage = ref<(typeof lifecycleStages)[number]['id']>('training')

onMounted(async () => {
  await loadFeatureFlags()
  if (!featureFlags.value.invoicesEnabled) {
    invoices.value = []
    invoicesLoaded.value = true
    return
  }
  try {
    const data = await listInvoices()
    invoices.value = data.invoices
  } catch {
    invoices.value = []
  } finally {
    invoicesLoaded.value = true
  }

  if (!featureFlags.value.meetingsEnabled) {
    meetings.value = []
    meetingsLoaded.value = true
    return
  }
  try {
    const data = await listMeetings()
    meetings.value = data.meetings
  } catch {
    meetings.value = []
  } finally {
    meetingsLoaded.value = true
  }
})
</script>

<template>
  <div class="space-y-6">
    <!-- Hero Welcome Section -->
    <div class="bg-[#14192d] rounded-lg p-6 sm:p-8 border border-white/10">
      <div class="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 class="text-2xl sm:text-3xl font-bold text-white mb-2">
            Welcome back<template v-if="userName">, {{ userName }}</template>
          </h1>
          <p class="text-gray-400 text-base mb-6">
            Here’s a quick summary of today’s priorities for {{ provisionLabel }}
          </p>

          <!-- Quick Actions -->
          <div class="flex flex-wrap gap-3">
        <RouterLink to="/app/knowledge-base" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white font-medium transition-colors border border-white/10">
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          Knowledge Base
        </RouterLink>
        <RouterLink to="/app/videos" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white font-medium transition-colors border border-white/10">
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Training Videos
        </RouterLink>
        <RouterLink to="/app/events" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white font-medium transition-colors border border-white/10">
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          View Events
        </RouterLink>
      </div>
        </div>

        <div v-if="isMentorChampion" class="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white">
          <div class="flex h-12 w-12 items-center justify-center rounded-full bg-pink-500/10">
            <svg class="h-6 w-6 text-pink-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M8.5 12.5L6 20l4-2 2 2 2-2 4 2-2.5-7.5" />
            </svg>
          </div>
          <div class="min-w-0">
            <div class="text-sm font-semibold">Mentor Champion</div>
            <div class="text-xs text-white/60">Recognised as your organisation’s Champion</div>
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

    <!-- Stats Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Tickets -->
      <div v-if="featureFlags.ticketsEnabled" class="bg-[#14192d] rounded-lg p-5 border border-white/10">
        <div class="flex items-center justify-between mb-3">
          <div class="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <svg class="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
        </div>
        <div class="text-3xl font-bold text-white mb-1">2</div>
        <div class="text-sm text-gray-400 mb-3">Active Support Tickets</div>
        <RouterLink to="/app/tickets" class="inline-flex items-center text-sm font-medium text-primary-400 hover:text-primary-300">
          View tickets
          <svg class="ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </RouterLink>
      </div>

      <!-- Invoices -->
      <div v-if="featureFlags.invoicesEnabled" class="bg-[#14192d] rounded-lg p-5 border border-white/10">
        <div class="flex items-center justify-between mb-3">
          <div class="h-10 w-10 rounded-lg flex items-center justify-center" :class="overdueInvoices.length ? 'bg-rose-500/10' : 'bg-amber-500/10'">
            <svg class="h-5 w-5" :class="overdueInvoices.length ? 'text-rose-400' : 'text-amber-400'" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
        </div>
        <div class="text-3xl font-bold mb-1" :class="overdueInvoices.length ? 'text-rose-300' : 'text-white'">
          <span v-if="!invoicesLoaded" class="inline-block h-9 w-16 rounded bg-white/10 animate-pulse"></span>
          <span v-else>{{ outstandingInvoices.length }}</span>
        </div>
        <div class="text-sm text-gray-400 mb-3">{{ overdueInvoices.length ? 'Overdue' : 'Outstanding' }} Invoices</div>
        <RouterLink to="/app/invoices" class="inline-flex items-center text-sm font-medium text-primary-400 hover:text-primary-300">
          View invoices
          <svg class="ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </RouterLink>
      </div>

      <!-- Events -->
      <div class="bg-[#14192d] rounded-lg p-5 border border-white/10">
        <div class="flex items-center justify-between mb-3">
          <div class="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <svg class="h-5 w-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        </div>
        <div class="text-3xl font-bold text-white mb-1">2</div>
        <div class="text-sm text-gray-400 mb-3">Upcoming Webinars</div>
        <RouterLink to="/app/events" class="inline-flex items-center text-sm font-medium text-primary-400 hover:text-primary-300">
          Browse events
          <svg class="ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </RouterLink>
      </div>

      <!-- Meetings -->
      <div class="bg-[#14192d] rounded-lg p-5 border border-white/10">
        <div class="flex items-center justify-between mb-3">
          <div class="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
            <svg class="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
        </div>
        <div class="text-3xl font-bold text-white mb-1">{{ meetingsLoaded ? meetingsCount : '—' }}</div>
        <div class="text-sm text-gray-400 mb-3">Scheduled Meetings</div>
        <RouterLink to="/app/meetings" class="inline-flex items-center text-sm font-medium text-primary-400 hover:text-primary-300">
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

    <!-- Main Content Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left Column - Priority Items -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Action Required Section -->
        <div v-if="featureFlags.ticketsEnabled || (featureFlags.invoicesEnabled && mostUrgentInvoice)" class="bg-[#14192d] rounded-lg p-6 border border-white/10">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-semibold text-white">Requires Your Attention</h2>
            <RouterLink v-if="featureFlags.ticketsEnabled" to="/app/tickets" class="text-sm font-medium text-primary-400 hover:text-primary-300">
              View all
            </RouterLink>
          </div>
          
          <div class="space-y-3">
            <!-- Ticket Item -->
            <div v-if="featureFlags.ticketsEnabled" class="flex items-center gap-4 p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors group">
              <div class="shrink-0">
                <div class="h-10 w-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <svg class="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold text-white">Support ticket awaiting response</p>
                <p class="text-sm text-gray-400 mt-0.5">TKT-104 · Customer requested an update on their query</p>
              </div>
              <RouterLink to="/app/tickets" class="px-3 py-1.5 rounded-lg bg-white/5 text-white text-sm font-medium hover:bg-white/10 transition-colors">
                Reply
              </RouterLink>
            </div>

            <!-- Invoice Item -->
            <div v-if="featureFlags.invoicesEnabled && mostUrgentInvoice" class="flex items-center gap-4 p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors group">
              <div class="shrink-0">
                <div class="h-10 w-10 rounded-lg flex items-center justify-center" :class="mostUrgentInvoice.status === 'Overdue' ? 'bg-rose-500/20' : 'bg-amber-500/20'">
                  <svg class="h-5 w-5" :class="mostUrgentInvoice.status === 'Overdue' ? 'text-rose-400' : 'text-amber-400'" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold text-white">
                  {{ mostUrgentInvoice.status === 'Overdue' ? 'Invoice overdue - payment required' : 'Invoice payment outstanding' }}
                </p>
                <p class="text-sm text-gray-400 mt-0.5">{{ mostUrgentInvoice.number }} · {{ mostUrgentInvoice.status }}</p>
              </div>
              <RouterLink to="/app/invoices" class="px-3 py-1.5 rounded-lg bg-white/5 text-white text-sm font-medium hover:bg-white/10 transition-colors">
                View
              </RouterLink>
            </div>
          </div>
        </div>

        <!-- Upcoming Webinars & Training -->
        <div class="bg-[#14192d] rounded-lg p-6 border border-white/10">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-semibold text-white">Your Upcoming Training</h2>
            <RouterLink to="/app/events" class="text-sm font-medium text-primary-400 hover:text-primary-300">
              View all
            </RouterLink>
          </div>
          
          <div class="space-y-3">
            <div class="flex items-center gap-4 p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors group">
              <div class="shrink-0">
                <div class="h-10 w-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                  <svg class="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold text-white">Getting Started with V3</p>
                <p class="text-sm text-gray-400 mt-0.5">Thursday 18 Jan at 12:00 · Microsoft Teams</p>
              </div>
              <RouterLink to="/app/events/1" class="px-3 py-1.5 rounded-lg bg-white/5 text-white text-sm font-medium hover:bg-white/10 transition-colors">
                Details
              </RouterLink>
            </div>

            <div class="flex items-center gap-4 p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors group">
              <div class="shrink-0">
                <div class="h-10 w-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                  <svg class="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold text-white">Reporting Essentials</p>
                <p class="text-sm text-gray-400 mt-0.5">Monday 29 Jan at 10:00 · Riverside</p>
              </div>
              <RouterLink to="/app/events/2" class="px-3 py-1.5 rounded-lg bg-white/5 text-white text-sm font-medium hover:bg-white/10 transition-colors">
                Details
              </RouterLink>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column - Secondary Items -->
      <div class="space-y-6">
        <!-- Scheduled Meetings -->
        <div class="bg-[#14192d] rounded-lg p-6 border border-white/10">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-semibold text-white">Your Meetings</h2>
            <RouterLink to="/app/meetings" class="text-sm font-medium text-primary-400 hover:text-primary-300">
              View all
            </RouterLink>
          </div>
          
          <div class="space-y-3">
            <RouterLink
              v-if="nextMeeting"
              to="/app/meetings"
              class="block p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
            >
              <div class="flex items-center gap-3">
                <div class="shrink-0">
                  <div class="h-10 w-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                    <svg class="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-semibold text-white">{{ meetingTitle(nextMeeting) }}</p>
                  <p class="text-sm text-gray-400 mt-0.5">{{ nextMeeting.dateTimeLabel }}</p>
                </div>
                <div class="shrink-0 text-primary-400">
                  <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </RouterLink>
            <div v-else class="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/60">
              No meetings scheduled yet.
            </div>
          </div>
        </div>

        <!-- Latest Resources -->
        <div class="bg-[#14192d] rounded-lg p-6 border border-white/10">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-semibold text-white">Latest Resources</h2>
            <RouterLink to="/app/knowledge-base" class="text-sm font-medium text-primary-400 hover:text-primary-300">
              View all
            </RouterLink>
          </div>
          
          <div class="space-y-3">
            <RouterLink to="/app/knowledge-base" class="block p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
              <div class="flex items-start gap-3">
                <div class="shrink-0 mt-0.5">
                  <svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-white">Monthly Reporting Checklist</p>
                  <p class="text-xs text-gray-400 mt-0.5">New guide added</p>
                </div>
              </div>
            </RouterLink>

            <RouterLink to="/app/videos" class="block p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
              <div class="flex items-start gap-3">
                <div class="shrink-0 mt-0.5">
                  <svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-white">Evidence Upload Walkthrough</p>
                  <p class="text-xs text-gray-400 mt-0.5">5 min tutorial</p>
                </div>
              </div>
            </RouterLink>

            <RouterLink to="/app/documents" class="block p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
              <div class="flex items-start gap-3">
                <div class="shrink-0 mt-0.5">
                  <svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-white">Care Plan Template v2</p>
                  <p class="text-xs text-gray-400 mt-0.5">Updated document</p>
                </div>
              </div>
            </RouterLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
