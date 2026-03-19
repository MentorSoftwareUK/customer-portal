import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

/**
 * Shared month picker state backed by the `?month=` query parameter.
 * Defaults to the **current** month (not previous).
 * Changing the value updates the URL without a full navigation.
 */
export function useDashboardMonth() {
  const route = useRoute()
  const router = useRouter()

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const selectedMonth = computed({
    get: () => {
      const q = route.query.month as string | undefined
      return q && /^\d{4}-\d{2}$/.test(q) ? q : currentMonth
    },
    set: (val: string) => {
      router.replace({ query: { ...route.query, month: val === currentMonth ? undefined : val } })
    },
  })

  const monthOptions = computed(() => {
    const opts: { value: string; label: string }[] = []
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      opts.push({
        value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      })
    }
    return opts
  })

  const selectedMonthLabel = computed(() => {
    const opt = monthOptions.value.find(o => o.value === selectedMonth.value)
    return opt?.label ?? selectedMonth.value
  })

  return { selectedMonth, monthOptions, selectedMonthLabel }
}
