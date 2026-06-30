<script setup lang="ts">
import { computed } from 'vue'
import type { EventDto } from '../lib/api'

const props = defineProps<{
  type: EventDto['type']
}>()

const klass = computed(() => {
  const base = 'inline-flex items-center rounded-full px-3 py-1 text-sm font-medium'

  switch (props.type) {
    case 'Webinar':
      return `${base} bg-blue-100 text-blue-800 dark:bg-blue-900/30   `
    case 'Lunch & Learn':
      return `${base} bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30   `
    case 'Podcast':
      return `${base} bg-purple-100 text-purple-800 dark:bg-purple-900/30   `
    default:
      return `${base} bg-gray-100 text-gray-800 dark:bg-gray-800   `
  }
})
</script>

<template>
  <span :class="klass">
    {{ type }}
  </span>
</template>
