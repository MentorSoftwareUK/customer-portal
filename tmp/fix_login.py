import re

filepath = '/Users/liamkotecha/Documents/mentor-cp/apps/portal/src/pages/LoginPage.vue'

with open(filepath, 'r') as f:
    content = f.read()

# Find the start of <template> section (line 278, 0-based index of first <template> at start of line)
template_start = content.index('\n<template>')
script_part = content[:template_start + 1]  # keep everything up to and including the newline before <template>

new_template = """<template>
  <section class="min-h-screen bg-white flex">

    <!-- Left Panel — navy rounded block -->
    <div class="hidden lg:flex lg:w-1/2 bg-white p-12">
      <div class="w-full rounded-3xl p-12 flex flex-col justify-between" style="background-color: #14192D;">
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
"""

with open(filepath, 'w') as f:
    f.write(script_part + new_template)

print(f"Done. Script part length: {len(script_part.splitlines())} lines")
