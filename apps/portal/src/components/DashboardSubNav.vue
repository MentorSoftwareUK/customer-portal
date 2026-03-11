<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const currentPath = computed(() => route.path)

const tabs = [
  { to: '/admin/dashboard', label: 'Overview', activeClass: 'bg-white/10 text-white shadow-sm' },
  { to: '/admin/marketing', label: 'Marketing', activeClass: 'bg-indigo-500/20 text-indigo-300 shadow-sm' },
  { to: '/admin/sales', label: 'Sales', activeClass: 'bg-emerald-500/20 text-emerald-300 shadow-sm' },
  { to: '/admin/success', label: 'Success', activeClass: 'bg-amber-500/20 text-amber-300 shadow-sm' },
]
</script>

<template>
  <div class="inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
    <RouterLink
      v-for="tab in tabs"
      :key="tab.to"
      :to="tab.to"
      class="relative rounded-md px-4 py-1.5 text-xs font-semibold transition-all duration-200"
      :class="currentPath === tab.to ? tab.activeClass : 'text-white/50 hover:text-white/80'"
    >
      {{ tab.label }}
    </RouterLink>
  </div>
</template>
