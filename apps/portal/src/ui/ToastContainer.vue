<script setup lang="ts">
import { toastState, removeToast } from '../lib/toast'
</script>

<template>
  <Teleport to="body">
    <div class="fixed bottom-4 right-4 z-[9999] flex flex-col-reverse items-end gap-2 pointer-events-none">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toastState.items"
          :key="toast.id"
          class="flex items-center w-full max-w-sm p-4 rounded-xl shadow-lg pointer-events-auto overflow-hidden"
          :class="{
            'bg-white border-l-4 border-emerald-400 shadow-sm': toast.type === 'success',
            'bg-white border-l-4 border-rose-400 shadow-sm': toast.type === 'error',
            'bg-white border-l-4 border-primary-400 shadow-sm': toast.type === 'info',
            'bg-white border-l-4 border-amber-400 shadow-sm': toast.type === 'warning',
          }"
          role="alert"
        >
          <!-- Icon -->
          <div
            class="flex-shrink-0 rounded-full p-1"
            :class="{
              'bg-emerald-50 text-emerald-600': toast.type === 'success',
              'bg-rose-50 text-rose-600': toast.type === 'error',
              'bg-primary-50 text-primary-600': toast.type === 'info',
              'bg-amber-50 text-amber-600': toast.type === 'warning',
            }"
          >
            <svg v-if="toast.type === 'success'" class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
            </svg>
            <svg v-else-if="toast.type === 'error'" class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
            </svg>
            <svg v-else-if="toast.type === 'warning'" class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
            </svg>
            <svg v-else class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z"/>
            </svg>
          </div>

          <!-- Message -->
          <div class="ml-3 flex-1 min-w-0">
            <p class="text-sm text-gray-900 leading-snug">{{ toast.message }}</p>
          </div>

          <!-- Close -->
          <button
            type="button"
            class="ml-3 flex-shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
            @click="removeToast(toast.id)"
            aria-label="Dismiss"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
@keyframes toast-in {
  0%   { transform: translateX(115%); opacity: 0; }
  55%  { transform: translateX(-14px); opacity: 1; }
  75%  { transform: translateX(6px); }
  90%  { transform: translateX(-3px); }
  100% { transform: translateX(0); }
}

.toast-enter-active {
  animation: toast-in 0.52s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
.toast-enter-from {
  /* handled by keyframe */
}
.toast-leave-active {
  transition: all 0.22s ease-in;
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(110%);
}
.toast-move {
  transition: transform 0.28s ease;
}
</style>
