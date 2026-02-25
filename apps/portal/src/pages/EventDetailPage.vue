<script setup lang="ts">
import { computed, watchEffect, ref } from 'vue'
import { useRoute } from 'vue-router'
import { getEvent, getMyEventRegistration, type EventDto, type EventRegistrationDto } from '../lib/api'
import EventTypeChip from '../components/EventTypeChip.vue'

const route = useRoute()

const eventId = computed(() => String(route.params.id || ''))

const loading = ref(true)
const loadError = ref<string | null>(null)
const event = ref<EventDto | null>(null)

const registration = ref<EventRegistrationDto | null>(null)
const isRegistered = computed(() => {
  if (!registration.value) return false
  return registration.value.status === 'registered' || registration.value.status === 'paid'
})
const isPaymentPending = computed(() => registration.value?.status === 'payment_pending')
const ctaLabel = computed(() => {
  if (isRegistered.value) return 'Registered'
  if (isPaymentPending.value) return 'Complete payment'
  return 'Register for this session'
})

watchEffect(async () => {
  const id = eventId.value
  if (!id) return

  loading.value = true
  loadError.value = null
  event.value = null
  registration.value = null
  try {
    const [ev, reg] = await Promise.all([getEvent(id), getMyEventRegistration(id)])
    event.value = ev
    registration.value = reg
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load event'
  } finally {
    loading.value = false
  }
})

const priceLabel = computed(() => {
  if (!event.value) return ''
  if (event.value.priceForNonCustomers == null) return 'Included for customers'
  return `£${event.value.priceForNonCustomers} for non-customers`
})

const durationLabel = computed(() => {
  const mins = event.value?.durationMins ?? 0
  if (mins < 60) return `${mins} minutes`
  const hours = Math.floor(mins / 60)
  const remainder = mins % 60
  return remainder ? `${hours} hour ${remainder} minutes` : `${hours} hour`
})

const joinLabel = computed(() => {
  const p = event.value?.platform
  if (p === 'Teams') return 'Join on Teams'
  if (p === 'Riverside') return 'Join on Riverside'
  return 'Join'
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
</script>

<template>
  <div class="space-y-6">

    <!-- Error -->
    <div v-if="loadError" class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      {{ loadError }}
    </div>

    <!-- Skeleton -->
    <div v-else-if="loading" role="status" class="animate-pulse space-y-4">
      <div class="h-5 w-24 rounded-full bg-gray-200" />
      <div class="h-8 w-2/3 rounded-lg bg-gray-200" />
      <div class="h-4 w-1/2 rounded-lg bg-gray-200" />
      <span class="sr-only">Loading…</span>
    </div>

    <template v-else-if="event">
      <!-- Breadcrumb -->
      <nav class="flex" aria-label="Breadcrumb">
        <ol class="inline-flex items-center gap-1.5 text-sm">
          <li>
            <RouterLink to="/app/events" class="font-medium text-gray-500 hover:text-gray-800 transition">
              Events
            </RouterLink>
          </li>
          <li class="text-gray-400" aria-hidden="true">/</li>
          <li aria-current="page" class="font-medium text-gray-800 truncate max-w-[200px] sm:max-w-none">
            {{ event.title }}
          </li>
        </ol>
      </nav>

      <!-- ─── Hero ───────────────────────────────────────────────────────── -->
      <div class="rounded-2xl border border-gray-200 bg-white px-6 py-8 shadow-sm sm:px-8">
        <EventTypeChip :type="event.type" />
        <h1 class="mt-3 text-3xl font-bold leading-tight tracking-tight text-gray-900 sm:text-4xl">
          {{ event.title }}
        </h1>
        <p class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500">
          <span class="font-medium text-gray-700">{{ event.dateLabel }}</span>
          <span aria-hidden="true" class="text-gray-300">·</span>
          <span>{{ durationLabel }}</span>
          <span aria-hidden="true" class="text-gray-300">·</span>
          <span>Hosted by <span class="font-medium text-gray-700">{{ event.hostName || 'Mentor team' }}</span></span>
          <template v-if="event.timezoneLabel">
            <span aria-hidden="true" class="text-gray-300">·</span>
            <span class="text-gray-400">{{ event.timezoneLabel }}</span>
          </template>
        </p>
        <p v-if="event.description" class="mt-4 text-base leading-relaxed text-gray-600">
          {{ event.description }}
        </p>
      </div>

      <!-- ─── Two-column layout ──────────────────────────────────────────── -->
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px] lg:items-start">

        <!-- LEFT — Content cards -->
        <section class="space-y-5">

          <!-- What we'll cover -->
          <div class="rounded-2xl border border-gray-200 bg-white px-6 py-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">What we'll cover</h2>
            <ul class="mt-4 space-y-3">
              <li class="flex items-start gap-3 text-[0.9375rem] leading-relaxed text-gray-700">
                <span class="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[#e7007e]" aria-hidden="true" />
                Finding the right information quickly: events, meetings, resources, and support.
              </li>
              <li class="flex items-start gap-3 text-[0.9375rem] leading-relaxed text-gray-700">
                <span class="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[#e7007e]" aria-hidden="true" />
                Common workflows for children's homes: logging issues, following up, and keeping a clear record.
              </li>
              <li class="flex items-start gap-3 text-[0.9375rem] leading-relaxed text-gray-700">
                <span class="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[#e7007e]" aria-hidden="true" />
                What "good" looks like: simple checks managers and team leaders can use.
              </li>
            </ul>
          </div>

          <!-- Who should attend -->
          <div class="rounded-2xl border border-gray-200 bg-white px-6 py-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Who should attend</h2>
            <p class="mt-4 text-[0.9375rem] leading-relaxed text-gray-700">
              This session is suitable for registered managers, deputy managers, team leaders, admins, and anyone who needs to use Mentor as part of their role.
            </p>
          </div>

          <!-- Practical information -->
          <div class="rounded-2xl border border-gray-200 bg-white px-6 py-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Practical information</h2>
            <div class="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-400">What you'll need</h3>
                <p class="mt-2 text-[0.9375rem] leading-relaxed text-gray-700">
                  A laptop or desktop with internet access and {{ event.platform }}.
                </p>
              </div>
              <div>
                <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-400">Accessibility</h3>
                <p class="mt-2 text-[0.9375rem] leading-relaxed text-gray-700">
                  If you need adjustments — captions, materials in advance — let us know when registering.
                </p>
              </div>
            </div>
          </div>

          <!-- Event resources (post-event) -->
          <div v-if="showResources" class="rounded-2xl border border-gray-200 bg-white px-6 py-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Event resources</h2>

            <div v-if="event.webinarSlides && event.webinarSlides.length" class="mt-4">
              <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-400">Slides</h3>
              <ul class="mt-2 space-y-2">
                <li v-for="slide in event.webinarSlides" :key="slide.url">
                  <a
                    :href="slide.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1.5 text-sm font-medium text-[#e7007e] hover:underline"
                  >
                    <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {{ slide.label || 'Download slides' }}
                  </a>
                </li>
              </ul>
            </div>

            <div v-if="event.webinarRecordingUrl" class="mt-5">
              <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-400">Recording</h3>
              <div v-if="youtubeEmbedUrl" class="mt-3 aspect-video overflow-hidden rounded-xl border border-gray-200">
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
                class="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[#e7007e] hover:underline"
              >
                Watch recording →
              </a>
            </div>
          </div>
        </section>

        <!-- RIGHT — Sticky action tray -->
        <aside class="space-y-4 lg:sticky lg:top-6">

          <!-- ── Register card ── -->
          <div class="rounded-2xl border border-gray-200 bg-white px-5 py-5 shadow-sm">

            <!-- Registered state -->
            <template v-if="isRegistered">
              <div class="flex items-center gap-3 rounded-xl bg-green-50 px-4 py-3.5">
                <svg class="h-5 w-5 shrink-0 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p class="text-sm font-semibold text-green-800">You're registered</p>
                  <p class="text-xs text-green-700">We'll send details before the session.</p>
                </div>
              </div>
              <button
                type="button"
                disabled
                class="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-400"
              >
                Add to calendar (coming soon)
              </button>
            </template>

            <!-- Payment pending -->
            <template v-else-if="isPaymentPending">
              <div class="flex items-center gap-3 rounded-xl bg-amber-50 px-4 py-3.5">
                <svg class="h-5 w-5 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <div>
                  <p class="text-sm font-semibold text-amber-800">Payment pending</p>
                  <p class="text-xs text-amber-700">Complete payment to confirm your place.</p>
                </div>
              </div>
              <RouterLink
                :to="`/app/events/${event.id}/register`"
                class="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-[#e7007e] px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-[#c8006c] transition focus:outline-none focus:ring-4 focus:ring-pink-300"
              >
                Complete payment
              </RouterLink>
            </template>

            <!-- Default: not yet registered -->
            <template v-else>
              <h2 class="text-base font-semibold text-gray-900">Register for this session</h2>
              <p class="mt-1 text-sm text-gray-500">{{ priceLabel }}</p>
              <RouterLink
                :to="`/app/events/${event.id}/register`"
                class="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-[#e7007e] px-4 py-3.5 text-base font-semibold text-white shadow hover:bg-[#c8006c] transition focus:outline-none focus:ring-4 focus:ring-pink-300"
              >
                Register now
              </RouterLink>
            </template>
          </div>

          <!-- ── Key details ── -->
          <div class="rounded-2xl border border-gray-200 bg-white px-5 py-5 shadow-sm">
            <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-400">Key details</h2>
            <dl class="mt-3 space-y-2.5 text-sm">
              <div class="flex items-start justify-between gap-4">
                <dt class="text-gray-500">Date &amp; time</dt>
                <dd class="text-right font-medium text-gray-900">{{ event.dateLabel }}</dd>
              </div>
              <div class="flex items-start justify-between gap-4">
                <dt class="text-gray-500">Duration</dt>
                <dd class="text-right font-medium text-gray-900">{{ durationLabel }}</dd>
              </div>
              <div class="flex items-start justify-between gap-4">
                <dt class="text-gray-500">Platform</dt>
                <dd class="text-right font-medium text-gray-900">{{ event.platform }}</dd>
              </div>
              <div v-if="event.joinUrl" class="flex items-start justify-between gap-4">
                <dt class="text-gray-500">Join link</dt>
                <dd class="text-right">
                  <a
                    :href="event.joinUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="font-medium text-[#e7007e] hover:underline"
                  >
                    {{ joinLabel }} →
                  </a>
                </dd>
              </div>
              <div v-if="event.provisionLabel" class="flex items-start justify-between gap-4">
                <dt class="text-gray-500">Provision</dt>
                <dd class="text-right font-medium text-gray-900">{{ event.provisionLabel }}</dd>
              </div>
              <div v-if="event.eligibilityLabel" class="flex items-start justify-between gap-4">
                <dt class="text-gray-500">Eligibility</dt>
                <dd class="text-right font-medium text-gray-900">{{ event.eligibilityLabel }}</dd>
              </div>
            </dl>
          </div>

          <!-- ── Need help? ── -->
          <div class="rounded-2xl border border-gray-100 bg-gray-50 px-5 py-4">
            <h2 class="text-sm font-semibold text-gray-600">Need help?</h2>
            <p class="mt-2 text-sm leading-relaxed text-gray-500">
              If you're unsure whether this session is right for your team, register anyway and add a note — we'll follow up.
            </p>
            <p class="mt-2 text-xs text-gray-400">
              <span class="font-medium text-gray-500">Tip:</span> If you can't attend live, we'll share materials afterwards when available.
            </p>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>
