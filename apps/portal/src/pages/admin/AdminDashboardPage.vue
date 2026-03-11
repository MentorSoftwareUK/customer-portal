<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import SparkLine from '../../components/SparkLine.vue'
import DashboardSubNav from '../../components/DashboardSubNav.vue'
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
import { pctDelta, formatCurrency } from '../../lib/dashboard-helpers'

/* ------------------------------------------------------------------ */
/*  Unified month picker                                               */
/* ------------------------------------------------------------------ */
const now = new Date()
const defaultMonth = (() => {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
})()

const selectedMonth = ref(defaultMonth)

// Build month options (last 12 months)
const monthOptions = computed(() => {
  const opts: { value: string; label: string }[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    opts.push({ value: val, label })
  }
  return opts
})

const selectedMonthLabel = computed(() => {
  const opt = monthOptions.value.find(o => o.value === selectedMonth.value)
  return opt?.label ?? selectedMonth.value
})

/* ------------------------------------------------------------------ */
/*  Customer overview (not month-dependent)                            */
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
/*  Marketing headline                                                 */
/* ------------------------------------------------------------------ */
const funnelLoading = ref(true)
const funnel = ref<SalesFunnel | null>(null)

async function loadFunnel() {
  funnelLoading.value = true
  try {
    const res = await adminGetSalesFunnel(selectedMonth.value)
    funnel.value = res.funnel
  } catch { /* silent */ } finally {
    funnelLoading.value = false
  }
}

const funnelMonthLabel = computed(() => selectedMonthLabel.value)

const marketingCards = computed(() => {
  if (!funnel.value) return []
  const f = funnel.value
  const p = f.previous
  const currConv = f.mqls > 0 ? (f.demos / f.mqls) * 100 : 0
  const prevConv = p && p.mqls > 0 ? (p.demos / p.mqls) * 100 : 0
  return [
    { label: 'MQLs', val: f.mqls.toLocaleString(), delta: pctDelta(f.mqls, p?.mqls), suffix: '%', spark: f.trend.map(t => t.mqls), color: '#818cf8' },
    { label: 'Demos', val: f.demos.toLocaleString(), delta: pctDelta(f.demos, p?.demos), suffix: '%', spark: f.trend.map(t => t.demos), color: '#fbbf24' },
    {
      label: 'MQL \u2192 Demo',
      val: `${Math.round(currConv)}%`,
      delta: { value: Math.abs(Math.round(currConv - prevConv)), dir: currConv > prevConv ? 'up' as const : currConv < prevConv ? 'down' as const : 'flat' as const },
      suffix: 'pp',
      spark: f.trend.map(t => t.mqls > 0 ? (t.demos / t.mqls) * 100 : 0),
      color: '#f472b6',
    },
  ]
})

/* ------------------------------------------------------------------ */
/*  Sales headline                                                     */
/* ------------------------------------------------------------------ */
const salesLoading = ref(true)
const sales = ref<SalesStats | null>(null)

async function loadSales() {
  salesLoading.value = true
  try {
    const res = await adminGetSalesStats(selectedMonth.value)
    sales.value = res.stats
  } catch { /* silent */ } finally {
    salesLoading.value = false
  }
}

const salesMonthLabel = computed(() => selectedMonthLabel.value)

const salesCards = computed(() => {
  if (!sales.value) return []
  const s = sales.value
  const p = s.previous
  return [
    { label: 'Deals Won', val: s.dealsWonThisMonth.toString(), delta: pctDelta(s.dealsWonThisMonth, p?.dealsWon), suffix: '%', spark: s.trend.map(t => t.dealsWon), color: '#34d399' },
    {
      label: 'Revenue Won',
      val: `\u00A3${s.revenueWonThisMonth.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
      delta: pctDelta(s.revenueWonThisMonth, p?.revenue),
      suffix: '%',
      spark: s.trend.map(t => t.revenue),
      color: '#818cf8',
    },
    {
      label: 'Win Rate',
      val: `${s.winRate}%`,
      delta: { value: Math.abs(s.winRate - (p?.winRate ?? 0)), dir: s.winRate > (p?.winRate ?? 0) ? 'up' as const : s.winRate < (p?.winRate ?? 0) ? 'down' as const : 'flat' as const },
      suffix: 'pp',
      spark: s.trend.map(t => t.winRate),
      color: '#fbbf24',
    },
    { label: 'Open Pipeline', val: formatCurrency(s.openPipelineValue), delta: { value: 0, dir: 'flat' as const }, suffix: '', spark: [] as number[], color: '#38bdf8' },
  ]
})

/* ------------------------------------------------------------------ */
/*  Success headline                                                   */
/* ------------------------------------------------------------------ */
const successLoading = ref(true)
const success = ref<CustomerSuccess | null>(null)

async function loadSuccess() {
  successLoading.value = true
  try {
    const res = await adminGetCustomerSuccess(selectedMonth.value)
    success.value = res.stats
  } catch { /* silent */ } finally {
    successLoading.value = false
  }
}

const successCards = computed(() => {
  if (!success.value) return []
  const s = success.value
  const prev = s.previousPeriod
  const spark = s.kpiSpark
  return [
    {
      label: 'Paying Customers',
      val: s.totalPayingCustomers.toString(),
      delta: prev ? pctDelta(s.totalPayingCustomers, prev.totalPayingCustomers) : { value: 0, dir: 'flat' as const },
      suffix: '%',
      spark: spark?.paying ?? [],
      color: '#34d399',
      valClass: '',
    },
    {
      label: 'Retention Rate',
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
      label: 'Churned (month)',
      val: s.churnedThisMonth.toString(),
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
      label: 'At-risk',
      val: ((s.atRiskSummary?.high ?? 0) + (s.atRiskSummary?.medium ?? 0)).toString(),
      delta: { value: 0, dir: 'flat' as const },
      suffix: '',
      spark: [] as number[],
      color: '#fb7185',
      valClass: 'text-amber-400',
    },
  ]
})

function loadAllMonthData() {
  void loadFunnel()
  void loadSales()
  void loadSuccess()
}

watch(selectedMonth, () => loadAllMonthData())

onMounted(() => {
  void loadStats()
  loadAllMonthData()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-2">
      <p class="text-xs uppercase tracking-[0.08em] text-gray-600">Control centre</p>
      <h2 class="text-2xl font-semibold text-gray-900">Dashboard</h2>
      <p class="text-sm text-gray-700">Director overview of marketing, sales, and customer success performance.</p>
    </div>

    <!-- Customer overview -->
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

    <!-- Performance summary -->
    <div class="rounded-2xl border border-white/10 bg-[#0f1428] p-6 text-white shadow-[0_18px_40px_rgba(15,20,40,0.35)]">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <DashboardSubNav />
        <div class="flex items-center gap-2">
          <select
            v-model="selectedMonth"
            class="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-white/80 hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 appearance-none cursor-pointer pr-8"
            style="background-image: url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff80' d='M3 5l3 3 3-3'/%3E%3C/svg%3E&quot;); background-repeat: no-repeat; background-position: right 8px center;"
          >
            <option
              v-for="opt in monthOptions"
              :key="opt.value"
              :value="opt.value"
              class="bg-[#1a1f3a] text-white"
            >
              {{ opt.label }}
            </option>
          </select>
          <button
            class="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-white/80 hover:bg-white/10"
            type="button"
            @click="loadAllMonthData"
          >
            Refresh
          </button>
        </div>
      </div>

      <!-- Marketing headlines -->
      <div class="mt-8">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="text-sm font-semibold text-indigo-300">Marketing</div>
            <span v-if="funnelMonthLabel" class="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-medium text-indigo-300/70">{{ funnelMonthLabel }}</span>
          </div>
          <RouterLink to="/admin/marketing" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors">
            View details &rarr;
          </RouterLink>
        </div>
        <div v-if="funnelLoading" class="mt-4 flex items-center gap-2 text-xs text-white/40">
          <div class="h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-indigo-400" />
          Loading&hellip;
        </div>
        <div v-else-if="marketingCards.length > 0" class="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <div
            v-for="card in marketingCards"
            :key="card.label"
            class="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.05]"
          >
            <div class="flex items-start justify-between">
              <div class="text-xs font-semibold uppercase tracking-wider text-white/60">{{ card.label }}</div>
              <SparkLine v-if="card.spark.length > 0" :data="card.spark" :color="card.color" :width="56" :height="20" />
            </div>
            <div class="mt-2 text-2xl font-bold tabular-nums text-white">{{ card.val }}</div>
            <div class="mt-1 flex items-center gap-1.5">
              <span
                v-if="card.delta.dir !== 'flat'"
                class="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-bold"
                :class="card.delta.dir === 'up' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'"
              >
                <svg v-if="card.delta.dir === 'up'" class="h-2.5 w-2.5" fill="none" viewBox="0 0 10 10"><path d="M5 2v6M2.5 4.5 5 2l2.5 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <svg v-else class="h-2.5 w-2.5" fill="none" viewBox="0 0 10 10"><path d="M5 8V2M2.5 5.5 5 8l2.5-2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                {{ card.delta.value }}{{ card.suffix }}
              </span>
              <span v-else class="text-xs text-white/50">&mdash;</span>
              <span v-if="card.delta.dir !== 'flat'" class="text-xs text-white/50">vs prev</span>
            </div>
          </div>
        </div>
        <div v-else class="mt-4 text-xs text-white/40">No marketing data available</div>
      </div>

      <div class="my-8 border-t border-white/[0.06]" />

      <!-- Sales headlines -->
      <div>
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="text-sm font-semibold text-emerald-300">Sales</div>
            <span class="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300/70">{{ salesMonthLabel }}</span>
          </div>
          <RouterLink to="/admin/sales" class="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors">
            View details &rarr;
          </RouterLink>
        </div>
        <div v-if="salesLoading" class="mt-4 flex items-center gap-2 text-xs text-white/40">
          <div class="h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-emerald-400" />
          Loading&hellip;
        </div>
        <div v-else-if="salesCards.length > 0" class="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div
            v-for="card in salesCards"
            :key="card.label"
            class="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.05]"
          >
            <div class="flex items-start justify-between">
              <div class="text-xs font-semibold uppercase tracking-wider text-white/60">{{ card.label }}</div>
              <SparkLine v-if="card.spark.length > 0" :data="card.spark" :color="card.color" :width="56" :height="20" />
            </div>
            <div class="mt-2 text-2xl font-bold tabular-nums text-white">{{ card.val }}</div>
            <div class="mt-1 flex items-center gap-1.5">
              <span
                v-if="card.delta.dir !== 'flat'"
                class="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-bold"
                :class="card.delta.dir === 'up' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'"
              >
                <svg v-if="card.delta.dir === 'up'" class="h-2.5 w-2.5" fill="none" viewBox="0 0 10 10"><path d="M5 2v6M2.5 4.5 5 2l2.5 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <svg v-else class="h-2.5 w-2.5" fill="none" viewBox="0 0 10 10"><path d="M5 8V2M2.5 5.5 5 8l2.5-2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                {{ card.delta.value }}{{ card.suffix }}
              </span>
              <span v-else class="text-xs text-white/50">&mdash;</span>
              <span v-if="card.delta.dir !== 'flat'" class="text-xs text-white/50">vs prev</span>
            </div>
          </div>
        </div>
        <div v-else class="mt-4 text-xs text-white/40">No sales data available</div>
      </div>

      <div class="my-8 border-t border-white/[0.06]" />

      <!-- Success headlines -->
      <div>
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="text-sm font-semibold text-amber-300">Customer Success</div>
            <span class="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-300/70">{{ selectedMonthLabel }}</span>
          </div>
          <RouterLink to="/admin/success" class="text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors">
            View details &rarr;
          </RouterLink>
        </div>
        <div v-if="successLoading" class="mt-4 flex items-center gap-2 text-xs text-white/40">
          <div class="h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-amber-400" />
          Loading&hellip;
        </div>
        <div v-else-if="successCards.length > 0" class="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div
            v-for="card in successCards"
            :key="card.label"
            class="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.05]"
          >
            <div class="flex items-start justify-between">
              <div class="text-xs font-semibold uppercase tracking-wider text-white/60">{{ card.label }}</div>
              <SparkLine v-if="card.spark.length > 1" :data="card.spark" :color="card.color" :width="56" :height="20" />
            </div>
            <div class="mt-2 text-2xl font-bold tabular-nums" :class="card.valClass || 'text-white'">{{ card.val }}</div>
            <div class="mt-1 flex items-center gap-1.5">
              <span
                v-if="card.delta.dir !== 'flat'"
                class="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-bold"
                :class="(card.invertDelta ? card.delta.dir === 'down' : card.delta.dir === 'up') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'"
              >
                <svg v-if="card.delta.dir === 'up'" class="h-2.5 w-2.5" fill="none" viewBox="0 0 10 10"><path d="M5 2v6M2.5 4.5 5 2l2.5 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <svg v-else class="h-2.5 w-2.5" fill="none" viewBox="0 0 10 10"><path d="M5 8V2M2.5 5.5 5 8l2.5-2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                {{ card.delta.value }}{{ card.suffix }}
              </span>
              <span v-else class="text-xs text-white/50">&mdash;</span>
              <span v-if="card.delta.dir !== 'flat'" class="text-xs text-white/50">vs prev</span>
            </div>
          </div>
        </div>
        <div v-else class="mt-4 text-xs text-white/40">No success data available</div>
      </div>
    </div>
  </div>
</template>
