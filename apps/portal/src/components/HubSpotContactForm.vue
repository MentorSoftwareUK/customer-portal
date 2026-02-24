<script lang="ts">
import { defineComponent, onMounted } from 'vue'

export default defineComponent({
  name: 'HubSpotContactForm',
  props: {
    portalId: { type: String, required: true },
    formId: { type: String, required: true },
    region: { type: String, required: true },
  },
  setup() {
    onMounted(() => {
      // Inject the HubSpot forms embed script once if not already present.
      const scriptId = 'hs-forms-embed-script'
      if (!document.getElementById(scriptId)) {
        const script = document.createElement('script')
        script.id = scriptId
        script.src = 'https://js-eu1.hsforms.net/forms/embed/145032754.js'
        script.defer = true
        document.head.appendChild(script)
      }
    })
  },
})
</script>

<template>
  <div
    class="hs-form-frame"
    :data-region="region"
    :data-form-id="formId"
    :data-portal-id="portalId"
  />
</template>
