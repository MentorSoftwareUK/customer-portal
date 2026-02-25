<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { adminGetKbViewMetrics, adminGetTicketMetrics, adminGetUserUsageMetrics, adminListEventReports, type AdminEventReportDto, type AdminTicketMetrics, type KbViewMetric, type UserUsageMetric } from '../../lib/api'

const loading = ref(true)
const loadError = ref<string | null>(null)
const reports = ref<AdminEventReportDto[]>([])
const usageMetrics = ref<UserUsageMetric[]>([])
const kbMetrics = ref<KbViewMetric[]>([])
const ticketMetrics = ref<AdminTicketMetrics | null>(null)
const analyticsLoading = ref(false)
const analyticsError = ref<string | null>(null)

const totals = computed(() => {
  return reports.value.reduce(
    (acc, row) => {
      acc.invited += row.invitedCount ?? 0
      acc.registered += row.registeredCount
      acc.paymentPending += row.paymentPendingCount
      acc.paid += row.paidCount
      acc.cancelled += row.cancelledCount
      acc.failed += row.failedCount
      acc.attended += row.attendedCount
      acc.noShow += row.noShowCount
      acc.totalRegistrations += row.totalRegistrations
      return acc
    },
    {
      invited: 0,
      registered: 0,
      paymentPending: 0,
      paid: 0,
      cancelled: 0,
      failed: 0,
      attended: 0,
      noShow: 0,
      totalRegistrations: 0,
    },
  )
})

const registrationRate = computed(() => {
  if (!totals.value.invited) return 0
  return Math.round((totals.value.registered / totals.value.invited) * 100)
})

const attendanceRate = computed(() => {
  if (!totals.value.registered) return 0
  return Math.round((totals.value.attended / totals.value.registered) * 100)
})

const noShowRate = computed(() => {
  if (!totals.value.registered) return 0
  return Math.round((totals.value.noShow / totals.value.registered) * 100)
})

const paidRate = computed(() => {
  if (!totals.value.registered) return 0
  return Math.round((totals.value.paid / totals.value.registered) * 100)
})

const usageTotals = computed(() => {
  return usageMetrics.value.reduce(
    (acc, row) => {
      acc.sessions += row.sessionsCount
      acc.timeMs += row.totalTimeMs
      acc.pageViews += row.pageViews
      return acc
    },
    { sessions: 0, timeMs: 0, pageViews: 0 },
  )
})

const kbTotals = computed(() => {
  return kbMetrics.value.reduce(
    (acc, row) => {
      acc.views += row.views
      return acc
    },
    { views: 0 },
  )
})

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

const statusBadge = (status: string | null) => {
  switch ((status ?? 'upcoming').toLowerCase()) {
    case 'published':
      return 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30'
    case 'completed':
      return 'bg-sky-500/20 text-sky-200 border-sky-500/30'
    case 'cancelled':
      return 'bg-rose-500/20 text-rose-200 border-rose-500/30'
    case 'draft':
      return 'bg-amber-500/20 text-amber-200 border-amber-500/30'
    case 'upcoming':
      return 'bg-indigo-500/20 text-indigo-200 border-indigo-500/30'
    default:
      return 'bg-white/10 text-white/70 border-white/10'
  }
}

async function load() {
  loading.value = true
  loadError.value = null
  analyticsLoading.value = true
  analyticsError.value = null
  try {
    const [reportsRes, usageRes, kbRes, ticketsRes] = await Promise.allSettled([
      adminListEventReports(),
      adminGetUserUsageMetrics({ days: 30 }),
      adminGetKbViewMetrics({ days: 30 }),
      adminGetTicketMetrics(),
    ])

    if (reportsRes.status === 'fulfilled') {
      reports.value = reportsRes.value
    } else {
      throw reportsRes.reason
    }

    if (usageRes.status === 'fulfilled') {
      usageMetrics.value = usageRes.value.metrics
    } else {
      analyticsError.value = 'Usage analytics unavailable.'
    }

    if (kbRes.status === 'fulfilled') {
      kbMetrics.value = kbRes.value.metrics
    } else {
      analyticsError.value = 'Knowledge base analytics unavailable.'
    }

    if (ticketsRes.status === 'fulfilled') {
      ticketMetrics.value = ticketsRes.value.metrics
    } else {
      analyticsError.value = 'Ticket analytics unavailable.'
    }
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load reports'
  } finally {
    loading.value = false
    analyticsLoading.value = false
  }
}

function exportCsv() {
  const header = [
    'Event',
    'Date',
    'Status',
    'Invited',
    'Registered',
    'Payment pending',
    'Paid',
    'Cancelled',
    'Failed',
    'Attended',
    'No show',
    'Total registrations',
  ]

  const rows = reports.value.map((row) => [
    row.title,
    row.dateLabel,
    row.status ?? 'upcoming',
    row.invitedCount ?? '',
    row.registeredCount,
    row.paymentPendingCount,
    row.paidCount,
    row.cancelledCount,
    row.failedCount,
    row.attendedCount,
    row.noShowCount,
    row.totalRegistrations,
  ])

  const csv = [header, ...rows]
    .map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `admin-event-reports-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-2">
      <p class="text-xs uppercase tracking-[0.08em] text-gray-600">Control center</p>
      <h2 class="text-2xl font-semibold text-gray-900">Reports</h2>
      <p class="text-sm text-gray-700">Event pipeline, attendance, and revenue indicators for campaign planning and customer success.</p>
    </div>
    <div class="rounded-2xl border border-white/10 bg-[#0f1428] p-6 text-white shadow-[0_18px_40px_rgba(15,20,40,0.35)]">
      <div class="flex flex-wrap items-center justify-end gap-2">
          <button
            class="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-white/80 hover:bg-white/10"
            type="button"
            @click="load"
          >
            Refresh
          </button>
          <button
            class="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-white/70 hover:bg-white/10"
            type="button"
            @click="exportCsv"
          >
            Export CSV
          </button>
        </div>

      <div class="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-xl border border-white/10 bg-white/5 p-4">
          <div class="text-xs font-semibold uppercase tracking-wide text-white/50">Sessions (30d)</div>
          <div class="mt-2 text-2xl font-semibold text-white">{{ usageTotals.sessions }}</div>
          <p class="mt-1 text-xs text-white/40">{{ usageTotals.pageViews }} page views</p>
        </div>
        <div class="rounded-xl border border-white/10 bg-white/5 p-4">
          <div class="text-xs font-semibold uppercase tracking-wide text-white/50">Time spent (30d)</div>
          <div class="mt-2 text-2xl font-semibold text-white">{{ formatDuration(usageTotals.timeMs) }}</div>
          <p class="mt-1 text-xs text-white/40">Across all users</p>
        </div>
        <div class="rounded-xl border border-white/10 bg-white/5 p-4">
          <div class="text-xs font-semibold uppercase tracking-wide text-white/50">KB views (30d)</div>
          <div class="mt-2 text-2xl font-semibold text-white">{{ kbTotals.views }}</div>
          <p class="mt-1 text-xs text-white/40">{{ kbMetrics.length }} articles viewed</p>
        </div>
        <div class="rounded-xl border border-white/10 bg-white/5 p-4">
          <div class="text-xs font-semibold uppercase tracking-wide text-white/50">Tickets</div>
          <div class="mt-2 text-2xl font-semibold text-white">{{ ticketMetrics?.total ?? 0 }}</div>
          <p class="mt-1 text-xs text-white/40">
            {{ ticketMetrics?.open ?? 0 }} open • {{ ticketMetrics?.pending ?? 0 }} pending • {{ ticketMetrics?.closed ?? 0 }} closed
          </p>
        </div>
      </div>

      <div v-if="analyticsError" class="mt-4 text-xs text-rose-200">{{ analyticsError }}</div>
      <div v-else-if="analyticsLoading" class="mt-4 text-xs text-white/60">Loading live metrics…</div>

      <div class="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-xl border border-white/10 bg-white/5 p-4">
          <div class="text-xs font-semibold uppercase tracking-wide text-white/50">Invited</div>
          <div class="mt-2 text-2xl font-semibold text-white">{{ totals.invited }}</div>
          <p class="mt-1 text-xs text-white/40">Email sends across all events</p>
        </div>
        <div class="rounded-xl border border-white/10 bg-white/5 p-4">
          <div class="text-xs font-semibold uppercase tracking-wide text-white/50">Registered</div>
          <div class="mt-2 text-2xl font-semibold text-white">{{ totals.registered }}</div>
          <p class="mt-1 text-xs text-white/40">{{ registrationRate }}% of invited converted</p>
        </div>
        <div class="rounded-xl border border-white/10 bg-white/5 p-4">
          <div class="text-xs font-semibold uppercase tracking-wide text-white/50">Attended</div>
          <div class="mt-2 text-2xl font-semibold text-white">{{ totals.attended }}</div>
          <p class="mt-1 text-xs text-white/40">{{ attendanceRate }}% attendance rate</p>
        </div>
        <div class="rounded-xl border border-white/10 bg-white/5 p-4">
          <div class="text-xs font-semibold uppercase tracking-wide text-white/50">No show</div>
          <div class="mt-2 text-2xl font-semibold text-white">{{ totals.noShow }}</div>
          <p class="mt-1 text-xs text-white/40">{{ noShowRate }}% no-show rate</p>
        </div>
        <div class="rounded-xl border border-white/10 bg-white/5 p-4">
          <div class="text-xs font-semibold uppercase tracking-wide text-white/50">Payment pending</div>
          <div class="mt-2 text-2xl font-semibold text-white">{{ totals.paymentPending }}</div>
          <p class="mt-1 text-xs text-white/40">Follow-up queue for success</p>
        </div>
        <div class="rounded-xl border border-white/10 bg-white/5 p-4">
          <div class="text-xs font-semibold uppercase tracking-wide text-white/50">Paid</div>
          <div class="mt-2 text-2xl font-semibold text-white">{{ totals.paid }}</div>
          <p class="mt-1 text-xs text-white/40">{{ paidRate }}% of registrations</p>
        </div>
        <div class="rounded-xl border border-white/10 bg-white/5 p-4">
          <div class="text-xs font-semibold uppercase tracking-wide text-white/50">Cancelled</div>
          <div class="mt-2 text-2xl font-semibold text-white">{{ totals.cancelled }}</div>
          <p class="mt-1 text-xs text-white/40">Churn reasons to review</p>
        </div>
        <div class="rounded-xl border border-white/10 bg-white/5 p-4">
          <div class="text-xs font-semibold uppercase tracking-wide text-white/50">Failed</div>
          <div class="mt-2 text-2xl font-semibold text-white">{{ totals.failed }}</div>
          <p class="mt-1 text-xs text-white/40">Payment issues to resolve</p>
        </div>
      </div>
    </div>

    <div v-if="loadError" class="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
      {{ loadError }}
    </div>

    <div class="rounded-2xl border border-white/10 bg-[#14192d] text-white shadow-[0_18px_40px_rgba(15,20,40,0.2)]">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-5 py-4">
        <div>
          <div class="text-sm font-semibold">Per-event breakdown</div>
          <div class="text-xs text-white/50">Use this to prioritise follow-up and post-event comms.</div>
        </div>
        <div class="text-xs text-white/50">{{ reports.length }} events</div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm text-white/70">
          <thead class="bg-white/5 text-xs uppercase tracking-wide text-white/50">
            <tr>
              <th class="px-4 py-3">Event</th>
              <th class="px-4 py-3">Date</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3">Invited</th>
              <th class="px-4 py-3">Registered</th>
              <th class="px-4 py-3">Attended</th>
              <th class="px-4 py-3">No show</th>
              <th class="px-4 py-3">Paid</th>
              <th class="px-4 py-3">Cancelled</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="9" class="px-4 py-4 text-sm text-white/50">Loading reports…</td>
            </tr>
            <tr v-else-if="reports.length === 0">
              <td colspan="9" class="px-4 py-4 text-sm text-white/50">No events yet.</td>
            </tr>
            <tr
              v-else
              v-for="row in reports"
              :key="row.eventId"
              class="border-t border-white/10 hover:bg-white/5"
            >
              <td class="px-4 py-3 font-medium text-white">{{ row.title }}</td>
              <td class="px-4 py-3">{{ row.dateLabel }}</td>
              <td class="px-4 py-3">
                <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold" :class="statusBadge(row.status)">
                  {{ row.status ?? 'upcoming' }}
                </span>
              </td>
              <td class="px-4 py-3">{{ row.invitedCount ?? '—' }}</td>
              <td class="px-4 py-3">{{ row.registeredCount }}</td>
              <td class="px-4 py-3">{{ row.attendedCount }}</td>
              <td class="px-4 py-3">{{ row.noShowCount }}</td>
              <td class="px-4 py-3">{{ row.paidCount }}</td>
              <td class="px-4 py-3">{{ row.cancelledCount }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
