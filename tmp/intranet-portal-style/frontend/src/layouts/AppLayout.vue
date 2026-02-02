<template>
  <div class="antialiased bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-white min-h-screen">
    <!-- Header -->
    <nav
      ref="navEl"
      class="bg-white border-b border-gray-200 px-4 py-2.5 dark:bg-gray-800 dark:border-gray-700 fixed right-0 top-0 z-50 transition-[left] duration-300 ease-in-out"
      :style="{ left: 'var(--hg-side-w, 0px)' }"
    >
      <div class="flex flex-wrap justify-between items-center">
        <div class="flex justify-start items-center">
          <!-- Burger toggles sidebar (mobile) -->
          <button
            type="button"
            aria-controls="drawer-navigation"
            class="p-2 mr-2 text-gray-600 rounded-lg cursor-pointer md:hidden hover:text-gray-900 hover:bg-gray-100 focus:bg-gray-100 dark:focus:bg-gray-700 focus:ring-2 focus:ring-gray-100 dark:focus:ring-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
            @click="toggleDrawer"
          >
            <svg
              aria-hidden="true"
              class="w-6 h-6"
              fill="currentColor"
              viewBox="0 0 20 20"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fill-rule="evenodd"
                d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                clip-rule="evenodd"
              />
            </svg>
            <span class="sr-only">Toggle sidebar</span>
          </button>

          <!-- Brand moved into sidebar; keep spacer minimal to maintain layout if needed (md+) -->
          <div
            class="hidden md:block relative mr-2 transition-[width] duration-300 ease-in-out"
            :style="{ width: miniSidebar ? miniWidthPx : fullWidthPx }"
          />
          <!-- Move collapse button outside brand block so it overlays consistently at the seam -->
          <button
            type="button"
            class="hidden md:inline-flex fixed -translate-y-1/2 items-center justify-center h-8 w-8 md:h-9 md:w-9 rounded-full bg-gray-100 text-gray-600 shadow border border-gray-200 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600 focus:outline-none focus:ring-4 focus:ring-gray-300 dark:focus:ring-gray-600 z-50"
            :style="{ left: 'calc(var(--hg-side-w, 0px) + 6px)', top: 'calc(var(--hg-nav-h, 64px) / 2)' }"
            :aria-pressed="miniSidebar ? 'true' : 'false'"
            aria-label="Toggle compact sidebar"
            @click="toggleMiniSidebar"
          >
            <UntitledIcon
              name="ChevronRight"
              :class="chevronClass"
            />
          </button>

          <!-- Search trigger (md+): opens Command Palette -->
          <button
            type="button"
            class="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 md:w-[28rem] items-center gap-2 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg pl-10 pr-3 py-2.5 dark:bg-gray-700 dark:border-gray-600 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600"
            @click="openPalette"
          >
            <span class="absolute left-3 inline-flex"><svg class="w-5 h-5 text-gray-500 dark:text-gray-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"/></svg></span>
            <span class="truncate text-left text-gray-500 dark:text-gray-300">Search people, pages…</span>
            <span class="ml-auto hidden md:inline text-[10px] text-gray-500 dark:text-gray-400">⌘K</span>
          </button>
        </div>

        <!-- Right controls -->
        <div class="flex items-center lg:order-2 gap-2">

          <!-- Messages -->
          <div class="relative" data-hg-menu>
            <button
              type="button"
              class="relative inline-flex items-center justify-center leading-none h-10 w-10 p-2 mr-1 text-gray-500 rounded-lg hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 focus:ring-4 focus:ring-gray-300 dark:focus:ring-gray-600"
              aria-haspopup="true"
              :aria-expanded="messagesOpen ? 'true' : 'false'"
              @click="toggleMessages"
            >
              <span class="sr-only">View messages</span>
              <svg class="h-[19px] w-auto translate-y-[1px]" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 18">
                <path d="M18 0H2a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3.546l3.2 3.659a1 1 0 0 0 1.506 0L13.454 14H18a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2Zm-8 10H5a1 1 0 0 1 0-2h5a1 1 0 1 1 0 2Zm5-4H5a1 1 0 0 1 0-2h10a1 1 0 1 1 0 2Z"/>
              </svg>
              <span
                v-if="messagesCount > 0"
                class="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[11px] font-semibold rounded-full bg-red-600 text-white"
              >
                {{ messagesCount > 9 ? '9+' : messagesCount }}
              </span>
            </button>
            <div
              v-show="messagesOpen"
              class="absolute left-1/2 top-full -translate-x-1/2 mt-2 w-[22rem] max-w-sm overflow-hidden z-50 text-base list-none bg-white rounded divide-y divide-gray-100 shadow-lg dark:divide-gray-600 dark:bg-gray-700 rounded-xl"
            >
              <div class="block py-2 px-4 text-base font-medium text-center text-gray-700 bg-gray-50 dark:bg-gray-600 dark:text-gray-300">
                Messages
              </div>
              <div>
                <template v-if="messagesItems.length > 0">
                  <div
                    v-for="m in messagesItems.slice(0,6)"
                    :key="m.id"
                    class="flex py-3 px-4 border-b hover:bg-gray-100 dark:hover:bg-gray-600 dark:border-gray-600"
                  >
                    <div class="pl-0 w-full min-w-0">
                      <div class="text-gray-800 dark:text-gray-100 font-medium text-sm truncate">
                        {{ m.subject || m.title || 'Message' }}
                      </div>
                      <div class="text-xs text-gray-500 dark:text-gray-400 truncate">{{ m.preview || m.from || '' }}</div>
                    </div>
                    <div class="pl-2 self-center text-xs text-gray-400 dark:text-gray-500">{{ m.time || '' }}</div>
                  </div>
                </template>
                <div v-else class="py-6 px-4 text-center text-sm text-gray-500 dark:text-gray-300">No new messages</div>
              </div>
              <div class="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-700">
                <router-link
                  :to="{ path: '/chat' }"
                  class="text-sm font-medium text-blue-600 hover:underline"
                  @click="messagesOpen = false"
                >
                  Open chat
                </router-link>
                <button class="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-300" @click="messagesOpen=false">Close</button>
              </div>
            </div>
          </div>

          <!-- Health (record sickness) -->
          <div class="relative" data-hg-menu>
            <button
              type="button"
              class="relative inline-flex items-center justify-center leading-none h-10 w-10 p-2 mr-1 text-gray-500 rounded-lg hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 focus:ring-4 focus:ring-gray-300 dark:focus:ring-gray-600"
              aria-haspopup="true"
              :aria-expanded="healthOpen ? 'true' : 'false'"
              @click="toggleHealth"
            >
              <span class="sr-only">Record sickness</span>
              <svg class="h-[19px] w-auto" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 19 20">
                <path d="M16.025 15H14.91c.058-.33.088-.665.09-1v-1h2a1 1 0 0 0 0-2h-2.09a5.97 5.97 0 0 0-.26-1h.375a2 2 0 0 0 2-2V6a1 1 0 0 0-2 0v2H13.46a6.239 6.239 0 0 0-.46-.46V6a3.963 3.963 0 0 0-.986-2.6l.693-.693A1 1 0 0 0 13 2V1a1 1 0 0 0-2 0v.586l-.661.661a3.753 3.753 0 0 0-2.678 0L7 1.586V1a1 1 0 0 0-2 0v1a1 1 0 0 0 .293.707l.693.693A3.963 3.963 0 0 0 5 6v1.54a6.239 6.239 0 0 0-.46.46H3V6a1 1 0 0 0-2 0v2a2 2 0 0 0 2 2h.35a5.97 5.97 0 0 0-.26 1H1a1 1 0 0 0 0 2h2v1a6 6 0 0 0 .09 1H2a2 2 0 0 0-2 2v2a1 1 0 1 0 2 0v-2h1.812A6.012 6.012 0 0 0 8 19.907V10a1 1 0 0 1 2 0v9.907A6.011 6.011 0 0 0 14.188 17h1.837v2a1 1 0 0 0 2 0v-2a2 2 0 0 0-2-2ZM11 6.35a5.922 5.922 0 0 0-.941-.251l-.111-.017a5.52 5.52 0 0 0-1.9 0l-.111.017A5.924 5.924 0 0 0 7 6.35V6a2 2 0 1 1 4 0v.35Z"/>
              </svg>
              <span
                v-if="healthCount > 0"
                class="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[11px] font-semibold rounded-full bg-amber-500 text-white"
              >
                {{ healthCount > 9 ? '9+' : healthCount }}
              </span>
            </button>
            <div
              v-show="healthOpen"
              class="absolute left-1/2 top-full -translate-x-1/2 mt-2 w-[22rem] max-w-sm overflow-hidden z-50 text-base list-none bg-white rounded divide-y divide-gray-100 shadow-lg dark:divide-gray-600 dark:bg-gray-700 rounded-xl"
            >
              <div class="block py-2 px-4 text-base font-medium text-center text-gray-700 bg-gray-50 dark:bg-gray-600 dark:text-gray-300">
                Record sickness
              </div>
              <div class="p-4">
                <QuickSickToday />
              </div>
            </div>
          </div>

          <!-- Work from home -->
          <div class="relative" data-hg-menu>
            <button
              type="button"
              class="relative inline-flex items-center justify-center leading-none h-10 w-10 p-2 mr-1 text-gray-500 rounded-lg hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 focus:ring-4 focus:ring-gray-300 dark:focus:ring-gray-600"
              aria-haspopup="true"
              :aria-expanded="wfhOpen ? 'true' : 'false'"
              @click="toggleWfh"
            >
              <span class="sr-only">Work from home</span>
              <svg class="h-[19px] w-auto" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
                <path d="M19.728 10.686c-2.38 2.256-6.153 3.381-9.875 3.381-3.722 0-7.4-1.126-9.571-3.371L0 10.437V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-7.6l-.272.286Z"/>
                <path d="m.135 7.847 1.542 1.417c3.6 3.712 12.747 3.7 16.635.01L19.605 7.9A.98.98 0 0 1 20 7.652V6a2 2 0 0 0-2-2h-3V3a3 3 0 0 0-3-3H8a3 3 0 0 0-3 3v1H2a2 2 0 0 0-2 2v1.765c.047.024.092.051.135.082ZM10 10.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5ZM7 3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1H7V3Z"/>
              </svg>
              <span
                v-if="wfhCount > 0"
                class="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[11px] font-semibold rounded-full bg-blue-600 text-white"
              >
                {{ wfhCount > 9 ? '9+' : wfhCount }}
              </span>
            </button>
            <div
              v-show="wfhOpen"
              class="absolute left-1/2 top-full -translate-x-1/2 mt-2 w-[22rem] max-w-sm overflow-hidden z-50 text-base list-none bg-white rounded divide-y divide-gray-100 shadow-lg dark:divide-gray-600 dark:bg-gray-700 rounded-xl"
            >
              <div class="block py-2 px-4 text-base font-medium text-center text-gray-700 bg-gray-50 dark:bg-gray-600 dark:text-gray-300">
                Work from home
              </div>
              <div class="p-4">
                <WfhTodayToggle />
              </div>
            </div>
          </div>

          <!-- Notifications bell (original style) -->
          <div class="relative" data-hg-menu>
            <button
              type="button"
              class="relative p-2 mr-1 text-gray-500 rounded-lg hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 focus:ring-4 focus:ring-gray-300 dark:focus:ring-gray-600"
              aria-haspopup="true"
              :aria-expanded="notifOpen ? 'true' : 'false'"
              @click="toggleNotif"
            >
              <span class="sr-only">View notifications</span>
              <svg
                aria-hidden="true"
                class="w-6 h-6"
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z"
                />
              </svg>
              <!-- Numeric badge for pending leave approvals; fallback pulsing dot for other notifications -->
              <span
                v-if="leavePendingCount > 0"
                class="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[11px] font-semibold rounded-full bg-red-600 text-white"
              >
                {{ leavePendingBadge }}
              </span>
              <span
                v-else-if="notifCount > 0"
                class="absolute top-1.5 right-1.5 inline-flex h-2 w-2"
              >
                <span class="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
                <span class="relative inline-flex rounded-full h-2 w-2 bg-red-600" />
              </span>
              <span
                v-if="unreadSocialCount > 0"
                class="absolute -bottom-1 -right-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[10px] font-semibold rounded-full bg-blue-600 text-white"
              >
                {{ unreadSocialCount > 9 ? '9+' : unreadSocialCount }}
              </span>
            </button>
            <div
              v-show="notifOpen"
              class="absolute left-1/2 top-full -translate-x-1/2 mt-2 w-[22rem] max-w-sm overflow-hidden z-50 text-base list-none bg-white rounded divide-y divide-gray-100 shadow-lg dark:divide-gray-600 dark:bg-gray-700 rounded-xl"
            >
              <div class="block py-2 px-4 text-base font-medium text-center text-gray-700 bg-gray-50 dark:bg-gray-600 dark:text-gray-300">
                Notifications
              </div>
              <div>
                <template v-if="notifItems.length > 0">
                  <div
                    v-for="it in notifItems.slice(0,5)"
                    :key="it.id"
                    class="flex py-3 px-4 border-b hover:bg-gray-100 dark:hover:bg-gray-600 dark:border-gray-600"
                  >
                    <div class="flex-shrink-0 pt-0.5">
                      <UntitledIcon
                        :name="iconFor(it)"
                        class="w-5 h-5 text-gray-500 dark:text-gray-400"
                      />
                    </div>
                    <div class="pl-3 w-full min-w-0">
                      <div class="text-gray-800 dark:text-gray-100 font-medium text-sm truncate">
                        {{ it.title || it.name || it.meta?.label || 'Item' }}
                      </div>
                      <div class="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {{ subtitleFor(it) }}
                      </div>
                    </div>
                    <div class="pl-2 self-center">
                      <span
                        v-if="it.urgency"
                        class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
                        :class="it.urgency === 'overdue' ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' : it.urgency === 'today' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'"
                      >
                        {{ it.urgency }}
                      </span>
                    </div>
                  </div>
                </template>
                <div
                  v-else
                  class="py-6 px-4 text-center text-sm text-gray-500 dark:text-gray-300"
                >
                  You're all caught up
                </div>
              </div>
              <!-- Social notifications -->
              <div class="border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
                <div class="py-2 px-4 text-xs font-semibold text-gray-600 dark:text-gray-300 flex items-center justify-between">
                  <span>Social</span>
                  <button v-if="unreadSocialCount>0" @click="markAllSocial" class="text-[11px] text-blue-600 hover:underline">Mark all read</button>
                </div>
                <div v-if="socialNotifs.length===0" class="px-4 pb-3 text-xs text-gray-500 dark:text-gray-400">No social notifications</div>
                <div v-else class="max-h-60 overflow-auto">
                  <div v-for="n in socialNotifs" :key="n._id" class="px-4 py-2 text-xs flex items-start gap-2 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <img :src="n.actor?.profilePicture" class="h-6 w-6 rounded-full object-cover" alt="actor" />
                    <div class="min-w-0 flex-1">
                      <div class="truncate"><strong>{{ fullName(n.actor) }}</strong> {{ socialText(n) }}</div>
                      <div class="text-[10px] text-gray-500">{{ formatDate(n.createdAt) }}</div>
                    </div>
                    <button v-if="!n.readAt" @click="markSocial(n)" class="text-[10px] text-blue-600 hover:underline">Mark</button>
                  </div>
                </div>
                <div v-if="socialHasMore && socialNotifs.length" class="px-4 py-2 text-center border-t border-gray-100 dark:border-gray-700">
                  <button class="text-[11px] text-blue-600 hover:underline disabled:opacity-50" :disabled="socialLoading" @click="loadSocialNotifs()">
                    {{ socialLoading ? 'Loading...' : 'Load more' }}
                  </button>
                </div>
              </div>
              <router-link
                :to="{ path: '/', hash: '#needs-attention' }"
                class="block py-2 text-md font-medium text-center text-gray-900 bg-gray-50 hover:bg-gray-100 dark:bg-gray-600 dark:text-white"
                @click="notifOpen = false"
              >
                View all
              </router-link>
            </div>
          </div>

          

          <!-- User avatar -->
          <div class="relative">
            <button
              id="user-menu-button"
              type="button"
              class="flex mx-3 text-sm bg-gray-800 rounded-full md:mr-0 focus:ring-4 focus:ring-gray-300 dark:focus:ring-gray-600"
              aria-haspopup="true"
              :aria-expanded="userOpen ? 'true' : 'false'"
              @click="toggleUser"
            >
              <span class="sr-only">Open user menu</span>
              <Avatar
                :src="store.user?.profilePicture"
                :name="`${store.user?.firstName ?? ''} ${store.user?.lastName ?? ''}`.trim() || store.user?.email || 'User'"
                size="sm"
                alt="User avatar"
              />
            </button>
            <!-- User dropdown -->
            <div
              v-show="userOpen"
              class="absolute right-0 mt-2 z-50 my-2 w-56 text-base list-none bg-white rounded divide-y divide-gray-100 shadow dark:bg-gray-700 dark:divide-gray-600 rounded-xl"
            >
              <div class="py-3 px-4">
                <span class="block text-sm font-semibold text-gray-900 dark:text-white">{{ store.user?.firstName }} {{ store.user?.lastName }}</span>
                <span class="block text-sm text-gray-900 truncate dark:text-white">{{ store.user?.email }}</span>
              </div>
              <ul class="py-1 text-gray-700 dark:text-gray-300">
                <li>
                  <router-link
                    to="/profile"
                    class="block py-2 px-4 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-gray-400 dark:hover:text-white"
                    @click="userOpen = false"
                  >
                    My profile
                  </router-link>
                </li>
                <li>
                  <button
                    class="block w-full text-left py-2 px-4 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-gray-400 dark:hover:text-white"
                    @click="doLogoutWithClose"
                  >
                    Sign out
                  </button>
                </li>
              </ul>
            </div>
          </div>
          <!-- Inline user name + title (md+) -->
          <div class="hidden md:flex flex-col leading-tight ml-1 min-w-0">
            <span class="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[12rem]">{{ displayName }}</span>
            <span class="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[12rem]">{{ displayTitle }}</span>
          </div>
        </div>
      </div>
    </nav>

    <!-- Sidebar -->
    <aside
      id="drawer-navigation"
      class="fixed top-0 left-0 z-40 h-screen transition-transform bg-white border-r border-gray-200 dark:bg-gray-800 dark:border-gray-700 md:translate-x-0 transition-[width] duration-300 ease-in-out"
      :class="[drawerOpen ? 'translate-x-0' : '-translate-x-full', miniSidebar ? miniWidthClass : fullWidthClass]"
      aria-label="Sidenav"
    >
  <div class="overflow-y-auto py-0 px-3 h-full bg-white dark:bg-gray-800 relative pb-20">
        <!-- Sidebar brand row: small logo + title; full-width bottom border; height matches header bar -->
        <div class="flex items-center gap-3 h-[var(--hg-nav-h,64px)] px-1 border-b border-gray-200 dark:border-gray-700">
          <router-link to="/" class="flex items-center gap-3">
            <img :src="logoUrl" class="h-10 w-auto" alt="Company logo">
            <span :class="[miniSidebar ? 'hidden' : 'text-2xl font-black font-heading text-gray-900 dark:text-white']">HR Portal</span>
          </router-link>
        </div>
  <ul class="space-y-2 list-none py-5">
          <li>
            <Tooltip :text="'Dashboard'" :disabled="!miniSidebar" placement="right" wrapperClass="relative block">
              <router-link
                :class="sideItemClass('/')"
                to="/"
                @click="onNav"
                :aria-label="miniSidebar ? 'Dashboard' : null"
              >
                <UntitledIcon
                  name="LayoutGrid01"
                  class="w-5 h-5 shrink-0 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white"
                />
                <span :class="labelClass">Dashboard</span>
              </router-link>
            </Tooltip>
          </li>
          <li>
            <Tooltip :text="'Feed'" :disabled="!miniSidebar" placement="right" wrapperClass="relative block">
              <router-link
                :class="sideItemClass('/feed')"
                to="/feed"
                @click="onNav"
                :aria-label="miniSidebar ? 'Feed' : null"
              >
                <UntitledIcon
                  name="LayoutGrid01"
                  class="w-5 h-5 shrink-0 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white"
                />
                <span :class="labelClass">Feed</span>
              </router-link>
            </Tooltip>
          </li>
          <li>
            <Tooltip :text="'Newsletter'" :disabled="!miniSidebar" placement="right" wrapperClass="relative block">
              <router-link
                :class="sideItemClass('/newsletter')"
                to="/newsletter"
                @click="onNav"
                :aria-label="miniSidebar ? 'Newsletter' : null"
              >
                <UntitledIcon
                  name="Announcement01"
                  class="w-5 h-5 shrink-0 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white"
                />
                <span :class="labelClass">Newsletter</span>
              </router-link>
            </Tooltip>
          </li>
          <li>
            <div class="relative block">
              <Tooltip :text="'Directory'" :disabled="!miniSidebar" placement="right" wrapperClass="w-full">
                <button
                  type="button"
                  :class="['flex items-center rounded-lg group transition-colors w-full', miniSidebar ? 'justify-center p-3 mx-1' : 'p-2', dirAnyActive ? 'bg-gray-100 text-blue-600 dark:bg-gray-700 dark:text-white' : 'text-gray-900 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-700']"
                  @click="toggleDirMenu"
                  :aria-expanded="dirOpen ? 'true' : 'false'"
                  :aria-label="miniSidebar ? 'Directory' : null"
                >
                  <UntitledIcon
                    name="Users01"
                    class="w-5 h-5 shrink-0 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white"
                  />
                  <span :class="labelClass">Directory</span>
                  <UntitledIcon v-if="!miniSidebar" :name="dirOpen ? 'ChevronDown' : 'ChevronRight'" class="ml-auto w-4 h-4 text-gray-400" />
                </button>
              </Tooltip>
              <!-- Submenu -->
              <transition name="fade" mode="out-in">
                <ul v-show="dirOpen && !miniSidebar" class="mt-1 ml-9 space-y-1">
                  <li>
                    <router-link
                      :class="sideItemClass('/directory')"
                      to="/directory"
                      @click="onNav"
                    >
                      <UntitledIcon name="UserCircle" class="w-5 h-5 shrink-0 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white" />
                      <span class="ms-3">{{ store.user?.role === 'employee' ? 'Team' : 'Employees' }}</span>
                    </router-link>
                  </li>
                  <li>
                    <router-link
                      :class="sideItemClass('/contacts')"
                      to="/contacts"
                      @click="onNav"
                    >
                      <UntitledIcon name="Phone" class="w-5 h-5 shrink-0 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white" />
                      <span class="ms-3">Key contacts</span>
                    </router-link>
                  </li>
                </ul>
              </transition>
            </div>
          </li>
          <li>
            <Tooltip :text="'Documents'" :disabled="!miniSidebar" placement="right" wrapperClass="relative block">
              <router-link
                :class="sideItemClass('/documents')"
                to="/documents"
                @click="onNav"
                :aria-label="miniSidebar ? 'Documents' : null"
              >
                <UntitledIcon
                  name="File01"
                  class="w-5 h-5 shrink-0 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white"
                />
                <span :class="labelClass">Documents</span>
              </router-link>
            </Tooltip>
          </li>
          <li>
            <Tooltip :text="'Calendar'" :disabled="!miniSidebar" placement="right" wrapperClass="relative block">
              <router-link
                :class="sideItemClass('/calendar')"
                to="/calendar"
                @click="onNav"
                :aria-label="miniSidebar ? 'Calendar' : null"
              >
                <UntitledIcon
                  name="Calendar"
                  class="w-5 h-5 shrink-0 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white"
                />
                <span :class="labelClass">Calendar</span>
              </router-link>
            </Tooltip>
          </li>
          <li>
            <Tooltip :text="'Annual leave'" :disabled="!miniSidebar" placement="right" wrapperClass="relative block">
              <router-link
                :class="sideItemClass('/annual-leave')"
                to="/annual-leave"
                @click="onNav"
                :aria-label="miniSidebar ? 'Annual leave' : null"
              >
                  <UntitledIcon
                    name="CalendarCheck"
                    class="w-5 h-5 shrink-0 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white"
                  />
                <span :class="labelClass">Annual leave</span>
              </router-link>
            </Tooltip>
          </li>
          <li>
            <Tooltip :text="'Offers & Perks'" :disabled="!miniSidebar" placement="right" wrapperClass="relative block">
              <router-link
                :class="sideItemClass('/offers')"
                to="/offers"
                @click="onNav"
                :aria-label="miniSidebar ? 'Offers & Perks' : null"
              >
                <UntitledIcon
                  name="Tag01"
                  class="w-5 h-5 shrink-0 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white"
                />
                <span :class="labelClass">Offers & Perks</span>
              </router-link>
            </Tooltip>
          </li>
          <li>
            <Tooltip :text="'Celebrate'" :disabled="!miniSidebar" placement="right" wrapperClass="relative block">
              <router-link
                :class="sideItemClass('/recognition')"
                to="/recognition"
                @click="onNav"
                :aria-label="miniSidebar ? 'Celebrate' : null"
              >
                  <UntitledIcon
                    name="Trophy01"
                    class="w-5 h-5 shrink-0 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white"
                  />
                <span :class="labelClass">Celebrate</span>
              </router-link>
            </Tooltip>
          </li>
          <template v-if="userIsAdmin">
            <li>
              <Tooltip :text="'DBS Dashboard'" :disabled="!miniSidebar" placement="right" wrapperClass="relative block">
                <router-link
                  :class="sideItemClass('/admin/dbs')"
                  to="/admin/dbs"
                  @click="onNav"
                  :aria-label="miniSidebar ? 'DBS Dashboard' : null"
                >
                  <UntitledIcon
                    name="ShieldTick"
                    class="w-5 h-5 shrink-0 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white"
                  />
                  <span :class="labelClass">DBS Dashboard</span>
                </router-link>
              </Tooltip>
            </li>
            <!-- Settings items removed from main sidebar (now under /settings) -->
          </template>
        </ul>
        <!-- Chat link -->
        <ul class="space-y-2 list-none pt-0">
          <li>
            <Tooltip :text="'Chat'" :disabled="!miniSidebar" placement="right" wrapperClass="relative block">
              <router-link
                :class="sideItemClass('/chat')"
                to="/chat"
                @click="onNav"
                :aria-label="miniSidebar ? 'Chat' : null"
                class="relative"
              >
                <UntitledIcon
                  name="MessageSquare"
                  class="w-5 h-5 shrink-0 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white"
                />
                <span :class="labelClass">Chat</span>
                <span
                  v-if="chatUnreadCount > 0"
                  class="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[11px] font-semibold rounded-full bg-blue-600 text-white"
                >
                  {{ chatUnreadCount > 9 ? '9+' : chatUnreadCount }}
                </span>
              </router-link>
            </Tooltip>
          </li>
        </ul>
        <!-- Sidebar bottom controls: theme + settings -->
        <div class="absolute left-0 right-0 bottom-3 px-3">
          <div class="flex items-center justify-center gap-2">
            <Tooltip text="Toggle theme" placement="right">
              <button
                type="button"
                class="inline-flex items-center justify-center h-10 w-10 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                :aria-pressed="isDark ? 'true' : 'false'"
                aria-label="Toggle theme"
                @click="toggleTheme"
              >
                <UntitledIcon :name="isDark ? 'Sun' : 'Moon01'" class="w-5 h-5" />
              </button>
            </Tooltip>
            <Tooltip v-if="userIsAdmin" text="System settings" placement="right">
              <router-link
                to="/settings"
                class="inline-flex items-center justify-center h-10 w-10 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                aria-label="System settings"
              >
                <UntitledIcon name="Settings01" class="w-5 h-5" />
              </router-link>
            </Tooltip>
          </div>
        </div>
      </div>
    </aside>

    <!-- Main content -->
    <main :class="[isChatRoute ? 'h-auto md:transition-[margin] duration-300 ease-in-out pt-[var(--hg-nav-h,64px)]' : 'p-4 h-auto pt-20 md:transition-[margin] duration-300 ease-in-out', miniSidebar ? mainMiniClass : mainFullClass]">
      <Suspense>
        <template #default>
          <router-view />
        </template>
        <template #fallback>
          <PageSkeleton />
        </template>
      </Suspense>
    </main>
    <!-- Global toasts -->
    <Toaster />
    <!-- Command palette -->
    <CommandPalette :open="paletteOpen" @close="paletteOpen=false" />
  </div>
</template>

<script setup>
import UntitledIcon from '../components/UntitledIcon.vue';
import Tooltip from '../components/Tooltip.vue';
import Avatar from '../components/Avatar.vue';
import Toaster from '../components/Toaster.vue';
import PageSkeleton from '../components/PageSkeleton.vue';
import CommandPalette from '../components/CommandPalette.vue';
import WfhTodayToggle from '../components/WfhTodayToggle.vue';
import QuickSickToday from '../components/QuickSickToday.vue';
import { useToastStore } from '../stores/toast.js';
import { useAuthStore } from '../stores/auth.js';
import { useRouter, useRoute } from 'vue-router';
import { computed, ref, onMounted, watch, onBeforeUnmount } from 'vue';
import { listNotifications, markNotificationRead, markAllNotificationsRead } from '../api/social.js';
import { listConversations as listChatConversations } from '../api/chat.js';
import { getSocket } from '../lib/socket.js';
// Base-aware public URL so it works when the app is served from a sub-path
const logoUrl = import.meta.env.BASE_URL + 'images/logo.png';

const store = useAuthStore();
const router = useRouter();
const route = useRoute();
const toast = useToastStore();
const navEl = ref(null);
const paletteOpen = ref(false);

const drawerOpen = ref(false);
const notifOpen = ref(false);
const messagesOpen = ref(false);
const healthOpen = ref(false);
const wfhOpen = ref(false);
const notifItems = ref([]);
const notifCount = ref(0);
const notifLoading = ref(false);
const chatUnreadCount = ref(0);
const lastChatUnread = ref(0);
const socialNotifs = ref([]);
const unreadSocialCount = ref(0);
const socialCursor = ref(null);
const socialHasMore = ref(true);
const socialLoading = ref(false);
const messagesItems = ref([]);
const healthItems = ref([]);
const wfhItems = ref([]);
const messagesCount = computed(() => chatUnreadCount.value || 0);
const healthCount = computed(() => (Array.isArray(healthItems.value) ? healthItems.value.length : 0));
const wfhCount = computed(() => (Array.isArray(wfhItems.value) ? wfhItems.value.length : 0));
// Derived: pending leave approvals count
const leavePendingCount = computed(() => (Array.isArray(notifItems.value) ? notifItems.value.filter(i => (i?.type || '').toLowerCase().includes('leave')).length : 0));
const leavePendingBadge = computed(() => (leavePendingCount.value > 9 ? '9+' : String(leavePendingCount.value)));
// Track last seen leave pending count to show a subtle toast when it increases
const lastLeavePending = ref(0);
const userOpen = ref(false);
// Mini sidebar state and layout helpers
const miniSidebar = ref(false);
const uiReady = ref(false);
const fullWidthClass = 'w-64';
const miniWidthClass = 'w-20';
const mainFullClass = 'md:ml-64';
const mainMiniClass = 'md:ml-20';
const fullWidthPx = '16rem'; // matches w-64
const miniWidthPx = '5rem';  // matches w-20
// Route-based layout tweaks
const isChatRoute = computed(() => route.path.startsWith('/chat'));
function toggleMiniSidebar() {
  miniSidebar.value = !miniSidebar.value;
}

function toggleDrawer() {
  drawerOpen.value = !drawerOpen.value;
}
function onNav() {
  // Close drawer on mobile after navigating
  if (window.innerWidth < 768) drawerOpen.value = false;
}

function toggleNotif() {
  notifOpen.value = !notifOpen.value;
  if (notifOpen.value) {
    userOpen.value = false;
    messagesOpen.value = false;
    healthOpen.value = false;
    wfhOpen.value = false;
    if (socialNotifs.value.length === 0) loadSocialNotifs(true);
  }
}
function toggleMessages() {
  messagesOpen.value = !messagesOpen.value;
  if (messagesOpen.value) {
    notifOpen.value = false;
    userOpen.value = false;
    healthOpen.value = false;
    wfhOpen.value = false;
  }
}
function openChatFromHeader() {
  messagesOpen.value = false;
  notifOpen.value = false;
  userOpen.value = false;
  router.push('/chat');
}
// Allow other components to open the messages tray via a custom event
function onOpenMessages() { messagesOpen.value = true; notifOpen.value = false; userOpen.value = false; healthOpen.value = false; wfhOpen.value = false; }
function toggleHealth() {
  healthOpen.value = !healthOpen.value;
  if (healthOpen.value) {
    notifOpen.value = false;
    userOpen.value = false;
    messagesOpen.value = false;
    wfhOpen.value = false;
  }
}
function toggleWfh() {
  wfhOpen.value = !wfhOpen.value;
  if (wfhOpen.value) {
    notifOpen.value = false;
    userOpen.value = false;
    messagesOpen.value = false;
    healthOpen.value = false;
  }
}
function toggleUser() {
  userOpen.value = !userOpen.value;
  if (userOpen.value) {
    notifOpen.value = false;
  }
}
function openPalette() {
  paletteOpen.value = true;
}

async function doLogoutWithClose() {
  userOpen.value = false;
  await store.logout();
  try { toast.info('Signed out', { duration: 2200, sticky: false }); } catch {}
  router.replace('/login');
}

const userIsAdmin = computed(() => store.user?.role === 'admin');

// Header user info
const displayName = computed(() => {
  const fn = store.user?.firstName ?? '';
  const ln = store.user?.lastName ?? '';
  const full = `${fn} ${ln}`.trim();
  return full || store.user?.email || 'User';
});
const displayTitle = computed(() => {
  const u = store.user || {};
  const roleNice = u.role ? (u.role.charAt(0).toUpperCase() + u.role.slice(1)) : '';
  return u.position || u.jobTitle || u.title || roleNice || '';
});

// Avatar rendering moved to Avatar component

// Sidebar active link helper (Flowbite list style)
function isActive(to) {
  return route.path === to || route.path.startsWith(to + '/');
}
function sideItemClass(to) {
  const active = isActive(to);
  const base = [
    'flex items-center rounded-lg group transition-colors',
    miniSidebar.value ? 'justify-center p-3 mx-1' : 'p-2',
  ];
  const state = active
    ? 'bg-gray-100 text-blue-600 dark:bg-gray-700 dark:text-white'
    : 'text-gray-900 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-700';
  return [...base, state].join(' ');
}
const labelClass = computed(() => (miniSidebar.value ? 'hidden' : 'ms-3'));

// Directory submenu state: open when on any directory route
const dirAnyActive = computed(() => isActive('/directory') || isActive('/contacts'));
const dirOpen = ref(false);
function toggleDirMenu() {
  // If mini sidebar, clicking parent should navigate to employees directly
  if (miniSidebar.value) {
    router.push('/directory');
    onNav();
    return;
  }
  dirOpen.value = !dirOpen.value;
}
watch(() => route.path, () => { if (dirAnyActive.value) dirOpen.value = true; });

// Theme handling (Tailwind class strategy)
const THEME_KEY = 'theme';
const isDark = ref(false);

function applyTheme(dark) {
  const root = document.documentElement;
  if (dark) root.classList.add('dark');
  else root.classList.remove('dark');
}

function toggleTheme() {
  isDark.value = !isDark.value;
}

onMounted(() => {
  // defer animations until after first paint to avoid initial spin
  setTimeout(() => { uiReady.value = true; }, 0);
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') {
      isDark.value = saved === 'dark';
    } else {
      isDark.value = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    applyTheme(isDark.value);
  } catch {
    // fallback to prefers-color-scheme
    isDark.value = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(isDark.value);
  }
  // Set CSS variable for nav height so toasts can position just below it
  function setNavHeightVar() {
    const h = (navEl.value && navEl.value.offsetHeight) ? navEl.value.offsetHeight : 64; // fallback 64px
    document.documentElement.style.setProperty('--hg-nav-h', h + 'px');
  }
  setNavHeightVar();
  window.addEventListener('resize', setNavHeightVar, { passive: true });
  // store cleanup handler
  cleanupFns.push(() => window.removeEventListener('resize', setNavHeightVar));

  // Set CSS variable for sidebar width so header can start after it (md+)
  function setSideWidthVar() {
    const isMdUp = window.matchMedia && window.matchMedia('(min-width: 768px)').matches;
    const w = isMdUp ? (miniSidebar.value ? 80 : 256) : 0; // 5rem or 16rem on md+, else 0
    document.documentElement.style.setProperty('--hg-side-w', w + 'px');
  }
  setSideWidthVar();
  window.addEventListener('resize', setSideWidthVar, { passive: true });
  cleanupFns.push(() => window.removeEventListener('resize', setSideWidthVar));

  // Listen for global request to open messages
  window.addEventListener('open-messages', onOpenMessages);
  cleanupFns.push(() => window.removeEventListener('open-messages', onOpenMessages));

  // Notifications: fetch initial and start polling
  let t = null;
  let chatInterval = null;
  async function fetchNotifications() {
    notifLoading.value = true;
    try {
      const data = await fetch('/api/dashboard/action-items', { credentials: 'include' }).then(r => r.ok ? r.json() : null);
      const all = [];
      if (Array.isArray(data?.leaveRequests)) all.push(...data.leaveRequests);
      if (Array.isArray(data?.dbsExpiring)) all.push(...data.dbsExpiring);
      if (Array.isArray(data?.trainingExpiring)) all.push(...data.trainingExpiring);
      if (Array.isArray(data?.expenseClaims)) all.push(...data.expenseClaims);
      if (Array.isArray(data?.documentRequests)) all.push(...data.documentRequests);
      // Sort by urgency then priority
      const urgOrder = { overdue: 0, today: 1, this_week: 2 };
      const priOrder = { high: 0, medium: 1, low: 2 };
      all.sort((a, b) => (urgOrder[a.urgency] ?? 9) - (urgOrder[b.urgency] ?? 9) || (priOrder[a.priority] ?? 9) - (priOrder[b.priority] ?? 9));
      notifItems.value = all;
      notifCount.value = all.length;
    } catch {
      notifItems.value = [];
      notifCount.value = 0;
    } finally {
      notifLoading.value = false;
    }
  }
  fetchNotifications();
  t = setInterval(fetchNotifications, 30000);
  async function fetchChatSummary() {
    try {
      const { items } = await listChatConversations();
      const list = Array.isArray(items) ? items : [];
      chatUnreadCount.value = list.reduce((sum, it) => sum + (it.unreadCount || 0), 0);
      messagesItems.value = list
        .slice(0, 6)
        .map((it) => ({
          id: it.room,
          title: it.title || (it.room?.startsWith('dm:') ? 'Direct message' : it.room || 'Message'),
          preview: it.lastMessage?.text || (it.lastMessage?.attachment ? 'Attachment' : ''),
          time: it.lastMessage?.createdAt ? new Date(it.lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
        }));
    } catch {
      chatUnreadCount.value = 0;
      messagesItems.value = [];
    }
  }
  fetchChatSummary();
  chatInterval = setInterval(fetchChatSummary, 20000);
  try {
    window.addEventListener('chat:refresh-unread', fetchChatSummary);
    cleanupFns.push(() => window.removeEventListener('chat:refresh-unread', fetchChatSummary));
  } catch {}
  cleanupFns.push(() => { try { clearInterval(t); } catch {} });
  cleanupFns.push(() => { try { clearInterval(chatInterval); } catch {} });

  // Placeholder: could fetch messages/health/wfh from APIs in future
  try {
    messagesItems.value = [];
    healthItems.value = [];
    wfhItems.value = [];
  } catch {}

  // Initialize last seen count on mount
  lastLeavePending.value = leavePendingCount.value;
  // Demo toast removed (was temporary). If needed again, we can re-enable behind a query param.

  // Global click-away to close open menus (messages/health/wfh/notif)
  function onDocClick(e) {
    try {
      const target = e.target;
      // If click is inside any header menu wrapper, do nothing
      if (target && target.closest && target.closest('[data-hg-menu]')) return;
    } catch {}
    // Close all open header menus
    if (messagesOpen.value || healthOpen.value || wfhOpen.value || notifOpen.value) {
      messagesOpen.value = false;
      healthOpen.value = false;
      wfhOpen.value = false;
      notifOpen.value = false;
    }
  }
  document.addEventListener('click', onDocClick, { capture: true });
  cleanupFns.push(() => document.removeEventListener('click', onDocClick, { capture: true }));

  // Keyboard shortcut: Cmd/Ctrl+K to open palette
  function onKey(e) {
    const isCmdK = (e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey);
    if (isCmdK) {
      e.preventDefault();
      paletteOpen.value = true;
    }
    if (e.key === 'Escape' && paletteOpen.value) {
      e.preventDefault();
      paletteOpen.value = false;
    }
  }
  window.addEventListener('keydown', onKey);
  cleanupFns.push(() => window.removeEventListener('keydown', onKey));

  // Socket listener for social notifications
  try {
    const s = getSocket();
    s.on('notification:new', (payload) => {
      try { if (!payload?.user || String(payload.user) === String(store.user?._id)) loadSocialNotifs(true); } catch {}
    });
    s.on('chat:new', (msg) => {
      try { fetchChatSummary(); } catch {}
      try {
        if (!route.path.startsWith('/chat')) {
          const senderLabel = fullName(msg?.sender) || 'Someone';
          const snippet = msg?.text || (msg?.attachment ? 'Sent an attachment' : 'New message');
          toast.push({
            type: 'info',
            title: `New message from ${senderLabel}`,
            description: snippet,
            actions: [
              {
                label: 'Open chat',
                onClick: ({ router: r, close }) => { r.push('/chat'); close(); },
                autoClose: true
              }
            ]
          });
        }
      } catch {}
    });
    cleanupFns.push(() => { try { s.off('notification:new'); } catch {} });
    cleanupFns.push(() => { try { s.off('chat:new'); } catch {} });
  } catch {}
});

watch(isDark, (v) => {
  applyTheme(v);
  try { localStorage.setItem(THEME_KEY, v ? 'dark' : 'light'); } catch {}
});

watch(chatUnreadCount, (n, o) => {
  if (typeof n === 'number' && typeof o === 'number' && n > o && !route.path.startsWith('/chat')) {
    try {
      toast.push({
        type: 'info',
        title: 'New message',
        description: 'You have new chat messages',
        actions: [
          {
            label: 'Open chat',
            onClick: ({ router: r, close }) => { r.push('/chat'); close(); },
            autoClose: true
          }
        ]
      });
    } catch {}
  }
  lastChatUnread.value = n;
});

// Actionable toast when pending leave approvals increase
watch(leavePendingCount, (n, o) => {
  if (typeof n === 'number' && typeof o === 'number' && n > o) {
    try {
      const label = n === 1 ? 'leave approval' : 'leave approvals';
      const id = toast.push({
        type: 'info',
        title: 'Needs your attention',
        description: `${n} ${label} pending`,
        sticky: true,
        actions: [
          {
            label: 'Review',
            onClick: ({ router: r, close }) => {
              try { sessionStorage.setItem('hg_open_attention', 'leave'); } catch {}
              r.push({ path: '/', hash: '#needs-attention' });
              close();
            },
            autoClose: true
          }
        ]
      });
      void id; // keep eslint calm if unused
    } catch {}
  }
  lastLeavePending.value = n;
});

// Update header offset when miniSidebar toggles
watch(miniSidebar, () => {
  try {
    const isMdUp = window.matchMedia && window.matchMedia('(min-width: 768px)').matches;
    const w = isMdUp ? (miniSidebar.value ? 80 : 256) : 0;
    document.documentElement.style.setProperty('--hg-side-w', w + 'px');
  } catch {}
});

// Simple disposer list for this component
const cleanupFns = [];
onBeforeUnmount(() => { cleanupFns.forEach((fn) => { try { fn(); } catch {} }); });

// Animated chevron class helper
const chevronClass = computed(() => {
  const base = 'w-4 h-4 inline-block will-change-transform';
  if (!uiReady.value) return [base, miniSidebar.value ? 'rotate-0' : 'rotate-180'].join(' ');
  // Collapsed (mini) should end pointing RIGHT (0deg); Expanded should end LEFT (180deg)
  return [base, miniSidebar.value ? 'animate-chevron-ccw' : 'animate-chevron-cw'].join(' ');
});

// Small icon helper shared with dropdown template
function iconFor(item) {
  const t = (item?.type || '').toLowerCase();
  if (t.includes('leave')) return 'Calendar';
  if (t.includes('dbs')) return 'ShieldCheck';
  if (t.includes('train')) return 'GraduationHat01';
  if (t.includes('expense')) return 'Tag01';
  if (t.includes('doc')) return 'File01';
  return 'Bell01';
}

// Human-readable subtitle for notification items
function subtitleFor(it) {
  const t = (it?.type || '').toLowerCase();
  const m = it?.meta || {};
  const safeFmt = (d) => {
    try {
      if (!d) return '';
      const dt = new Date(d);
      return Number.isNaN(+dt) ? '' : dt.toLocaleDateString();
    } catch { return ''; }
  };
  if (t.includes('dbs')) {
    const exp = m.expiry || m.expiryDate;
    if (exp) {
      const isPast = new Date(exp).getTime() < Date.now();
      return `DBS ${isPast ? 'expired' : 'expires'} ${safeFmt(exp)}`;
    }
    return 'DBS expiry';
  }
  if (t.includes('leave')) {
    const from = m.from || m.start;
    const to = m.to || m.end;
    if (from && to) return `Leave ${safeFmt(from)} – ${safeFmt(to)}`;
    if (from) return `Leave from ${safeFmt(from)}`;
  }
  if (t.includes('train')) {
    const exp = m.expiry || m.expiryDate;
    if (exp) return `Training expires ${safeFmt(exp)}`;
    if (typeof m?.name === 'string') return m.name;
  }
  if (typeof m?.summary === 'string') return m.summary;
  // Avoid dumping raw object
  return '';
}

// Social notifications helpers
function fullName(u){ try { return `${u.firstName||''} ${u.lastName||''}`.trim() || u.email; } catch { return 'User'; } }
function formatDate(d){ try { return new Date(d).toLocaleString(); } catch { return ''; } }
function socialText(n){
  if (n.type === 'post_reaction') return 'reacted to your post';
  if (n.type === 'post_comment') return 'commented on your post';
  if (n.type === 'mention') return 'mentioned you';
  if (n.type === 'comment_like') return 'liked your comment';
  return 'updated you';
}
async function loadSocialNotifs(reset = false){
  if (reset) {
    socialCursor.value = null;
    socialHasMore.value = true;
    socialNotifs.value = [];
  }
  if (socialLoading.value || (!reset && !socialHasMore.value)) return;
  socialLoading.value = true;
  try {
    const params = { limit: 20, unread: false };
    if (!reset && socialCursor.value) params.cursor = socialCursor.value;
    const { items, unreadCount, nextCursor } = await listNotifications(params);
    const payload = items || [];
    socialNotifs.value = reset ? payload : [...socialNotifs.value, ...payload];
    unreadSocialCount.value = unreadCount || 0;
    socialCursor.value = nextCursor || null;
    socialHasMore.value = Boolean(nextCursor);
  } catch {}
  finally {
    socialLoading.value = false;
  }
}
async function markSocial(n){
  try { await markNotificationRead(n._id); n.readAt = new Date(); unreadSocialCount.value = Math.max(0, unreadSocialCount.value - 1); } catch {}
}
async function markAllSocial(){
  try { await markAllNotificationsRead(); socialNotifs.value.forEach(x => { x.readAt = new Date(); }); unreadSocialCount.value = 0; } catch {}
}
</script>

<style scoped>
/* Minimal tweaks for layout wrapper if needed */
@keyframes chevron-cw {
  from { transform: rotate(0deg); }
  to { transform: rotate(180deg); }
}
@keyframes chevron-ccw {
  from { transform: rotate(180deg); }
  to { transform: rotate(0deg); }
}
.animate-chevron-cw {
  animation: chevron-cw 0.3s ease-in-out forwards;
}
.animate-chevron-ccw {
  animation: chevron-ccw 0.3s ease-in-out forwards;
}
</style>
