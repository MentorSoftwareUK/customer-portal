import sys

SRC = 'apps/portal/src/pages/admin/AdminEventDetailPage.vue'

with open(SRC, 'r') as f:
    content = f.read()

template_start = content.index('\n<template>')
script_part = content[:template_start]

new_template = r"""
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
                  {{ event.dateLabel }} &middot; {{ event.timezoneLabel }}
                </span>
                <span class="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-white/50 capitalize">
                  {{ event.type }}
                </span>
              </div>
              <h1 class="mt-3 text-2xl font-semibold leading-tight">{{ event.title }}</h1>
              <p v-if="event.description" class="mt-2 text-sm text-white/60 leading-relaxed">{{ event.description }}</p>
            </div>

            <!-- Action buttons -->
            <div class="flex flex-wrap items-center gap-2 lg:shrink-0">
              <button
                type="button"
                class="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-white/80 hover:bg-white/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="!event.joinUrl"
                @click="copyToClipboard(event.joinUrl ?? '')"
              >
                Copy join link
              </button>
              <button
                type="button"
                class="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-white/80 hover:bg-white/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="!portalEventUrl"
                @click="copyToClipboard(portalEventUrl)"
              >
                Copy event URL
              </button>
              <button
                type="button"
                class="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-white/80 hover:bg-white/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="registrationsLoading || registrations.length === 0"
                @click="exportRegistrationsCsv"
              >
                Export CSV
              </button>
              <button
                type="button"
                class="inline-flex items-center rounded-lg border border-white/10 px-3 py-1.5 text-sm font-medium transition"
                :class="editOpen ? 'bg-white/15 text-white border-white/20' : 'bg-white/5 text-white/80 hover:bg-white/10'"
                @click="editOpen = !editOpen"
              >
                <svg class="mr-1.5 h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                </svg>
                {{ editOpen ? 'Close edit' : 'Edit' }}
              </button>
              <button
                v-if="(event.status ?? '').toLowerCase() !== 'cancelled'"
                type="button"
                class="inline-flex items-center rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-sm font-medium text-rose-300 hover:bg-rose-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="cancelling"
                @click="onCancelEvent"
              >
                {{ cancelling ? 'Cancelling\u2026' : 'Cancel event' }}
              </button>
            </div>
          </div>

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
              <div class="mt-2 text-2xl font-semibold text-white">{{ event.durationMins ?? '\u2014' }}</div>
              <p class="mt-1 text-xs text-white/40">minutes</p>
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
          <div class="text-xs text-white/50">Track what still needs doing after the event.</div>
        </div>
        <div class="divide-y divide-white/10">
          <div class="flex items-center justify-between px-5 py-3.5">
            <div class="flex items-center gap-3">
              <div
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded border"
                :class="event.webinarSlides?.length ? 'border-emerald-500/50 bg-emerald-500/20' : 'border-white/20 bg-white/5'"
              >
                <svg v-if="event.webinarSlides?.length" class="h-3 w-3 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <span class="text-sm text-white/80">Upload slides</span>
            </div>
            <span
              class="rounded-full border px-2 py-0.5 text-xs font-semibold"
              :class="event.webinarSlides?.length ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'"
            >
              {{ event.webinarSlides?.length ? 'Done' : 'Pending' }}
            </span>
          </div>
          <div class="flex items-center justify-between px-5 py-3.5">
            <div class="flex items-center gap-3">
              <div
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded border"
                :class="event.webinarRecordingUrl ? 'border-emerald-500/50 bg-emerald-500/20' : 'border-white/20 bg-white/5'"
              >
                <svg v-if="event.webinarRecordingUrl" class="h-3 w-3 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <span class="text-sm text-white/80">Add recording</span>
            </div>
            <span
              class="rounded-full border px-2 py-0.5 text-xs font-semibold"
              :class="event.webinarRecordingUrl ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'"
            >
              {{ event.webinarRecordingUrl ? 'Done' : 'Pending' }}
            </span>
          </div>
          <div class="flex items-center justify-between px-5 py-3.5">
            <div class="flex items-center gap-3">
              <div class="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-white/20 bg-white/5" />
              <span class="text-sm text-white/80">Send follow-up email</span>
            </div>
            <span class="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-300">Pending</span>
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
        <div v-if="editOpen" class="rounded-2xl border border-white/10 bg-[#14192d] text-white shadow-[0_18px_40px_rgba(15,20,40,0.2)]">
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
  </div>
</template>
"""

new_content = script_part + new_template

with open(SRC, 'w') as f:
    f.write(new_content)

print(f"Written. Lines: {new_content.count(chr(10))}")
