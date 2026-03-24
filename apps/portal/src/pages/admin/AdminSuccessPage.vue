<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import SparkLine from '../../components/SparkLine.vue'
import DonutChart from '../../components/DonutChart.vue'
import LineChart from '../../components/LineChart.vue'
import DashboardSubNav from '../../components/DashboardSubNav.vue'
import { adminGetCustomerSuccess, type CustomerSuccess } from '../../lib/api'
import { pctDelta } from '../../lib/dashboard-helpers'
import { useDashboardMonth } from '../../lib/useDashboardMonth'

const { selectedMonth, monthOptions } = useDashboardMonth()

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */
const successLoading = ref(true)
const successError = ref<string | null>(null)
const success = ref<CustomerSuccess | null>(null)
const successCachedAt = ref<string | null>(null)

async function loadSuccessStats(refresh = false) {
  successLoading.value = true
  successError.value = null
  try {
    const res = await adminGetCustomerSuccess(selectedMonth.value, refresh)
    success.value = res.stats
    successCachedAt.value = res.cachedAt ?? null
  } catch (e) {
    successError.value = e instanceof Error ? e.message : 'Failed to load success stats'
  } finally {
    successLoading.value = false
  }
}

/* ── Colour palettes ── */
const CHURN_COLORS = ['#f472b6', '#818cf8', '#34d399', '#fbbf24', '#38bdf8', '#a855f7', '#f97316', '#fb7185', '#14b8a6']
const SUCCESS_AGENT_COLORS: Record<string, string> = {
  'Simone Mills': '#818cf8',
  'Hope Schindler': '#fbbf24',
  'Shaun Ward': '#34d399',
}
const TENURE_COLORS = ['#818cf8', '#34d399', '#fbbf24', '#f472b6', '#38bdf8']

/* ── Donut computeds ── */
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

/* ── KPI cards with sparklines + deltas ── */
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

watch(selectedMonth, () => void loadSuccessStats())

onMounted(() => {
  void loadSuccessStats()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-2">
      <p class="text-xs uppercase tracking-[0.08em] text-gray-600">Analytics</p>
      <h2 class="text-2xl font-semibold text-gray-900">Customer Success</h2>
      <p class="text-sm text-gray-700">Customer health, retention, and team performance.</p>
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
            class="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-white/80 hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-amber-500/50 appearance-none cursor-pointer pr-8"
            style="background-image: url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff80' d='M3 5l3 3 3-3'/%3E%3C/svg%3E&quot;); background-repeat: no-repeat; background-position: right 8px center;"
          >
            <option v-for="opt in monthOptions" :key="opt.value" :value="opt.value" class="bg-[#1a1f3a] text-white">{{ opt.label }}</option>
          </select>
          <button
            class="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-white/80 hover:bg-white/10"
            type="button"
            title="Refresh from HubSpot"
            :disabled="successLoading"
            @click="loadSuccessStats(true)"
          >
            <svg class="h-3.5 w-3.5" :class="{ 'animate-spin': successLoading }" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
        </div>
      </div>
      <div v-if="successCachedAt" class="mt-1 text-xs text-white/50">
        Last updated: {{ new Date(successCachedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }}
      </div>

      <!-- Loading / Error -->
      <div v-if="successLoading" class="mt-8 space-y-8">
        <!-- Skeleton KPI cards -->
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div v-for="n in 8" :key="'kpi-sk-' + n" class="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
            <div class="h-3 w-20 animate-pulse rounded bg-white/[0.06]" />
            <div class="mt-3 h-7 w-16 animate-pulse rounded bg-white/[0.08]" />
            <div class="mt-2 h-2 w-24 animate-pulse rounded bg-white/[0.04]" />
          </div>
        </div>
        <!-- Skeleton new customers section -->
        <div>
          <div class="flex items-center gap-3">
            <div class="h-3 w-28 animate-pulse rounded bg-white/[0.06]" />
            <div class="h-5 w-32 animate-pulse rounded-full bg-white/[0.04]" />
          </div>
          <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div v-for="n in 6" :key="'nc-sk-' + n" class="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <div class="h-4 w-36 animate-pulse rounded bg-white/[0.08]" />
                  <div class="mt-2 h-3 w-20 animate-pulse rounded bg-white/[0.04]" />
                </div>
                <div class="h-5 w-12 animate-pulse rounded-full bg-white/[0.06]" />
              </div>
              <div class="mt-3 flex items-center gap-3">
                <div class="h-3 w-20 animate-pulse rounded bg-white/[0.04]" />
                <div class="h-3 w-20 animate-pulse rounded bg-white/[0.04]" />
              </div>
              <div class="mt-3">
                <div class="h-1.5 animate-pulse rounded-full bg-white/[0.04]" />
                <div class="mt-1 flex justify-between">
                  <div class="h-2.5 w-14 animate-pulse rounded bg-white/[0.03]" />
                  <div class="h-2.5 w-16 animate-pulse rounded bg-white/[0.03]" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <!-- Skeleton table -->
        <div>
          <div class="h-3 w-28 animate-pulse rounded bg-white/[0.06]" />
          <div class="mt-4 space-y-2">
            <div v-for="n in 4" :key="'tbl-sk-' + n" class="h-10 animate-pulse rounded-lg bg-white/[0.03]" />
          </div>
        </div>
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
            <span v-if="success.newCustomers.some(c => c.isPreReg)" class="rounded-full bg-purple-500/10 px-2 py-0.5 text-xs font-bold text-purple-400">
              {{ success.newCustomers.filter(c => c.isPreReg).length }} pre-reg
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
                  <div class="mt-0.5 flex items-center gap-1.5">
                    <span class="text-xs text-white/50">{{ cust.owner }}</span>
                  </div>
                </div>
                <div class="flex flex-col items-end gap-1 shrink-0">
                  <div class="flex items-center gap-1.5">
                    <span v-if="cust.isPreReg" class="rounded-full bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-purple-300 border border-purple-500/20">Pre-reg</span>
                    <span class="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs font-bold tabular-nums text-white/80">
                      Day {{ cust.daysSinceStart }}
                    </span>
                  </div>
                  <svg class="h-3.5 w-3.5 text-white/30 group-hover:text-amber-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                </div>
              </div>
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
                <div class="flex items-center gap-1.5">
                  <div
                    class="h-2 w-2 rounded-full"
                    :class="cust.sentiment === 'positive' ? 'bg-emerald-400' : cust.sentiment === 'negative' ? 'bg-rose-400' : 'bg-white/20'"
                  />
                  <span class="text-xs" :class="cust.sentiment === 'positive' ? 'text-emerald-400' : cust.sentiment === 'negative' ? 'text-rose-400' : 'text-white/40'">
                    Sentiment {{ cust.sentiment === 'positive' ? '✓' : cust.sentiment === 'negative' ? '✗' : '—' }}
                  </span>
                </div>
              </div>
              <div class="mt-3">
                <div class="h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
                  <div
                    class="h-full rounded-full transition-all duration-500"
                    :class="cust.trainingMeeting === 'completed' && cust.successMeeting === 'completed' && cust.sentiment === 'positive' ? 'bg-emerald-500/60' : cust.sentiment === 'negative' ? 'bg-rose-500/60' : cust.daysSinceStart <= 30 ? 'bg-emerald-500/60' : cust.daysSinceStart <= 45 ? 'bg-amber-500/60' : 'bg-rose-500/60'"
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
                  <th class="pb-2 pr-4 text-center font-semibold text-white/60">Sentiment</th>
                  <th class="pb-2 pr-4 text-right font-semibold text-white/60">Contract start</th>
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
                  <td class="py-2.5 pr-4 text-center">
                    <span
                      v-if="c.sentiment"
                      class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                      :class="c.sentiment === 'at_risk' ? 'bg-rose-500/15 text-rose-400' : c.sentiment === 'healthy' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'"
                    >
                      <span class="h-1.5 w-1.5 rounded-full" :class="c.sentiment === 'at_risk' ? 'bg-rose-400' : c.sentiment === 'healthy' ? 'bg-emerald-400' : 'bg-amber-400'" />
                      {{ c.sentiment === 'at_risk' ? 'At-Risk' : c.sentiment === 'healthy' ? 'Healthy' : 'Neutral' }}
                    </span>
                    <span v-else class="text-white/30">—</span>
                  </td>
                  <td class="py-2.5 pr-4 text-right tabular-nums text-white/50">
                    {{ c.contractStartDate ? new Date(c.contractStartDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' }}
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

        <!-- ── Recently churned ── -->
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
    </div>
  </div>
</template>
