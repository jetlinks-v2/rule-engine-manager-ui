import { onBeforeUnmount, onMounted, type Ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

/** 模板内部切换与路由离开共用确认；保存期间不能离开，关闭页面交给浏览器原生提示。 */
export function useTemplateLeaveGuard(dirty: Ref<boolean>, saving: Ref<boolean>, confirm: () => Promise<boolean>) {
  let pending: Promise<boolean> | undefined
  function canLeave(): Promise<boolean> {
    if (saving.value) return Promise.resolve(false)
    if (!dirty.value) return Promise.resolve(true)
    return pending ||= confirm().finally(() => { pending = undefined })
  }
  function beforeUnload(event: BeforeUnloadEvent) {
    if (!dirty.value && !saving.value) return
    event.preventDefault()
    event.returnValue = ''
  }
  onBeforeRouteLeave(canLeave)
  onMounted(() => { if (typeof window !== 'undefined') window.addEventListener('beforeunload', beforeUnload) })
  onBeforeUnmount(() => { if (typeof window !== 'undefined') window.removeEventListener('beforeunload', beforeUnload) })
  return canLeave
}
