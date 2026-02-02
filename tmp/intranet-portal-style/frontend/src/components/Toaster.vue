<template>
  <!-- Toast portal overlay: pointer events disabled except on actual toasts -->
  <div class="fixed inset-0 z-[9999] pointer-events-none">
    <div
      class="absolute right-4 flex flex-col gap-2 items-end"
      :style="{ top: 'calc(var(--hg-nav-h, 64px) + 4px)' }"
    >
      <button
        v-if="store.toasts.length > 1"
        type="button"
        class="pointer-events-auto mb-1 self-end text-xs text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 underline"
        aria-label="Clear all notifications"
        @click="store.removeAll()"
      >
        Clear all
      </button>
      <TransitionGroup name="toast-bounce">
        <div
          v-for="t in store.toasts"
          :key="t.id"
          class="pointer-events-auto w-full max-w-xs"
        >
          <!-- macOS-like actionable toast when actions/title/description present -->
          <div
            v-if="t.actions && t.actions.length"
            class="toast rounded-xl overflow-hidden bg-white/60 dark:bg-gray-800/40 backdrop-blur-md border border-white/40 dark:border-gray-700/40 shadow-lg"
          >
            <div class="grid grid-cols-12">
              <div class="col-span-9">
                <div class="flex items-center gap-4 p-4">
                  <div class="shrink-0">
                    <img
                      :src="logoUrl"
                      alt="Company logo"
                      class="h-9 w-9 rounded-md"
                    >
                  </div>
                  <div class="grow min-w-0">
                    <div class="line-clamp-1 font-bold text-sm text-gray-900 dark:text-gray-100">
                      {{ t.title || 'Notification' }}
                    </div>
                    <div class="line-clamp-2 text-xs text-gray-700 dark:text-gray-300">
                      {{ t.description || t.message }}
                    </div>
                  </div>
                </div>
              </div>
              <div class="col-span-3 border-s border-white/40 dark:border-gray-700/40">
                <div class="flex h-full w-full flex-col items-stretch justify-center divide-y divide-white/40 dark:divide-gray-700/40">
                  <button
                    v-for="(action, idx) in t.actions"
                    :key="idx"
                    class="h-full w-full py-1 text-xs hover:bg-white/40 dark:hover:bg-gray-700/30"
                    @click="runAction(action, t)"
                  >
                    {{ action.label || 'Action' }}
                  </button>
                  <button
                    class="h-full w-full py-1 text-xs hover:bg-white/40 dark:hover:bg-gray-700/30"
                    @click="store.remove(t.id)"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
          <!-- default simple toast -->
          <div
            v-else
            :class="wrapperClass(t.type) + ' toast'"
            role="alert"
          >
            <div :class="iconWrapClass(t.type)">
              <svg
                v-if="t.type==='success'"
                class="w-5 h-5"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5Zm3.707 8.207-4 4a1 1 0 0 1-1.414 0l-2-2a1 1 0 0 1 1.414-1.414L9 10.586l3.293-3.293a1 1 0 0 1 1.414 1.414Z" />
              </svg>
              <svg
                v-else-if="t.type==='error'"
                class="w-5 h-5"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5Zm3.707 11.793a1 1 0 1 1-1.414 1.414L10 11.414l-2.293 2.293a1 1 0 0 1-1.414-1.414L8.586 10 6.293 7.707a1 1 0 0 1 1.414-1.414L10 8.586l2.293-2.293a1 1 0 0 1 1.414 1.414L11.414 10l2.293 2.293Z" />
              </svg>
              <svg
                v-else-if="t.type==='warning'"
                class="w-5 h-5"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM10 15a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm1-4a1 1 0 0 1-2 0V6a1 1 0 0 1 2 0v5Z" />
              </svg>
              <svg
                v-else
                class="w-5 h-5"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm.75 4v5.25h3a.75.75 0 010 1.5h-4.5V6a.75.75 0 011.5 0z" />
              </svg>
              <span class="sr-only">Icon</span>
            </div>
            <div
              class="ms-3 text-sm font-normal"
              v-text="t.message"
            />
            <button
              type="button"
              class="ms-auto -mx-1.5 -my-1.5 bg-white text-gray-400 hover:text-gray-900 rounded-lg focus:ring-2 focus:ring-gray-300 p-1.5 hover:bg-gray-100 inline-flex items-center justify-center h-8 w-8 dark:text-gray-500 dark:hover:text-white dark:bg-gray-800 dark:hover:bg-gray-700"
              :aria-label="`Close`"
              @click="store.remove(t.id)"
            >
              <svg
                class="w-3 h-3"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 14 14"
                aria-hidden="true"
              >
                <path
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"
                />
              </svg>
              <span class="sr-only">Close</span>
            </button>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount } from 'vue';
import { useToastStore } from '../stores/toast.js';
import { useRouter } from 'vue-router';

const store = useToastStore();
const router = useRouter();
// Base-aware public URL so it works when the app is served from a sub-path
const logoUrl = import.meta.env.BASE_URL + 'images/logo.png';

function onKey(e) {
  if (e.key !== 'Escape') return;
  if (store.toasts.length === 0) return;
  if (e.shiftKey) {
    store.removeAll();
  } else {
    // remove the most recent
    const last = store.toasts[store.toasts.length - 1];
    if (last) store.remove(last.id);
  }
}

onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

function wrapperClass(type) {
  const base = 'flex items-center w-full p-4 text-gray-600 bg-white rounded-lg shadow-sm border-l-4 dark:text-gray-300 dark:bg-gray-800';
  const color = {
    success: 'border-green-500',
    error: 'border-red-500',
    warning: 'border-orange-500',
    info: 'border-blue-500'
  }[type] || 'border-blue-500';
  return [base, color].join(' ');
}
function iconWrapClass(type) {
  const map = {
    success: 'text-green-500 bg-green-100 dark:bg-green-800 dark:text-green-200',
    error: 'text-red-500 bg-red-100 dark:bg-red-800 dark:text-red-200',
    warning: 'text-orange-500 bg-orange-100 dark:bg-orange-700 dark:text-orange-200',
    info: 'text-blue-500 bg-blue-100 dark:bg-blue-800 dark:text-blue-200'
  };
  return ['inline-flex items-center justify-center shrink-0 w-8 h-8 rounded-lg', map[type] || map.info].join(' ');
}

// Progress indicator removed for design review (no countdown)

function runAction(action, t) {
  try {
    if (typeof action?.onClick === 'function') {
      action.onClick({ toastId: t.id, close: () => store.remove(t.id), router });
    }
  } finally {
    // If the action didn't explicitly keep it open, close by default
    if (!action || action.autoClose !== false) store.remove(t.id);
  }
}
</script>

<style scoped>
/* Overshoot fly-in animation from the right, then snap back */
@keyframes toast-enter {
  0% { transform: translateX(120%); opacity: 0; }
  60% { transform: translateX(-4%); opacity: 1; }
  80% { transform: translateX(2%); }
  100% { transform: translateX(0); }
}
@keyframes toast-leave {
  0% { transform: translateX(0); opacity: 1; }
  100% { transform: translateX(120%); opacity: 0; }
}
.toast-bounce-enter-active {
  animation: toast-enter 450ms cubic-bezier(0.22, 1, 0.36, 1);
}
.toast-bounce-leave-active {
  animation: toast-leave 200ms ease-in forwards;
}

/* No progress bar while reviewing design */
</style>
