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

      // Fire lookup while the loading animation plays. authStart is only called
      // once the next step is confirmed — never eagerly for onboard or password paths.
      const lookupPromise = lookupWithTimeout(email.value, 3000).catch(() => null)

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
        startResult = await authStart(email.value)
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
  <div class="min-h-screen bg-white flex">

    <!-- Left panel — hidden on mobile -->
    <div class="hidden lg:flex lg:w-1/2 bg-white p-10">
      <div class="w-full rounded-2xl p-10 flex flex-col justify-between" style="background-color: #14192D;">
        <div>
          <img src="/mentor-icon.png" alt="Mentor" class="h-14 w-auto" />
        </div>
        <div class="text-white">
          <p class="text-sm font-medium tracking-widest uppercase opacity-60 mb-4">Customer Portal</p>
          <h2 class="text-5xl font-bold leading-tight mb-6">Mentor Software</h2>
          <div class="flex flex-col gap-2.5">
            <div class="flex items-center gap-3 opacity-80">
              <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              <span class="text-sm">Knowledge base &amp; guides</span>
            </div>
            <div class="flex items-center gap-3 opacity-80">
              <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>
              <span class="text-sm">Support tickets</span>
            </div>
            <div class="flex items-center gap-3 opacity-80">
              <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <span class="text-sm">Events &amp; training</span>
            </div>
            <div class="flex items-center gap-3 opacity-80">
              <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              <span class="text-sm">Book meetings</span>
            </div>
          </div>
        </div>
        <div />
      </div>
    </div>

    <!-- Right panel — login form -->
    <div class="w-full lg:w-1/2 flex items-center justify-center p-8">
      <div class="w-full max-w-md">

        <!-- Mobile logo -->
        <div class="lg:hidden flex items-center gap-3 mb-8">
          <img src="/mentor-icon.png" alt="Mentor" class="h-12 w-auto" />
        </div>

        <LoginLoadingSequence v-if="showLoadingSequence" :done="apiDone" @complete="onAnimationComplete" />

        <template v-else>

          <div class="mb-8">
            <h1 class="text-4xl font-bold text-gray-900 mb-2">Sign in</h1>
            <p class="text-base font-semibold text-gray-900 mb-1">Welcome back</p>
            <p class="text-sm text-gray-500">Enter your work email to access your portal.</p>
          </div>

          <form class="space-y-5" @submit.prevent="onSubmit">
            <div>
              <label for="email" class="block text-sm font-semibold text-gray-900 mb-2">Email</label>
              <input
                id="email"
                v-model="email"
                type="email"
                name="email"
                autocomplete="email"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#14192d] focus:border-transparent outline-none transition text-sm text-gray-900 placeholder-gray-400 disabled:bg-gray-50 disabled:text-gray-500"
                placeholder="name@company.com"
                required
                :disabled="step !== 'email'"
              >
              <p v-if="step === 'email'" class="mt-1.5 text-xs text-gray-500">
                We'll check if your email is registered with Mentor.
              </p>
            </div>

            <div v-if="viewerPill && step !== 'email'" class="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div class="flex items-center justify-between">
                <span :class="viewerPill.class">{{ viewerPill.label }}</span>
                <span v-if="response?.provisionType" class="ui-pill ui-pill-neutral">{{ response.provisionType }}</span>
              </div>
              <p v-if="viewerBlurb" class="mt-2 text-sm text-gray-500">
                {{ viewerBlurb }}
              </p>
            </div>

            <div v-if="step === 'onboard'" class="space-y-4">
              <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
                <div class="font-medium text-gray-900">Create your portal profile</div>
                <div class="mt-1 text-gray-500">
                  We’ll set up your account and email you a sign-in code.
                </div>
              </div>

              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label class="block text-sm font-semibold text-gray-900 mb-2">First name <span class="text-red-500">*</span></label>
                  <input
                    v-model="onboard.firstName"
                    type="text"
                    autocomplete="given-name"
                    class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#14192d] focus:border-transparent outline-none transition text-sm text-gray-900 placeholder-gray-400"
                    placeholder="Jane"
                    required
                  >
                </div>
                <div>
                  <label class="block text-sm font-semibold text-gray-900 mb-2">Last name <span class="text-red-500">*</span></label>
                  <input
                    v-model="onboard.lastName"
                    type="text"
                    autocomplete="family-name"
                    class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#14192d] focus:border-transparent outline-none transition text-sm text-gray-900 placeholder-gray-400"
                    placeholder="Doe"
                    required
                  >
                </div>
              </div>

              <div>
                <label class="block text-sm font-semibold text-gray-900 mb-2">Company <span class="text-xs font-normal text-gray-400">(optional)</span></label>
                <input
                  v-model="onboard.company"
                  type="text"
                  autocomplete="organization"
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#14192d] focus:border-transparent outline-none transition text-sm text-gray-900 placeholder-gray-400"
                  placeholder="Acme Care"
                >
              </div>

              <div>
                <label class="block text-sm font-semibold text-gray-900 mb-2">Phone <span class="text-xs font-normal text-gray-400">(optional)</span></label>
                <input
                  v-model="onboard.phone"
                  type="tel"
                  autocomplete="tel"
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#14192d] focus:border-transparent outline-none transition text-sm text-gray-900 placeholder-gray-400"
                  placeholder="+44 7..."
                >
              </div>
            </div>

            <div v-if="step === 'password'" class="space-y-4">
              <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
                <div class="font-medium text-gray-900">Welcome back</div>
                <div class="mt-1 text-gray-500">Sign in with your password, or use a one-time code.</div>
              </div>
              <label for="password" class="block text-sm font-semibold text-gray-900 mb-2">Password</label>
              <input
                id="password"
                v-model="password"
                type="password"
                autocomplete="current-password"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#14192d] focus:border-transparent outline-none transition text-sm text-gray-900 placeholder-gray-400"
                placeholder="••••••••"
                required
              >
              <button
                type="button"
                class="w-full py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                :disabled="loading"
                @click="switchToCode"
              >
                Use a sign-in code instead
              </button>
            </div>

            <div v-if="step === 'code'">
              <label for="code" class="block text-sm font-semibold text-gray-900 mb-2">Sign-in code</label>
              <input
                id="code"
                v-model="code"
                type="text"
                inputmode="numeric"
                autocomplete="one-time-code"
                placeholder="123456"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#14192d] focus:border-transparent outline-none transition text-sm text-gray-900 placeholder-gray-400"
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
                class="mt-3 text-xs text-[#14192d] hover:opacity-70 underline underline-offset-2 transition disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="loading || resendCooldown > 0"
                @click="resendCode"
              >
                {{ resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code' }}
              </button>
              <p v-if="devCodeHint" class="mt-2 text-xs text-amber-700">
                Dev hint (no SMTP configured): code is <span class="font-semibold">{{ devCodeHint }}</span>
              </p>
            </div>

            <div v-if="step === 'setPassword'" class="space-y-4">
              <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
                <div class="font-medium text-gray-900">Set a password (optional)</div>
                <div class="mt-1 text-gray-500">Faster sign-in next time. You can still use email codes any time.</div>
              </div>

              <div>
                <label class="block text-sm font-semibold text-gray-900 mb-2">New password</label>
                <input
                  v-model="newPassword"
                  type="password"
                  autocomplete="new-password"
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#14192d] focus:border-transparent outline-none transition text-sm text-gray-900 placeholder-gray-400"
                  placeholder="At least 8 characters"
                  required
                >
              </div>

              <div>
                <label class="block text-sm font-semibold text-gray-900 mb-2">Confirm password</label>
                <input
                  v-model="newPasswordConfirm"
                  type="password"
                  autocomplete="new-password"
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#14192d] focus:border-transparent outline-none transition text-sm text-gray-900 placeholder-gray-400"
                  placeholder="Repeat password"
                  required
                >
              </div>
            </div>

            <button
              type="submit"
              class="w-full py-3 rounded-lg font-semibold text-sm text-white transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#14192d] disabled:opacity-50 disabled:cursor-not-allowed"
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
              class="w-full py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
              :disabled="loading"
              @click="step = 'email'; password = ''; code = ''; newPassword = ''; newPasswordConfirm = ''; info = null; error = null"
            >
              Use a different email
            </button>

            <button
              v-if="step === 'setPassword'"
              type="button"
              class="w-full py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
              :disabled="loading"
              @click="router.push('/app/dashboard')"
            >
              Skip for now
            </button>
          </form>

          <div v-if="info" class="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">{{ info }}</div>
          <div v-if="error" class="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{{ error }}</div>
          <div v-if="response?.warning" class="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Integration not configured yet: {{ response.warning }}
          </div>

        </template>
      </div>
    </div>

  </div>
</template>
