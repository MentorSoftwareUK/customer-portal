<template>
  <div v-if="open" class="fixed inset-0 z-[100]" @keydown.stop="onKeydown">
    <div class="absolute inset-0 bg-black/40" @click="close" />
    <div class="relative mx-auto mt-[10vh] w-[95%] max-w-2xl rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-gray-800">
      <!-- Input -->
      <div class="flex items-center gap-3 px-4 py-3 focus-within:ring-2 focus-within:ring-blue-500/20 rounded-t-2xl">
        <UntitledIcon name="SearchMd" class="w-5 h-5 text-gray-400" />
        <input
          ref="inputEl"
          v-model="q"
          type="text"
          class="w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-500 outline-none ring-0 focus:ring-0 focus-visible:outline-none border-0 focus:border-0 appearance-none dark:text-gray-100 dark:placeholder:text-gray-400"
          placeholder="Search people, pages…"
          @input="onInput"
        />
        <span class="hidden sm:inline text-[10px] text-gray-500 dark:text-gray-400">⌘K</span>
      </div>
      <!-- Results -->
      <div class="max-h-[60vh] overflow-auto py-2 px-2">
        <div class="rounded-xl ring-1 ring-black/5 shadow-lg bg-white/90 dark:bg-gray-800/80 overflow-hidden divide-y divide-gray-100 dark:divide-gray-700">
        <!-- Initial commands -->
        <template v-if="!q.trim()">
          <div class="py-1.5">
            <div class="px-3 py-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Quick actions</div>
            <div>
              <button
                v-for="(it, i) in quickActions"
                :key="it.key"
                class="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 focus-visible:outline-none"
                :class="i===activeIndex ? 'bg-gray-50 dark:bg-gray-700 ring-1 ring-blue-400/20' : ''"
                @click="select(it)"
              >
                <UntitledIcon :name="it.icon || 'SearchMd'" class="w-5 h-5 text-gray-500 dark:text-gray-300" />
                <div class="min-w-0">
                  <div class="truncate text-sm text-gray-900 dark:text-gray-100">{{ it.title }}</div>
                </div>
              </button>
            </div>
          </div>
        </template>
        <template v-else>
          <div v-if="users.length" class="py-1.5">
            <div class="px-3 py-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">People</div>
            <div>
              <button
                v-for="(u, i) in users"
                :key="u._id || u.email"
                class="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 focus-visible:outline-none"
                :class="i===activeIndex ? 'bg-gray-50 dark:bg-gray-700 ring-1 ring-blue-400/20' : ''"
                @click="select(mapUser(u))"
              >
                <UntitledIcon name="UserCircle" class="w-5 h-5 text-gray-500 dark:text-gray-300" />
                <div class="min-w-0">
                  <div class="truncate text-sm text-gray-900 dark:text-gray-100">{{ mapUser(u).title }}</div>
                  <div class="truncate text-xs text-gray-500 dark:text-gray-400">{{ mapUser(u).subtitle }}</div>
                </div>
              </button>
            </div>
          </div>
          <div v-if="routesFiltered.length" class="py-1.5">
            <div class="px-3 py-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Pages</div>
            <div>
              <button
                v-for="(r, i) in routesFiltered"
                :key="r.key"
                class="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 focus-visible:outline-none"
                :class="(i + users.length)===activeIndex ? 'bg-gray-50 dark:bg-gray-700 ring-1 ring-blue-400/20' : ''"
                @click="select(r)"
              >
                <UntitledIcon :name="r.icon || 'SearchMd'" class="w-5 h-5 text-gray-500 dark:text-gray-300" />
                <div class="min-w-0">
                  <div class="truncate text-sm text-gray-900 dark:text-gray-100">{{ r.title }}</div>
                </div>
              </button>
            </div>
          </div>
          <div v-if="!loading && !users.length && !routesFiltered.length" class="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">No results</div>
          <div v-if="loading" class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">Searching…</div>
          <div v-if="error" class="px-4 py-3 text-sm text-red-600">{{ error }}</div>
        </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import UntitledIcon from './UntitledIcon.vue';

const props = defineProps({ open: { type: Boolean, default: false } });
const emit = defineEmits(['close']);

const router = useRouter();
const q = ref('');
const inputEl = ref(null);
const loading = ref(false);
const error = ref('');
const users = ref([]);
const activeIndex = ref(0);
let reqId = 0;
let debounceTimer;

const quickActions = computed(() => [
  { key: 'nav:dashboard', type: 'route', title: 'Dashboard', icon: 'LayoutGrid01', to: '/' },
  { key: 'nav:directory', type: 'route', title: 'Directory', icon: 'Users01', to: '/directory' },
  { key: 'nav:contacts', type: 'route', title: 'Key contacts', icon: 'Phone', to: '/contacts' },
  { key: 'nav:documents', type: 'route', title: 'Documents', icon: 'File01', to: '/documents' },
  { key: 'nav:leave', type: 'route', title: 'Annual leave', icon: 'Calendar', to: '/annual-leave' },
  { key: 'nav:offers', type: 'route', title: 'Offers & Perks', icon: 'Tag01', to: '/offers' },
]);

const routesFiltered = computed(() => {
  const t = q.value.trim().toLowerCase();
  if (!t) return quickActions.value;
  return quickActions.value.filter(a => a.title.toLowerCase().includes(t));
});

function close() {
  emit('close');
  q.value = '';
  users.value = [];
  error.value = '';
  activeIndex.value = 0;
}

function onInput() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(searchAll, 200);
}

async function searchAll() {
  const term = q.value.trim();
  if (!term) { users.value = []; error.value=''; return; }
  const thisReq = ++reqId;
  loading.value = true; error.value = '';
  try {
    // People
    const params = new URLSearchParams({ q: term, page: '1', limit: '8' });
    const res = await fetch(`/api/users?${params.toString()}`, { credentials: 'include' });
    if (thisReq !== reqId) return; // stale
    if (!res.ok) throw new Error('Search failed');
    const data = await res.json();
    users.value = Array.isArray(data.items) ? data.items : [];
  } catch {
    if (thisReq !== reqId) return; // stale
    users.value = [];
    // keep error light; don't spam
    error.value = '';
  } finally {
    if (thisReq === reqId) loading.value = false;
  }
}

function mapUser(u) {
  const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email;
  return { key: `user:${u._id || u.email}`, type: 'user', title: name, subtitle: u.email, icon: 'UserCircle', user: u };
}

function select(item) {
  if (!item) return;
  if (item.type === 'route') {
    router.push(item.to);
    close();
    return;
  }
  if (item.type === 'user') {
    // Navigate to directory with query prefilled
    const qStr = encodeURIComponent(item.user.email || item.title);
    router.push({ path: '/directory', query: { q: qStr } });
    close();
    return;
  }
}

function onKeydown(e) {
  if (e.key === 'Escape') { e.preventDefault(); close(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex.value = Math.min(activeIndex.value + 1, Math.max(0, users.value.length + routesFiltered.value.length - 1)); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex.value = Math.max(activeIndex.value - 1, 0); return; }
  if (e.key === 'Enter') {
    const items = q.value.trim() ? [...users.value.map(mapUser), ...routesFiltered.value] : quickActions.value;
    const it = items[activeIndex.value];
    if (it) select(it);
  }
}

watch(() => props.open, async (v) => {
  if (v) {
    await nextTick();
    try { inputEl.value?.focus(); } catch {}
  }
});

// No JSX subcomponents; templates inline above
</script>
