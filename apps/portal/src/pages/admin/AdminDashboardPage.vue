<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import {
  adminGetDashboardStats,
  adminGetSalesFunnel,
  type AdminDashboardStats,
  type SalesFunnel,
} from '../../lib/api'

/* ------------------------------------------------------------------ */
/*  Customer overview (existing stat cards)                           */
/* ------------------------------------------------------------------ */
const loading = ref(true)
const error = ref<string | null>(null)
const stats = ref<AdminDashboardStats | null>(null)

async function loadStats() {
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

/* ------------------------------------------------------------------ */
/*  Sales funnel                                                      */
/* ------------------------------------------------------------------ */
const funnelLoading = ref(true)
const funnelError = ref<string | null>(null)
const funnel = ref<SalesFunnel | null>(null)

/** Generate the last 6 months as YYYY-MM options. */
const monthOptions = computed(() => {
  const opts: { value: string; label: string }[] = []
  const now = new Date()
  for (let i = 1; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    opts.push({ value: val, label })
  }
  return opts
})

const selectedMonth = ref(monthOptions.value[0]?.value ?? '')

async function loadFunnel() {
  funnelLoading.value = true
  funnelError.value = null
  try {
    const res = await adminGetSalesFunnel(selectedMonth.value || undefined)
    funnel.value = res.funnel
  } catch (e) {
    funnelError.value = e instanceof Error ? e.message : 'Failed to load sales funnel'
  } finally {
    funnelLoading.value = false
  }
}

/** Computed funnel bars (widths relative to form submissions) */
const funnelBars = computed(() => {
  if (!funnel.value) return []
  const f = funnel.value
  const max = Math.max(f.formSubmissions, 1)
  return [
    { label: 'Form submissions', value: f.formSubmissions, pct: 100, color: 'bg-indigo-500' },
    { label: 'MQLs (leads)', value: f.leads, pct: Math.round((f.leads / max) * 100), color: 'bg-sky-500' },
    { label: 'SQL', value: f.sql, pct: Math.round((f.sql / max) * 100), color: 'bg-emerald-500' },
    { label: 'Demos', value: f.demos, pct: Math.round((f.demos / max) * 100), color: 'bg-amber-500' },
  ]
})

/** Month display label */
const funnelMonthLabel = computed(() => {
  if (!funnel.value) return ''
  const parts = funnel.value.month.split('-').map(Number)
  const y = parts[0] ?? 2026
  const m = parts[1] ?? 1
  return new Date(y, m - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
})

onMounted(() => {
  void loadStats()
  void loadFunnel()
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
          @click="loadStats"
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
            <div class="h-8 text-xs font-semibold uppercase tracking-wide text-white/50">Live<br>customers</div>
            <div class="mt-2 text-3xl font-semibold text-white">{{ stats.liveCompanyCount.toLocaleString() }}</div>
            <p class="mt-1 text-xs text-white/40">Companies set to live customer</p>
          </div>

          <!-- Users associated with live customers -->
          <div class="rounded-xl border border-white/10 bg-white/5 p-4">
            <div class="h-8 text-xs font-semibold uppercase tracking-wide text-white/50">Associated<br>contacts</div>
            <div class="mt-2 text-3xl font-semibold text-white">{{ stats.liveUserCount.toLocaleString() }}</div>
            <p class="mt-1 text-xs text-white/40">HubSpot contacts at live companies</p>
          </div>

          <!-- Total homes -->
          <div class="rounded-xl border border-white/10 bg-white/5 p-4">
            <div class="h-8 text-xs font-semibold uppercase tracking-wide text-white/50">Total<br>homes</div>
            <div class="mt-2 text-3xl font-semibold text-white">{{ stats.totalHomes.toLocaleString() }}</div>
            <p class="mt-1 text-xs text-white/40">All home types across live customers</p>
          </div>

          <!-- Children's homes -->
          <div class="rounded-xl border border-white/10 bg-white/5 p-4">
            <div class="h-8 text-xs font-semibold uppercase tracking-wide text-white/50">Children's<br>homes</div>
            <div class="mt-2 text-3xl font-semibold text-white">{{ stats.totalChildrensHomes.toLocaleString() }}</div>
            <p class="mt-1 text-xs text-white/40">number_of_homes (CH)</p>
          </div>

          <!-- Supported accommodation -->
          <div class="rounded-xl border border-white/10 bg-white/5 p-4">
            <div class="h-8 text-xs font-semibold uppercase tracking-wide text-white/50">Supported<br>accommodation</div>
            <div class="mt-2 text-3xl font-semibold text-white">{{ stats.totalSupportedAccommodation.toLocaleString() }}</div>
            <p class="mt-1 text-xs text-white/40">number_of_homes (SA)</p>
          </div>
        </div>
      </template>
    </div>

    <!-- ─── Sales funnel ─── -->
    <div class="rounded-2xl border border-white/10 bg-[#0f1428] p-6 text-white shadow-[0_18px_40px_rgba(15,20,40,0.35)]">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="text-sm font-semibold text-white/80">Sales funnel — {{ funnelMonthLabel }}</div>
        <div class="flex items-center gap-2">
          <select
            v-model="selectedMonth"
            class="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-white/80 outline-none hover:bg-white/10"
            @change="loadFunnel"
          >
            <option v-for="o in monthOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
          <button
            class="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-white/80 hover:bg-white/10"
            type="button"
            @click="loadFunnel"
          >
            Refresh
          </button>
        </div>
      </div>

      <div v-if="funnelLoading" class="mt-6 text-sm text-white/60">Loading funnel data…</div>

      <div v-else-if="funnelError" class="mt-6 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
        {{ funnelError }}
      </div>

      <template v-else-if="funnel">
        <!-- Funnel bars -->
        <div class="mt-6 space-y-3">
          <div v-for="bar in funnelBars" :key="bar.label" class="space-y-1">
            <div class="flex items-baseline justify-between text-sm">
              <span class="font-medium text-white/70">{{ bar.label }}</span>
              <span class="text-lg font-semibold text-white">{{ bar.value }}</span>
            </div>
            <div class="h-7 w-full overflow-hidden rounded-lg bg-white/5">
              <div
                :class="bar.color"
                class="h-full rounded-lg transition-all duration-500"
                :style="{ width: bar.pct + '%', minWidth: bar.value > 0 ? '2rem' : '0' }"
              />
            </div>
          </div>
        </div>

        <!-- Conversion rates -->
        <div class="mt-4 flex flex-wrap gap-3">
          <div class="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center">
            <div class="text-lg font-semibold text-white">{{ funnel.formSubmissions > 0 ? Math.round((funnel.leads / funnel.formSubmissions) * 100) : 0 }}%</div>
            <div class="text-[10px] uppercase tracking-wide text-white/40">Sub → MQL</div>
          </div>
          <div class="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center">
            <div class="text-lg font-semibold text-white">{{ funnel.leads > 0 ? Math.round((funnel.sql / funnel.leads) * 100) : 0 }}%</div>
            <div class="text-[10px] uppercase tracking-wide text-white/40">MQL → SQL</div>
          </div>
          <div class="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center">
            <div class="text-lg font-semibold text-white">{{ funnel.sql > 0 ? Math.round((funnel.demos / funnel.sql) * 100) : 0 }}%</div>
            <div class="text-[10px] uppercase tracking-wide text-white/40">SQL → Demo</div>
          </div>
        </div>

        <!-- Per-form MQL breakdown -->
        <div class="mt-6">
          <div class="text-xs font-semibold uppercase tracking-wide text-white/50">MQLs by form</div>
          <div class="mt-3 overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/40">
                  <th class="pb-2 pr-4 font-semibold">Form</th>
                  <th class="pb-2 px-3 font-semibold text-right">Subs</th>
                  <th class="pb-2 pl-3 font-semibold text-right">MQLs</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="pf in funnel.perForm" :key="pf.formName" class="border-b border-white/5">
                  <td class="py-2 pr-4 text-white/70">{{ pf.formName }}</td>
                  <td class="py-2 px-3 text-right text-white">{{ pf.submissions }}</td>
                  <td class="py-2 pl-3 text-right text-white">{{ pf.mqls }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Lead pipeline stage breakdown -->
        <div class="mt-6">
          <div class="text-xs font-semibold uppercase tracking-wide text-white/50">Lead pipeline breakdown</div>
          <div class="mt-3 overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/40">
                  <th class="pb-2 pr-4 font-semibold">Stage</th>
                  <th class="pb-2 pl-3 font-semibold text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in funnel.byStage" :key="s.stageId" class="border-b border-white/5">
                  <td class="py-2 pr-4 text-white/70">{{ s.label }}</td>
                  <td class="py-2 pl-3 text-right text-white">{{ s.count }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
