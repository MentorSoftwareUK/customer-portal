<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { adminGetDashboardStats, type AdminDashboardStats } from '../../lib/api'

const loading = ref(true)
const error = ref<string | null>(null)
const stats = ref<AdminDashboardStats | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await adminGetDashboardStats()
    stats.value = res.stats
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load dashboard stats'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-2">
      <p class="text-xs uppercase tracking-[0.08em] text-gray-600">Control centre</p>
      <h2 class="text-2xl font-semibold text-gray-900">Dashboard</h2>
      <p class="text-sm text-gray-700">Overview of live customers, users, and homes across your portfolio.</p>
    </div>

    <div class="rounded-2xl border border-white/10 bg-[#0f1428] p-6 text-white shadow-[0_18px_40px_rgba(15,20,40,0.35)]">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="text-sm font-semibold text-white/80">Customer overview</div>
        <button
          class="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-white/80 hover:bg-white/10"
          type="button"
          @click="load"
        >
          Refresh
        </button>
      </div>

      <div v-if="loading" class="mt-6 text-sm text-white/60">Loading dashboard stats…</div>

      <div v-else-if="error" class="mt-6 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
        {{ error }}
      </div>

      <template v-else-if="stats">
        <div class="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <!-- Live companies -->
          <div class="rounded-xl border border-white/10 bg-white/5 p-4">
            <div class="text-xs font-semibold uppercase tracking-wide text-white/50">Live customers</div>
            <div class="mt-2 text-3xl font-semibold text-white">{{ stats.liveCompanyCount.toLocaleString() }}</div>
            <p class="mt-1 text-xs text-white/40">Companies set to live customer</p>
          </div>

          <!-- Users associated with live customers -->
          <div class="rounded-xl border border-white/10 bg-white/5 p-4">
            <div class="text-xs font-semibold uppercase tracking-wide text-white/50">Live customer users</div>
            <div class="mt-2 text-3xl font-semibold text-white">{{ stats.liveUserCount.toLocaleString() }}</div>
            <p class="mt-1 text-xs text-white/40">Active users at live companies</p>
          </div>

          <!-- Total homes -->
          <div class="rounded-xl border border-white/10 bg-white/5 p-4">
            <div class="text-xs font-semibold uppercase tracking-wide text-white/50">Total homes</div>
            <div class="mt-2 text-3xl font-semibold text-white">{{ stats.totalHomes.toLocaleString() }}</div>
            <p class="mt-1 text-xs text-white/40">number_of_homes across live customers</p>
          </div>

          <!-- Children's homes -->
          <div class="rounded-xl border border-white/10 bg-white/5 p-4">
            <div class="text-xs font-semibold uppercase tracking-wide text-white/50">Children's homes</div>
            <div class="mt-2 text-3xl font-semibold text-white">{{ stats.totalChildrensHomes.toLocaleString() }}</div>
            <p class="mt-1 text-xs text-white/40">number_of_homes__ch_ across live customers</p>
          </div>

          <!-- Supported accommodation -->
          <div class="rounded-xl border border-white/10 bg-white/5 p-4">
            <div class="text-xs font-semibold uppercase tracking-wide text-white/50">Supported accommodation</div>
            <div class="mt-2 text-3xl font-semibold text-white">{{ stats.totalSupportedAccommodation.toLocaleString() }}</div>
            <p class="mt-1 text-xs text-white/40">number_of_homes__sa_ across live customers</p>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
