<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import SparkLine from '../../components/SparkLine.vue'
import DonutChart from '../../components/DonutChart.vue'
import LineChart from '../../components/LineChart.vue'
import {
  adminGetDashboardStats,
  adminGetSalesFunnel,
  adminGetSalesStats,
  adminGetCustomerSuccess,
  type AdminDashboardStats,
  type SalesFunnel,
  type SalesStats,
  type CustomerSuccess,
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

/* Marketing / Sales / Success toggle */
const activeTab = ref<'marketing' | 'sales' | 'success'>('marketing')

/* ------------------------------------------------------------------ */
/*  Sales stats                                                       */
/* ------------------------------------------------------------------ */
const salesLoading = ref(false)
const salesError = ref<string | null>(null)
const sales = ref<SalesStats | null>(null)
const salesCachedAt = ref<string | null>(null)

async function loadSalesStats(refresh = false) {
  salesLoading.value = true
  salesError.value = null
  try {
    const res = await adminGetSalesStats(refresh)
    sales.value = res.stats
    salesCachedAt.value = res.cachedAt ?? null
  } catch (e) {
    salesError.value = e instanceof Error ? e.message : 'Failed to load sales stats'
  } finally {
    salesLoading.value = false
  }
}

/* ------------------------------------------------------------------ */
/*  Customer Success stats                                            */
/* ------------------------------------------------------------------ */
const successLoading = ref(false)
const successError = ref<string | null>(null)
const success = ref<CustomerSuccess | null>(null)
const successCachedAt = ref<string | null>(null)

async function loadSuccessStats(refresh = false) {
  successLoading.value = true
  successError.value = null
  try {
    const res = await adminGetCustomerSuccess(refresh)
    success.value = res.stats
    successCachedAt.value = res.cachedAt ?? null
  } catch (e) {
    successError.value = e instanceof Error ? e.message : 'Failed to load success stats'
  } finally {
    successLoading.value = false
  }
}

/* Lazy-load sales stats on first switch to Sales tab */
watch(activeTab, (tab) => {
  if (tab === 'sales' && !sales.value && !salesLoading.value) {
    loadSalesStats()
  }
  if (tab === 'success' && !success.value && !successLoading.value) {
    loadSuccessStats()
  }
})

/* ── Sales KPI cards ── */
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

/* ------------------------------------------------------------------ */
/*  Sales KPI cards                                                   */
/* ------------------------------------------------------------------ */

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
      suffix: 'pp',
      spark: s.trend.map((t) => t.winRate),
      color: '#fbbf24',
    },
    {
      label: 'Avg Close Time',
      sub: 'Days to close (won deals)',
      val: `${s.avgCloseTimeDays}d`,
      delta: {
        value: Math.abs(s.avgCloseTimeDays - (p?.avgCloseTimeDays ?? 0)),
        dir: s.avgCloseTimeDays < (p?.avgCloseTimeDays ?? 0)
          ? 'up' as const // faster = good
          : s.avgCloseTimeDays > (p?.avgCloseTimeDays ?? 0)
            ? 'down' as const
            : 'flat' as const,
      },
      suffix: 'd',
      spark: s.trend.map((t) => t.avgCloseTimeDays),
      color: '#f472b6',
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
        dir: s.loseRate < (p ? (100 - p.winRate) : 0)
          ? 'up' as const // lower lose = good
          : s.loseRate > (p ? (100 - p.winRate) : 0)
            ? 'down' as const
            : 'flat' as const,
      },
      suffix: 'pp',
      spark: s.trend.map((t) => 100 - t.winRate),
      color: '#fb7185',
    },
  ]
})

const maxPipelineStageCount = computed(() => {
  if (!sales.value) return 1
  return Math.max(...sales.value.pipelineStages.map((s) => s.count), 1)
})

/* ── MRR trend line chart ── */
const mrrLinePoints = computed(() =>
  (sales.value?.mrrTrend ?? []).map((m) => ({
    label: m.month,
    value: m.mrr,
  })),
)

/* ── Agent colour palette ── */
const AGENT_COLORS: Record<string, string> = {
  'Naheed Dad': '#818cf8',
  'Raj Singh': '#34d399',
  'Hope Schindler': '#fbbf24',
  'Liam Kotecha': '#f472b6',
  'Joe Hardstaff': '#38bdf8',
  'Josh Ireland': '#a855f7',
  'Jonathan Hebbes': '#f97316',
}

function agentColor(name: string): string {
  return AGENT_COLORS[name] ?? '#94a3b8'
}

const SHOW_AGENTS = new Set(['Naheed Dad', 'Raj Singh', 'Hope Schindler'])
const filteredAgents = computed(() =>
  (sales.value?.agentBreakdown ?? []).filter((a) => SHOW_AGENTS.has(a.name)),
)

function formatCurrency(v: number): string {
  if (v >= 1000) return `£${(v / 1000).toFixed(1)}k`
  return `£${v.toLocaleString('en-GB')}`
}

function relativeDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 86_400_000)
  if (diff < 0) return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return `${diff}d ago`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/* ── Success tab helpers ── */
const CHURN_COLORS = ['#f472b6', '#818cf8', '#34d399', '#fbbf24', '#38bdf8', '#a855f7', '#f97316', '#fb7185', '#14b8a6']
const SUCCESS_AGENT_COLORS: Record<string, string> = {
  'Simone Mills': '#818cf8',
  'Hope Schindler': '#fbbf24',
  'Shaun Ward': '#34d399',
}
const TENURE_COLORS = ['#818cf8', '#34d399', '#fbbf24', '#f472b6', '#38bdf8']

const churnReasonDonut = computed(() =>
  (success.value?.cancellationReasons ?? []).map((r, i) => ({
    label: r.reason.length > 30 ? r.reason.slice(0, 28) + '…' : r.reason,
    value: r.count,
    color: CHURN_COLORS[i % CHURN_COLORS.length]!,
  })),
)

const tenureDonut = computed(() =>
  (success.value?.customersByTenure ?? []).filter(b => b.count > 0).map((b, i) => ({
    label: b.bucket,
    value: b.count,
    color: TENURE_COLORS[i % TENURE_COLORS.length]!,
  })),
)

const churnTrendLinePoints = computed(() =>
  (success.value?.churnTrend ?? []).map((t) => ({
    label: t.month,
    value: t.churned,
  })),
)

const newCustTrendLinePoints = computed(() =>
  (success.value?.churnTrend ?? []).map((t) => ({
    label: t.month,
    value: t.newCustomers,
  })),
)

/* ── Success KPI cards with sparklines + deltas ── */
const successKpiCards = computed(() => {
  if (!success.value) return []
  const s = success.value
  const prev = s.previousPeriod
  const spark = s.kpiSpark

  return [
    {
      label: 'Paying customers',
      sub: 'Active paying accounts',
      val: s.totalPayingCustomers.toString(),
      delta: prev ? pctDelta(s.totalPayingCustomers, prev.totalPayingCustomers) : { value: 0, dir: 'flat' as const },
      suffix: '%',
      spark: spark?.paying ?? [],
      color: '#34d399',
    },
    {
      label: 'Retention rate',
      sub: 'Paying / total customer base',
      val: `${s.retentionRate}%`,
      delta: prev
        ? { value: Math.abs(s.retentionRate - prev.retentionRate), dir: s.retentionRate > prev.retentionRate ? 'up' as const : s.retentionRate < prev.retentionRate ? 'down' as const : 'flat' as const }
        : { value: 0, dir: 'flat' as const },
      suffix: 'pp',
      spark: spark?.retention ?? [],
      color: '#818cf8',
      valClass: s.retentionRate >= 90 ? 'text-emerald-400' : s.retentionRate >= 75 ? 'text-amber-400' : 'text-rose-400',
    },
    {
      label: 'Churned',
      sub: `This month: ${s.churnedThisMonth} · Last 3mo: ${s.churnedLast3Months}`,
      val: s.totalChurned.toString(),
      delta: prev
        ? { value: Math.abs(s.churnedThisMonth - prev.churned), dir: s.churnedThisMonth < prev.churned ? 'up' as const : s.churnedThisMonth > prev.churned ? 'down' as const : 'flat' as const }
        : { value: 0, dir: 'flat' as const },
      suffix: '',
      spark: spark?.churned ?? [],
      color: '#f472b6',
      valClass: 'text-rose-400',
      invertDelta: true,
    },
    {
      label: 'Off-boarding',
      sub: 'Cancellation in progress',
      val: s.totalOffboarding.toString(),
      delta: { value: 0, dir: 'flat' as const },
      suffix: '',
      spark: [],
      color: '#fbbf24',
      valClass: 'text-amber-400',
    },
    {
      label: 'Avg tenure',
      sub: 'Average customer lifetime',
      val: `${s.avgTenureMonths}mo`,
      delta: { value: 0, dir: 'flat' as const },
      suffix: '',
      spark: [],
      color: '#38bdf8',
    },
    {
      label: 'Meetings (30d)',
      sub: 'All meetings last 30 days',
      val: s.meetingsThisMonth.toString(),
      delta: prev ? pctDelta(s.meetingsThisMonth, prev.meetingsMonth) : { value: 0, dir: 'flat' as const },
      suffix: '%',
      spark: spark?.meetings ?? [],
      color: '#a78bfa',
    },
    {
      label: 'Completed',
      sub: 'Meetings completed',
      val: s.meetingsCompleted.toString(),
      delta: prev ? pctDelta(s.meetingsCompleted, prev.completedMonth) : { value: 0, dir: 'flat' as const },
      suffix: '%',
      spark: spark?.completed ?? [],
      color: '#34d399',
      valClass: 'text-emerald-400',
    },
    {
      label: 'No-show',
      sub: 'Customer no-shows',
      val: s.meetingsNoShow.toString(),
      delta: prev
        ? { value: Math.abs(s.meetingsNoShow - prev.noShowMonth), dir: s.meetingsNoShow < prev.noShowMonth ? 'up' as const : s.meetingsNoShow > prev.noShowMonth ? 'down' as const : 'flat' as const }
        : { value: 0, dir: 'flat' as const },
      suffix: '',
      spark: spark?.noShow ?? [],
      color: '#fb7185',
      valClass: 'text-rose-400',
      invertDelta: true,
    },
  ]
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
            <div class="h-8 text-xs font-semibold uppercase tracking-wide text-white/60">Live<br>customers</div>
            <div class="mt-2 text-3xl font-semibold text-white">{{ stats.liveCompanyCount.toLocaleString() }}</div>
            <p class="mt-1 text-xs text-white/50">Companies set to live customer</p>
          </div>
          <div class="rounded-xl border border-white/10 bg-white/5 p-4">
            <div class="h-8 text-xs font-semibold uppercase tracking-wide text-white/60">Associated<br>contacts</div>
            <div class="mt-2 text-3xl font-semibold text-white">{{ stats.liveUserCount.toLocaleString() }}</div>
            <p class="mt-1 text-xs text-white/50">HubSpot contacts at live companies</p>
          </div>
          <div class="rounded-xl border border-white/10 bg-white/5 p-4">
            <div class="h-8 text-xs font-semibold uppercase tracking-wide text-white/60">Total<br>homes</div>
            <div class="mt-2 text-3xl font-semibold text-white">{{ stats.totalHomes.toLocaleString() }}</div>
            <p class="mt-1 text-xs text-white/50">All home types across live customers</p>
          </div>
          <div class="rounded-xl border border-white/10 bg-white/5 p-4">
            <div class="h-8 text-xs font-semibold uppercase tracking-wide text-white/60">Children's<br>homes</div>
            <div class="mt-2 text-3xl font-semibold text-white">{{ stats.totalChildrensHomes.toLocaleString() }}</div>
            <p class="mt-1 text-xs text-white/50">number_of_homes (CH)</p>
          </div>
          <div class="rounded-xl border border-white/10 bg-white/5 p-4">
            <div class="h-8 text-xs font-semibold uppercase tracking-wide text-white/60">Supported<br>accommodation</div>
            <div class="mt-2 text-3xl font-semibold text-white">{{ stats.totalSupportedAccommodation.toLocaleString() }}</div>
            <p class="mt-1 text-xs text-white/50">number_of_homes (SA)</p>
          </div>
        </div>
      </template>
    </div>

    <!-- ═══════════════════ Marketing / Sales performance ═══════════════════ -->
    <div class="rounded-2xl border border-white/10 bg-[#0f1428] p-6 text-white shadow-[0_18px_40px_rgba(15,20,40,0.35)]">
      <!-- Header with toggle -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-4">
          <!-- Pill toggle -->
          <div class="inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
            <button
              class="relative rounded-md px-4 py-1.5 text-xs font-semibold transition-all duration-200"
              :class="activeTab === 'marketing' ? 'bg-indigo-500/20 text-indigo-300 shadow-sm' : 'text-white/50 hover:text-white/80'"
              @click="activeTab = 'marketing'"
            >
              Marketing
            </button>
            <button
              class="relative rounded-md px-4 py-1.5 text-xs font-semibold transition-all duration-200"
              :class="activeTab === 'sales' ? 'bg-emerald-500/20 text-emerald-300 shadow-sm' : 'text-white/50 hover:text-white/80'"
              @click="activeTab = 'sales'"
            >
              Sales
            </button>
            <button
              class="relative rounded-md px-4 py-1.5 text-xs font-semibold transition-all duration-200"
              :class="activeTab === 'success' ? 'bg-amber-500/20 text-amber-300 shadow-sm' : 'text-white/50 hover:text-white/80'"
              @click="activeTab = 'success'"
            >
              Success
            </button>
          </div>
          <div v-if="activeTab === 'marketing'" class="text-xs text-white/50">{{ funnelMonthLabel }}</div>
        </div>
        <!-- Controls -->
        <div class="flex items-center gap-2">
          <!-- Month picker (marketing only) -->
          <select
            v-if="activeTab === 'marketing'"
            v-model="selectedMonth"
            class="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-white/80 outline-none hover:bg-white/10"
            @change="loadFunnel(false)"
          >
            <option v-for="o in monthOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
          <!-- Refresh button -->
          <button
            class="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-white/80 hover:bg-white/10"
            type="button"
            title="Refresh from HubSpot"
            :disabled="activeTab === 'marketing' ? funnelLoading : activeTab === 'sales' ? salesLoading : successLoading"
            @click="activeTab === 'marketing' ? loadFunnel(true) : activeTab === 'sales' ? loadSalesStats(true) : loadSuccessStats(true)"
          >
            <svg class="h-3.5 w-3.5" :class="{ 'animate-spin': activeTab === 'marketing' ? funnelLoading : activeTab === 'sales' ? salesLoading : successLoading }" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
        </div>
      </div>
      <!-- Cache timestamp -->
      <div v-if="activeTab === 'marketing' && cachedAt" class="mt-1 text-xs text-white/50">
        Last updated: {{ new Date(cachedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }}
      </div>
      <div v-if="activeTab === 'sales' && salesCachedAt" class="mt-1 text-xs text-white/50">
        Last updated: {{ new Date(salesCachedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }}
      </div>
      <div v-if="activeTab === 'success' && successCachedAt" class="mt-1 text-xs text-white/50">
        Last updated: {{ new Date(successCachedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }}
      </div>

      <!-- ════════════════════════════════════════════════════════════ -->
      <!--  MARKETING TAB                                              -->
      <!-- ════════════════════════════════════════════════════════════ -->
      <template v-if="activeTab === 'marketing'">
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

          <!-- ── Lead pipeline (reference) ── -->
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

          <!-- ── Donut charts: Stage · Provision · Referral ── -->
          <div class="mt-8">
            <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Breakdown insights</div>
            <div class="mt-5 grid grid-cols-1 gap-6 md:grid-cols-3">
              <!-- Stage donut -->
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
              <!-- Provision donut -->
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
              <!-- Referral donut -->
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
      </template>

      <!-- ════════════════════════════════════════════════════════════ -->
      <!--  SALES TAB                                                  -->
      <!-- ════════════════════════════════════════════════════════════ -->
      <template v-if="activeTab === 'sales'">
        <!-- Loading / Error -->
        <div v-if="salesLoading" class="mt-8 flex items-center justify-center py-12">
          <div class="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-emerald-400" />
        </div>

        <div v-else-if="salesError" class="mt-6 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {{ salesError }}
        </div>

        <template v-else-if="sales">
          <!-- ── KPI cards (6 cards, 3×2 grid on desktop) ── -->
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
                  :class="card.delta.dir === 'up' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'"
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

          <!-- ── Agent breakdown ── -->
          <div v-if="sales.freeCustomers" class="mt-8">
            <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Free customers</div>
            <div class="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div class="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Total free</div>
                <div class="mt-2 text-2xl font-bold tabular-nums text-white">{{ sales.freeCustomers.totalFreeDeals }}</div>
                <div class="mt-1 text-xs text-white/50">Unregistered / pre-reg deals</div>
              </div>
              <div class="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                <div class="text-xs font-semibold uppercase tracking-wider text-white/60">New free this month</div>
                <div class="mt-2 text-2xl font-bold tabular-nums text-white">{{ sales.freeCustomers.freeDealsThisMonth }}</div>
                <div class="mt-1 text-xs text-white/50">Won this month at £0</div>
              </div>
              <div class="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Converted</div>
                <div class="mt-2 text-2xl font-bold tabular-nums text-emerald-400">{{ sales.freeCustomers.convertedThisMonth }}</div>
                <div class="mt-1 text-xs text-white/50">Became paying this month</div>
              </div>
              <div class="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Conversion value</div>
                <div class="mt-2 text-2xl font-bold tabular-nums text-emerald-400">{{ formatCurrency(sales.freeCustomers.convertedRevenue) }}</div>
                <div class="mt-1 text-xs text-white/50">Revenue from conversions · {{ sales.freeCustomers.conversionRate }}% rate</div>
              </div>
            </div>
          </div>

          <!-- ── Agent breakdown (original) ── -->
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
                <!-- Win rate mini bar -->
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
            <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Monthly recurring revenue trend</div>
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
        </template>
      </template>

      <!-- ════════════════════════════════════════════════════════════ -->
      <!--  SUCCESS TAB                                                -->
      <!-- ════════════════════════════════════════════════════════════ -->
      <template v-if="activeTab === 'success'">
        <!-- Loading / Error -->
        <div v-if="successLoading" class="mt-8 flex items-center justify-center py-12">
          <div class="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-amber-400" />
        </div>

        <div v-else-if="successError" class="mt-6 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {{ successError }}
        </div>

        <template v-else-if="success">
          <!-- ── KPI cards with sparklines + deltas ── -->
          <div class="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div
              v-for="card in successKpiCards"
              :key="card.label"
              class="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.05]"
            >
              <div class="flex items-start justify-between">
                <div class="text-xs font-semibold uppercase tracking-wider text-white/60">{{ card.label }}</div>
                <SparkLine v-if="card.spark.length > 1" :data="card.spark" :color="card.color" :width="64" :height="24" />
              </div>
              <div class="mt-3 text-2xl font-bold tabular-nums sm:text-3xl" :class="card.valClass ?? 'text-white'">{{ card.val }}</div>
              <div class="mt-1.5 flex items-center gap-1.5">
                <span
                  v-if="card.delta.dir !== 'flat'"
                  class="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-bold"
                  :class="(card.invertDelta ? card.delta.dir === 'down' : card.delta.dir === 'up') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'"
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

          <!-- ── Success team ── -->
          <div v-if="success.meetingsByAgent.length > 0" class="mt-8">
            <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Success team (30d)</div>
            <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div
                v-for="agent in success.meetingsByAgent"
                :key="agent.ownerId"
                class="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
              >
                <div class="flex items-center gap-2">
                  <div class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: SUCCESS_AGENT_COLORS[agent.name] ?? '#94a3b8' }" />
                  <span class="text-sm font-semibold text-white/80">{{ agent.name }}</span>
                </div>
                <div class="mt-3 grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
                  <div>
                    <div class="text-white/50">Companies</div>
                    <div class="text-lg font-bold tabular-nums text-white">{{ agent.companiesAssigned }}</div>
                  </div>
                  <div>
                    <div class="text-white/50">Meetings</div>
                    <div class="text-lg font-bold tabular-nums text-white">{{ agent.total }}</div>
                  </div>
                  <div>
                    <div class="text-white/50">Completed</div>
                    <div class="text-lg font-bold tabular-nums text-emerald-400">{{ agent.completed }}</div>
                  </div>
                  <div>
                    <div class="text-white/50">No-show</div>
                    <div class="text-lg font-bold tabular-nums text-rose-400">{{ agent.noShow }}</div>
                  </div>
                </div>
                <!-- Completion rate bar -->
                <div v-if="agent.total > 0" class="mt-3">
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-white/50">Completion rate</span>
                    <span class="font-bold tabular-nums text-white/50">{{ Math.round((agent.completed / agent.total) * 100) }}%</span>
                  </div>
                  <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
                    <div
                      class="h-full rounded-full bg-emerald-500/60 transition-all duration-500"
                      :style="{ width: Math.round((agent.completed / agent.total) * 100) + '%' }"
                    />
                  </div>
                </div>
                <div v-else class="mt-3 text-xs text-white/50">No meetings logged</div>
              </div>
            </div>
          </div>

          <!-- ── New customers (first 60 days) ── -->
          <div v-if="success.newCustomers && success.newCustomers.length > 0" class="mt-8">
            <div class="flex items-center gap-3">
              <div class="text-xs font-semibold uppercase tracking-wider text-white/60">New customers</div>
              <span class="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-400">
                {{ success.newCustomers.length }} in first 60 days
              </span>
            </div>
            <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <a
                v-for="cust in success.newCustomers"
                :key="cust.companyId"
                :href="cust.hubspotUrl"
                target="_blank"
                rel="noopener"
                class="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-colors hover:border-amber-500/20 hover:bg-white/[0.04]"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <div class="truncate text-sm font-semibold text-white/90 group-hover:text-amber-300 transition-colors">{{ cust.name }}</div>
                    <div class="mt-0.5 text-xs text-white/50">{{ cust.owner }}</div>
                  </div>
                  <div class="flex flex-col items-end gap-1 shrink-0">
                    <span class="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs font-bold tabular-nums text-white/80">
                      Day {{ cust.daysSinceStart }}
                    </span>
                    <svg class="h-3.5 w-3.5 text-white/30 group-hover:text-amber-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                  </div>
                </div>
                <!-- Meeting status indicators -->
                <div class="mt-3 flex items-center gap-3">
                  <div class="flex items-center gap-1.5">
                    <div
                      class="h-2 w-2 rounded-full"
                      :class="cust.trainingMeeting === 'completed' ? 'bg-emerald-400' : cust.trainingMeeting === 'scheduled' ? 'bg-amber-400' : 'bg-white/20'"
                    />
                    <span class="text-xs" :class="cust.trainingMeeting === 'completed' ? 'text-emerald-400' : cust.trainingMeeting === 'scheduled' ? 'text-amber-400' : 'text-white/40'">
                      Training {{ cust.trainingMeeting === 'completed' ? '✓' : cust.trainingMeeting === 'scheduled' ? '⏳' : '—' }}
                    </span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <div
                      class="h-2 w-2 rounded-full"
                      :class="cust.successMeeting === 'completed' ? 'bg-emerald-400' : cust.successMeeting === 'scheduled' ? 'bg-amber-400' : 'bg-white/20'"
                    />
                    <span class="text-xs" :class="cust.successMeeting === 'completed' ? 'text-emerald-400' : cust.successMeeting === 'scheduled' ? 'text-amber-400' : 'text-white/40'">
                      Success {{ cust.successMeeting === 'completed' ? '✓' : cust.successMeeting === 'scheduled' ? '⏳' : '—' }}
                    </span>
                  </div>
                </div>
                <!-- Progress bar: days elapsed out of 60 -->
                <div class="mt-3">
                  <div class="h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
                    <div
                      class="h-full rounded-full transition-all duration-500"
                      :class="cust.daysSinceStart <= 30 ? 'bg-emerald-500/60' : cust.daysSinceStart <= 45 ? 'bg-amber-500/60' : 'bg-rose-500/60'"
                      :style="{ width: Math.min(100, Math.round((cust.daysSinceStart / 60) * 100)) + '%' }"
                    />
                  </div>
                  <div class="mt-1 flex items-center justify-between text-xs text-white/40">
                    <span>{{ new Date(cust.contractStartDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }}</span>
                    <span>60d window</span>
                  </div>
                </div>
              </a>
            </div>
          </div>
          <div v-else-if="success.newCustomers && success.newCustomers.length === 0" class="mt-8">
            <div class="text-xs font-semibold uppercase tracking-wider text-white/60">New customers</div>
            <div class="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-center">
              <div class="text-sm text-white/50">No customers within their first 60 days</div>
            </div>
          </div>

          <!-- ── Early churn stats ── -->
          <div v-if="success.earlyChurn && success.earlyChurn.totalWithDates > 0" class="mt-8">
            <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Early churn breakdown</div>
            <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div class="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                <div class="flex items-center justify-between">
                  <div class="text-xs font-semibold uppercase tracking-wider text-white/50">Within 60 days</div>
                  <span class="text-2xl font-bold tabular-nums text-rose-400">{{ success.earlyChurn.within60 }}</span>
                </div>
                <div class="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.04]">
                  <div
                    class="h-full rounded-full bg-rose-500/60 transition-all duration-500"
                    :style="{ width: (success.earlyChurn.totalWithDates > 0 ? Math.round((success.earlyChurn.within60 / success.earlyChurn.totalWithDates) * 100) : 0) + '%' }"
                  />
                </div>
                <div class="mt-1.5 text-xs tabular-nums text-white/40">
                  {{ success.earlyChurn.totalWithDates > 0 ? Math.round((success.earlyChurn.within60 / success.earlyChurn.totalWithDates) * 100) : 0 }}% of all churn
                </div>
              </div>
              <div class="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                <div class="flex items-center justify-between">
                  <div class="text-xs font-semibold uppercase tracking-wider text-white/50">Within 90 days</div>
                  <span class="text-2xl font-bold tabular-nums text-amber-400">{{ success.earlyChurn.within90 }}</span>
                </div>
                <div class="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.04]">
                  <div
                    class="h-full rounded-full bg-amber-500/60 transition-all duration-500"
                    :style="{ width: (success.earlyChurn.totalWithDates > 0 ? Math.round((success.earlyChurn.within90 / success.earlyChurn.totalWithDates) * 100) : 0) + '%' }"
                  />
                </div>
                <div class="mt-1.5 text-xs tabular-nums text-white/40">
                  {{ success.earlyChurn.totalWithDates > 0 ? Math.round((success.earlyChurn.within90 / success.earlyChurn.totalWithDates) * 100) : 0 }}% of all churn
                </div>
              </div>
              <div class="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                <div class="flex items-center justify-between">
                  <div class="text-xs font-semibold uppercase tracking-wider text-white/50">Within 120 days</div>
                  <span class="text-2xl font-bold tabular-nums text-sky-400">{{ success.earlyChurn.within120 }}</span>
                </div>
                <div class="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.04]">
                  <div
                    class="h-full rounded-full bg-sky-500/60 transition-all duration-500"
                    :style="{ width: (success.earlyChurn.totalWithDates > 0 ? Math.round((success.earlyChurn.within120 / success.earlyChurn.totalWithDates) * 100) : 0) + '%' }"
                  />
                </div>
                <div class="mt-1.5 text-xs tabular-nums text-white/40">
                  {{ success.earlyChurn.totalWithDates > 0 ? Math.round((success.earlyChurn.within120 / success.earlyChurn.totalWithDates) * 100) : 0 }}% of all churn
                </div>
              </div>
            </div>
          </div>

          <!-- ── At-risk customers ── -->
          <div v-if="success.atRiskCustomers?.length > 0" class="mt-8">
            <div class="flex items-center gap-3">
              <div class="text-xs font-semibold uppercase tracking-wider text-white/60">At-risk customers</div>
              <div class="flex items-center gap-2 text-xs">
                <span v-if="success.atRiskSummary?.high > 0" class="rounded-full bg-rose-500/15 px-2 py-0.5 font-bold text-rose-400">{{ success.atRiskSummary.high }} high</span>
                <span v-if="success.atRiskSummary?.medium > 0" class="rounded-full bg-amber-500/15 px-2 py-0.5 font-bold text-amber-400">{{ success.atRiskSummary.medium }} medium</span>
                <span v-if="success.atRiskSummary?.low > 0" class="rounded-full bg-sky-500/15 px-2 py-0.5 font-bold text-sky-400">{{ success.atRiskSummary.low }} low</span>
              </div>
            </div>
            <div class="mt-3 overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead>
                  <tr class="border-b border-white/[0.06]">
                    <th class="pb-2 pr-4 font-semibold text-white/60">Company</th>
                    <th class="pb-2 pr-4 font-semibold text-white/60">Owner</th>
                    <th class="pb-2 pr-4 text-center font-semibold text-white/60">Risk</th>
                    <th class="pb-2 pr-4 text-right font-semibold text-white/60">Last contact</th>
                    <th class="pb-2 pr-4 text-right font-semibold text-white/60">Last meeting</th>
                    <th class="pb-2 font-semibold text-white/60">Reasons</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="c in success.atRiskCustomers"
                    :key="c.companyId"
                    class="border-b border-white/[0.03] last:border-0"
                  >
                    <td class="max-w-[180px] truncate py-2.5 pr-4 text-white/80">{{ c.name }}</td>
                    <td class="py-2.5 pr-4 text-white/50">{{ c.owner }}</td>
                    <td class="py-2.5 pr-4 text-center">
                      <span
                        class="inline-flex rounded-full px-2 py-0.5 text-xs font-bold"
                        :class="c.riskLevel === 'high' ? 'bg-rose-500/15 text-rose-400' : c.riskLevel === 'medium' ? 'bg-amber-500/15 text-amber-400' : 'bg-sky-500/15 text-sky-400'"
                      >{{ c.riskScore }}</span>
                    </td>
                    <td class="py-2.5 pr-4 text-right tabular-nums" :class="c.daysSinceLastContact !== null && c.daysSinceLastContact >= 90 ? 'text-rose-400' : c.daysSinceLastContact !== null && c.daysSinceLastContact >= 60 ? 'text-amber-400' : 'text-white/50'">
                      {{ c.daysSinceLastContact !== null ? c.daysSinceLastContact + 'd' : '—' }}
                    </td>
                    <td class="py-2.5 pr-4 text-right tabular-nums" :class="c.daysSinceLastMeeting !== null && c.daysSinceLastMeeting >= 90 ? 'text-rose-400' : c.daysSinceLastMeeting !== null && c.daysSinceLastMeeting >= 60 ? 'text-amber-400' : 'text-white/50'">
                      {{ c.daysSinceLastMeeting !== null ? c.daysSinceLastMeeting + 'd' : 'Never' }}
                    </td>
                    <td class="max-w-[250px] py-2.5">
                      <div class="flex flex-wrap gap-1">
                        <span
                          v-for="(r, ri) in c.reasons"
                          :key="ri"
                          class="rounded bg-white/[0.06] px-1.5 py-0.5 text-xs text-white/50"
                        >{{ r }}</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- ── Churn vs new customers trend ── -->
          <div v-if="churnTrendLinePoints.length > 1" class="mt-8">
            <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Churn vs new customers (6 months)</div>
            <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div class="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div class="mb-2 text-xs font-semibold text-rose-400">Churned</div>
                <LineChart :points="churnTrendLinePoints" color="#f472b6" :height="160" />
              </div>
              <div class="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div class="mb-2 text-xs font-semibold text-emerald-400">New customers</div>
                <LineChart :points="newCustTrendLinePoints" color="#34d399" :height="160" />
              </div>
            </div>
          </div>

          <!-- ── Donuts: Cancellation reasons · Tenure ── -->
          <div class="mt-8">
            <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Breakdown insights</div>
            <div class="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div v-if="churnReasonDonut.length" class="flex flex-col items-center rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                <div class="mb-3 text-xs font-semibold text-white/60">Cancellation reasons</div>
                <DonutChart
                  :segments="churnReasonDonut"
                  :size="160"
                  :stroke-width="24"
                  :centre-value="String(churnReasonDonut.reduce((a, s) => a + s.value, 0))"
                  centre-label="total"
                />
              </div>
              <div v-if="tenureDonut.length" class="flex flex-col items-center rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                <div class="mb-3 text-xs font-semibold text-white/60">Customer tenure</div>
                <DonutChart
                  :segments="tenureDonut"
                  :size="160"
                  :stroke-width="24"
                  :centre-value="String(tenureDonut.reduce((a, s) => a + s.value, 0))"
                  centre-label="customers"
                />
              </div>
            </div>
          </div>

          <!-- ── Recently churned customers ── -->
          <div v-if="success.recentChurned.length > 0" class="mt-8">
            <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Recently churned</div>
            <div class="mt-3 overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead>
                  <tr class="border-b border-white/[0.06]">
                    <th class="pb-2 pr-4 font-semibold text-white/60">Company</th>
                    <th class="pb-2 pr-4 font-semibold text-white/60">Date left</th>
                    <th class="pb-2 font-semibold text-white/60">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="c in success.recentChurned"
                    :key="c.name + c.dateLeft"
                    class="border-b border-white/[0.03] last:border-0"
                  >
                    <td class="max-w-[200px] truncate py-2.5 pr-4 text-white/80">{{ c.name }}</td>
                    <td class="py-2.5 pr-4 text-white/50">{{ c.dateLeft ? new Date(c.dateLeft).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' }}</td>
                    <td class="max-w-[300px] truncate py-2.5 text-white/50">{{ c.reason }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>
