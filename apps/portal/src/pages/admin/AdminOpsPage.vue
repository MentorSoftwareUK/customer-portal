<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import SparkLine from '../../components/SparkLine.vue'
import DashboardSubNav from '../../components/DashboardSubNav.vue'
import { adminGetOps, type OpsStats } from '../../lib/api'
import { pctDelta, relativeDate } from '../../lib/dashboard-helpers'
import { useDashboardMonth } from '../../lib/useDashboardMonth'

const { selectedMonth, monthOptions } = useDashboardMonth()

/* ── State ── */
const loading = ref(true)
const error = ref<string | null>(null)
const ops = ref<OpsStats | null>(null)
const cachedAt = ref<string | null>(null)

async function loadOps(refresh = false) {
  loading.value = true
  error.value = null
  try {
    const res = await adminGetOps(selectedMonth.value, refresh)
    ops.value = res.stats
    cachedAt.value = res.cachedAt ?? null
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load ops stats'
  } finally {
    loading.value = false
  }
}

/* ── UI state ── */
const expandedDepts = ref<Set<string>>(new Set())
function toggleDept(dept: string) {
  if (expandedDepts.value.has(dept)) expandedDepts.value.delete(dept)
  else expandedDepts.value.add(dept)
}

const dismissedAlerts = ref<Set<string>>(new Set())

/* ── Inactive companies filter ── */
const inactiveFilter = ref<'all' | '14to30' | '30plus'>('all')
const filteredInactive = computed(() => {
  if (!ops.value) return []
  const list = ops.value.inactiveCompanies.companies
  if (inactiveFilter.value === '14to30') return list.filter(c => c.daysInactive >= 14 && c.daysInactive < 30)
  if (inactiveFilter.value === '30plus') return list.filter(c => c.daysInactive >= 30)
  return list
})

/* ── Colors ── */
const DEPT_COLORS: Record<string, string> = {
  Sales: '#34d399',
  Success: '#fbbf24',
  Training: '#818cf8',
  Retention: '#f472b6',
  Support: '#38bdf8',
  Marketing: '#a855f7',
}

const HEALTH_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  green: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Healthy' },
  amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'At Risk' },
  red: { bg: 'bg-rose-500/10', text: 'text-rose-400', label: 'Critical' },
}



watch(selectedMonth, () => void loadOps())
onMounted(() => void loadOps())
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-2">
      <p class="text-xs uppercase tracking-[0.08em] text-gray-600">Analytics</p>
      <h2 class="text-2xl font-semibold text-gray-900">Ops</h2>
      <p class="text-sm text-gray-700">Operations overview — department health, handoffs, data hygiene, and efficiency.</p>
    </div>

    <div class="rounded-2xl border border-white/10 bg-[#0f1428] p-6 text-white shadow-[0_18px_40px_rgba(15,20,40,0.35)]">
      <!-- Header -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-4">
          <DashboardSubNav />
        </div>
        <div class="flex items-center gap-2">
          <select
            v-model="selectedMonth"
            class="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-white/80 hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 appearance-none cursor-pointer pr-8"
            style="background-image: url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff80' d='M3 5l3 3 3-3'/%3E%3C/svg%3E&quot;); background-repeat: no-repeat; background-position: right 8px center;"
          >
            <option v-for="opt in monthOptions" :key="opt.value" :value="opt.value" class="bg-[#1a1f3a] text-white">{{ opt.label }}</option>
          </select>
          <button
            class="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-white/80 hover:bg-white/10"
            type="button"
            title="Refresh from HubSpot"
            :disabled="loading"
            @click="loadOps(true)"
          >
            <svg class="h-3.5 w-3.5" :class="{ 'animate-spin': loading }" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
        </div>
      </div>
      <div v-if="cachedAt" class="mt-1 text-xs text-white/50">
        Last updated: {{ new Date(cachedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }}
      </div>

      <!-- Loading / Error -->
      <div v-if="loading" class="mt-8 flex items-center justify-center py-12">
        <div class="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-cyan-400" />
      </div>

      <div v-else-if="error" class="mt-6 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
        {{ error }}
      </div>

      <template v-else-if="ops">
        <!-- Scope warnings -->
        <div v-if="ops.scopeWarnings.length > 0" class="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <span class="font-semibold">Some data unavailable</span> — missing HubSpot scopes: {{ ops.scopeWarnings.join(', ') }}. Those metrics show as 0.
        </div>

        <!-- ═══════════════════════════════════════════════
             1. ALERTS BANNER
        ═══════════════════════════════════════════════ -->
        <div v-if="ops.alerts.filter(a => !dismissedAlerts.has(a.id)).length > 0" class="mt-5">
          <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Alerts</div>
          <div class="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div
              v-for="alert in ops.alerts.filter(a => !dismissedAlerts.has(a.id))"
              :key="alert.id"
              class="group relative rounded-xl border p-4 transition-colors"
              :class="alert.severity === 'red'
                ? 'border-rose-500/20 bg-rose-500/[0.06]'
                : 'border-amber-500/20 bg-amber-500/[0.06]'"
            >
              <button
                class="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity text-white/30 hover:text-white/60 text-sm"
                @click="dismissedAlerts.add(alert.id)"
                title="Dismiss"
              >&times;</button>
              <div class="text-2xl font-bold tabular-nums"
                :class="alert.severity === 'red' ? 'text-rose-400' : 'text-amber-400'">
                {{ alert.count }}
              </div>
              <div class="mt-1 text-xs text-white/60 leading-snug">{{ alert.label }}</div>
            </div>
          </div>
        </div>

        <!-- ═══════════════════════════════════════════════
             2. DEPARTMENT HEALTH (Hero)
        ═══════════════════════════════════════════════ -->
        <div id="dept-health" class="mt-6">
          <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Department Health</div>
          <div class="mt-3 space-y-2">
            <div
              v-for="dept in ops.departments"
              :key="dept.department"
              class="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden"
            >
              <button
                class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
                @click="toggleDept(dept.department)"
              >
                <!-- Dept color dot -->
                <div class="h-3 w-3 rounded-full shrink-0" :style="{ backgroundColor: DEPT_COLORS[dept.department] ?? '#94a3b8' }" />
                <!-- Name + headcount -->
                <div class="min-w-[120px]">
                  <div class="flex items-baseline gap-2">
                    <span class="text-sm font-semibold text-white">{{ dept.department }}</span>
                    <span class="text-xs text-white/50">{{ dept.headcount }} {{ dept.headcount === 1 ? 'person' : 'people' }}</span>
                  </div>
                </div>
                <!-- Stats -->
                <div class="flex items-center gap-4 text-sm tabular-nums flex-1">
                  <div><span class="text-white/50">Open </span><span class="font-bold text-white">{{ dept.openTasks }}</span></div>
                  <div>
                    <span class="text-white/50">Overdue </span>
                    <span class="font-bold" :class="dept.overdueRate > 20 ? 'text-rose-400' : dept.overdueRate >= 10 ? 'text-amber-400' : 'text-white'">
                      {{ dept.overdueTasks }}
                    </span>
                    <span class="text-white/50 ml-0.5">({{ dept.overdueRate }}%)</span>
                  </div>
                  <div><span class="text-white/50">Meetings </span><span class="font-bold text-teal-400">{{ dept.meetings }}</span></div>
                  <div v-if="dept.department === 'Sales'"><span class="text-white/50">Demos </span><span class="font-bold text-cyan-400">{{ dept.demos }}</span></div>
                  <div v-if="dept.department === 'Support'"><span class="text-white/50">Tickets </span><span class="font-bold text-orange-400">{{ dept.tickets }}</span></div>
                  <div><span class="text-white/50">Activity </span><span class="font-bold text-white">{{ dept.activityThisMonth }}</span></div>
                  <div v-if="dept.lastActivityDate" class="text-white/50">
                    Last: {{ relativeDate(dept.lastActivityDate) }}
                  </div>
                </div>
                <!-- Health badge -->
                <span
                  class="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  :class="[HEALTH_STYLES[dept.health]?.bg, HEALTH_STYLES[dept.health]?.text]"
                >{{ HEALTH_STYLES[dept.health]?.label }}</span>
                <!-- Chevron -->
                <svg class="h-4 w-4 text-white/30 transition-transform shrink-0" :class="{ 'rotate-180': expandedDepts.has(dept.department) }" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>

              <!-- Expanded members -->
              <div v-if="expandedDepts.has(dept.department)" class="border-t border-white/[0.04] bg-white/[0.01]">
                <div class="grid gap-1 px-4 py-1.5 text-xs uppercase tracking-wider text-white/50 border-b border-white/[0.04]"
                  :class="dept.department === 'Sales' || dept.department === 'Support' ? 'grid-cols-[1fr_repeat(7,_60px)_100px]' : 'grid-cols-[1fr_repeat(6,_60px)_100px]'"
                >
                  <span>Name</span><span class="text-center">Open</span><span class="text-center">Overdue</span>
                  <span class="text-center">Calls</span><span class="text-center">Emails</span><span class="text-center">Notes</span>
                  <span class="text-center">Meetings</span>
                  <span v-if="dept.department === 'Sales'" class="text-center">Demos</span>
                  <span v-if="dept.department === 'Support'" class="text-center">Tickets</span>
                  <span class="text-right">Last activity</span>
                </div>
                <div
                  v-for="member in dept.members"
                  :key="member.ownerId"
                  class="grid gap-1 items-center px-4 py-2 text-sm border-b border-white/[0.03] last:border-0"
                  :class="dept.department === 'Sales' || dept.department === 'Support' ? 'grid-cols-[1fr_repeat(7,_60px)_100px]' : 'grid-cols-[1fr_repeat(6,_60px)_100px]'"
                >
                  <span class="text-white/80">{{ member.name }}</span>
                  <span class="text-center tabular-nums text-white/80">{{ member.openTasks }}</span>
                  <span class="text-center tabular-nums" :class="member.overdueTasks > 0 ? 'text-rose-400 font-bold' : 'text-white/50'">{{ member.overdueTasks }}</span>
                  <span class="text-center tabular-nums text-indigo-400">{{ member.calls }}</span>
                  <span class="text-center tabular-nums text-sky-400">{{ member.emails }}</span>
                  <span class="text-center tabular-nums text-purple-400">{{ member.notes }}</span>
                  <span class="text-center tabular-nums text-teal-400">{{ member.meetings }}</span>
                  <span v-if="dept.department === 'Sales'" class="text-center tabular-nums text-cyan-400">{{ member.demos }}</span>
                  <span v-if="dept.department === 'Support'" class="text-center tabular-nums text-orange-400">{{ member.tickets }}</span>
                  <span class="text-right text-white/50 text-xs">{{ member.lastActivity ? relativeDate(member.lastActivity) : '—' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══════════════════════════════════════════════
             3. HANDOFF & ONBOARDING PIPELINE
        ═══════════════════════════════════════════════ -->
        <div id="handoff" class="mt-8">
          <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Handoff & Onboarding</div>

          <!-- Summary cards -->
          <div class="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div class="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
              <div class="text-xs text-white/50">Not assigned to CS/Training</div>
              <div class="mt-1 text-2xl font-bold tabular-nums" :class="ops.handoff.unassignedWon.length > 0 ? 'text-rose-400' : 'text-emerald-400'">
                {{ ops.handoff.unassignedWon.length }}
              </div>
              <div class="mt-0.5 text-[10px] text-white/30">Won deals, 3+ days</div>
            </div>
            <div class="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
              <div class="text-xs text-white/50">No contact (5+ days)</div>
              <div class="mt-1 text-2xl font-bold tabular-nums" :class="ops.handoff.noContactNewCustomers.length > 0 ? 'text-rose-400' : 'text-emerald-400'">
                {{ ops.handoff.noContactNewCustomers.length }}
              </div>
              <div class="mt-0.5 text-[10px] text-white/30">New customers &lt; 30d</div>
            </div>
            <div class="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
              <div class="text-xs text-white/50">No notes logged</div>
              <div class="mt-1 text-2xl font-bold tabular-nums" :class="ops.handoff.noNotesNewCustomers.length > 0 ? 'text-amber-400' : 'text-emerald-400'">
                {{ ops.handoff.noNotesNewCustomers.length }}
              </div>
              <div class="mt-0.5 text-[10px] text-white/30">New customers &lt; 30d</div>
            </div>
            <div class="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
              <div class="text-xs text-white/50">Avg days to first contact</div>
              <div class="mt-1 text-2xl font-bold tabular-nums text-white">
                {{ ops.handoff.avgDaysToFirstContact != null ? ops.handoff.avgDaysToFirstContact + 'd' : '—' }}
              </div>
              <div class="mt-0.5 text-[10px] text-white/30">Deal won → first touch</div>
            </div>
          </div>

          <!-- Unassigned won deals table — removed -->

          <!-- No contact new customers table -->
          <div v-if="ops.handoff.noContactNewCustomers.length > 0" class="mt-4">
            <div class="text-[11px] font-semibold uppercase tracking-wider text-rose-400/80 mb-2">New customers — no contact logged</div>
            <div class="rounded-lg border border-white/[0.06] overflow-hidden">
              <table class="w-full text-xs">
                <thead><tr class="border-b border-white/[0.06] text-white/40">
                  <th class="px-3 py-2 text-left font-medium">Company</th>
                  <th class="px-3 py-2 text-left font-medium">Owner</th>
                  <th class="px-3 py-2 text-right font-medium">Days since won</th>
                </tr></thead>
                <tbody>
                  <tr v-for="(c, i) in ops.handoff.noContactNewCustomers" :key="i" class="border-b border-white/[0.03] last:border-0">
                    <td class="px-3 py-2 text-white/80">{{ c.company }}</td>
                    <td class="px-3 py-2 text-white/60">{{ c.owner }}</td>
                    <td class="px-3 py-2 text-right tabular-nums text-rose-400">{{ c.daysSinceWon }}d</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>

        <!-- ═══════════════════════════════════════════════
             6. TASK & WORKLOAD OVERVIEW
        ═══════════════════════════════════════════════ -->
        <div id="task-workload" class="mt-8">
          <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Task & Workload</div>

          <!-- KPI cards -->
          <div class="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div class="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
              <div class="text-xs text-white/50">Total open</div>
              <div class="mt-1 text-2xl font-bold tabular-nums text-white">{{ ops.taskWorkload.totalOpen }}</div>
            </div>
            <div class="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
              <div class="text-xs text-white/50">Overdue</div>
              <div class="mt-1 text-2xl font-bold tabular-nums" :class="ops.taskWorkload.overdueRate > 20 ? 'text-rose-400' : ops.taskWorkload.overdueRate >= 10 ? 'text-amber-400' : 'text-white'">
                {{ ops.taskWorkload.totalOverdue }}
              </div>
              <div class="mt-0.5 text-[10px] text-white/30">{{ ops.taskWorkload.overdueRate }}% of open</div>
            </div>
            <div class="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
              <div class="text-xs text-white/50">Completed this month</div>
              <div class="mt-1 text-2xl font-bold tabular-nums text-emerald-400">{{ ops.taskWorkload.completedThisMonth }}</div>
              <div class="mt-0.5 flex items-center gap-1">
                <span v-if="ops.taskWorkload.completedPrev > 0"
                  class="text-[10px] font-bold rounded-full px-1.5 py-0.5"
                  :class="ops.taskWorkload.completedThisMonth >= ops.taskWorkload.completedPrev ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'"
                >
                  {{ pctDelta(ops.taskWorkload.completedThisMonth, ops.taskWorkload.completedPrev).dir === 'up' ? '+' : '' }}{{ pctDelta(ops.taskWorkload.completedThisMonth, ops.taskWorkload.completedPrev).value }}%
                </span>
                <span class="text-[10px] text-white/30">vs prev</span>
              </div>
            </div>
            <div class="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
              <div class="text-xs text-white/50">Avg completion time</div>
              <div class="mt-1 text-2xl font-bold tabular-nums text-white">{{ ops.taskWorkload.avgCompletionDays }}d</div>
              <div class="mt-0.5 text-[10px] text-white/30">Prev: {{ ops.taskWorkload.avgCompletionDaysPrev }}d</div>
            </div>
          </div>

          <!-- Overdue by owner (horizontal bar chart) -->
          <div v-if="ops.taskWorkload.overdueByOwner.length > 0" class="mt-4">
            <div class="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-2">Overdue tasks by owner</div>
            <div class="space-y-1.5">
              <div v-for="o in ops.taskWorkload.overdueByOwner" :key="o.name" class="flex items-center gap-3">
                <span class="w-28 shrink-0 text-xs text-white/60 text-right truncate">{{ o.name }}</span>
                <div class="flex-1 h-5 rounded-full bg-white/[0.04] overflow-hidden">
                  <div
                    class="h-full rounded-full bg-rose-500/40 flex items-center justify-end pr-2"
                    :style="{ width: Math.max((o.count / (ops.taskWorkload.overdueByOwner[0]?.count || 1)) * 100, 8) + '%' }"
                  >
                    <span class="text-[10px] font-bold text-rose-300 tabular-nums">{{ o.count }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Volume by department (this month vs prev) -->
          <div v-if="ops.taskWorkload.volumeByDept.length > 0" class="mt-5">
            <div class="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-2">Tasks completed by department</div>
            <div class="space-y-2">
              <div v-for="v in ops.taskWorkload.volumeByDept" :key="v.department" class="flex items-center gap-3">
                <span class="w-20 shrink-0 text-xs text-white/60 text-right">{{ v.department }}</span>
                <div class="flex-1 flex gap-1">
                  <div class="h-5 rounded-l-full bg-cyan-500/40 flex items-center justify-end pr-2"
                    :style="{ width: Math.max((v.thisMonth / Math.max(...ops.taskWorkload.volumeByDept.map(d => Math.max(d.thisMonth, d.prevMonth)), 1)) * 50, 4) + '%' }">
                    <span class="text-[10px] font-bold text-cyan-300 tabular-nums">{{ v.thisMonth }}</span>
                  </div>
                  <div class="h-5 rounded-r-full bg-white/[0.06] flex items-center justify-end pr-2"
                    :style="{ width: Math.max((v.prevMonth / Math.max(...ops.taskWorkload.volumeByDept.map(d => Math.max(d.thisMonth, d.prevMonth)), 1)) * 50, 4) + '%' }">
                    <span class="text-[10px] font-bold text-white/30 tabular-nums">{{ v.prevMonth }}</span>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-4 pl-24 text-[10px] text-white/30">
                <span class="flex items-center gap-1"><span class="inline-block h-2 w-4 rounded bg-cyan-500/40"></span> This month</span>
                <span class="flex items-center gap-1"><span class="inline-block h-2 w-4 rounded bg-white/[0.06]"></span> Prev month</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══════════════════════════════════════════════
             7. COMPANIES WITH NO RECENT ACTIVITY
        ═══════════════════════════════════════════════ -->
        <div id="inactive" class="mt-8">
          <div class="flex items-center justify-between">
            <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Inactive Paying Customers</div>
            <div class="flex gap-1 text-[10px]">
              <button
                v-for="opt in [{ key: 'all', label: 'All' }, { key: '14to30', label: '14–30d' }, { key: '30plus', label: '30+d' }] as const"
                :key="opt.key"
                class="rounded-full px-2.5 py-1 font-semibold transition-colors"
                :class="inactiveFilter === opt.key ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'"
                @click="inactiveFilter = opt.key"
              >{{ opt.label }}</button>
            </div>
          </div>

          <!-- Summary pills -->
          <div class="mt-3 flex gap-3">
            <div class="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2">
              <span class="text-[10px] text-amber-300/60 uppercase tracking-wider">14–30 days</span>
              <div class="text-lg font-bold tabular-nums text-amber-400">{{ ops.inactiveCompanies.count14to30 }}</div>
            </div>
            <div class="rounded-lg border border-rose-500/20 bg-rose-500/5 px-4 py-2">
              <span class="text-[10px] text-rose-300/60 uppercase tracking-wider">30+ days</span>
              <div class="text-lg font-bold tabular-nums text-rose-400">{{ ops.inactiveCompanies.count30plus }}</div>
            </div>
          </div>

          <!-- Table -->
          <div v-if="filteredInactive.length > 0" class="mt-3 rounded-lg border border-white/[0.06] overflow-hidden">
            <table class="w-full text-xs">
              <thead><tr class="border-b border-white/[0.06] text-white/40">
                <th class="px-3 py-2 text-left font-medium">Company</th>
                <th class="px-3 py-2 text-left font-medium">Owner</th>
                <th class="px-3 py-2 text-left font-medium">Stage</th>
                <th class="px-3 py-2 text-right font-medium">Last activity</th>
                <th class="px-3 py-2 text-right font-medium">Days inactive</th>
              </tr></thead>
              <tbody>
                <tr v-for="c in filteredInactive.slice(0, 30)" :key="c.companyId" class="border-b border-white/[0.03] last:border-0">
                  <td class="px-3 py-2 text-white/80">{{ c.name }}</td>
                  <td class="px-3 py-2 text-white/60">{{ c.owner }}</td>
                  <td class="px-3 py-2 text-white/40">{{ c.lifecycleStage }}</td>
                  <td class="px-3 py-2 text-right text-white/40">{{ c.lastActivityDate ? new Date(c.lastActivityDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Never' }}</td>
                  <td class="px-3 py-2 text-right tabular-nums font-bold" :class="c.daysInactive >= 30 ? 'text-rose-400' : 'text-amber-400'">{{ c.daysInactive === 999 ? '∞' : c.daysInactive + 'd' }}</td>
                </tr>
              </tbody>
            </table>
            <div v-if="filteredInactive.length > 30" class="px-3 py-2 text-[10px] text-white/30 border-t border-white/[0.04]">
              Showing 30 of {{ filteredInactive.length }} — export for full list
            </div>
          </div>
          <div v-else class="mt-3 text-xs text-white/40">No inactive companies in this range.</div>
        </div>

        <!-- ═══════════════════════════════════════════════
             8. PROCESS EFFICIENCY INDICATORS
        ═══════════════════════════════════════════════ -->
        <div id="process" class="mt-8">
          <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Process Efficiency</div>

          <!-- Stat cards 2×3 grid -->
          <div class="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <div class="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
              <div class="flex items-start justify-between">
                <div class="text-xs text-white/50">MQL → Demo booked</div>
                <SparkLine v-if="ops.processEfficiency.sparklines.mqlToDemo.length > 1" :data="ops.processEfficiency.sparklines.mqlToDemo" color="#34d399" :width="56" :height="20" />
              </div>
              <div class="mt-2 text-2xl font-bold tabular-nums text-white">
                {{ ops.processEfficiency.avgMqlToDemo != null ? ops.processEfficiency.avgMqlToDemo + 'd' : '—' }}
              </div>
              <div class="mt-0.5 text-[10px] text-white/30">Avg days</div>
            </div>
            <div class="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
              <div class="flex items-start justify-between">
                <div class="text-xs text-white/50">Demo → Deal closed</div>
                <SparkLine v-if="ops.processEfficiency.sparklines.demoToClose.length > 1" :data="ops.processEfficiency.sparklines.demoToClose" color="#818cf8" :width="56" :height="20" />
              </div>
              <div class="mt-2 text-2xl font-bold tabular-nums text-white">
                {{ ops.processEfficiency.avgDemoToClose != null ? ops.processEfficiency.avgDemoToClose + 'd' : '—' }}
              </div>
              <div class="mt-0.5 text-[10px] text-white/30">Avg days</div>
            </div>
            <div class="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
              <div class="text-xs text-white/50">Won → First contact</div>
              <div class="mt-2 text-2xl font-bold tabular-nums text-white">
                {{ ops.processEfficiency.avgWonToFirstContact != null ? ops.processEfficiency.avgWonToFirstContact + 'd' : '—' }}
              </div>
              <div class="mt-0.5 text-[10px] text-white/30">Avg days</div>
            </div>
            <div class="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
              <div class="flex items-start justify-between">
                <div class="text-xs text-white/50">Meeting no-show rate</div>
                <SparkLine v-if="ops.processEfficiency.sparklines.noShowRate.length > 1" :data="ops.processEfficiency.sparklines.noShowRate" color="#f472b6" :width="56" :height="20" />
              </div>
              <div class="mt-2 text-2xl font-bold tabular-nums" :class="(ops.processEfficiency.meetingNoShowRate ?? 0) > 15 ? 'text-rose-400' : 'text-white'">
                {{ ops.processEfficiency.meetingNoShowRate != null ? ops.processEfficiency.meetingNoShowRate + '%' : '—' }}
              </div>
              <div v-if="ops.processEfficiency.meetingNoShowRatePrev != null" class="mt-0.5 text-[10px] text-white/30">
                Prev: {{ ops.processEfficiency.meetingNoShowRatePrev }}%
              </div>
            </div>
            <!-- Task completion rate by dept -->
            <div class="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 col-span-2">
              <div class="text-xs text-white/50 mb-3">Task completion rate by department</div>
              <div class="space-y-2">
                <div v-for="d in ops.processEfficiency.taskCompletionRateByDept" :key="d.department" class="flex items-center gap-3">
                  <span class="w-20 shrink-0 text-xs text-white/60 text-right">{{ d.department }}</span>
                  <div class="flex-1 h-4 rounded-full bg-white/[0.04] overflow-hidden">
                    <div
                      class="h-full rounded-full transition-all"
                      :class="d.rate >= 70 ? 'bg-emerald-500/50' : d.rate >= 40 ? 'bg-amber-500/40' : 'bg-rose-500/40'"
                      :style="{ width: Math.max(d.rate, 2) + '%' }"
                    />
                  </div>
                  <span class="w-10 text-right text-xs font-bold tabular-nums" :class="d.rate >= 70 ? 'text-emerald-400' : d.rate >= 40 ? 'text-amber-400' : 'text-rose-400'">{{ d.rate }}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </template>
    </div>
  </div>
</template>