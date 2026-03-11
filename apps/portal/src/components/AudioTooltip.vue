<script setup lang="ts">
import { ref, watch, onBeforeUnmount, computed } from 'vue'

const props = defineProps<{
  /** The explanation text to speak */
  text?: string
  /** Stable cache key */
  cacheKey?: string
}>()

const playing = ref(false)
const loading = ref(false)
const bars = ref<number[]>([0, 0, 0, 0, 0])

let audioCtx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let animFrame = 0
let mediaSource: MediaElementAudioSourceNode | null = null
let currentAudio: HTMLAudioElement | null = null
let currentUrl: string | null = null

// In-memory blob cache for instant replays
const blobCache = new Map<string, ArrayBuffer>()

function getApiBaseUrl(): string {
  const envBase = import.meta.env.VITE_API_BASE_URL as string | undefined
  return (envBase && envBase.trim()) || 'http://localhost:3001'
}

function getAdminToken(): string | null {
  try { return localStorage.getItem('admin_access_token') } catch { return null }
}

function updateBars() {
  if (!analyser || !playing.value) {
    bars.value = [0, 0, 0, 0, 0]
    return
  }
  const data = new Uint8Array(analyser.frequencyBinCount)
  analyser.getByteFrequencyData(data)

  const sliceSize = Math.floor(data.length / 5)
  const newBars: number[] = []
  for (let i = 0; i < 5; i++) {
    let sum = 0
    for (let j = i * sliceSize; j < (i + 1) * sliceSize; j++) {
      sum += data[j] || 0
    }
    newBars.push(Math.min(1, (sum / sliceSize / 255) * 2.2))
  }
  bars.value = newBars
  animFrame = requestAnimationFrame(updateBars)
}

async function playFromBuffer(buffer: ArrayBuffer) {
  const blob = new Blob([buffer], { type: 'audio/mpeg' })
  const url = URL.createObjectURL(blob)
  currentUrl = url
  const audio = new Audio(url)
  audio.crossOrigin = 'anonymous'

  if (!audioCtx) audioCtx = new AudioContext()
  if (audioCtx.state === 'suspended') await audioCtx.resume()

  analyser = audioCtx.createAnalyser()
  analyser.fftSize = 64
  analyser.smoothingTimeConstant = 0.75

  mediaSource = audioCtx.createMediaElementSource(audio)
  mediaSource.connect(analyser)
  analyser.connect(audioCtx.destination)

  audio.addEventListener('ended', stop)
  audio.addEventListener('error', stop)

  currentAudio = audio
  await audio.play()
  playing.value = true
  animFrame = requestAnimationFrame(updateBars)
}

async function toggle() {
  if (playing.value) {
    stop()
    return
  }
  if (!props.text) return

  loading.value = true

  try {
    const key = props.cacheKey || props.text.slice(0, 80)

    const cached = blobCache.get(key)
    if (cached) {
      loading.value = false
      await playFromBuffer(cached)
      return
    }

    const token = getAdminToken()
    const res = await fetch(`${getApiBaseUrl()}/admin/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text: props.text }),
    })

    if (!res.ok) throw new Error(`TTS ${res.status}`)

    const buffer = await res.arrayBuffer()
    blobCache.set(key, buffer)
    loading.value = false
    await playFromBuffer(buffer)
  } catch (err) {
    console.error('TTS error:', err)
    stop()
  } finally {
    loading.value = false
  }
}

function stop() {
  playing.value = false
  cancelAnimationFrame(animFrame)
  bars.value = [0, 0, 0, 0, 0]

  if (currentAudio) {
    currentAudio.pause()
    currentAudio.currentTime = 0
    currentAudio.removeEventListener('ended', stop)
    currentAudio.removeEventListener('error', stop)
    currentAudio = null
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl)
    currentUrl = null
  }
  if (mediaSource) {
    try { mediaSource.disconnect() } catch {}
    mediaSource = null
  }
  if (analyser) {
    try { analyser.disconnect() } catch {}
    analyser = null
  }
}

watch(() => props.text, () => { if (playing.value) stop() })

onBeforeUnmount(() => {
  stop()
  if (audioCtx) { audioCtx.close(); audioCtx = null }
})

const label = computed(() => {
  if (loading.value) return 'Loading…'
  if (playing.value) return 'Stop'
  return 'Listen'
})
</script>

<template>
  <button
    v-if="text"
    @click.stop="toggle"
    :disabled="loading"
    :title="playing ? 'Stop explanation' : 'Listen to explanation'"
    class="voice-pill"
    :class="{ playing, loading }"
  >
    <!-- Idle / loading icon -->
    <svg v-if="!playing" viewBox="0 0 16 16" fill="none" class="pill-icon">
      <template v-if="loading">
        <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"
          stroke-dasharray="24 12" stroke-linecap="round" class="animate-spin origin-center" />
      </template>
      <template v-else>
        <!-- play triangle -->
        <path d="M5.5 3.5v9l7-4.5-7-4.5z" fill="currentColor" />
      </template>
    </svg>

    <!-- Playing: animated waveform bars -->
    <span v-else class="wave-bars">
      <span
        v-for="(h, i) in bars"
        :key="i"
        class="bar"
        :style="{
          height: Math.max(h, 0.18) * 14 + 'px',
          animationDelay: i * 0.06 + 's',
        }"
      />
    </span>

    <span class="pill-label">{{ label }}</span>
  </button>
</template>

<style scoped>
.voice-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 10px 0 7px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.45);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
  user-select: none;
  white-space: nowrap;
}

.voice-pill:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
  border-color: rgba(255, 255, 255, 0.12);
}

.voice-pill.playing {
  background: rgba(129, 140, 248, 0.12);
  border-color: rgba(129, 140, 248, 0.25);
  color: #a5b4fc;
}

.voice-pill.loading {
  cursor: wait;
  color: rgba(255, 255, 255, 0.3);
}

.pill-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.pill-label {
  line-height: 1;
}

/* Waveform bars */
.wave-bars {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 14px;
}

.bar {
  width: 2.5px;
  min-height: 3px;
  border-radius: 999px;
  background: currentColor;
  transition: height 0.1s ease;
}
</style>
