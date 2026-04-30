<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import {
  adminCancelEvent,
  adminGetEvent,
  adminListEventRegistrations,
  adminUpdateRegistration,
  adminUpdateEvent,
  adminGetInviteLists,
  adminSendInvites,
  type AdminEventRegistrationDto,
  type EventDto,
  type HubSpotContactList,
} from '../../lib/api'
import { useToast } from '../../lib/toast'

const toast = useToast()

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
const editOpen = ref(false)
const editPanelRef = ref<HTMLElement | null>(null)

watch(editOpen, async (open) => {
  if (open) {
    await nextTick()
    if (editPanelRef.value) {
      const top = editPanelRef.value.getBoundingClientRect().top + window.scrollY - 80
      window.scrollTo({ top, behavior: 'smooth' })
    }
  }
})
const regsOpen = ref(true)
const actionsOpen = ref(false)
const actionsRef = ref<HTMLElement | null>(null)

function handleActionsClickOutside(e: MouseEvent) {
  if (actionsRef.value && !actionsRef.value.contains(e.target as Node)) {
    actionsOpen.value = false
  }
}
onMounted(() => document.addEventListener('mousedown', handleActionsClickOutside))
onUnmounted(() => document.removeEventListener('mousedown', handleActionsClickOutside))

// Quick-edit modals
const slidesModal = ref(false)
const slidesValue = ref('')
const slidesSaving = ref(false)
const slidesError = ref<string | null>(null)

const recordingModal = ref(false)
const recordingValue = ref('')
const recordingSaving = ref(false)
const recordingError = ref<string | null>(null)

const blogModal = ref(false)
const blogValue = ref('')
const blogSaving = ref(false)
const blogError = ref<string | null>(null)

const followUpSaving = ref(false)

function openSlidesModal() {
  slidesValue.value = (event.value?.webinarSlides || []).map((s) => s.url).join(',\n')
  slidesError.value = null
  slidesModal.value = true
}

async function saveSlidesModal() {
  if (!event.value) return
  slidesSaving.value = true
  slidesError.value = null
  try {
    const slides = slidesValue.value
      .split(/[,\n]+/)
      .map((v) => v.trim())
      .filter(Boolean)
      .map((url, i) => ({ label: `Slide deck ${i + 1}`, url }))
    const updated = await adminUpdateEvent(event.value.id, { webinarSlides: slides })
    event.value = updated
    toast.success('Slides saved')
    slidesModal.value = false
  } catch (e) {
    slidesError.value = e instanceof Error ? e.message : 'Failed to save'
    toast.error(slidesError.value)
  } finally {
    slidesSaving.value = false
  }
}

function openRecordingModal() {
  recordingValue.value = event.value?.webinarRecordingUrl ?? ''
  recordingError.value = null
  recordingModal.value = true
}

async function saveRecordingModal() {
  if (!event.value) return
  recordingSaving.value = true
  recordingError.value = null
  try {
    const updated = await adminUpdateEvent(event.value.id, {
      webinarRecordingUrl: recordingValue.value.trim() || null,
    })
    event.value = updated
    toast.success('Recording URL saved')
    recordingModal.value = false
  } catch (e) {
    recordingError.value = e instanceof Error ? e.message : 'Failed to save'
    toast.error(recordingError.value)
  } finally {
    recordingSaving.value = false
  }
}

function openBlogModal() {
  blogValue.value = event.value?.blogPostUrl ?? ''
  blogError.value = null
  blogModal.value = true
}

async function saveBlogModal() {
  if (!event.value) return
  blogSaving.value = true
  blogError.value = null
  try {
    const updated = await adminUpdateEvent(event.value.id, {
      blogPostUrl: blogValue.value.trim() || null,
    })
    event.value = updated
    toast.success('Blog post URL saved')
    blogModal.value = false
  } catch (e) {
    blogError.value = e instanceof Error ? e.message : 'Failed to save'
    toast.error(blogError.value)
  } finally {
    blogSaving.value = false
  }
}

async function markFollowUpSent() {
  if (!event.value) return
  followUpSaving.value = true
  try {
    const updated = await adminUpdateEvent(event.value.id, { followUpEmailSent: true })
    event.value = updated
    toast.success('Follow-up email marked as sent')
  } catch {
    toast.error('Failed to mark follow-up email')
    // ignore
  } finally {
    followUpSaving.value = false
  }
}

// Invite modal
const inviteModal = ref(false)
const inviteLists = ref<HubSpotContactList[]>([])
const inviteListsLoading = ref(false)
const inviteListsError = ref<string | null>(null)
const selectedListId = ref<number | null>(null)
const inviteSending = ref(false)
const inviteResult = ref<{ queued: number } | null>(null)
const inviteSendError = ref<string | null>(null)

async function openInviteModal() {
  inviteModal.value = true
  inviteResult.value = null
  inviteSendError.value = null
  selectedListId.value = null
  inviteLists.value = []
  inviteListsLoading.value = true
  inviteListsError.value = null
  try {
    inviteLists.value = await adminGetInviteLists(eventId.value)
  } catch (e) {
    inviteListsError.value = e instanceof Error ? e.message : 'Failed to load lists'
  } finally {
    inviteListsLoading.value = false
  }
}

async function sendInvites() {
  if (!selectedListId.value) return
  inviteSending.value = true
  inviteSendError.value = null
  try {
    const result = await adminSendInvites(eventId.value, selectedListId.value)
    inviteResult.value = result
  } catch (e) {
    inviteSendError.value = e instanceof Error ? e.message : 'Failed to send invites'
  } finally {
    inviteSending.value = false
  }
}

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

const hasEmailStats = computed(() => {
  const s = event.value?.emailStats
  if (!s) return false
  return (s.sent ?? 0) > 0 || (s.delivered ?? 0) > 0 || (s.bounced ?? 0) > 0 || (s.ctr ?? 0) > 0
})

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
    toast.success('Event changes saved')
    editOpen.value = false
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : 'Failed to save changes'
    toast.error(saveError.value)
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
    toast.success('Event cancelled')
    await loadEvent()
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : 'Failed to cancel event'
    toast.error(saveError.value)
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
    toast.success('Attendance status updated')
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to update attendance status'
    toast.error(msg)
  } finally {
    attendanceUpdating.value = { ...attendanceUpdating.value, [registration.id]: false }
  }
}

function onAttendanceChange(registration: AdminEventRegistrationDto, event: Event) {
  const target = event.target as HTMLSelectElement | null
  updateAttendance(registration, target?.value ?? '')
}

function statusBadge(status?: string | null) {
  switch ((status ?? 'upcoming').toLowerCase()) {
    case 'published': return 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30'
    case 'completed': return 'bg-sky-500/20 text-sky-200 border-sky-500/30'
    case 'cancelled': return 'bg-rose-500/20 text-rose-200 border-rose-500/30'
    case 'draft': return 'bg-amber-500/20 text-amber-200 border-amber-500/30'
    case 'upcoming': return 'bg-indigo-500/20 text-indigo-200 border-indigo-500/30'
    default: return 'bg-white/10 text-white/70 border-white/10'
  }
}

function typeBadge(type?: string | null) {
  switch ((type ?? '').toLowerCase()) {
    case 'webinar': return 'border-violet-500/30 bg-violet-500/20 text-violet-200'
    case 'workshop': return 'border-blue-500/30 bg-blue-500/20 text-blue-200'
    case 'qa':
    case 'q&a': return 'border-cyan-500/30 bg-cyan-500/20 text-cyan-200'
    case 'training': return 'border-orange-500/30 bg-orange-500/20 text-orange-200'
    default: return 'border-white/10 bg-white/5 text-white/50'
  }
}

function formatDuration(mins?: number | null): string {
  if (mins == null) return '\u2014'
  if (mins < 60) return `${mins}min`
  const h = mins / 60
  const label = h === Math.floor(h) ? `${Math.floor(h)}` : `${h}`
  return `${label}hr${h !== 1 ? 's' : ''}`
}

const formattedDateTime = computed(() => {
  const ev = event.value
  if (!ev?.startAt) return ev?.dateLabel ?? ''
  const d = new Date(ev.startAt)
  if (Number.isNaN(d.getTime())) return ev?.dateLabel ?? ''
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const date = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  return `${time} · ${date}`
})
</script>

<template>
  <div class="space-y-4">

    <!-- Error -->
    <div v-if="loadError" class="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
      {{ loadError }}
    </div>

    <!-- Loading skeleton -->
    <div v-else-if="loading" class="rounded-2xl border border-white/10 bg-[#0f1428] p-6 animate-pulse shadow-[0_18px_40px_rgba(15,20,40,0.35)]">
      <div class="space-y-3">
        <div class="h-3 w-24 rounded-full bg-white/10" />
        <div class="h-7 w-80 rounded-full bg-white/10" />
        <div class="h-3 w-56 rounded-full bg-white/10" />
      </div>
    </div>

    <template v-else-if="event">

      <!-- HERO CARD -->
      <div class="rounded-2xl border border-white/10 bg-[#0f1428] text-white shadow-[0_18px_40px_rgba(15,20,40,0.35)]">

        <!-- Cancelled banner -->
        <div
          v-if="(event.status ?? '').toLowerCase() === 'cancelled'"
          class="flex items-center gap-3 rounded-t-2xl border-b border-rose-500/20 bg-rose-500/10 px-6 py-3 text-sm text-rose-200"
        >
          <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          This event has been cancelled.
        </div>

        <div class="p-6">
          <!-- Breadcrumb -->
          <nav class="mb-4 flex items-center gap-1.5 text-xs text-white/40">
            <RouterLink to="/admin/events" class="hover:text-white/70 transition-colors">Events</RouterLink>
            <svg class="h-3 w-3" fill="none" viewBox="0 0 6 10" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="m1 9 4-4-4-4" />
            </svg>
            <span class="text-white/60">Details</span>
          </nav>

          <!-- Title row -->
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span
                  class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize"
                  :class="statusBadge(event.status)"
                >
                  {{ event.status ?? 'upcoming' }}
                </span>
                <span class="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-white/50">
                  {{ formattedDateTime }}
                </span>
                <span
                  class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize"
                  :class="typeBadge(event.type)"
                >
                  {{ event.type }}
                </span>
              </div>
              <h1 class="mt-3 text-2xl font-semibold leading-tight">{{ event.title }}</h1>
            </div>

            <!-- Action dropdown -->
            <div ref="actionsRef" class="relative lg:shrink-0">
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-white/80 hover:bg-white/10 transition"
                @click="actionsOpen = !actionsOpen"
              >
                Actions
                <svg class="h-3.5 w-3.5 transition-transform" :class="actionsOpen ? 'rotate-180' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              <Transition
                enter-active-class="transition ease-out duration-100"
                enter-from-class="opacity-0 scale-95"
                enter-to-class="opacity-100 scale-100"
                leave-active-class="transition ease-in duration-75"
                leave-from-class="opacity-100 scale-100"
                leave-to-class="opacity-0 scale-95"
              >
                <div
                  v-if="actionsOpen"
                  class="absolute right-0 z-50 mt-1 w-52 origin-top-right rounded-xl border border-white/10 bg-[#1a1a2e] py-1 shadow-xl"
                >
                  <!-- Copy join link -->
                  <button
                    type="button"
                    class="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
                    :disabled="!event.joinUrl"
                    @click="copyToClipboard(event.joinUrl ?? ''); actionsOpen = false"
                  >
                    <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                    </svg>
                    Copy join link
                  </button>

                  <!-- Copy event URL -->
                  <button
                    type="button"
                    class="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
                    :disabled="!portalEventUrl"
                    @click="copyToClipboard(portalEventUrl); actionsOpen = false"
                  >
                    <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                    </svg>
                    Copy event URL
                  </button>

                  <!-- Export CSV -->
                  <button
                    type="button"
                    class="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
                    :disabled="registrationsLoading || registrations.length === 0"
                    @click="exportRegistrationsCsv(); actionsOpen = false"
                  >
                    <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Export CSV
                  </button>

                  <div class="my-1 border-t border-white/10" />

                  <!-- Edit -->
                  <button
                    type="button"
                    class="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm transition"
                    :class="editOpen ? 'text-white bg-white/5' : 'text-white/70 hover:bg-white/5 hover:text-white'"
                    @click="editOpen = !editOpen; actionsOpen = false"
                  >
                    <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                    </svg>
                    {{ editOpen ? 'Close edit' : 'Edit event' }}
                  </button>

                  <!-- Send invites -->
                  <button
                    type="button"
                    class="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-pink-300 hover:bg-pink-500/10 transition"
                    @click="openInviteModal(); actionsOpen = false"
                  >
                    <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                    Send invites
                  </button>

                  <!-- Cancel event -->
                  <button
                    v-if="(event.status ?? '').toLowerCase() !== 'cancelled'"
                    type="button"
                    class="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-rose-300 hover:bg-rose-500/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    :disabled="cancelling"
                    @click="onCancelEvent(); actionsOpen = false"
                  >
                    <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    {{ cancelling ? 'Cancelling\u2026' : 'Cancel event' }}
                  </button>
                </div>
              </Transition>
            </div>
          </div>
          <p v-if="event.description" class="mt-3 text-sm text-white/60 leading-relaxed">{{ event.description }}</p>

          <!-- STATS ROW -->
          <div class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div class="rounded-xl border border-white/10 bg-white/5 p-4">
              <div class="text-xs font-semibold uppercase tracking-wide text-white/50">Registered</div>
              <div class="mt-2 text-2xl font-semibold text-white">{{ engagementStats.registered }}</div>
              <p class="mt-1 text-xs text-white/40">total sign-ups</p>
            </div>
            <div class="rounded-xl border border-white/10 bg-white/5 p-4">
              <div class="text-xs font-semibold uppercase tracking-wide text-white/50">Attendees</div>
              <div class="mt-2 text-2xl font-semibold text-white">{{ engagementStats.attended }}</div>
              <p class="mt-1 text-xs text-white/40">marked attended</p>
            </div>
            <div class="rounded-xl border border-white/10 bg-white/5 p-4">
              <div class="text-xs font-semibold uppercase tracking-wide text-white/50">Did not attend</div>
              <div class="mt-2 text-2xl font-semibold text-white">{{ engagementStats.noShow }}</div>
              <p class="mt-1 text-xs text-white/40">no-shows</p>
            </div>
            <div class="rounded-xl border border-white/10 bg-white/5 p-4">
              <div class="text-xs font-semibold uppercase tracking-wide text-white/50">Duration</div>
              <div class="mt-2 text-2xl font-semibold text-white">{{ formatDuration(event.durationMins) }}</div>
              <p class="mt-1 text-xs text-white/40">duration</p>
            </div>
          </div>

          <!-- METADATA STRIP -->
          <div class="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-white/10 bg-white/5 p-4 sm:grid-cols-4">
            <div>
              <div class="text-xs font-semibold uppercase tracking-wide text-white/40">Host</div>
              <div class="mt-1 text-sm font-medium text-white">{{ event.hostName || '\u2014' }}</div>
              <div v-if="event.hostTitle" class="text-xs text-white/40">{{ event.hostTitle }}</div>
            </div>
            <div>
              <div class="text-xs font-semibold uppercase tracking-wide text-white/40">Provision</div>
              <div class="mt-1 text-sm font-medium text-white">{{ event.provisionLabel || '\u2014' }}</div>
            </div>
            <div>
              <div class="text-xs font-semibold uppercase tracking-wide text-white/40">Audience</div>
              <div class="mt-1 text-sm font-medium text-white">{{ event.eligibilityLabel || '\u2014' }}</div>
            </div>
            <div>
              <div class="text-xs font-semibold uppercase tracking-wide text-white/40">Platform</div>
              <div class="mt-1 text-sm font-medium text-white">{{ event.platform || '\u2014' }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- POST-EVENT CHECKLIST -->
      <div class="rounded-2xl border border-white/10 bg-[#14192d] text-white shadow-[0_18px_40px_rgba(15,20,40,0.2)]">
        <div class="border-b border-white/10 px-5 py-4">
          <div class="text-sm font-semibold">Post-event checklist</div>
          <div class="text-xs text-white/50">Complete each step after the event has run.</div>
        </div>
        <div class="divide-y divide-white/10">

          <!-- 1. Upload slides -->
          <button
            type="button"
            class="flex w-full items-center justify-between px-5 py-3.5 text-left transition hover:bg-white/5 rounded-none"
            @click="openSlidesModal"
          >
            <div class="flex items-center gap-3">
              <div
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded border"
                :class="event.webinarSlides?.length ? 'border-emerald-500/50 bg-emerald-500/20' : 'border-white/20 bg-white/5'"
              >
                <svg v-if="event.webinarSlides?.length" class="h-3 w-3 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <div>
                <div class="text-sm text-white/80">Upload slides</div>
                <div class="text-xs text-white/40">{{ event.webinarSlides?.length ? event.webinarSlides.length + ' URL' + (event.webinarSlides.length > 1 ? 's' : '') + ' added' : 'Add slide deck URLs' }}</div>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="rounded-full border px-2 py-0.5 text-xs font-semibold" :class="event.webinarSlides?.length ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'">
                {{ event.webinarSlides?.length ? 'Done' : 'Pending' }}
              </span>
              <svg class="h-3.5 w-3.5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
            </div>
          </button>

          <!-- 2. Add recording -->
          <button
            type="button"
            class="flex w-full items-center justify-between px-5 py-3.5 text-left transition hover:bg-white/5 rounded-none"
            @click="openRecordingModal"
          >
            <div class="flex items-center gap-3">
              <div
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded border"
                :class="event.webinarRecordingUrl ? 'border-emerald-500/50 bg-emerald-500/20' : 'border-white/20 bg-white/5'"
              >
                <svg v-if="event.webinarRecordingUrl" class="h-3 w-3 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <div>
                <div class="text-sm text-white/80">Add recording</div>
                <div class="text-xs text-white/40">{{ event.webinarRecordingUrl ? 'YouTube URL added' : 'Paste a YouTube link once edited' }}</div>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="rounded-full border px-2 py-0.5 text-xs font-semibold" :class="event.webinarRecordingUrl ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'">
                {{ event.webinarRecordingUrl ? 'Done' : 'Pending' }}
              </span>
              <svg class="h-3.5 w-3.5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
            </div>
          </button>

          <!-- 3. Add blog post -->
          <button
            type="button"
            class="flex w-full items-center justify-between px-5 py-3.5 text-left transition hover:bg-white/5 rounded-none"
            @click="openBlogModal"
          >
            <div class="flex items-center gap-3">
              <div
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded border"
                :class="event.blogPostUrl ? 'border-emerald-500/50 bg-emerald-500/20' : 'border-white/20 bg-white/5'"
              >
                <svg v-if="event.blogPostUrl" class="h-3 w-3 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <div>
                <div class="text-sm text-white/80">Add blog post</div>
                <div class="text-xs text-white/40">{{ event.blogPostUrl ? 'Summary post linked' : 'Link the webinar summary blog post' }}</div>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="rounded-full border px-2 py-0.5 text-xs font-semibold" :class="event.blogPostUrl ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'">
                {{ event.blogPostUrl ? 'Done' : 'Pending' }}
              </span>
              <svg class="h-3.5 w-3.5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
            </div>
          </button>

          <!-- 4. Send follow-up email -->
          <div class="flex items-center justify-between px-5 py-3.5">
            <div class="flex items-center gap-3">
              <div
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded border"
                :class="event.followUpEmailSent ? 'border-emerald-500/50 bg-emerald-500/20' : 'border-white/20 bg-white/5'"
              >
                <svg v-if="event.followUpEmailSent" class="h-3 w-3 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <div>
                <div class="text-sm text-white/80">Send follow-up email</div>
                <div class="text-xs text-white/40">{{ event.followUpEmailSent ? 'Marked as sent' : 'Usually sent ~2 days after the event once video is edited' }}</div>
              </div>
            </div>
            <div v-if="event.followUpEmailSent">
              <span class="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300">Done</span>
            </div>
            <div v-else>
              <button
                type="button"
                class="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="followUpSaving"
                @click="markFollowUpSent"
              >
                {{ followUpSaving ? 'Saving\u2026' : 'Mark as sent' }}
              </button>
            </div>
          </div>

        </div>
      </div>

      <!-- EDIT PANEL (collapsible) -->
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 -translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-1"
      >
        <div v-if="editOpen" ref="editPanelRef" class="rounded-2xl border border-white/10 bg-[#14192d] text-white shadow-[0_18px_40px_rgba(15,20,40,0.2)]">
          <div class="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <div class="text-sm font-semibold">Edit details</div>
              <div class="text-xs text-white/50">Changes are saved only when you click Save changes.</div>
            </div>
            <button type="button" class="rounded-lg p-1 text-white/40 hover:text-white/70 transition" @click="editOpen = false">
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form class="p-5" @submit.prevent="onSave">
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">

              <div class="sm:col-span-2">
                <label class="block text-xs font-semibold uppercase tracking-wide text-white/50 mb-1.5">Title</label>
                <input v-model="form.title" type="text" class="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#e7007e]/50" />
              </div>

              <div class="sm:col-span-2">
                <label class="block text-xs font-semibold uppercase tracking-wide text-white/50 mb-1.5">Description</label>
                <textarea v-model="form.description" rows="3" class="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#e7007e]/50 resize-none" />
              </div>

              <div>
                <label class="block text-xs font-semibold uppercase tracking-wide text-white/50 mb-1.5">Start date &amp; time</label>
                <input v-model="form.startAt" type="datetime-local" class="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#e7007e]/50 [color-scheme:dark]" />
              </div>

              <div>
                <label class="block text-xs font-semibold uppercase tracking-wide text-white/50 mb-1.5">Duration (mins)</label>
                <input v-model.number="form.durationMins" type="number" min="15" class="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#e7007e]/50" />
              </div>

              <div>
                <label class="block text-xs font-semibold uppercase tracking-wide text-white/50 mb-1.5">Status</label>
                <select v-model="form.status" class="w-full rounded-lg border border-white/10 bg-[#1a2035] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#e7007e]/50">
                  <option value="upcoming">Upcoming</option>
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-semibold uppercase tracking-wide text-white/50 mb-1.5">Provision</label>
                <select v-model="form.provision" class="w-full rounded-lg border border-white/10 bg-[#1a2035] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#e7007e]/50">
                  <option value="all">All</option>
                  <option value="childrens-home">Children's homes</option>
                  <option value="supported-accommodation">Supported accommodation</option>
                  <option value="over-18">18+ provision</option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-semibold uppercase tracking-wide text-white/50 mb-1.5">Audience</label>
                <select v-model="form.eligibility" class="w-full rounded-lg border border-white/10 bg-[#1a2035] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#e7007e]/50">
                  <option value="customer">Customers only</option>
                  <option value="non-customer">Non-customers</option>
                  <option value="both">Both</option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-semibold uppercase tracking-wide text-white/50 mb-1.5">Price (non-customer)</label>
                <input v-model="form.priceForNonCustomers" type="text" placeholder="e.g. 25" class="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#e7007e]/50" />
              </div>

              <div>
                <label class="block text-xs font-semibold uppercase tracking-wide text-white/50 mb-1.5">Host name</label>
                <input v-model="form.hostName" type="text" class="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#e7007e]/50" />
              </div>

              <div>
                <label class="block text-xs font-semibold uppercase tracking-wide text-white/50 mb-1.5">Host title</label>
                <input v-model="form.hostTitle" type="text" class="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#e7007e]/50" />
              </div>

              <div>
                <label class="block text-xs font-semibold uppercase tracking-wide text-white/50 mb-1.5">Platform</label>
                <select v-model="form.platform" class="w-full rounded-lg border border-white/10 bg-[#1a2035] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#e7007e]/50">
                  <option value="Teams">Teams</option>
                  <option value="Riverside">Riverside</option>
                  <option value="TBD">TBD</option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-semibold uppercase tracking-wide text-white/50 mb-1.5">Join URL</label>
                <input v-model="form.joinUrl" type="text" placeholder="https://teams.microsoft.com/..." class="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#e7007e]/50" />
              </div>

              <div class="sm:col-span-2">
                <label class="block text-xs font-semibold uppercase tracking-wide text-white/50 mb-1.5">Slide URLs <span class="normal-case font-normal text-white/30">(comma-separated)</span></label>
                <textarea v-model="form.webinarSlides" rows="2" class="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#e7007e]/50 resize-none" />
              </div>

              <div class="sm:col-span-2">
                <label class="block text-xs font-semibold uppercase tracking-wide text-white/50 mb-1.5">Recording URL <span class="normal-case font-normal text-white/30">(YouTube link)</span></label>
                <input v-model="form.webinarRecordingUrl" type="text" class="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#e7007e]/50" />
              </div>

              <div class="sm:col-span-2">
                <label class="inline-flex items-center gap-2.5 cursor-pointer">
                  <input v-model="form.completed" type="checkbox" class="h-4 w-4 rounded border-white/20 bg-white/10 text-[#e7007e] focus:ring-[#e7007e]/50" />
                  <span class="text-sm text-white/70">Mark as completed</span>
                </label>
              </div>
            </div>

            <div v-if="saveError" class="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
              {{ saveError }}
            </div>

            <div class="mt-5 flex justify-end gap-3">
              <button type="button" class="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/10 transition" @click="editOpen = false">
                Cancel
              </button>
              <button
                type="submit"
                class="inline-flex items-center rounded-lg bg-[#e7007e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#c8006c] focus:outline-none focus:ring-2 focus:ring-[#e7007e]/50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                :disabled="saving"
              >
                {{ saving ? 'Saving\u2026' : 'Save changes' }}
              </button>
            </div>
          </form>
        </div>
      </Transition>

      <!-- WEBINAR RESOURCES (if any) -->
      <div v-if="showResources" class="rounded-2xl border border-white/10 bg-[#14192d] text-white shadow-[0_18px_40px_rgba(15,20,40,0.2)]">
        <div class="border-b border-white/10 px-5 py-4">
          <div class="text-sm font-semibold">Webinar resources</div>
        </div>
        <div class="p-5 space-y-4">
          <div v-if="event.webinarSlides && event.webinarSlides.length">
            <div class="text-xs font-semibold uppercase tracking-wide text-white/40 mb-2">Slides</div>
            <ul class="space-y-1.5">
              <li v-for="slide in event.webinarSlides" :key="slide.url">
                <a :href="slide.url" target="_blank" rel="noopener noreferrer" class="text-sm text-[#e7007e] hover:underline">
                  {{ slide.label || 'Download slides' }}
                </a>
              </li>
            </ul>
          </div>
          <div v-if="event.webinarRecordingUrl">
            <div class="text-xs font-semibold uppercase tracking-wide text-white/40 mb-2">Recording</div>
            <div v-if="youtubeEmbedUrl" class="aspect-video overflow-hidden rounded-xl border border-white/10">
              <iframe
                :src="youtubeEmbedUrl"
                title="Webinar recording"
                class="h-full w-full"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen
              />
            </div>
            <a v-else :href="event.webinarRecordingUrl" target="_blank" rel="noopener noreferrer" class="text-sm text-[#e7007e] hover:underline">
              Watch recording
            </a>
          </div>
        </div>
      </div>

      <!-- EMAIL PERFORMANCE (only if data exists) -->
      <div v-if="hasEmailStats" class="rounded-2xl border border-white/10 bg-[#14192d] text-white shadow-[0_18px_40px_rgba(15,20,40,0.2)]">
        <div class="border-b border-white/10 px-5 py-4">
          <div class="text-sm font-semibold">Email performance</div>
        </div>
        <div class="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
          <div class="rounded-xl border border-white/10 bg-white/5 p-4">
            <div class="text-xs font-semibold uppercase tracking-wide text-white/50">Sent</div>
            <div class="mt-2 text-2xl font-semibold text-white">{{ emailStats.sent ?? '\u2014' }}</div>
          </div>
          <div class="rounded-xl border border-white/10 bg-white/5 p-4">
            <div class="text-xs font-semibold uppercase tracking-wide text-white/50">Delivered</div>
            <div class="mt-2 text-2xl font-semibold text-white">{{ emailStats.delivered ?? '\u2014' }}</div>
          </div>
          <div class="rounded-xl border border-white/10 bg-white/5 p-4">
            <div class="text-xs font-semibold uppercase tracking-wide text-white/50">Bounced</div>
            <div class="mt-2 text-2xl font-semibold text-white">{{ emailStats.bounced ?? '\u2014' }}</div>
          </div>
          <div class="rounded-xl border border-white/10 bg-white/5 p-4">
            <div class="text-xs font-semibold uppercase tracking-wide text-white/50">CTR</div>
            <div class="mt-2 text-2xl font-semibold text-white">{{ emailStats.ctr != null ? emailStats.ctr + '%' : '\u2014' }}</div>
          </div>
        </div>
      </div>

      <!-- REGISTRATIONS TABLE -->
      <div class="rounded-2xl border border-white/10 bg-[#14192d] text-white shadow-[0_18px_40px_rgba(15,20,40,0.2)]">
        <button
          type="button"
          class="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-white/5"
          :class="regsOpen ? 'border-b border-white/10' : 'rounded-2xl'"
          @click="regsOpen = !regsOpen"
        >
          <div>
            <div class="text-sm font-semibold">Registrations</div>
            <div class="text-xs text-white/50">Update attendance to track attendees and no-shows.</div>
          </div>
          <div class="flex items-center gap-3">
            <span class="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-white/50">
              {{ registrations.length }}
            </span>
            <svg
              class="h-4 w-4 text-white/40 transition-transform"
              :class="regsOpen ? 'rotate-180' : ''"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        <div v-if="regsOpen" class="overflow-x-auto">
          <table class="w-full text-left text-sm text-white/70">
            <thead class="bg-white/5 text-xs uppercase tracking-wide text-white/50">
              <tr>
                <th class="px-4 py-3 font-semibold">Name</th>
                <th class="px-4 py-3 font-semibold">Email</th>
                <th class="px-4 py-3 font-semibold">Type</th>
                <th class="px-4 py-3 font-semibold">Status</th>
                <th class="px-4 py-3 font-semibold">Attendance</th>
                <th class="px-4 py-3 font-semibold">Registered</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="registrationsLoading">
                <td colspan="6" class="px-4 py-5 text-sm text-white/40">Loading registrations\u2026</td>
              </tr>
              <tr v-else-if="registrations.length === 0">
                <td colspan="6" class="px-4 py-10 text-center">
                  <div class="flex flex-col items-center gap-2 text-white/30">
                    <svg class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                    </svg>
                    <span class="text-sm">No registrations yet.</span>
                  </div>
                </td>
              </tr>
              <tr
                v-else
                v-for="reg in registrations"
                :key="reg.id"
                class="border-t border-white/10 hover:bg-white/5 transition"
              >
                <td class="px-4 py-3 font-medium text-white">{{ reg.name }}</td>
                <td class="px-4 py-3">{{ reg.email }}</td>
                <td class="px-4 py-3 capitalize">{{ reg.attendeeType }}</td>
                <td class="px-4 py-3 capitalize">{{ reg.status.replace('_', ' ') }}</td>
                <td class="px-4 py-3">
                  <select
                    class="rounded-lg border border-white/10 bg-[#1a2035] px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#e7007e]/50 disabled:opacity-50"
                    :value="reg.attendanceStatus ?? ''"
                    :disabled="attendanceUpdating[reg.id]"
                    @change="onAttendanceChange(reg, $event)"
                  >
                    <option value="">Not set</option>
                    <option value="attended">Attended</option>
                    <option value="no_show">No show</option>
                  </select>
                </td>
                <td class="px-4 py-3 text-white/50">{{ reg.createdAt }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </template>

    <!-- SLIDES QUICK-EDIT MODAL -->
    <Teleport to="body">
      <Transition enter-active-class="transition duration-150 ease-out" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition duration-100 ease-in" leave-from-class="opacity-100" leave-to-class="opacity-0">
        <div v-if="slidesModal" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="slidesModal = false">
          <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="slidesModal = false" />
          <div class="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#14192d] text-white shadow-2xl">
            <div class="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <div class="text-sm font-semibold">Upload slides</div>
                <div class="text-xs text-white/50">One URL per line, or comma-separated.</div>
              </div>
              <button type="button" class="rounded-lg p-1 text-white/40 hover:text-white/70 transition" @click="slidesModal = false">
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div class="p-5 space-y-4">
              <textarea
                v-model="slidesValue"
                rows="5"
                placeholder="https://docs.google.com/presentation/d/..."
                class="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#e7007e]/50 resize-none"
              />
              <div v-if="slidesError" class="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">{{ slidesError }}</div>
              <div class="flex justify-end gap-3">
                <button type="button" class="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/10 transition" @click="slidesModal = false">Cancel</button>
                <button type="button" class="inline-flex items-center rounded-lg bg-[#e7007e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#c8006c] transition disabled:opacity-50 disabled:cursor-not-allowed" :disabled="slidesSaving" @click="saveSlidesModal">
                  {{ slidesSaving ? 'Saving\u2026' : 'Save slides' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- RECORDING QUICK-EDIT MODAL -->
    <Teleport to="body">
      <Transition enter-active-class="transition duration-150 ease-out" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition duration-100 ease-in" leave-from-class="opacity-100" leave-to-class="opacity-0">
        <div v-if="recordingModal" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="recordingModal = false">
          <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="recordingModal = false" />
          <div class="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#14192d] text-white shadow-2xl">
            <div class="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <div class="text-sm font-semibold">Add recording</div>
                <div class="text-xs text-white/50">Paste the YouTube video URL.</div>
              </div>
              <button type="button" class="rounded-lg p-1 text-white/40 hover:text-white/70 transition" @click="recordingModal = false">
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div class="p-5 space-y-4">
              <input
                v-model="recordingValue"
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                class="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#e7007e]/50"
              />
              <div v-if="recordingError" class="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">{{ recordingError }}</div>
              <div class="flex justify-end gap-3">
                <button type="button" class="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/10 transition" @click="recordingModal = false">Cancel</button>
                <button type="button" class="inline-flex items-center rounded-lg bg-[#e7007e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#c8006c] transition disabled:opacity-50 disabled:cursor-not-allowed" :disabled="recordingSaving" @click="saveRecordingModal">
                  {{ recordingSaving ? 'Saving\u2026' : 'Save recording' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- BLOG POST QUICK-EDIT MODAL -->
    <Teleport to="body">
      <Transition enter-active-class="transition duration-150 ease-out" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition duration-100 ease-in" leave-from-class="opacity-100" leave-to-class="opacity-0">
        <div v-if="blogModal" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="blogModal = false">
          <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="blogModal = false" />
          <div class="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#14192d] text-white shadow-2xl">
            <div class="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <div class="text-sm font-semibold">Add blog post</div>
                <div class="text-xs text-white/50">Link the webinar summary article.</div>
              </div>
              <button type="button" class="rounded-lg p-1 text-white/40 hover:text-white/70 transition" @click="blogModal = false">
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div class="p-5 space-y-4">
              <input
                v-model="blogValue"
                type="url"
                placeholder="https://yoursite.com/blog/webinar-summary"
                class="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#e7007e]/50"
              />
              <div v-if="blogError" class="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">{{ blogError }}</div>
              <div class="flex justify-end gap-3">
                <button type="button" class="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/10 transition" @click="blogModal = false">Cancel</button>
                <button type="button" class="inline-flex items-center rounded-lg bg-[#e7007e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#c8006c] transition disabled:opacity-50 disabled:cursor-not-allowed" :disabled="blogSaving" @click="saveBlogModal">
                  {{ blogSaving ? 'Saving\u2026' : 'Save blog post' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- SEND INVITES MODAL -->
    <Teleport to="body">
      <Transition enter-active-class="transition duration-150 ease-out" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition duration-100 ease-in" leave-from-class="opacity-100" leave-to-class="opacity-0">
        <div v-if="inviteModal" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="inviteModal = false">
          <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="inviteModal = false" />
          <div class="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#14192d] text-white shadow-2xl">
            <div class="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <div class="text-sm font-semibold">Send invites</div>
                <div class="text-xs text-white/50">Choose a HubSpot contact list to send a promotional email to.</div>
              </div>
              <button type="button" class="rounded-lg p-1 text-white/40 hover:text-white/70 transition" @click="inviteModal = false">
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div class="p-5 space-y-4">
              <!-- Success state -->
              <div v-if="inviteResult" class="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
                <div class="text-2xl mb-1">✉️</div>
                <div class="text-sm font-semibold text-emerald-300">{{ inviteResult.queued }} invite{{ inviteResult.queued === 1 ? '' : 's' }} queued</div>
                <div class="text-xs text-emerald-300/70 mt-1">Emails will be sent in the next processing cycle.</div>
                <button type="button" class="mt-4 inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/10 transition" @click="inviteModal = false">Close</button>
              </div>

              <!-- Loading state -->
              <div v-else-if="inviteListsLoading" class="py-6 text-center text-white/40 text-sm">
                Loading contact lists&hellip;
              </div>

              <!-- Error state -->
              <div v-else-if="inviteListsError" class="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                {{ inviteListsError }}
              </div>

              <!-- List selection -->
              <template v-else>
                <div v-if="inviteLists.length === 0" class="py-4 text-center text-white/40 text-sm">
                  No contact lists found in HubSpot.
                </div>
                <div v-else class="max-h-72 overflow-y-auto space-y-2 pr-1">
                  <label
                    v-for="list in inviteLists"
                    :key="list.listId"
                    class="flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition"
                    :class="selectedListId === list.listId
                      ? 'border-pink-500/50 bg-pink-500/10'
                      : 'border-white/10 bg-white/5 hover:bg-white/10'"
                  >
                    <input
                      type="radio"
                      :value="list.listId"
                      v-model="selectedListId"
                      class="accent-[#e7007e]"
                    />
                    <div class="flex-1 min-w-0">
                      <div class="text-sm font-medium text-white truncate">{{ list.name }}</div>
                      <div class="text-xs text-white/40">{{ list.size.toLocaleString() }} contact{{ list.size === 1 ? '' : 's' }} &middot; {{ list.dynamic ? 'dynamic' : 'static' }}</div>
                    </div>
                  </label>
                </div>

                <div v-if="inviteSendError" class="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">{{ inviteSendError }}</div>

                <div class="flex justify-end gap-3 pt-1">
                  <button type="button" class="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/10 transition" @click="inviteModal = false">Cancel</button>
                  <button
                    type="button"
                    class="inline-flex items-center rounded-lg bg-[#e7007e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#c8006c] transition disabled:opacity-50 disabled:cursor-not-allowed"
                    :disabled="!selectedListId || inviteSending"
                    @click="sendInvites"
                  >
                    <svg v-if="inviteSending" class="mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    {{ inviteSending ? 'Sending\u2026' : selectedListId ? `Send to ${(inviteLists.find(l => l.listId === selectedListId)?.size ?? 0).toLocaleString()} contacts` : 'Select a list' }}
                  </button>
                </div>
              </template>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

  </div>
</template>
