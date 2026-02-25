<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { initDropdowns } from 'flowbite'

// @ts-ignore Vue SFC default export is provided by vite/volar
import QuickFindModal from '../components/QuickFindModal.vue'
import ToastContainer from './ToastContainer.vue'
import { clearAdminAccessToken } from '../lib/auth'
const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac')

const route = useRoute()
const router = useRouter()
const currentPath = computed(() => route.path)

const isActive = (to: string) => {
  return currentPath.value === to || currentPath.value.startsWith(`${to}/`)
}

const findOpen = ref(false)
const findSeed = ref('')
type QuickFindItem = {
  label: string
  to: string
  description?: string
  keywords?: string[]
}

const findItems: QuickFindItem[] = [
  { label: 'Admin: Events', to: '/admin/events', description: 'Manage events and pricing', keywords: ['sessions', 'webinars'] },
  { label: 'Admin: Reports', to: '/admin/reports', description: 'Event performance snapshots', keywords: ['analytics', 'metrics'] },
  { label: 'Admin: Email', to: '/admin/email', description: 'Email templates and schedules', keywords: ['notifications'] },
  { label: 'Admin: Content', to: '/admin/content', description: 'Knowledge base and documents', keywords: ['kb', 'resources'] },
  { label: 'Admin: Users', to: '/admin/users', description: 'Portal user access', keywords: ['accounts'] },
  { label: 'Admin: Settings', to: '/admin/settings', description: 'System configuration', keywords: ['config'] },
  { label: 'Admin: HubSpot Audit', to: '/admin/hubspot-audit', description: 'Form contact corruption audit', keywords: ['hubspot', 'audit', 'data', 'corruption'] },
  { label: 'Portal dashboard', to: '/app/dashboard', description: 'Back to the portal' },
]

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

function onGlobalKeydown(e: KeyboardEvent) {
  const mod = isMac ? e.metaKey : e.ctrlKey
  if (mod && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    openFind()
  }
}

function logout() {
  clearAdminAccessToken()
  router.replace('/admin/login')
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
  nextTick(() => initDropdowns())
})

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
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

    <QuickFindModal v-model:open="findOpen" :items="findItems" title="Quick find" :initial-query="findSeed" />
    <ToastContainer />

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

          <RouterLink to="/admin/events" class="mr-4 flex h-full items-center">
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
            to="/app/dashboard"
            class="mr-2 hidden rounded-lg bg-brand-button px-3 py-2 text-sm font-medium text-white hover:bg-brand-button/90 md:inline-flex"
          >
            Back to portal
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
                to="/admin/events"
                class="rounded-lg bg-white/5 px-3 py-2 text-center text-sm font-medium text-white/90 hover:bg-white/10"
              >
                Events
              </RouterLink>
              <RouterLink
                to="/admin/reports"
                class="rounded-lg bg-white/5 px-3 py-2 text-center text-sm font-medium text-white/90 hover:bg-white/10"
              >
                Reports
              </RouterLink>
              <RouterLink
                to="/admin/users"
                class="rounded-lg bg-white/5 px-3 py-2 text-center text-sm font-medium text-white/90 hover:bg-white/10"
              >
                Users
              </RouterLink>
              <RouterLink
                to="/admin/content"
                class="rounded-lg bg-white/5 px-3 py-2 text-center text-sm font-medium text-white/90 hover:bg-white/10"
              >
                Content
              </RouterLink>
              <RouterLink
                to="/admin/settings"
                class="rounded-lg bg-white/5 px-3 py-2 text-center text-sm font-medium text-white/90 hover:bg-white/10"
              >
                Settings
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
            <span aria-hidden="true">A</span>
          </button>

          <div
            id="dropdown"
            class="z-50 my-4 hidden w-56 list-none divide-y divide-white/10 rounded-xl border border-white/10 bg-brand-secondary text-base shadow"
          >
            <div class="px-4 py-3">
              <span class="block text-sm font-semibold">Admin User</span>
              <span class="block truncate text-sm text-white/70">admin@mentor.com</span>
            </div>
            <ul class="py-1 text-white/80" aria-labelledby="dropdown">
              <li>
                <RouterLink
                  to="/admin/settings"
                  class="block px-4 py-2 text-sm hover:bg-white/10"
                >
                  System settings
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
              to="/admin/events"
              class="group flex items-center rounded-lg p-2 text-base font-medium"
              :class="isActive('/admin/events') ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'"
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
              <span class="ml-3">Event management</span>
            </RouterLink>
          </li>

          <li>
            <RouterLink
              to="/admin/reports"
              class="group flex items-center rounded-lg p-2 text-base font-medium"
              :class="isActive('/admin/reports') ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'"
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
                  d="M3 3a1 1 0 011-1h12a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V3zm3 3a1 1 0 000 2h6a1 1 0 100-2H6zm0 4a1 1 0 000 2h6a1 1 0 100-2H6zm0 4a1 1 0 100 2h3a1 1 0 100-2H6z"
                  clip-rule="evenodd"
                ></path>
              </svg>
              <span class="ml-3">Reports</span>
            </RouterLink>
          </li>

          <li>
            <RouterLink
              to="/admin/email"
              class="group flex items-center rounded-lg p-2 text-base font-medium"
              :class="isActive('/admin/email') ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'"
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
                  d="M2 6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm2-.5a.5.5 0 00-.3.9l6 4.5a1 1 0 001.2 0l6-4.5a.5.5 0 00-.3-.9H4z"
                  clip-rule="evenodd"
                ></path>
              </svg>
              <span class="ml-3">Email configuration</span>
            </RouterLink>
          </li>

          <li>
            <RouterLink
              to="/admin/content"
              class="group flex items-center rounded-lg p-2 text-base font-medium"
              :class="isActive('/admin/content') ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'"
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
                  d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm2 4a1 1 0 011-1h7a1 1 0 110 2H8a1 1 0 01-1-1zm0 4a1 1 0 011-1h7a1 1 0 110 2H8a1 1 0 01-1-1z"
                  clip-rule="evenodd"
                ></path>
              </svg>
              <span class="ml-3">Content management</span>
            </RouterLink>
          </li>

          <li>
            <RouterLink
              to="/admin/users"
              class="group flex items-center rounded-lg p-2 text-base font-medium"
              :class="isActive('/admin/users') ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'"
            >
              <svg
                aria-hidden="true"
                class="h-6 w-6 flex-shrink-0 text-white/50 transition duration-75 group-hover:text-white"
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M13 7a3 3 0 11-6 0 3 3 0 016 0z"></path>
                <path
                  fill-rule="evenodd"
                  d="M4 15a6 6 0 0112 0v2H4v-2z"
                  clip-rule="evenodd"
                ></path>
              </svg>
              <span class="ml-3">User management</span>
            </RouterLink>
          </li>

          <li>
            <RouterLink
              to="/admin/hubspot-audit"
              class="group flex items-center rounded-lg p-2 text-base font-medium"
              :class="isActive('/admin/hubspot-audit') ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'"
            >
              <svg
                aria-hidden="true"
                class="h-6 w-6 flex-shrink-0 text-white/50 transition duration-75 group-hover:text-white"
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"></path>
              </svg>
              <span class="ml-3">HubSpot audit</span>
            </RouterLink>
          </li>

          <li>
            <RouterLink
              to="/admin/settings"
              class="group flex items-center rounded-lg p-2 text-base font-medium"
              :class="isActive('/admin/settings') ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'"
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
                  d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                  clip-rule="evenodd"
                ></path>
              </svg>
              <span class="ml-3">System settings</span>
            </RouterLink>
          </li>
        </ul>

        <ul class="mt-5 space-y-2 border-t border-white/10 pt-5">
          <li>
            <RouterLink
              to="/app/dashboard"
              class="group flex items-center rounded-lg p-2 text-base font-medium text-white/80 transition duration-75 hover:bg-white/10 hover:text-white"
            >
              <span class="ml-3">Portal</span>
            </RouterLink>
          </li>
        </ul>
      </div>
    </aside>

    <main id="main-content" class="min-h-screen bg-[#e2e2e2] pt-20 md:ml-64 text-gray-900">
      <div class="mx-auto w-full max-w-screen-xl px-4 py-3 sm:py-5 lg:px-12">
        <router-view />
      </div>
    </main>
  </div>
</template>
