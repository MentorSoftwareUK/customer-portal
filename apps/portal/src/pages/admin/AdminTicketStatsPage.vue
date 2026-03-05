<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { adminGetTicketStats, type AdminTicketStats } from '../../lib/api'

const loading = ref(true)
const error = ref<string | null>(null)
const stats = ref<AdminTicketStats | null>(null)

function formatDuration(ms: number | null) {
  if (ms === null || ms === undefined) return '—'
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return '<1m'
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await adminGetTicketStats()
    stats.value = res.stats
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load ticket stats'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-2">
      <p class="text-xs uppercase tracking-[0.08em] text-gray-600">Control center</p>
      <h2 class="text-2xl font-semibold text-gray-900">Support ticket stats</h2>
      <p class="text-sm text-gray-700">Overview of support ticket volume, response performance, and category breakdown.</p>
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
      </div>

      <div v-if="loading" class="mt-6 text-sm text-white/60">Loading ticket stats…</div>

      <div v-else-if="error" class="mt-6 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
        {{ error }}
      </div>

      <template v-else-if="stats">
        <div class="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div class="rounded-xl border border-white/10 bg-white/5 p-4">
            <div class="text-xs font-semibold uppercase tracking-wide text-white/50">Live customer tickets</div>
            <div class="mt-2 text-2xl font-semibold text-white">{{ stats.liveCustomerTicketCount }}</div>
            <p class="mt-1 text-xs text-white/40">Tickets from live / active customers</p>
          </div>

          <div class="rounded-xl border border-white/10 bg-white/5 p-4">
            <div class="text-xs font-semibold uppercase tracking-wide text-white/50">Active tickets</div>
            <div class="mt-2 text-2xl font-semibold text-white">{{ stats.activeTicketCount }}</div>
            <p class="mt-1 text-xs text-white/40">Open or pending tickets</p>
          </div>

          <div class="rounded-xl border border-white/10 bg-white/5 p-4">
            <div class="text-xs font-semibold uppercase tracking-wide text-white/50">Avg response time</div>
            <div class="mt-2 text-2xl font-semibold text-white">{{ formatDuration(stats.avgResponseTimeMs) }}</div>
            <p class="mt-1 text-xs text-white/40">Time to first agent reply</p>
          </div>

          <div class="rounded-xl border border-white/10 bg-white/5 p-4">
            <div class="text-xs font-semibold uppercase tracking-wide text-white/50">Ticket types</div>
            <div class="mt-2 text-2xl font-semibold text-white">{{ stats.ticketTypeVolume.length }}</div>
            <p class="mt-1 text-xs text-white/40">Distinct categories</p>
          </div>
        </div>

        <!-- Ticket type breakdown -->
        <div class="mt-6">
          <div class="rounded-xl border border-white/10 bg-white/5">
            <div class="border-b border-white/10 px-5 py-3">
              <div class="text-sm font-semibold text-white">Ticket types &amp; volume</div>
              <div class="text-xs text-white/50">Breakdown by category</div>
            </div>

            <div v-if="stats.ticketTypeVolume.length === 0" class="px-5 py-4 text-sm text-white/50">
              No ticket categories found.
            </div>

            <table v-else class="w-full text-left text-sm text-white/70">
              <thead class="bg-white/5 text-xs uppercase tracking-wide text-white/50">
                <tr>
                  <th class="px-5 py-3">Category</th>
                  <th class="px-5 py-3 text-right">Count</th>
                  <th class="px-5 py-3">Distribution</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in stats.ticketTypeVolume"
                  :key="item.type"
                  class="border-t border-white/10 hover:bg-white/5"
                >
                  <td class="px-5 py-3 font-medium text-white">{{ item.type }}</td>
                  <td class="px-5 py-3 text-right tabular-nums">{{ item.count }}</td>
                  <td class="px-5 py-3">
                    <div class="flex items-center gap-2">
                      <div class="h-2 w-full max-w-[120px] overflow-hidden rounded-full bg-white/10">
                        <div
                          class="h-full rounded-full bg-indigo-500"
                          :style="{
                            width:
                              stats && stats.ticketTypeVolume.length > 0 && stats.ticketTypeVolume[0]
                                ? Math.max(4, (item.count / stats.ticketTypeVolume[0].count) * 100) + '%'
                                : '0%',
                          }"
                        ></div>
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
