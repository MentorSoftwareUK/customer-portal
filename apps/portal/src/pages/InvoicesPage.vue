<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { listInvoices, type InvoiceDto } from '../lib/api'
import { useFeatureFlags } from '../lib/featureFlags'
import PageHeader from '../components/PageHeader.vue'

const invoices = ref<InvoiceDto[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const warning = ref<string | null>(null)
const query = ref('')
const statusFilter = ref<'all' | 'outstanding' | 'overdue' | 'paid'>('all')
const router = useRouter()
const { featureFlags, loadFeatureFlags } = useFeatureFlags()

function formatGbp(amount: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount)
}

const overdueInvoices = computed(() => invoices.value.filter((i) => i.status === 'Overdue'))
const outstandingInvoices = computed(() => invoices.value.filter((i) => i.status !== 'Paid'))

const filteredInvoices = computed(() => {
  const q = query.value.trim().toLowerCase()
  return invoices.value.filter((invoice) => {
    const matchesQuery = !q || invoice.number.toLowerCase().includes(q)
    const matchesStatus =
      statusFilter.value === 'all' ||
      (statusFilter.value === 'paid' && invoice.status === 'Paid') ||
      (statusFilter.value === 'overdue' && invoice.status === 'Overdue') ||
      (statusFilter.value === 'outstanding' && invoice.status !== 'Paid')
    return matchesQuery && matchesStatus
  })
})

const headerMeta = computed(() => {
  if (loading.value) return 'Loading…'
  const total = invoices.value.length
  const outstanding = outstandingInvoices.value.length
  const overdue = overdueInvoices.value.length

  const parts: string[] = [`${total} invoice${total === 1 ? '' : 's'}`]
  if (overdue > 0) parts.push(`${overdue} overdue`)
  else if (outstanding > 0) parts.push(`${outstanding} outstanding`)
  return parts.join(' · ')
})

function statusPillClasses(status: InvoiceDto['status']) {
  if (status === 'Paid') return 'ui-pill-success'
  if (status === 'Overdue') return 'ui-pill-danger'
  return 'ui-pill-warning'
}

async function refreshInvoices() {
  loading.value = true
  error.value = null
  warning.value = null
  try {
    const data = await listInvoices()
    invoices.value = data.invoices
    warning.value = data.warning ?? null
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load invoices'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadFeatureFlags()
  if (!featureFlags.value.invoicesEnabled) {
    loading.value = false
    router.replace('/app/dashboard')
    return
  }

  await refreshInvoices()
})
</script>

<template>
  <div class="space-y-6">
    <PageHeader
      title="Invoices"
      subtitle="Download receipts and invoices."
      :meta="headerMeta"
    >
      <template #actions>
        <button
          type="button"
          class="ui-btn-secondary"
          :disabled="loading"
          @click="refreshInvoices"
        >
          Refresh
        </button>
      </template>
    </PageHeader>

    <div class="ui-surface relative shadow-md sm:rounded-lg overflow-hidden">
      <div v-if="error" class="border-b border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {{ error }}
      </div>

      <div v-else-if="warning" class="border-b border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        {{ warning }}
      </div>

      <div
        v-if="!loading && !error && overdueInvoices.length"
        class="border-b border-rose-200 bg-rose-100 p-4 text-sm text-rose-950 border-l-4 border-l-rose-600"
      >
        <div class="font-semibold">Action required: overdue invoice{{ overdueInvoices.length === 1 ? '' : 's' }}</div>
        <div class="mt-1 text-rose-950/80">
          Please arrange payment as soon as possible. Outstanding invoices may affect service and support.
        </div>
      </div>

      <div
        v-else-if="!loading && !error && outstandingInvoices.length"
        class="border-b border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
      >
        <div class="font-semibold">Payment outstanding</div>
        <div class="mt-1 text-amber-950/80">
          You have {{ outstandingInvoices.length }} unpaid invoice{{ outstandingInvoices.length === 1 ? '' : 's' }}.
        </div>
      </div>

      <div class="flex flex-col md:flex-row items-center justify-between space-y-3 md:space-y-0 md:space-x-4 p-4">
        <div class="w-full md:w-1/2">
          <form class="flex items-center" @submit.prevent>
            <label for="invoice-search" class="sr-only">Search</label>
            <div class="relative w-full">
              <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <svg aria-hidden="true" class="w-5 h-5 text-gray-500 dark:text-gray-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                  <path
                    fill-rule="evenodd"
                    d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                    clip-rule="evenodd"
                  />
                </svg>
              </div>
              <input
                id="invoice-search"
                v-model="query"
                type="text"
                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block w-full pl-10 p-2 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-primary-500 dark:focus:border-primary-500"
                placeholder="Search invoices"
              >
            </div>
          </form>
        </div>

        <div class="w-full md:w-auto flex flex-col md:flex-row space-y-2 md:space-y-0 items-stretch md:items-center justify-end md:space-x-3 flex-shrink-0">
          <div class="w-full md:w-56">
            <label class="sr-only" for="invoice-status">Status</label>
            <select
              id="invoice-status"
              v-model="statusFilter"
              class="w-full md:w-auto bg-white border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
            >
              <option value="all">All</option>
              <option value="outstanding">Outstanding</option>
              <option value="overdue">Overdue</option>
              <option value="paid">Paid</option>
            </select>
          </div>
        </div>
      </div>

        <div class="overflow-x-auto">
          <table class="ui-table">
            <thead>
              <tr>
                <th scope="col" class="px-4 py-3">Invoice</th>
                <th scope="col" class="px-4 py-3">Date</th>
                <th scope="col" class="px-4 py-3">Status</th>
                <th scope="col" class="px-4 py-3">Amount</th>
                <th scope="col" class="px-4 py-3">Download</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading" v-for="i in 5" :key="i" class="border-b dark:border-gray-700">
                <td class="px-4 py-3" colspan="5">
                  <div role="status" class="flex items-center gap-3 animate-pulse">
                    <div class="h-4 w-24 rounded-full bg-gray-200 dark:bg-gray-700"></div>
                    <div class="h-4 w-20 rounded-full bg-gray-200 dark:bg-gray-700"></div>
                    <div class="h-4 w-16 rounded-full bg-gray-200 dark:bg-gray-700"></div>
                    <div class="h-4 w-20 rounded-full bg-gray-200 dark:bg-gray-700"></div>
                    <div class="h-4 w-10 rounded-full bg-gray-200 dark:bg-gray-700"></div>
                    <span class="sr-only">Loading...</span>
                  </div>
                </td>
              </tr>

              <tr v-else-if="!filteredInvoices.length" class="border-b dark:border-gray-700">
                <td class="px-4 py-3" colspan="5">No invoices found.</td>
              </tr>

              <tr v-for="invoice in filteredInvoices" :key="invoice.id" class="border-b dark:border-gray-700">
                <th scope="row" class="px-4 py-3 font-medium text-gray-900 whitespace-nowrap dark:text-white">{{ invoice.number }}</th>
                <td class="px-4 py-3">{{ invoice.date }}</td>
                <td class="px-4 py-3">
                  <span class="ui-pill" :class="statusPillClasses(invoice.status)">
                    <span class="ui-pill-dot" aria-hidden="true" />
                    {{ invoice.status === 'Unpaid' ? 'Outstanding' : invoice.status }}
                  </span>
                </td>
                <td class="px-4 py-3">{{ formatGbp(invoice.amountGbp) }}</td>
                <td class="px-4 py-3">
                  <a v-if="invoice.pdfUrl" class="hover:underline" :href="invoice.pdfUrl" target="_blank" rel="noreferrer">PDF</a>
                  <span v-else class="text-gray-400">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <nav class="flex flex-col md:flex-row justify-between items-start md:items-center space-y-3 md:space-y-0 p-4" aria-label="Table navigation">
          <span class="text-sm font-normal text-gray-500 dark:text-gray-400">
            Showing
            <span class="font-semibold text-gray-900 dark:text-white">{{ filteredInvoices.length ? 1 : 0 }}-{{ filteredInvoices.length }}</span>
            of
            <span class="font-semibold text-gray-900 dark:text-white">{{ filteredInvoices.length }}</span>
          </span>
          <ul class="inline-flex items-stretch -space-x-px">
            <li>
              <a
                href="#"
                class="flex items-center justify-center h-full py-1.5 px-3 ml-0 rounded-l-lg border border-white/10 bg-white/10 text-white/70 hover:bg-white/15 hover:text-white focus:outline-none focus:ring-4 focus:ring-white/10"
              >
                <span class="sr-only">Previous</span>
                <svg class="w-5 h-5" aria-hidden="true" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                  <path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
              </a>
            </li>
            <li>
              <a
                href="#"
                aria-current="page"
                class="flex items-center justify-center text-sm z-10 py-2 px-3 leading-tight rounded border border-white/10 bg-white/10 text-white font-semibold hover:bg-white/15 focus:outline-none focus:ring-4 focus:ring-white/10"
              >
                1
              </a>
            </li>
            <li>
              <a
                href="#"
                class="flex items-center justify-center h-full py-1.5 px-3 rounded-r-lg border border-white/10 bg-white/10 text-white/70 hover:bg-white/15 hover:text-white focus:outline-none focus:ring-4 focus:ring-white/10"
              >
                <span class="sr-only">Next</span>
                <svg class="w-5 h-5" aria-hidden="true" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                  <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                </svg>
              </a>
            </li>
          </ul>
        </nav>

      </div>
  </div>
</template>
