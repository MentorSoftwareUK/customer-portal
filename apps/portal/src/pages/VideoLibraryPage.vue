<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { listVideos, type VideoDto } from '../lib/api'
import { provisionFilterLabel, readProvisionFilter, type ProvisionFilter, writeProvisionFilter } from '../lib/provision'
import { productVersionLabel, readProductVersionFilter, type ProductVersionFilter, writeProductVersionFilter } from '../lib/productVersion'

const query = ref('')
const provision = ref<ProvisionFilter>(readProvisionFilter())
watch(provision, (value) => writeProvisionFilter(value))

const productVersion = ref<ProductVersionFilter>(readProductVersionFilter())
watch(productVersion, (value) => writeProductVersionFilter(value))

const recentVideos = ref<VideoDto[]>([])
const popularVideos = ref<VideoDto[]>([])
const allVideos = computed(() => {
  const merged = [...recentVideos.value, ...popularVideos.value]
  const seen = new Set<string>()
  return merged.filter((video) => {
    const key = video.youtubeId || video.videoUrl || video.title
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
})
const featuredVideos = computed(() => {
  return allVideos.value.filter((v) => (v.keywords ?? []).some((k) => k.toLowerCase() === 'featured')).slice(0, 8)
})
const loading = ref(true)
const loadError = ref<string | null>(null)
const warning = ref<string | undefined>(undefined)

const lightboxOpen = ref(false)
const activeVideo = ref<VideoDto | null>(null)
let previousBodyOverflow: string | null = null

const PREVIEW_MAX_IN_FLIGHT = 3
const previewEnabled = ref<Record<string, true>>({})
const previewDone = ref<Record<string, true>>({})
const previewQueue = ref<string[]>([])
const previewInFlight = ref(0)
let previewObserver: IntersectionObserver | null = null
const previewTargets = new Map<string, Element>()

function videoKey(video: VideoDto) {
  return video.youtubeId || video.videoUrl || video.title
}

function isPreviewCandidate(video: VideoDto) {
  return Boolean(video.videoUrl) && !video.thumbnailUrl
}

function isPreviewEnabled(video: VideoDto) {
  const key = videoKey(video)
  return Boolean(previewEnabled.value[key])
}

function enqueuePreview(key: string) {
  if (previewEnabled.value[key] || previewDone.value[key]) return
  if (previewQueue.value.includes(key)) return
  previewQueue.value.push(key)
  processPreviewQueue()
}

function processPreviewQueue() {
  while (previewInFlight.value < PREVIEW_MAX_IN_FLIGHT && previewQueue.value.length > 0) {
    const next = previewQueue.value.shift()
    if (!next) break
    if (previewEnabled.value[next] || previewDone.value[next]) continue
    previewEnabled.value = { ...previewEnabled.value, [next]: true }
    previewInFlight.value += 1
  }
}

function markPreviewDone(key: string) {
  if (previewDone.value[key]) return
  previewDone.value = { ...previewDone.value, [key]: true }
  if (previewInFlight.value > 0) previewInFlight.value -= 1
  processPreviewQueue()
}

function normalizeRefTarget(target: Element | ComponentPublicInstance | null): Element | null {
  if (!target) return null
  if (target instanceof Element) return target
  const maybeEl = (target as ComponentPublicInstance).$el
  return maybeEl instanceof Element ? maybeEl : null
}

function registerPreviewTarget(target: Element | ComponentPublicInstance | null, video: VideoDto) {
  const el = normalizeRefTarget(target)
  const key = videoKey(video)
  const shouldObserve = isPreviewCandidate(video) && !previewDone.value[key]

  const existing = previewTargets.get(key)
  if (existing && (!el || existing !== el)) {
    previewObserver?.unobserve(existing)
    previewTargets.delete(key)
  }

  if (!el || !shouldObserve) return
  try {
    ;(el as HTMLElement).dataset.previewKey = key
  } catch {
    // ignore
  }
  previewTargets.set(key, el)
  previewObserver?.observe(el)
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? ''
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : ''
  return (first + second).toUpperCase()
}

function youtubeThumb(youtubeId: string) {
  return `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`
}

function youtubeEmbedUrl(youtubeId: string) {
  return `https://www.youtube-nocookie.com/embed/${youtubeId}`
}

function videoThumb(video: VideoDto) {
  if (video.thumbnailUrl) return video.thumbnailUrl
  return video.videoUrl ? '' : youtubeThumb(video.youtubeId)
}

function videoSourceType(url: string | undefined) {
  if (!url) return undefined
  const clean = url.split('?')[0]?.toLowerCase() ?? ''
  if (clean.endsWith('.webm')) return 'video/webm'
  if (clean.endsWith('.mp4')) return 'video/mp4'
  return undefined
}

function videoPreviewUrl(url: string | undefined) {
  if (!url) return ''
  if (url.includes('#t=')) return url
  return `${url}#t=0.1`
}

function onPreviewLoadedMetadata(event: Event, key: string) {
  const target = event.target
  if (!(target instanceof HTMLVideoElement)) return
  try {
    const duration = target.duration
    const targetTime = Number.isFinite(duration) && duration > 0 ? Math.min(0.1, duration / 2) : 0.1
    if (Number.isFinite(targetTime) && targetTime >= 0) target.currentTime = targetTime
  } catch {
    markPreviewDone(key)
  }
}

function openLightbox(video: VideoDto) {
  activeVideo.value = video
  lightboxOpen.value = true
}

function closeLightbox() {
  lightboxOpen.value = false
  activeVideo.value = null
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && lightboxOpen.value) closeLightbox()
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)

  try {
    previewObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const key = (entry.target as HTMLElement | null)?.dataset?.previewKey
          if (key) enqueuePreview(key)
        }
      },
      { rootMargin: '300px 0px' },
    )

    // Re-observe any targets registered before the observer existed.
    for (const el of previewTargets.values()) {
      try {
        previewObserver.observe(el)
      } catch {
        // ignore
      }
    }
  } catch {
    previewObserver = null
  }

  loading.value = true
  loadError.value = null
  try {
    const data = await listVideos({ productVersion: productVersion.value })
    recentVideos.value = data.recentVideos
    popularVideos.value = data.popularVideos
    warning.value = data.warning
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load videos'
  } finally {
    loading.value = false
  }
})

watch(lightboxOpen, (open) => {
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

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  try {
    previewObserver?.disconnect()
  } catch {
    // ignore
  }
  previewObserver = null
  previewTargets.clear()
  try {
    document.body.style.overflow = previousBodyOverflow ?? ''
    previousBodyOverflow = null
  } catch {
    // ignore
  }
})

const matchesFilters = (video: VideoDto) => {
  const q = query.value.trim().toLowerCase()
  const matchesQuery = !q || video.title.toLowerCase().includes(q)
  const matchesProvision = provision.value === 'all' || video.provision === 'all' || video.provision === provision.value
  const matchesProductVersion =
    productVersion.value === 'all' || video.productVersion === 'all' || video.productVersion === productVersion.value || !video.productVersion
  return matchesQuery && matchesProvision && matchesProductVersion
}

const filteredRecentVideos = computed(() => recentVideos.value.filter(matchesFilters))
const filteredFeaturedVideos = computed(() => featuredVideos.value.filter(matchesFilters))
const filteredAllVideos = computed(() => allVideos.value.filter(matchesFilters))
const isSearching = computed(() => query.value.trim().length > 0)
</script>

<template>
  <div class="space-y-6">
      <div v-if="loadError" class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-200">
        {{ loadError }}
      </div>

      <div v-else-if="loading" role="status" class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 animate-pulse">
        <div class="space-y-3">
          <div class="h-3 w-32 rounded-full bg-gray-200 dark:bg-gray-700" />
          <div class="h-2.5 w-72 rounded-full bg-gray-200 dark:bg-gray-700" />
          <div class="h-2.5 w-64 rounded-full bg-gray-200 dark:bg-gray-700" />
        </div>
        <span class="sr-only">Loading...</span>
      </div>

      <div class="flex flex-col gap-3">
        <div>
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Video library</h2>
        </div>

        <div class="rounded-xl border border-slate-900/10 bg-[#14192d] p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div class="w-full flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div class="w-full md:flex-1">
              <label for="video-search" class="sr-only">Search videos</label>
              <div class="relative">
                <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <svg aria-hidden="true" class="w-5 h-5 text-white/70" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                    <path
                      fill-rule="evenodd"
                      d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                      clip-rule="evenodd"
                    />
                  </svg>
                </div>
                <button
                  v-if="query"
                  type="button"
                  class="absolute inset-y-0 right-0 flex items-center pr-3 text-white/70 hover:text-white"
                  aria-label="Clear search"
                  @click="query = ''"
                >
                  <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path
                      fill-rule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clip-rule="evenodd"
                    />
                  </svg>
                </button>
                <input
                  id="video-search"
                  v-model="query"
                  type="text"
                  class="bg-white/10 border border-white/10 text-white text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block w-full pl-10 pr-10 p-2.5 placeholder:text-white/60"
                  placeholder="Search videos"
                >
              </div>
            </div>

            <div class="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
              <div class="w-full md:w-64">
                <label for="video-provision" class="sr-only">Provision type</label>
                <select
                  id="video-provision"
                  v-model="provision"
                  class="bg-white/10 border border-white/10 text-white text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5"
                >
                  <option value="all">{{ provisionFilterLabel('all') }}</option>
                  <option value="supported-accommodation">{{ provisionFilterLabel('supported-accommodation') }}</option>
                  <option value="childrens-home">{{ provisionFilterLabel('childrens-home') }}</option>
                  <option value="over-18">{{ provisionFilterLabel('over-18') }}</option>
                </select>
              </div>

              <div class="w-full md:w-56">
                <label for="video-product-version" class="sr-only">Product version</label>
                <select
                  id="video-product-version"
                  v-model="productVersion"
                  class="bg-white/10 border border-white/10 text-white text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5"
                >
                  <option value="all">{{ productVersionLabel('all') }}</option>
                  <option value="v2">{{ productVersionLabel('v2') }}</option>
                  <option value="v3">{{ productVersionLabel('v3') }}</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="!loading && !loadError && warning" class="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-900/30 dark:bg-amber-900/20 dark:text-amber-200">
        {{ warning }}
      </div>

      <div v-if="!isSearching" class="ui-surface">
        <div class="flex items-center justify-between p-4">
          <div>
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">Latest videos</h3>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Newest additions to the library.</p>
          </div>
        </div>

        <div class="px-4 pb-4">
          <div class="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory">
            <button
              v-for="video in filteredRecentVideos.slice(0, 8)"
              :key="`latest-${video.youtubeId}`"
              type="button"
              class="group w-72 shrink-0 snap-start text-left ui-surface-muted overflow-hidden hover:shadow-md"
              :ref="(el) => registerPreviewTarget(el, video)"
              @click="openLightbox(video)"
            >
              <div class="relative">
                <template v-if="video.videoUrl && !video.thumbnailUrl">
                  <div v-if="!isPreviewEnabled(video)" class="w-full h-40 bg-gray-900/20 dark:bg-gray-700/30" />
                  <video
                    v-else
                    class="w-full h-40 object-cover"
                    muted
                    playsinline
                    preload="metadata"
                    @loadedmetadata="onPreviewLoadedMetadata($event, videoKey(video))"
                    @seeked="markPreviewDone(videoKey(video))"
                    @error="markPreviewDone(videoKey(video))"
                  >
                    <source :src="videoPreviewUrl(video.videoUrl)" :type="videoSourceType(video.videoUrl)" />
                  </video>
                </template>
                <img
                  v-else
                  :src="videoThumb(video)"
                  :alt="video.title"
                  class="w-full h-40 object-cover"
                  loading="lazy"
                >
                <div class="absolute top-3 left-3">
                  <span class="bg-gray-900/80 text-white text-xs font-medium px-2.5 py-1 rounded">
                    {{ video.category }}
                  </span>
                </div>
              </div>

              <div class="p-4 space-y-3">
                <div class="text-sm font-semibold text-gray-900 dark:text-white group-hover:underline">
                  {{ video.title }}
                </div>

                <div class="flex items-center gap-2">
                  <div class="shrink-0">
                    <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                      <span class="text-xs font-semibold text-gray-600 dark:text-gray-300">{{ initials(video.authorName) }}</span>
                    </div>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-gray-900 truncate dark:text-white">{{ video.authorName }}</div>
                    <div class="text-sm text-gray-500 truncate dark:text-gray-400">{{ video.timeAgo }}</div>
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>

      <div v-if="!isSearching && filteredFeaturedVideos.length" class="ui-surface">
        <div class="flex items-center justify-between p-4">
          <div>
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">Featured videos</h3>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Tagged as featured in HubSpot.</p>
          </div>
        </div>

        <div class="px-4 pb-4">
          <div class="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory">
            <button
              v-for="video in filteredFeaturedVideos.slice(0, 8)"
              :key="`featured-${video.youtubeId}`"
              type="button"
              class="group w-72 shrink-0 snap-start text-left ui-surface-muted overflow-hidden hover:shadow-md"
              :ref="(el) => registerPreviewTarget(el, video)"
              @click="openLightbox(video)"
            >
              <div class="relative">
                <template v-if="video.videoUrl && !video.thumbnailUrl">
                  <div v-if="!isPreviewEnabled(video)" class="w-full h-40 bg-gray-900/20 dark:bg-gray-700/30" />
                  <video
                    v-else
                    class="w-full h-40 object-cover"
                    muted
                    playsinline
                    preload="metadata"
                    @loadedmetadata="onPreviewLoadedMetadata($event, videoKey(video))"
                    @seeked="markPreviewDone(videoKey(video))"
                    @error="markPreviewDone(videoKey(video))"
                  >
                    <source :src="videoPreviewUrl(video.videoUrl)" :type="videoSourceType(video.videoUrl)" />
                  </video>
                </template>
                <img
                  v-else
                  :src="videoThumb(video)"
                  :alt="video.title"
                  class="w-full h-40 object-cover"
                  loading="lazy"
                >
                <div class="absolute top-3 left-3">
                  <span class="bg-gray-900/80 text-white text-xs font-medium px-2.5 py-1 rounded">
                    {{ video.category }}
                  </span>
                </div>
              </div>

              <div class="p-4 space-y-3">
                <div class="text-sm font-semibold text-gray-900 dark:text-white group-hover:underline">
                  {{ video.title }}
                </div>

                <div class="flex items-center gap-2">
                  <div class="shrink-0">
                    <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                      <span class="text-xs font-semibold text-gray-600 dark:text-gray-300">{{ initials(video.authorName) }}</span>
                    </div>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-gray-900 truncate dark:text-white">{{ video.authorName }}</div>
                    <div class="text-sm text-gray-500 truncate dark:text-gray-400">{{ video.timeAgo }}</div>
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>

      <div class="ui-surface">
        <div class="flex items-center justify-between p-4">
          <div>
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">All videos</h3>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Browse the full library.</p>
          </div>
        </div>

        <div class="p-4">
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <button
              v-for="video in filteredAllVideos"
              :key="`all-${video.youtubeId}`"
              type="button"
              class="group block w-full text-left ui-surface-muted overflow-hidden hover:shadow-md"
              :ref="(el) => registerPreviewTarget(el, video)"
              @click="openLightbox(video)"
            >
              <div class="relative">
                <template v-if="video.videoUrl && !video.thumbnailUrl">
                  <div v-if="!isPreviewEnabled(video)" class="w-full h-40 bg-gray-900/20 dark:bg-gray-700/30" />
                  <video
                    v-else
                    class="w-full h-40 object-cover"
                    muted
                    playsinline
                    preload="metadata"
                    @loadedmetadata="onPreviewLoadedMetadata($event, videoKey(video))"
                    @seeked="markPreviewDone(videoKey(video))"
                    @error="markPreviewDone(videoKey(video))"
                  >
                    <source :src="videoPreviewUrl(video.videoUrl)" :type="videoSourceType(video.videoUrl)" />
                  </video>
                </template>
                <img
                  v-else
                  :src="videoThumb(video)"
                  :alt="video.title"
                  class="w-full h-40 object-cover"
                  loading="lazy"
                >
                <div class="absolute top-3 left-3">
                  <span class="bg-gray-900/80 text-white text-xs font-medium px-2.5 py-1 rounded">
                    {{ video.category }}
                  </span>
                </div>
              </div>

              <div class="p-4 space-y-3">
                <div class="text-sm font-semibold text-gray-900 dark:text-white group-hover:underline">
                  {{ video.title }}
                </div>

                <div class="flex items-center gap-2">
                  <div class="shrink-0">
                    <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                      <span class="text-xs font-semibold text-gray-600 dark:text-gray-300">{{ initials(video.authorName) }}</span>
                    </div>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-gray-900 truncate dark:text-white">{{ video.authorName }}</div>
                    <div class="text-sm text-gray-500 truncate dark:text-gray-400">{{ video.timeAgo }}</div>
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>

      <div
        v-if="lightboxOpen && activeVideo"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
      >
        <button
          type="button"
          class="absolute inset-0 bg-gray-900/70"
          aria-label="Close"
          @click="closeLightbox"
        />

        <div class="relative w-full max-w-5xl rounded-lg bg-white shadow dark:bg-gray-800">
          <div class="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
            <div class="min-w-0">
              <div class="text-sm font-semibold text-gray-900 dark:text-white truncate">{{ activeVideo.title }}</div>
              <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ activeVideo.category }}</div>
            </div>
            <button
              type="button"
              class="inline-flex items-center justify-center rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
              aria-label="Close"
              @click="closeLightbox"
            >
              <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fill-rule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clip-rule="evenodd"
                />
              </svg>
            </button>
          </div>

          <div class="p-4">
            <div class="relative w-full overflow-hidden rounded-lg" style="padding-top: 56.25%">
              <video
                v-if="activeVideo.videoUrl"
                class="absolute inset-0 h-full w-full"
                controls
                preload="metadata"
              >
                <source :src="activeVideo.videoUrl" :type="videoSourceType(activeVideo.videoUrl)" />
                Your browser does not support the video tag.
              </video>
              <iframe
                v-else
                class="absolute inset-0 h-full w-full"
                :src="youtubeEmbedUrl(activeVideo.youtubeId)"
                :title="activeVideo.title"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen
              />
            </div>
          </div>
        </div>
      </div>
  </div>
</template>
