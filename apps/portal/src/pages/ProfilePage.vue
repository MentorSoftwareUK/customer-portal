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
const companyName = computed(() => profile.value?.company?.name || 'No company on file')

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

async function savePersonal() {
  if (!profile.value) return
  error.value = null
  success.value = null
  savingPersonal.value = true
  try {
    const res = await updatePersonalProfile(personalDraft.value)
    profile.value.personal = res.personal
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
    error.value = e instanceof Error ? e.message : 'Failed to update company details'
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
    <div class="bg-[#14192d] rounded-lg p-6 sm:p-8 border border-white/10">
      <h2 class="text-2xl sm:text-3xl font-bold text-white">Profile</h2>
      <p class="mt-2 text-base text-gray-400">
        Keep your contact and company details up to date.
      </p>
    </div>

    <div v-if="error" class="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-200">
      {{ error }}
    </div>
    <div v-if="success" class="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
      {{ success }}
    </div>

    <div v-if="loading" role="status" class="rounded-lg border border-white/10 bg-[#14192d] p-4 animate-pulse">
      <div class="space-y-3">
        <div class="h-3 w-36 rounded-full bg-white/10" />
        <div class="h-2.5 w-80 rounded-full bg-white/10" />
        <div class="h-2.5 w-64 rounded-full bg-white/10" />
      </div>
      <span class="sr-only">Loading...</span>
    </div>

    <template v-else-if="profile">
      <div class="rounded-lg border border-white/10 bg-[#14192d] p-4">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-base font-semibold text-white">Personal details</h3>
          <div class="flex gap-2">
            <button
              class="rounded-lg bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
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
            <label class="text-sm font-medium text-white">First name</label>
            <input v-model="personalDraft.firstName" class="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40" />
          </div>
          <div>
            <label class="text-sm font-medium text-white">Last name</label>
            <input v-model="personalDraft.lastName" class="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40" />
          </div>
          <div>
            <label class="text-sm font-medium text-white">Email (login)</label>
            <input type="email" :value="profile.personal.email" class="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70" disabled />
          </div>
          <div>
            <label class="text-sm font-medium text-white">Phone</label>
            <input v-model="personalDraft.phone" class="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40" />
          </div>
          <div class="md:col-span-2">
            <label class="text-sm font-medium text-white">Job title</label>
            <input v-model="personalDraft.jobTitle" class="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40" placeholder="e.g. Director of Operations" />
            <p class="mt-2 text-xs text-white/60">
              Senior titles (e.g. director/VP/owner) can edit company details below.
            </p>
          </div>
        </div>
      </div>

      <div class="rounded-lg border border-white/10 bg-[#14192d] p-4">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-base font-semibold text-white">Company details</h3>
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

        <div v-if="!hasCompany" class="text-sm text-white/70">
          No company is associated with your account.
        </div>

        <div v-else class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div class="md:col-span-2">
            <div v-if="!canEditCompany" class="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-200">
              Company details are read-only for your account. A director/senior contact can update these.
            </div>
          </div>

          <div>
            <label class="text-sm font-medium text-white">Company name</label>
            <input v-model="companyDraft.name" class="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white disabled:opacity-60" :disabled="!canEditCompany" />
          </div>
          <div>
            <label class="text-sm font-medium text-white">Domain</label>
            <input v-model="companyDraft.domain" class="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white disabled:opacity-60" :disabled="!canEditCompany" placeholder="company.com" />
          </div>
          <div>
            <label class="text-sm font-medium text-white">Company phone</label>
            <input v-model="companyDraft.phone" class="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white disabled:opacity-60" :disabled="!canEditCompany" />
          </div>
          <div>
            <label class="text-sm font-medium text-white">Country</label>
            <input v-model="companyDraft.country" class="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white disabled:opacity-60" :disabled="!canEditCompany" />
          </div>
          <div class="md:col-span-2">
            <label class="text-sm font-medium text-white">Address</label>
            <input v-model="companyDraft.address" class="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white disabled:opacity-60" :disabled="!canEditCompany" />
          </div>
          <div>
            <label class="text-sm font-medium text-white">City</label>
            <input v-model="companyDraft.city" class="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white disabled:opacity-60" :disabled="!canEditCompany" />
          </div>
          <div>
            <label class="text-sm font-medium text-white">Postcode</label>
            <input v-model="companyDraft.zip" class="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white disabled:opacity-60" :disabled="!canEditCompany" />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
