<script lang="ts">
import { computed, defineComponent } from 'vue'
import type { PropType } from 'vue'

type PipelineStage = {
  id: string
  label: string
  description?: string
  hubspotLabel?: string
}

export default defineComponent({
  name: 'PipelineStageTracker',
  props: {
    stages: {
      type: Array as PropType<PipelineStage[]>,
      required: true,
    },
    activeStage: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      default: 'Lifecycle pipeline',
    },
    subtitle: {
      type: String,
      default: '',
    },
  },
  emits: ['select'],
  setup(props, { emit }) {
    const activeIndex = computed(() => {
      const index = props.stages.findIndex((stage) => stage.id === props.activeStage)
      return index === -1 ? 0 : index
    })

    const progressPercent = computed(() => {
      if (props.stages.length <= 1) return 0
      return Math.round((activeIndex.value / (props.stages.length - 1)) * 100)
    })

    const stepState = (index: number) => {
      if (index < activeIndex.value) return 'complete'
      if (index === activeIndex.value) return 'active'
      return 'upcoming'
    }

    const stepClasses = (index: number) => {
      const state = stepState(index)
      if (state === 'complete') return 'bg-emerald-500 text-white border-emerald-500'
      if (state === 'active') return 'bg-primary-600 text-white border-primary-600'
      return 'bg-gray-100 text-gray-500 border-gray-200'
    }

    const labelClasses = (index: number) => {
      const state = stepState(index)
      if (state === 'complete') return 'text-emerald-700'
      if (state === 'active') return 'text-gray-900'
      return 'text-gray-500'
    }


    const onSelect = (stage: PipelineStage, index: number) => {
      emit('select', stage, index)
    }

    return {
      activeIndex,
      progressPercent,
      stepState,
      stepClasses,
      labelClasses,
      onSelect,
    }
  },
})
</script>

<template>
  <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 class="text-lg font-semibold text-gray-900">{{ title }}</h3>
        <p v-if="subtitle" class="mt-1 text-sm text-gray-500">{{ subtitle }}</p>
      </div>
      <div class="text-xs font-medium text-gray-500">{{ progressPercent }}% complete</div>
    </div>

    <div class="mt-6">
      <div class="relative h-2 rounded-full bg-gray-100">
        <div
          class="absolute left-0 top-0 h-2 rounded-full bg-gradient-to-r from-emerald-400 via-emerald-300 to-primary-300 transition-all duration-500 ease-out"
          :style="{ width: `${progressPercent}%` }"
        />
        <div
          class="absolute top-1/2 h-3 w-3 -translate-y-1/2 -translate-x-1/2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.7)] transition-all duration-500"
          :style="{ left: `${progressPercent}%` }"
        />
      </div>

      <div class="mt-5 overflow-x-auto overflow-y-visible pb-2">
        <div class="flex min-w-[700px] items-start gap-4 sm:min-w-0">
          <button
            v-for="(stage, index) in stages"
            :key="stage.id"
            type="button"
            class="group relative flex min-w-[140px] flex-1 flex-col items-start gap-2 rounded-xl border px-3 py-3 text-left transition hover:border-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60"
            :class="stepState(index) === 'active' ? 'border-primary-400/40 bg-gray-50' : 'border-gray-200'"
            @click="onSelect(stage, index)"
          >
            <div class="flex items-center justify-between gap-2 w-full">
              <div class="text-sm font-semibold" :class="labelClasses(index)">{{ stage.label }}</div>
              <span
                class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold"
                :class="[stepClasses(index), stepState(index) === 'active' ? 'animate-pulse' : '']"
              >
                <svg v-if="stepState(index) === 'complete'" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0l-3.75-3.75a1 1 0 011.414-1.414l3.043 3.043 6.543-6.543a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                <span v-else>{{ index + 1 }}</span>
              </span>
            </div>
            <div v-if="stage.description" class="text-xs text-gray-500">
              {{ stage.description }}
            </div>

            <div
              v-if="stage.description"
              class="pointer-events-none absolute right-3 top-11 max-w-[200px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 opacity-0 shadow-lg transition group-hover:opacity-100"
            >
              {{ stage.description }}
            </div>

          </button>
        </div>
      </div>
    </div>
  </div>
</template>
