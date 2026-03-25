<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import DashboardSubNav from '../../components/DashboardSubNav.vue'
import { adminGetOps, type OpsStats } from '../../lib/api'
import { relativeDate } from '../../lib/dashboard-helpers'
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

/* ── At-risk by owner (from inactive companies data) ── */
const inactiveByOwner = computed(() => {
  if (!ops.value) return []
  const map = new Map<string, { count14to30: number; count30plus: number }>()
  for (const c of ops.value.inactiveCompanies.companies) {
    const row = map.get(c.owner) ?? { count14to30: 0, count30plus: 0 }
    if (c.daysInactive >= 30) row.count30plus++
    else row.count14to30++
    map.set(c.owner, row)
  }
  return [...map.entries()]
    .map(([name, counts]) => ({ name, ...counts }))
    .sort((a, b) => (b.count30plus + b.count14to30) - (a.count30plus + a.count14to30))
})

/* ── Workload distribution ── */
const workloadDistribution = computed(() => {
  if (!ops.value) return []
  return ops.value.departments
    .flatMap(d => d.members.map(m => ({
      name: m.name,
      department: d.department,
      openTasks: m.openTasks,
      overdueTasks: m.overdueTasks,
    })))
    .sort((a, b) => b.openTasks - a.openTasks)
})

const avgOpenTasks = computed(() => {
  const list = workloadDistribution.value
  if (list.length === 0) return 0
  return Math.round(list.reduce((s, m) => s + m.openTasks, 0) / list.length * 10) / 10
})

const maxOpenTasks = computed(() => Math.max(...workloadDistribution.value.map(m => m.openTasks), 1))

/* ── Communication channel balance ── */
const channelBalance = computed(() => {
  if (!ops.value) return null
  let totalCalls = 0, totalEmails = 0
  const byDept = new Map<string, { calls: number; emails: number }>()
  for (const d of ops.value.departments) {
    let dCalls = 0, dEmails = 0
    for (const m of d.members) {
      totalCalls += m.calls
      totalEmails += m.emails
      dCalls += m.calls
      dEmails += m.emails
    }
    byDept.set(d.department, { calls: dCalls, emails: dEmails })
  }
  const ratio = totalEmails > 0 ? totalCalls / totalEmails : 0
  return {
    totalCalls,
    totalEmails,
    ratio,
    ratioDisplay: ratio >= 1
      ? `${ratio.toFixed(1)}:1`
      : totalCalls > 0 ? `1:${(totalEmails / totalCalls).toFixed(1)}` : '0:0',
    byDepartment: ops.value.departments
      .map(d => {
        const data = byDept.get(d.department)!
        const dRatio = data.emails > 0 ? data.calls / data.emails : 0
        return {
          department: d.department,
          calls: data.calls,
          emails: data.emails,
          ratio: dRatio,
          ratioDisplay: dRatio >= 1
            ? `${dRatio.toFixed(1)}:1`
            : data.calls > 0 ? `1:${(data.emails / data.calls).toFixed(1)}` : '—',
        }
      })
      .filter(d => d.calls > 0 || d.emails > 0),
  }
})

/* ── Gauge SVG helpers ── */
function gaugeArcPath(startRatio: number, endRatio: number, cx = 100, cy = 100, r = 80): string {
  const maxR = 4
  const startAngle = Math.PI * (1 - Math.min(startRatio / maxR, 1))
  const endAngle = Math.PI * (1 - Math.min(endRatio / maxR, 1))
  const x1 = cx + r * Math.cos(startAngle)
  const y1 = cy - r * Math.sin(startAngle)
  const x2 = cx + r * Math.cos(endAngle)
  const y2 = cy - r * Math.sin(endAngle)
  const largeArc = Math.abs(startAngle - endAngle) > Math.PI ? 1 : 0
  return `M ${x1},${y1} A ${r},${r} 0 ${largeArc} 1 ${x2},${y2}`
}

function gaugePoint(ratio: number, cx = 100, cy = 100, r = 80) {
  const angle = Math.PI * (1 - Math.min(ratio / 4, 1))
  return { x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle) }
}

/* ── Needle animation ── */
const needleAnimated = ref(false)
const needleRotation = computed(() => {
  if (!channelBalance.value || !needleAnimated.value) return -180 // start at far left (0 ratio)
  // Map ratio 0–4 → -180° (left) to 0° (right) through the top of the arc
  const clamped = Math.min(channelBalance.value.ratio / 4, 1)
  return -180 * (1 - clamped)
})

watch(selectedMonth, () => void loadOps())
watch(() => channelBalance.value, (v) => {
  if (v) {
    needleAnimated.value = false
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { needleAnimated.value = true })
    })
  }
})
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
                  <div v-if="dept.department !== 'Retention'"><span class="text-white/50">Meetings </span><span class="font-bold text-teal-400">{{ dept.meetings }}</span></div>
                  <div v-if="dept.department === 'Sales'"><span class="text-white/50">Demos </span><span class="font-bold text-cyan-400">{{ dept.demos }}</span></div>
                  <div v-if="dept.department === 'Support'"><span class="text-white/50">Tickets </span><span class="font-bold text-orange-400">{{ dept.tickets }}</span></div>
                  <div v-if="dept.department === 'Retention'"><span class="text-white/50">Renewals </span><span class="font-bold text-pink-400">{{ dept.meetings }}</span></div>
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
                  <span v-if="dept.department !== 'Retention'" class="text-center">Meetings</span>
                  <span v-if="dept.department === 'Retention'" class="text-center">Renewals</span>
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
                  <span class="text-center tabular-nums" :class="dept.department === 'Retention' ? 'text-pink-400' : 'text-teal-400'">{{ member.meetings }}</span>
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
             4. AT-RISK CUSTOMERS BY OWNER
        ═══════════════════════════════════════════════ -->
        <div id="at-risk-owners" class="mt-8">
          <div class="text-xs font-semibold uppercase tracking-wider text-white/60">At-Risk Customers by Owner</div>

          <div v-if="inactiveByOwner.length > 0" class="mt-3 rounded-lg border border-white/[0.06] overflow-hidden">
            <table class="w-full text-xs">
              <thead><tr class="border-b border-white/[0.06] text-white/40">
                <th class="px-3 py-2 text-left font-medium">Owner</th>
                <th class="px-3 py-2 text-right font-medium">14–30 days</th>
                <th class="px-3 py-2 text-right font-medium">30+ days</th>
              </tr></thead>
              <tbody>
                <tr v-for="o in inactiveByOwner" :key="o.name" class="border-b border-white/[0.03] last:border-0">
                  <td class="px-3 py-2 text-white/80">{{ o.name }}</td>
                  <td class="px-3 py-2 text-right tabular-nums font-bold" :class="o.count14to30 > 0 ? 'text-amber-400' : 'text-white/30'">{{ o.count14to30 }}</td>
                  <td class="px-3 py-2 text-right tabular-nums font-bold" :class="o.count30plus > 0 ? 'text-rose-400' : 'text-white/30'">{{ o.count30plus }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="mt-3 text-xs text-white/40">No inactive customers.</div>
        </div>

        <!-- ═══════════════════════════════════════════════
             5. WORKLOAD DISTRIBUTION
        ═══════════════════════════════════════════════ -->
        <div id="workload" class="mt-8">
          <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Workload Distribution</div>

          <div v-if="workloadDistribution.length > 0" class="mt-3 space-y-1.5">
            <div v-for="m in workloadDistribution" :key="m.name" class="flex items-center gap-3">
              <span class="w-32 shrink-0 text-xs text-white/60 text-right truncate">{{ m.name }}</span>
              <span class="w-16 shrink-0 text-[10px] text-white/30">{{ m.department }}</span>
              <div class="flex-1 h-5 rounded-full bg-white/[0.04] overflow-hidden">
                <div
                  class="h-full rounded-full flex items-center justify-end pr-2"
                  :class="m.overdueTasks >= 6 ? 'bg-rose-500/40' : m.overdueTasks >= 1 ? 'bg-amber-500/30' : 'bg-emerald-500/30'"
                  :style="{ width: Math.max((m.openTasks / maxOpenTasks) * 100, 6) + '%' }"
                >
                  <span class="text-[10px] font-bold tabular-nums text-white/80">{{ m.openTasks }}</span>
                </div>
              </div>
              <span class="w-14 text-right text-[10px] tabular-nums font-bold" :class="m.overdueTasks >= 6 ? 'text-rose-400' : m.overdueTasks >= 1 ? 'text-amber-400' : 'text-white/30'">
                {{ m.overdueTasks }} od
              </span>
            </div>
            <div class="flex items-center gap-3 pt-1.5 border-t border-white/[0.04]">
              <span class="w-32 shrink-0 text-xs text-white/40 text-right">Team avg</span>
              <span class="w-16 shrink-0"></span>
              <div class="flex-1 text-[10px] text-white/30">{{ avgOpenTasks }} open tasks</div>
            </div>
            <div class="flex items-center gap-4 pl-52 text-[10px] text-white/30">
              <span class="flex items-center gap-1"><span class="inline-block h-2 w-4 rounded bg-emerald-500/30"></span> 0 overdue</span>
              <span class="flex items-center gap-1"><span class="inline-block h-2 w-4 rounded bg-amber-500/30"></span> 1–5 overdue</span>
              <span class="flex items-center gap-1"><span class="inline-block h-2 w-4 rounded bg-rose-500/40"></span> 6+ overdue</span>
            </div>
          </div>
        </div>

        <!-- ═══════════════════════════════════════════════
             6. COMMUNICATION CHANNEL BALANCE
        ═══════════════════════════════════════════════ -->
        <div v-if="channelBalance" id="channel-balance" class="mt-8">
          <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Communication Channel Balance</div>

          <div class="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-6">
            <div class="flex flex-col lg:flex-row gap-6">
              <!-- Gauge (1/3) -->
              <div class="lg:w-1/3 flex flex-col items-center justify-center">
                <svg viewBox="0 0 200 115" class="w-full max-w-[220px] h-auto">
                  <!-- Background track -->
                  <path :d="gaugeArcPath(0, 4)" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="16" />
                  <!-- Red zone: ratio 0–0.6 (email heavy) -->
                  <path :d="gaugeArcPath(0, 0.6)" fill="none" stroke="#f43f5e" stroke-width="14" opacity="0.45" />
                  <!-- Amber zone: ratio 0.6–1.5 (transitional) -->
                  <path :d="gaugeArcPath(0.6, 1.5)" fill="none" stroke="#f59e0b" stroke-width="14" opacity="0.4" />
                  <!-- Green zone: ratio 1.5–4.0 (at or near target) -->
                  <path :d="gaugeArcPath(1.5, 4.0)" fill="none" stroke="#10b981" stroke-width="14" opacity="0.4" />
                  <!-- Target marker at 2:1 -->
                  <line :x1="gaugePoint(2.0, 100, 100, 68).x" :y1="gaugePoint(2.0, 100, 100, 68).y"
                        :x2="gaugePoint(2.0, 100, 100, 92).x" :y2="gaugePoint(2.0, 100, 100, 92).y"
                        stroke="#f59e0b" stroke-width="3" stroke-linecap="round" />
                  <!-- Animated needle -->
                  <g :style="{ transform: `rotate(${needleRotation}deg)`, transformOrigin: '100px 100px', transition: needleAnimated ? 'transform 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none' }">
                    <line x1="100" y1="100" x2="170" y2="100" stroke="white" stroke-width="2.5" stroke-linecap="round" />
                  </g>
                  <circle cx="100" cy="100" r="4" fill="white" />
                  <!-- Labels -->
                  <text x="16" y="112" fill="rgba(255,255,255,0.3)" font-size="7" text-anchor="start">Emails</text>
                  <text x="184" y="112" fill="rgba(255,255,255,0.3)" font-size="7" text-anchor="end">Calls</text>
                  <text :x="gaugePoint(2.0, 100, 100, 60).x" :y="gaugePoint(2.0, 100, 100, 60).y - 2" fill="#f59e0b" font-size="7" text-anchor="middle" opacity="0.7">2:1</text>
                </svg>

                <!-- Ratio + totals -->
                <div class="mt-2 text-3xl font-bold tabular-nums text-white">{{ channelBalance.ratioDisplay }}</div>
                <div class="mt-1 flex items-center gap-4 text-xs text-white/50">
                  <span><span class="font-bold text-indigo-400 tabular-nums">{{ channelBalance.totalCalls }}</span> calls</span>
                  <span><span class="font-bold text-sky-400 tabular-nums">{{ channelBalance.totalEmails }}</span> emails</span>
                </div>
                <div class="mt-0.5 text-[10px] text-white/30">Target: 2:1 calls to emails</div>
              </div>

              <!-- Per-department breakdown (2/3) -->
              <div class="lg:w-2/3 flex flex-col justify-center space-y-2">
                <div class="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-2">By department</div>
                <div v-for="d in channelBalance.byDepartment" :key="d.department" class="flex items-center gap-3">
                  <span class="w-20 shrink-0 text-xs text-white/60 text-right">{{ d.department }}</span>
                  <div class="flex-1 h-5 rounded-full bg-white/[0.04] overflow-hidden flex">
                    <div class="h-full bg-indigo-500/50" :style="{ width: (d.calls / Math.max(d.calls + d.emails, 1) * 100) + '%' }" />
                    <div class="h-full bg-sky-500/30" :style="{ width: (d.emails / Math.max(d.calls + d.emails, 1) * 100) + '%' }" />
                  </div>
                  <span class="w-14 text-right text-xs font-bold tabular-nums" :class="d.ratio >= 2 ? 'text-emerald-400' : 'text-rose-400'">
                    {{ d.ratioDisplay }}
                  </span>
                </div>
                <div class="flex items-center gap-4 pl-24 text-[10px] text-white/30">
                  <span class="flex items-center gap-1"><span class="inline-block h-2 w-4 rounded bg-indigo-500/50"></span> Calls</span>
                  <span class="flex items-center gap-1"><span class="inline-block h-2 w-4 rounded bg-sky-500/30"></span> Emails</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </template>
    </div>
  </div>
</template>