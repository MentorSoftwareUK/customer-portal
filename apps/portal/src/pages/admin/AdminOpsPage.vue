<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import SparkLine from '../../components/SparkLine.vue'
import DashboardSubNav from '../../components/DashboardSubNav.vue'
import { adminGetOps, type OpsStats } from '../../lib/api'
import { pctDelta, relativeDate } from '../../lib/dashboard-helpers'

/* ── Month picker ── */
const now = new Date()
const selectedMonth = ref((() => {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
})())

const monthOptions = computed(() => {
  const opts: { value: string; label: string }[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    opts.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    })
  }
  return opts
})

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

/* ── KPI cards ── */
const kpiCards = computed(() => {
  if (!ops.value) return []
  const o = ops.value
  return [
    {
      label: 'Tasks Completed',
      val: o.tasksCompletedThisMonth.toString(),
      delta: pctDelta(o.tasksCompletedThisMonth, o.tasksCompletedPrev),
      suffix: '%',
      spark: o.kpiSpark.tasksCompleted,
      color: '#34d399',
      sub: `${o.openTasks} open · ${o.overdueTasks} overdue`,
    },
    {
      label: 'Open Tasks',
      val: o.openTasks.toString(),
      delta: { value: o.overdueTasks, dir: o.overdueTasks > 0 ? 'up' as const : 'flat' as const },
      suffix: ' overdue',
      spark: [],
      color: '#fbbf24',
      sub: o.overdueTasks > 0 ? `${o.overdueTasks} past due date` : 'All on track',
      lowerIsBetter: true,
    },
    {
      label: 'Avg Task Time',
      val: `${o.avgTaskCompletionDays}d`,
      delta: {
        value: Math.abs(Math.round((o.avgTaskCompletionDays - o.avgTaskCompletionDaysPrev) * 10) / 10),
        dir: o.avgTaskCompletionDays > o.avgTaskCompletionDaysPrev
          ? 'up' as const
          : o.avgTaskCompletionDays < o.avgTaskCompletionDaysPrev
            ? 'down' as const
            : 'flat' as const,
      },
      suffix: 'd',
      spark: [],
      color: '#f472b6',
      sub: 'Days to complete',
      lowerIsBetter: true,
    },
    {
      label: 'Calls Logged',
      val: o.callsThisMonth.toString(),
      delta: pctDelta(o.callsThisMonth, o.callsPrev),
      suffix: '%',
      spark: o.kpiSpark.calls,
      color: '#818cf8',
      sub: 'This month',
    },
    {
      label: 'Emails Logged',
      val: o.emailsThisMonth.toString(),
      delta: pctDelta(o.emailsThisMonth, o.emailsPrev),
      suffix: '%',
      spark: o.kpiSpark.emails,
      color: '#38bdf8',
      sub: 'This month',
    },
    {
      label: 'Notes Created',
      val: o.notesThisMonth.toString(),
      delta: pctDelta(o.notesThisMonth, o.notesPrev),
      suffix: '%',
      spark: o.kpiSpark.notes,
      color: '#a855f7',
      sub: 'This month',
    },
  ]
})

/* ── Team activity total for bar widths ── */
const maxTeamTotal = computed(() => {
  if (!ops.value) return 1
  return Math.max(...ops.value.teamActivity.map((t) => t.tasks + t.calls + t.emails + t.notes), 1)
})

/* ── Activity-type icon/color mapping ── */
const activityMeta: Record<string, { icon: string; color: string; bg: string }> = {
  task: { icon: '✓', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  call: { icon: '📞', color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
  email: { icon: '✉', color: 'text-sky-400', bg: 'bg-sky-500/10' },
  note: { icon: '📝', color: 'text-purple-400', bg: 'bg-purple-500/10' },
}

/* ── Data quality severity ── */
function dqSeverity(count: number): string {
  if (count === 0) return 'text-emerald-400'
  if (count < 10) return 'text-amber-400'
  return 'text-rose-400'
}

watch(selectedMonth, () => void loadOps())
onMounted(() => void loadOps())
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-2">
      <p class="text-xs uppercase tracking-[0.08em] text-gray-600">Analytics</p>
      <h2 class="text-2xl font-semibold text-gray-900">Ops</h2>
      <p class="text-sm text-gray-700">Team activity, task management, and data quality.</p>
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
        <!-- ═══ Hero KPI cards ═══ -->
        <div class="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <div
            v-for="card in kpiCards"
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
              <span v-if="card.delta.dir !== 'flat' && card.suffix === '%'" class="text-xs text-white/50">vs prev</span>
            </div>
            <div class="mt-1 text-xs text-white/50">{{ card.sub }}</div>
          </div>
        </div>

        <!-- ═══ Team Activity Breakdown ═══ -->
        <div v-if="ops.teamActivity.length > 0" class="mt-8">
          <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Team activity</div>
          <div class="mt-3 overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead>
                <tr class="border-b border-white/[0.06]">
                  <th class="pb-2 pr-4 font-semibold text-white/60">Team member</th>
                  <th class="pb-2 pr-4 text-center font-semibold text-white/60">Tasks</th>
                  <th class="pb-2 pr-4 text-center font-semibold text-white/60">Calls</th>
                  <th class="pb-2 pr-4 text-center font-semibold text-white/60">Emails</th>
                  <th class="pb-2 pr-4 text-center font-semibold text-white/60">Notes</th>
                  <th class="pb-2 font-semibold text-white/60">Activity</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="member in ops.teamActivity"
                  :key="member.ownerId"
                  class="border-b border-white/[0.03] last:border-0"
                >
                  <td class="py-2.5 pr-4 text-white/80 font-medium">{{ member.name }}</td>
                  <td class="py-2.5 pr-4 text-center tabular-nums text-emerald-400">{{ member.tasks }}</td>
                  <td class="py-2.5 pr-4 text-center tabular-nums text-indigo-400">{{ member.calls }}</td>
                  <td class="py-2.5 pr-4 text-center tabular-nums text-sky-400">{{ member.emails }}</td>
                  <td class="py-2.5 pr-4 text-center tabular-nums text-purple-400">{{ member.notes }}</td>
                  <td class="py-2.5">
                    <div class="flex h-4 overflow-hidden rounded-full bg-white/[0.04]">
                      <div
                        class="h-full bg-emerald-500/50"
                        :style="{ width: (member.tasks / maxTeamTotal * 100) + '%' }"
                        :title="`${member.tasks} tasks`"
                      />
                      <div
                        class="h-full bg-indigo-500/50"
                        :style="{ width: (member.calls / maxTeamTotal * 100) + '%' }"
                        :title="`${member.calls} calls`"
                      />
                      <div
                        class="h-full bg-sky-500/50"
                        :style="{ width: (member.emails / maxTeamTotal * 100) + '%' }"
                        :title="`${member.emails} emails`"
                      />
                      <div
                        class="h-full bg-purple-500/50"
                        :style="{ width: (member.notes / maxTeamTotal * 100) + '%' }"
                        :title="`${member.notes} notes`"
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ═══ Data Quality ═══ -->
        <div class="mt-8">
          <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Data quality</div>
          <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div class="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
              <div class="text-xs text-white/50">Companies missing owner</div>
              <div class="mt-1 text-xl font-bold tabular-nums" :class="dqSeverity(ops.dataQuality.companiesMissingOwner)">{{ ops.dataQuality.companiesMissingOwner }}</div>
            </div>
            <div class="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
              <div class="text-xs text-white/50">Companies missing industry</div>
              <div class="mt-1 text-xl font-bold tabular-nums" :class="dqSeverity(ops.dataQuality.companiesMissingIndustry)">{{ ops.dataQuality.companiesMissingIndustry }}</div>
            </div>
            <div class="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
              <div class="text-xs text-white/50">Deals missing amount</div>
              <div class="mt-1 text-xl font-bold tabular-nums" :class="dqSeverity(ops.dataQuality.dealsMissingAmount)">{{ ops.dataQuality.dealsMissingAmount }}</div>
            </div>
            <div class="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
              <div class="text-xs text-white/50">Deals missing close date</div>
              <div class="mt-1 text-xl font-bold tabular-nums" :class="dqSeverity(ops.dataQuality.dealsMissingCloseDate)">{{ ops.dataQuality.dealsMissingCloseDate }}</div>
            </div>
            <div class="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
              <div class="text-xs text-white/50">Contacts missing email</div>
              <div class="mt-1 text-xl font-bold tabular-nums" :class="dqSeverity(ops.dataQuality.contactsMissingEmail)">{{ ops.dataQuality.contactsMissingEmail }}</div>
            </div>
          </div>
        </div>

        <!-- ═══ Sequences (placeholder) ═══ -->
        <div v-if="ops.sequences && !ops.sequences.available" class="mt-8 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Sequences & Automation</div>
          <div class="mt-3 flex items-start gap-3">
            <div class="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
              <svg class="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <div>
              <div class="text-sm font-medium text-white/80">Not available with current plan</div>
              <div class="mt-1 text-xs text-white/50">{{ ops.sequences.note }}</div>
            </div>
          </div>
        </div>

        <!-- ═══ Recent Activity Feed ═══ -->
        <div v-if="ops.recentActivity.length > 0" class="mt-8">
          <div class="text-xs font-semibold uppercase tracking-wider text-white/60">Recent activity</div>
          <div class="mt-3 space-y-1">
            <div
              v-for="(act, i) in ops.recentActivity"
              :key="i"
              class="flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-white/[0.02]"
            >
              <div class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs" :class="activityMeta[act.type]?.bg ?? 'bg-white/5'">
                <span :class="activityMeta[act.type]?.color ?? 'text-white/50'">{{ activityMeta[act.type]?.icon ?? '?' }}</span>
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-baseline justify-between gap-2">
                  <span class="truncate text-sm text-white/80">{{ act.subject }}</span>
                  <span class="shrink-0 text-xs text-white/40">{{ relativeDate(act.timestamp) }}</span>
                </div>
                <div class="mt-0.5 text-xs text-white/40">{{ act.owner }}</div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
