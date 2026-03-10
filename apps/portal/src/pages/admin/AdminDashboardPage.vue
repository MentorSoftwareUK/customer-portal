<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import SparkLine from '../../components/SparkLine.vue'
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
const cachedAt = ref<string | null>(null)

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

async function loadFunnel(refresh = false) {
  funnelLoading.value = true
  funnelError.value = null
  try {
    const res = await adminGetSalesFunnel(selectedMonth.value || undefined, refresh)
    funnel.value = res.funnel
    cachedAt.value = res.cachedAt ?? null
  } catch (e) {
    funnelError.value = e instanceof Error ? e.message : 'Failed to load sales funnel'
  } finally {
    funnelLoading.value = false
  }
}

/* ------------------------------------------------------------------ */
/*  KPI cards with sparklines + deltas                                */
/* ------------------------------------------------------------------ */

function pctDelta(curr: number, prev: number | undefined) {
  if (prev == null || prev === 0) return { value: 0, dir: 'flat' as const }
  const d = ((curr - prev) / prev) * 100
  return { value: Math.abs(Math.round(d)), dir: d > 0 ? 'up' as const : d < 0 ? 'down' as const : 'flat' as const }
}

const kpiCards = computed(() => {
  if (!funnel.value) return []
  const f = funnel.value
  const p = f.previous

  const currConv = f.mqls > 0 ? (f.demos / f.mqls) * 100 : 0
  const prevConv = p && p.mqls > 0 ? (p.demos / p.mqls) * 100 : 0
  const convDelta = {
    value: Math.abs(Math.round(currConv - prevConv)),
    dir: currConv > prevConv ? 'up' as const : currConv < prevConv ? 'down' as const : 'flat' as const,
  }

  return [
    {
      label: 'MQLs',
      sub: 'Form submissions',
      val: f.mqls.toLocaleString(),
      delta: pctDelta(f.mqls, p?.mqls),
      suffix: '%',
      spark: f.trend.map((t) => t.mqls),
      color: '#818cf8',
    },
    {
      label: 'SQL',
      sub: 'Qualified leads',
      val: f.sql.toLocaleString(),
      delta: pctDelta(f.sql, p?.sql),
      suffix: '%',
      spark: f.trend.map((t) => t.sql),
      color: '#34d399',
    },
    {
      label: 'Demos',
      sub: 'Completed demos',
      val: f.demos.toLocaleString(),
      delta: pctDelta(f.demos, p?.demos),
      suffix: '%',
      spark: f.trend.map((t) => t.demos),
      color: '#fbbf24',
    },
    {
      label: 'MQL → Demo',
      sub: 'End-to-end conversion',
      val: `${Math.round(currConv)}%`,
      delta: convDelta,
      suffix: 'pp',
      spark: f.trend.map((t) => (t.mqls > 0 ? (t.demos / t.mqls) * 100 : 0)),
      color: '#f472b6',
    },
  ]
})

/* ------------------------------------------------------------------ */
/*  Funnel steps                                                      */
/* ------------------------------------------------------------------ */

const funnelSteps = computed(() => {
  if (!funnel.value) return []
  const f = funnel.value
  const max = Math.max(f.mqls, 1)
  return [
    { label: 'MQLs', value: f.mqls, pct: 100, barClass: 'bg-indigo-400', bgClass: 'bg-indigo-500/10', textClass: 'text-indigo-300' },
    { label: 'SQL', value: f.sql, pct: Math.max(Math.round((f.sql / max) * 100), f.sql > 0 ? 15 : 0), barClass: 'bg-emerald-400', bgClass: 'bg-emerald-500/10', textClass: 'text-emerald-300' },
    { label: 'Demos', value: f.demos, pct: Math.max(Math.round((f.demos / max) * 100), f.demos > 0 ? 10 : 0), barClass: 'bg-amber-400', bgClass: 'bg-amber-500/10', textClass: 'text-amber-300' },
  ]
})

const funnelConversions = computed(() => {
  if (!funnel.value) return []
  const f = funnel.value
  return [
    f.mqls > 0 ? Math.round((f.sql / f.mqls) * 100) : 0,
    f.sql > 0 ? Math.round((f.demos / f.sql) * 100) : 0,
  ]
})

/* ------------------------------------------------------------------ */
/*  Per-form best performer                                           */
/* ------------------------------------------------------------------ */

const bestFormIdx = computed(() => {
  if (!funnel.value) return -1
  let best = -1
  let bestRate = -1
  funnel.value.perForm.forEach((pf, i) => {
    const rate = pf.submissions > 0 ? pf.demos / pf.submissions : 0
    if (rate > bestRate && pf.submissions > 0) {
      bestRate = rate
      best = i
    }
  })
  return best
})

/* ------------------------------------------------------------------ */
/*  Lead pipeline max count (for horizontal bar widths)               */
/* ------------------------------------------------------------------ */

const maxStageCount = computed(() => {
  if (!funnel.value) return 1
  return Math.max(...funnel.value.byStage.map((s) => s.count), 1)
})

/* Month label */
const funnelMonthLabel = computed(() => {
  if (!funnel.value) return ''
  const parts = funnel.value.month.split('-').map(Number)
  return new Date(parts[0] ?? 2026, (parts[1] ?? 1) - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
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

    <!-- ═══════════════════ Customer overview ═══════════════════ -->
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
          <div class="rounded-xl border border-white/10 bg-white/5 p-4">
            <div class="h-8 text-xs font-semibold uppercase tracking-wide text-white/50">Live<br>customers</div>
            <div class="mt-2 text-3xl font-semibold text-white">{{ stats.liveCompanyCount.toLocaleString() }}</div>
            <p class="mt-1 text-xs text-white/40">Companies set to live customer</p>
          </div>
          <div class="rounded-xl border border-white/10 bg-white/5 p-4">
            <div class="h-8 text-xs font-semibold uppercase tracking-wide text-white/50">Associated<br>contacts</div>
            <div class="mt-2 text-3xl font-semibold text-white">{{ stats.liveUserCount.toLocaleString() }}</div>
            <p class="mt-1 text-xs text-white/40">HubSpot contacts at live companies</p>
          </div>
          <div class="rounded-xl border border-white/10 bg-white/5 p-4">
            <div class="h-8 text-xs font-semibold uppercase tracking-wide text-white/50">Total<br>homes</div>
            <div class="mt-2 text-3xl font-semibold text-white">{{ stats.totalHomes.toLocaleString() }}</div>
            <p class="mt-1 text-xs text-white/40">All home types across live customers</p>
          </div>
          <div class="rounded-xl border border-white/10 bg-white/5 p-4">
            <div class="h-8 text-xs font-semibold uppercase tracking-wide text-white/50">Children's<br>homes</div>
            <div class="mt-2 text-3xl font-semibold text-white">{{ stats.totalChildrensHomes.toLocaleString() }}</div>
            <p class="mt-1 text-xs text-white/40">number_of_homes (CH)</p>
          </div>
          <div class="rounded-xl border border-white/10 bg-white/5 p-4">
            <div class="h-8 text-xs font-semibold uppercase tracking-wide text-white/50">Supported<br>accommodation</div>
            <div class="mt-2 text-3xl font-semibold text-white">{{ stats.totalSupportedAccommodation.toLocaleString() }}</div>
            <p class="mt-1 text-xs text-white/40">number_of_homes (SA)</p>
          </div>
        </div>
      </template>
    </div>

    <!-- ═══════════════════ Sales performance ═══════════════════ -->
    <div class="rounded-2xl border border-white/10 bg-[#0f1428] p-6 text-white shadow-[0_18px_40px_rgba(15,20,40,0.35)]">
      <!-- Header -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="text-sm font-semibold text-white/80">Sales performance</div>
          <div class="mt-0.5 text-xs text-white/40">{{ funnelMonthLabel }}</div>
        </div>
        <div class="flex items-center gap-2">
          <select
            v-model="selectedMonth"
            class="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-white/80 outline-none hover:bg-white/10"
            @change="loadFunnel(false)"
          >
            <option v-for="o in monthOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
          <button
            class="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-white/80 hover:bg-white/10"
            type="button"
            title="Refresh from HubSpot"
            :disabled="funnelLoading"
            @click="loadFunnel(true)"
          >
            <svg class="h-3.5 w-3.5" :class="{ 'animate-spin': funnelLoading }" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
        </div>
      </div>
      <div v-if="cachedAt" class="mt-1 text-[10px] text-white/25">
        Last updated: {{ new Date(cachedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }}
      </div>

      <!-- Loading / Error -->
      <div v-if="funnelLoading" class="mt-8 flex items-center justify-center py-12">
        <div class="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-indigo-400" />
      </div>

      <div v-else-if="funnelError" class="mt-6 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
        {{ funnelError }}
      </div>

      <template v-else-if="funnel">
        <!-- ── KPI cards ── -->
        <div class="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div
            v-for="card in kpiCards"
            :key="card.label"
            class="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.05]"
          >
            <div class="flex items-start justify-between">
              <div class="text-[11px] font-semibold uppercase tracking-wider text-white/40">{{ card.label }}</div>
              <SparkLine :data="card.spark" :color="card.color" :width="64" :height="24" />
            </div>
            <div class="mt-3 text-2xl font-bold tabular-nums text-white sm:text-3xl">{{ card.val }}</div>
            <div class="mt-1.5 flex items-center gap-1.5">
              <span
                v-if="card.delta.dir !== 'flat'"
                class="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                :class="card.delta.dir === 'up' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'"
              >
                <svg v-if="card.delta.dir === 'up'" class="h-2.5 w-2.5" fill="none" viewBox="0 0 10 10"><path d="M5 2v6M2.5 4.5 5 2l2.5 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <svg v-else class="h-2.5 w-2.5" fill="none" viewBox="0 0 10 10"><path d="M5 8V2M2.5 5.5 5 8l2.5-2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                {{ card.delta.value }}{{ card.suffix }}
              </span>
              <span v-else class="text-[10px] text-white/20">—</span>
              <span class="text-[10px] text-white/25">vs prev</span>
            </div>
            <div class="mt-1 text-[10px] text-white/25">{{ card.sub }}</div>
          </div>
        </div>

        <!-- ── Visual funnel ── -->
        <div class="mt-8">
          <div class="text-[11px] font-semibold uppercase tracking-wider text-white/40">Funnel</div>
          <div class="mt-4 flex flex-col items-center gap-0">
            <template v-for="(step, idx) in funnelSteps" :key="step.label">
              <!-- Bar -->
              <div
                class="w-full transition-all duration-700"
                :style="{ maxWidth: step.pct + '%', minWidth: '140px' }"
              >
                <div
                  :class="[step.bgClass, idx === 0 ? 'rounded-t-xl' : '', idx === funnelSteps.length - 1 ? 'rounded-b-xl' : '']"
                  class="relative flex items-center justify-between px-5 py-3.5"
                >
                  <!-- Animated fill -->
                  <div
                    :class="[step.barClass, idx === 0 ? 'rounded-t-xl' : '', idx === funnelSteps.length - 1 ? 'rounded-b-xl' : '']"
                    class="absolute inset-0 opacity-[0.12] transition-all duration-700"
                  />
                  <span :class="step.textClass" class="relative text-sm font-semibold">{{ step.label }}</span>
                  <span class="relative text-xl font-bold tabular-nums text-white">{{ step.value }}</span>
                </div>
              </div>
              <!-- Connector -->
              <div v-if="idx < funnelConversions.length" class="flex items-center gap-2 py-1.5">
                <div class="h-3 w-px bg-white/10" />
                <span class="rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-0.5 text-[10px] font-bold tabular-nums text-white/40">
                  {{ funnelConversions[idx] }}%
                </span>
                <div class="h-3 w-px bg-white/10" />
              </div>
            </template>
          </div>
        </div>

        <!-- ── Per-form performance ── -->
        <div class="mt-8">
          <div class="text-[11px] font-semibold uppercase tracking-wider text-white/40">Form performance</div>
          <div class="mt-3 space-y-2">
            <div
              v-for="(pf, idx) in funnel.perForm"
              :key="pf.formName"
              class="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-white/70">{{ pf.formName }}</span>
                  <span
                    v-if="idx === bestFormIdx && pf.demos > 0"
                    class="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-400"
                  >Best</span>
                </div>
                <div class="flex items-center gap-4 text-xs tabular-nums">
                  <div class="text-center">
                    <div class="font-bold text-white">{{ pf.submissions }}</div>
                    <div class="text-[10px] text-white/30">Subs</div>
                  </div>
                  <div class="text-center">
                    <div class="font-bold text-emerald-400">{{ pf.sql }}</div>
                    <div class="text-[10px] text-white/30">SQL</div>
                  </div>
                  <div class="text-center">
                    <div class="font-bold text-amber-400">{{ pf.demos }}</div>
                    <div class="text-[10px] text-white/30">Demos</div>
                  </div>
                </div>
              </div>
              <!-- Conversion bar -->
              <div class="mt-2 flex items-center gap-2">
                <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.04]">
                  <div
                    class="h-full rounded-full bg-gradient-to-r from-emerald-500/60 to-emerald-400/80 transition-all duration-500"
                    :style="{ width: (pf.submissions > 0 ? Math.round((pf.demos / pf.submissions) * 100) : 0) + '%', minWidth: pf.demos > 0 ? '4px' : '0' }"
                  />
                </div>
                <span class="w-10 text-right text-[10px] font-semibold tabular-nums text-white/35">
                  {{ pf.submissions > 0 ? Math.round((pf.demos / pf.submissions) * 100) : 0 }}%
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Lead pipeline (reference) ── -->
        <div v-if="funnel.byStage.length > 0" class="mt-8">
          <div class="text-[11px] font-semibold uppercase tracking-wider text-white/40">Lead pipeline</div>
          <div class="mt-3 space-y-1.5">
            <div v-for="s in funnel.byStage" :key="s.stageId" class="flex items-center gap-3">
              <span class="w-32 shrink-0 text-right text-xs text-white/40 sm:w-40">{{ s.label }}</span>
              <div class="h-5 flex-1 overflow-hidden rounded bg-white/[0.04]">
                <div
                  class="h-full rounded bg-sky-500/30 transition-all duration-500"
                  :style="{ width: Math.round((s.count / maxStageCount) * 100) + '%', minWidth: s.count > 0 ? '4px' : '0' }"
                />
              </div>
              <span class="w-7 text-right text-xs font-semibold tabular-nums text-white/60">{{ s.count }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
