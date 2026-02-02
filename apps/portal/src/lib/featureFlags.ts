import { ref } from 'vue'
import { getFeatureFlags, type FeatureFlags } from './api'

const featureFlags = ref<FeatureFlags>({
  invoicesEnabled: true,
  ticketsEnabled: true,
  knowledgeBaseEnabled: true,
  documentsEnabled: true,
  videosEnabled: true,
  meetingsEnabled: true,
  paymentsEnabled: true,
  eventRegistrationsEnabled: true,
})
const featureFlagsLoaded = ref(false)
let inflight: Promise<void> | null = null

export function useFeatureFlags() {
  return { featureFlags, featureFlagsLoaded, loadFeatureFlags }
}

export async function loadFeatureFlags(force = false) {
  if (featureFlagsLoaded.value && !force) return
  if (inflight) return inflight

  inflight = (async () => {
    try {
      const res = await getFeatureFlags()
      featureFlags.value = res.features
    } catch {
      featureFlags.value = {
        invoicesEnabled: true,
        ticketsEnabled: true,
        knowledgeBaseEnabled: true,
        documentsEnabled: true,
        videosEnabled: true,
        meetingsEnabled: true,
        paymentsEnabled: true,
        eventRegistrationsEnabled: true,
      }
    } finally {
      featureFlagsLoaded.value = true
      inflight = null
    }
  })()

  return inflight
}
