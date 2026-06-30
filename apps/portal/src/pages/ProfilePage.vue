<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  getProfile,
  updateCompanyProfile,
  updatePersonalProfile,
  type ProfileDto,
  type UpdateCompanyRequest,
  type UpdatePersonalRequest,
} from '../lib/api'

const loading = ref(false)
const savingPersonal = ref(false)
const savingCompany = ref(false)
const error = ref<string | null>(null)
const success = ref<string | null>(null)

const profile = ref<ProfileDto | null>(null)

const personalDraft = ref<UpdatePersonalRequest>({})
const companyDraft = ref<UpdateCompanyRequest>({})

const canEditCompany = computed(() => profile.value?.permissions.canEditCompany === true)
const hasCompany = computed(() => Boolean(profile.value?.company))

function resetDraftsFromProfile(p: ProfileDto) {
  personalDraft.value = {
    firstName: p.personal.firstName,
    lastName: p.personal.lastName,
    phone: p.personal.phone,
    jobTitle: p.personal.jobTitle,
  }

  companyDraft.value = p.company
    ? {
        name: p.company.name,
        domain: p.company.domain,
        phone: p.company.phone,
        address: p.company.address,
        city: p.company.city,
        zip: p.company.zip,
        country: p.company.country,
      }
    : {}
}

async function load() {
  error.value = null
  success.value = null
  loading.value = true
  try {
    const p = await getProfile()
    profile.value = p
    resetDraftsFromProfile(p)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load profile'
  } finally {
    loading.value = false
  }
}

async function refreshProfileState() {
  const latest = await getProfile()
  profile.value = latest
  resetDraftsFromProfile(latest)
}

async function savePersonal() {
  if (!profile.value) return
  error.value = null
  success.value = null
  savingPersonal.value = true
  try {
    await updatePersonalProfile(personalDraft.value)
    await refreshProfileState()
    success.value = 'Personal details updated.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to update personal details'
  } finally {
    savingPersonal.value = false
  }
}

async function saveCompany() {
  if (!profile.value) return
  error.value = null
  success.value = null
  savingCompany.value = true
  try {
    const res = await updateCompanyProfile(companyDraft.value)
    profile.value.company = res.company
    if (res.sync && typeof res.sync.updatedContacts === 'number' && typeof res.sync.totalCompanyContacts === 'number') {
      success.value = `Company details updated. Synced to ${res.sync.updatedContacts} of ${res.sync.totalCompanyContacts} contacts.`
    } else {
      success.value = 'Company details updated.'
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to update company details'
    if (msg.includes('403')) {
      try {
        await refreshProfileState()
      } catch {
        // Keep original error if refresh fails.
      }
      error.value = 'Your permission to edit company details changed. The form has been refreshed.'
    } else {
      error.value = msg
    }
  } finally {
    savingCompany.value = false
  }
}

function onCancel() {
  if (!profile.value) return
  resetDraftsFromProfile(profile.value)
  error.value = null
  success.value = null
}

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white rounded-lg p-6 sm:p-8 border border-gray-200">
      <h2 class="text-2xl sm:text-2xl font-semibold tracking-tight text-black">Profile</h2>
      <p class="mt-2 text-base text-gray-400">
        Keep your contact and company details up to date.
      </p>
    </div>

    <div v-if="error" class="rounded-lg border border-rose-500/20 bg-rose-50 p-3 text-sm text-rose-600">
      {{ error }}
    </div>
    <div v-if="success" class="rounded-lg border border-emerald-500/20 bg-emerald-50 p-3 text-sm text-emerald-600">
      {{ success }}
    </div>

    <div v-if="loading" role="status" class="rounded-lg border border-gray-200 bg-white p-4 animate-pulse">
      <div class="space-y-3">
        <div class="h-3 w-36 rounded-full bg-gray-100" />
        <div class="h-2.5 w-80 rounded-full bg-gray-100" />
        <div class="h-2.5 w-64 rounded-full bg-gray-100" />
      </div>
      <span class="sr-only">Loading...</span>
    </div>

    <template v-else-if="profile">
      <div class="rounded-lg border border-gray-200 bg-white p-4">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-base font-semibold tracking-tight text-black">Personal details</h3>
          <div class="flex gap-2">
            <button
              class="rounded-lg bg-gray-50 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100 disabled:opacity-50"
              type="button"
              :disabled="savingPersonal || savingCompany"
              @click="onCancel"
            >
              Cancel
            </button>
            <button
              class="ui-btn-primary"
              type="button"
              :disabled="savingPersonal || savingCompany"
              @click="savePersonal"
            >
              <span v-if="savingPersonal">Saving…</span>
              <span v-else>Save</span>
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label class="text-sm font-medium text-gray-900">First name</label>
            <input v-model="personalDraft.firstName" class="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400" />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-900">Last name</label>
            <input v-model="personalDraft.lastName" class="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400" />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-900">Email (login)</label>
            <input type="email" :value="profile.personal.email" class="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500" disabled />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-900">Phone</label>
            <input v-model="personalDraft.phone" class="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400" />
          </div>
          <div class="md:col-span-2">
            <label class="text-sm font-medium text-gray-900">Job title</label>
            <input v-model="personalDraft.jobTitle" class="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400" placeholder="e.g. Director of Operations" />
            <p class="mt-2 text-xs text-gray-500">
              Senior titles (e.g. director/VP/owner) can edit company details below.
            </p>
          </div>
        </div>
      </div>

      <div class="rounded-lg border border-gray-200 bg-white p-4">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-base font-semibold tracking-tight text-black">Company details</h3>
          <button
            class="ui-btn-primary"
            type="button"
            :disabled="!canEditCompany || savingPersonal || savingCompany || !hasCompany"
            @click="saveCompany"
          >
            <span v-if="savingCompany">Saving…</span>
            <span v-else>Save</span>
          </button>
        </div>

        <div v-if="!hasCompany" class="text-sm text-gray-500">
          No company is associated with your account.
        </div>

        <div v-else class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div class="md:col-span-2">
            <div v-if="!canEditCompany" class="rounded-lg border border-amber-500/20 bg-amber-50 p-3 text-sm text-amber-600">
              Company details are read-only for your account. A director/senior contact can update these.
            </div>
          </div>

          <div>
            <label class="text-sm font-medium text-gray-900">Company name</label>
            <input v-model="companyDraft.name" class="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 disabled:opacity-60" :disabled="!canEditCompany" />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-900">Domain</label>
            <input v-model="companyDraft.domain" class="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 disabled:opacity-60" :disabled="!canEditCompany" placeholder="company.com" />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-900">Company phone</label>
            <input v-model="companyDraft.phone" class="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 disabled:opacity-60" :disabled="!canEditCompany" />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-900">Country</label>
            <input v-model="companyDraft.country" class="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 disabled:opacity-60" :disabled="!canEditCompany" />
          </div>
          <div class="md:col-span-2">
            <label class="text-sm font-medium text-gray-900">Address</label>
            <input v-model="companyDraft.address" class="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 disabled:opacity-60" :disabled="!canEditCompany" />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-900">City</label>
            <input v-model="companyDraft.city" class="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 disabled:opacity-60" :disabled="!canEditCompany" />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-900">Postcode</label>
            <input v-model="companyDraft.zip" class="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 disabled:opacity-60" :disabled="!canEditCompany" />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
