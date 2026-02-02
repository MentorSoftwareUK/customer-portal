declare module '../components/QuickFindModal.vue' {
  import type { DefineComponent } from 'vue'
  export type QuickFindItem = {
    label: string
    to: string
    description?: string
    keywords?: string[]
  }
  const component: DefineComponent<{}, {}, any>
  export default component
}
