import { computed, onActivated, onDeactivated, onScopeDispose, ref } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { Modal } from 'ant-design-vue'
import { sceneDraftSnapshot } from './sceneDraftSnapshot'

/** 每次加载完成后记录基线；取消编辑并恢复原值时自动回到未修改状态。 */
export function useSceneDraftChanges(draft: () => unknown) {
  const baseline = ref<string>()
  const snapshot = computed(() => sceneDraftSnapshot(draft()))
  return {
    dirty: computed(() => baseline.value !== undefined && snapshot.value !== baseline.value),
    markClean: () => { baseline.value = snapshot.value },
  }
}

/** 由路由统一拦截页内返回、取消、菜单和浏览器后退，避免同一次离开重复确认。 */
export function useSceneLeaveGuard(dirty: () => boolean, saving: () => boolean, t: (key: string) => string, saveChanges: () => Promise<boolean>) {
  let saved = false
  let active = true
  let pending: { promise: Promise<boolean>; finish: (accepted: boolean) => void; dialog?: ReturnType<typeof Modal.confirm> } | undefined

  function confirmLeave(): boolean | Promise<boolean> {
    if (saved) return true
    if (saving()) return false
    if (!dirty()) return true
    if (pending) return pending.promise
    let resolve!: (accepted: boolean) => void
    const promise = new Promise<boolean>(done => { resolve = done })
    const decision = { promise, finish: (accepted: boolean) => {
      if (pending !== decision) return
      pending = undefined
      resolve(accepted)
    }, dialog: undefined as ReturnType<typeof Modal.confirm> | undefined }
    pending = decision
    decision.dialog = Modal.confirm({
      content: t('IotSceneLinkage.confirm.leaveContent'),
      okText: t('IotSceneLinkage.confirm.saveChanges'),
      cancelText: t('IotSceneLinkage.confirm.discardChanges'),
      closable: true,
      maskClosable: false,
      zIndex: 1300,
      onOk: async () => {
        // 保存期间禁用其他退出入口；成功后继续原导航，失败则回到字段修正。
        decision.dialog?.update({ closable: false, keyboard: false, cancelButtonProps: { disabled: true } })
        try { decision.finish(await saveChanges()) }
        catch { decision.finish(false) }
      },
      // “不保存”按钮提供关闭函数，需要显式执行；关闭图标和 Escape 由 afterClose 留在当前页。
      onCancel: (close?: (() => void) | { triggerCancel?: boolean }) => {
        if (typeof close === 'function') {
          close()
          decision.finish(true)
        } else decision.finish(!close?.triggerCancel)
      },
      afterClose: () => decision.finish(false),
    })
    return promise
  }

  onBeforeRouteLeave(confirmLeave)
  onBeforeRouteUpdate((to, from) => to.path === from.path && JSON.stringify(to.params) === JSON.stringify(from.params) || confirmLeave())
  onActivated(() => { active = true })
  onDeactivated(() => { active = false })
  function beforeUnload(event: BeforeUnloadEvent) {
    if (active && !saved && (dirty() || saving())) { event.preventDefault(); event.returnValue = '' }
  }
  window.addEventListener('beforeunload', beforeUnload)
  onScopeDispose(() => {
    window.removeEventListener('beforeunload', beforeUnload)
    const decision = pending
    decision?.finish(false)
    decision?.dialog?.destroy()
  })
  return { confirmLeave, markSaved: () => { saved = true } }
}
