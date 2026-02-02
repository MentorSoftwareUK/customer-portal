<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { loadStripe, type Stripe, type StripeEmbeddedCheckout } from '@stripe/stripe-js'

const props = defineProps<{
  publishableKey: string
  clientSecret: string
}>()

const mountEl = ref<HTMLElement | null>(null)
const error = ref<string | null>(null)
const loading = ref(true)

let stripe: Stripe | null = null
let embedded: StripeEmbeddedCheckout | null = null

async function mount() {
  if (!mountEl.value) return

  error.value = null
  loading.value = true

  try {
    stripe = await loadStripe(props.publishableKey)
    if (!stripe) {
      throw new Error('Failed to load Stripe')
    }

    embedded = await stripe.initEmbeddedCheckout({ clientSecret: props.clientSecret })
    embedded.mount(mountEl.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to initialise Stripe checkout'
  } finally {
    loading.value = false
  }
}

function cleanup() {
  try {
    embedded?.destroy()
  } catch {
    // ignore
  }
  embedded = null
}

onMounted(async () => {
  await mount()
})

watch(
  () => props.clientSecret,
  async (next, prev) => {
    if (!next || next === prev) return
    cleanup()
    await mount()
  },
)

onBeforeUnmount(() => {
  cleanup()
})
</script>

<template>
  <div class="space-y-3">
    <div v-if="error" class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-200">
      {{ error }}
    </div>

    <div v-if="loading" role="status" class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 animate-pulse">
      <div class="space-y-3">
        <div class="h-3 w-44 rounded-full bg-gray-200 dark:bg-gray-700" />
        <div class="h-2.5 w-72 rounded-full bg-gray-200 dark:bg-gray-700" />
        <div class="h-2.5 w-60 rounded-full bg-gray-200 dark:bg-gray-700" />
      </div>
      <span class="sr-only">Loading...</span>
    </div>

    <div ref="mountEl" />
  </div>
</template>
