<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { listMeetings, type MeetingDto, type MeetingTeam } from '../lib/api'

const meetings = ref<MeetingDto[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const warning = ref<string | null>(null)
const query = ref('')
const teamFilter = ref<'all' | MeetingTeam>('all')
const view = ref<'month' | 'week' | 'day' | 'list'>('month')
const calendarCursor = ref(new Date())
const showNewMeetingModal = ref(false)
const newMeetingStep = ref<'pick-host' | 'calendar'>('pick-host')
const selectedHost = ref<'simone' | 'shaun' | 'hope' | null>(null)
const showMeetingDetails = ref(false)
const selectedMeeting = ref<MeetingDto | null>(null)

const HOSTS = [
  {
    key: 'simone' as const,
    name: 'Simone Mills',
    team: 'Customer Success',
    accent: 'bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-500/30',
    hasPublicCalendar: true,
    calendarSlug: 'simone-mills',
    calendarRegion: 'eu1',
  },
  {
    key: 'shaun' as const,
    name: 'Shaun Ward',
    team: 'Training',
    accent: 'bg-amber-500/20 text-amber-600 border-amber-500/30',
    hasPublicCalendar: false,
    calendarSlug: null,
    calendarRegion: 'eu1',
  },
  {
    key: 'hope' as const,
    name: 'Hope Schindler',
    team: 'Renewals',
    accent: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/30',
    hasPublicCalendar: false,
    calendarSlug: null,
    calendarRegion: 'eu1',
  },
]

const selectedHostDetails = computed(() => HOSTS.find((h) => h.key === selectedHost.value) ?? null)

function openNewMeeting() {
  newMeetingStep.value = 'pick-host'
  selectedHost.value = null
  showNewMeetingModal.value = true
}

function pickHost(key: 'simone' | 'shaun' | 'hope') {
  selectedHost.value = key
  newMeetingStep.value = 'calendar'
}

function closeNewMeeting() {
  showNewMeetingModal.value = false
  selectedHost.value = null
  newMeetingStep.value = 'pick-host'
}

const meetingHostName = (meeting: MeetingDto) => {
  if (meeting.hostName) return meeting.hostName
  if (meeting.team === 'Training') return 'Shaun Ward'
  if (meeting.team === 'Success Team') return 'Simone Mills'
  return 'Hope Schindler'
}

const meetingTitle = (meeting: MeetingDto) => {
  const t = meeting.title?.trim()
  if (t) return t
  return `Meeting with ${meetingHostName(meeting)}`
}

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

const meetingTimeLabel = (meeting: MeetingDto) => {
  const parts = meeting.dateTimeLabel.split('·')
  return parts[1]?.trim() ?? ''
}

const filteredMeetings = computed(() => {
  const term = query.value.trim().toLowerCase()
  return meetings.value.filter((meeting) => {
    const host = meetingHostName(meeting).toLowerCase()
    const team = meeting.team.toLowerCase()
    const matchesQuery = !term || host.includes(term) || team.includes(term)
    const matchesTeam = teamFilter.value === 'all' || meeting.team === teamFilter.value
    return matchesQuery && matchesTeam
  })
})

const monthLabel = computed(() => {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(calendarCursor.value)
})

const weekDayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)

const startOfCalendar = (date: Date) => {
  const first = startOfMonth(date)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay())
  start.setHours(0, 0, 0, 0)
  return start
}

const calendarDays = computed(() => {
  const start = startOfCalendar(calendarCursor.value)
  const days = [] as Array<{
    date: Date
    isCurrentMonth: boolean
    isToday: boolean
    meetings: MeetingDto[]
  }>

  const meetingsByDay = new Map<number, MeetingDto[]>()
  filteredMeetings.value.forEach((meeting) => {
    const date = meetingDateTime(meeting)
    if (!date) return
    const key = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
    const list = meetingsByDay.get(key) ?? []
    list.push(meeting)
    meetingsByDay.set(key, list)
  })

  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    const key = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    days.push({
      date,
      isCurrentMonth: date.getMonth() === calendarCursor.value.getMonth(),
      isToday: key === today.getTime(),
      meetings: meetingsByDay.get(key) ?? [],
    })
  }

  return days
})

const startOfWeek = (date: Date) => {
  const start = new Date(date)
  start.setDate(date.getDate() - date.getDay())
  start.setHours(0, 0, 0, 0)
  return start
}

const endOfWeek = (date: Date) => {
  const end = startOfWeek(date)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return end
}

const meetingsSorted = computed(() => {
  return [...filteredMeetings.value]
    .map((meeting) => ({ meeting, date: meetingDateTime(meeting) }))
    .filter((item) => item.date)
    .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0))
})

const meetingsForWeek = computed(() => {
  const start = startOfWeek(calendarCursor.value)
  const end = endOfWeek(calendarCursor.value)
  return meetingsSorted.value.filter((item) => item.date && item.date >= start && item.date <= end)
})

const meetingsForDay = computed(() => {
  const dayStart = new Date(calendarCursor.value)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(calendarCursor.value)
  dayEnd.setHours(23, 59, 59, 999)
  return meetingsSorted.value.filter((item) => item.date && item.date >= dayStart && item.date <= dayEnd)
})

const meetingsForList = computed(() => meetingsSorted.value)

const formatWeekRange = computed(() => {
  const start = startOfWeek(calendarCursor.value)
  const end = endOfWeek(calendarCursor.value)
  const startLabel = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(start)
  const endLabel = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(end)
  return `${startLabel} - ${endLabel}`
})

const formatDayLabel = computed(() => {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: '2-digit', month: 'long' }).format(calendarCursor.value)
})

const teamAccent = (team: MeetingTeam) => {
  if (team === 'Training') return 'bg-amber-500/20 text-amber-600 border-amber-500/30'
  if (team === 'Success Team') return 'bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-500/30'
  return 'bg-cyan-500/20 text-cyan-200 border-cyan-500/30'
}

const goToToday = () => {
  calendarCursor.value = new Date()
}

const goToPrevious = () => {
  const current = calendarCursor.value
  calendarCursor.value = new Date(current.getFullYear(), current.getMonth() - 1, 1)
}

const goToNext = () => {
  const current = calendarCursor.value
  calendarCursor.value = new Date(current.getFullYear(), current.getMonth() + 1, 1)
}

const openMeetingDetails = (meeting: MeetingDto) => {
  selectedMeeting.value = meeting
  showMeetingDetails.value = true
}

const closeMeetingDetails = () => {
  showMeetingDetails.value = false
  selectedMeeting.value = null
}

async function refreshMeetings() {
  loading.value = true
  error.value = null
  warning.value = null
  try {
    const data = await listMeetings()
    meetings.value = data.meetings
    warning.value = data.warning ?? null
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load meetings'
  } finally {
    loading.value = false
  }
}

onMounted(refreshMeetings)
</script>

<template>
  <div class="flex min-h-screen flex-col gap-2 bg-page pt-20">
    <div class="bg-white border-b border-gray-200">
      <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div class="flex items-center gap-2 text-gray-900">
          <div class="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50">
            <button
              type="button"
              class="h-8 w-8 text-gray-500 hover:text-gray-900"
              @click="goToPrevious"
              aria-label="Previous month"
            >
              <svg class="mx-auto h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M12.707 14.707a1 1 0 01-1.414 0L6.586 10l4.707-4.707a1 1 0 011.414 1.414L9.414 10l3.293 3.293a1 1 0 010 1.414z" clip-rule="evenodd" />
              </svg>
            </button>
            <button
              type="button"
              class="h-8 w-8 text-gray-500 hover:text-gray-900"
              @click="goToNext"
              aria-label="Next month"
            >
              <svg class="mx-auto h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M7.293 5.293a1 1 0 011.414 0L13.414 10l-4.707 4.707a1 1 0 01-1.414-1.414L10.586 10 7.293 6.707a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </button>
          </div>
          <div class="text-lg font-semibold">{{ monthLabel }}</div>
          <button
            type="button"
            class="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-100"
            @click="goToToday"
          >
            today
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <div class="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs">
            <button
              type="button"
              class="rounded-md px-2.5 py-1 font-semibold"
              :class="view === 'month' ? 'bg-gray-100 text-white' : 'text-gray-500 hover:text-gray-900'"
              @click="view = 'month'"
            >
              month
            </button>
            <button
              type="button"
              class="rounded-md px-2.5 py-1 font-semibold"
              :class="view === 'week' ? 'bg-gray-100 text-white' : 'text-gray-500 hover:text-gray-900'"
              @click="view = 'week'"
            >
              week
            </button>
            <button
              type="button"
              class="rounded-md px-2.5 py-1 font-semibold"
              :class="view === 'day' ? 'bg-gray-100 text-white' : 'text-gray-500 hover:text-gray-900'"
              @click="view = 'day'"
            >
              day
            </button>
            <button
              type="button"
              class="rounded-md px-2.5 py-1 font-semibold"
              :class="view === 'list' ? 'bg-gray-100 text-white' : 'text-gray-500 hover:text-gray-900'"
              @click="view = 'list'"
            >
              list
            </button>
          </div>

          <div class="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs">
            <button
              type="button"
              class="rounded-md px-2.5 py-1 font-semibold"
              :class="teamFilter === 'all' ? 'bg-gray-100 text-white' : 'text-gray-500 hover:text-gray-900'"
              @click="teamFilter = 'all'"
            >
              all teams
            </button>
            <button
              type="button"
              class="rounded-md px-2.5 py-1 font-semibold"
              :class="teamFilter === 'Training' ? 'bg-gray-100 text-white' : 'text-gray-500 hover:text-gray-900'"
              @click="teamFilter = 'Training'"
            >
              training
            </button>
            <button
              type="button"
              class="rounded-md px-2.5 py-1 font-semibold"
              :class="teamFilter === 'Success Team' ? 'bg-gray-100 text-white' : 'text-gray-500 hover:text-gray-900'"
              @click="teamFilter = 'Success Team'"
            >
              success
            </button>
            <button
              type="button"
              class="rounded-md px-2.5 py-1 font-semibold"
              :class="teamFilter === 'Renewals' ? 'bg-gray-100 text-white' : 'text-gray-500 hover:text-gray-900'"
              @click="teamFilter = 'Renewals'"
            >
              renewals
            </button>
          </div>

          <button
            type="button"
            class="inline-flex items-center rounded-lg bg-primary-500 px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-primary-400"
            @click="openNewMeeting()"
          >
            + New meeting
          </button>
          <button
            type="button"
            class="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-100"
            :disabled="loading"
            @click="refreshMeetings"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>

    <div v-if="error" class="rounded-lg border border-rose-500/20 bg-rose-50 p-4 text-sm text-rose-600">
      {{ error }}
    </div>

    <div v-else-if="warning" class="rounded-lg border border-amber-500/20 bg-amber-50 p-4 text-sm text-amber-600">
      {{ warning }}
    </div>

    <div class="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-3 text-xs text-cyan-100">
      Meeting availability and booking windows are managed in HubSpot calendars. Update availability in HubSpot, then refresh this page to sync the latest slots.
    </div>

    <div class="flex-1">
      <div class="bg-white h-full flex flex-col">
        <div class="grid grid-cols-7 border-b border-gray-200 bg-gray-50 px-4">
          <div
            v-for="day in weekDayLabels"
            :key="day"
            class="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500"
          >
            {{ day }}
          </div>
        </div>

        <div v-if="loading" class="flex-1 p-6">
          <div class="grid grid-cols-7 gap-3">
            <div v-for="i in 14" :key="i" class="h-24 rounded-lg bg-gray-50 animate-pulse" />
          </div>
        </div>

        <div v-else-if="view === 'week'" class="flex-1 p-6">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="text-sm font-semibold text-gray-900">Week of {{ formatWeekRange }}</div>
            <div class="text-xs text-gray-400">{{ meetingsForWeek.length }} meetings</div>
          </div>
          <div class="mt-4 space-y-2">
            <button
              v-for="item in meetingsForWeek"
              :key="item.meeting.id"
              type="button"
              class="flex w-full items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-left transition hover:border-gray-300 hover:bg-gray-100"
              @click="openMeetingDetails(item.meeting)"
            >
              <div class="min-w-0">
                <div class="text-sm font-semibold text-gray-900">{{ meetingTitle(item.meeting) }}</div>
                <div class="text-xs text-gray-400">{{ item.meeting.dateTimeLabel }}</div>
              </div>
              <div class="text-right">
                <div class="text-xs text-gray-500">{{ meetingHostName(item.meeting) }}</div>
                <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold" :class="teamAccent(item.meeting.team)">
                  {{ item.meeting.team }}
                </span>
              </div>
            </button>
            <div v-if="meetingsForWeek.length === 0" class="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
              No meetings scheduled this week.
            </div>
          </div>
        </div>

        <div v-else-if="view === 'day'" class="flex-1 p-6">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="text-sm font-semibold text-gray-900">{{ formatDayLabel }}</div>
            <div class="text-xs text-gray-400">{{ meetingsForDay.length }} meetings</div>
          </div>
          <div class="mt-4 space-y-2">
            <button
              v-for="item in meetingsForDay"
              :key="item.meeting.id"
              type="button"
              class="flex w-full items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-left transition hover:border-gray-300 hover:bg-gray-100"
              @click="openMeetingDetails(item.meeting)"
            >
              <div class="min-w-0">
                <div class="text-sm font-semibold text-gray-900">{{ meetingTitle(item.meeting) }}</div>
                <div class="text-xs text-gray-400">{{ item.meeting.dateTimeLabel }}</div>
              </div>
              <div class="text-right">
                <div class="text-xs text-gray-500">{{ meetingHostName(item.meeting) }}</div>
                <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold" :class="teamAccent(item.meeting.team)">
                  {{ item.meeting.team }}
                </span>
              </div>
            </button>
            <div v-if="meetingsForDay.length === 0" class="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
              No meetings scheduled for this day.
            </div>
          </div>
        </div>

        <div v-else-if="view === 'list'" class="flex-1 p-6">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="text-sm font-semibold text-gray-900">All meetings</div>
            <div class="text-xs text-gray-400">{{ meetingsForList.length }} meetings</div>
          </div>
          <div class="mt-4 space-y-2">
            <button
              v-for="item in meetingsForList"
              :key="item.meeting.id"
              type="button"
              class="flex w-full items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-left transition hover:border-gray-300 hover:bg-gray-100"
              @click="openMeetingDetails(item.meeting)"
            >
              <div class="min-w-0">
                <div class="text-sm font-semibold text-gray-900">{{ meetingTitle(item.meeting) }}</div>
                <div class="text-xs text-gray-400">{{ item.meeting.dateTimeLabel }}</div>
              </div>
              <div class="text-right">
                <div class="text-xs text-gray-500">{{ meetingHostName(item.meeting) }}</div>
                <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold" :class="teamAccent(item.meeting.team)">
                  {{ item.meeting.team }}
                </span>
              </div>
            </button>
            <div v-if="meetingsForList.length === 0" class="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
              No meetings scheduled yet.
            </div>
          </div>
        </div>

        <div v-else class="grid flex-1 grid-cols-7 divide-x divide-y divide-white/5 px-4">
          <div
            v-for="day in calendarDays"
            :key="day.date.toISOString()"
            class="min-h-[120px] bg-white p-2"
            :class="day.isCurrentMonth ? 'text-white' : 'text-gray-300 bg-[#0b1024]'"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold">
                {{ day.date.getDate() }}
              </span>
              <span
                v-if="day.isToday"
                class="rounded-full bg-primary-500/20 px-2 py-0.5 text-[10px] font-semibold text-primary-200"
              >
                Today
              </span>
            </div>

            <div class="mt-2 space-y-1">
              <button
                v-for="meeting in day.meetings.slice(0, 3)"
                :key="meeting.id"
                type="button"
                class="flex w-full items-center gap-1 rounded-md border px-2 py-1 text-left text-[11px] font-semibold transition hover:border-gray-300 hover:bg-gray-100"
                :class="teamAccent(meeting.team)"
                @click="openMeetingDetails(meeting)"
              >
                <span class="truncate">{{ meetingTimeLabel(meeting) || 'All day' }}</span>
                <span class="text-gray-500">·</span>
                <span class="truncate">{{ meetingHostName(meeting) }}</span>
              </button>
              <div v-if="day.meetings.length > 3" class="text-[11px] text-gray-400">
                +{{ day.meetings.length - 3 }} more
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- New meeting modal -->
  <div v-if="showNewMeetingModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="closeNewMeeting">
    <!-- Step 1: pick a host -->
    <div v-if="newMeetingStep === 'pick-host'" class="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-xl">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="text-lg font-semibold tracking-tight text-black">Schedule a meeting</h2>
          <p class="mt-1 text-sm text-gray-500">Who would you like to meet with?</p>
        </div>
        <button type="button" class="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-900" @click="closeNewMeeting" aria-label="Close">
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div class="mt-5 space-y-3">
        <button
          v-for="host in HOSTS"
          :key="host.key"
          type="button"
          class="flex w-full items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-4 text-left transition hover:border-gray-300 hover:bg-gray-100"
          @click="pickHost(host.key)"
        >
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-900">
            {{ host.name.charAt(0) }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-semibold text-gray-900">{{ host.name }}</div>
            <div class="mt-0.5 flex items-center gap-2">
              <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold" :class="host.accent">{{ host.team }}</span>
              <span v-if="host.hasPublicCalendar" class="text-xs text-green-400">Book online</span>
              <span v-else class="text-xs text-gray-400">Invite only</span>
            </div>
          </div>
          <svg class="h-5 w-5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
    </div>

    <!-- Step 2: calendar embed or invite-only message -->
    <div v-else-if="newMeetingStep === 'calendar' && selectedHostDetails" class="w-full rounded-lg border border-gray-200 bg-white shadow-xl" :class="selectedHostDetails.hasPublicCalendar ? 'max-w-3xl' : 'max-w-md'">
      <div class="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div class="flex items-center gap-3">
          <button type="button" class="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-900" @click="newMeetingStep = 'pick-host'" aria-label="Back">
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div>
            <div class="text-sm font-semibold text-gray-900">{{ selectedHostDetails.name }}</div>
            <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold" :class="selectedHostDetails.accent">{{ selectedHostDetails.team }}</span>
          </div>
        </div>
        <button type="button" class="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-900" @click="closeNewMeeting" aria-label="Close">
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <!-- HubSpot calendar embed (Simone) -->
      <div v-if="selectedHostDetails.hasPublicCalendar && selectedHostDetails.calendarSlug" class="p-0">
        <iframe
          :src="`https://meetings-${selectedHostDetails.calendarRegion}.hubspot.com/${selectedHostDetails.calendarSlug}?embed=true`"
          class="h-[600px] w-full rounded-b-2xl border-0"
          title="Schedule a meeting"
        />
      </div>

      <!-- Invite-only message -->
      <div v-else class="px-6 py-8">
        <div class="flex flex-col items-center gap-4 text-center">
          <div class="flex h-14 w-14 items-center justify-center rounded-full bg-gray-50">
            <svg class="h-7 w-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <div class="text-sm font-semibold text-gray-900">
              <template v-if="selectedHost === 'shaun'">Training sessions are invite only</template>
              <template v-else>Calendar coming soon</template>
            </div>
            <p class="mt-2 text-sm text-gray-500 max-w-xs mx-auto">
              <template v-if="selectedHost === 'shaun'">
                Shaun's training sessions are scheduled as part of your onboarding. You can view and join your upcoming sessions from the calendar.
              </template>
              <template v-else>
                Hope's calendar isn't available for self-booking yet. Get in touch and we'll arrange a time for you.
              </template>
            </p>
          </div>
          <button
            type="button"
            class="mt-2 rounded-lg bg-[#e7007e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#c9006d] transition-colors"
            @click="closeNewMeeting"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  </div>

  <div v-if="showMeetingDetails && selectedMeeting" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div class="w-full max-w-lg rounded-lg border border-gray-200 bg-white p-6 shadow-xl">
      <div class="flex items-start justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold" :class="teamAccent(selectedMeeting.team)">
              {{ selectedMeeting.team }}
            </span>
          </div>
          <h2 class="mt-3 text-xl font-semibold tracking-tight text-black">{{ meetingTitle(selectedMeeting) }}</h2>
          <p class="mt-1 text-sm text-gray-500">{{ selectedMeeting.dateTimeLabel }}</p>
        </div>
        <button
          type="button"
          class="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
          @click="closeMeetingDetails"
        >
          Close
        </button>
      </div>

      <div class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-400">Host</div>
          <div class="mt-2 text-sm font-semibold text-gray-900">{{ meetingHostName(selectedMeeting) }}</div>
          <div class="text-xs text-gray-400">{{ selectedMeeting.team }}</div>
        </div>
        <div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-400">When</div>
          <div class="mt-2 text-sm font-semibold text-gray-900">{{ selectedMeeting.dateTimeLabel }}</div>
          <div class="text-xs text-gray-400">UK time</div>
        </div>
      </div>

      <div class="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
        Use the join link to access the session. If the link is missing, it will appear here before the meeting or be sent by email.
      </div>

      <div class="mt-5 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-gray-100"
          @click="closeMeetingDetails"
        >
          Done
        </button>
        <a
          v-if="selectedMeeting.joinUrl"
          :href="selectedMeeting.joinUrl"
          target="_blank"
          rel="noreferrer"
          class="rounded-lg bg-primary-500 px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-primary-400"
        >
          Join meeting
        </a>
        <button
          v-else
          type="button"
          class="cursor-not-allowed rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-400"
          disabled
        >
          Join link pending
        </button>
      </div>
    </div>
  </div>
</template>
