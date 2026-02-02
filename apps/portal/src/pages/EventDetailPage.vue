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
  <div class="space-y-5">
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
      <nav class="flex" aria-label="Breadcrumb">
        <ol class="inline-flex items-center space-x-1 md:space-x-2 rtl:space-x-reverse text-sm">
          <li class="inline-flex items-center">
            <RouterLink
              to="/app/events"
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

      <header class="space-y-4">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-3">
            <EventTypeChip :type="event.type" />
          </div>

          <h1 class="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{{ event.title }}</h1>
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">{{ event.description }}</p>
        </div>

        <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div class="ui-surface bg-brand-primary p-4">
            <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/60">
              <svg class="h-4 w-4 text-white/60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M8 7h8M8 11h5M7 3v2M17 3v2M6 5h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              Event
            </div>
            <div class="mt-1 text-sm font-semibold text-white">{{ event.title }}</div>
          </div>
          <div class="ui-surface bg-brand-primary p-4">
            <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/60">
              <svg class="h-4 w-4 text-white/60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M12 6v6l4 2M12 22a10 10 0 100-20 10 10 0 000 20z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              Date & time
            </div>
            <div class="mt-1 text-sm font-semibold text-white">{{ event.dateLabel }}</div>
            <div class="text-xs text-white/60">{{ event.timezoneLabel }}</div>
          </div>
          <div class="ui-surface bg-brand-primary p-4">
            <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/60">
              <svg class="h-4 w-4 text-white/60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M12 12a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" stroke-width="1.5" />
                <path d="M4 20a8 8 0 0116 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
              Host
            </div>
            <div class="mt-1 text-sm font-semibold text-white">{{ event.hostName || 'Mentor team' }}</div>
          </div>
          <div class="ui-surface bg-brand-primary p-4">
            <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/60">
              <svg class="h-4 w-4 text-white/60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M4 5h16v10H4z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
                <path d="M8 19h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
              Platform
            </div>
            <div class="mt-1 text-sm font-semibold text-white">{{ event.platform }}</div>
          </div>
        </div>
      </header>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section class="lg:col-span-2 space-y-4">
          <div class="ui-surface bg-brand-primary p-5">
            <h2 class="text-base font-semibold text-gray-900 dark:text-white">What we’ll cover</h2>
            <ul class="mt-3 space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <li>Finding the right information quickly: events, meetings, resources, and support.</li>
              <li>Common workflows for children’s homes: logging issues, following up, and keeping a clear record.</li>
              <li>What “good” looks like: simple checks managers and team leaders can use.</li>
            </ul>
          </div>

          <div class="ui-surface bg-brand-primary p-5">
            <h2 class="text-base font-semibold text-gray-900 dark:text-white">Who should attend</h2>
            <p class="mt-3 text-sm text-gray-700 dark:text-gray-300">
              This session is suitable for registered managers, deputy managers, team leaders, admins, and anyone who needs to use Mentor as part of their role.
            </p>
          </div>

          <div class="ui-surface bg-brand-primary p-5">
            <h2 class="text-base font-semibold text-gray-900 dark:text-white">Practical information</h2>
            <dl class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <dt class="text-xs font-medium text-gray-500 dark:text-gray-400">What you’ll need</dt>
                <dd class="mt-1 text-sm text-gray-700 dark:text-gray-300">A laptop/desktop with internet and access to {{ event.platform }}.</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-gray-500 dark:text-gray-400">Accessibility</dt>
                <dd class="mt-1 text-sm text-gray-700 dark:text-gray-300">If you need adjustments (captions, materials in advance), tell us when registering.</dd>
              </div>
            </dl>
          </div>

          <div v-if="showResources" class="ui-surface bg-brand-primary p-5">
            <h2 class="text-base font-semibold text-gray-900 dark:text-white">Webinar resources</h2>

            <div v-if="event.webinarSlides && event.webinarSlides.length" class="mt-3">
              <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Slides</h3>
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
              <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Recording</h3>
              <div v-if="youtubeEmbedUrl" class="mt-2 aspect-video overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
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
          <div class="ui-surface bg-brand-primary p-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="text-base font-semibold text-gray-900 dark:text-white">Register</h2>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ priceLabel }}</p>
              </div>
              <span
                v-if="isRegistered"
                class="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-200"
              >
                Registered
              </span>
              <span
                v-else-if="isPaymentPending"
                class="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/30 dark:text-amber-200"
              >
                Payment pending
              </span>
            </div>
            <div class="mt-5 space-y-2">
              <RouterLink
                v-if="!isRegistered"
                :to="`/app/events/${event.id}/register`"
                class="inline-flex w-full items-center justify-center rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-4 focus:ring-primary-300 dark:focus:ring-primary-800"
              >
                {{ ctaLabel }}
              </RouterLink>

              <button
                v-if="isRegistered"
                type="button"
                disabled
                class="inline-flex w-full items-center justify-center rounded-lg border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-medium text-white/60"
              >
                Add to calendar (coming soon)
              </button>
            </div>
          </div>

          <div class="ui-surface bg-brand-primary p-5">
            <h2 class="text-base font-semibold text-gray-900 dark:text-white">Key details</h2>
            <dl class="mt-4 space-y-3 text-sm">
              <div class="flex items-start justify-between gap-3">
                <dt class="text-gray-500 dark:text-gray-400">Date & time</dt>
                <dd class="font-medium text-gray-900 dark:text-white text-right">{{ event.dateLabel }} ({{ event.timezoneLabel }})</dd>
              </div>
              <div class="flex items-start justify-between gap-3">
                <dt class="text-gray-500 dark:text-gray-400">Duration</dt>
                <dd class="font-medium text-gray-900 dark:text-white text-right">{{ durationLabel }}</dd>
              </div>
              <div class="flex items-start justify-between gap-3">
                <dt class="text-gray-500 dark:text-gray-400">Platform</dt>
                <dd class="font-medium text-gray-900 dark:text-white text-right">{{ event.platform }}</dd>
              </div>
              <div v-if="event.joinUrl" class="flex items-start justify-between gap-3">
                <dt class="text-gray-500 dark:text-gray-400">Join link</dt>
                <dd class="text-right">
                  <a
                    :href="event.joinUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center justify-center rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-4 focus:ring-primary-300 dark:focus:ring-primary-800"
                  >
                    {{ joinLabel }}
                  </a>
                </dd>
              </div>
              <div class="flex items-start justify-between gap-3">
                <dt class="text-gray-500 dark:text-gray-400">Provision type</dt>
                <dd class="font-medium text-gray-900 dark:text-white text-right">{{ event.provisionLabel }}</dd>
              </div>
              <div class="flex items-start justify-between gap-3">
                <dt class="text-gray-500 dark:text-gray-400">Eligibility</dt>
                <dd class="font-medium text-gray-900 dark:text-white text-right">{{ event.eligibilityLabel }}</dd>
              </div>
            </dl>

          </div>

          <div class="ui-surface bg-brand-primary p-5">
            <h2 class="text-base font-semibold text-gray-900 dark:text-white">Need help?</h2>
            <p class="mt-3 text-sm text-gray-700 dark:text-gray-300">
              If you’re unsure whether this session is right for your team, register anyway and add a note — we’ll follow up.
            </p>
            <div class="mt-3 text-sm text-gray-700 dark:text-gray-300">
              <span class="font-medium">Tip:</span> If you can’t attend live, we’ll share materials afterwards when available.
            </div>
          </div>
        </aside>
      </div>
      </template>
  </div>
</template>
