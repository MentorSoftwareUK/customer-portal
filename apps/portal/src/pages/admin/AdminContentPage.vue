<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { listVideos, type VideoDto } from '../../lib/api'

const loading = ref(true)
const loadError = ref<string | null>(null)
const warning = ref<string | undefined>(undefined)

const recentVideos = ref<VideoDto[]>([])
const popularVideos = ref<VideoDto[]>([])

const combinedVideos = computed(() => {
  const byId = new Map<string, VideoDto>()
  for (const v of [...recentVideos.value, ...popularVideos.value]) {
    if (!byId.has(v.youtubeId)) byId.set(v.youtubeId, v)
  }
  return Array.from(byId.values())
})

const newVideo = ref({
  title: '',
  videoUrl: '',
  category: 'Training',
  provision: 'all',
  productVersion: 'all',
  keywords: '',
})

const formError = ref<string | null>(null)
const formSuccess = ref<string | null>(null)

const lightboxOpen = ref(false)
const activeVideo = ref<VideoDto | null>(null)
const addModalOpen = ref(false)
let previousBodyOverflow: string | null = null

function youtubeEmbedUrl(youtubeId: string) {
  return `https://www.youtube-nocookie.com/embed/${youtubeId}`
}

function openLightbox(video: VideoDto) {
  activeVideo.value = video
  lightboxOpen.value = true
}

function closeLightbox() {
  lightboxOpen.value = false
  activeVideo.value = null
}

function openAddModal() {
  formError.value = null
  addModalOpen.value = true
}

function closeAddModal() {
  addModalOpen.value = false
}

function addManualVideo() {
  formError.value = null
  formSuccess.value = null

  const trimmedUrl = newVideo.value.videoUrl.trim()
  const title = newVideo.value.title.trim()
  if (!trimmedUrl || !title) {
    formError.value = 'Title and file path are required.'
    return
  }

  const keywords = newVideo.value.keywords
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)

  const video: VideoDto = {
    youtubeId: `direct-${Date.now()}`,
    title,
    category: newVideo.value.category || 'Training',
    authorName: 'Admin added',
    timeAgo: 'Just now',
    provision: (newVideo.value.provision as any) || 'all',
    productVersion: (newVideo.value.productVersion as any) || 'all',
    keywords,
    videoUrl: trimmedUrl,
  }

  recentVideos.value = [video, ...recentVideos.value]
  formSuccess.value = 'Video added locally. (UI-only — wire to API to persist)'
  addModalOpen.value = false

  newVideo.value = {
    title: '',
    videoUrl: '',
    category: 'Training',
    provision: 'all',
    productVersion: 'all',
    keywords: '',
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && lightboxOpen.value) closeLightbox()
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  loading.value = true
  loadError.value = null
  try {
    const data = await listVideos()
    recentVideos.value = data.recentVideos
    popularVideos.value = data.popularVideos
    warning.value = data.warning
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load videos'
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  try {
    document.body.style.overflow = previousBodyOverflow ?? ''
    previousBodyOverflow = null
  } catch {
    // ignore
  }
})

// Prevent scroll bleed when lightbox or modal is open.
watch(
  () => lightboxOpen.value || addModalOpen.value,
  (open) => {
  try {
    if (open) {
      previousBodyOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = previousBodyOverflow ?? ''
      previousBodyOverflow = null
    }
  } catch {
    // ignore
  }
})

const featureBadge = (video: VideoDto) => (video.keywords ?? []).some((k) => k.toLowerCase() === 'feature')

function sourceLabel(video: VideoDto) {
  if (!video.videoUrl) return 'YouTube'
  try {
    const url = new URL(video.videoUrl)
    const path = url.pathname.toLowerCase()
    const ext = path.split('.').pop()?.trim()
    if (ext && ext.length <= 5) return `${ext.toUpperCase()} file`
  } catch {
    // Fallback for non-URL paths
    const path = video.videoUrl.toLowerCase().split('?')[0] ?? ''
    const ext = path.split('.').pop()?.trim()
    if (ext && ext.length <= 5) return `${ext.toUpperCase()} file`
  }
  return 'File'
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-1">
      <p class="text-xs uppercase tracking-[0.08em] text-gray-500">Content</p>
      <h2 class="text-2xl font-semibold text-gray-900">Content management</h2>
      <p class="text-sm text-gray-600">Videos shown in the portal (read-only preview)</p>
      <p v-if="warning" class="text-xs text-amber-700">{{ warning }}</p>
    </div>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
      <div class="ui-surface p-4 shadow-sm">
        <div class="text-sm font-semibold text-gray-900">Videos</div>
        <p class="mt-1 text-sm text-gray-600">Tag by provision, version, keywords.</p>
      </div>
      <div class="ui-surface p-4 shadow-sm">
        <div class="text-sm font-semibold text-gray-900">Documents</div>
        <p class="mt-1 text-sm text-gray-600">Versioned uploads (future: S3/Azure).</p>
      </div>
      <div class="ui-surface p-4 shadow-sm">
        <div class="text-sm font-semibold text-gray-900">Knowledge base</div>
        <p class="mt-1 text-sm text-gray-600">HubSpot articles + tags.</p>
      </div>
    </div>

    <div class="ui-surface p-4 shadow-md sm:rounded-lg overflow-hidden">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h3 class="text-base font-semibold text-gray-900">Portal videos</h3>
          <p class="text-xs text-gray-600">All videos currently visible to users (recent + popular feed).</p>
          <p v-if="formSuccess" class="mt-2 text-xs text-emerald-700">{{ formSuccess }}</p>
        </div>
        <button class="ui-btn-primary" type="button" @click="openAddModal">Add video</button>
      </div>

      <div v-if="loadError" class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        {{ loadError }}
      </div>

      <div v-else-if="loading" class="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 animate-pulse">
        Loading videos…
      </div>

      <div v-else>
        <div v-if="!combinedVideos.length" class="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          No videos available.
        </div>

        <div v-else class="overflow-x-auto">
          <table class="ui-table">
            <thead>
              <tr>
                <th class="px-4 py-3 text-left">Title</th>
                <th class="px-4 py-3 text-left">Category</th>
                <th class="px-4 py-3 text-left">Source</th>
                <th class="px-4 py-3 text-left">Provision</th>
                <th class="px-4 py-3 text-left">Product version</th>
                <th class="px-4 py-3 text-left">Feature</th>
                <th class="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="video in combinedVideos" :key="video.youtubeId">
                <td class="px-4 py-3">
                  <div class="font-semibold text-gray-900">{{ video.title }}</div>
                  <div class="text-xs text-gray-600">{{ video.authorName }} • {{ video.timeAgo }}</div>
                </td>
                <td class="px-4 py-3 text-gray-700">{{ video.category }}</td>
                <td class="px-4 py-3 text-gray-700">
                  <span class="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-800">
                    {{ sourceLabel(video) }}
                  </span>
                </td>
                <td class="px-4 py-3 text-gray-700">{{ video.provision }}</td>
                <td class="px-4 py-3 text-gray-700">{{ video.productVersion || 'all' }}</td>
                <td class="px-4 py-3">
                  <span v-if="featureBadge(video)" class="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    Feature
                  </span>
                  <span v-else class="text-xs text-gray-400">—</span>
                </td>
                <td class="px-4 py-3 text-right">
                  <button class="ui-btn-secondary px-3 py-1 text-xs" type="button" @click="openLightbox(video)">
                    View
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div v-if="lightboxOpen && activeVideo" class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div class="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div class="flex items-center justify-between border-b border-gray-200 px-4 py-3 text-gray-900">
          <div>
            <div class="text-sm font-semibold">{{ activeVideo.title }}</div>
            <div class="text-xs text-gray-600">{{ activeVideo.category }} • {{ activeVideo.authorName }}</div>
          </div>
          <button class="rounded-lg bg-gray-100 px-3 py-1 text-sm text-gray-900 hover:bg-gray-200" type="button" @click="closeLightbox">
            Close
          </button>
        </div>
        <div class="aspect-video w-full bg-black">
          <video
            v-if="activeVideo.videoUrl"
            class="h-full w-full"
            controls
            preload="metadata"
          >
            <source :src="activeVideo.videoUrl" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
          <iframe
            v-else
            :src="youtubeEmbedUrl(activeVideo.youtubeId)"
            title="Video player"
            class="h-full w-full"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
          />
        </div>
      </div>
    </div>

    <div v-if="addModalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div class="ui-surface w-full max-w-3xl overflow-hidden shadow-2xl">
        <div class="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <div class="text-sm font-semibold text-white">Add video (HubSpot file path)</div>
            <div class="text-xs text-white/70">UI-only: adds to this list; replace with API to persist.</div>
          </div>
          <button
            class="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/30"
            type="button"
            aria-label="Close"
            @click="closeAddModal"
          >
            <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fill-rule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm-1.414-5.414a1 1 0 001.414 0L10 11.586l.707.707a1 1 0 001.414-1.414L11.414 10l.707-.707a1 1 0 00-1.414-1.414L10 8.586l-.707-.707a1 1 0 00-1.414 1.414L8.586 10l-.707.707a1 1 0 000 1.414z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </div>

        <div class="p-4 space-y-4">
          <div v-if="formError" class="rounded-lg border border-red-400 bg-red-900/30 p-3 text-sm text-red-100">{{ formError }}</div>

          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label class="text-xs font-semibold text-gray-700">Title</label>
              <input v-model="newVideo.title" class="ui-input mt-1" placeholder="e.g. Feature walkthrough" />
            </div>
            <div>
              <label class="text-xs font-semibold text-gray-700">File path / URL</label>
              <input v-model="newVideo.videoUrl" class="ui-input mt-1" placeholder="https://.../Plans.mp4" />
            </div>
            <div>
              <label class="text-xs font-semibold text-gray-700">Category</label>
              <select v-model="newVideo.category" class="ui-input mt-1">
                <option value="Training">Training</option>
                <option value="Onboarding">Onboarding</option>
                <option value="Feature">Feature</option>
                <option value="Compliance">Compliance</option>
                <option value="Product update">Product update</option>
              </select>
            </div>
            <div>
              <label class="text-xs font-semibold text-gray-700">Provision</label>
              <select v-model="newVideo.provision" class="ui-input mt-1">
                <option value="all">All</option>
                <option value="supported-accommodation">Supported accommodation</option>
                <option value="childrens-home">Children's home</option>
                <option value="over-18">Over 18</option>
              </select>
            </div>
            <div>
              <label class="text-xs font-semibold text-gray-700">Product version</label>
              <select v-model="newVideo.productVersion" class="ui-input mt-1">
                <option value="all">All</option>
                <option value="v2">v2</option>
                <option value="v3">v3</option>
              </select>
            </div>
            <div>
              <label class="text-xs font-semibold text-gray-700">Keywords (comma separated)</label>
              <input v-model="newVideo.keywords" class="ui-input mt-1" placeholder="feature, onboarding" />
            </div>
          </div>

          <div class="flex justify-end gap-2">
            <button class="ui-btn-secondary" type="button" @click="closeAddModal">Cancel</button>
            <button class="ui-btn-primary" type="button" @click="addManualVideo">Add video</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
