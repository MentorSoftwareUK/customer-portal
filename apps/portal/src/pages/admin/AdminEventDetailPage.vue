<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import {
  adminCancelEvent,
  adminGetEvent,
  adminListEventRegistrations,
  adminUpdateRegistration,
  adminUpdateEvent,
  type AdminEventRegistrationDto,
  type EventDto,
} from '../../lib/api'

const route = useRoute()
const eventId = computed(() => String(route.params.id || ''))
const loading = ref(true)
const saving = ref(false)
const cancelling = ref(false)
const loadError = ref<string | null>(null)
const saveError = ref<string | null>(null)
const event = ref<EventDto | null>(null)
const registrations = ref<AdminEventRegistrationDto[]>([])
const registrationsLoading = ref(false)
const attendanceUpdating = ref<Record<string, boolean>>({})

type FormState = {
  title: string
  description: string
  startAt: string
  durationMins: number
  status: string
  completed: boolean
  eligibility: EventDto['eligibility']
  provision: EventDto['provision']
  priceForNonCustomers: string
  hostName: string
  hostTitle: string
  platform: EventDto['platform']
  joinUrl: string
  webinarSlides: string
  webinarRecordingUrl: string
}

const form = ref<FormState>({
  title: '',
  description: '',
  startAt: '',
  durationMins: 60,
  status: 'upcoming',
  completed: false,
  eligibility: 'customer',
  provision: 'all',
  priceForNonCustomers: '',
  hostName: '',
  hostTitle: '',
  platform: 'Teams',
  joinUrl: '',
  webinarSlides: '',
  webinarRecordingUrl: '',
})

function toLocalDateTime(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromLocalDateTime(value: string) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

const emailStats = computed(() => {
  const stats = event.value?.emailStats
  return {
    sent: stats?.sent ?? null,
    delivered: stats?.delivered ?? null,
    bounced: stats?.bounced ?? null,
    ctr: stats?.ctr ?? null,
  }
})

const engagementStats = computed(() => {
  const regs = registrations.value
  const registered = regs.filter((r) => r.status === 'registered' || r.status === 'payment_pending' || r.status === 'paid').length
  const attended = regs.filter((r) => r.attendanceStatus === 'attended').length
  const noShow = regs.filter((r) => r.attendanceStatus === 'no_show').length
  return { registered, attended, noShow }
})

const showResources = computed(() => {
  const ev = event.value
  if (!ev) return false
  const hasSlides = Boolean(ev.webinarSlides && ev.webinarSlides.length)
  const hasRecording = Boolean(ev.webinarRecordingUrl)
  return Boolean(ev.completed) || hasSlides || hasRecording
})

const youtubeEmbedUrl = computed(() => {
  const url = event.value?.webinarRecordingUrl
  if (!url) return null
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{6,})/)
  const id = match?.[1]
  return id ? `https://www.youtube.com/embed/${id}` : null
})

const portalEventUrl = computed(() => {
  const ev = event.value
  if (!ev || typeof window === 'undefined') return ''
  return `${window.location.origin}/app/events/${ev.id}`
})

function copyToClipboard(text: string) {
  if (!text) return
  if (navigator?.clipboard?.writeText) {
    navigator.clipboard.writeText(text)
    return
  }
  const el = document.createElement('textarea')
  el.value = text
  document.body.appendChild(el)
  el.select()
  document.execCommand('copy')
  document.body.removeChild(el)
}

async function loadRegistrations() {
  if (!eventId.value) return
  registrationsLoading.value = true
  try {
    registrations.value = await adminListEventRegistrations(eventId.value)
  } catch {
    registrations.value = []
  } finally {
    registrationsLoading.value = false
  }
}

function exportRegistrationsCsv() {
  const rows = registrations.value
  const headers = ['Name', 'Email', 'Company', 'Attendee type', 'Status', 'Attendance', 'Registered at', 'Paid at']
  const body = rows.map((r) => [
    r.name,
    r.email,
    r.company,
    r.attendeeType,
    r.status,
    r.attendanceStatus ?? '',
    r.createdAt,
    r.paidAt ?? '',
  ])
  const csv = [headers, ...body]
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${event.value?.title || 'event'}-registrations.csv`
  link.click()
  URL.revokeObjectURL(url)
}

async function loadEvent() {
  const id = eventId.value
  if (!id) return

  loading.value = true
  loadError.value = null
  event.value = null
  try {
    const data = await adminGetEvent(id)
    event.value = data
    form.value = {
      title: data.title,
      description: data.description || '',
      startAt: toLocalDateTime(data.startAt),
      durationMins: data.durationMins ?? 60,
      status: data.status ?? 'upcoming',
      completed: Boolean(data.completed),
      eligibility: data.eligibility,
      provision: data.provision,
      priceForNonCustomers: data.priceForNonCustomers == null ? '' : String(data.priceForNonCustomers),
      hostName: data.hostName ?? '',
      hostTitle: data.hostTitle ?? '',
      platform: data.platform ?? 'Teams',
      joinUrl: data.joinUrl ?? '',
      webinarSlides: (data.webinarSlides || []).map((s) => s.url).join(', '),
      webinarRecordingUrl: data.webinarRecordingUrl ?? '',
    }
    await loadRegistrations()
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load event'
  } finally {
    loading.value = false
  }
}

watchEffect(() => {
  void loadEvent()
})

async function onSave() {
  if (!event.value) return
  saveError.value = null
  saving.value = true
  try {
    const startAt = fromLocalDateTime(form.value.startAt)
    const slides = form.value.webinarSlides
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map((url, index) => ({ label: `Slide deck ${index + 1}`, url }))

    const patch = {
      title: form.value.title.trim(),
      description: form.value.description.trim(),
      startAt: startAt ?? event.value.startAt,
      durationMins: Number(form.value.durationMins) || 60,
      status: form.value.status.trim(),
      completed: Boolean(form.value.completed),
      eligibility: form.value.eligibility,
      provision: form.value.provision,
      priceForNonCustomers: form.value.priceForNonCustomers === '' ? null : Number(form.value.priceForNonCustomers),
      hostName: form.value.hostName.trim() || undefined,
      hostTitle: form.value.hostTitle.trim() || undefined,
      platform: form.value.platform,
      joinUrl: form.value.joinUrl.trim() || null,
      webinarSlides: slides.length ? slides : [],
      webinarRecordingUrl: form.value.webinarRecordingUrl.trim() || null,
    }

    const updated = await adminUpdateEvent(event.value.id, patch)
    event.value = updated
    await loadEvent()
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : 'Failed to save changes'
  } finally {
    saving.value = false
  }
}

async function onCancelEvent() {
  if (!event.value) return
  cancelling.value = true
  saveError.value = null
  try {
    const updated = await adminCancelEvent(event.value.id)
    event.value = updated
    await loadEvent()
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : 'Failed to cancel event'
  } finally {
    cancelling.value = false
  }
}

async function updateAttendance(registration: AdminEventRegistrationDto, value: string) {
  const attendanceStatus = value === 'attended' || value === 'no_show' ? value : null
  attendanceUpdating.value = { ...attendanceUpdating.value, [registration.id]: true }
  try {
    const updated = await adminUpdateRegistration(registration.id, { attendanceStatus })
    registrations.value = registrations.value.map((r) => (r.id === updated.id ? { ...r, ...updated } : r))
  } catch {
    // ignore
  } finally {
    attendanceUpdating.value = { ...attendanceUpdating.value, [registration.id]: false }
  }
}

function onAttendanceChange(registration: AdminEventRegistrationDto, event: Event) {
  const target = event.target as HTMLSelectElement | null
  updateAttendance(registration, target?.value ?? '')
}
</script>

<template>
  <div class="space-y-6">
    <div v-if="loadError" class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-200">
      {{ loadError }}
    </div>

    <div v-else-if="loading" role="status" class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 animate-pulse">
      <div class="space-y-3">
        <div class="h-3 w-32 rounded-full bg-gray-200 dark:bg-gray-700" />
        <div class="h-2.5 w-72 rounded-full bg-gray-200 dark:bg-gray-700" />
        <div class="h-2.5 w-56 rounded-full bg-gray-200 dark:bg-gray-700" />
      </div>
      <span class="sr-only">Loading...</span>
    </div>

    <template v-else-if="event">
      <div v-if="(event.status ?? '').toLowerCase() === 'cancelled'" class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-200">
        <div class="font-semibold">This webinar is cancelled.</div>
        <p class="mt-1 text-sm">Send a cancellation email to all registrants.</p>
        <button type="button" class="mt-3 inline-flex items-center rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700">
          Send cancellation email
        </button>
      </div>

      <nav class="flex" aria-label="Breadcrumb">
        <ol class="inline-flex items-center space-x-1 md:space-x-2 rtl:space-x-reverse text-sm">
          <li class="inline-flex items-center">
            <RouterLink
              to="/admin/events"
              class="inline-flex items-center font-medium text-gray-700 hover:text-primary-600 dark:text-gray-300 dark:hover:text-white"
            >
              Events
            </RouterLink>
          </li>
          <li aria-current="page">
            <div class="flex items-center">
              <svg class="w-3 h-3 text-gray-400 mx-1 rtl:rotate-180" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 6 10">
                <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m1 9 4-4-4-4" />
              </svg>
              <span class="ms-1 text-gray-500 md:ms-2 dark:text-gray-400">Details</span>
            </div>
          </li>
        </ol>
      </nav>

      <header class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{{ event.type }}</span>
            <span class="text-xs text-gray-500 dark:text-gray-400">{{ event.dateLabel }} · {{ event.timezoneLabel }}</span>
          </div>
          <h1 class="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{{ event.title }}</h1>
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">{{ event.description }}</p>
          <div class="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              class="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              :disabled="!event.joinUrl"
              @click="copyToClipboard(event.joinUrl ?? '')"
            >
              Copy join link
            </button>
            <button
              type="button"
              class="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              :disabled="!portalEventUrl"
              @click="copyToClipboard(portalEventUrl)"
            >
              Copy event URL
            </button>
            <button
              type="button"
              class="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              :disabled="registrationsLoading || registrations.length === 0"
              @click="exportRegistrationsCsv"
            >
              Export attendees (CSV)
            </button>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <span class="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {{ event.status ?? 'upcoming' }}
          </span>
          <button
            type="button"
            class="inline-flex items-center rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200"
            :disabled="cancelling"
            @click="onCancelEvent"
          >
            {{ cancelling ? 'Cancelling…' : 'Cancel event' }}
          </button>
        </div>
      </header>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section class="lg:col-span-2 space-y-4">
          <div class="ui-surface p-5">
            <h2 class="text-base font-semibold text-white">Engagement</h2>
            <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div class="ui-surface-muted p-3">
                <dt class="text-xs font-medium text-white/60">Registered</dt>
                <dd class="mt-1 text-lg font-semibold text-white">{{ engagementStats.registered }}</dd>
              </div>
              <div class="ui-surface-muted p-3">
                <dt class="text-xs font-medium text-white/60">Attendees</dt>
                <dd class="mt-1 text-lg font-semibold text-white">{{ engagementStats.attended }}</dd>
              </div>
              <div class="ui-surface-muted p-3">
                <dt class="text-xs font-medium text-white/60">Did not attend</dt>
                <dd class="mt-1 text-lg font-semibold text-white">{{ engagementStats.noShow }}</dd>
              </div>
            </div>
          </div>

          <div class="ui-surface p-5">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 class="text-base font-semibold text-white">Registrations</h2>
                <p class="text-xs text-white/60">Update attendance to track attendees and no‑shows.</p>
              </div>
              <button
                type="button"
                class="ui-btn-secondary"
                :disabled="registrationsLoading || registrations.length === 0"
                @click="exportRegistrationsCsv"
              >
                Export CSV
              </button>
            </div>

            <div class="mt-4 overflow-x-auto">
              <table class="ui-table">
                <thead>
                  <tr>
                    <th class="px-4 py-2">Name</th>
                    <th class="px-4 py-2">Email</th>
                    <th class="px-4 py-2">Type</th>
                    <th class="px-4 py-2">Status</th>
                    <th class="px-4 py-2">Attendance</th>
                    <th class="px-4 py-2">Registered</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="registrationsLoading">
                    <td colspan="6" class="px-4 py-3 text-sm text-white/50">Loading registrations…</td>
                  </tr>
                  <tr v-else-if="registrations.length === 0">
                    <td colspan="6" class="px-4 py-3 text-sm text-white/50">No registrations yet.</td>
                  </tr>
                  <tr v-else v-for="reg in registrations" :key="reg.id" class="border-b border-white/10">
                    <td class="px-4 py-3 font-medium text-white">{{ reg.name }}</td>
                    <td class="px-4 py-3">{{ reg.email }}</td>
                    <td class="px-4 py-3 capitalize">{{ reg.attendeeType }}</td>
                    <td class="px-4 py-3 capitalize">{{ reg.status.replace('_', ' ') }}</td>
                    <td class="px-4 py-3">
                      <select
                        class="ui-select"
                        :value="reg.attendanceStatus ?? ''"
                        :disabled="attendanceUpdating[reg.id]"
                        @change="onAttendanceChange(reg, $event)"
                      >
                        <option value="">Not set</option>
                        <option value="attended">Attended</option>
                        <option value="no_show">No show</option>
                      </select>
                    </td>
                    <td class="px-4 py-3">{{ reg.createdAt }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="ui-surface p-5">
            <h2 class="text-base font-semibold text-white">Email performance</h2>
            <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div class="ui-surface-muted p-3">
                <dt class="text-xs font-medium text-white/60">Sent</dt>
                <dd class="mt-1 text-lg font-semibold text-white">{{ emailStats.sent ?? '—' }}</dd>
              </div>
              <div class="ui-surface-muted p-3">
                <dt class="text-xs font-medium text-white/60">Delivered</dt>
                <dd class="mt-1 text-lg font-semibold text-white">{{ emailStats.delivered ?? '—' }}</dd>
              </div>
              <div class="ui-surface-muted p-3">
                <dt class="text-xs font-medium text-white/60">Bounced</dt>
                <dd class="mt-1 text-lg font-semibold text-white">{{ emailStats.bounced ?? '—' }}</dd>
              </div>
              <div class="ui-surface-muted p-3">
                <dt class="text-xs font-medium text-white/60">CTR</dt>
                <dd class="mt-1 text-lg font-semibold text-white">{{ emailStats.ctr ?? '—' }}</dd>
              </div>
            </div>
            <p class="mt-3 text-xs text-white/50">Email metrics will populate once HubSpot email analytics are wired.</p>
          </div>

          <div class="ui-surface p-5">
            <h2 class="text-base font-semibold text-white">Post-webinar checklist</h2>
            <ul class="mt-3 space-y-2 text-sm text-white/80">
              <li class="flex items-center justify-between">
                <span>Upload slides</span>
                <span class="text-xs font-semibold" :class="event.webinarSlides?.length ? 'text-green-600 dark:text-green-300' : 'text-amber-600 dark:text-amber-300'">
                  {{ event.webinarSlides?.length ? 'Done' : 'Pending' }}
                </span>
              </li>
              <li class="flex items-center justify-between">
                <span>Add recording</span>
                <span class="text-xs font-semibold" :class="event.webinarRecordingUrl ? 'text-green-600 dark:text-green-300' : 'text-amber-600 dark:text-amber-300'">
                  {{ event.webinarRecordingUrl ? 'Done' : 'Pending' }}
                </span>
              </li>
              <li class="flex items-center justify-between">
                <span>Send follow‑up email</span>
                <span class="text-xs font-semibold text-amber-600 dark:text-amber-300">Pending</span>
              </li>
            </ul>
          </div>

          <div v-if="showResources" class="ui-surface p-5">
            <h2 class="text-base font-semibold text-white">Webinar resources</h2>

            <div v-if="event.webinarSlides && event.webinarSlides.length" class="mt-3">
              <h3 class="text-sm font-semibold text-white">Slides</h3>
              <ul class="mt-2 space-y-2 text-sm">
                <li v-for="slide in event.webinarSlides" :key="slide.url">
                  <a
                    :href="slide.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-primary-600 hover:text-primary-700 dark:text-primary-400"
                  >
                    {{ slide.label || 'Download slides' }}
                  </a>
                </li>
              </ul>
            </div>

            <div v-if="event.webinarRecordingUrl" class="mt-4">
              <h3 class="text-sm font-semibold text-white">Recording</h3>
              <div v-if="youtubeEmbedUrl" class="mt-2 aspect-video overflow-hidden rounded-lg border border-white/10">
                <iframe
                  :src="youtubeEmbedUrl"
                  title="Webinar recording"
                  class="h-full w-full"
                  frameborder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowfullscreen
                />
              </div>
              <a
                v-else
                :href="event.webinarRecordingUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="mt-2 inline-flex text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
              >
                Watch recording
              </a>
            </div>
          </div>
        </section>

        <aside class="space-y-4">
          <div class="ui-surface p-5">
            <h2 class="text-base font-semibold text-white">Webinar details</h2>
            <dl class="mt-4 space-y-3 text-sm">
              <div class="flex items-start justify-between gap-3">
                <dt class="text-white/60">Host</dt>
                <dd class="font-medium text-white text-right">{{ event.hostName || '—' }}</dd>
              </div>
              <div class="flex items-start justify-between gap-3">
                <dt class="text-white/60">Provision</dt>
                <dd class="font-medium text-white text-right">{{ event.provisionLabel }}</dd>
              </div>
              <div class="flex items-start justify-between gap-3">
                <dt class="text-white/60">Audience</dt>
                <dd class="font-medium text-white text-right">{{ event.eligibilityLabel }}</dd>
              </div>
              <div class="flex items-start justify-between gap-3">
                <dt class="text-white/60">Duration</dt>
                <dd class="font-medium text-white text-right">{{ event.durationMins }} mins</dd>
              </div>
              <div class="flex items-start justify-between gap-3">
                <dt class="text-white/60">Registrations</dt>
                <dd class="font-medium text-white text-right">{{ registrations.length }}</dd>
              </div>
            </dl>
          </div>

          <div class="ui-surface p-5">
            <h2 class="text-base font-semibold text-white">Edit details</h2>
            <form class="mt-4 space-y-3" @submit.prevent="onSave">
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-gray-400">Title</label>
                <input v-model="form.title" class="ui-input mt-1" type="text" />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-gray-400">Description</label>
                <textarea v-model="form.description" class="ui-textarea mt-1" rows="3" />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-gray-400">Start date & time</label>
                <input v-model="form.startAt" class="ui-input mt-1" type="datetime-local" />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-medium text-gray-500 dark:text-gray-400">Duration (mins)</label>
                  <input v-model.number="form.durationMins" class="ui-input mt-1" type="number" min="15" />
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-500 dark:text-gray-400">Status</label>
                  <select v-model="form.status" class="ui-select mt-1">
                    <option value="upcoming">Upcoming</option>
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
              <label class="inline-flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <input v-model="form.completed" type="checkbox" class="rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700" />
                Mark as completed
              </label>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-medium text-gray-500 dark:text-gray-400">Provision</label>
                  <select v-model="form.provision" class="ui-select mt-1">
                    <option value="all">All</option>
                    <option value="childrens-home">Children’s homes</option>
                    <option value="supported-accommodation">Supported accommodation</option>
                    <option value="over-18">18+ provision</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-500 dark:text-gray-400">Audience</label>
                  <select v-model="form.eligibility" class="ui-select mt-1">
                    <option value="customer">Customer</option>
                    <option value="non-customer">Non-customer</option>
                    <option value="both">Both</option>
                  </select>
                </div>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-gray-400">Price (non-customer)</label>
                <input v-model="form.priceForNonCustomers" class="ui-input mt-1" type="text" placeholder="£" />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-medium text-gray-500 dark:text-gray-400">Host</label>
                  <input v-model="form.hostName" class="ui-input mt-1" type="text" />
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-500 dark:text-gray-400">Host title</label>
                  <input v-model="form.hostTitle" class="ui-input mt-1" type="text" />
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-medium text-gray-500 dark:text-gray-400">Platform</label>
                  <select v-model="form.platform" class="ui-select mt-1">
                    <option value="Teams">Teams</option>
                    <option value="Riverside">Riverside</option>
                    <option value="TBD">TBD</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-500 dark:text-gray-400">Join URL</label>
                  <input v-model="form.joinUrl" class="ui-input mt-1" type="text" />
                </div>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-gray-400">Slides (comma-separated URLs)</label>
                <textarea v-model="form.webinarSlides" class="ui-textarea mt-1" rows="2" />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-gray-400">Recording (YouTube URL)</label>
                <input v-model="form.webinarRecordingUrl" class="ui-input mt-1" type="text" />
              </div>

              <div v-if="saveError" class="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
                {{ saveError }}
              </div>

              <button type="submit" class="ui-btn-primary w-full" :disabled="saving">
                {{ saving ? 'Saving…' : 'Save changes' }}
              </button>
            </form>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>
