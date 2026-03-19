<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'

const props = withDefaults(
  defineProps<{
    points: Array<{ label: string; value: number }>
    color?: string
    height?: number
    areaFill?: boolean
    yLabel?: string
    formatValue?: (v: number) => string
    /** Index after which the line becomes dashed (forecast). -1 = never dashed */
    dashedAfter?: number
  }>(),
  { color: '#818cf8', height: 200, areaFill: true, formatValue: (v: number) => String(v), dashedAfter: -1 },
)

const animated = ref(false)
onMounted(() => {
  requestAnimationFrame(() => {
    animated.value = true
  })
})

const PAD_LEFT = 40
const PAD_RIGHT = 16
const PAD_TOP = 16
const PAD_BOTTOM = 32

const width = 600

const yMax = computed(() => {
  const m = Math.max(...props.points.map((p) => p.value), 1)
  return Math.ceil(m * 1.15) || 1
})

const chartW = computed(() => width - PAD_LEFT - PAD_RIGHT)
const chartH = computed(() => props.height - PAD_TOP - PAD_BOTTOM)

const coords = computed(() =>
  props.points.map((p, i) => {
    const x =
      PAD_LEFT +
      (props.points.length > 1
        ? (i / (props.points.length - 1)) * chartW.value
        : chartW.value / 2)
    const y = PAD_TOP + chartH.value - (p.value / yMax.value) * chartH.value
    return { x, y, ...p }
  }),
)

const linePath = computed(() =>
  coords.value.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' '),
)

/** Solid portion of the line (up to dashedAfter index, inclusive) */
const solidPath = computed(() => {
  if (props.dashedAfter < 0) return linePath.value
  const solidCoords = coords.value.slice(0, props.dashedAfter + 1)
  return solidCoords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ')
})

/** Dashed portion of the line (from dashedAfter index onward) */
const dashedPath = computed(() => {
  if (props.dashedAfter < 0) return ''
  const dCoords = coords.value.slice(props.dashedAfter)
  if (dCoords.length < 2) return ''
  return dCoords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ')
})

const areaPath = computed(() => {
  if (!coords.value.length) return ''
  const base = PAD_TOP + chartH.value
  const first = coords.value[0]!
  const last = coords.value[coords.value.length - 1]!
  return `M ${first.x} ${base} ` + coords.value.map((c) => `L ${c.x} ${c.y}`).join(' ') + ` L ${last.x} ${base} Z`
})

const yTicks = computed(() => {
  const ticks: number[] = []
  const step = Math.max(1, Math.ceil(yMax.value / 4))
  for (let v = 0; v <= yMax.value; v += step) ticks.push(v)
  return ticks
})

function yPos(v: number) {
  return PAD_TOP + chartH.value - (v / yMax.value) * chartH.value
}

// Show every Nth label so they don't overlap
const labelStep = computed(() => Math.max(1, Math.ceil(props.points.length / 8)))
</script>

<template>
  <div class="w-full overflow-x-auto">
    <svg
      :viewBox="`0 0 ${width} ${height}`"
      class="w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <!-- Grid lines -->
      <line
        v-for="t in yTicks"
        :key="t"
        :x1="PAD_LEFT"
        :y1="yPos(t)"
        :x2="width - PAD_RIGHT"
        :y2="yPos(t)"
        stroke="rgba(255,255,255,0.06)"
        stroke-width="1"
      />
      <!-- Y axis labels -->
      <text
        v-for="t in yTicks"
        :key="'yl' + t"
        :x="PAD_LEFT - 6"
        :y="yPos(t) + 3"
        text-anchor="end"
        fill="rgba(255,255,255,0.3)"
        font-size="9"
        font-family="system-ui, sans-serif"
      >{{ formatValue(t) }}</text>

      <!-- Area -->
      <path
        v-if="areaFill && coords.length"
        :d="areaPath"
        :fill="color"
        fill-opacity="0.08"
        :class="animated ? 'opacity-100' : 'opacity-0'"
        class="transition-opacity duration-700"
      />

      <!-- Line (solid) -->
      <path
        v-if="coords.length"
        :d="dashedAfter >= 0 ? solidPath : linePath"
        fill="none"
        :stroke="color"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        :stroke-dasharray="animated ? 'none' : '2000'"
        :stroke-dashoffset="animated ? '0' : '2000'"
        class="transition-all duration-1000 ease-out"
      />

      <!-- Line (dashed forecast portion) -->
      <path
        v-if="coords.length && dashedAfter >= 0 && dashedPath"
        :d="dashedPath"
        fill="none"
        :stroke="color"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-dasharray="6 4"
        stroke-opacity="0.6"
        :class="animated ? 'opacity-100' : 'opacity-0'"
        class="transition-opacity duration-1000 ease-out"
      />

      <!-- Dots -->
      <circle
        v-for="(c, i) in coords"
        :key="'d' + i"
        :cx="c.x"
        :cy="c.y"
        :r="animated ? 3.5 : 0"
        :fill="color"
        stroke="#0f1428"
        stroke-width="2"
        class="transition-all duration-700"
      />

      <!-- Value labels on dots -->
      <text
        v-for="(c, i) in coords"
        :key="'v' + i"
        :x="c.x"
        :y="c.y - 8"
        text-anchor="middle"
        fill="rgba(255,255,255,0.6)"
        font-size="8"
        font-weight="700"
        font-family="system-ui, sans-serif"
        :opacity="animated ? 1 : 0"
        style="transition: opacity 0.7s"
      >{{ formatValue(c.value) }}</text>

      <!-- X axis labels -->
      <text
        v-for="(c, i) in coords"
        :key="'x' + i"
        :x="c.x"
        :y="height - 4"
        text-anchor="middle"
        fill="rgba(255,255,255,0.3)"
        font-size="8"
        font-family="system-ui, sans-serif"
        :visibility="i % labelStep === 0 ? 'visible' : 'hidden'"
      >{{ c.label }}</text>
    </svg>
  </div>
</template>
