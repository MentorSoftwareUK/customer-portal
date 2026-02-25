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
  <section class="bg-white">
    <div class="flex flex-col items-center justify-center px-6 py-8 mx-auto md:h-screen lg:py-0">
      <div class="flex justify-center mb-4">
        <img src="/mentor-icon.png" alt="Mentor" class="h-16 w-auto" />
      </div>
      <div class="ui-surface w-full md:mt-0 sm:max-w-md xl:p-0">
        <div class="p-6 space-y-4 md:space-y-6 sm:p-8">
          <h1 class="ui-surface-title text-xl font-bold leading-tight tracking-tight md:text-2xl">
            Sign in to Mentor Portal
          </h1>

          <LoginLoadingSequence v-if="showLoadingSequence" :done="apiDone" @complete="onAnimationComplete" />

          <template v-else>
          <p class="text-sm text-white/70">
            Enter your work email to continue.
          </p>

          <form class="space-y-4 md:space-y-6" @submit.prevent="onSubmit">
            <div>
              <label for="email" class="block mb-2 text-sm font-medium text-white/80">Your email</label>
              <input
                id="email"
                v-model="email"
                type="email"
                name="email"
                autocomplete="email"
                class="bg-white/10 border border-white/10 text-white rounded-lg focus:ring-primary-600 focus:border-primary-600 block w-full p-2.5 placeholder:text-white/50"
                placeholder="name@company.com"
                required
                :disabled="step !== 'email'"
              >
              <p v-if="step === 'email'" class="mt-2 text-xs text-white/60">
                We’ll check HubSpot to tailor your portal experience.
              </p>
            </div>

            <div v-if="viewerPill && step !== 'email'" class="rounded-lg border border-white/10 bg-white/5 p-3">
              <div class="flex items-center justify-between">
                <span :class="viewerPill.class">{{ viewerPill.label }}</span>
                <span v-if="response?.provisionType" class="ui-pill ui-pill-neutral">{{ response.provisionType }}</span>
              </div>
              <p v-if="viewerBlurb" class="mt-2 text-sm text-white/70">
                {{ viewerBlurb }}
              </p>
            </div>

            <div v-if="step === 'onboard'" class="space-y-4">
              <div class="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/80">
                <div class="font-medium text-white">Create your portal profile</div>
                <div class="mt-1 text-white/70">
                  We’ll create/update your HubSpot contact, then email you a sign-in code.
                </div>
              </div>

              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label class="block mb-2 text-sm font-medium text-white/80">First name</label>
                  <input
                    v-model="onboard.firstName"
                    type="text"
                    autocomplete="given-name"
                    class="bg-white/10 border border-white/10 text-white rounded-lg focus:ring-primary-600 focus:border-primary-600 block w-full p-2.5 placeholder:text-white/50"
                    placeholder="Jane"
                    required
                  >
                </div>
                <div>
                  <label class="block mb-2 text-sm font-medium text-white/80">Last name</label>
                  <input
                    v-model="onboard.lastName"
                    type="text"
                    autocomplete="family-name"
                    class="bg-white/10 border border-white/10 text-white rounded-lg focus:ring-primary-600 focus:border-primary-600 block w-full p-2.5 placeholder:text-white/50"
                    placeholder="Doe"
                    required
                  >
                </div>
              </div>

              <div>
                <label class="block mb-2 text-sm font-medium text-white/80">Company (optional)</label>
                <input
                  v-model="onboard.company"
                  type="text"
                  autocomplete="organization"
                  class="bg-white/10 border border-white/10 text-white rounded-lg focus:ring-primary-600 focus:border-primary-600 block w-full p-2.5 placeholder:text-white/50"
                  placeholder="Acme Care"
                >
              </div>

              <div>
                <label class="block mb-2 text-sm font-medium text-white/80">Phone (optional)</label>
                <input
                  v-model="onboard.phone"
                  type="tel"
                  autocomplete="tel"
                  class="bg-white/10 border border-white/10 text-white rounded-lg focus:ring-primary-600 focus:border-primary-600 block w-full p-2.5 placeholder:text-white/50"
                  placeholder="+44 7..."
                >
              </div>
            </div>

            <div v-if="step === 'password'" class="space-y-3">
              <div class="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/80">
                <div class="font-medium text-white">Welcome back</div>
                <div class="mt-1 text-white/70">Sign in with your password, or use a one-time code.</div>
              </div>
              <label for="password" class="block mb-2 text-sm font-medium text-white/80">Password</label>
              <input
                id="password"
                v-model="password"
                type="password"
                autocomplete="current-password"
                class="bg-white/10 border border-white/10 text-white rounded-lg focus:ring-primary-600 focus:border-primary-600 block w-full p-2.5 placeholder:text-white/50"
                placeholder="••••••••"
                required
              >
              <button
                type="button"
                class="ui-btn-secondary w-full py-2.5"
                :disabled="loading"
                @click="switchToCode"
              >
                Use a sign-in code instead
              </button>
            </div>

            <div v-if="step === 'code'">
              <label for="code" class="block mb-2 text-sm font-medium text-white/80">Sign-in code</label>
              <input
                id="code"
                v-model="code"
                type="text"
                inputmode="numeric"
                autocomplete="one-time-code"
                placeholder="123456"
                class="bg-white/10 border border-white/10 text-white rounded-lg focus:ring-primary-600 focus:border-primary-600 block w-full p-2.5 placeholder:text-white/50"
                required
              >
              <p class="mt-2 text-xs text-white/60">
                Enter the code we emailed you. It expires in ~10 minutes.
              </p>
              <p class="mt-1 text-xs text-white/40">
                Can't find it? Check your spam or junk folder.
              </p>
              <button
                type="button"
                class="mt-3 text-xs text-primary-400 hover:text-primary-300 underline underline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="loading || resendCooldown > 0"
                @click="resendCode"
              >
                {{ resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code' }}
              </button>
              <p v-if="devCodeHint" class="mt-2 text-xs text-amber-700 dark:text-amber-200">
                Dev hint (no SMTP configured): code is <span class="font-semibold">{{ devCodeHint }}</span>
              </p>
            </div>

            <div v-if="step === 'setPassword'" class="space-y-4">
              <div class="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/80">
                <div class="font-medium text-white">Set a password (optional)</div>
                <div class="mt-1 text-white/70">Faster sign-in next time. You can still use email codes any time.</div>
              </div>

              <div>
                <label class="block mb-2 text-sm font-medium text-white/80">New password</label>
                <input
                  v-model="newPassword"
                  type="password"
                  autocomplete="new-password"
                  class="bg-white/10 border border-white/10 text-white rounded-lg focus:ring-primary-600 focus:border-primary-600 block w-full p-2.5 placeholder:text-white/50"
                  placeholder="At least 8 characters"
                  required
                >
              </div>

              <div>
                <label class="block mb-2 text-sm font-medium text-white/80">Confirm password</label>
                <input
                  v-model="newPasswordConfirm"
                  type="password"
                  autocomplete="new-password"
                  class="bg-white/10 border border-white/10 text-white rounded-lg focus:ring-primary-600 focus:border-primary-600 block w-full p-2.5 placeholder:text-white/50"
                  placeholder="Repeat password"
                  required
                >
              </div>
            </div>

            <button
              type="submit"
              class="ui-btn-primary w-full py-2.5"
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
              class="ui-btn-secondary w-full py-2.5"
              :disabled="loading"
              @click="step = 'email'; password = ''; code = ''; newPassword = ''; newPasswordConfirm = ''; info = null; error = null"
            >
              Use a different email
            </button>

            <button
              v-if="step === 'setPassword'"
              type="button"
              class="ui-btn-secondary w-full py-2.5"
              :disabled="loading"
              @click="router.push('/app/dashboard')"
            >
              Skip for now
            </button>
          </form>

          <div v-if="info" class="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/80">
            {{ info }}
          </div>

          <div v-if="error" class="rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">
            {{ error }}
          </div>

          <div v-if="response?.warning" class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Integration not configured yet: {{ response.warning }}
          </div>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>
