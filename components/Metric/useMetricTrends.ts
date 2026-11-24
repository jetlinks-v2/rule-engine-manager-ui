import { computed, onActivated, onDeactivated, onScopeDispose, ref, shallowRef, watch, type InjectionKey, type Ref } from 'vue'
import { metricApi } from './api'
import { errorText, newerMetricValue } from './service'
import type { MetricReadApi, MetricConfig, MetricHistoryRequest, MetricReference, MetricResultFrame, MetricValue } from './types'

export interface MetricTrendTarget { id: string; configId?: string; key: string; outputs: string[]; intervalOutputs?: string[]; targetType?: string; targetId?: string }
export interface MetricHistoryState {
  values: MetricValue[]
  bounds: [number, number]
  loading: boolean
  error: string
  latestLoading?: boolean
}
export interface MetricHistoryScope {
  configurations: Ref<MetricConfig[]>
  entries: Ref<Record<string, MetricHistoryState>>
  range: Ref<number>
  customRange: Ref<[number, number] | undefined>
  refresh: (id?: string) => void
  refreshLatest: () => Promise<void>
}
export const metricHistoryKey: InjectionKey<MetricHistoryScope> = Symbol('metric-history')

/** 概览与独立详情使用同一有界查询口径；一次配置查询覆盖其全部输出。 */
export function metricHistoryRequest(outputs: string[], bounds: [number, number], intervalsOnly = false): MetricHistoryRequest {
  return { outputs, ...(intervalsOnly ? { intervalsOnly: true } : {}), query: { paging: true, pageSize: 200, pageIndex: 0,
    sorts: [{ name: 'timestamp', order: 'desc' }], terms: intervalsOnly
      ? [{ column: 'intervalStart', termType: 'lt', value: bounds[1] }, { column: 'intervalEnd', termType: 'gt', value: bounds[0] }]
      : [{ column: 'timestamp', termType: 'between', value: bounds }] } }
}

/** 一个对象共享历史快照。只读取可见卡片与打开的详情，旧请求不写入新的对象、范围或数据版本。 */
export function useMetricTrends(targets: Ref<MetricTrendTarget[]>, selected: Ref<MetricReference | undefined>, api: MetricReadApi = metricApi, timeRange?: Pick<MetricHistoryScope,'range'|'customRange'>, stream?: { interval: Ref<number>; onFrame: (id: string, frame: MetricResultFrame) => void }) {
  const entries = shallowRef<Record<string, MetricHistoryState>>({})
  const range = timeRange?.range || ref(3600000)
  const customRange = timeRange?.customRange || ref<[number, number]>()
  const visible = ref(new Set<string>())
  const elements = new Map<string, Element>()
  const owners = new WeakMap<Element, string>()
  const intersections = new Set<Element>()
  const queued = new Map<string, { target: MetricTrendTarget; state: MetricHistoryState }>()
  const keys = new Map<string, string>()
  const streams = new Map<string, { stop: () => void; release: () => void }>()
  let active = true
  let running = 0
  let bounds: [number, number] = customRange.value || [Date.now() - range.value, Date.now()]
  const admitted = computed(() => new Set([...visible.value, ...(selected.value ? [selected.value.configId] : [])]))
  const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(changes => {
    for (const change of changes) {
      if (owners.has(change.target)) change.isIntersecting ? intersections.add(change.target) : intersections.delete(change.target)
    }
    updateVisible()
  }, { rootMargin: '80px' })

  function updateVisible() { visible.value = new Set([...intersections].flatMap(element => owners.get(element) || [])) }
  /** 多张输出卡片可共用一个历史目标，任一卡片可见即可读取。 */
  function observe(id: string, element: Element | null, slot = id) {
    const previous = elements.get(slot)
    if (previous === element) return
    if (previous) { observer?.unobserve(previous); owners.delete(previous); intersections.delete(previous) }
    elements.delete(slot)
    if (element) { elements.set(slot, element); owners.set(element, id); observer?.observe(element); if (!observer) intersections.add(element) }
    updateVisible()
  }
  function update(id: string, state: MetricHistoryState, patch: Partial<MetricHistoryState>) {
    if (!active || entries.value[id] !== state) return
    entries.value = { ...entries.value, [id]: { ...state, ...patch } }
  }
  /** 同一面板至多三个在途查询；切换范围时只替换队列，尚未结束的旧查询仍占并发额度。 */
  function drain() {
    if (!active) return
    for (const [id, job] of queued) {
      if (running >= 3) break
      if (!admitted.value.has(id)) continue
      queued.delete(id)
      if (entries.value[id] !== job.state) continue
      running++
      if (api.watchResults) { readStream(job.target, job.state); continue }
      void readHistory(job.target, job.state)
        .then(values => update(id, job.state, { values, loading: false }))
        .catch(cause => update(id, job.state, { error: errorText(cause), values: [], loading: false }))
        .finally(() => { running--; drain() })
    }
  }
  function stopStream(id: string) { const current = streams.get(id); streams.delete(id); current?.stop(); current?.release() }
  function readStream(target: MetricTrendTarget, initial: MetricHistoryState) {
    const id = target.id
    let released = false
    let historyStarted = false
    const job = { stop: () => {}, release: () => { if (!released) { released = true; running--; queueMicrotask(drain) } } }
    streams.set(id, job)
    const patch = (value: Partial<MetricHistoryState>) => {
      if (active && streams.get(id) === job) entries.value = { ...entries.value, [id]: { ...entries.value[id], ...value } }
    }
    const scope = target.targetType && target.targetId ? { targetType: target.targetType, targetId: target.targetId } : {}
    const stop = api.watchResults!(target.configId || id, { ...metricHistoryRequest(target.outputs, initial.bounds), ...scope,
      intervalOutputs: target.intervalOutputs, intervalQuery: metricHistoryRequest(target.intervalOutputs || [], initial.bounds, true).query,
      interval: stream?.interval.value ?? 1000 }, frame => {
      if (!active || streams.get(id) !== job) return
      if (frame.kind === 'reset') { historyStarted = false; patch({ values: [], loading: true, latestLoading: true, error: '' }) }
      else if (frame.kind === 'inaccessible') { patch({ values: [], loading: false, latestLoading: false }); job.release() }
      else if (frame.kind === 'history' && frame.value) { patch({ values: [...(historyStarted ? entries.value[id].values : []), frame.value].slice(-400) }); historyStarted = true }
      else if (frame.kind === 'ready') { patch({ loading: false, ...(!historyStarted ? { values: [] } : {}) }); job.release() }
      else if (frame.kind === 'latest' && frame.latest) {
        const state = entries.value[id]
        const end = customRange.value ? state.bounds[1] : Date.now()
        const nextBounds: [number, number] = customRange.value ? state.bounds : [end - range.value, end]
        const values = new Map((historyStarted ? state.values : []).map(value => [value.resultId || JSON.stringify([value.metricId, value.evaluationTime, value.eventTime]), value]))
        for (const value of Object.values(frame.latest.outputs)) {
          const time = value.evaluationTime || value.eventTime || 0
          if (time < nextBounds[0] || time > nextBounds[1]) continue
          const key = value.resultId || JSON.stringify([value.metricId, value.evaluationTime, value.eventTime])
          values.set(key, newerMetricValue(values.get(key), value))
        }
        patch({ values: [...values.values()].sort((a,b) => (b.evaluationTime || b.eventTime || 0) - (a.evaluationTime || a.eventTime || 0)).slice(0,400), bounds: nextBounds, latestLoading: false })
        historyStarted = true
      }
      stream?.onFrame(id, frame)
    }, cause => {
      if (streams.get(id) !== job) return
      patch({ error: errorText(cause), loading: false, latestLoading: false })
      stopStream(id)
    })
    if (streams.get(id) === job) job.stop = stop
    else stop()
  }
  async function readHistory(target: MetricTrendTarget, state: MetricHistoryState) {
    const intervalOutputs = target.intervalOutputs || []
    const normal = target.outputs.filter(output => !intervalOutputs.includes(output))
    const configId = target.configId || target.id
    const scope = target.targetType && target.targetId ? { targetType: target.targetType, targetId: target.targetId } : {}
    const values = normal.length ? await api.history(configId, { ...metricHistoryRequest(normal, state.bounds), ...scope }) : []
    // Serial subqueries retain the panel's three-request limit and discard obsolete follow-ups.
    if (!active || entries.value[target.id] !== state || !intervalOutputs.length) return values
    return [...values, ...await api.history(configId, { ...metricHistoryRequest(intervalOutputs, state.bounds, true), ...scope })]
  }
  function reconcile() {
    const current = new Map(targets.value.map(target => [target.id, target]))
    const retained: Record<string, MetricHistoryState> = {}
    for (const [id, state] of Object.entries(entries.value)) {
      if (current.get(id)?.key === keys.get(id)) retained[id] = state
      else { stopStream(id); queued.delete(id); keys.delete(id) }
    }
    entries.value = retained
    for (const id of streams.keys()) if (!admitted.value.has(id)) { stopStream(id); delete entries.value[id] }
    if (!active) return
    for (const id of admitted.value) {
      const target = current.get(id)
      if (!target || entries.value[id]) continue
      const state: MetricHistoryState = { values: [], bounds: [...bounds], loading: true, latestLoading: Boolean(api.watchResults), error: '' }
      entries.value = { ...entries.value, [id]: state }
      keys.set(id, target.key)
      queued.set(id, { target, state })
    }
    drain()
  }
  function refresh(id?: string, restart = false) {
    const end = Date.now()
    bounds = customRange.value || [end - range.value, end]
    const next = { ...entries.value }
    for (const target of targets.value) {
      const key = target.id, previous = next[key]
      if (restart && !admitted.value.has(key)) { delete next[key]; continue }
      if ((!id || id === key) && admitted.value.has(key) && previous && (restart || !previous.loading)) {
        stopStream(key)
        const state = { ...previous, bounds: [...bounds] as [number, number], loading: true, error: '' }
        next[key] = state
        queued.set(key, { target, state })
      }
    }
    entries.value = next
    reconcile()
  }
  watch(targets, reconcile, { immediate: true })
  watch(admitted, reconcile)
  // 最新值变化由结果流更新；不能把一次快照赋值转换为整轮历史查询。
  if (stream) watch(stream.interval, () => refresh(undefined, true))
  // 同一对象切换查询时保留已显示的样本；新状态身份隔离旧请求，避免清空图表造成页面跳变。
  watch([range, customRange], () => { queued.clear(); refresh(undefined,true) })
  function pause() { active = false; queued.clear(); for (const id of streams.keys()) stopStream(id); entries.value = {} }
  function visibility() { if (document.hidden) pause(); else if (!active) { active = true; reconcile() } }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visibility)
  onDeactivated(pause)
  onActivated(() => { if (!active) { active = true; refresh() } })
  onScopeDispose(() => { pause(); observer?.disconnect(); elements.clear(); intersections.clear(); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibility) })
  return { entries, range, customRange, observe, refresh }
}
