<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
  meta?: string
}>()
</script>

<template>
  <!-- v3 page header pattern: white bar + magenta underline rule -->
  <div class="bg-white border-b border-gray-200 -mx-4 px-4 sm:-mx-12 sm:px-12 mb-6 -mt-6">
    <div class="flex flex-col gap-2 py-4 md:flex-row md:items-center md:justify-between">
      <div class="min-w-0">
        <h1 class="text-2xl font-semibold tracking-tight text-black">{{ title }}</h1>
        <p v-if="subtitle" class="mt-1 text-sm text-gray-600">
          {{ subtitle }}
        </p>
      </div>
      <div class="flex flex-col gap-2 md:items-end">
        <div v-if="meta" class="text-sm text-gray-600">{{ meta }}</div>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <slot name="actions" />
        </div>
      </div>
    </div>
    <!-- Magenta underline — always present per v3 spec -->
    <div class="h-0.5 bg-gradient-to-r from-[#e7007e] to-transparent" />
  </div>
</template>
