<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getTicket, replyToTicket, type TicketDetailDto } from '../lib/api'
import { useFeatureFlags } from '../lib/featureFlags'

const route = useRoute()
const router = useRouter()
const ticketId = computed(() => String(route.params.id ?? ''))

const loading = ref(true)
const loadError = ref<string | null>(null)
const warning = ref<string | null>(null)
const ticket = ref<TicketDetailDto | null>(null)

const replyText = ref('')
const replying = ref(false)
const replyError = ref<string | null>(null)
const { featureFlags, loadFeatureFlags } = useFeatureFlags()

async function load() {
  await loadFeatureFlags()
  if (!featureFlags.value.ticketsEnabled) {
    loading.value = false
    router.replace('/app/dashboard')
    return
  }

  loading.value = true
  loadError.value = null
  warning.value = null
  try {
    const data = await getTicket(ticketId.value)
    ticket.value = data.ticket
    warning.value = data.warning ?? null
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load ticket'
  } finally {
    loading.value = false
  }
}

async function submitReply() {
  if (!ticket.value) return
  const msg = replyText.value.trim()
  if (!msg) return

  replyError.value = null
  replying.value = true
  try {
    const data = await replyToTicket(ticket.value.id, msg)
    ticket.value = data.ticket
    warning.value = data.warning ?? warning.value
    replyText.value = ''
  } catch (e) {
    replyError.value = e instanceof Error ? e.message : 'Failed to send reply'
  } finally {
    replying.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-6">
      <div v-if="loadError" class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-200">
        {{ loadError }}
      </div>

      <div v-else-if="loading" role="status" class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 animate-pulse">
        <div class="space-y-3">
          <div class="h-3 w-36 rounded-full bg-gray-200 dark:bg-gray-700" />
          <div class="h-2.5 w-80 rounded-full bg-gray-200 dark:bg-gray-700" />
          <div class="h-2.5 w-64 rounded-full bg-gray-200 dark:bg-gray-700" />
        </div>
        <span class="sr-only">Loading...</span>
      </div>

      <div v-else-if="ticket" class="ui-surface relative shadow-md sm:rounded-lg overflow-hidden">
        <div v-if="warning" class="border-b border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/30 dark:bg-amber-900/20 dark:text-amber-200">
          {{ warning }}
        </div>

        <div class="border-b border-gray-200 dark:border-gray-700 p-4">
          <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">#{{ ticket.id }} · {{ ticket.subject }}</h2>
              <div class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Status: <span class="font-medium text-gray-900 dark:text-white">{{ ticket.status }}</span> · Last updated: {{ ticket.lastUpdatedLabel }}
              </div>
            </div>
            <RouterLink
              to="/app/tickets"
              class="ui-btn-secondary"
            >
              Back to tickets
            </RouterLink>
          </div>
        </div>

        <div class="p-4 space-y-3">
          <div class="text-sm font-semibold text-gray-900 dark:text-white">Conversation</div>

          <div class="space-y-3">
            <div
              v-for="m in ticket.messages"
              :key="m.id"
              class="flex"
              :class="m.direction === 'customer' ? 'justify-end' : 'justify-start'"
            >
              <div
                class="max-w-2xl rounded-lg border px-3 py-2"
                :class="m.direction === 'customer'
                  ? 'bg-primary-50 border-primary-200 text-gray-900 dark:bg-primary-900/20 dark:border-primary-900/30 dark:text-gray-100'
                  : 'bg-gray-50 border-gray-200 text-gray-900 dark:bg-gray-900/20 dark:border-gray-700 dark:text-gray-100'"
              >
                <div class="text-xs text-gray-500 dark:text-gray-400">{{ m.direction === 'customer' ? 'You' : 'Support' }} · {{ m.timeLabel }}</div>
                <div class="mt-1 text-sm whitespace-pre-wrap">{{ m.body }}</div>
              </div>
            </div>
          </div>

          <div class="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div class="text-sm font-semibold text-gray-900 dark:text-white">Reply</div>

            <div v-if="replyError" class="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-200">
              {{ replyError }}
            </div>

            <textarea
              v-model="replyText"
              rows="4"
              class="mt-3 ui-input"
              placeholder="Type your reply…"
            />

            <div class="mt-3 flex items-center justify-end">
              <button
                type="button"
                class="ui-btn-primary"
                :disabled="replying || !replyText.trim()"
                @click="submitReply"
              >
                <span v-if="replying">Sending…</span>
                <span v-else>Send reply</span>
              </button>
            </div>
          </div>
        </div>
      </div>
  </div>
</template>
