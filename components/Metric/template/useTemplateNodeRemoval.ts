import { onScopeDispose } from 'vue'
import { Modal } from 'ant-design-vue'
import type { TemplateNode } from './designer'

/** Both menu and keyboard use the same permission check and confirmation; a changed selection cannot delete another node. */
export function useTemplateNodeRemoval(state:() => { node?:TemplateNode; identity?:string; disabled:boolean; invalid:boolean; published?:boolean }, remove:()=>void, t:(key:string)=>string) {
  let dialog:ReturnType<typeof Modal.confirm> | undefined
  const allowed = (value:ReturnType<typeof state>) => !!value.node && value.identity !== undefined && !value.disabled && !value.invalid && (!value.published || value.node.kind === 'rule')
  function requestRemove() {
    const requested = state()
    if (dialog || !allowed(requested)) return
    const identity = requested.identity
    dialog = Modal.confirm({ title:t('removeNodeConfirm'), okText:t('remove'), cancelText:t('cancel'), okButtonProps:{ danger:true },
      onOk:() => { const current = state(); if (allowed(current) && current.identity === identity) remove(); dialog = undefined },
      onCancel:() => { dialog = undefined },
      afterClose:() => { dialog = undefined },
    })
  }
  onScopeDispose(() => { dialog?.destroy(); dialog = undefined })
  return { requestRemove }
}
