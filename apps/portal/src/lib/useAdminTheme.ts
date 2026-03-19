import { ref } from 'vue'

const isLight = ref(localStorage.getItem('admin-theme') === 'light')

export function useAdminTheme() {
  function toggle() {
    isLight.value = !isLight.value
    localStorage.setItem('admin-theme', isLight.value ? 'light' : 'dark')
  }

  return { isLight, toggle }
}
