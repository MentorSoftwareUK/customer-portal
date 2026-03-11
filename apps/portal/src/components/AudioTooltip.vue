<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'

const props = defineProps<{
  /** The explanation text to speak */
  text: string
  /** Stable cache key (unused now but kept for interface compat) */
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

// Cache fetched audio blobs so repeat clicks are instant
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
    newBars.push(Math.min(1, (sum / sliceSize / 255) * 1.8))
  }
  bars.value = newBars
  animFrame = requestAnimationFrame(updateBars)
}

async function playFromBuffer(buffer: ArrayBuffer) {
  const blob = new Blob([buffer], { type: 'audio/mpeg' })
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)

  if (!audioCtx) audioCtx = new AudioContext()
  if (audioCtx.state === 'suspended') await audioCtx.resume()

  analyser = audioCtx.createAnalyser()
  analyser.fftSize = 64
  analyser.smoothingTimeConstant = 0.7

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

  loading.value = true

  try {
    const key = props.cacheKey || props.text.slice(0, 60)

    // Use cached audio if available
    const cached = blobCache.get(key)
    if (cached) {
      loading.value = false
      await playFromBuffer(cached)
      return
    }

    // Fetch from backend Edge TTS route
    const token = getAdminToken()
    const res = await fetch(`${getApiBaseUrl()}/admin/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text: props.text }),
    })

    if (!res.ok) throw new Error(`TTS request failed: ${res.status}`)

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

  if (mediaSource) {
    mediaSource.disconnect()
    mediaSource = null
  }
  if (analyser) {
    analyser.disconnect()
    analyser = null
  }
}

watch(() => props.text, () => {
  if (playing.value) stop()
})

onBeforeUnmount(() => {
  stop()
  if (audioCtx) {
    audioCtx.close()
    audioCtx = null
  }
})
</script>

<template>
  <button
    @click.stop="toggle"
    :disabled="loading"
    :title="playing ? 'Stop explanation' : 'Listen to explanation'"
    class="audio-btn"
    :class="{ 'is-playing': playing, 'is-loading': loading }"
  >
    <!-- Idle: speaker icon -->
    <svg
      v-if="!playing && !loading"
      viewBox="0 0 20 20"
      fill="currentColor"
      class="icon"
    >
      <path
        d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217z"
      />
      <path
        d="M12.293 7.293a1 1 0 011.414 0 4.002 4.002 0 010 5.414 1 1 0 01-1.414-1.414 2.002 2.002 0 000-2.586 1 1 0 010-1.414z"
      />
    </svg>

    <!-- Loading spinner -->
    <svg
      v-else-if="loading"
      viewBox="0 0 20 20"
      class="icon animate-spin"
    >
      <circle
        cx="10" cy="10" r="7"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-dasharray="30 14"
        stroke-linecap="round"
      />
    </svg>

    <!-- Playing: visualiser bars -->
    <svg
      v-else
      viewBox="0 0 20 20"
      class="icon"
    >
      <rect
        v-for="(h, i) in bars"
        :key="i"
        :x="2 + i * 3.6"
        :y="10 - Math.max(h, 0.15) * 8"
        width="2"
        :height="Math.max(h, 0.15) * 16"
        rx="1"
        fill="currentColor"
        class="bar"
      />
    </svg>
  </button>
</template>

<style scoped>
.audio-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: rgba(255, 255, 255, 0.2);
  cursor: pointer;
  transition: color 0.2s, background 0.2s;
  flex-shrink: 0;
}

.audio-btn:hover {
  color: rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.06);
}

.audio-btn.is-playing {
  color: #818cf8;
  background: rgba(129, 140, 248, 0.1);
}

.audio-btn.is-loading {
  color: rgba(255, 255, 255, 0.25);
  cursor: wait;
}

.icon {
  width: 13px;
  height: 13px;
}

.bar {
  transition: y 0.08s ease, height 0.08s ease;
}
</style>
