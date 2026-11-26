import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { metricApi } from '../api'
import { errorText } from '../service'
import type { MetricReadApi, MetricContext } from '../types'
import type { MetricCollectionQuery, MetricCollectionResult, MetricCollectionRow, MetricCollectionSelection, MetricReadScopeOption, ReadOperation } from './types'

/** One bounded scope request; stale responses cannot replace a newer scope/page/operation. No per-device requests. */
export function useMetricCollection(context: Ref<MetricContext>, scope: Ref<MetricReadScopeOption>, api: MetricReadApi = metricApi, selection:Ref<MetricCollectionSelection | undefined> = ref()) {
  const result = ref<MetricCollectionResult>(), loading = ref(false), error = ref(''), selected = ref<MetricCollectionRow>()
  const selectedGroups = ref<string[]>(), operation = ref<ReadOperation>('collection'), page = ref(1), descendants = ref(true)
  const group = computed(() => selectedGroups.value?.length === 1 ? selectedGroups.value[0] : undefined)
  const view = ref<'list' | 'bars'>('list'), fallback = ref(false)
  const activeGroup = computed(() => result.value?.groups.find(item => item.id === group.value))
  // 同类型树查看下级节点；跨类型查看当前容器直接绑定的设备，不把当前节点冒充下级。
  const depth = computed(() => scope.value.tree && descendants.value ? 'descendants'
    : scope.value.tree && scope.value.memberType === context.value.ownerType ? 'children' : 'self')
  let sequence = 0, stopped = false, initialized = false
  const preferenceKey = () => context.value.preferenceScope ? `metric-collection:${JSON.stringify([context.value.preferenceScope,context.value.ownerType,context.value.ownerId,scope.value.memberType])}` : undefined
  function readPreference(): { groups?:string[] | null; operation?:ReadOperation; view?:string; descendants?:boolean } | undefined {
    const key = preferenceKey()
    try { return key ? JSON.parse(localStorage.getItem(key) || 'null') || undefined : undefined } catch { return undefined }
  }
  function savePreference() {
    if(selection.value)return
    const key = preferenceKey()
    try { if (key) localStorage.setItem(key, JSON.stringify({ groups:selectedGroups.value ?? null, operation:operation.value, view:view.value, descendants:descendants.value })) } catch { /* Storage is optional. */ }
  }
  async function refresh() {
    const current = ++sequence
    if (!api.collection) { error.value = 'Metric collection capability unavailable'; return }
    loading.value = true; error.value = ''
    const query: MetricCollectionQuery = { rootType:context.value.ownerType, rootId:context.value.ownerId, memberType:scope.value.memberType,
      depth:depth.value, group:group.value, ...(selectedGroups.value && selectedGroups.value.length > 1 ? {groups:selectedGroups.value} : {}), templateId:selection.value?.templateId,
      pageByMember:selection.value ? true : operation.value==='collection', operation:selection.value ? 'collection' : operation.value, pageIndex:page.value - 1, pageSize:20, includeUnconfigured:true }
    try {
      const next = await api.collection(query)
      if (stopped || current !== sequence) return
      result.value = next
      if (!initialized) {
        initialized = true
        const preference = selection.value ? undefined : readPreference()
        const primary = next.groups.filter(item => item.displaySettings?.primaryOutput === item.output.metricId)
        const saved = Array.isArray(preference?.groups) ? new Set(preference.groups.filter(id => typeof id === 'string').slice(0,128)) : undefined
        const restored = saved && next.groups.filter(item => saved.has(item.id)).map(item => item.id)
        const initial = selection.value ? next.groups.find(item=>item.id === selection.value?.group)
          : preference?.groups === null || saved ? undefined : primary[0] || next.groups[0]
        selectedGroups.value = initial ? [initial.id] : restored?.length ? restored : undefined
        const chosen = next.groups.find(item => item.id === group.value)
        if (chosen && !selection.value) {
          const preferred = preference?.operation || chosen.policy?.defaultOperation || 'collection'
          fallback.value = !chosen.operations.includes(preferred)
          operation.value = fallback.value ? 'collection' : preferred
          view.value = (preference?.view || chosen.policy?.defaultView) === 'bars' ? 'bars' : 'list'
        }
        savePreference()
        if (query.group !== group.value || JSON.stringify(query.groups) !== JSON.stringify(selectedGroups.value && selectedGroups.value.length > 1 ? selectedGroups.value : undefined) || query.operation !== operation.value) await refresh()
      }
    } catch (cause) { if (current === sequence && !stopped) { error.value = errorText(cause);result.value=undefined;selected.value=undefined } }
    finally { if (current === sequence) loading.value = false }
  }
  function selectGroup(value?: string) {
    selectGroups(value ? [value] : undefined)
  }
  function selectGroups(values?: string[]) {
    const allowed = new Set(result.value?.groups.map(item => item.id))
    const nextIds = values && [...new Set(values)].filter(id => allowed.has(id)).slice(0,128)
    selectedGroups.value = nextIds?.length ? nextIds : undefined; page.value = 1; fallback.value = false
    const next = activeGroup.value
    const preferred = next?.policy?.defaultOperation || 'collection'
    operation.value = !selection.value && next?.operations.includes(preferred) ? preferred : 'collection'
    view.value = next?.policy?.defaultView === 'bars' ? 'bars' : 'list'
    savePreference(); void refresh()
  }
  function selectOperation(value: ReadOperation) { operation.value = value; page.value = 1; savePreference(); void refresh() }
  function changePage(value: number) { page.value = value; void refresh() }
  function changeDepth(value: boolean) { descendants.value = value; page.value = 1; savePreference(); void refresh() }
  function changeView(value: 'list' | 'bars') { view.value = value; savePreference() }
  watch([() => context.value.preferenceScope, () => context.value.ownerType, () => context.value.ownerId, () => scope.value.memberType, selection], () => {
    // 首次请求即使用该对象的范围偏好，避免先扫描全部后代，也不继承上一对象的选择。
    descendants.value = selection.value?.descendants ?? readPreference()?.descendants ?? true
    initialized = false; result.value=undefined;selectedGroups.value = selection.value?.group ? [selection.value.group] : undefined; operation.value = 'collection'; page.value = 1; selected.value = undefined; void refresh()
  }, { immediate:true })
  onBeforeUnmount(() => { stopped = true; sequence++ })
  return { result, loading, error, group, selectedGroups, operation, page, descendants, view, fallback, activeGroup, selected,
    refresh, selectGroup, selectGroups, selectOperation, changePage, changeDepth, changeView }
}
