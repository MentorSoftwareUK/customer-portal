<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import SparkLine from '../../components/SparkLine.vue'
import LineChart from '../../components/LineChart.vue'
import DashboardSubNav from '../../components/DashboardSubNav.vue'
import { adminGetSalesStats, type SalesStats } from '../../lib/api'
import { pctDelta, formatCurrency, relativeDate } from '../../lib/dashboard-helpers'
import { useDashboardMonth } from '../../lib/useDashboardMonth'

const { selectedMonth, monthOptions } = useDashboardMonth()

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */
const salesLoading = ref(true)
const salesError = ref<string | null>(null)
const sales = ref<SalesStats | null>(null)
const salesCachedAt = ref<string | null>(null)
const freeTableExpanded = ref(false)

async function loadSalesStats(refresh = false) {
  salesLoading.value = true
  salesError.value = null
  try {
    const res = await adminGetSalesStats(selectedMonth.value, refresh)
    sales.value = res.stats
    salesCachedAt.value = res.cachedAt ?? null
  } catch (e) {
    salesError.value = e instanceof Error ? e.message : 'Failed to load sales stats'
  } finally {
    salesLoading.value = false
  }
}

/* ── KPI cards ── */
const salesKpiCards = computed(() => {
  if (!sales.value) return []
  const s = sales.value
  const p = s.previous

  return [
    {
      label: 'Deals Won',
      sub: `Today: ${s.dealsWonToday} · This week: ${s.dealsWonThisWeek}`,
      val: s.dealsWonThisMonth.toString(),
      delta: pctDelta(s.dealsWonThisMonth, p?.dealsWon),
      suffix: '%',
      spark: s.trend.map((t) => t.dealsWon),
      color: '#34d399',
    },
    {
      label: 'Revenue Won',
      sub: 'Closed-won deal value',
      val: `£${s.revenueWonThisMonth.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
      delta: pctDelta(s.revenueWonThisMonth, p?.revenue),
      suffix: '%',
      spark: s.trend.map((t) => t.revenue),
      color: '#818cf8',
    },
    {
      label: 'Win Rate',
      sub: `${s.dealsWonThisMonth} won / ${s.dealsWonThisMonth + s.dealsLostThisMonth} closed`,
      val: `${s.winRate}%`,
      delta: {
        value: Math.abs(s.winRate - (p?.winRate ?? 0)),
        dir: s.winRate > (p?.winRate ?? 0) ? 'up' as const : s.winRate < (p?.winRate ?? 0) ? 'down' as const : 'flat' as const,
      },
      suffix: '%',
      spark: s.trend.map((t) => t.winRate),
      color: '#fbbf24',
    },
    {
      label: 'Avg Close Time',
      sub: 'Days to close (won deals)',
      val: `${s.avgCloseTimeDays}d`,
      delta: {
        value: Math.abs(s.avgCloseTimeDays - (p?.avgCloseTimeDays ?? 0)),
        dir: s.avgCloseTimeDays > (p?.avgCloseTimeDays ?? 0)
          ? 'up' as const
          : s.avgCloseTimeDays < (p?.avgCloseTimeDays ?? 0)
            ? 'down' as const
            : 'flat' as const,
      },
      suffix: 'd',
      spark: s.trend.map((t) => t.avgCloseTimeDays),
      color: '#f472b6',
      lowerIsBetter: true,
    },
    {
      label: 'Open Pipeline',
      sub: `${s.openDealCount} active deals`,
      val: `£${s.openPipelineValue.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
      delta: { value: 0, dir: 'flat' as const },
      suffix: '',
      spark: [],
      color: '#38bdf8',
    },
    {
      label: 'Lose Rate',
      sub: `${s.dealsLostThisMonth} lost this month`,
      val: `${s.loseRate}%`,
      delta: {
        value: Math.abs(s.loseRate - (p ? (100 - p.winRate) : 0)),
        dir: s.loseRate > (p ? (100 - p.winRate) : 0)
          ? 'up' as const
          : s.loseRate < (p ? (100 - p.winRate) : 0)
            ? 'down' as const
            : 'flat' as const,
      },
      suffix: '%',
      spark: s.trend.map((t) => 100 - t.winRate),
      color: '#fb7185',
      lowerIsBetter: true,
    },
  ]
})

const maxPipelineStageCount = computed(() => {
  if (!sales.value) return 1
  return Math.max(...sales.value.pipelineStages.map((s) => s.count), 1)
})

const mrrLinePoints = computed(() =>
  (sales.value?.mrrTrend ?? []).map((m) => {
    const [y, mo] = m.month.split('-')
    const d = new Date(+y!, +mo! - 1, 1)
    return {
      label: d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
      value: m.mrr,
    }
  }),
)

/* ── Agent colours ── */
const AGENT_COLORS: Record<string, string> = {
  'Naheed Dad': '#818cf8',
  'Raj Singh': '#34d399',
  'Hope Schindler': '#fbbf24',
  'Liam Kotecha': '#f472b6',
  'Joe Hardstaff': '#38bdf8',
  'Josh Ireland': '#a855f7',
}

function agentColor(name: string): string {
  return AGENT_COLORS[name] ?? '#94a3b8'
}

const SHOW_AGENTS = new Set(['Naheed Dad', 'Raj Singh', 'Hope Schindler'])
const filteredAgents = computed(() =>
  (sales.value?.agentBreakdown ?? []).filter((a) => SHOW_AGENTS.has(a.name)),
)

/* ── MRR forecast chart with toggleable layers ── */
type LayerKey = 'newDeals' | 'conversions' | 'churn'
const LAYER_CONFIG: Array<{ key: LayerKey; label: string; color: string }> = [
  { key: 'newDeals', label: 'New Deals', color: '#818cf8' },
  { key: 'conversions', label: 'Free → Paid', color: '#34d399' },
  { key: 'churn', label: 'Churn', color: '#fb7185' },
]
const activeLayers = ref<Set<LayerKey>>(new Set(['newDeals', 'conversions', 'churn']))
function toggleLayer(key: LayerKey) {
  const s = new Set(activeLayers.value)
  if (s.has(key)) s.delete(key); else s.add(key)
  activeLayers.value = s
}

const mrrForecastPoints = computed(() => {
  const chart = sales.value?.forecast?.mrrForecastChart ?? []
  const actuals = chart.filter((m) => m.type === 'actual')
  const lastActualMrr = actuals.length > 0 ? actuals[actuals.length - 1]!.mrr : 0
  return chart.map((m) => {
    const [y, mo] = m.month.split('-')
    const d = new Date(+y!, +mo! - 1, 1)
    let mrr = m.mrr
    if (m.type === 'forecast' && m.layers) {
      // Start from actual baseline and add only active layers
      mrr = lastActualMrr
      const monthsOut = chart.filter((c) => c.type === 'forecast').indexOf(m) + 1
      if (monthsOut > 0) {
        for (const layer of LAYER_CONFIG) {
          if (activeLayers.value.has(layer.key)) {
            mrr += m.layers[layer.key]
          }
        }
      }
    }
    return {
      label: d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
      value: mrr,
    }
  })
})

const mrrForecastDashedAfter = computed(() => {
  const chart = sales.value?.forecast?.mrrForecastChart ?? []
  const lastActual = chart.reduce((idx, m, i) => (m.type === 'actual' ? i : idx), -1)
  return lastActual
})

watch(selectedMonth, () => void loadSalesStats())

onMounted(() => {
  void loadSalesStats()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-2">
      <p class="text-xs uppercase tracking-[0.08em] text-gray-600">Analytics</p>
      <h2 class="text-2xl font-semibold text-gray-900">Sales</h2>
      <p class="text-sm text-gray-700">Deal performance, pipeline status, and revenue tracking.</p>
    </div>

    <div class="rounded-2xl border border-white/10 bg-[#0f1428] p-6 text-white shadow-[0_18px_40px_rgba(15,20,40,0.35)]">
      <!-- Header with sub-nav -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-4">
          <DashboardSubNav />
        </div>
        <div class="flex items-center gap-2">
          <select
            v-model="selectedMonth"
            class="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-white/80 hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 appearance-none cursor-pointer pr-8"
            style="background-image: url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff80' d='M3 5l3 3 3-3'/%3E%3C/svg%3E&quot;); background-repeat: no-repeat; background-position: right 8px center;"
          >
            <option v-for="opt in monthOptions" :key="opt.value" :value="opt.value" class="bg-[#1a1f3a] text-white">{{ opt.label }}</option>
          </select>
          <button
            class="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-white/80 hover:bg-white/10"
            type="button"
            title="Refresh from HubSpot"
            :disabled="salesLoading"
            @click="loadSalesStats(true)"
          >
            <svg class="h-3.5 w-3.5" :class="{ 'animate-spin': salesLoading }" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
        </div>
      </div>
      <div v-if="salesCachedAt" class="mt-1 text-xs text-white/50">
        Last updated: {{ new Date(salesCachedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }}
      </div>

      <!-- Loading / Error -->
      <div v-if="salesLoading" class="mt-8 flex items-center justify-center py-12">
        <div class="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-emerald-400" />
      </div>

      <div v-else-if="salesError" class="mt-6 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
        {{ salesError }}
      </div>

      <template v-else-if="sales">
        <!-- ── KPI cards ── -->
        <div class="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <div
            v-for="card in salesKpiCards"
            :key="card.label"
            class="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.05]"
          >
            <div class="flex items-start justify-between">
              <div class="text-xs font-semibold uppercase tracking-wider text-white/60">{{ card.label }}</div>
              <SparkLine v-if="card.spark.length > 0" :data="card.spark" :color="card.color" :width="64" :height="24" />
            </div>
            <div class="mt-3 text-2xl font-bold tabular-nums text-white sm:text-3xl">{{ card.val }}</div>
            <div class="mt-1.5 flex items-center gap-1.5">
              <span
                v-if="card.delta.dir !== 'flat'"
                class="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-bold"
                :class="(card.lowerIsBetter ? card.delta.dir === 'down' : card.delta.dir === 'up') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'"
              >
                <svg v-if="card.delta.dir === 'up'" class="h-2.5 w-2.5" fill="none" viewBox="0 0 10 10"><path d="M5 2v6M2.5 4.5 5 2l2.5 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <svg v-else class="h-2.5 w-2.5" fill="none" viewBox="0 0 10 10"><path d="M5 8V2M2.5 5.5 5 8l2.5-2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                {{ card.delta.value }}{{ card.suffix }}
              </span>
              <span v-else class="text-xs text-white/50">—</span>
              <span v-if="card.delta.dir !== 'flat'" class="text-xs text-white/50">vs prev</span>
            </div>
            <div class="mt-1 text-xs text-white/50">{{ card.sub }}</div>
          </div>
        </div>

        <!-- ── Free → Paid Conversion ── -->
        <div v-if="sales.freeCustomers" class="mt-8 rounded-xl border border-white/[0.06] bg-white/[0.03] p-6">
          <div class="flex items-center justify-between">
            <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Free → Paid Conversion</div>
          </div>

          <!-- Hero: conversion rate + context -->
          <div class="mt-4 flex items-end gap-6">
            <span class="text-5xl font-bold tabular-nums text-white">{{ sales.freeCustomers.conversionRate ?? 0 }}<span class="text-3xl text-white/40">%</span></span>
            <span class="mb-1 text-sm text-white/50">
              {{ sales.freeCustomers.converted ?? 0 }} of {{ sales.freeCustomers.totalFreeCompanies ?? 0 }} pre-registered companies converted to paid
            </span>
          </div>

          <!-- Progress bar -->
          <div class="mt-4 h-3 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
              class="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700"
              :style="{ width: (sales.freeCustomers.conversionRate ?? 0) + '%' }"
            ></div>
          </div>
          <div class="mt-1 flex justify-between text-xs text-white/30">
            <span>0%</span>
            <span>100%</span>
          </div>

          <!-- KPI boxes -->
          <div class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <!-- Converted -->
            <div class="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] px-5 py-4">
              <div class="text-xs font-semibold uppercase tracking-wider text-emerald-400/80">Converted to paid</div>
              <div class="mt-2 flex items-baseline gap-3">
                <span class="text-3xl font-bold tabular-nums text-emerald-400">{{ sales.freeCustomers.converted ?? 0 }}</span>
                <span class="text-sm text-white/40">companies</span>
              </div>
              <div class="mt-1 text-sm text-emerald-400/70">{{ formatCurrency(sales.freeCustomers.convertedRevenue ?? 0) }} total revenue</div>
            </div>

            <!-- Post-conversion retention -->
            <div class="rounded-lg border border-violet-500/20 bg-violet-500/[0.05] px-5 py-4">
              <div class="text-xs font-semibold uppercase tracking-wider text-violet-400/80">Retained after conversion</div>
              <div class="mt-2 flex items-baseline gap-3">
                <span class="text-3xl font-bold tabular-nums text-violet-400">{{ sales.freeCustomers.postConversionRetention ?? 0 }}<span class="text-xl text-violet-400/50">%</span></span>
              </div>
              <div class="mt-1 text-sm text-violet-400/70">{{ sales.freeCustomers.convertedRetained ?? 0 }} active · {{ sales.freeCustomers.convertedChurned ?? 0 }} churned</div>
            </div>

            <!-- Converted this month -->
            <div class="rounded-lg border border-sky-500/20 bg-sky-500/[0.05] px-5 py-4">
              <div class="text-xs font-semibold uppercase tracking-wider text-sky-400/80">Converted this month</div>
              <div class="mt-2 flex items-baseline gap-3">
                <span class="text-3xl font-bold tabular-nums text-sky-400">{{ sales.freeCustomers.convertedThisMonth ?? 0 }}</span>
                <span class="text-sm text-white/40">companies</span>
              </div>
              <div class="mt-1 text-sm text-sky-400/70">{{ formatCurrency(sales.freeCustomers.convertedRevenueThisMonth ?? 0) }} revenue</div>
            </div>

            <!-- Still free -->
            <div class="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-5 py-4">
              <div class="text-xs font-semibold uppercase tracking-wider text-amber-400/80">Still on free</div>
              <div class="mt-2 flex items-baseline gap-3">
                <span class="text-3xl font-bold tabular-nums text-amber-400">{{ sales.freeCustomers.notConverted ?? 0 }}</span>
                <span class="text-sm text-white/40">companies</span>
              </div>
              <div class="mt-1 text-sm text-amber-400/70">Awaiting conversion</div>
            </div>

            <!-- Lost during trial -->
            <div class="rounded-lg border border-rose-500/20 bg-rose-500/[0.05] px-5 py-4">
              <div class="text-xs font-semibold uppercase tracking-wider text-rose-400/80">Lost during trial</div>
              <div class="mt-2 flex items-baseline gap-3">
                <span class="text-3xl font-bold tabular-nums text-rose-400">{{ sales.freeCustomers.lostDuringTrial ?? 0 }}</span>
                <span class="text-sm text-white/40">companies</span>
              </div>
              <div class="mt-1 text-sm text-rose-400/70">Did not convert</div>
            </div>
          </div>

          <!-- Company detail table -->
          <div v-if="sales.freeCustomers.companies?.length" class="mt-5 overflow-hidden rounded-lg border border-white/[0.06]">
            <table class="w-full text-left text-sm">
              <thead>
                <tr class="border-b border-white/[0.06] bg-white/[0.03] text-xs uppercase tracking-wider text-white/40">
                  <th class="px-4 py-2.5 font-semibold">Company</th>
                  <th class="px-4 py-2.5 font-semibold text-center">Status</th>
                  <th class="px-4 py-2.5 font-semibold text-center">Converted</th>
                  <th class="px-4 py-2.5 font-semibold text-right">Paid revenue</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="co in (freeTableExpanded ? sales.freeCustomers.companies : sales.freeCustomers.companies.slice(0, 5))"
                  :key="co.companyId"
                  class="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors"
                >
                  <td class="px-4 py-2.5 text-white/80">{{ co.name }}</td>
                  <td class="px-4 py-2.5 text-center">
                    <span
                      class="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
                      :class="co.status === 'converted'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : co.status === 'lost'
                          ? 'bg-rose-500/10 text-rose-400'
                          : 'bg-amber-500/10 text-amber-400'"
                    >{{ co.status === 'converted' ? 'Converted' : co.status === 'lost' ? 'Lost' : 'Free' }}</span>
                  </td>
                  <td class="px-4 py-2.5 text-center text-xs tabular-nums text-white/50">{{ co.convertedDate ? new Date(co.convertedDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—' }}</td>
                  <td class="px-4 py-2.5 text-right tabular-nums" :class="co.revenue > 0 ? 'text-emerald-400/80' : 'text-white/30'">{{ co.revenue > 0 ? formatCurrency(co.revenue) : '—' }}</td>
                </tr>
              </tbody>
            </table>
            <button
              v-if="sales.freeCustomers.companies.length > 5"
              class="w-full border-t border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-xs font-semibold text-white/50 hover:text-white/80 hover:bg-white/[0.04] transition-colors"
              @click="freeTableExpanded = !freeTableExpanded"
            >
              {{ freeTableExpanded ? 'Show less' : `Show all ${sales.freeCustomers.companies.length} companies` }}
            </button>
          </div>
        </div>

        <!-- ── Agent breakdown ── -->
        <div v-if="filteredAgents.length > 0" class="mt-8">
          <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Performance by agent</div>
          <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div
              v-for="agent in filteredAgents"
              :key="agent.ownerId"
              class="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
            >
              <div class="flex items-center gap-2">
                <div class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: agentColor(agent.name) }" />
                <span class="text-sm font-semibold text-white/80">{{ agent.name }}</span>
              </div>
              <div class="mt-3 grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
                <div>
                  <div class="text-white/50">Won</div>
                  <div class="text-lg font-bold tabular-nums text-emerald-400">{{ agent.won }}</div>
                </div>
                <div>
                  <div class="text-white/50">Lost</div>
                  <div class="text-lg font-bold tabular-nums text-rose-400">{{ agent.lost }}</div>
                </div>
                <div>
                  <div class="text-white/50">Revenue</div>
                  <div class="font-bold tabular-nums text-white/80">{{ formatCurrency(agent.revenue) }}</div>
                </div>
                <div>
                  <div class="text-white/50">Open</div>
                  <div class="font-bold tabular-nums text-white/80">{{ agent.openDeals }} ({{ formatCurrency(agent.openValue) }})</div>
                </div>
              </div>
              <div v-if="agent.won + agent.lost > 0" class="mt-3">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-white/50">Win rate</span>
                  <span class="font-bold tabular-nums text-white/50">{{ Math.round((agent.won / (agent.won + agent.lost)) * 100) }}%</span>
                </div>
                <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
                  <div
                    class="h-full rounded-full bg-emerald-500/60 transition-all duration-500"
                    :style="{ width: Math.round((agent.won / (agent.won + agent.lost)) * 100) + '%' }"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Deal pipeline by stage ── -->
        <div v-if="sales.pipelineStages.length > 0" class="mt-8">
          <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Deal pipeline</div>
          <div class="mt-3 space-y-1.5">
            <div v-for="s in sales.pipelineStages" :key="s.stageId" class="flex items-center gap-3">
              <span class="w-40 shrink-0 text-right text-xs text-white/50 sm:w-48">{{ s.label }}</span>
              <div class="h-6 flex-1 overflow-hidden rounded bg-white/[0.04]">
                <div
                  class="flex h-full items-center rounded bg-emerald-500/25 px-2 transition-all duration-500"
                  :style="{ width: Math.round((s.count / maxPipelineStageCount) * 100) + '%', minWidth: s.count > 0 ? '32px' : '0' }"
                >
                  <span v-if="s.count > 0" class="text-xs font-semibold tabular-nums text-emerald-300">{{ formatCurrency(s.value) }}</span>
                </div>
              </div>
              <span class="w-7 text-right text-xs font-semibold tabular-nums text-white/60">{{ s.count }}</span>
            </div>
          </div>
        </div>

        <!-- ── MRR trend ── -->
        <div v-if="mrrLinePoints.length > 1" class="mt-8">
          <div class="flex items-baseline gap-3">
            <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Monthly recurring revenue</div>
            <span v-if="sales.mrr" class="text-sm font-bold tabular-nums text-emerald-400">{{ formatCurrency(sales.mrr) }}<span class="text-xs font-normal text-white/40"> /mo</span></span>
          </div>
          <div class="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <LineChart :points="mrrLinePoints" color="#34d399" :height="200" :format-value="formatCurrency" />
          </div>
        </div>

        <!-- ── Recent deals ── -->
        <div v-if="sales.recentDeals.length > 0" class="mt-8">
          <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Recent deals</div>
          <div class="mt-3 overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead>
                <tr class="border-b border-white/[0.06]">
                  <th class="pb-2 pr-4 font-semibold text-white/60">Deal</th>
                  <th class="pb-2 pr-4 font-semibold text-white/60">Agent</th>
                  <th class="pb-2 pr-4 text-right font-semibold text-white/60">Amount</th>
                  <th class="pb-2 pr-4 font-semibold text-white/60">Stage</th>
                  <th class="pb-2 text-right font-semibold text-white/60">Closed</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="deal in sales.recentDeals"
                  :key="deal.name + deal.closeDate"
                  class="border-b border-white/[0.03] last:border-0"
                >
                  <td class="max-w-[200px] truncate py-2.5 pr-4 text-white/80">{{ deal.name }}</td>
                  <td class="py-2.5 pr-4">
                    <span v-if="deal.agent" class="inline-flex items-center gap-1">
                      <span class="h-1.5 w-1.5 rounded-full" :style="{ backgroundColor: agentColor(deal.agent) }" />
                      <span class="text-white/50">{{ deal.agent }}</span>
                    </span>
                    <span v-else class="text-white/50">—</span>
                  </td>
                  <td class="py-2.5 pr-4 text-right tabular-nums text-white/60">£{{ deal.amount.toLocaleString('en-GB') }}</td>
                  <td class="py-2.5 pr-4">
                    <span
                      class="inline-flex rounded-full px-2 py-0.5 text-xs font-bold"
                      :class="deal.won ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'"
                    >{{ deal.stage }}</span>
                  </td>
                  <td class="py-2.5 text-right text-white/50">{{ relativeDate(deal.closeDate) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ── Sales Forecast ── -->
        <div v-if="sales.forecast" class="mt-8 rounded-xl border border-white/[0.06] bg-white/[0.03] p-6">
          <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Sales Forecast</div>

          <!-- Hero: Weighted pipeline -->
          <div class="mt-4 flex items-end gap-6">
            <span class="text-5xl font-bold tabular-nums text-white">{{ formatCurrency(sales.forecast.weightedPipelineValue) }}</span>
            <span class="mb-1 text-sm text-white/50">weighted pipeline value<br><span class="text-white/30">total expected revenue from open deals × win probability</span></span>
          </div>

          <!-- KPI boxes -->
          <div class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div class="rounded-lg border border-indigo-500/20 bg-indigo-500/[0.05] px-5 py-4">
              <div class="text-xs font-semibold uppercase tracking-wider text-indigo-400/80">Projected monthly revenue</div>
              <div class="mt-2 text-3xl font-bold tabular-nums text-indigo-400">{{ formatCurrency(sales.forecast.projectedMonthlyRevenue) }}</div>
              <div class="mt-1 text-xs text-indigo-400/60">Pipeline × win probability ÷ avg close time</div>
            </div>
            <div class="rounded-lg border border-violet-500/20 bg-violet-500/[0.05] px-5 py-4">
              <div class="text-xs font-semibold uppercase tracking-wider text-violet-400/80">Projected quarterly revenue</div>
              <div class="mt-2 text-3xl font-bold tabular-nums text-violet-400">{{ formatCurrency(sales.forecast.projectedQuarterlyRevenue) }}</div>
              <div class="mt-1 text-xs text-violet-400/60">Next 3 months</div>
            </div>
            <div class="rounded-lg border border-sky-500/20 bg-sky-500/[0.05] px-5 py-4">
              <div class="text-xs font-semibold uppercase tracking-wider text-sky-400/80">Avg deals won / month</div>
              <div class="mt-2 text-3xl font-bold tabular-nums text-sky-400">{{ sales.forecast.avgMonthlyDealsWon }}</div>
              <div class="mt-1 text-xs text-sky-400/60">6-month average</div>
            </div>
          </div>

          <!-- MRR forecast chart -->
          <div v-if="mrrForecastPoints.length > 1" class="mt-5">
            <div class="flex items-center gap-4">
              <div class="text-xs font-semibold uppercase tracking-wider text-white/40">MRR outlook</div>
              <div class="flex items-center gap-3 text-xs text-white/30">
                <span class="inline-flex items-center gap-1"><span class="inline-block h-0.5 w-4 bg-emerald-400 rounded"></span> Actual</span>
                <span class="inline-flex items-center gap-1"><span class="inline-block h-0.5 w-4 rounded" style="background: repeating-linear-gradient(90deg, rgb(52,211,153) 0px, rgb(52,211,153) 4px, transparent 4px, transparent 7px)"></span> Forecast</span>
              </div>
            </div>
            <!-- Layer toggle pills -->
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <button
                v-for="layer in LAYER_CONFIG"
                :key="layer.key"
                class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all"
                :class="activeLayers.has(layer.key)
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'bg-white/[0.03] text-white/30 border border-white/[0.06] hover:bg-white/[0.06]'"
                @click="toggleLayer(layer.key)"
              >
                <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: activeLayers.has(layer.key) ? layer.color : 'rgba(255,255,255,0.15)' }"></span>
                {{ layer.label }}
              </button>
            </div>
            <div class="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <LineChart :points="mrrForecastPoints" color="#34d399" :height="180" :format-value="formatCurrency" :dashed-after="mrrForecastDashedAfter" />
            </div>
            <!-- Churn callout -->
            <div v-if="(sales.forecast.expectedMonthlyChurnMrr ?? 0) > 0" class="mt-2 flex items-center gap-2 text-xs text-white/40">
              <span class="h-1.5 w-1.5 rounded-full bg-rose-400"></span>
              Est. {{ formatCurrency(sales.forecast.expectedMonthlyChurnMrr ?? 0) }}/mo churn deducted from forecast
            </div>
          </div>

          <!-- Pre-reg / free conversion forecast -->
          <div v-if="sales.forecast.preRegForecast && sales.forecast.preRegForecast.unconvertedCount > 0" class="mt-5 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-5">
            <div class="text-xs font-semibold uppercase tracking-wider text-amber-400/80">Free → Paid conversion forecast</div>
            <div class="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <div class="text-xs text-white/40">Unconverted</div>
                <div class="mt-1 text-2xl font-bold tabular-nums text-amber-400">{{ sales.forecast.preRegForecast.unconvertedCount }}</div>
                <div class="text-xs text-white/30">free companies</div>
              </div>
              <div>
                <div class="text-xs text-white/40">Historic rate</div>
                <div class="mt-1 text-2xl font-bold tabular-nums text-amber-400">{{ sales.forecast.preRegForecast.conversionRate }}%</div>
                <div class="text-xs text-white/30">conversion</div>
              </div>
              <div>
                <div class="text-xs text-white/40">Expected conversions</div>
                <div class="mt-1 text-2xl font-bold tabular-nums text-emerald-400">{{ sales.forecast.preRegForecast.expectedConversions }}</div>
                <div class="text-xs text-white/30">companies</div>
              </div>
              <div>
                <div class="text-xs text-white/40">Expected revenue</div>
                <div class="mt-1 text-2xl font-bold tabular-nums text-emerald-400">{{ formatCurrency(sales.forecast.preRegForecast.expectedRevenue) }}</div>
                <div class="text-xs text-white/30">avg {{ formatCurrency(sales.forecast.preRegForecast.avgRevenuePerConversion) }} each</div>
              </div>
            </div>
          </div>

          <!-- Pipeline probability table -->
          <div v-if="sales.forecast.pipelineByStage.length > 0" class="mt-5 overflow-hidden rounded-lg border border-white/[0.06]">
            <table class="w-full text-left text-sm">
              <thead>
                <tr class="border-b border-white/[0.06] bg-white/[0.03] text-xs uppercase tracking-wider text-white/40">
                  <th class="px-4 py-2.5 font-semibold">Stage</th>
                  <th class="px-4 py-2.5 font-semibold text-center">Deals</th>
                  <th class="px-4 py-2.5 font-semibold text-right">Value</th>
                  <th class="px-4 py-2.5 font-semibold text-center">Win prob</th>
                  <th class="px-4 py-2.5 font-semibold text-right">Weighted</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="st in sales.forecast.pipelineByStage"
                  :key="st.stageId"
                  class="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors"
                >
                  <td class="px-4 py-2.5 text-white/80">{{ st.label }}</td>
                  <td class="px-4 py-2.5 text-center tabular-nums text-white/60">{{ st.count }}</td>
                  <td class="px-4 py-2.5 text-right tabular-nums text-white/60">{{ formatCurrency(st.value) }}</td>
                  <td class="px-4 py-2.5 text-center">
                    <span class="inline-block rounded-full px-2.5 py-0.5 text-xs font-bold bg-white/[0.06] text-white/60">{{ Math.round(st.probability * 100) }}%</span>
                  </td>
                  <td class="px-4 py-2.5 text-right tabular-nums font-semibold text-emerald-400/80">{{ formatCurrency(st.weightedValue) }}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="border-t border-white/[0.08] bg-white/[0.02]">
                  <td class="px-4 py-2.5 text-xs font-semibold uppercase text-white/50">Total</td>
                  <td class="px-4 py-2.5 text-center tabular-nums font-bold text-white/70">{{ sales.forecast.pipelineByStage.reduce((s, st) => s + st.count, 0) }}</td>
                  <td class="px-4 py-2.5 text-right tabular-nums font-bold text-white/70">{{ formatCurrency(sales.forecast.pipelineByStage.reduce((s, st) => s + st.value, 0)) }}</td>
                  <td></td>
                  <td class="px-4 py-2.5 text-right tabular-nums font-bold text-emerald-400">{{ formatCurrency(sales.forecast.weightedPipelineValue) }}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <!-- Monthly projection -->
          <div v-if="sales.forecast.monthlyProjection.length > 0" class="mt-5">
            <div class="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">3-Month projection</div>
            <div class="grid grid-cols-3 gap-3">
              <div
                v-for="proj in sales.forecast.monthlyProjection"
                :key="proj.month"
                class="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-center"
              >
                <div class="text-xs text-white/40">{{ new Date(proj.month + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) }}</div>
                <div class="mt-1 text-lg font-bold tabular-nums text-white">{{ formatCurrency(proj.projectedRevenue) }}</div>
                <div class="text-xs text-white/40">~{{ proj.projectedDeals }} deals</div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
