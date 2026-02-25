<script setup lang="ts">
import { computed, watchEffect, ref } from 'vue'
import { useRoute } from 'vue-router'
import { getEvent, getMyEventRegistration, type EventDto, type EventRegistrationDto } from '../lib/api'

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
  if (event.value.priceForNonCustomers == null) return 'Included with your subscription'
  return `£${event.value.priceForNonCustomers} for non-customers`
})

const durationLabel = computed(() => {
  const mins = event.value?.durationMins ?? 0
  if (mins < 60) return `${mins} min`
  const hours = Math.floor(mins / 60)
  const remainder = mins % 60
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`
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

const typeBadgeClass = computed(() => {
  switch ((event.value?.type ?? '').toLowerCase()) {
    case 'webinar': return 'border-violet-500/40 bg-violet-500/20 text-violet-200'
    case 'lunch & learn': return 'border-indigo-500/40 bg-indigo-500/20 text-indigo-200'
    case 'podcast': return 'border-purple-500/40 bg-purple-500/20 text-purple-200'
    default: return 'border-white/20 bg-white/10 text-white/70'
  }
})
</script>

<template>
  <div class="space-y-6">

    <!-- Error -->
    <div v-if="loadError" class="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
      {{ loadError }}
    </div>

    <!-- Skeleton -->
    <div v-else-if="loading" role="status" class="animate-pulse space-y-5">
      <div class="h-48 rounded-2xl bg-white/5" />
      <div class="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
        <div class="space-y-4">
          <div class="h-40 rounded-2xl bg-white/5" />
          <div class="h-28 rounded-2xl bg-white/5" />
        </div>
        <div class="space-y-4">
          <div class="h-36 rounded-2xl bg-white/5" />
          <div class="h-32 rounded-2xl bg-white/5" />
        </div>
      </div>
      <span class="sr-only">Loading…</span>
    </div>

    <template v-else-if="event">

      <!-- Breadcrumb -->
      <nav class="flex" aria-label="Breadcrumb">
        <ol class="inline-flex items-center gap-1.5 text-sm">
          <li>
            <RouterLink to="/app/events" class="font-medium text-white/50 hover:text-white/80 transition">
              Events
            </RouterLink>
          </li>
          <li class="text-white/25" aria-hidden="true">/</li>
          <li aria-current="page" class="font-medium text-white/70 truncate max-w-[220px] sm:max-w-none">
            {{ event.title }}
          </li>
        </ol>
      </nav>

      <!-- ─── Hero ───────────────────────────────────────────────────────── -->
      <div class="rounded-2xl border border-white/10 bg-[#0f1428] px-6 py-8 text-white shadow-[0_18px_40px_rgba(15,20,40,0.35)] sm:px-8">
        <span
          class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize"
          :class="typeBadgeClass"
        >
          {{ event.type }}
        </span>
        <h1 class="mt-4 text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
          {{ event.title }}
        </h1>
        <p class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/60">
          <span class="font-medium text-white/85">{{ event.dateLabel }}</span>
          <span aria-hidden="true" class="text-white/25">·</span>
          <span>{{ durationLabel }}</span>
          <span aria-hidden="true" class="text-white/25">·</span>
          <span>Hosted by <span class="font-medium text-white/85">{{ event.hostName || 'Mentor team' }}</span></span>
          <template v-if="event.timezoneLabel">
            <span aria-hidden="true" class="text-white/25">·</span>
            <span class="text-white/40">{{ event.timezoneLabel }}</span>
          </template>
        </p>
        <p v-if="event.description" class="mt-4 text-[0.9375rem] leading-relaxed text-white/70">
          {{ event.description }}
        </p>
      </div>

      <!-- ─── Two-column layout ──────────────────────────────────────────── -->
      <div class="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px] lg:items-start">

        <!-- LEFT — Readable content panels -->
        <section class="space-y-4">

          <!-- What we'll cover -->
          <div class="rounded-2xl border border-white/10 bg-white/5 px-6 py-6 text-white">
            <h2 class="text-base font-semibold text-white">What we'll cover</h2>
            <ul class="mt-4 space-y-3">
              <li class="flex items-start gap-3 text-[0.9375rem] leading-relaxed text-white/75">
                <span class="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[#e7007e]" aria-hidden="true" />
                Finding the right information quickly: events, meetings, resources, and support.
              </li>
              <li class="flex items-start gap-3 text-[0.9375rem] leading-relaxed text-white/75">
                <span class="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[#e7007e]" aria-hidden="true" />
                Common workflows for children's homes: logging issues, following up, and keeping a clear record.
              </li>
              <li class="flex items-start gap-3 text-[0.9375rem] leading-relaxed text-white/75">
                <span class="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[#e7007e]" aria-hidden="true" />
                What "good" looks like: simple checks managers and team leaders can use.
              </li>
            </ul>
          </div>

          <!-- Who should attend -->
          <div class="rounded-2xl border border-white/10 bg-white/5 px-6 py-6 text-white">
            <h2 class="text-base font-semibold text-white">Who should attend</h2>
            <p class="mt-4 text-[0.9375rem] leading-relaxed text-white/75">
              This session is suitable for registered managers, deputy managers, team leaders, admins, and anyone who needs to use Mentor as part of their role.
            </p>
          </div>

          <!-- Practical information -->
          <div class="rounded-2xl border border-white/10 bg-white/5 px-6 py-6 text-white">
            <h2 class="text-base font-semibold text-white">Practical information</h2>
            <div class="mt-4 space-y-5">
              <div>
                <h3 class="text-xs font-semibold uppercase tracking-wide text-white/40">What you'll need</h3>
                <p class="mt-2 text-[0.9375rem] leading-relaxed text-white/75">
                  A laptop or desktop with internet access and {{ event.platform }}.
                </p>
              </div>
              <div>
                <h3 class="text-xs font-semibold uppercase tracking-wide text-white/40">Accessibility</h3>
                <p class="mt-2 text-[0.9375rem] leading-relaxed text-white/75">
                  If you need adjustments — captions, materials in advance — let us know when registering.
                </p>
              </div>
            </div>
          </div>

          <!-- Session etiquette -->
          <div class="rounded-2xl border border-white/10 bg-white/5 px-6 py-6 text-white">
            <h2 class="text-base font-semibold text-white">Session etiquette</h2>
            <p class="mt-4 text-[0.9375rem] leading-relaxed text-white/75">
              To keep the session focused and protect the confidentiality of your team, we ask that all attendees join muted. If you have a question, please use the raise hand feature — the host will invite you to unmute at an appropriate moment.
            </p>
            <p class="mt-3 text-[0.9375rem] leading-relaxed text-white/75">
              This helps us maintain the flow of the session and ensures that sensitive information discussed within your home stays private.
            </p>
          </div>

          <!-- Need help? -->
          <div class="rounded-2xl border border-white/10 bg-white/5 px-6 py-6 text-white">
            <h2 class="text-base font-semibold text-white">Need help?</h2>
            <p class="mt-4 text-[0.9375rem] leading-relaxed text-white/75">
              If you're unsure whether this session is right for your team, register anyway and add a note — we'll follow up.
            </p>
            <p class="mt-3 text-sm text-white/50">
              <span class="font-medium text-white/70">Tip:</span> If you can't attend live, we'll share materials and a recording link afterwards when available.
            </p>
          </div>

          <!-- Event resources (post-event) -->
          <div v-if="showResources" class="rounded-2xl border border-white/10 bg-white/5 px-6 py-6 text-white">
            <h2 class="text-base font-semibold text-white">Event resources</h2>

            <div v-if="event.webinarSlides && event.webinarSlides.length" class="mt-4">
              <h3 class="text-xs font-semibold uppercase tracking-wide text-white/40">Slides</h3>
              <ul class="mt-2 space-y-2">
                <li v-for="slide in event.webinarSlides" :key="slide.url">
                  <a
                    :href="slide.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1.5 text-sm font-medium text-[#e7007e] hover:text-[#ff1f9e] transition"
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
              <h3 class="text-xs font-semibold uppercase tracking-wide text-white/40">Recording</h3>
              <div v-if="youtubeEmbedUrl" class="mt-3 aspect-video overflow-hidden rounded-xl border border-white/10">
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
                class="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[#e7007e] hover:text-[#ff1f9e] transition"
              >
                Watch recording →
              </a>
            </div>
          </div>
        </section>

        <!-- RIGHT — Sticky action tray -->
        <aside class="space-y-4 lg:sticky lg:top-6">

          <!-- ── REGISTER (highest prominence) ── -->
          <div class="rounded-2xl border border-white/10 bg-[#0f1428] px-5 py-5 text-white shadow-[0_12px_32px_rgba(15,20,40,0.3)]">

            <!-- Registered state — full confident block -->
            <template v-if="isRegistered">
              <div class="rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-5 py-5 text-center">
                <div class="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/20">
                  <svg class="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <p class="mt-3 text-base font-semibold text-emerald-300">You're registered</p>
                <p class="mt-1 text-sm text-emerald-400/80">We'll send joining details before the session.</p>
              </div>
              <button
                type="button"
                disabled
                class="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/35 cursor-not-allowed"
              >
                Add to calendar (coming soon)
              </button>
            </template>

            <!-- Payment pending -->
            <template v-else-if="isPaymentPending">
              <div class="rounded-xl border border-amber-500/30 bg-amber-500/15 px-4 py-4">
                <div class="flex items-center gap-3">
                  <svg class="h-5 w-5 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <div>
                    <p class="text-sm font-semibold text-amber-300">Payment pending</p>
                    <p class="text-xs text-amber-400/80">Complete payment to confirm your place.</p>
                  </div>
                </div>
              </div>
              <RouterLink
                :to="`/app/events/${event.id}/register`"
                class="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-[#e7007e] px-4 py-3.5 text-base font-semibold text-white shadow hover:bg-[#c8006c] transition focus:outline-none focus:ring-4 focus:ring-[#e7007e]/30"
              >
                Complete payment
              </RouterLink>
            </template>

            <!-- Default — not yet registered -->
            <template v-else>
              <h2 class="text-sm font-semibold text-white/50 uppercase tracking-wide">Register</h2>
              <p class="mt-1 text-xl font-bold text-white">Join this session</p>
              <p class="mt-1 text-sm text-white/50">{{ priceLabel }}</p>
              <RouterLink
                :to="`/app/events/${event.id}/register`"
                class="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-[#e7007e] px-4 py-3.5 text-base font-semibold text-white shadow-[0_4px_20px_rgba(231,0,126,0.35)] hover:bg-[#c8006c] hover:shadow-[0_4px_20px_rgba(231,0,126,0.5)] transition focus:outline-none focus:ring-4 focus:ring-[#e7007e]/30"
              >
                Register now
              </RouterLink>
            </template>
          </div>

          <!-- ── KEY DETAILS ── -->
          <div class="rounded-2xl border border-white/10 bg-white/5 px-5 py-5 text-white">
            <h2 class="text-sm font-semibold uppercase tracking-wide text-white">Key details</h2>
            <dl class="mt-3 space-y-2.5 text-sm">
              <div class="flex items-start justify-between gap-4">
                <dt class="text-white/50">Date &amp; time</dt>
                <dd class="text-right font-medium text-white/90">{{ event.dateLabel }}</dd>
              </div>
              <div class="flex items-start justify-between gap-4">
                <dt class="text-white/50">Duration</dt>
                <dd class="text-right font-medium text-white/90">{{ durationLabel }}</dd>
              </div>
              <div class="flex items-start justify-between gap-4">
                <dt class="text-white/50">Platform</dt>
                <dd class="text-right font-medium text-white/90">{{ event.platform }}</dd>
              </div>
              <div v-if="event.joinUrl" class="flex items-start justify-between gap-4">
                <dt class="text-white/50">Join link</dt>
                <dd class="text-right">
                  <a
                    v-if="isRegistered"
                    :href="event.joinUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="font-medium text-[#e7007e] hover:text-[#ff1f9e] transition"
                  >
                    {{ joinLabel }} →
                  </a>
                  <span v-else class="inline-flex items-center gap-1 text-white/30 text-xs">
                    <svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/></svg>
                    Available after registration
                  </span>
                </dd>
              </div>
              <div v-if="event.provisionLabel" class="flex items-start justify-between gap-4">
                <dt class="text-white/50">Provision</dt>
                <dd class="text-right font-medium text-white/90">{{ event.provisionLabel }}</dd>
              </div>
              <div v-if="event.eligibilityLabel" class="flex items-start justify-between gap-4">
                <dt class="text-white/50">Eligibility</dt>
                <dd class="text-right font-medium text-white/90">{{ event.eligibilityLabel }}</dd>
              </div>
            </dl>
          </div>


        </aside>
      </div>
    </template>
  </div>
</template>
