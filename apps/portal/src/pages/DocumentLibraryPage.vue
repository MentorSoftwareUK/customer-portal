<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { listDocuments, type DocumentDto } from '../lib/api'
import { provisionFilterLabel, readProvisionFilter, type ProvisionFilter, writeProvisionFilter } from '../lib/provision'
import { productVersionLabel, readProductVersionFilter, type ProductVersionFilter, writeProductVersionFilter } from '../lib/productVersion'

const query = ref('')
const provision = ref<ProvisionFilter>(readProvisionFilter())
watch(provision, (value) => writeProvisionFilter(value))
const productVersion = ref<ProductVersionFilter>(readProductVersionFilter())
watch(productVersion, (value) => writeProductVersionFilter(value))
const documents = ref<DocumentDto[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const warning = ref<string | undefined>(undefined)

onMounted(async () => {
  loading.value = true
  loadError.value = null
  try {
    const data = await listDocuments({ productVersion: productVersion.value })
    documents.value = data.documents
    warning.value = data.warning
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load documents'
  } finally {
    loading.value = false
  }
})

const filteredDocuments = computed(() => {
  const q = query.value.trim().toLowerCase()
  return documents.value.filter((d) => {
    const matchesQuery = !q || d.title.toLowerCase().includes(q)
    const matchesProvision = provision.value === 'all' || d.provision === 'all' || d.provision === provision.value
    const matchesProductVersion =
      productVersion.value === 'all' || d.productVersion === 'all' || d.productVersion === productVersion.value || !d.productVersion
    return matchesQuery && matchesProvision && matchesProductVersion
  })
})

function dropdownButtonId(docId: string) {
  return `${docId}-dropdown-button`
}

function dropdownId(docId: string) {
  return `${docId}-dropdown`
}
</script>

<template>
  <div class="space-y-6">
      <div v-if="loadError" class="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-200">
        {{ loadError }}
      </div>

      <div v-else-if="loading" role="status" class="mb-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 animate-pulse">
        <div class="space-y-3">
          <div class="h-3 w-40 rounded-full bg-gray-200 dark:bg-gray-700" />
          <div class="h-2.5 w-72 rounded-full bg-gray-200 dark:bg-gray-700" />
          <div class="h-2.5 w-64 rounded-full bg-gray-200 dark:bg-gray-700" />
        </div>
        <span class="sr-only">Loading...</span>
      </div>

      <div class="ui-surface relative shadow-md sm:rounded-lg overflow-hidden">
        <div v-if="!loading && !loadError && warning" class="m-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-900/30 dark:bg-amber-900/20 dark:text-amber-200">
          {{ warning }}
        </div>

        <div class="flex flex-col md:flex-row items-center justify-between space-y-3 md:space-y-0 md:space-x-4 p-4">
          <div class="w-full md:w-1/2">
            <form class="flex items-center" @submit.prevent>
              <label for="simple-search" class="sr-only">Search</label>
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
                  id="simple-search"
                  v-model="query"
                  type="text"
                  class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block w-full pl-10 p-2 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-primary-500 dark:focus:border-primary-500"
                  placeholder="Search"
                >
              </div>
            </form>
          </div>

          <div class="w-full md:w-auto flex flex-col md:flex-row space-y-2 md:space-y-0 items-stretch md:items-center justify-end md:space-x-3 flex-shrink-0">
            <div class="w-full md:w-64">
              <label class="sr-only" for="doc-provision">Provision type</label>
              <select
                id="doc-provision"
                v-model="provision"
                class="w-full md:w-auto bg-white border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
              >
                <option value="all">{{ provisionFilterLabel('all') }}</option>
                <option value="supported-accommodation">{{ provisionFilterLabel('supported-accommodation') }}</option>
                <option value="childrens-home">{{ provisionFilterLabel('childrens-home') }}</option>
                <option value="over-18">{{ provisionFilterLabel('over-18') }}</option>
              </select>
            </div>

            <div class="w-full md:w-56">
              <label class="sr-only" for="doc-product-version">Product version</label>
              <select
                id="doc-product-version"
                v-model="productVersion"
                class="w-full md:w-auto bg-white border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
              >
                <option value="all">{{ productVersionLabel('all') }}</option>
                <option value="v2">{{ productVersionLabel('v2') }}</option>
                <option value="v3">{{ productVersionLabel('v3') }}</option>
              </select>
            </div>

            <button type="button" class="ui-btn-primary">
              <svg class="h-3.5 w-3.5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path
                  clip-rule="evenodd"
                  fill-rule="evenodd"
                  d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                />
              </svg>
              Upload
            </button>

            <div class="flex items-center space-x-3 w-full md:w-auto">
              <button
                id="actionsDropdownButton"
                data-dropdown-toggle="actionsDropdown"
                class="ui-btn-secondary w-full md:w-auto"
                type="button"
              >
                <svg class="-ml-1 mr-1.5 w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path
                    clip-rule="evenodd"
                    fill-rule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  />
                </svg>
                Actions
              </button>
              <div id="actionsDropdown" class="hidden z-10 w-44 bg-white rounded divide-y divide-gray-100 shadow dark:bg-gray-700 dark:divide-gray-600">
                <ul class="py-1 text-sm text-gray-700 dark:text-gray-200" aria-labelledby="actionsDropdownButton">
                  <li>
                    <a href="#" class="block py-2 px-4 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white">Mass Edit</a>
                  </li>
                </ul>
                <div class="py-1">
                  <a href="#" class="block py-2 px-4 text-sm text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-gray-200 dark:hover:text-white">Delete all</a>
                </div>
              </div>

              <button
                id="filterDropdownButton"
                data-dropdown-toggle="filterDropdown"
                class="ui-btn-secondary w-full md:w-auto"
                type="button"
              >
                <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" class="h-4 w-4 mr-2 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fill-rule="evenodd"
                    d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z"
                    clip-rule="evenodd"
                  />
                </svg>
                Filter
                <svg class="-mr-1 ml-1.5 w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path
                    clip-rule="evenodd"
                    fill-rule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  />
                </svg>
              </button>
              <div id="filterDropdown" class="z-10 hidden w-48 p-3 bg-white rounded-lg shadow dark:bg-gray-700">
                <h6 class="mb-3 text-sm font-medium text-gray-900 dark:text-white">Choose category</h6>
                <ul class="space-y-2 text-sm" aria-labelledby="filterDropdownButton">
                  <li
                    class="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800"
                    role="switch"
                    aria-checked="false"
                  >
                    <span class="text-gray-900 dark:text-gray-100">Guides</span>
                    <span class="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-300 transition dark:bg-gray-600">
                      <span class="inline-block h-5 w-5 translate-x-1 rounded-full bg-white shadow transition" />
                    </span>
                  </li>
                  <li
                    class="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800"
                    role="switch"
                    aria-checked="false"
                  >
                    <span class="text-gray-900 dark:text-gray-100">Templates</span>
                    <span class="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-300 transition dark:bg-gray-600">
                      <span class="inline-block h-5 w-5 translate-x-1 rounded-full bg-white shadow transition" />
                    </span>
                  </li>
                  <li
                    class="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800"
                    role="switch"
                    aria-checked="false"
                  >
                    <span class="text-gray-900 dark:text-gray-100">Policies</span>
                    <span class="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-300 transition dark:bg-gray-600">
                      <span class="inline-block h-5 w-5 translate-x-1 rounded-full bg-white shadow transition" />
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="ui-table">
            <thead>
              <tr>
                <th scope="col" class="px-4 py-3">Document</th>
                <th scope="col" class="px-4 py-3">Category</th>
                <th scope="col" class="px-4 py-3">Version</th>
                <th scope="col" class="px-4 py-3">Download</th>
                <th scope="col" class="px-4 py-3">
                  <span class="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="doc in filteredDocuments" :key="doc.id" class="border-b dark:border-gray-700">
                <th scope="row" class="px-4 py-3 font-medium text-gray-900 whitespace-nowrap dark:text-white">{{ doc.title }}</th>
                <td class="px-4 py-3">{{ doc.category }}</td>
                <td class="px-4 py-3">{{ doc.version }}</td>
                <td class="px-4 py-3">
                  <a
                    class="hover:underline"
                    :href="doc.url || '#'"
                    :target="doc.url ? '_blank' : undefined"
                    :rel="doc.url ? 'noreferrer' : undefined"
                  >
                    {{ doc.downloadLabel }}
                  </a>
                </td>
                <td class="px-4 py-3 flex items-center justify-end">
                  <button
                    :id="dropdownButtonId(doc.id)"
                    :data-dropdown-toggle="dropdownId(doc.id)"
                    class="inline-flex items-center p-0.5 text-sm font-medium text-center text-gray-500 hover:text-gray-800 rounded-lg focus:outline-none dark:text-gray-400 dark:hover:text-gray-100"
                    type="button"
                  >
                    <svg class="w-5 h-5" aria-hidden="true" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
                    </svg>
                  </button>
                  <div :id="dropdownId(doc.id)" class="hidden z-10 w-44 bg-white rounded divide-y divide-gray-100 shadow dark:bg-gray-700 dark:divide-gray-600">
                    <ul class="py-1 text-sm text-gray-700 dark:text-gray-200" :aria-labelledby="dropdownButtonId(doc.id)">
                      <li>
                        <a href="#" class="block py-2 px-4 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white">Show</a>
                      </li>
                      <li>
                        <a href="#" class="block py-2 px-4 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white">Download</a>
                      </li>
                    </ul>
                    <div class="py-1">
                      <a href="#" class="block py-2 px-4 text-sm text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-gray-200 dark:hover:text-white">Delete</a>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <nav class="flex flex-col md:flex-row justify-between items-start md:items-center space-y-3 md:space-y-0 p-4" aria-label="Table navigation">
          <span class="text-sm font-normal text-gray-500 dark:text-gray-400">
            Showing
            <span class="font-semibold text-gray-900 dark:text-white">{{ filteredDocuments.length ? 1 : 0 }}-{{ filteredDocuments.length }}</span>
            of
            <span class="font-semibold text-gray-900 dark:text-white">{{ filteredDocuments.length }}</span>
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
