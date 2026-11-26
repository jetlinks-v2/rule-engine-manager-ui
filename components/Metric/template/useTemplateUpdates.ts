import { onScopeDispose, ref, watch, type Ref } from 'vue'
import { metricApi } from '../api'
import { errorText } from '../service'
import type { MetricApi, MetricConfig, MetricTemplateEntity, MetricTemplateRevision } from '../types'

/** 发布修订按配置应用；每份配置沿用现有保存/CAS/装载反馈，不引入另一套批量执行器。 */
export function useTemplateUpdates(entity: Ref<MetricTemplateEntity | undefined>, editable: Ref<boolean>, api: MetricApi = metricApi) {
  const references = ref<MetricConfig[]>([])
  const revisions = ref<MetricTemplateRevision[]>([])
  const selectedIds = ref<string[]>([])
  const targetRevision = ref(1)
  const hasMore = ref(false)
  const hasMoreRevisions = ref(false)
  const loadingRevisions = ref(false)
  const loading = ref(false)
  const referencesLoaded = ref(false)
  const applying = ref(false)
  const error = ref('')
  const outcomes = ref<Record<string, { error?: string; state?: string }>>({})
  const summary = ref({ saved: 0, failed: 0 })
  let generation = 0
  async function loadRevisions() {
    if (!entity.value?.released || loadingRevisions.value || applying.value) return
    const token = generation
    loadingRevisions.value = true
    try {
      const values = await api.templateRevisions(entity.value.id, revisions.value.at(-1)?.revision)
      if (token === generation) { revisions.value.push(...values); hasMoreRevisions.value = values.length === 32 }
    } catch (cause) { if (token === generation) error.value = errorText(cause) }
    finally { if (token === generation) loadingRevisions.value = false }
  }
  async function loadMore() {
    if (!entity.value?.released || loading.value || applying.value) return
    const token = generation
    loading.value = true
    error.value = ''
    try {
      const values = await api.templateReferences(entity.value.id, references.value.at(-1)?.id)
      if (token === generation) { references.value.push(...values); referencesLoaded.value = true; hasMore.value = values.length === 32 }
    } catch (cause) { if (token === generation) error.value = errorText(cause) }
    finally { if (token === generation) loading.value = false }
  }
  async function load() {
    if (!entity.value?.released || applying.value) return
    generation++
    loading.value = false
    loadingRevisions.value = false
    referencesLoaded.value = false
    references.value = []; revisions.value = []; selectedIds.value = []; outcomes.value = {}
    targetRevision.value = entity.value.revision || 1
    error.value = ''
    await Promise.all([loadMore(), loadRevisions()])
  }
  async function applyOne(config: MetricConfig, revision: number, token: number) {
    if (!config.id) return
    try {
      const saved = await api.applyTemplateRevision(config.id, revision, config.revision)
      if (token !== generation) return
      const index = references.value.findIndex(item => item.id === saved.id)
      if (index >= 0) references.value.splice(index, 1, saved)
      selectedIds.value = selectedIds.value.filter(id => id !== saved.id)
      summary.value.saved++
      // 批量更新只保存可见行反馈和总计，避免为每个隐藏实例常驻结果对象。
      if (index >= 0) {
        try {
          const feedback = saved.state === 'enabled' ? await api.latest([saved.id!]) : []
          if (token === generation) outcomes.value[config.id] = { state: saved.state === 'disabled' ? 'disabled' : feedback[0]?.runtime?.state || 'pending' }
        } catch (cause) {
          if (token === generation) outcomes.value[config.id] = { error: errorText(cause) }
        }
      }
    } catch (cause) {
      if (token !== generation) return
      summary.value.failed++
      const index = references.value.findIndex(item => item.id === config.id)
      if (index >= 0) {
        // 保存后装载/反馈可能失败；读取已提交事实，重试不得继续携带过期配置修订。
        try { const current = await api.getConfig(config.id); if (token === generation) references.value.splice(index, 1, current) } catch { /* 原操作错误仍反馈给调用方。 */ }
        if (token === generation) outcomes.value[config.id] = { error: errorText(cause) }
      } else error.value = `${config.name || config.id}: ${errorText(cause)}`
    }
  }
  async function apply(all: boolean, ids: readonly string[] = selectedIds.value) {
    if (!editable.value || !entity.value?.released || applying.value) return
    const key = entity.value.id
    const revision = targetRevision.value
    const token = generation
    applying.value = true
    summary.value = { saved: 0, failed: 0 }
    error.value = ''
    try {
      if (all) {
        let cursor: string | undefined
        // 一页完成再读下一页，避免把全部实例及其执行结果长期留在内存。
        while (token === generation && editable.value) {
          const batch = await api.templateReferences(key, cursor)
          for (const config of batch) { if (token !== generation || !editable.value) break; await applyOne(config, revision, token) }
          if (batch.length < 32) break
          cursor = batch.at(-1)?.id
        }
      } else {
        const selected = new Set(ids)
        for (const config of references.value.filter(item => item.id && selected.has(item.id))) {
          if (token !== generation || !editable.value) break
          await applyOne(config, revision, token)
        }
      }
    } catch (cause) { if (token === generation) error.value = errorText(cause) }
    finally { applying.value = false }
  }
  watch(() => entity.value?.id, () => {
    generation++
    loading.value = false; referencesLoaded.value = false; loadingRevisions.value = false
    references.value = []; revisions.value = []; selectedIds.value = []; outcomes.value = {}
    hasMore.value = false; hasMoreRevisions.value = false; error.value = ''
    summary.value = { saved: 0, failed: 0 }
  }, { flush: 'sync' })
  onScopeDispose(() => { generation++ })
  return { references, revisions, selectedIds, targetRevision, hasMore, hasMoreRevisions, loading, referencesLoaded, loadingRevisions, applying, error, outcomes, summary, load, loadMore, loadRevisions, apply }
}
