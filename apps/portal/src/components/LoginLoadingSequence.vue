<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps<{
  done: boolean
}>()

const emit = defineEmits<{
  (e: 'complete'): void
}>()

const steps = [
  'Verifying your email',
  'Checking customer status',
  'Checking your account',
  'Preparing your portal',
]

const currentIdx = ref(0)
const direction = ref<'next' | 'prev'>('next')
let timer: ReturnType<typeof setTimeout> | null = null

// Pacing: distribute time evenly so no single step feels stuck.
// Steps 0-2 advance at ~1.8s each; step 3 waits for API completion.
const STEP_INTERVAL = 1200

const progress = computed(() => {
  if (currentIdx.value >= steps.length - 1) return 100
  // Each completed step = 25%, active step fills over STEP_INTERVAL
  return ((currentIdx.value + 1) / steps.length) * 100
})

const currentLabel = computed(() => steps[currentIdx.value] ?? steps[steps.length - 1]!)

function advance() {
  if (currentIdx.value >= steps.length - 1) return
  direction.value = 'next'
  currentIdx.value++
}

function scheduleNext() {
  // Don't auto-advance past step 2 (index 2) — step 3 waits for API.
  if (currentIdx.value >= steps.length - 2) return
  timer = setTimeout(() => {
    advance()
    scheduleNext()
  }, STEP_INTERVAL)
}

onMounted(() => {
  // Small initial delay so the first step is visible before advancing.
  timer = setTimeout(() => {
    advance()
    scheduleNext()
  }, STEP_INTERVAL)
})

watch(
  () => props.done,
  (isDone) => {
    if (!isDone) return
    if (timer) {
      clearTimeout(timer)
      timer = null
    }

    // Fast-forward remaining steps then emit complete.
    function finishFast() {
      if (currentIdx.value < steps.length - 1) {
        advance()
        timer = setTimeout(finishFast, 400)
      } else {
        timer = setTimeout(() => emit('complete'), 800)
      }
    }

    timer = setTimeout(finishFast, 300)
  },
)

onUnmounted(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <div class="py-8 flex flex-col items-center">

    <!-- Single-step swipe area — above the bar -->
    <div class="relative w-full h-16 overflow-hidden mb-8">
      <Transition :name="direction === 'next' ? 'swipe' : 'swipe-back'" mode="out-in">
        <div :key="currentIdx" class="absolute inset-0 flex flex-col items-center justify-center">
          <!-- Spinner -->
          <svg
            class="w-6 h-6 mb-2.5 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle cx="12" cy="12" r="10" stroke="#e5e7eb" stroke-width="2" />
            <path
              d="M22 12a10 10 0 0 0-10-10"
              stroke="#e7007e"
              stroke-width="2.5"
              stroke-linecap="round"
            />
          </svg>

          <!-- Step label -->
          <p class="text-sm font-medium text-gray-700 tracking-wide">
            {{ currentLabel }}
            <span class="inline-flex ml-0.5">
              <span class="dot" style="animation-delay: 0ms">.</span>
              <span class="dot" style="animation-delay: 200ms">.</span>
              <span class="dot" style="animation-delay: 400ms">.</span>
            </span>
          </p>
        </div>
      </Transition>
    </div>

    <!-- Progress bar -->
    <div class="w-full h-1 bg-gray-100 rounded-full overflow-hidden mb-6">
      <div
        class="h-full bg-gradient-to-r from-primary-600 to-primary-400 rounded-full transition-all duration-700 ease-out"
        :style="{ width: `${progress}%` }"
      />
    </div>

    <!-- Step dots -->
    <div class="flex items-center gap-2">
      <div
        v-for="(_, i) in steps"
        :key="i"
        class="h-1.5 rounded-full transition-all duration-500 ease-out"
        :class="
          i < currentIdx
            ? 'w-1.5 bg-emerald-400'
            : i === currentIdx
              ? 'w-6 bg-primary-500'
              : 'w-1.5 bg-gray-200'
        "
      />
    </div>
  </div>
</template>

<style scoped>
/* Swipe left (next step) */
.swipe-enter-active,
.swipe-leave-active {
  transition: all 0.45s cubic-bezier(0.4, 0, 0.2, 1);
}

.swipe-enter-from {
  opacity: 0;
  transform: translateX(60px);
}

.swipe-leave-to {
  opacity: 0;
  transform: translateX(-60px);
}

/* Dots animation */
.dot {
  animation: dotPulse 1.4s ease-in-out infinite;
  opacity: 0;
}

@keyframes dotPulse {
  0%, 80%, 100% { opacity: 0; }
  40% { opacity: 1; }
}
</style>
