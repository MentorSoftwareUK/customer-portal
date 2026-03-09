<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    data: number[]
    color?: string
    width?: number
    height?: number
  }>(),
  { color: '#818cf8', width: 72, height: 28 },
)

const uid = `spark-${Math.random().toString(36).slice(2, 8)}`

const points = computed(() => {
  if (props.data.length < 2) return []
  const max = Math.max(...props.data, 1)
  const min = Math.min(...props.data, 0)
  const range = max - min || 1
  const pad = 3
  const h = props.height - pad * 2
  const step = props.width / (props.data.length - 1)
  return props.data.map((v, i) => ({
    x: i * step,
    y: pad + h - ((v - min) / range) * h,
  }))
})

const linePath = computed(() => {
  const pts = points.value
  if (pts.length < 2) return ''
  let d = `M${pts[0]!.x.toFixed(1)},${pts[0]!.y.toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i]!
    const p1 = pts[i + 1]!
    const cx = (p0.x + p1.x) / 2
    d += ` C${cx.toFixed(1)},${p0.y.toFixed(1)} ${cx.toFixed(1)},${p1.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`
  }
  return d
})

const areaPath = computed(() => {
  const pts = points.value
  if (pts.length < 2) return ''
  const last = pts[pts.length - 1]!
  const first = pts[0]!
  return `${linePath.value} L${last.x.toFixed(1)},${props.height} L${first.x.toFixed(1)},${props.height} Z`
})

const lastPt = computed(() => points.value[points.value.length - 1])
</script>

<template>
  <svg
    :viewBox="`0 0 ${width} ${height}`"
    :width="width"
    :height="height"
    class="overflow-visible"
  >
    <defs>
      <linearGradient :id="uid" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :stop-color="color" stop-opacity="0.25" />
        <stop offset="100%" :stop-color="color" stop-opacity="0.03" />
      </linearGradient>
    </defs>
    <path :d="areaPath" :fill="`url(#${uid})`" />
    <path
      :d="linePath"
      fill="none"
      :stroke="color"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <circle
      v-if="lastPt"
      :cx="lastPt.x"
      :cy="lastPt.y"
      r="2"
      :fill="color"
    />
  </svg>
</template>
