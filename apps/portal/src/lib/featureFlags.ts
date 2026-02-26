import { ref } from 'vue'
import { getFeatureFlags, type FeatureFlags } from './api'

const featureFlags = ref<FeatureFlags>({
  invoicesEnabled: false,
  ticketsEnabled: false,
  knowledgeBaseEnabled: false,
  documentsEnabled: false,
  videosEnabled: false,
  meetingsEnabled: false,
  paymentsEnabled: false,
  eventRegistrationsEnabled: false,
  globalNotificationsEnabled: false,
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
        invoicesEnabled: false,
        ticketsEnabled: false,
        knowledgeBaseEnabled: false,
        documentsEnabled: false,
        videosEnabled: false,
        meetingsEnabled: false,
        paymentsEnabled: false,
        eventRegistrationsEnabled: false,
        globalNotificationsEnabled: false,
      }
    } finally {
      featureFlagsLoaded.value = true
      inflight = null
    }
  })()

  return inflight
}
