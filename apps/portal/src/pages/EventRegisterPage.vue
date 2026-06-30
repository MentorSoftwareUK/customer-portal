<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  authMe,
  confirmStripeCheckoutSession,
  getEvent,
  getMyEventRegistration,
  getProfile,
  registerForEvent,
  resumeEventPayment,
  type EventDto,
  type EventRegisterResponse,
} from '../lib/api'
import EventTypeChip from '../components/EventTypeChip.vue'
import StripeEmbeddedCheckout from '../components/StripeEmbeddedCheckout.vue'

const route = useRoute()

const eventId = computed(() => String(route.params.id || ''))

const event = ref<EventDto | null>(null)
const loadingEvent = ref(true)
const eventError = ref<string | null>(null)

const form = ref({
  name: '',
  company: '',
  phone: '',
  customField: '',
})

const viewerType = ref<'customer' | 'non-customer' | null>(null)
const viewerEmail = ref<string | null>(null)
const viewerName = ref<string | null>(null)
const viewerCompany = ref<string | null>(null)

const requiresPayment = computed(() => viewerType.value === 'non-customer')

const submitting = ref(false)
const submitError = ref<string | null>(null)
const submitResult = ref<EventRegisterResponse | null>(null)

const confirmingPayment = ref(false)
const paymentMessage = ref<string | null>(null)
const resumingPayment = ref(false)

const stripePublishableKey = (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined) ?? ''
const canUseEmbeddedCheckout = computed(() => stripePublishableKey.trim().length > 0)
const embeddedClientSecret = computed(() => {
  const r = submitResult.value
  if (!r || r.status !== 'payment_required') return null
  return r.checkoutClientSecret ?? null
})
const showEmbeddedCheckout = computed(() => canUseEmbeddedCheckout.value && !!embeddedClientSecret.value)

const eventStartLabel = computed(() => {
  if (!event.value?.startAt) return ''
  const date = new Date(event.value.startAt)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
})

const eventEndLabel = computed(() => {
  if (!event.value?.startAt || !event.value?.durationMins) return ''
  const start = new Date(event.value.startAt)
  if (Number.isNaN(start.getTime())) return ''
  const end = new Date(start.getTime() + event.value.durationMins * 60 * 1000)
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(end)
})

const showPhoneField = computed(() => viewerType.value === 'non-customer')

async function onSubmit() {
  if (!eventId.value) return
  submitError.value = null
  submitResult.value = null
  submitting.value = true
  try {
    form.value.name = form.value.name.trim()
    form.value.company = form.value.company.trim()
    form.value.phone = form.value.phone.trim()
    form.value.customField = form.value.customField.trim()

    const result = await registerForEvent(eventId.value, {
      name: form.value.name,
      company: form.value.company,
      phone: showPhoneField.value ? form.value.phone : '',
      customField: form.value.customField,
    })
    submitResult.value = result

    if (result.status === 'registered') {
      window.location.href = `/app/events/${encodeURIComponent(result.eventId)}`
      return
    }

    if (result.status === 'payment_required' && result.checkoutUrl) {
      window.location.assign(result.checkoutUrl)
      return
    }

    if (result.status === 'payment_required' && !result.checkoutUrl && !result.checkoutClientSecret) {
      paymentMessage.value = 'Payment is required, but no checkout session could be started. Please try again.'
    }
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'Registration failed'
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  try {
    const me = await authMe()
    viewerType.value = me.user.viewerType
    viewerEmail.value = me.user.email
  } catch {
    // If the session is invalid, router guards / 401 handling will take over.
    viewerType.value = null
    viewerEmail.value = null
  }

  try {
    const profile = await getProfile()
    const name = [profile.personal.firstName, profile.personal.lastName].filter(Boolean).join(' ').trim()
    viewerName.value = name || null
    viewerCompany.value = profile.company?.name?.trim() || null
    if (viewerName.value) form.value.name = viewerName.value
    if (viewerCompany.value) form.value.company = viewerCompany.value
    if (profile.personal.phone) form.value.phone = profile.personal.phone
  } catch {
    // profile is optional for registration
  }

  loadingEvent.value = true
  eventError.value = null
  try {
    event.value = await getEvent(eventId.value)
  } catch (e) {
    eventError.value = e instanceof Error ? e.message : 'Failed to load event'
  } finally {
    loadingEvent.value = false
  }

  const sessionId = route.query.session_id
  const payment = route.query.payment

  if (payment === 'cancel') {
    paymentMessage.value = 'Payment was cancelled. You can try again when you are ready.'
    return
  }

  if ((payment === 'success' || !payment) && typeof sessionId === 'string' && sessionId.trim()) {
    confirmingPayment.value = true
    submitError.value = null
    paymentMessage.value = null
    try {
      const confirmed = await confirmStripeCheckoutSession(sessionId)
      if (confirmed.status === 'paid') {
        window.location.href = `/app/events/${encodeURIComponent(confirmed.eventId)}`
        return
      }
      paymentMessage.value = 'Payment is still processing. Please refresh in a moment.'
    } catch (e) {
      submitError.value = e instanceof Error ? e.message : 'Failed to confirm payment'
    } finally {
      confirmingPayment.value = false
    }
  }

  // If the user already has a pending registration, help them continue payment.
  // Only do this when we're not returning from Stripe (no payment= query).
  if (!payment && viewerType.value === 'non-customer' && event.value?.priceForNonCustomers != null) {
    try {
      const reg = await getMyEventRegistration(eventId.value)
      if (reg?.status === 'payment_pending') {
        resumingPayment.value = true
        submitting.value = true
        submitError.value = null
        const resumed = await resumeEventPayment(eventId.value)
        submitResult.value = resumed

        if (resumed.status === 'registered') {
          window.location.href = `/app/events/${encodeURIComponent(resumed.eventId)}`
          return
        }

        if (resumed.status === 'payment_required' && resumed.checkoutUrl && !resumed.checkoutClientSecret) {
          window.location.assign(resumed.checkoutUrl)
          return
        }

        if (resumed.status === 'payment_required' && resumed.warning) {
          paymentMessage.value = resumed.warning
        }
      }
    } catch (e) {
      // Non-fatal; user can manually click confirm.
      submitError.value = e instanceof Error ? e.message : 'Failed to resume payment'
    } finally {
      submitting.value = false
      resumingPayment.value = false
    }
  }
})
</script>

<template>
  <div class="space-y-6">
      <nav class="flex" aria-label="Breadcrumb">
        <ol class="inline-flex items-center space-x-1 md:space-x-2 rtl:space-x-reverse text-sm">
          <li class="inline-flex items-center">
            <RouterLink
              to="/app/events"
              class="inline-flex items-center font-medium text-gray-700 hover:text-primary-600 dark:text-gray-300 dark:hover:text-gray-900"
            >
              Events
            </RouterLink>
          </li>
          <li>
            <div class="flex items-center">
              <svg class="w-3 h-3 text-gray-400 mx-1 rtl:rotate-180" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 6 10">
                <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m1 9 4-4-4-4" />
              </svg>
              <span class="ms-1 text-gray-500 md:ms-2 dark:text-gray-400">Register</span>
            </div>
          </li>
        </ol>
      </nav>

      <div v-if="eventError" class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-200">
        {{ eventError }}
      </div>

      <div v-else-if="loadingEvent" role="status" class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 animate-pulse">
        <div class="space-y-3">
          <div class="h-3 w-32 rounded-full bg-gray-200 dark:bg-gray-700" />
          <div class="h-2.5 w-80 rounded-full bg-gray-200 dark:bg-gray-700" />
          <div class="h-2.5 w-64 rounded-full bg-gray-200 dark:bg-gray-700" />
        </div>
        <span class="sr-only">Loading...</span>
      </div>

      <template v-else-if="event">
        <header class="space-y-4">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-3">
              <EventTypeChip :type="event.type" />
            </div>
            <h1 class="mt-2 text-2xl font-semibold tracking-tight text-black dark:text-gray-900">Register your place</h1>
          </div>

          <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div class="ui-surface p-4">
              <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <svg class="h-4 w-4 text-gray-500" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M8 7h8M8 11h5M7 3v2M17 3v2M6 5h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                Event
              </div>
              <div class="mt-1 text-sm font-semibold text-gray-900">{{ event.title }}</div>
            </div>
            <div class="ui-surface p-4">
              <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <svg class="h-4 w-4 text-gray-500" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M12 6v6l4 2M12 22a10 10 0 100-20 10 10 0 000 20z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                Date & time
              </div>
              <div class="mt-1 text-sm font-semibold text-gray-900">{{ eventStartLabel }} – {{ eventEndLabel }}</div>
              <div class="text-xs text-gray-500">{{ event.timezoneLabel }}</div>
            </div>
            <div class="ui-surface p-4">
              <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <svg class="h-4 w-4 text-gray-500" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M12 12a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" stroke-width="1.5" />
                  <path d="M4 20a8 8 0 0116 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                </svg>
                Host
              </div>
              <div class="mt-1 text-sm font-semibold text-gray-900">{{ event.hostName || 'Mentor team' }}</div>
            </div>
            <div class="ui-surface p-4">
              <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <svg class="h-4 w-4 text-gray-500" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M4 5h16v10H4z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
                  <path d="M8 19h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                </svg>
                Platform
              </div>
              <div class="mt-1 text-sm font-semibold text-gray-900">{{ event.platform }}</div>
            </div>
          </div>
          </header>

        <form class="space-y-4" @submit.prevent="onSubmit">
          <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <section class="lg:col-span-2 ui-surface p-5">
              <h2 class="text-base font-semibold tracking-tight text-black dark:text-gray-900">Your details</h2>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">We’ll use these to confirm your place and send your joining link.</p>

              <div class="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label for="reg-name" class="block mb-2 text-sm font-medium text-gray-900 dark:text-gray-900">Name</label>
                  <input
                    id="reg-name"
                    v-model.trim="form.name"
                    class="bg-gray-50 border border-gray-300 text-gray-900 rounded-lg focus:ring-primary-600 focus:border-primary-600 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-gray-900 dark:focus:ring-blue-500 dark:focus:border-blue-500"
                    required
                    autocomplete="name"
                  >
                </div>

                <div>
                  <label for="reg-email" class="block mb-2 text-sm font-medium text-gray-900 dark:text-gray-900">Email</label>
                  <input
                    id="reg-email"
                    :value="viewerEmail ?? ''"
                    type="email"
                    class="bg-gray-100 border border-gray-300 text-gray-700 rounded-lg block w-full p-2.5 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
                    disabled
                  >
                </div>

                <div>
                  <label for="reg-company" class="block mb-2 text-sm font-medium text-gray-900 dark:text-gray-900">Company</label>
                  <input
                    id="reg-company"
                    v-model.trim="form.company"
                    type="text"
                    disabled
                    class="bg-gray-50 border border-gray-300 text-gray-900 rounded-lg focus:ring-primary-600 focus:border-primary-600 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-gray-900 dark:focus:ring-blue-500 dark:focus:border-blue-500"
                    autocomplete="organization"
                  >
                  <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Company details are linked to your account and can’t be edited here. <RouterLink to="/app/profile" class="ui-link">Update in Profile</RouterLink>
                  </p>
                </div>

                <div v-if="showPhoneField">
                  <label for="reg-phone" class="block mb-2 text-sm font-medium text-gray-900 dark:text-gray-900">Phone</label>
                  <input
                    id="reg-phone"
                    v-model.trim="form.phone"
                    class="bg-gray-50 border border-gray-300 text-gray-900 rounded-lg focus:ring-primary-600 focus:border-primary-600 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-gray-900 dark:focus:ring-blue-500 dark:focus:border-blue-500"
                    autocomplete="tel"
                  >
                  <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    We’ll only use this if there are issues with your registration.
                  </p>
                </div>

                <div class="md:col-span-2">
                  <label for="reg-custom" class="block mb-2 text-sm font-medium text-gray-900 dark:text-gray-900">Anything else we should know?</label>
                  <input
                    id="reg-custom"
                    v-model.trim="form.customField"
                    placeholder="Optional (access needs, topics, or questions)"
                    class="bg-gray-50 border border-gray-300 text-gray-900 rounded-lg focus:ring-primary-600 focus:border-primary-600 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-gray-900 dark:focus:ring-blue-500 dark:focus:border-blue-500"
                  >
                </div>
              </div>
            </section>

            <aside class="space-y-4">
              <div class="ui-surface p-5">
                <div class="flex items-center justify-between gap-3">
                  <h2 class="text-base font-semibold tracking-tight text-black dark:text-gray-900">Attendee type</h2>
                  <span
                    v-if="viewerType === 'customer'"
                    class="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-200"
                  >
                    Customer
                  </span>
                  <span
                    v-else-if="viewerType === 'non-customer'"
                    class="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/30 dark:text-amber-600"
                  >
                    Non-customer
                  </span>
                </div>

                <div class="mt-3 flex items-start justify-between gap-3">
                  <div class="text-sm text-gray-600 dark:text-gray-300">
                    <span v-if="viewerType === 'customer'" class="block text-lg font-semibold tracking-tight text-black">Free</span>
                    <span v-else-if="viewerType === 'non-customer'">Non-customer (may require payment)</span>
                    <span v-else class="inline-flex items-center" aria-live="polite">
                      <span class="h-2.5 w-24 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
                      <span class="sr-only">Loading...</span>
                    </span>
                  </div>
                </div>
                <div v-if="event.priceForNonCustomers != null" class="mt-3 text-sm text-gray-600 dark:text-gray-300">
                  Price for non-customers: <span class="font-semibold">£{{ event.priceForNonCustomers }}</span>
                </div>
                <div v-else class="mt-3 text-sm text-gray-600 dark:text-gray-300">
                  This event is free for existing Mentor customers.
                </div>
              </div>

              <div class="ui-surface p-5">
                <h2 class="text-base font-semibold tracking-tight text-black dark:text-gray-900">What happens next</h2>
                <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
                  We’ll send your confirmation and joining link. You’ll also get a reminder before the session.
                </p>
              </div>

              <div class="ui-surface p-5">
                <h2 class="text-base font-semibold tracking-tight text-black dark:text-gray-900">Ready to confirm?</h2>
                <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
                  Check your details and confirm your registration.
                </p>
                <div class="mt-4 flex flex-col gap-2">
                  <button
                    type="submit"
                    class="ui-btn-primary w-full py-2.5"
                    :disabled="submitting || confirmingPayment || !viewerType || !viewerEmail || showEmbeddedCheckout"
                  >
                    <span v-if="submitting">Registering…</span>
                    <span v-else-if="showEmbeddedCheckout">Payment in progress…</span>
                    <span v-else>Confirm registration</span>
                  </button>
                  <RouterLink
                    :to="`/app/events/${encodeURIComponent(event.id)}`"
                    class="ui-btn-secondary w-full py-2.5 bg-gray-100 text-gray-900 border-gray-200 hover:bg-gray-200"
                  >
                    Cancel
                  </RouterLink>
                </div>
              </div>

              <div v-if="requiresPayment && event.priceForNonCustomers != null" class="ui-surface p-5">
                <h2 class="text-base font-semibold tracking-tight text-black dark:text-gray-900">Payment</h2>
                <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
                  Secure payment is handled by Stripe.
                </p>
                <p v-if="canUseEmbeddedCheckout" class="mt-2 text-sm text-gray-600 dark:text-gray-300">
                  After you confirm registration, checkout will load here.
                </p>
                <div class="mt-3 rounded-lg border border-gray-200 bg-gray-100 p-3 text-xs text-gray-500">
                  Payment confirmation should link to HubSpot contact + transaction records.
                </div>
              </div>

            </aside>
          </div>

          <div v-if="resumingPayment" class="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/30 dark:bg-amber-900/20 dark:text-amber-600">
            Resuming payment…
          </div>

          <div v-if="confirmingPayment" class="ui-surface p-4 text-sm">
            Confirming payment…
          </div>

          <div v-if="submitError" class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-200">
            {{ submitError }}
          </div>

          <div v-if="paymentMessage" class="ui-surface p-4 text-sm">
            {{ paymentMessage }}
          </div>

          <div v-if="submitResult?.status === 'payment_required'" class="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/30 dark:bg-amber-900/20 dark:text-amber-600">
            <div>Payment required: £{{ submitResult.amount }} {{ submitResult.currency }}.</div>
            <div v-if="submitResult.warning" class="mt-1 text-xs">{{ submitResult.warning }}</div>
          </div>

          <div v-if="showEmbeddedCheckout" class="ui-surface p-5">
            <h2 class="text-base font-semibold tracking-tight text-black dark:text-gray-900">Secure checkout</h2>
            <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
              Complete payment below to finish registration.
            </p>
            <div class="mt-4">
              <StripeEmbeddedCheckout
                :publishable-key="stripePublishableKey"
                :client-secret="embeddedClientSecret!"
              />
            </div>
          </div>

        </form>
      </template>
  </div>
</template>
