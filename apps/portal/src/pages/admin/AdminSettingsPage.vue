<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getAdminSettings, patchAdminSettings, type AdminSettings, getHubSpotOAuthStatus, initiateHubSpotOAuth, disconnectHubSpotOAuth, type HubSpotOAuthStatus } from '../../lib/api'
import { loadFeatureFlags } from '../../lib/featureFlags'

const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)
const errorTitle = ref<string | null>(null)
const errorAction = ref<'load' | 'save' | null>(null)
const saved = ref(false)

const sections = [
  { id: 'general', label: 'General', description: 'Branding, support details, and status URL' },
  { id: 'features', label: 'Feature toggles', description: 'Control which modules are available' },
  { id: 'communications', label: 'Communications', description: 'Email identities and routing' },
  { id: 'events', label: 'Events defaults', description: 'Scheduling defaults for new events' },
  { id: 'auth', label: 'Auth & onboarding', description: 'Login, password rules, and OAuth' },
  { id: 'integrations', label: 'Integrations', description: 'HubSpot, Stripe, QuickBooks, storage' },
  { id: 'content', label: 'Content gating', description: 'Default access by provision type' },
  { id: 'emails', label: 'Event emails', description: 'Confirmation, reminders, thank-you cadence' },
  { id: 'system', label: 'System safety', description: 'Maintenance mode, demo data, rate limits' },
] as const

const activeSection = ref<(typeof sections)[number]['id']>('general')
const observer = ref<IntersectionObserver | null>(null)

const system = ref<{ smtpConfigured: boolean; emailJobsEnabled: boolean } | null>(null)
const settings = ref<AdminSettings | null>(null)
const hubspotOAuthStatus = ref<HubSpotOAuthStatus | null>(null)
const hubspotOAuthLoading = ref(false)
const hubspotConnectedBanner = ref(false)

const lastSavedSnapshot = ref<string>('')

const canSave = computed(() => !loading.value && !saving.value && !!settings.value && hasUnsavedChanges.value)
const hasUnsavedChanges = computed(() => {
  if (!settings.value) return false
  return JSON.stringify(settings.value) !== lastSavedSnapshot.value
})

async function load() {
  loading.value = true
  error.value = null
  errorTitle.value = null
  errorAction.value = null
  saved.value = false
  try {
    const res = await getAdminSettings()
    settings.value = res.settings
    system.value = res.system
    lastSavedSnapshot.value = JSON.stringify(res.settings)
    await loadHubSpotOAuthStatus()
  } catch (e: any) {
    const detail = e?.message ? String(e.message) : ''
    errorTitle.value = "We couldn't load your settings"
    errorAction.value = 'load'
    error.value = detail || 'Please check your connection and try again.'
  } finally {
    loading.value = false
  }
}

async function loadHubSpotOAuthStatus() {
  try {
    hubspotOAuthStatus.value = await getHubSpotOAuthStatus()
  } catch (e) {
    console.error('Failed to load HubSpot OAuth status:', e)
  }
}

async function connectHubSpot() {
  hubspotOAuthLoading.value = true
  try {
    initiateHubSpotOAuth()
  } catch (e: any) {
    error.value = e?.message ? String(e.message) : 'Failed to initiate OAuth'
    hubspotOAuthLoading.value = false
  }
}

async function disconnectHubSpot() {
  if (!confirm('Disconnect HubSpot OAuth? Knowledge Base API will stop working.')) return
  hubspotOAuthLoading.value = true
  try {
    await disconnectHubSpotOAuth()
    await loadHubSpotOAuthStatus()
  } catch (e: any) {
    error.value = e?.message ? String(e.message) : 'Failed to disconnect OAuth'
  } finally {
    hubspotOAuthLoading.value = false
  }
}

function observeSections() {
  observer.value?.disconnect()
  if (!settings.value) return

  observer.value = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (visible?.target?.id) {
        activeSection.value = visible.target.id as (typeof sections)[number]['id']
      }
    },
    { rootMargin: '-30% 0px -50% 0px', threshold: [0.2, 0.4, 0.6] },
  )

  sections.forEach((section) => {
    const el = document.getElementById(section.id)
    if (el) observer.value?.observe(el)
  })
}

async function save() {
  if (!settings.value) return
  saving.value = true
  error.value = null
  errorTitle.value = null
  errorAction.value = null
  saved.value = false
  try {
    const res = await patchAdminSettings({
      general: settings.value.general,
      eventEmails: settings.value.eventEmails,
      features: settings.value.features,
      communications: settings.value.communications,
      events: settings.value.events,
      auth: settings.value.auth,
      integrations: settings.value.integrations,
      contentGating: settings.value.contentGating,
      system: settings.value.system,
    })
    settings.value = res.settings
    lastSavedSnapshot.value = JSON.stringify(res.settings)
    await loadFeatureFlags(true)
    saved.value = true
    setTimeout(() => (saved.value = false), 1500)
  } catch (e: any) {
    const detail = e?.message ? String(e.message) : ''
    errorTitle.value = "We couldn't save your changes"
    errorAction.value = 'save'
    error.value = detail || 'Please try again in a moment.'
  } finally {
    saving.value = false
  }
}

function scrollToSection(id: (typeof sections)[number]['id']) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

watch(
  () => settings.value,
  async (val) => {
    if (!val) return
    await nextTick()
    observeSections()
  },
)

onMounted(async () => {
  const params = new URLSearchParams(window.location.search)
  if (params.get('hubspot_connected') === 'true') {
    hubspotConnectedBanner.value = true
    params.delete('hubspot_connected')
    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`
    window.history.replaceState({}, '', nextUrl)
  }
  await load()
  await nextTick()
  observeSections()
  if (hubspotConnectedBanner.value) {
    await loadHubSpotOAuthStatus()
    setTimeout(() => void loadHubSpotOAuthStatus(), 1000)
  }
})

onBeforeUnmount(() => observer.value?.disconnect())

function toggleFeature(key: keyof AdminSettings['features']) {
  if (!settings.value) return
  settings.value.features[key] = !settings.value.features[key]
  saved.value = false
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-2">
      <p class="text-xs uppercase tracking-[0.08em] text-gray-600">Control center</p>
      <h2 class="text-2xl font-semibold text-gray-900">Admin settings</h2>
      <p class="text-sm text-gray-700">Manage portal configuration, feature flags, and system safety.</p>
    </div>

    <div v-if="error" class="rounded-lg bg-red-50 p-4 text-sm text-red-800">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="text-sm font-semibold text-red-800">{{ errorTitle || 'Something went wrong' }}</p>
          <p class="text-xs text-red-700">{{ error }}</p>
        </div>
        <button
          type="button"
          class="rounded-lg bg-white/80 px-4 py-2 text-sm font-medium text-red-900 hover:bg-white"
          @click="errorAction === 'save' ? save() : load()"
        >
          Try again
        </button>
      </div>
    </div>

    <div v-if="system" class="ui-surface p-4 text-sm text-white/80">
      <div class="flex flex-wrap items-center gap-3">
        <span class="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/80">System</span>
        <span class="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80">SMTP: {{ system.smtpConfigured ? 'configured' : 'not configured' }}</span>
        <span class="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80">Email jobs: {{ system.emailJobsEnabled ? 'enabled' : 'disabled' }}</span>
      </div>
      <p v-if="!system.smtpConfigured" class="mt-2 text-xs text-white/60">
        In development, emails are logged to the API console if SMTP is not configured.
      </p>
    </div>

    <div v-if="hubspotConnectedBanner" class="flex items-start sm:items-center p-4 mb-4 text-sm text-emerald-900 rounded-lg bg-emerald-50" role="alert">
      <svg
        class="w-4 h-4 me-2 shrink-0 mt-0.5 sm:mt-0"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M10 11h2v5m-2 0h4m-2.592-8.5h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
        />
      </svg>
      <p><span class="font-medium me-1">Success!</span> HubSpot connected successfully.</p>
    </div>

    <div v-if="loading" role="status" class="ui-surface-muted animate-pulse p-5">
      <div class="space-y-3">
        <div class="h-3 w-36 rounded-full bg-white/40" />
        <div class="h-2.5 w-72 rounded-full bg-white/25" />
        <div class="h-2.5 w-60 rounded-full bg-white/25" />
      </div>
      <span class="sr-only">Loading...</span>
    </div>

    <div v-else-if="settings" class="grid items-start gap-6 lg:grid-cols-3">
      <aside class="lg:sticky lg:top-24 lg:col-span-1">
        <div class="ui-surface p-4 shadow-md space-y-3">
          <div class="text-xs font-semibold uppercase tracking-[0.08em] text-white/60">Sections</div>
          <div class="space-y-1">
            <button
              v-for="section in sections"
              :key="section.id"
              type="button"
              class="w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-white/10"
              :class="activeSection === section.id ? 'bg-white/15 text-white font-semibold shadow-sm border border-white/10' : 'text-white/80'"
              @click="scrollToSection(section.id)"
            >
              <div>{{ section.label }}</div>
              <div class="text-xs text-white/60">{{ section.description }}</div>
            </button>
          </div>
          <div class="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80">
            <span v-if="saved" class="font-semibold text-emerald-200">Saved</span>
            <span v-else-if="hasUnsavedChanges" class="text-white/60">Unsaved changes</span>
            <span v-else class="text-white/50">All changes saved</span>
            <button
              class="rounded-md bg-white/15 px-3 py-1 text-xs font-semibold text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              :disabled="!canSave"
              @click="save"
            >
              {{ saving ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>
      </aside>

      <div class="space-y-6 lg:col-span-2">
        <section :id="sections[0].id" class="ui-surface p-5 shadow-sm">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h3 class="text-base font-semibold text-white">General</h3>
              <p class="text-xs text-white/70">Brand, support channels, and status page.</p>
            </div>
          </div>
          <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label class="ui-label">Portal name</label>
              <input v-model="settings.general.portalName" class="ui-input mt-1" type="text" />
            </div>
            <div>
              <label class="ui-label">Brand primary color</label>
              <input v-model="settings.general.brandPrimaryColor" class="ui-input mt-1" type="text" placeholder="#14192d" />
            </div>
            <div>
              <label class="ui-label">Support email</label>
              <input v-model="settings.general.supportEmail" class="ui-input mt-1" type="email" />
            </div>
            <div>
              <label class="ui-label">Support URL</label>
              <input v-model="settings.general.supportUrl" class="ui-input mt-1" type="text" />
            </div>
            <div class="md:col-span-2">
              <label class="ui-label">Status page URL</label>
              <input v-model="settings.general.statusPageUrl" class="ui-input mt-1" type="text" />
            </div>
          </div>
        </section>

        <section :id="sections[1].id" class="ui-surface p-5 shadow-sm">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h3 class="text-base font-semibold text-white">Feature toggles</h3>
              <p class="text-xs text-white/70">Turn modules on/off for everyone (admins included).</p>
            </div>
          </div>
          <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div
              class="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              role="switch"
              :aria-checked="settings.features.invoicesEnabled"
            >
              <span>Invoices</span>
              <button
                type="button"
                class="relative inline-flex h-6 w-11 items-center rounded-full transition"
                :class="settings.features.invoicesEnabled ? 'bg-emerald-500/80' : 'bg-white/25'"
                @click="toggleFeature('invoicesEnabled')"
              >
                <span
                  class="inline-block h-5 w-5 transform rounded-full bg-white shadow transition"
                  :class="settings.features.invoicesEnabled ? 'translate-x-5' : 'translate-x-1'"
                />
              </button>
            </div>
            <div
              class="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              role="switch"
              :aria-checked="settings.features.ticketsEnabled"
            >
              <span>Support tickets</span>
              <button
                type="button"
                class="relative inline-flex h-6 w-11 items-center rounded-full transition"
                :class="settings.features.ticketsEnabled ? 'bg-emerald-500/80' : 'bg-white/25'"
                @click="toggleFeature('ticketsEnabled')"
              >
                <span
                  class="inline-block h-5 w-5 transform rounded-full bg-white shadow transition"
                  :class="settings.features.ticketsEnabled ? 'translate-x-5' : 'translate-x-1'"
                />
              </button>
            </div>
            <div
              class="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              role="switch"
              :aria-checked="settings.features.knowledgeBaseEnabled"
            >
              <span>Knowledge base</span>
              <button
                type="button"
                class="relative inline-flex h-6 w-11 items-center rounded-full transition"
                :class="settings.features.knowledgeBaseEnabled ? 'bg-emerald-500/80' : 'bg-white/25'"
                @click="toggleFeature('knowledgeBaseEnabled')"
              >
                <span
                  class="inline-block h-5 w-5 transform rounded-full bg-white shadow transition"
                  :class="settings.features.knowledgeBaseEnabled ? 'translate-x-5' : 'translate-x-1'"
                />
              </button>
            </div>
            <div
              class="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              role="switch"
              :aria-checked="settings.features.documentsEnabled"
            >
              <span>Documents</span>
              <button
                type="button"
                class="relative inline-flex h-6 w-11 items-center rounded-full transition"
                :class="settings.features.documentsEnabled ? 'bg-emerald-500/80' : 'bg-white/25'"
                @click="toggleFeature('documentsEnabled')"
              >
                <span
                  class="inline-block h-5 w-5 transform rounded-full bg-white shadow transition"
                  :class="settings.features.documentsEnabled ? 'translate-x-5' : 'translate-x-1'"
                />
              </button>
            </div>
            <div
              class="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              role="switch"
              :aria-checked="settings.features.videosEnabled"
            >
              <span>Videos</span>
              <button
                type="button"
                class="relative inline-flex h-6 w-11 items-center rounded-full transition"
                :class="settings.features.videosEnabled ? 'bg-emerald-500/80' : 'bg-white/25'"
                @click="toggleFeature('videosEnabled')"
              >
                <span
                  class="inline-block h-5 w-5 transform rounded-full bg-white shadow transition"
                  :class="settings.features.videosEnabled ? 'translate-x-5' : 'translate-x-1'"
                />
              </button>
            </div>
            <div
              class="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              role="switch"
              :aria-checked="settings.features.meetingsEnabled"
            >
              <span>Meetings</span>
              <button
                type="button"
                class="relative inline-flex h-6 w-11 items-center rounded-full transition"
                :class="settings.features.meetingsEnabled ? 'bg-emerald-500/80' : 'bg-white/25'"
                @click="toggleFeature('meetingsEnabled')"
              >
                <span
                  class="inline-block h-5 w-5 transform rounded-full bg-white shadow transition"
                  :class="settings.features.meetingsEnabled ? 'translate-x-5' : 'translate-x-1'"
                />
              </button>
            </div>
            <div
              class="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              role="switch"
              :aria-checked="settings.features.paymentsEnabled"
            >
              <span>Payments</span>
              <button
                type="button"
                class="relative inline-flex h-6 w-11 items-center rounded-full transition"
                :class="settings.features.paymentsEnabled ? 'bg-emerald-500/80' : 'bg-white/25'"
                @click="toggleFeature('paymentsEnabled')"
              >
                <span
                  class="inline-block h-5 w-5 transform rounded-full bg-white shadow transition"
                  :class="settings.features.paymentsEnabled ? 'translate-x-5' : 'translate-x-1'"
                />
              </button>
            </div>
            <div
              class="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              role="switch"
              :aria-checked="settings.features.eventRegistrationsEnabled"
            >
              <span>Event registrations</span>
              <button
                type="button"
                class="relative inline-flex h-6 w-11 items-center rounded-full transition"
                :class="settings.features.eventRegistrationsEnabled ? 'bg-emerald-500/80' : 'bg-white/25'"
                @click="toggleFeature('eventRegistrationsEnabled')"
              >
                <span
                  class="inline-block h-5 w-5 transform rounded-full bg-white shadow transition"
                  :class="settings.features.eventRegistrationsEnabled ? 'translate-x-5' : 'translate-x-1'"
                />
              </button>
            </div>
          </div>
        </section>

        <section :id="sections[2].id" class="ui-surface p-5 shadow-sm">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h3 class="text-base font-semibold text-white">Communications</h3>
              <p class="text-xs text-white/70">Email identities and routing.</p>
            </div>
          </div>
          <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label class="ui-label">From name</label>
              <input v-model="settings.communications.emailFromName" class="ui-input mt-1" type="text" />
            </div>
            <div>
              <label class="ui-label">From address</label>
              <input v-model="settings.communications.emailFromAddress" class="ui-input mt-1" type="email" />
            </div>
            <div>
              <label class="ui-label">Reply-to</label>
              <input v-model="settings.communications.replyToAddress" class="ui-input mt-1" type="email" />
            </div>
            <div>
              <label class="ui-label">Support CC (comma-separated)</label>
              <input v-model="settings.communications.supportCc" class="ui-input mt-1" type="text" />
            </div>
            <div class="md:col-span-2">
              <label class="ui-label">Support BCC (comma-separated)</label>
              <input v-model="settings.communications.supportBcc" class="ui-input mt-1" type="text" />
            </div>
          </div>
        </section>

        <section :id="sections[3].id" class="ui-surface p-5 shadow-sm">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h3 class="text-base font-semibold text-white">Events defaults</h3>
              <p class="text-xs text-white/70">Baseline values for new events.</p>
            </div>
          </div>
          <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label class="ui-label">Default duration (mins)</label>
              <input v-model.number="settings.events.defaultDurationMins" class="ui-input mt-1" type="number" min="15" />
            </div>
            <div>
              <label class="ui-label">Default timezone</label>
              <input v-model="settings.events.defaultTimezone" class="ui-input mt-1" type="text" />
            </div>
            <div>
              <label class="ui-label">Default platform</label>
              <input v-model="settings.events.defaultPlatform" class="ui-input mt-1" type="text" />
            </div>
            <div>
              <label class="ui-label">Join link label</label>
              <input v-model="settings.events.defaultJoinLinkLabel" class="ui-input mt-1" type="text" />
            </div>
            <div>
              <label class="ui-label">Default currency</label>
              <input v-model="settings.events.defaultCurrency" class="ui-input mt-1" type="text" />
            </div>
          </div>
        </section>

        <section :id="sections[4].id" class="ui-surface p-5 shadow-sm">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h3 class="text-base font-semibold text-white">Auth & onboarding</h3>
              <p class="text-xs text-white/70">Login options and password policy.</p>
            </div>
          </div>
          <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <label class="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
              <span>Passwordless login</span>
              <input v-model="settings.auth.allowPasswordless" type="checkbox" class="h-5 w-5" />
            </label>
            <label class="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
              <span>Allow non-customer registration</span>
              <input v-model="settings.auth.allowNonCustomerRegistration" type="checkbox" class="h-5 w-5" />
            </label>
            <div>
              <label class="ui-label">Password minimum length</label>
              <input v-model.number="settings.auth.passwordMinLength" class="ui-input mt-1" type="number" min="6" />
            </div>
            <label class="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
              <span>Google OAuth</span>
              <input v-model="settings.auth.allowOAuthGoogle" type="checkbox" class="h-5 w-5" />
            </label>
            <label class="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
              <span>Microsoft OAuth</span>
              <input v-model="settings.auth.allowOAuthMicrosoft" type="checkbox" class="h-5 w-5" />
            </label>
          </div>
        </section>

        <section :id="sections[5].id" class="ui-surface p-5 shadow-sm">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h3 class="text-base font-semibold text-white">Integrations</h3>
              <p class="text-xs text-white/70">Keep external systems aligned.</p>
            </div>
          </div>
          
          <!-- HubSpot OAuth Connection -->
          <div class="mt-4 rounded-lg border border-white/10 bg-white/5 p-4">
            <div class="flex items-center justify-between">
              <div>
                <h4 class="text-sm font-semibold text-white">HubSpot Knowledge Base</h4>
                <p class="mt-1 text-xs text-white/60">OAuth connection required for Knowledge Base API</p>
              </div>
              <div class="flex items-center gap-2">
                <span v-if="hubspotOAuthStatus?.connected" class="text-xs text-emerald-300">✓ Connected</span>
                <span v-else class="text-xs text-amber-300">Not connected</span>
              </div>
            </div>
            <div class="mt-3 flex items-center gap-3">
              <button
                v-if="!hubspotOAuthStatus?.connected"
                type="button"
                class="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                :disabled="hubspotOAuthLoading"
                @click="connectHubSpot"
              >
                {{ hubspotOAuthLoading ? 'Connecting...' : 'Connect HubSpot' }}
              </button>
              <button
                v-else
                type="button"
                class="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                :disabled="true"
              >
                Connected
              </button>
              <button
                v-if="hubspotOAuthStatus?.connected"
                type="button"
                class="rounded-md border border-white/15 bg-transparent px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 disabled:opacity-50"
                :disabled="hubspotOAuthLoading"
                @click="disconnectHubSpot"
              >
                {{ hubspotOAuthLoading ? 'Disconnecting...' : 'Disconnect' }}
              </button>
              <span v-if="hubspotOAuthStatus?.expiresAt" class="text-xs text-white/50">
                Expires: {{ new Date(hubspotOAuthStatus.expiresAt).toLocaleDateString() }}
              </span>
            </div>
          </div>

          <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label class="ui-label">HubSpot live customer property</label>
              <input v-model="settings.integrations.hubspotLiveCustomerProperty" class="ui-input mt-1" type="text" />
            </div>
            <div>
              <label class="ui-label">HubSpot live customer true values</label>
              <input v-model="settings.integrations.hubspotLiveCustomerTrueValues" class="ui-input mt-1" type="text" placeholder="comma-separated" />
            </div>
            <div>
              <label class="ui-label">HubSpot provision type property</label>
              <input v-model="settings.integrations.hubspotProvisionTypeProperty" class="ui-input mt-1" type="text" />
            </div>
            <div>
              <label class="ui-label">HubSpot product version property</label>
              <input v-model="settings.integrations.hubspotProductVersionProperty" class="ui-input mt-1" type="text" />
            </div>
            <div>
              <label class="ui-label">Stripe success URL</label>
              <input v-model="settings.integrations.stripeSuccessUrl" class="ui-input mt-1" type="text" />
            </div>
            <div>
              <label class="ui-label">Stripe cancel URL</label>
              <input v-model="settings.integrations.stripeCancelUrl" class="ui-input mt-1" type="text" />
            </div>
            <div>
              <label class="ui-label">QuickBooks realm</label>
              <input v-model="settings.integrations.quickbooksRealm" class="ui-input mt-1" type="text" />
            </div>
            <div>
              <label class="ui-label">Storage provider</label>
              <select v-model="settings.integrations.storageProvider" class="ui-input mt-1">
                <option value="s3">AWS S3</option>
                <option value="azure">Azure Blob</option>
                <option value="local">Local</option>
              </select>
            </div>
          </div>
        </section>

        <section :id="sections[6].id" class="ui-surface p-5 shadow-sm">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h3 class="text-base font-semibold text-white">Content gating defaults</h3>
              <p class="text-xs text-white/70">Who can see resources by default.</p>
            </div>
          </div>
          <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label class="ui-label">Knowledge base</label>
              <select v-model="settings.contentGating.knowledgeBaseDefaultProvision" class="ui-input mt-1">
                <option value="all">All</option>
                <option value="supported-accommodation">Supported accommodation</option>
                <option value="childrens-home">Children's home</option>
                <option value="over-18">18+</option>
              </select>
            </div>
            <div>
              <label class="ui-label">Documents</label>
              <select v-model="settings.contentGating.documentsDefaultProvision" class="ui-input mt-1">
                <option value="all">All</option>
                <option value="supported-accommodation">Supported accommodation</option>
                <option value="childrens-home">Children's home</option>
                <option value="over-18">18+</option>
              </select>
            </div>
            <div>
              <label class="ui-label">Videos</label>
              <select v-model="settings.contentGating.videosDefaultProvision" class="ui-input mt-1">
                <option value="all">All</option>
                <option value="supported-accommodation">Supported accommodation</option>
                <option value="childrens-home">Children's home</option>
                <option value="over-18">18+</option>
              </select>
            </div>
          </div>

          <div class="mt-6 border-t border-white/10 pt-6">
            <h4 class="text-sm font-semibold text-white mb-3">Knowledge Base Author</h4>
            <p class="text-xs text-white/70 mb-4">Set the default author displayed on KB articles.</p>
            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label class="ui-label">Author name</label>
                <input v-model="settings.contentGating.knowledgeBaseAuthorName" type="text" class="ui-input mt-1" placeholder="Shaun Ward" />
              </div>
              <div>
                <label class="ui-label">Author team</label>
                <input v-model="settings.contentGating.knowledgeBaseAuthorTeam" type="text" class="ui-input mt-1" placeholder="Training Team" />
              </div>
            </div>
          </div>
        </section>

        <section :id="sections[7].id" class="ui-surface p-5 shadow-sm">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h3 class="text-base font-semibold text-white">Event emails</h3>
              <p class="text-xs text-white/70">Configure confirmation, reminders, and thank-you timing.</p>
            </div>
          </div>
          <div class="mt-4 space-y-4">
            <div class="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
              <div>
                <div class="text-sm font-medium text-white">Master switch</div>
                <div class="text-xs text-white/70">Disable to pause all event emails.</div>
              </div>
              <input v-model="settings.eventEmails.enabled" type="checkbox" class="h-5 w-5" />
            </div>

            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div class="rounded-lg border border-white/10 bg-white/5 p-4">
                <div class="flex items-center justify-between gap-4">
                  <div>
                    <div class="text-sm font-medium text-white">Confirmation</div>
                    <div class="text-xs text-white/70">Sent after registration/payment.</div>
                  </div>
                  <input v-model="settings.eventEmails.confirmationEnabled" type="checkbox" class="h-5 w-5" />
                </div>
              </div>

              <div class="rounded-lg border border-white/10 bg-white/5 p-4">
                <div class="flex items-center justify-between gap-4">
                  <div>
                    <div class="text-sm font-medium text-white">Reminder</div>
                    <div class="text-xs text-white/70">Sent before the event.</div>
                  </div>
                  <input v-model="settings.eventEmails.reminderEnabled" type="checkbox" class="h-5 w-5" />
                </div>
                <div class="mt-3">
                  <label class="text-xs font-medium text-white">Lead time (hours)</label>
                  <input
                    v-model.number="settings.eventEmails.reminderLeadTimeHours"
                    type="number"
                    min="0"
                    class="ui-input mt-1"
                    :disabled="!settings.eventEmails.reminderEnabled"
                  />
                </div>
              </div>

              <div class="rounded-lg border border-white/10 bg-white/5 p-4 md:col-span-2">
                <div class="flex items-center justify-between gap-4">
                  <div>
                    <div class="text-sm font-medium text-white">Thank you</div>
                    <div class="text-xs text-white/70">Sent after the event.</div>
                  </div>
                  <input v-model="settings.eventEmails.thankYouEnabled" type="checkbox" class="h-5 w-5" />
                </div>
                <div class="mt-3">
                  <label class="text-xs font-medium text-white">Delay (hours after event start)</label>
                  <input
                    v-model.number="settings.eventEmails.thankYouDelayHours"
                    type="number"
                    min="0"
                    class="ui-input mt-1"
                    :disabled="!settings.eventEmails.thankYouEnabled"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section :id="sections[8].id" class="ui-surface p-5 shadow-sm">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h3 class="text-base font-semibold text-white">System safety</h3>
              <p class="text-xs text-white/70">Protect the portal during outages or demos.</p>
            </div>
          </div>
          <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <label class="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
              <span>Maintenance mode</span>
              <input v-model="settings.system.maintenanceModeEnabled" type="checkbox" class="h-5 w-5" />
            </label>
            <label class="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
              <span>Demo data enabled</span>
              <input v-model="settings.system.demoDataEnabled" type="checkbox" class="h-5 w-5" />
            </label>
            <div>
              <label class="ui-label">Maintenance message</label>
              <textarea v-model="settings.system.maintenanceMessage" class="ui-input mt-1" rows="3"></textarea>
            </div>
            <div>
              <label class="ui-label">Rate limit (requests/min)</label>
              <input v-model.number="settings.system.rateLimitPerMinute" class="ui-input mt-1" type="number" min="10" />
            </div>
          </div>
          <div class="mt-5 flex items-center justify-end gap-3">
            <div v-if="saved" class="text-sm font-semibold text-emerald-200">Saved</div>
            <button
              class="rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              :disabled="!canSave"
              @click="save"
            >
              {{ saving ? 'Saving…' : 'Save changes' }}
            </button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
