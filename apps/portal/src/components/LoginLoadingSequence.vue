<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps<{
  done: boolean
}>()

const emit = defineEmits<{
  (e: 'complete'): void
}>()

type StepStatus = 'pending' | 'active' | 'done'

const steps = ref<{ label: string; status: StepStatus }[]>([
  { label: 'Verifying your email', status: 'active' },
  { label: 'Checking customer status', status: 'pending' },
  { label: 'Confirming subscription', status: 'pending' },
  { label: 'Preparing your portal', status: 'pending' },
])

let currentIdx = 0
let timer: ReturnType<typeof setTimeout> | null = null

function advance() {
  if (currentIdx >= steps.value.length - 1) return
  steps.value[currentIdx].status = 'done'
  currentIdx++
  steps.value[currentIdx].status = 'active'
}

function scheduleNext() {
  timer = setTimeout(() => {
    advance()
    if (currentIdx < steps.value.length - 1) {
      scheduleNext()
    }
  }, 700)
}

onMounted(scheduleNext)

watch(
  () => props.done,
  (isDone) => {
    if (!isDone) return
    if (timer) {
      clearTimeout(timer)
      timer = null
    }

    function finishFast() {
      if (currentIdx < steps.value.length - 1) {
        advance()
        timer = setTimeout(finishFast, 250)
      } else {
        steps.value[currentIdx].status = 'done'
        timer = setTimeout(() => emit('complete'), 600)
      }
    }

    timer = setTimeout(finishFast, 200)
  },
)

onUnmounted(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <div class="py-6">
    <p class="text-sm text-white/60 mb-6">Setting up your portal experience</p>

    <div class="space-y-4">
      <div
        v-for="(s, i) in steps"
        :key="i"
        class="flex items-center gap-3.5 step-enter"
        :style="{ animationDelay: `${i * 120}ms` }"
      >
        <!-- Icon -->
        <div class="flex-shrink-0 w-6 h-6 flex items-center justify-center">
          <!-- Done: checkmark -->
          <svg
            v-if="s.status === 'done'"
            class="w-5 h-5 text-emerald-400 check-pop"
            viewBox="0 0 20 20"
            fill="none"
          >
            <circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5" opacity="0.3" />
            <path
              d="M6 10.5l2.5 2.5L14 7.5"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>

          <!-- Active: spinner -->
          <svg
            v-else-if="s.status === 'active'"
            class="w-5 h-5 animate-spin"
            viewBox="0 0 20 20"
            fill="none"
          >
            <circle cx="10" cy="10" r="8" stroke="white" stroke-width="2" opacity="0.15" />
            <path
              d="M18 10a8 8 0 0 0-8-8"
              stroke="#e7007e"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>

          <!-- Pending: dim dot -->
          <div v-else class="w-2 h-2 rounded-full bg-white/20" />
        </div>

        <!-- Label -->
        <span
          class="text-sm font-medium transition-colors duration-300"
          :class="{
            'text-emerald-300': s.status === 'done',
            'text-white': s.status === 'active',
            'text-white/30': s.status === 'pending',
          }"
        >
          {{ s.label }}
          <span v-if="s.status === 'active'" class="inline-flex ml-0.5">
            <span class="dot" style="animation-delay: 0ms">.</span>
            <span class="dot" style="animation-delay: 200ms">.</span>
            <span class="dot" style="animation-delay: 400ms">.</span>
          </span>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.step-enter {
  animation: slideIn 0.4s ease-out both;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.check-pop {
  animation: popIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@keyframes popIn {
  from {
    transform: scale(0.4);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.dot {
  animation: dotPulse 1.4s ease-in-out infinite;
  opacity: 0;
}

@keyframes dotPulse {
  0%, 80%, 100% { opacity: 0; }
  40% { opacity: 1; }
}
</style>
