<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { adminLogin } from '../../lib/api'
import { clearAdminAccessToken, setAdminAccessToken } from '../../lib/auth'

const router = useRouter()
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref<string | null>(null)

async function onSubmit() {
  error.value = null
  loading.value = true
  try {
    const res = await adminLogin(email.value, password.value)
    setAdminAccessToken(res.accessToken)
    await router.push('/admin/events')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Login failed'
  } finally {
    loading.value = false
  }
}

function goToPortalLogin() {
  clearAdminAccessToken()
  router.replace('/login')
}
</script>

<template>
  <section class="min-h-screen bg-slate-900 text-white flex items-center justify-center px-4">
    <div class="w-full max-w-md bg-slate-800 border border-slate-700 rounded-xl p-8 shadow-lg space-y-6">
      <div class="space-y-2">
        <h1 class="text-2xl font-bold">Admin Sign in</h1>
        <p class="text-sm text-slate-300">Use your Mentor admin credentials to access the control panel.</p>
      </div>

      <form class="space-y-4" @submit.prevent="onSubmit">
        <div class="space-y-2">
          <label class="text-sm font-medium text-slate-200">Email</label>
          <input
            v-model="email"
            type="email"
            autocomplete="username"
            class="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:ring-2 focus:ring-indigo-400"
            placeholder="you@mentorsoftware.co.uk"
            required
          >
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium text-slate-200">Password</label>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            class="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:ring-2 focus:ring-indigo-400"
            placeholder="••••••••"
            required
          >
        </div>

        <button
          type="submit"
          class="w-full rounded-lg bg-indigo-500 px-4 py-2 font-semibold text-white hover:bg-indigo-600 disabled:opacity-60"
          :disabled="loading"
        >
          <span v-if="loading">Signing in…</span>
          <span v-else>Sign in</span>
        </button>

        <button
          type="button"
          class="w-full rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:border-slate-500 hover:text-white"
          :disabled="loading"
          @click="goToPortalLogin"
        >
          Go to portal sign in
        </button>

        <p v-if="error" class="text-sm text-rose-300">{{ error }}</p>
      </form>
    </div>
  </section>
</template>
