<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { initDropdowns } from 'flowbite'

// @ts-ignore Vue SFC default export is provided by vite/volar
import QuickFindModal from '../components/QuickFindModal.vue'
import { authMe, getProfile, trackPageView, trackSessionEnd, trackSessionStart, type AuthUser, type ProfileDto } from '../lib/api'
import { clearAllTokens, decodeJwtPayload, getAdminAccessToken, getUserAccessToken } from '../lib/auth'
import { useFeatureFlags } from '../lib/featureFlags'

const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac')

const route = useRoute()
const router = useRouter()
const currentPath = computed(() => route.path)
const isMeetingsPage = computed(() => currentPath.value === '/app/meetings' || currentPath.value.startsWith('/app/meetings/'))
const sessionId = ref<string | null>(null)

const user = ref<AuthUser | null>(null)
const userInitial = computed(() => (user.value?.email?.[0] ?? 'M').toUpperCase())

const isAdmin = ref(false)

const onboardingRequired = ref(false)
const onboardingMissing = ref<NonNullable<ProfileDto['onboarding']>['missingFields']>([])
const onboardingCheckInFlight = ref(false)

const { featureFlags, featureFlagsLoaded, loadFeatureFlags } = useFeatureFlags()

onMounted(async () => {
  try {
    const res = await authMe()
    user.value = res.user
  } catch {
    user.value = null
  }

  await loadOnboardingStatus(true)
})

onMounted(async () => {
  // Check admin token first
  const adminToken = getAdminAccessToken()
  const adminPayload = decodeJwtPayload(adminToken ?? '')
  if (adminPayload?.isAdmin === true) {
    isAdmin.value = true
    return
  }

  // Fall back to user token — regular portal login also embeds isAdmin
  // when the email is in the admin allowlist. Calling adminMe() when there
  // is no admin token always 401s and triggers a redirect to /admin/login.
  const userToken = getUserAccessToken()
  const userPayload = decodeJwtPayload(userToken ?? '')
  if (userPayload?.isAdmin === true) {
    isAdmin.value = true
    return
  }

  isAdmin.value = false
})

onMounted(async () => {
  await loadFeatureFlags()
  enforceFeatureGuards(currentPath.value)
})

watch(
  () => route.fullPath,
  (path) => {
    trackPageView(path)
  },
  { immediate: true },
)

onMounted(async () => {
  const id = await trackSessionStart(route.fullPath)
  sessionId.value = id
})

onUnmounted(() => {
  if (sessionId.value) {
    trackSessionEnd(sessionId.value)
  }
})

const isActive = (to: string) => {
  return currentPath.value === to || currentPath.value.startsWith(`${to}/`)
}

const resourcesOpen = ref(false)
const resourcesRoutes = ['/app/knowledge-base', '/app/videos', '/app/documents']

watch(
  () => currentPath.value,
  (path) => {
    if (resourcesRoutes.some((r) => path === r || path.startsWith(`${r}/`))) {
      resourcesOpen.value = true
    }
  },
  { immediate: true },
)

const findOpen = ref(false)
const findSeed = ref('')
type QuickFindItem = {
  label: string
  to: string
  description?: string
  keywords?: string[]
}

const baseFindItems: QuickFindItem[] = [
  { label: 'Dashboard', to: '/app/dashboard', description: 'Your overview and quick actions', keywords: ['home', 'overview'] },
  { label: 'Events', to: '/app/events', description: 'Register and view upcoming sessions', keywords: ['webinar', 'lunch', 'learn', 'podcast'] },
  { label: 'Meetings', to: '/app/meetings', description: 'Upcoming meetings and join links', keywords: ['calendar'] },
  { label: 'Tickets', to: '/app/tickets', description: 'Support requests and updates', keywords: ['help', 'issue', 'support'] },
  { label: 'Knowledge base', to: '/app/knowledge-base', description: 'Guides and how-to articles', keywords: ['kb', 'policy', 'procedure', 'how to'] },
  { label: 'Documents', to: '/app/documents', description: 'Templates and downloadable resources', keywords: ['files', 'templates'] },
  { label: 'Videos', to: '/app/videos', description: 'Training and recordings', keywords: ['training', 'recording'] },
  { label: 'Invoices', to: '/app/invoices', description: 'Billing and payment history', keywords: ['billing'] },
  { label: 'Profile', to: '/app/profile', description: 'Your details and settings', keywords: ['account'] },
]

const availableFindItems = computed(() => {
  return baseFindItems.filter((item) => {
    if (!featureFlags.value.ticketsEnabled && item.to.startsWith('/app/tickets')) return false
    if (!featureFlags.value.invoicesEnabled && item.to.startsWith('/app/invoices')) return false
    return true
  })
})

const quickLinks = computed(() =>
  [
    { label: 'Events', to: '/app/events', enabled: true },
    { label: 'Meetings', to: '/app/meetings', enabled: featureFlags.value.meetingsEnabled },
    { label: 'Knowledge base', to: '/app/knowledge-base', enabled: featureFlags.value.knowledgeBaseEnabled },
    { label: 'Documents', to: '/app/documents', enabled: featureFlags.value.documentsEnabled },
    { label: 'Videos', to: '/app/videos', enabled: featureFlags.value.videosEnabled },
    { label: 'Support tickets', to: '/app/tickets', enabled: featureFlags.value.ticketsEnabled },
    { label: 'Invoices', to: '/app/invoices', enabled: featureFlags.value.invoicesEnabled },
    { label: 'Profile', to: '/app/profile', enabled: true },
  ].filter((link) => link.enabled),
)

function openFind(_e?: Event) {
  findSeed.value = ''
  findOpen.value = true
}

function openFindWithSeed(seed: string) {
  findSeed.value = seed
  findOpen.value = true
}

function onFindBarKeydown(e: KeyboardEvent) {
  const mod = isMac ? e.metaKey : e.ctrlKey
  if (mod) return

  if (e.key.length === 1 && !e.altKey) {
    e.preventDefault()
    openFindWithSeed(e.key)
    return
  }

  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    openFind()
  }
}

watch(
  () => findOpen.value,
  (open) => {
    if (!open) findSeed.value = ''
  },
)

function enforceFeatureGuards(path: string) {
  if (!featureFlagsLoaded.value) return
  if (!featureFlags.value.ticketsEnabled && path.startsWith('/app/tickets')) {
    router.replace('/app/dashboard')
    return
  }
  if (!featureFlags.value.invoicesEnabled && path.startsWith('/app/invoices')) {
    router.replace('/app/dashboard')
  }
}

async function loadOnboardingStatus(force = false) {
  if (onboardingCheckInFlight.value) return
  if (!force && onboardingRequired.value === false && onboardingMissing.value.length === 0) return
  if (currentPath.value && !currentPath.value.startsWith('/app')) return

  onboardingCheckInFlight.value = true
  try {
    const profile = await getProfile()
    const required = profile.onboarding?.required === true
    onboardingRequired.value = required
    onboardingMissing.value = profile.onboarding?.missingFields ?? []
    if (required && currentPath.value !== '/app/onboarding') {
      router.replace('/app/onboarding')
    }
  } catch {
    // Avoid blocking navigation if profile fetch fails; onboarding will retry later.
  } finally {
    onboardingCheckInFlight.value = false
  }
}

function onGlobalKeydown(e: KeyboardEvent) {
  const mod = isMac ? e.metaKey : e.ctrlKey
  if (mod && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    openFind()
  }
}

function handleOnboardingComplete(_event?: Event) {
  onboardingRequired.value = false
  onboardingMissing.value = []
}

function logout() {
  clearAllTokens()
  router.replace('/login')
}

watch(
  () => currentPath.value,
  (path) => {
    enforceFeatureGuards(path)

    if (path.startsWith('/app')) {
      if (path === '/app/onboarding') {
        loadOnboardingStatus(true)
      } else if (onboardingRequired.value) {
        router.replace('/app/onboarding')
      }
    }
  },
)

watch(
  featureFlags,
  () => {
    enforceFeatureGuards(currentPath.value)
  },
  { deep: true },
)

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
  nextTick(() => initDropdowns())
})

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})

onMounted(() => {
  window.addEventListener('onboarding-complete', handleOnboardingComplete)
})

onUnmounted(() => {
  window.removeEventListener('onboarding-complete', handleOnboardingComplete)
})
</script>

<template>
  <div class="antialiased bg-[#e2e2e2] text-gray-900">
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-gray-900 focus:shadow dark:focus:bg-gray-800 dark:focus:text-white"
    >
      Skip to content
    </a>

    <QuickFindModal v-model:open="findOpen" :items="availableFindItems" title="Quick find" :initial-query="findSeed" />

    <nav class="fixed left-0 right-0 top-0 z-50 h-16 border-b border-white/10 bg-[#14192d] px-4 py-0">
      <div class="flex flex-wrap items-center justify-between">
        <div class="flex items-center justify-start">
          <button
            data-drawer-target="drawer-navigation"
            data-drawer-toggle="drawer-navigation"
            aria-controls="drawer-navigation"
            class="mr-2 rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white focus:bg-white/10 focus:ring-2 focus:ring-white/20 md:hidden"
            type="button"
          >
            <svg
              aria-hidden="true"
              class="h-6 w-6"
              fill="currentColor"
              viewBox="0 0 20 20"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fill-rule="evenodd"
                d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                clip-rule="evenodd"
              ></path>
            </svg>
            <svg
              aria-hidden="true"
              class="hidden h-6 w-6"
              fill="currentColor"
              viewBox="0 0 20 20"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fill-rule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clip-rule="evenodd"
              ></path>
            </svg>
            <span class="sr-only">Toggle sidebar</span>
          </button>

          <RouterLink to="/app/dashboard" class="mr-4 flex h-full items-center">
            <img src="/logo.png" alt="Mentor" class="h-12 w-auto rounded object-contain" />
          </RouterLink>
        </div>

        <div class="hidden md:flex md:flex-1 md:justify-center md:px-4">
          <div class="relative w-full md:max-w-md lg:max-w-2xl">
            <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <svg
                class="h-5 w-5 text-white/50"
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fill-rule="evenodd"
                  clip-rule="evenodd"
                  d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                ></path>
              </svg>
            </div>
            <input
              type="search"
              class="block w-full rounded-lg border border-white/10 bg-white/10 p-2.5 pl-10 pr-20 text-left text-sm text-white placeholder:text-white/50 hover:bg-white/15 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Find anything…"
              readonly
              @click="openFind"
              @focus="openFind"
              @keydown="onFindBarKeydown"
            />
            <span class="pointer-events-none absolute inset-y-0 right-3 hidden items-center gap-1 text-xs font-medium text-white/50 lg:inline-flex">
              <span>{{ isMac ? '⌘' : 'Ctrl' }}</span>
              <span>K</span>
            </span>
          </div>
        </div>

        <div class="flex items-center lg:order-2">
          <RouterLink
            to="/admin/events"
            class="mr-2 hidden rounded-lg bg-brand-button px-3 py-2 text-sm font-medium text-white hover:bg-brand-button/90 md:inline-flex"
            v-if="isAdmin"
          >
            Admin
          </RouterLink>

          <button
            type="button"
            data-dropdown-toggle="notification-dropdown"
            class="mr-1 rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white focus:ring-4 focus:ring-white/15"
          >
            <span class="sr-only">View notifications</span>
            <svg
              aria-hidden="true"
              class="h-6 w-6"
              fill="currentColor"
              viewBox="0 0 20 20"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z"
              ></path>
            </svg>
          </button>

          <div
            id="notification-dropdown"
            class="z-50 my-4 hidden w-72 list-none divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-brand-secondary text-base shadow-lg"
          >
            <div class="bg-white/5 px-4 py-2 text-center text-sm font-medium text-white/80">
              Notifications
            </div>
            <div class="px-4 py-3 text-sm text-white/70">No notifications yet.</div>
          </div>

          <button
            type="button"
            data-dropdown-toggle="apps-dropdown"
            class="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-white/15 focus:ring-4 focus:ring-white/20"
          >
            <span class="sr-only">Open quick links</span>
            <svg
              class="h-6 w-6"
              fill="currentColor"
              viewBox="0 0 20 20"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
              ></path>
            </svg>
          </button>

          <div
            id="apps-dropdown"
            class="z-50 my-4 hidden w-80 list-none divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-brand-secondary text-base shadow-lg"
          >
            <div class="bg-white/5 px-4 py-2 text-center text-sm font-semibold text-white">Quick links</div>
            <div class="grid grid-cols-2 gap-2 p-3">
              <RouterLink
                v-for="link in quickLinks"
                :key="link.to"
                :to="link.to"
                class="rounded-lg bg-white/5 px-3 py-2 text-center text-sm font-medium text-white/90 hover:bg-white/10"
              >
                {{ link.label }}
              </RouterLink>
            </div>
          </div>

          <button
            id="user-menu-button"
            type="button"
            class="mx-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white focus:ring-4 focus:ring-white/15"
            aria-expanded="false"
            data-dropdown-toggle="dropdown"
          >
            <span class="sr-only">Open user menu</span>
            <span aria-hidden="true">{{ userInitial }}</span>
          </button>

          <div
            id="dropdown"
            class="z-50 my-4 hidden w-56 list-none divide-y divide-white/10 rounded-xl border border-white/10 bg-brand-secondary text-base shadow"
          >
            <div class="px-4 py-3">
              <span class="block text-sm font-semibold">Signed in</span>
              <span class="block truncate text-sm text-white/70">{{ user?.email ?? '—' }}</span>
            </div>
            <ul class="py-1 text-white/80" aria-labelledby="dropdown">
              <li>
                <RouterLink
                  to="/app/profile"
                  class="block px-4 py-2 text-sm hover:bg-white/10"
                >
                  My profile
                </RouterLink>
              </li>
              <li>
                <RouterLink
                  to="/app/profile"
                  class="block px-4 py-2 text-sm hover:bg-white/10"
                >
                  Account settings
                </RouterLink>
              </li>
            </ul>
            <ul class="py-1 text-white/80" aria-labelledby="dropdown">
              <li>
                <button
                  type="button"
                  class="block w-full px-4 py-2 text-left text-sm hover:bg-white/10"
                  @click="logout"
                >
                  Sign out
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </nav>

    <aside
      id="drawer-navigation"
      class="fixed left-0 top-0 z-40 h-screen w-64 -translate-x-full border-r border-white/10 bg-[#14192d] pt-16 transition-transform md:translate-x-0"
      aria-label="Sidenav"
    >
      <div class="h-full overflow-y-auto bg-[#14192d] px-3 py-5">
        <form action="#" method="GET" class="mb-2 md:hidden">
          <label for="sidebar-search" class="sr-only">Search</label>
          <div class="relative">
            <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <svg
                class="h-5 w-5 text-gray-500 dark:text-gray-400"
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fill-rule="evenodd"
                  clip-rule="evenodd"
                  d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                ></path>
              </svg>
            </div>
            <button
              id="sidebar-search"
              type="button"
              class="block w-full rounded-lg border border-white/10 bg-white/10 p-2 pl-10 pr-4 text-left text-sm text-white hover:bg-white/15 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
              @click="openFind"
            >
              <span class="text-white/60">Find…</span>
            </button>
          </div>
        </form>

        <ul class="space-y-2">
          <li>
            <RouterLink
              to="/app/dashboard"
              class="group flex items-center rounded-lg p-2 text-base font-medium"
              :class="isActive('/app/dashboard') ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'"
            >
              <svg
                aria-hidden="true"
                class="h-6 w-6 flex-shrink-0 text-white/50 transition duration-75 group-hover:text-white"
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z"></path>
                <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z"></path>
              </svg>
              <span class="ml-3">Dashboard</span>
            </RouterLink>
          </li>

          <li>
            <RouterLink
              to="/app/events"
              class="group flex items-center rounded-lg p-2 text-base font-medium"
              :class="isActive('/app/events') ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'"
            >
              <svg
                aria-hidden="true"
                class="h-6 w-6 flex-shrink-0 text-white/50 transition duration-75 group-hover:text-white"
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fill-rule="evenodd"
                  d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                  clip-rule="evenodd"
                ></path>
              </svg>
              <span class="ml-3">Events</span>
            </RouterLink>
          </li>

          <li v-if="featureFlags.meetingsEnabled">
            <RouterLink
              to="/app/meetings"
              class="group flex items-center rounded-lg p-2 text-base font-medium"
              :class="isActive('/app/meetings') ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'"
            >
              <svg
                aria-hidden="true"
                class="h-6 w-6 flex-shrink-0 text-white/50 transition duration-75 group-hover:text-white"
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fill-rule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.553.894l3 1.5a1 1 0 10.894-1.788L11 9.382V6z"
                  clip-rule="evenodd"
                ></path>
              </svg>
              <span class="ml-3">Scheduled Meetings</span>
            </RouterLink>
          </li>

          <li>
            <RouterLink
              to="/app/tickets"
              class="group flex items-center rounded-lg p-2 text-base font-medium"
              v-if="featureFlags.ticketsEnabled"
              :class="isActive('/app/tickets') ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'"
            >
              <svg
                aria-hidden="true"
                class="h-6 w-6 flex-shrink-0 text-white/50 transition duration-75 group-hover:text-white"
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fill-rule="evenodd"
                  d="M18 13V5a2 2 0 00-2-2H4a2 2 0 00-2 2v8a2 2 0 002 2h3l3 3 3-3h3a2 2 0 002-2zM5 7a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1zm1 3a1 1 0 100 2h3a1 1 0 100-2H6z"
                  clip-rule="evenodd"
                ></path>
              </svg>
              <span class="ml-3">Support Tickets</span>
            </RouterLink>
          </li>

          <li v-if="featureFlags.knowledgeBaseEnabled || featureFlags.videosEnabled || featureFlags.documentsEnabled">
            <button
              type="button"
              class="group flex w-full items-center rounded-lg p-2 text-base font-medium text-white/80 transition duration-75 hover:bg-white/10 hover:text-white"
              aria-controls="dropdown-resources"
              :aria-expanded="resourcesOpen"
              @click="resourcesOpen = !resourcesOpen"
            >
              <svg
                aria-hidden="true"
                class="h-6 w-6 flex-shrink-0 text-white/50 transition duration-75 group-hover:text-white"
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fill-rule="evenodd"
                  d="M4 3a2 2 0 012-2h8a2 2 0 012 2v14l-2-1-2 1-2-1-2 1-2-1-2 1V3zm3 3a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm0 4a1 1 0 011-1h6a1 1 0 110 2H8a1 1 0 01-1-1zm0 4a1 1 0 011-1h6a1 1 0 110 2H8a1 1 0 01-1-1z"
                  clip-rule="evenodd"
                ></path>
              </svg>
              <span class="ml-3 flex-1 whitespace-nowrap text-left">Resources</span>
              <svg
                aria-hidden="true"
                class="h-6 w-6 transition-transform"
                :class="resourcesOpen ? 'rotate-180' : ''"
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fill-rule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clip-rule="evenodd"
                ></path>
              </svg>
            </button>
            <ul id="dropdown-resources" class="space-y-2 py-2" :class="resourcesOpen ? '' : 'hidden'">
              <li v-if="featureFlags.knowledgeBaseEnabled">
                <RouterLink
                  to="/app/knowledge-base"
                  class="group flex w-full items-center rounded-lg p-2 pl-11 text-base font-medium"
                  :class="isActive('/app/knowledge-base') ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'"
                >
                  <svg
                    aria-hidden="true"
                    class="-ml-8 mr-2 h-5 w-5 flex-shrink-0 text-white/50 transition duration-75 group-hover:text-white"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M4 3a2 2 0 012-2h8a2 2 0 012 2v13a1 1 0 01-1.447.894L14 15.618l-2.553 1.276a1 1 0 01-.894 0L8 15.618l-2.553 1.276A1 1 0 014 16V3z"></path>
                  </svg>
                  Knowledge Base
                </RouterLink>
              </li>
              <li v-if="featureFlags.videosEnabled">
                <RouterLink
                  to="/app/videos"
                  class="group flex w-full items-center rounded-lg p-2 pl-11 text-base font-medium"
                  :class="isActive('/app/videos') ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'"
                >
                  <svg
                    aria-hidden="true"
                    class="-ml-8 mr-2 h-5 w-5 flex-shrink-0 text-white/50 transition duration-75 group-hover:text-white"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M2 6a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path>
                    <path d="M14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z"></path>
                  </svg>
                  Video Library
                </RouterLink>
              </li>
              <li v-if="featureFlags.documentsEnabled">
                <RouterLink
                  to="/app/documents"
                  class="group flex w-full items-center rounded-lg p-2 pl-11 text-base font-medium"
                  :class="isActive('/app/documents') ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'"
                >
                  <svg
                    aria-hidden="true"
                    class="-ml-8 mr-2 h-5 w-5 flex-shrink-0 text-white/50 transition duration-75 group-hover:text-white"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 7a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                      clip-rule="evenodd"
                    ></path>
                  </svg>
                  Document Library
                </RouterLink>
              </li>
            </ul>
          </li>

          <li>
            <RouterLink
              to="/app/invoices"
              class="group flex items-center rounded-lg p-2 text-base font-medium"
              v-if="featureFlags.invoicesEnabled"
              :class="isActive('/app/invoices') ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'"
            >
              <svg
                aria-hidden="true"
                class="h-6 w-6 flex-shrink-0 text-white/50 transition duration-75 group-hover:text-white"
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M4 2a2 2 0 00-2 2v14l3-1.5L8 18l3-1.5L14 18l3-1.5L20 18V4a2 2 0 00-2-2H4z"></path>
              </svg>
              <span class="ml-3">Invoices</span>
            </RouterLink>
          </li>

          <li>
            <RouterLink
              to="/app/profile"
              class="group flex items-center rounded-lg p-2 text-base font-medium"
              :class="isActive('/app/profile') ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'"
            >
              <svg
                aria-hidden="true"
                class="h-6 w-6 flex-shrink-0 text-white/50 transition duration-75 group-hover:text-white"
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fill-rule="evenodd"
                  d="M10 2a5 5 0 00-3.536 8.536A7 7 0 002 17a1 1 0 102 0 5 5 0 0110 0 1 1 0 102 0 7 7 0 00-4.464-6.464A5 5 0 0010 2z"
                  clip-rule="evenodd"
                ></path>
              </svg>
              <span class="ml-3">Profile</span>
            </RouterLink>
          </li>
        </ul>

        <ul class="mt-5 space-y-2 border-t border-white/10 pt-5">
          <li>
            <RouterLink
              to="/admin/events"
              class="group flex items-center rounded-lg p-2 text-base font-medium text-white/80 transition duration-75 hover:bg-white/10 hover:text-white"
              v-if="isAdmin"
            >
              <span class="ml-3">Admin</span>
            </RouterLink>
          </li>
        </ul>
      </div>
    </aside>

    <main
      id="main-content"
      class="min-h-screen md:ml-64 text-gray-900"
      :class="isMeetingsPage ? 'pt-0 bg-[#0f1428]' : 'pt-20 bg-[#e2e2e2]'"
    >
      <div
        class="w-full"
        :class="isMeetingsPage ? 'max-w-none' : 'mx-auto max-w-screen-xl px-4 py-3 sm:py-5 lg:px-12'"
      >
        <router-view />
      </div>
    </main>
  </div>
</template>
