import { reactive } from 'vue'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: number
  type: ToastType
  message: string
}

const state = reactive<{ items: Toast[] }>({ items: [] })

let _id = 0

export function addToast(type: ToastType, message: string, duration = 4000) {
  const id = ++_id
  state.items.push({ id, type, message })
  if (duration > 0) {
    setTimeout(() => removeToast(id), duration)
  }
  return id
}

export function removeToast(id: number) {
  const i = state.items.findIndex((t) => t.id === id)
  if (i !== -1) state.items.splice(i, 1)
}

export function useToast() {
  return {
    success: (message: string, duration?: number) => addToast('success', message, duration),
    error: (message: string, duration?: number) => addToast('error', message, duration ?? 6000),
    info: (message: string, duration?: number) => addToast('info', message, duration),
    warning: (message: string, duration?: number) => addToast('warning', message, duration ?? 5000),
  }
}

export { state as toastState }
