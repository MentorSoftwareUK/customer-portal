declare module '../components/HubSpotContactForm.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{
    portalId: string
    formId: string
    region: string
  }, {}, any>
  export default component
}
