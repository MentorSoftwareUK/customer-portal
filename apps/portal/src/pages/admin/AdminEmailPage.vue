<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  deleteAdminEmailTemplate,
  getAdminEmailTemplatePreview,
  getAdminSettings,
  listAdminEmailTemplates,
  patchAdminSettings,
  sendAdminEmailTemplateTest,
  upsertAdminEmailTemplate,
  type AdminEmailTemplateKey,
  type AdminEmailTemplateListItem,
  type AdminEmailTemplatePreviewResponse,
  type AdminSettings,
} from '../../lib/api'
import { useToast } from '../../lib/toast'

const toast = useToast()

const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)

const settings = ref<AdminSettings | null>(null)
const templates = ref<AdminEmailTemplateListItem[]>([])

const selectedKey = ref<AdminEmailTemplateKey>('event_confirmation')
const preview = ref<AdminEmailTemplatePreviewResponse | null>(null)

const draftSubject = ref<string>('')
const draftHtml = ref<string>('')
const draftText = ref<string>('')

const reminderLeadTimeHours = ref<number>(48)
const thankYouDelayHours = ref<number>(24)

const selectedTemplateMeta = computed(() => templates.value.find((t) => t.key === selectedKey.value) ?? null)
const effectiveSource = computed(() => preview.value?.effective.source ?? 'default')
const placeholderExample = '{{eventTitle}}'
const placeholderListLabel = computed(() => {
  if (!selectedTemplateMeta.value) return ''
  return selectedTemplateMeta.value.placeholders.map((p) => `{{${p}}}`).join('  ')
})

async function loadPreview() {
  preview.value = await getAdminEmailTemplatePreview(selectedKey.value)
  draftSubject.value = preview.value.override?.subject ?? ''
  draftHtml.value = preview.value.override?.html ?? ''
  draftText.value = preview.value.override?.text ?? ''
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const [settingsRes, templatesRes] = await Promise.all([getAdminSettings(), listAdminEmailTemplates()])
    settings.value = settingsRes.settings
    templates.value = templatesRes.templates

    reminderLeadTimeHours.value = settingsRes.settings.eventEmails.reminderLeadTimeHours
    thankYouDelayHours.value = settingsRes.settings.eventEmails.thankYouDelayHours

    await loadPreview()
  } catch (e: any) {
    error.value = e?.message ? String(e.message) : 'Failed to load email configuration'
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  error.value = null
  try {
    await patchAdminSettings({
      eventEmails: {
        reminderLeadTimeHours: Number.isFinite(reminderLeadTimeHours.value) ? reminderLeadTimeHours.value : 48,
        thankYouDelayHours: Number.isFinite(thankYouDelayHours.value) ? thankYouDelayHours.value : 24,
      },
    })

    await upsertAdminEmailTemplate(selectedKey.value, {
      subject: draftSubject.value?.trim() ? draftSubject.value : null,
      html: draftHtml.value?.trim() ? draftHtml.value : null,
      text: draftText.value?.trim() ? draftText.value : null,
    })

    toast.success('Email settings saved')
    await load()
  } catch (e: any) {
    const detail = e?.message ? String(e.message) : 'Failed to save'
    error.value = detail
    toast.error('Failed to save email settings')
  } finally {
    saving.value = false
  }
}

async function resetOverride() {
  saving.value = true
  error.value = null
  try {
    await deleteAdminEmailTemplate(selectedKey.value)
    toast.success('Template override cleared')
    await load()
  } catch (e: any) {
    error.value = e?.message ? String(e.message) : 'Failed to clear override'
    toast.error('Failed to clear override')
  } finally {
    saving.value = false
  }
}

async function sendTest() {
  saving.value = true
  error.value = null
  try {
    const res = await sendAdminEmailTemplateTest(selectedKey.value)
    toast.success(`Sent test email to ${res.to}`)
  } catch (e: any) {
    error.value = e?.message ? String(e.message) : 'Failed to send test email'
    toast.error('Failed to send test email')
  } finally {
    saving.value = false
  }
}

watch(
  () => selectedKey.value,
  async () => {
    if (loading.value) return
    try {
      await loadPreview()
    } catch (e: any) {
      error.value = e?.message ? String(e.message) : 'Failed to load template preview'
    }
  },
)

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-1">
      <p class="text-xs uppercase tracking-[0.08em] text-gray-600">Email</p>
      <h2 class="text-2xl font-semibold text-gray-900">Email configuration</h2>
      <p class="text-sm text-gray-700">Configure reminder/thank-you timing and manage event email templates.</p>
    </div>

    <div v-if="error" class="rounded-lg bg-red-50 p-4 text-sm text-red-800">
      {{ error }}
    </div>

    <div v-if="loading" class="ui-surface-muted animate-pulse p-5">
      <div class="h-4 w-40 rounded bg-white/10" />
      <div class="mt-4 h-10 w-full rounded bg-white/10" />
    </div>

    <div v-else class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div class="ui-surface p-4 shadow-sm">
        <label class="text-sm font-medium">Reminder lead time (hours)</label>
        <input v-model.number="reminderLeadTimeHours" type="number" min="0" class="ui-input mt-2" />
        <p class="mt-1 text-xs text-white/70">Used for event reminder scheduling.</p>
      </div>
      <div class="ui-surface p-4 shadow-sm">
        <label class="text-sm font-medium">Thank-you delay (hours)</label>
        <input v-model.number="thankYouDelayHours" type="number" min="0" class="ui-input mt-2" />
        <p class="mt-1 text-xs text-white/70">Used for post-event follow-up scheduling.</p>
      </div>

      <div class="md:col-span-2 ui-surface p-4 shadow-sm space-y-4">
        <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <label class="text-sm font-medium">Template management</label>
            <p class="mt-1 text-xs text-white/70">Overrides support placeholders like <span class="font-mono" v-text="placeholderExample" />.</p>
          </div>

          <div class="min-w-[240px]">
            <label class="text-xs uppercase tracking-wide text-white/60">Template</label>
            <select v-model="selectedKey" class="ui-input mt-2">
              <option v-for="t in templates" :key="t.key" :value="t.key">{{ t.label }}</option>
            </select>
          </div>
        </div>

        <div v-if="selectedTemplateMeta" class="rounded-lg border border-white/10 bg-white/5 p-3">
          <div class="text-sm font-semibold">{{ selectedTemplateMeta.label }}</div>
          <div class="mt-1 text-xs text-white/70">{{ selectedTemplateMeta.description }}</div>
          <div class="mt-3 text-xs text-white/70">
            <span class="font-semibold text-white/80">Placeholders:</span>
            <span class="ml-2" v-text="placeholderListLabel" />
          </div>
        </div>

        <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div class="space-y-3">
            <div class="text-xs uppercase tracking-wide text-white/60">Default (preview)</div>
            <div class="rounded-lg border border-white/10 bg-white/5 p-3">
              <div class="text-xs text-white/70">Subject</div>
              <div class="mt-1 text-sm font-medium text-white">{{ preview?.default.subject }}</div>
            </div>

            <div class="rounded-lg border border-white/10 bg-white/5 overflow-hidden">
              <div class="flex items-center justify-between px-3 py-2 border-b border-white/10">
                <div class="text-xs text-white/70">HTML preview (sample data)</div>
              </div>
              <iframe v-if="preview" class="h-[420px] w-full bg-white" :srcdoc="preview.default.html" />
            </div>
          </div>

          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <div class="text-xs uppercase tracking-wide text-white/60">Override</div>
              <button
                type="button"
                class="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10"
                :disabled="saving"
                @click="resetOverride"
              >
                Clear override
              </button>
            </div>

            <div class="ui-surface-muted p-3">
              <label class="text-xs uppercase tracking-wide text-white/60">Subject override</label>
              <input v-model="draftSubject" type="text" class="ui-input mt-2" placeholder="Leave blank to use default" />
            </div>

            <div class="ui-surface-muted p-3">
              <label class="text-xs uppercase tracking-wide text-white/60">Text override (optional)</label>
              <textarea v-model="draftText" class="ui-input mt-2 min-h-[90px]" placeholder="Leave blank to use default text" />
            </div>

            <div class="ui-surface-muted p-3">
              <label class="text-xs uppercase tracking-wide text-white/60">HTML override</label>
              <textarea v-model="draftHtml" class="ui-input mt-2 min-h-[220px] font-mono text-xs" placeholder="Leave blank to use built-in HTML" />
            </div>

            <div class="rounded-lg border border-white/10 bg-white/5 overflow-hidden">
              <div class="flex items-center justify-between px-3 py-2 border-b border-white/10">
                <div class="text-xs text-white/70">Effective preview</div>
                <span class="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/80">
                  {{ effectiveSource === 'override' ? 'Using override' : 'Using default' }}
                </span>
              </div>
              <iframe v-if="preview" class="h-[420px] w-full bg-white" :srcdoc="preview.effective.html" />
            </div>
          </div>
        </div>
      </div>

      <div class="md:col-span-2 flex items-center justify-end gap-3">
        <button
          class="rounded-lg border border-[#14192d] bg-transparent px-4 py-2 text-sm font-semibold text-[#14192d] hover:bg-[#14192d]/10 disabled:opacity-50"
          type="button"
          :disabled="saving"
          @click="sendTest"
        >
          Send test email
        </button>
        <button
          class="rounded-lg bg-[#14192d] px-4 py-2 text-sm font-semibold text-white shadow hover:bg-[#0f1530] disabled:opacity-50"
          type="button"
          :disabled="saving"
          @click="save"
        >
          Save
        </button>
      </div>
    </div>
  </div>
</template>
