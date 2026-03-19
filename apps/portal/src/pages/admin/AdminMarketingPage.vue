<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import SparkLine from '../../components/SparkLine.vue'
import DonutChart from '../../components/DonutChart.vue'
import LineChart from '../../components/LineChart.vue'
import DashboardSubNav from '../../components/DashboardSubNav.vue'
import { adminGetSalesFunnel, type SalesFunnel } from '../../lib/api'
import { pctDelta } from '../../lib/dashboard-helpers'
import { useDashboardMonth } from '../../lib/useDashboardMonth'

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */
const funnelLoading = ref(true)
const funnelError = ref<string | null>(null)
const funnel = ref<SalesFunnel | null>(null)
const cachedAt = ref<string | null>(null)

const { selectedMonth, monthOptions } = useDashboardMonth()

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
/*  KPI cards                                                          */
/* ------------------------------------------------------------------ */
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
/*  Funnel steps                                                       */
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

const maxStageCount = computed(() => {
  if (!funnel.value) return 1
  return Math.max(...funnel.value.byStage.map((s) => s.count), 1)
})

const funnelMonthLabel = computed(() => {
  if (!funnel.value) return ''
  const parts = funnel.value.month.split('-').map(Number)
  return new Date(parts[0] ?? 2026, (parts[1] ?? 1) - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
})

/* ── Donut chart colour palettes ── */
const STAGE_COLORS = ['#818cf8', '#34d399', '#fbbf24', '#f472b6', '#38bdf8', '#a78bfa']
const PROVISION_COLORS = ['#f97316', '#06b6d4', '#a855f7', '#14b8a6']
const REFERRAL_COLORS = ['#818cf8', '#f472b6', '#34d399', '#fbbf24', '#38bdf8', '#fb7185', '#a78bfa', '#94a3b8']
const TRAFFIC_COLORS = ['#818cf8', '#34d399', '#fbbf24', '#f472b6', '#38bdf8', '#f97316', '#a855f7', '#fb7185', '#14b8a6', '#94a3b8']

const stageDonut = computed(() =>
  (funnel.value?.stageBreakdown ?? []).map((s, i) => ({
    label: s.label, value: s.count, color: STAGE_COLORS[i % STAGE_COLORS.length]!,
  })),
)

const provisionDonut = computed(() =>
  (funnel.value?.provisionBreakdown ?? []).map((s, i) => ({
    label: s.label, value: s.count, color: PROVISION_COLORS[i % PROVISION_COLORS.length]!,
  })),
)

const referralDonut = computed(() =>
  (funnel.value?.referralBreakdown ?? []).map((s, i) => ({
    label: s.label, value: s.count, color: REFERRAL_COLORS[i % REFERRAL_COLORS.length]!,
  })),
)

const weeklyLinePoints = computed(() =>
  (funnel.value?.weeklySubmissions ?? []).map((w) => ({
    label: w.weekLabel, value: w.count,
  })),
)

const trafficSourceMax = computed(() =>
  Math.max(...(funnel.value?.trafficSources ?? []).map((t) => t.count), 1),
)

watch(selectedMonth, () => void loadFunnel())

onMounted(() => {
  void loadFunnel()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-2">
      <p class="text-xs uppercase tracking-[0.08em] text-gray-600">Analytics</p>
      <h2 class="text-2xl font-semibold text-gray-900">Marketing</h2>
      <p class="text-sm text-gray-700">Lead generation, form performance, and pipeline analysis.</p>
    </div>

    <div class="rounded-2xl border border-white/10 bg-[#0f1428] p-6 text-white shadow-[0_18px_40px_rgba(15,20,40,0.35)]">
      <!-- Header with sub-nav + controls -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-4">
          <DashboardSubNav />
          <div class="text-xs text-white/50">{{ funnelMonthLabel }}</div>
        </div>
        <div class="flex items-center gap-2">
          <select
            v-model="selectedMonth"
            class="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-white/80 outline-none hover:bg-white/10"
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
      <div v-if="cachedAt" class="mt-1 text-xs text-white/50">
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
              <div class="text-xs font-semibold uppercase tracking-wider text-white/60">{{ card.label }}</div>
              <SparkLine :data="card.spark" :color="card.color" :width="64" :height="24" />
            </div>
            <div class="mt-3 text-2xl font-bold tabular-nums text-white sm:text-3xl">{{ card.val }}</div>
            <div class="mt-1.5 flex items-center gap-1.5">
              <span
                v-if="card.delta.dir !== 'flat'"
                class="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-bold"
                :class="card.delta.dir === 'up' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'"
              >
                <svg v-if="card.delta.dir === 'up'" class="h-2.5 w-2.5" fill="none" viewBox="0 0 10 10"><path d="M5 2v6M2.5 4.5 5 2l2.5 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <svg v-else class="h-2.5 w-2.5" fill="none" viewBox="0 0 10 10"><path d="M5 8V2M2.5 5.5 5 8l2.5-2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                {{ card.delta.value }}{{ card.suffix }}
              </span>
              <span v-else class="text-xs text-white/50">—</span>
              <span class="text-xs text-white/50">vs prev</span>
            </div>
            <div class="mt-1 text-xs text-white/50">{{ card.sub }}</div>
          </div>
        </div>

        <!-- ── Visual funnel ── -->
        <div class="mt-8">
          <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Funnel</div>
          <div class="mt-4 flex flex-col items-center gap-0">
            <template v-for="(step, idx) in funnelSteps" :key="step.label">
              <div
                class="w-full transition-all duration-700"
                :style="{ maxWidth: step.pct + '%', minWidth: '140px' }"
              >
                <div
                  :class="[step.bgClass, idx === 0 ? 'rounded-t-xl' : '', idx === funnelSteps.length - 1 ? 'rounded-b-xl' : '']"
                  class="relative flex items-center justify-between px-5 py-3.5"
                >
                  <div
                    :class="[step.barClass, idx === 0 ? 'rounded-t-xl' : '', idx === funnelSteps.length - 1 ? 'rounded-b-xl' : '']"
                    class="absolute inset-0 opacity-[0.12] transition-all duration-700"
                  />
                  <span :class="step.textClass" class="relative text-sm font-semibold">{{ step.label }}</span>
                  <span class="relative text-xl font-bold tabular-nums text-white">{{ step.value }}</span>
                </div>
              </div>
              <div v-if="idx < funnelConversions.length" class="flex items-center gap-2 py-1.5">
                <div class="h-3 w-px bg-white/10" />
                <span class="rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-0.5 text-xs font-bold tabular-nums text-white/50">
                  {{ funnelConversions[idx] }}%
                </span>
                <div class="h-3 w-px bg-white/10" />
              </div>
            </template>
          </div>
        </div>

        <!-- ── Per-form performance ── -->
        <div class="mt-8">
          <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Form performance</div>
          <div class="mt-3 space-y-2">
            <div
              v-for="(pf, idx) in funnel.perForm"
              :key="pf.formName"
              class="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-white/80">{{ pf.formName }}</span>
                  <span
                    v-if="idx === bestFormIdx && pf.demos > 0"
                    class="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400"
                  >Best</span>
                </div>
                <div class="flex items-center gap-4 text-xs tabular-nums">
                  <div class="text-center">
                    <div class="font-bold text-white">{{ pf.submissions }}</div>
                    <div class="text-xs text-white/50">Subs</div>
                  </div>
                  <div class="text-center">
                    <div class="font-bold text-emerald-400">{{ pf.sql }}</div>
                    <div class="text-xs text-white/50">SQL</div>
                  </div>
                  <div class="text-center">
                    <div class="font-bold text-amber-400">{{ pf.demos }}</div>
                    <div class="text-xs text-white/50">Demos</div>
                  </div>
                </div>
              </div>
              <div class="mt-2 flex items-center gap-2">
                <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.04]">
                  <div
                    class="h-full rounded-full bg-gradient-to-r from-emerald-500/60 to-emerald-400/80 transition-all duration-500"
                    :style="{ width: (pf.submissions > 0 ? Math.round((pf.demos / pf.submissions) * 100) : 0) + '%', minWidth: pf.demos > 0 ? '4px' : '0' }"
                  />
                </div>
                <span class="w-10 text-right text-xs font-semibold tabular-nums text-white/35">
                  {{ pf.submissions > 0 ? Math.round((pf.demos / pf.submissions) * 100) : 0 }}%
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Lead pipeline ── -->
        <div v-if="funnel.byStage.length > 0" class="mt-8">
          <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Lead pipeline</div>
          <div class="mt-3 space-y-1.5">
            <div v-for="s in funnel.byStage" :key="s.stageId" class="flex items-center gap-3">
              <span class="w-32 shrink-0 text-right text-xs text-white/50 sm:w-40">{{ s.label }}</span>
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

        <!-- ── Donut charts ── -->
        <div class="mt-8">
          <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Breakdown insights</div>
          <div class="mt-5 grid grid-cols-1 gap-6 md:grid-cols-3">
            <div v-if="stageDonut.length" class="flex flex-col items-center rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <div class="mb-3 text-xs font-semibold text-white/60">Registration Stage</div>
              <DonutChart
                :segments="stageDonut"
                :size="160"
                :stroke-width="24"
                :centre-value="String(stageDonut.reduce((a, s) => a + s.value, 0))"
                centre-label="total"
              />
            </div>
            <div v-if="provisionDonut.length" class="flex flex-col items-center rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <div class="mb-3 text-xs font-semibold text-white/60">Provision Type</div>
              <DonutChart
                :segments="provisionDonut"
                :size="160"
                :stroke-width="24"
                :centre-value="String(provisionDonut.reduce((a, s) => a + s.value, 0))"
                centre-label="total"
              />
            </div>
            <div v-if="referralDonut.length" class="flex flex-col items-center rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <div class="mb-3 text-xs font-semibold text-white/60">Where Did You Hear About Us</div>
              <DonutChart
                :segments="referralDonut"
                :size="160"
                :stroke-width="24"
                :centre-value="String(referralDonut.reduce((a, s) => a + s.value, 0))"
                centre-label="total"
              />
            </div>
          </div>
        </div>

        <!-- ── Weekly submissions line chart ── -->
        <div v-if="weeklyLinePoints.length > 1" class="mt-8">
          <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Submissions over time</div>
          <div class="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <LineChart :points="weeklyLinePoints" color="#818cf8" :height="200" />
          </div>
        </div>

        <!-- ── Traffic sources ── -->
        <div v-if="funnel.trafficSources && funnel.trafficSources.length > 0" class="mt-8">
          <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Traffic sources</div>
          <div class="mt-3 space-y-1.5">
            <div v-for="(t, ti) in funnel.trafficSources" :key="t.value" class="flex items-center gap-3">
              <span class="w-32 shrink-0 text-right text-xs text-white/50 sm:w-40">{{ t.label }}</span>
              <div class="h-5 flex-1 overflow-hidden rounded bg-white/[0.04]">
                <div
                  class="h-full rounded transition-all duration-500"
                  :style="{
                    width: Math.round((t.count / trafficSourceMax) * 100) + '%',
                    minWidth: t.count > 0 ? '4px' : '0',
                    backgroundColor: TRAFFIC_COLORS[ti % TRAFFIC_COLORS.length],
                    opacity: 0.4,
                  }"
                />
              </div>
              <span class="w-7 text-right text-xs font-semibold tabular-nums text-white/60">{{ t.count }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
