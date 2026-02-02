<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { authMe, getProfile, updatePersonalProfile, type AuthUser, type ProfileDto } from '../lib/api'

const router = useRouter()

const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)
const success = ref<string | null>(null)

const profile = ref<ProfileDto | null>(null)
const user = ref<AuthUser | null>(null)

const personalDraft = ref({
  firstName: '',
  lastName: '',
  phone: '',
  jobTitle: '',
})

const missingFields = computed(() => profile.value?.onboarding?.missingFields ?? [])
const needsOnboarding = computed(() => profile.value?.onboarding?.required === true)
const missingFieldLabels = computed(() => {
  const labelMap: Record<string, string> = {
    firstName: 'First name',
    lastName: 'Last name',
    phone: 'Phone',
    jobTitle: 'Job title',
    email: 'Email',
  }
  return missingFields.value.map((field) => labelMap[field] ?? field)
})

function setDraftFromProfile(p: ProfileDto) {
  personalDraft.value = {
    firstName: p.personal.firstName,
    lastName: p.personal.lastName,
    phone: p.personal.phone,
    jobTitle: p.personal.jobTitle,
  }
}

async function loadProfile() {
  loading.value = true
  error.value = null
  success.value = null
  try {
    const [p, auth] = await Promise.all([getProfile(), authMe().catch(() => null)])
    if (auth?.user) {
      user.value = auth.user
    }
    profile.value = p
    setDraftFromProfile(p)

    if (!p.onboarding?.required) {
      window.dispatchEvent(new CustomEvent('onboarding-complete'))
      router.replace('/app/dashboard')
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load your profile'
  } finally {
    loading.value = false
  }
}

onMounted(loadProfile)

function validateDraft() {
  const missing: string[] = []
  if (!personalDraft.value.firstName?.trim()) missing.push('First name')
  if (!personalDraft.value.lastName?.trim()) missing.push('Last name')
  if (!personalDraft.value.phone?.trim()) missing.push('Phone')
  if (!personalDraft.value.jobTitle?.trim()) missing.push('Job title')

  return missing
}

async function save() {
  if (!profile.value) return
  const missing = validateDraft()
  if (missing.length > 0) {
    error.value = `Please complete: ${missing.join(', ')}`
    return
  }

  saving.value = true
  error.value = null
  success.value = null

  try {
    const res = await updatePersonalProfile({ ...personalDraft.value })

    profile.value = {
      ...(profile.value as ProfileDto),
      personal: res.personal,
      onboarding: res.onboarding ?? profile.value?.onboarding,
    }

    const refreshed = await getProfile()
    profile.value = refreshed

    if (!refreshed.onboarding?.required) {
      success.value = 'Thanks — your details are confirmed.'
      window.dispatchEvent(new CustomEvent('onboarding-complete'))
      router.replace('/app/dashboard')
      return
    }

    setDraftFromProfile(refreshed)
    success.value = 'Saved. Please complete the remaining fields.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to save your details'
  } finally {
    saving.value = false
  }
}

function goToProfile() {
  router.push('/app/profile')
}

const companyName = computed(() => profile.value?.company?.name ?? 'Company set in HubSpot')
const provisionLabel = computed(() => {
  const map: Record<string, string> = {
    'supported-accommodation': 'Supported accommodation',
    'childrens-home': "Children's home",
    'over-18': 'Over 18',
  }
  const val = user.value?.provisionType
  if (!val) return 'Not set'
  return map[val] ?? val
})

const productVersionLabel = computed(() => {
  const map: Record<string, string> = {
    v2: 'v2',
    v3: 'v3',
  }
  const val = user.value?.productVersion
  if (!val) return 'Not set'
  return map[val] ?? val
})
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <div class="rounded-2xl border border-white/10 bg-gradient-to-br from-[#14192d] via-[#1f2745] to-[#14192d] p-8 text-white shadow-lg">
      <p class="text-xs uppercase tracking-wide text-white/70">Welcome</p>
      <h1 class="mt-2 text-2xl font-semibold">Let’s confirm your details</h1>
      <p class="mt-2 max-w-3xl text-sm text-white/80">
        We sync directly to HubSpot, so please confirm your name, phone number, and job title. This keeps your contact record clean
        for onboarding and support.
      </p>
      <div class="mt-3 flex flex-wrap gap-2 text-xs text-white/80">
        <span class="rounded-full border border-white/20 bg-white/10 px-3 py-1">
          Provision: {{ provisionLabel }}
        </span>
        <span class="rounded-full border border-white/20 bg-white/10 px-3 py-1">
          Product version: {{ productVersionLabel }}
        </span>
      </div>
      <div v-if="missingFieldLabels.length" class="mt-4 flex flex-wrap gap-2 text-xs">
        <span class="rounded-full bg-white/15 px-3 py-1 text-white/90" v-for="field in missingFieldLabels" :key="field">
          Missing: {{ field }}
        </span>
      </div>
    </div>

    <div class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800" id="main-content">
      <div class="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Your contact details</h2>
          <p class="text-sm text-gray-600 dark:text-gray-300">These sync to HubSpot and power onboarding emails.</p>
        </div>
        <button
          v-if="!needsOnboarding && !loading"
          class="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900"
          type="button"
          @click="goToProfile"
        >
          View profile
        </button>
      </div>

      <div v-if="error" class="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-100">
        {{ error }}
      </div>
      <div v-if="success" class="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-100">
        {{ success }}
      </div>

      <div v-if="loading" role="status" class="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800 animate-pulse">
        <div class="space-y-3">
          <div class="h-3 w-40 rounded-full bg-gray-200 dark:bg-gray-700" />
          <div class="h-2.5 w-72 rounded-full bg-gray-200 dark:bg-gray-700" />
          <div class="h-2.5 w-64 rounded-full bg-gray-200 dark:bg-gray-700" />
        </div>
        <span class="sr-only">Loading...</span>
      </div>

      <form v-else class="space-y-5" @submit.prevent="save">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label class="ui-label">First name</label>
            <input v-model="personalDraft.firstName" class="ui-input mt-1" autocomplete="given-name" />
          </div>
          <div>
            <label class="ui-label">Last name</label>
            <input v-model="personalDraft.lastName" class="ui-input mt-1" autocomplete="family-name" />
          </div>
          <div>
            <label class="ui-label">Email</label>
            <input :value="profile?.personal.email" class="ui-input mt-1 bg-gray-50 text-gray-500 dark:bg-gray-900/40" disabled />
          </div>
          <div>
            <label class="ui-label">Phone</label>
            <input v-model="personalDraft.phone" class="ui-input mt-1" autocomplete="tel" />
          </div>
          <div class="md:col-span-2">
            <label class="ui-label">Job title</label>
            <input v-model="personalDraft.jobTitle" class="ui-input mt-1" autocomplete="organization-title" placeholder="e.g. Director of Operations" />
          </div>
          <div class="md:col-span-2">
            <label class="ui-label">Company (read-only)</label>
            <input :value="companyName" class="ui-input mt-1 bg-gray-50 text-gray-500 dark:bg-gray-900/40 dark:text-gray-400" disabled />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Managed in HubSpot; shown here for context.</p>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="text-xs text-gray-600 dark:text-gray-300">
            All fields are required for clean HubSpot records.
          </div>
          <button
            type="submit"
            class="rounded-lg bg-[#14192d] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0f1530] disabled:opacity-60"
            :disabled="saving"
          >
            <span v-if="saving">Saving…</span>
            <span v-else>Save and continue</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
