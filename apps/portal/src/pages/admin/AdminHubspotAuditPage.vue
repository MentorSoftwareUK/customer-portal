<script setup lang="ts">
import { ref } from 'vue'
import { runFormCorruptionAudit, type FormCorruptionMatch, type FormCorruptionAuditResult } from '../../lib/api'

const loading = ref(false)
const error = ref<string | null>(null)
const result = ref<FormCorruptionAuditResult | null>(null)

async function runScan() {
  loading.value = true
  error.value = null
  result.value = null
  try {
    result.value = await runFormCorruptionAudit()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unknown error'
  } finally {
    loading.value = false
  }
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function exportCsv() {
  if (!result.value?.results.length) return

  const headers = [
    'Contact ID',
    'HubSpot URL',
    'Current Email',
    'Previous Email',
    'Additional Emails',
    'First Name Before',
    'First Name After',
    'Last Name (unchanged)',
    'Change Timestamp',
    'Source Type',
    'Source ID',
  ]

  const rows = result.value.results.map((r: FormCorruptionMatch) => [
    r.contactId,
    r.hubspotUrl,
    r.currentEmail,
    r.previousEmail,
    r.additionalEmails,
    r.firstNameBefore,
    r.firstNameAfter,
    r.currentLastName,
    r.changeTimestamp,
    r.sourceType,
    r.sourceId ?? '',
  ])

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `hubspot-form-corruption-audit-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="rounded-2xl bg-[#14192d] text-white p-6 shadow-lg">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 class="text-xl font-semibold">HubSpot Form Contact Audit</h1>
          <p class="mt-1 text-sm text-white/60 max-w-2xl">
            Detects contacts where a form submission caused a name + email change corruption: the
            primary email was updated, the old email moved to <code class="text-pink-300 text-xs">hs_additional_emails</code>,
            and <code class="text-pink-300 text-xs">firstname</code> was changed while
            <code class="text-pink-300 text-xs">lastname</code> remained the same.
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <span class="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
              ✦ lastname unchanged
            </span>
            <span class="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
              ✦ firstname changed
            </span>
            <span class="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
              ✦ email changed
            </span>
            <span class="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
              ✦ old email in hs_additional_emails
            </span>
            <span class="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
              ✦ triggered by form submission
            </span>
          </div>
        </div>
        <div class="flex shrink-0 gap-3">
          <button
            v-if="result?.results.length"
            type="button"
            class="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/10 transition"
            @click="exportCsv"
          >
            <svg class="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
          <button
            type="button"
            class="inline-flex items-center rounded-lg bg-[#e7007e] px-5 py-2 text-sm font-semibold text-white hover:bg-[#c8006c] transition disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="loading"
            @click="runScan"
          >
            <svg
              v-if="loading"
              class="mr-2 h-4 w-4 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <svg v-else class="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
            </svg>
            {{ loading ? 'Scanning\u2026' : 'Run scan' }}
          </button>
        </div>
      </div>

      <!-- Scan stats -->
      <div v-if="result" class="mt-5 grid grid-cols-3 gap-3">
        <div class="rounded-xl border border-white/10 bg-white/5 p-4">
          <div class="text-xs font-semibold uppercase tracking-wide text-white/40">Contacts scanned</div>
          <div class="mt-1.5 text-2xl font-semibold text-white">{{ result.scanned.toLocaleString() }}</div>
        </div>
        <div class="rounded-xl border border-white/10 bg-white/5 p-4">
          <div class="text-xs font-semibold uppercase tracking-wide text-white/40">Matches found</div>
          <div class="mt-1.5 text-2xl font-semibold" :class="result.matched > 0 ? 'text-rose-300' : 'text-emerald-300'">{{ result.matched.toLocaleString() }}</div>
        </div>
        <div class="rounded-xl border border-white/10 bg-white/5 p-4">
          <div class="text-xs font-semibold uppercase tracking-wide text-white/40">Scan status</div>
          <div class="mt-1.5 text-sm font-semibold" :class="result.truncated ? 'text-amber-300' : 'text-emerald-300'">
            {{ result.truncated ? 'Truncated (5,000 limit)' : 'Complete' }}
          </div>
        </div>
      </div>

      <div v-if="result?.truncated" class="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
        ⚠ Scan was capped at 5,000 contacts. Re-run to check subsequent pages, or export to track progress.
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="rounded-xl border border-rose-500/30 bg-rose-50 p-4 text-sm text-rose-700">
      <strong>Error:</strong> {{ error }}
    </div>

    <!-- Loading placeholder -->
    <div v-if="loading" class="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm">
      <div class="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[#e7007e] border-t-transparent"></div>
      <p class="text-sm text-gray-500">Scanning all contacts and checking property history&hellip;</p>
      <p class="mt-1 text-xs text-gray-400">This may take 30–60 seconds for large databases. All contacts are checked, not just those with additional emails currently set.</p>
    </div>

    <!-- No results -->
    <div
      v-else-if="result && result.results.length === 0"
      class="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm"
    >
      <div class="text-4xl mb-3">✅</div>
      <p class="text-base font-semibold text-gray-700">No matches found</p>
      <p class="mt-1 text-sm text-gray-400">
        None of the {{ result.scanned.toLocaleString() }} contacts scanned matched the form corruption pattern.
      </p>
    </div>

    <!-- Results table -->
    <div v-else-if="result && result.results.length > 0" class="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <div>
          <h2 class="text-sm font-semibold text-gray-900">Affected contacts</h2>
          <p class="text-xs text-gray-400 mt-0.5">{{ result.results.length }} contact{{ result.results.length === 1 ? '' : 's' }} match the pattern</p>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-100 text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Contact</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Email change</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Name change</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Last name</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Changed</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Source</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 bg-white">
            <tr v-for="row in result.results" :key="row.contactId" class="hover:bg-gray-50 transition">
              <!-- Contact -->
              <td class="px-4 py-3">
                <div class="font-medium text-gray-900">{{ row.currentFirstName }} {{ row.currentLastName }}</div>
                <div class="text-xs text-gray-400">ID: {{ row.contactId }}</div>
              </td>

              <!-- Email change -->
              <td class="px-4 py-3">
                <div class="text-xs">
                  <span class="block text-gray-400 line-through">{{ row.previousEmail }}</span>
                  <span class="block font-medium text-gray-800">{{ row.currentEmail }}</span>
                </div>
              </td>

              <!-- Name change -->
              <td class="px-4 py-3">
                <div class="text-xs">
                  <span class="block text-gray-400 line-through">{{ row.firstNameBefore || '—' }}</span>
                  <span class="block font-medium text-gray-800">{{ row.firstNameAfter || '—' }}</span>
                </div>
              </td>

              <!-- Last name (unchanged) -->
              <td class="px-4 py-3">
                <span class="text-sm text-gray-600">{{ row.currentLastName || '—' }}</span>
              </td>

              <!-- Timestamp -->
              <td class="px-4 py-3 whitespace-nowrap">
                <span class="text-xs text-gray-600">{{ formatDate(row.changeTimestamp) }}</span>
              </td>

              <!-- Source -->
              <td class="px-4 py-3">
                <span
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="{
                    'bg-orange-100 text-orange-700': row.sourceType === 'FORM',
                    'bg-gray-100 text-gray-600': row.sourceType !== 'FORM',
                  }"
                >
                  {{ row.sourceType }}
                </span>
                <div v-if="row.sourceId" class="mt-0.5 text-xs text-gray-400 truncate max-w-[120px]" :title="row.sourceId">
                  {{ row.sourceId }}
                </div>
              </td>

              <!-- Actions -->
              <td class="px-4 py-3 text-right">
                <a
                  :href="row.hubspotUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition"
                >
                  Open in HubSpot
                  <svg class="ml-1 h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Pre-scan state -->
    <div
      v-else-if="!loading && !result"
      class="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center"
    >
      <div class="text-4xl mb-3">🔍</div>
      <p class="text-base font-semibold text-gray-700">Ready to scan</p>
      <p class="mt-1 text-sm text-gray-400 max-w-sm mx-auto">
        Click <strong>Run scan</strong> to query HubSpot and identify contacts affected by the
        form submission email/name corruption pattern.
      </p>
    </div>
  </div>
</template>
