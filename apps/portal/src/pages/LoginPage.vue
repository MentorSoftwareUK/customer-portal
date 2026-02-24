<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  authLookup,
  authLoginWithPassword,
  authOnboard,
  authSetPassword,
  authStart,
  authVerify,
  type AuthLookupResponse,
} from '../lib/api'
import { setUserAccessToken } from '../lib/auth'
import { writeProvisionFilter } from '../lib/provision'
import { writeProductVersionFilter } from '../lib/productVersion'
import LoginLoadingSequence from '../components/LoginLoadingSequence.vue'

const router = useRouter()

const email = ref('')
const password = ref('')
const code = ref('')
const step = ref<'email' | 'onboard' | 'password' | 'code' | 'setPassword'>('email')
const loading = ref(false)
const busyLabel = computed(() => {
  if (!loading.value) return null
  if (step.value === 'email') return 'Checking your email…'
  if (step.value === 'onboard') return 'Creating your profile…'
  if (step.value === 'password') return 'Signing you in…'
  if (step.value === 'code') return 'Verifying your code…'
  if (step.value === 'setPassword') return 'Saving your password…'
  return 'Working…'
})
const response = ref<AuthLookupResponse | null>(null)
const error = ref<string | null>(null)
const info = ref<string | null>(null)
const devCodeHint = ref<string | null>(null)
const showLoadingSequence = ref(false)
const apiDone = ref(false)
let resolveAnimationCb: (() => void) | null = null

function onAnimationComplete() {
  if (resolveAnimationCb) {
    resolveAnimationCb()
    resolveAnimationCb = null
  }
}

function waitForAnimationComplete(): Promise<void> {
  return new Promise(resolve => {
    resolveAnimationCb = resolve
  })
}

const resendCooldown = ref(0)
let cooldownTimer: ReturnType<typeof setInterval> | null = null

async function resendCode() {
  if (resendCooldown.value > 0 || loading.value) return
  loading.value = true
  error.value = null
  try {
    const started = await authStart(email.value)
    if (started.devCode) devCodeHint.value = started.devCode
    info.value = 'A new code has been sent to your email.'
    resendCooldown.value = 30
    cooldownTimer = setInterval(() => {
      resendCooldown.value--
      if (resendCooldown.value <= 0 && cooldownTimer) {
        clearInterval(cooldownTimer)
        cooldownTimer = null
      }
    }, 1000)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to resend code'
  } finally {
    loading.value = false
  }
}

const onboard = ref({
  firstName: '',
  lastName: '',
  phone: '',
  company: '',
})

const newPassword = ref('')
const newPasswordConfirm = ref('')

const viewerPill = computed(() => {
  if (!response.value || response.value.warning) return null
  if (response.value.isLiveCustomer === true) {
    return { class: 'ui-pill ui-pill-success', label: 'Customer' }
  }
  return { class: 'ui-pill ui-pill-neutral', label: 'Guest' }
})

const viewerBlurb = computed(() => {
  if (!response.value || response.value.warning) return null
  if (response.value.isLiveCustomer === true) {
    return 'We recognised this email as an active Mentor customer.'
  }
  return 'We couldn’t confirm an active subscription for this email — you can still register for events.'
})

async function lookupWithTimeout(emailValue: string, timeoutMs: number): Promise<AuthLookupResponse | null> {
  try {
    const result = await Promise.race([
      authLookup(emailValue),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ])
    return result as AuthLookupResponse | null
  } catch {
    return null
  }
}

async function switchToCode() {
  error.value = null
  info.value = null
  devCodeHint.value = null
  loading.value = true

  try {
    const started = await authStart(email.value)
    info.value = started.warning ? started.warning : 'We’ve sent you a sign-in code.'
    if (started.devCode) devCodeHint.value = started.devCode
    step.value = 'code'
    password.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unknown error'
  } finally {
    loading.value = false
  }
}

const canSubmit = computed(() => {
  if (loading.value) return false
  if (step.value === 'email') return email.value.trim().length > 3
  if (step.value === 'onboard') return onboard.value.firstName.trim().length > 0 && onboard.value.lastName.trim().length > 0
  if (step.value === 'password') return password.value.trim().length > 0
  if (step.value === 'code') return code.value.trim().length >= 4
  if (step.value === 'setPassword') {
    return newPassword.value.trim().length >= 8 && newPassword.value === newPasswordConfirm.value
  }
  return false
})

async function onSubmit() {
  error.value = null
  info.value = null
  devCodeHint.value = null
  loading.value = true

  try {
    if (step.value === 'email') {
      response.value = null
      showLoadingSequence.value = true
      apiDone.value = false
      const animationDone = waitForAnimationComplete()

      // Fire lookup + start in parallel while the loading animation plays.
      const lookupPromise = lookupWithTimeout(email.value, 3000).catch(() => null)
      const startPromise = authStart(email.value)

      try {
        response.value = await lookupPromise

        if (response.value?.provisionType) {
          writeProvisionFilter(response.value.provisionType)
        }

        if (response.value?.productVersion) {
          writeProductVersionFilter(response.value.productVersion)
        }
      } catch {
        // ignore
      }

      // Determine next step, but wait for animation to finish before transitioning.
      let nextStep: 'onboard' | 'password' | 'code' = 'code'
      let startResult: Awaited<ReturnType<typeof authStart>> | null = null

      if (response.value && !response.value.warning && response.value.isLiveCustomer !== true) {
        const props = response.value.hubspot.properties
        onboard.value = {
          firstName: props?.firstname ?? '',
          lastName: props?.lastname ?? '',
          phone: props?.phone ?? '',
          company: props?.company ?? '',
        }
        nextStep = 'onboard'
      } else if (response.value?.isLiveCustomer === true && response.value?.auth?.hasPassword) {
        nextStep = 'password'
      } else {
        startResult = await startPromise
      }

      // Signal the loading animation to fast-forward remaining steps.
      apiDone.value = true
      await animationDone

      showLoadingSequence.value = false

      if (nextStep === 'onboard') {
        step.value = 'onboard'
      } else if (nextStep === 'password') {
        step.value = 'password'
        info.value = 'Enter your password to sign in, or use a code instead.'
      } else {
        if (startResult?.devCode) devCodeHint.value = startResult.devCode
        info.value = 'We\u2019ve sent you a sign-in code.'
        step.value = 'code'
      }
      return
    }

    if (step.value === 'onboard') {
      await authOnboard({
        email: email.value,
        firstName: onboard.value.firstName,
        lastName: onboard.value.lastName,
        phone: onboard.value.phone || undefined,
        company: onboard.value.company || undefined,
      })

      const started = await authStart(email.value)
      info.value = started.warning ? started.warning : 'We’ve sent you a sign-in code.'
      if (started.devCode) devCodeHint.value = started.devCode
      step.value = 'code'
      return
    }

    if (step.value === 'password') {
      const verified = await authLoginWithPassword(email.value, password.value)
      setUserAccessToken(verified.accessToken)
      await router.push('/app/dashboard')
      return
    }

    if (step.value === 'code') {
      const verified = await authVerify(email.value, code.value)
      setUserAccessToken(verified.accessToken)

      const needsPassword = response.value?.isLiveCustomer === true && response.value?.auth?.hasPassword === false
      if (needsPassword) {
        step.value = 'setPassword'
        info.value = 'Optional: set a password for faster sign-in next time.'
        return
      }

      await router.push('/app/dashboard')
      return
    }

    if (step.value === 'setPassword') {
      if (newPassword.value !== newPasswordConfirm.value) {
        throw new Error('Passwords do not match.')
      }
      await authSetPassword(newPassword.value)
      await router.push('/app/dashboard')
      return
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unknown error'
  } finally {
    loading.value = false
    showLoadingSequence.value = false
    if (resolveAnimationCb) {
      resolveAnimationCb()
      resolveAnimationCb = null
    }
  }
}
</script>

<template>
  <section class="min-h-screen flex" style="background-color: #14192D;">

    <!-- Left Panel — navy rounded block -->
    <div class="hidden lg:flex lg:w-1/2 p-12" style="background-color: #14192D;">
      <div class="w-full rounded-3xl p-12 flex flex-col justify-between shadow-2xl" style="background-color: #14192D;">
        <!-- Logo -->
        <div>
          <img src="/logo.png" alt="Mentor" class="h-14 w-auto" />
        </div>
        <!-- Tagline -->
        <div class="text-white">
          <h2 class="text-5xl font-bold leading-tight">All-in-one software</h2>
          <h2 class="text-5xl font-bold leading-tight">for children's Services.</h2>
        </div>
        <div />
      </div>
    </div>

    <!-- Right Panel — login form -->
    <div class="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
      <div class="w-full max-w-md">

        <!-- Mobile logo -->
        <div class="lg:hidden mb-8">
          <img src="/logo.png" alt="Mentor" class="h-12 w-auto" />
        </div>

        <!-- Header -->
        <div class="mb-8">
          <h1 class="text-4xl font-bold text-gray-900 mb-2">Login</h1>
          <p class="text-lg font-semibold text-gray-900 mb-1">Welcome back</p>
          <p class="text-sm text-gray-600">Enter your email to continue. Customers can sign in with a password or a one-time code.</p>
        </div>

        <LoginLoadingSequence v-if="showLoadingSequence" :done="apiDone" @complete="onAnimationComplete" />

        <template v-else>
          <form class="space-y-5" @submit.prevent="onSubmit">

            <!-- Email -->
            <div>
              <label for="email" class="block mb-2 text-sm font-semibold text-gray-900">Your email</label>
              <input
                id="email"
                v-model="email"
                type="email"
                name="email"
                autocomplete="email"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#14192D] focus:border-transparent outline-none transition duration-200 placeholder-gray-400 text-gray-900 text-sm disabled:bg-gray-50 disabled:text-gray-500"
                placeholder="name@company.com"
                required
                :disabled="step !== 'email'"
              >
              <p v-if="step === 'email'" class="mt-2 text-xs text-gray-500">
                We'll check HubSpot to tailor your portal experience.
              </p>
            </div>

            <!-- Viewer context pill -->
            <div v-if="viewerPill && step !== 'email'" class="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div class="flex items-center justify-between">
                <span :class="viewerPill.class">{{ viewerPill.label }}</span>
                <span v-if="response?.provisionType" class="ui-pill ui-pill-neutral">{{ response.provisionType }}</span>
              </div>
              <p v-if="viewerBlurb" class="mt-2 text-sm text-gray-600">
                {{ viewerBlurb }}
              </p>
            </div>

            <!-- Onboard fields -->
            <div v-if="step === 'onboard'" class="space-y-4">
              <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                <div class="font-semibold text-gray-900">Create your portal profile</div>
                <div class="mt-1 text-gray-600">
                  We'll create/update your HubSpot contact, then email you a sign-in code.
                </div>
              </div>

              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label class="block mb-2 text-sm font-semibold text-gray-900">First name</label>
                  <input
                    v-model="onboard.firstName"
                    type="text"
                    autocomplete="given-name"
                    class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#14192D] focus:border-transparent outline-none transition duration-200 placeholder-gray-400 text-gray-900 text-sm"
                    placeholder="Jane"
                    required
                  >
                </div>
                <div>
                  <label class="block mb-2 text-sm font-semibold text-gray-900">Last name</label>
                  <input
                    v-model="onboard.lastName"
                    type="text"
                    autocomplete="family-name"
                    class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#14192D] focus:border-transparent outline-none transition duration-200 placeholder-gray-400 text-gray-900 text-sm"
                    placeholder="Doe"
                    required
                  >
                </div>
              </div>

              <div>
                <label class="block mb-2 text-sm font-semibold text-gray-900">Company (optional)</label>
                <input
                  v-model="onboard.company"
                  type="text"
                  autocomplete="organization"
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#14192D] focus:border-transparent outline-none transition duration-200 placeholder-gray-400 text-gray-900 text-sm"
                  placeholder="Acme Care"
                >
              </div>

              <div>
                <label class="block mb-2 text-sm font-semibold text-gray-900">Phone (optional)</label>
                <input
                  v-model="onboard.phone"
                  type="tel"
                  autocomplete="tel"
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#14192D] focus:border-transparent outline-none transition duration-200 placeholder-gray-400 text-gray-900 text-sm"
                  placeholder="+44 7..."
                >
              </div>
            </div>

            <!-- Password step -->
            <div v-if="step === 'password'" class="space-y-4">
              <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                <div class="font-semibold text-gray-900">Welcome back</div>
                <div class="mt-1 text-gray-600">Sign in with your password, or use a one-time code.</div>
              </div>
              <div>
                <label for="password" class="block mb-2 text-sm font-semibold text-gray-900">Password</label>
                <input
                  id="password"
                  v-model="password"
                  type="password"
                  autocomplete="current-password"
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#14192D] focus:border-transparent outline-none transition duration-200 placeholder-gray-400 text-gray-900 text-sm"
                  placeholder="••••••••"
                  required
                >
              </div>
              <button
                type="button"
                class="w-full bg-gray-100 text-gray-700 px-4 py-3 rounded-lg font-medium text-sm hover:bg-gray-200 focus:outline-none transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="loading"
                @click="switchToCode"
              >
                Use a sign-in code instead
              </button>
            </div>

            <!-- Code step -->
            <div v-if="step === 'code'">
              <label for="code" class="block mb-2 text-sm font-semibold text-gray-900">Sign-in code</label>
              <input
                id="code"
                v-model="code"
                type="text"
                inputmode="numeric"
                autocomplete="one-time-code"
                placeholder="123456"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#14192D] focus:border-transparent outline-none transition duration-200 placeholder-gray-400 text-gray-900 text-sm"
                required
              >
              <p class="mt-2 text-xs text-gray-500">
                Enter the code we emailed you. It expires in ~10 minutes.
              </p>
              <p class="mt-1 text-xs text-gray-400">
                Can't find it? Check your spam or junk folder.
              </p>
              <button
                type="button"
                class="mt-3 text-xs text-gray-900 font-semibold underline underline-offset-2 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="loading || resendCooldown > 0"
                @click="resendCode"
              >
                {{ resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code' }}
              </button>
              <p v-if="devCodeHint" class="mt-2 text-xs text-amber-700">
                Dev hint (no SMTP configured): code is <span class="font-semibold">{{ devCodeHint }}</span>
              </p>
            </div>

            <!-- Set password step -->
            <div v-if="step === 'setPassword'" class="space-y-4">
              <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                <div class="font-semibold text-gray-900">Set a password (optional)</div>
                <div class="mt-1 text-gray-600">Faster sign-in next time. You can still use email codes any time.</div>
              </div>

              <div>
                <label class="block mb-2 text-sm font-semibold text-gray-900">New password</label>
                <input
                  v-model="newPassword"
                  type="password"
                  autocomplete="new-password"
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#14192D] focus:border-transparent outline-none transition duration-200 placeholder-gray-400 text-gray-900 text-sm"
                  placeholder="At least 8 characters"
                  required
                >
              </div>

              <div>
                <label class="block mb-2 text-sm font-semibold text-gray-900">Confirm password</label>
                <input
                  v-model="newPasswordConfirm"
                  type="password"
                  autocomplete="new-password"
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#14192D] focus:border-transparent outline-none transition duration-200 placeholder-gray-400 text-gray-900 text-sm"
                  placeholder="Repeat password"
                  required
                >
              </div>
            </div>

            <!-- Primary submit button -->
            <button
              type="submit"
              class="w-full text-white px-4 py-3 rounded-lg font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              style="background-color: #14192D;"
              :disabled="!canSubmit"
            >
              <span v-if="busyLabel">{{ busyLabel }}</span>
              <span v-else>
                {{
                  step === 'email'
                    ? 'Continue'
                    : step === 'onboard'
                      ? 'Create profile and send code'
                      : step === 'password'
                        ? 'Sign in'
                        : step === 'code'
                          ? 'Sign in'
                          : 'Set password and continue'
                }}
              </span>
            </button>

            <button
              v-if="step !== 'email'"
              type="button"
              class="w-full bg-gray-100 text-gray-700 px-4 py-3 rounded-lg font-medium text-sm hover:bg-gray-200 focus:outline-none transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="loading"
              @click="step = 'email'; password = ''; code = ''; newPassword = ''; newPasswordConfirm = ''; info = null; error = null"
            >
              Use a different email
            </button>

            <button
              v-if="step === 'setPassword'"
              type="button"
              class="w-full bg-gray-100 text-gray-700 px-4 py-3 rounded-lg font-medium text-sm hover:bg-gray-200 focus:outline-none transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="loading"
              @click="router.push('/app/dashboard')"
            >
              Skip for now
            </button>
          </form>

          <div v-if="info" class="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
            {{ info }}
          </div>

          <div v-if="error" class="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {{ error }}
          </div>

          <div v-if="response?.warning" class="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Integration not configured yet: {{ response.warning }}
          </div>
        </template>

      </div>
    </div>

  </section>
</template>
