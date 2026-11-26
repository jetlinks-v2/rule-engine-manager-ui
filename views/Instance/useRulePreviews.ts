import { onScopeDispose, shallowRef, type Ref } from 'vue'
import { watchDebounced } from '@vueuse/core'
import { loadRulePreviews } from '../../api/instanceObservation'
import type { RuleListItem } from './listTypes'

export interface RulePreview { url?: string; status: 'loading' | 'ready' | 'failed' }

/** Batch visible thumbnails separately; release blobs when cards leave the window. */
export function useRulePreviews(items: Ref<RuleListItem[]>, active: Ref<boolean>) {
  const previews = shallowRef(new Map<string, RulePreview>())
  let disposed = false
  const release = (preview?: RulePreview) => { if (preview?.url) URL.revokeObjectURL(preview.url) }
  watchDebounced(() => active.value ? items.value.map(item => item.id).join(',') : '', (scope, _, cleanup) => {
    if (disposed) return
    const ids = scope ? scope.split(',') : []
    const current = new Map<string, RulePreview>()
    for (const [id, preview] of previews.value) {
      if (ids.includes(id) && preview.status === 'ready') current.set(id, preview)
      else release(preview)
    }
    const missing = ids.filter(id => !current.has(id))
    missing.forEach(id => current.set(id, { status: 'loading' }))
    previews.value = current
    if (!missing.length) return
    const request = loadRulePreviews(missing).subscribe({
      next(item) {
        if (!current.has(item.id)) return
        const svg = item.metadata?.thumbnailSvg?.trim()
        current.set(item.id, { status: 'ready', url: svg?.startsWith('<svg')
          ? URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })) : undefined })
        previews.value = new Map(current)
      },
      error() {
        missing.forEach(id => { if (current.get(id)?.status === 'loading') current.set(id, { status: 'failed' }) })
        previews.value = new Map(current)
      },
      complete() {
        missing.forEach(id => { if (current.get(id)?.status === 'loading') current.set(id, { status: 'ready' }) })
        previews.value = new Map(current)
      },
    })
    cleanup(() => request.unsubscribe())
  }, { immediate: true, debounce: 100, maxWait: 300 })
  onScopeDispose(() => { disposed = true; previews.value.forEach(release) })
  return previews
}
