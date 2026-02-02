<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

export type QuickFindItem = {
  label: string
  to: string
  description?: string
  keywords?: string[]
}

const props = defineProps<{
  open: boolean
  items: QuickFindItem[]
  title?: string
  initialQuery?: string
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const router = useRouter()

const q = ref('')
const activeIndex = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)

const filtered = computed(() => {
  const query = q.value.trim().toLowerCase()
  if (!query) return props.items

  const tokens = query.split(/\s+/g).filter(Boolean)

  return props.items.filter((item) => {
    const haystack = [
      item.label,
      item.description ?? '',
      ...(item.keywords ?? []),
    ]
      .join(' ')
      .toLowerCase()

    return tokens.every((t) => haystack.includes(t))
  })
})

function close() {
  emit('update:open', false)
}

async function go(item: QuickFindItem) {
  close()
  await router.push(item.to)
}

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return

  if (e.key === 'Escape') {
    e.preventDefault()
    close()
    return
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, Math.max(0, filtered.value.length - 1))
    return
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
    return
  }

  if (e.key === 'Enter') {
    const item = filtered.value[activeIndex.value]
    if (!item) return
    e.preventDefault()
    void go(item)
  }
}

watch(
  () => props.open,
  async (next) => {
    if (!next) return
    q.value = props.initialQuery ?? ''
    activeIndex.value = 0
    await nextTick()
    inputEl.value?.focus()
  },
)

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-[100] flex items-start justify-center p-3 sm:p-5"
    role="dialog"
    aria-modal="true"
    :aria-label="title ?? 'Find'"
  >
    <button
      type="button"
      class="absolute inset-0 bg-gray-900/50 backdrop-blur-[1px]"
      aria-label="Close"
      @click="close"
    />

    <div class="relative w-full max-w-2xl">
      <div class="rounded-2xl border border-white/10 bg-[#14192d] shadow-xl">
        <div class="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <div class="text-sm font-semibold text-white">{{ title ?? 'Find' }}</div>
            <div class="text-xs text-gray-400">Type to filter. Use ↑ ↓ and Enter.</div>
          </div>
          <button
            type="button"
            class="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-gray-300 hover:bg-white/10"
            @click="close"
          >
            Esc
          </button>
        </div>

        <div class="p-4">
          <label for="quick-find" class="sr-only">Find</label>
          <input
            id="quick-find"
            ref="inputEl"
            v-model="q"
            type="text"
            class="block w-full rounded-lg border border-white/10 bg-white/5 p-2.5 text-sm text-white placeholder:text-gray-400 focus:border-primary-500 focus:ring-primary-500"
            placeholder="Find events, tickets, documents…"
            autocomplete="off"
          >

          <div class="mt-3 overflow-hidden rounded-lg border border-white/10">
            <ul v-if="filtered.length" class="max-h-[55vh] divide-y divide-white/10 overflow-auto">
              <li
                v-for="(item, i) in filtered"
                :key="item.to"
              >
                <button
                  type="button"
                  class="w-full px-4 py-3 text-left hover:bg-white/5"
                  :class="i === activeIndex ? 'bg-white/5' : ''"
                  @mouseenter="activeIndex = i"
                  @click="go(item)"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <div class="text-sm font-semibold text-white">{{ item.label }}</div>
                      <div v-if="item.description" class="mt-0.5 text-xs text-gray-400">
                        {{ item.description }}
                      </div>
                    </div>
                    <div class="shrink-0 text-xs text-gray-500">{{ item.to }}</div>
                  </div>
                </button>
              </li>
            </ul>

            <div v-else class="px-4 py-6 text-sm text-gray-400">
              No matches. Try a shorter search.
            </div>
          </div>

          <div class="mt-3 text-xs text-gray-400">
            Tip: search is forgiving — try keywords like “invoice”, “policy”, “ticket”.
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
