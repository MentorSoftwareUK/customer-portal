<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  adminCreateNotification,
  adminDeleteNotification,
  adminListNotifications,
  adminPatchNotification,
  type GlobalNotificationDto,
  type NotificationLevel,
} from '../../lib/api'
import { useToast } from '../../lib/toast'

const toast = useToast()

const loading = ref(true)
const error = ref<string | null>(null)
const notifications = ref<GlobalNotificationDto[]>([])

const creating = ref(false)
const form = ref<{
  level: NotificationLevel
  title: string
  message: string
  enabled: boolean
  startsAtLocal: string
  endsAtLocal: string
}>({
  level: 'info',
  title: '',
  message: '',
  enabled: true,
  startsAtLocal: '',
  endsAtLocal: '',
})

const canCreate = computed(() => form.value.title.trim().length > 0 && form.value.message.trim().length > 0)

function localDateTimeToIsoOrNull(localValue: string): string | null {
  const v = (localValue ?? '').trim()
  if (!v) return null
  const ms = new Date(v).getTime()
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toISOString()
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await adminListNotifications()
    notifications.value = res.notifications
  } catch (e: any) {
    error.value = e?.message ? String(e.message) : 'Failed to load notifications'
    notifications.value = []
  } finally {
    loading.value = false
  }
}

async function create() {
  if (!canCreate.value) return
  creating.value = true
  error.value = null
  try {
    await adminCreateNotification({
      level: form.value.level,
      title: form.value.title,
      message: form.value.message,
      enabled: form.value.enabled,
      startsAtIso: localDateTimeToIsoOrNull(form.value.startsAtLocal),
      endsAtIso: localDateTimeToIsoOrNull(form.value.endsAtLocal),
    })

    form.value.title = ''
    form.value.message = ''
    form.value.startsAtLocal = ''
    form.value.endsAtLocal = ''

    toast.success('Notification created')
    await load()
  } catch (e: any) {
    error.value = e?.message ? String(e.message) : 'Failed to create notification'
    toast.error('Failed to create notification')
  } finally {
    creating.value = false
  }
}

async function setEnabled(n: GlobalNotificationDto, enabled: boolean) {
  error.value = null
  try {
    await adminPatchNotification(n.id, { enabled })
    notifications.value = notifications.value.map((x) => (x.id === n.id ? { ...x, enabled } : x))
  } catch (e: any) {
    error.value = e?.message ? String(e.message) : 'Failed to update notification'
    toast.error('Failed to update notification')
  }
}

function onEnabledChange(n: GlobalNotificationDto, e: Event) {
  const target = e.target as HTMLInputElement | null
  const enabled = Boolean(target?.checked)
  void setEnabled(n, enabled)
}

async function del(n: GlobalNotificationDto) {
  if (!confirm(`Delete notification "${n.title}"?`)) return
  error.value = null
  try {
    await adminDeleteNotification(n.id)
    notifications.value = notifications.value.filter((x) => x.id !== n.id)
    toast.success('Notification deleted')
  } catch (e: any) {
    error.value = e?.message ? String(e.message) : 'Failed to delete notification'
    toast.error('Failed to delete notification')
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-2">
      <p class="text-xs uppercase tracking-[0.08em] text-gray-600">Control center</p>
      <h2 class="text-2xl font-semibold text-gray-900">Notifications</h2>
      <p class="text-sm text-gray-700">Create global banners shown to all portal users.</p>
    </div>

    <div v-if="error" class="rounded-lg bg-red-50 p-4 text-sm text-red-800">
      <p class="text-sm font-semibold text-red-800">Something went wrong</p>
      <p class="text-xs text-red-700">{{ error }}</p>
    </div>

    <div class="ui-surface p-5 shadow-sm">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h3 class="text-base font-semibold text-white">Create notification</h3>
          <p class="text-xs text-white/70">These appear at the top of the portal.</p>
        </div>
      </div>

      <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label class="ui-label">Level</label>
          <select v-model="form.level" class="ui-input mt-1">
            <option value="info">Info</option>
            <option value="success">Success</option>
            <option value="warning">Warning</option>
            <option value="danger">Danger</option>
            <option value="dark">Dark</option>
          </select>
        </div>

        <label class="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
          <span>Enabled</span>
          <input v-model="form.enabled" type="checkbox" class="h-5 w-5" />
        </label>

        <div class="md:col-span-2">
          <label class="ui-label">Title</label>
          <input v-model="form.title" class="ui-input mt-1" type="text" placeholder="Planned maintenance" />
        </div>

        <div class="md:col-span-2">
          <label class="ui-label">Message</label>
          <textarea v-model="form.message" class="ui-input mt-1" rows="3" placeholder="We'll be offline from 22:00–23:00." />
        </div>

        <div>
          <label class="ui-label">Starts at (optional)</label>
          <input v-model="form.startsAtLocal" class="ui-input mt-1" type="datetime-local" />
        </div>

        <div>
          <label class="ui-label">Ends at (optional)</label>
          <input v-model="form.endsAtLocal" class="ui-input mt-1" type="datetime-local" />
        </div>
      </div>

      <div class="mt-5 flex items-center justify-end gap-3">
        <button
          type="button"
          class="rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="creating || !canCreate"
          @click="create"
        >
          {{ creating ? 'Working…' : 'Create notification' }}
        </button>
      </div>
    </div>

    <div class="ui-surface p-5 shadow-sm">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h3 class="text-base font-semibold text-white">Existing notifications</h3>
          <p class="text-xs text-white/70">Enable/disable or delete banners.</p>
        </div>
        <button
          type="button"
          class="rounded-md bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 hover:bg-white/15"
          :disabled="loading"
          @click="load"
        >
          Refresh
        </button>
      </div>

      <div v-if="loading" class="mt-3 text-xs text-white/60">Loading…</div>
      <div v-else-if="!notifications.length" class="mt-3 text-xs text-white/60">No notifications yet.</div>

      <div v-else class="mt-3 space-y-2">
        <div v-for="n in notifications" :key="n.id" class="rounded-lg border border-white/10 bg-white/5 p-3">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/70">{{ n.level }}</span>
              </div>
              <div class="mt-1 text-sm font-semibold text-white">{{ n.title }}</div>
              <div class="mt-1 text-xs text-white/70">{{ n.message }}</div>
              <div v-if="n.startsAtIso || n.endsAtIso" class="mt-2 text-[11px] text-white/50">
                <span v-if="n.startsAtIso">Starts: {{ new Date(n.startsAtIso).toLocaleString() }}</span>
                <span v-if="n.startsAtIso && n.endsAtIso"> · </span>
                <span v-if="n.endsAtIso">Ends: {{ new Date(n.endsAtIso).toLocaleString() }}</span>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <label class="flex items-center gap-2 text-xs font-semibold text-white/80">
                <input
                  type="checkbox"
                  class="h-5 w-5"
                  :checked="n.enabled"
                  @change="onEnabledChange(n, $event)"
                />
                Enabled
              </label>

              <button
                type="button"
                class="rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/15"
                @click="del(n)"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
