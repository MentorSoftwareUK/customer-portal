<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'

const props = withDefaults(
  defineProps<{
    segments: Array<{ label: string; value: number; color: string }>
    size?: number
    strokeWidth?: number
    /** Optional centre label, e.g. total count */
    centreLabel?: string
    centreValue?: string
  }>(),
  { size: 180, strokeWidth: 28 },
)

const animated = ref(false)
onMounted(() => {
  requestAnimationFrame(() => {
    animated.value = true
  })
})

const total = computed(() =>
  props.segments.reduce((s, seg) => s + seg.value, 0),
)

const radius = computed(() => (props.size - props.strokeWidth) / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)

const arcs = computed(() => {
  const cx = props.size / 2
  const cy = props.size / 2
  const r = radius.value
  let cumAngle = -90 // start from top

  return props.segments
    .filter((s) => s.value > 0)
    .map((seg) => {
      const pct = total.value > 0 ? seg.value / total.value : 0
      const angle = pct * 360
      const dashLen = pct * circumference.value
      const gapLen = circumference.value - dashLen

      // Rotation for this segment
      const rotation = cumAngle
      cumAngle += angle

      return {
        ...seg,
        pct: Math.round(pct * 100),
        dashLen,
        gapLen,
        rotation,
        cx,
        cy,
        r,
      }
    })
})
</script>

<template>
  <div class="inline-flex flex-col items-center gap-3">
    <svg
      :width="size"
      :height="size"
      :viewBox="`0 0 ${size} ${size}`"
    >
      <!-- Background ring -->
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        fill="none"
        :stroke-width="strokeWidth"
        stroke="rgba(255,255,255,0.04)"
      />
      <!-- Segments -->
      <circle
        v-for="(arc, i) in arcs"
        :key="i"
        :cx="arc.cx"
        :cy="arc.cy"
        :r="arc.r"
        fill="none"
        :stroke="arc.color"
        :stroke-width="strokeWidth"
        stroke-linecap="round"
        :stroke-dasharray="`${animated ? arc.dashLen : 0} ${animated ? arc.gapLen : circumference}`"
        :transform="`rotate(${arc.rotation} ${arc.cx} ${arc.cy})`"
        class="transition-all duration-1000 ease-out"
      />
      <!-- Centre text -->
      <text
        v-if="centreValue"
        :x="size / 2"
        :y="size / 2 - 6"
        text-anchor="middle"
        dominant-baseline="auto"
        class="fill-white text-2xl font-bold"
      >{{ centreValue }}</text>
      <text
        v-if="centreLabel"
        :x="size / 2"
        :y="size / 2 + 14"
        text-anchor="middle"
        dominant-baseline="auto"
        class="fill-white/40 text-[10px] font-semibold uppercase tracking-wider"
      >{{ centreLabel }}</text>
    </svg>
    <!-- Legend -->
    <div class="flex flex-wrap justify-center gap-x-4 gap-y-1">
      <div v-for="(arc, i) in arcs" :key="i" class="flex items-center gap-1.5">
        <div class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: arc.color }" />
        <span class="text-[11px] text-white/50">{{ arc.label }}</span>
        <span class="text-[11px] font-bold tabular-nums text-white/70">{{ arc.value }}</span>
        <span class="text-[10px] text-white/25">({{ arc.pct }}%)</span>
      </div>
    </div>
  </div>
</template>
