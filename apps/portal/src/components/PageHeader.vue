<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
  meta?: string
}>()
</script>

<template>
  <header class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
    <div class="min-w-0">
      <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">{{ title }}</h1>
      <p v-if="subtitle" class="mt-1 text-sm text-gray-600 dark:text-gray-300">
        {{ subtitle }}
      </p>
    </div>

    <div class="flex flex-col gap-2 md:items-end">
      <div v-if="meta" class="text-sm text-gray-500 dark:text-gray-400">{{ meta }}</div>
      <div class="flex flex-wrap items-center justify-end gap-2">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>
