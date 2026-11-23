import { computed, onActivated, onDeactivated, onMounted, onScopeDispose, ref, watch, type Ref } from 'vue'
import { metricApi } from './api'
import { copy, errorText, outputId, metricDataTarget, metricValueMatches, newerMetricValue } from '@jetlinks-web-core/components/Metric/service'
import { loadMetricLatest, metricLatestBatches } from '@jetlinks-web-core/components/Metric/extensions/latestBatch'
import { presentationSettings, primaryMetricOutput, summaryMetricOutputs } from '@jetlinks-web-core/components/Metric/extensions/presentationSettings'
import type { MetricApi, MetricConfig, MetricContext, MetricLatest, MetricReference, MetricResultFrame, MetricRuntime, MetricTemplate, MetricValue } from '@jetlinks-web-core/components/Metric/types'

const templateRevisionKey = (config: MetricConfig) => JSON.stringify([config.templateId, config.templateVersion, config.templateRevision || 1])

/** 一个面板管理一个对象；旧请求不得回填切换后的对象。轮询随页面可见性暂停。 */
export function useMetricPanel(context: Ref<MetricContext>, api: MetricApi = metricApi, initialReference?: Ref<MetricReference | undefined>) {
  const configurations = ref<MetricConfig[]>([])
  const templates = ref<Record<string, MetricTemplate>>({})
  const outputs = ref<Record<string, Record<string, MetricValue>>>({})
  const runtimes = ref<Record<string, MetricRuntime>>({})
  const itemErrors = ref<Record<string, string>>({})
  const inaccessibleIds = ref<string[]>([])
  const latestErrors = ref<Record<string, string>>({})
  const actionError = ref('')
  const loading = ref(false)
  const error = ref('')
  const busyId = ref('')
  const selectedId = ref('')
  const selectedOutputId = ref('')
  const editorOpen = ref(false)
  const editing = ref<MetricConfig>()
  const refreshInterval = ref(1000)
  const subscriptions = new Map<string, () => void>()
  let focusReturn: MetricReference | undefined
  let initialSelectionPending = true
  let hasSnapshot = false
  let generation = 0
  let ownerEpoch = 0
  let writeSequence = 0
  let active = true
  let timer: ReturnType<typeof setTimeout> | undefined
  let inFlight: Promise<void> | undefined
  let scheduleGeneration = 0
  const selected = computed(() => configurations.value.find(config => config.id === selectedId.value))
  const canManage = (config: MetricConfig) => Boolean(context.value.editable && config.ownerType === context.value.ownerType && config.ownerId === context.value.ownerId)
  const selectedOutput = computed(() => templates.value[selectedId.value]?.outputs.find(output => outputId(output) === selectedOutputId.value))
  // 临时读取失败不撤销已打开的结果；只有成功确认的权限/配置变化清理查看作用域。
  const reference = computed<MetricReference | undefined>(() => selected.value?.id && selectedOutput.value && !inaccessibleIds.value.includes(selected.value.id)
    ? { configId: selected.value.id, outputId: outputId(selectedOutput.value),
      ...(selected.value.scope === 'children' ? metricDataTarget(selected.value, context.value) : {}) } : undefined)
  const selectedLatest = computed<MetricLatest | undefined>(() => reference.value ? {
    configId: reference.value.configId, outputs: outputs.value[reference.value.configId] || {}, runtime: runtimes.value[reference.value.configId]
  } : undefined)
  const cards = computed(() => configurations.value.flatMap(config => config.id
    ? (templates.value[config.id]?.outputs || (api.watchResults && !itemErrors.value[config.id] ? [{ metricId: '' }] : [])).map(output => ({ config, output, reference: { configId: config.id!, outputId: outputId(output) } })) : []))
  const cardGroups = computed(() => {
    const groups = new Map<string, typeof cards.value>()
    for (const card of cards.value) {
      const group = groups.get(card.reference.configId)
      if (group) group.push(card)
      else groups.set(card.reference.configId, [card])
    }
    return [...groups.values()].map(group => {
      const first = group[0]
      const template = templates.value[first.reference.configId]
      if (!template) return { ...first, secondary: [], settings: {} }
      const id = outputId(primaryMetricOutput(template, first.config))
      const primary = group.find(card => card.reference.outputId === id) || first
      const summaryIds = summaryMetricOutputs(template, first.config).map(outputId)
      return { ...primary, secondary: summaryIds.flatMap(id => group.filter(card => card.reference.outputId === id)), settings: presentationSettings(template, first.config) }
    })
  })

  /** 手动选择或关闭会消费返回定位；后续轮询、prop 变化和恢复权限都不能重开详情。 */
  function closeDetail() { initialSelectionPending = false; selectedId.value = ''; selectedOutputId.value = ''; focusReturn = undefined }
  function select(configId: string, output: string) {
    initialSelectionPending = false
    if (!configurations.value.some(config => config.id === configId) || inaccessibleIds.value.includes(configId) || latestErrors.value[configId]
      || !templates.value[configId]?.outputs.some(item => outputId(item) === output)) return
    editorOpen.value = false
    editing.value = undefined
    focusReturn = undefined
    selectedId.value = configId
    selectedOutputId.value = output
  }
  /** 趋势和编辑共用一个抽屉；保存后回到刷新后的概览，不自动加载某个输出的历史。 */
  function openEditor(config?: MetricConfig) {
    if (!context.value.editable || config && !canManage(config)) return
    closeDetail()
    editing.value = config ? copy(config) : undefined
    editorOpen.value = true
  }
  function closeDrawer() { closeDetail(); editorOpen.value = false; editing.value = undefined }
  /** 仅主动关闭趋势时记录回焦目标；程序关闭、切换对象及进入编辑都会撤销它。 */
  function dismissDrawer() {
    const target = reference.value
    closeDrawer()
    focusReturn = target
  }
  /** 由抽屉退场事件消费，关闭期间撤权或重新打开详情后不恢复旧焦点。 */
  function takeFocusReference(): MetricReference | undefined {
    const target = focusReturn
    focusReturn = undefined
    return target && !editorOpen.value && !reference.value && !error.value && cards.value.some(card =>
      card.reference.configId === target.configId && card.reference.outputId === target.outputId)
      && !inaccessibleIds.value.includes(target.configId) && !latestErrors.value[target.configId] ? target : undefined
  }
  async function refreshAfterWrite(current: () => boolean) {
    if (inFlight) await inFlight
    if (current()) await refresh()
  }
  async function saved() {
    if (!active) return
    const epoch = ownerEpoch
    const operation = writeSequence
    closeDrawer()
    await refreshAfterWrite(() => active && epoch === ownerEpoch && operation === writeSequence)
  }

  /** 写入只属于发起时的对象与操作；轮询不改变该身份，退场和对象切换会撤销它。 */
  async function writeConfig(config: MetricConfig, action: (id: string) => Promise<unknown>, feedback = error, onSaved?: () => void): Promise<boolean> {
    if (!active || !canManage(config) || !config.id) return false
    const epoch = ownerEpoch
    const operation = ++writeSequence
    const current = () => active && epoch === ownerEpoch && operation === writeSequence
    busyId.value = config.id
    feedback.value = ''
    try {
      await action(config.id)
      if (current()) {
        onSaved?.()
        await refreshAfterWrite(current)
      }
      return true
    } catch (cause) {
      if (current()) feedback.value = errorText(cause)
      return false
    } finally { if (current()) busyId.value = '' }
  }
  function invalidateWrites() { ownerEpoch++; busyId.value = '' }

  /** Manual refresh, activation and poll share one owner request; an owner switch detaches the old task. */
  function refresh(readValues = true): Promise<void> {
    if (inFlight) return inFlight
    const task = readSnapshot(readValues)
    inFlight = task
    void task.finally(() => { if (inFlight === task) inFlight = undefined })
    return task
  }
  async function readSnapshot(readValues: boolean) {
    const token = ++generation
    const owner = copy(context.value)
    // 成功的空列表也是快照，后台轮询不能在关联卡片前重新插入首屏骨架。
    loading.value = !hasSnapshot
    error.value = ''
    try {
      const configs = await api.byOwner(owner.ownerType, owner.ownerId)
      if (token !== generation) return
      const metadata: Record<string, MetricTemplate> = {}
      const errors: Record<string, string> = {}
      const cache = new Map(configurations.value.flatMap(config => config.id && templates.value[config.id]
        ? [[templateRevisionKey(config), templates.value[config.id]] as const] : []))
      if (api.watchResults) {
        templates.value = Object.fromEntries(configs.flatMap(config => config.id && cache.has(templateRevisionKey(config)) ? [[config.id, cache.get(templateRevisionKey(config))!]] : []))
        configurations.value = configs; loading.value = false; itemErrors.value = {}
      }
      const pending = new Map<string, Promise<MetricTemplate>>()
      let next = 0
      await Promise.all(Array.from({ length: Math.min(4, configs.length) }, async () => {
        while (next < configs.length && token === generation) {
          const config = configs[next++]
          if (!config.id) continue
          const key = templateRevisionKey(config)
          try {
            let request = pending.get(key)
            if (!request) { request = cache.has(key) ? Promise.resolve(cache.get(key)!) : api.configTemplate(config.id, metricDataTarget(config, owner)); pending.set(key, request) }
            const template = await request
            if (token !== generation) return
            metadata[config.id] = template
            if (api.watchResults) templates.value = { ...templates.value, [config.id]: template }
          } catch (cause) { if (token === generation) { errors[config.id] = errorText(cause); itemErrors.value = { ...errors } } }
        }
      }))
      if (token !== generation) return
      const targets = new Map(configs.flatMap(config => config.id ? [[config.id, metricDataTarget(config, owner)] as const] : []))
      const ids = [...targets.keys()]
      // 持续流更新当前值；低频同步只刷新配置，不重复读取最新值或重建有效订阅。
      const latest = !api.watchResults && (readValues || !api.watchLatest || !subscriptions.size || Object.keys(latestErrors.value).length || inaccessibleIds.value.length)
        ? await loadMetricLatest(api, ids, outputs.value, inaccessibleIds.value, () => token === generation, runtimes.value, targets)
        : { outputs: Object.fromEntries(ids.map(id => [id, outputs.value[id] || {}])),
          runtimes: Object.fromEntries(ids.filter(id => runtimes.value[id]).map(id => [id, runtimes.value[id]])),
          inaccessibleIds: inaccessibleIds.value.filter(id => ids.includes(id)), errors: { ...latestErrors.value } }
      if (token !== generation || !latest) return
      hasSnapshot = true
      configurations.value = configs
      templates.value = metadata
      itemErrors.value = errors
      for (const config of configs) {
        if (!config.id || latest.inaccessibleIds.includes(config.id)) continue
        if (config.state === 'disabled') { latest.outputs[config.id] = {}; continue }
        const target = metricDataTarget(config, owner)
        for (const [output, previous] of Object.entries(outputs.value[config.id] || {})) {
          if (metricValueMatches(config, target, previous)) {
            const incoming = latest.outputs[config.id]?.[output]
            if (incoming) latest.outputs[config.id][output] = newerMetricValue(previous, incoming)
          }
        }
      }
      outputs.value = latest.outputs
      runtimes.value = latest.runtimes
      latestErrors.value = latest.errors
      inaccessibleIds.value = latest.inaccessibleIds
      // 退场期间撤销过的目标不因随后恢复可读而重新获得焦点。
      if (focusReturn && (!cards.value.some(card => card.reference.configId === focusReturn?.configId
        && card.reference.outputId === focusReturn?.outputId) || inaccessibleIds.value.includes(focusReturn.configId) || latestErrors.value[focusReturn.configId])) focusReturn = undefined
      // 已有草稿同样服从成功读取后的权限集合；临时读取失败和未保存新增不据此丢弃编辑。
      const editingId = editing.value?.id
      if (editingId && (!ids.includes(editingId) || (!latest.errors[editingId] && inaccessibleIds.value.includes(editingId)))) closeDrawer()
      // 返回引用只用于首次定位，必须先经过当前对象、固定模板和最新值的可读性边界。
      if (initialSelectionPending) {
        const initial = initialReference?.value
        if (initial && configs.some(config => config.id === initial.configId) && !inaccessibleIds.value.includes(initial.configId) && !latest.errors[initial.configId]
          && metadata[initial.configId]?.outputs.some(output => outputId(output) === initial.outputId)) select(initial.configId, initial.outputId)
        // 仅目标引用的暂时读取失败保留重试；成功撤权、对象/输出不存在仍消费定位。
        const retryable = initial && ids.includes(initial.configId) && (latest.errors[initial.configId]
          || (!inaccessibleIds.value.includes(initial.configId) && errors[initial.configId]))
        if (!retryable) initialSelectionPending = false
      }
      if (selectedId.value && !reference.value) closeDetail()
      synchronizeSubscriptions()
    } catch (cause) {
      if (token === generation) {
        error.value = errorText(cause)
        stopSubscriptions()
      }
    } finally { if (token === generation) loading.value = false }
  }
  async function setEnabled(config: MetricConfig, enabled: boolean) {
    await writeConfig(config, id => api.getConfig(id).then(saved => api.saveConfig({ ...saved, state: enabled ? 'enabled' : 'disabled' })))
  }
  async function remove(config: MetricConfig): Promise<boolean> {
    return writeConfig(config, id => api.removeConfig(id), actionError, () => {
      if (selectedId.value === config.id || editing.value?.id === config.id) closeDrawer()
    })
  }
  function stop() { scheduleGeneration++; if (timer) clearTimeout(timer); timer = undefined }
  function stopSubscriptions() { subscriptions.forEach(stop => stop()); subscriptions.clear() }
  function synchronizeSubscriptions() {
    if (api.watchResults) return
    if (!api.watchLatest || !active || document.hidden || error.value) { stopSubscriptions(); return }
    const byId = new Map<string, ReturnType<typeof metricDataTarget>>()
    for (const config of configurations.value) {
      if (!config.id || config.state !== 'enabled' || inaccessibleIds.value.includes(config.id) || latestErrors.value[config.id]) continue
      byId.set(config.id, metricDataTarget(config, context.value))
    }
    const targets = new Map(metricLatestBatches([...byId.keys()].sort(), byId)
      .map(batch => [JSON.stringify([batch.target, batch.ids]), batch]))
    for (const [key, stop] of subscriptions) if (!targets.has(key)) { stop(); subscriptions.delete(key) }
    for (const [key, { target, ids }] of targets) {
      if (subscriptions.has(key)) continue
      let current = true
      const stop = api.watchLatest(ids, target, refreshInterval.value, snapshot => {
        if (!current || !active || document.hidden) return
        const id = snapshot.configId, config = configurations.value.find(item => item.id === id)
        if (!ids.includes(id) || !config) return
        if (snapshot.inaccessible) {
          delete outputs.value[id]; delete runtimes.value[id]
          if (!inaccessibleIds.value.includes(id)) inaccessibleIds.value.push(id)
          if (selectedId.value === id || editing.value?.id === id) closeDrawer()
          return
        }
        const values: Record<string, MetricValue> = {}
        for (const [output, value] of Object.entries(snapshot.outputs)) {
          if (templates.value[id]?.outputs.some(item => item.metricId === output)
            && metricValueMatches(config, metricDataTarget(config, context.value), value)) {
            values[output] = newerMetricValue(outputs.value[id]?.[output], value)
          }
        }
        // 配置刷新后仍可能收到在途旧修订；不能用不匹配的结果清空当前修订。
        if (Object.keys(snapshot.outputs).length && !Object.keys(values).length) return
        outputs.value[id] = values
        inaccessibleIds.value = inaccessibleIds.value.filter(item => item !== id)
        delete latestErrors.value[id]
        if (snapshot.runtime) runtimes.value[id] = snapshot.runtime
        else delete runtimes.value[id]
      }, cause => {
        if (!current) return
        current = false; subscriptions.delete(key)
        for (const id of ids) latestErrors.value[id] = errorText(cause)
      })
      if (current) subscriptions.set(key, () => { current = false; stop() })
      else stop()
    }
  }
  async function poll() {
    stop()
    const scheduleToken = scheduleGeneration
    if (!active || document.hidden) return
    await refresh(false)
    if (!api.watchResults && scheduleToken === scheduleGeneration && active && !document.hidden) timer = setTimeout(poll, 15000)
  }
  function receiveResult(id: string, frame: MetricResultFrame) {
    const config = configurations.value.find(item => item.id === id)
    if (!config) return
    if (frame.kind === 'changed') {
      const epoch = ownerEpoch
      void refreshAfterWrite(() => active && epoch === ownerEpoch)
      return
    }
    if (frame.kind === 'reset' || frame.kind === 'inaccessible') {
      delete outputs.value[id]; delete runtimes.value[id]; delete latestErrors.value[id]
      inaccessibleIds.value = inaccessibleIds.value.filter(item => item !== id)
      if (frame.kind === 'inaccessible') {
        inaccessibleIds.value.push(id)
        if (selectedId.value === id || editing.value?.id === id) closeDrawer()
      }
    } else if (frame.kind === 'latest' && frame.latest) {
      const incoming = frame.latest
      if (incoming.inaccessible) { receiveResult(id, { kind: 'inaccessible' }); return }
      const values = { ...outputs.value[id] }
      for (const [output, value] of Object.entries(incoming.outputs)) {
        if (templates.value[id]?.outputs.some(item => item.metricId === output) && metricValueMatches(config, metricDataTarget(config, context.value), value)) {
          values[output] = newerMetricValue(values[output], value)
        }
      }
      outputs.value[id] = values
      if (incoming.runtime) runtimes.value[id] = incoming.runtime
      inaccessibleIds.value = inaccessibleIds.value.filter(item => item !== id)
    }
  }
  function visibility() { if (document.hidden) { stop(); stopSubscriptions() } else void poll() }
  watch(refreshInterval, () => { stopSubscriptions(); synchronizeSubscriptions() })
  watch([() => context.value.ownerType, () => context.value.ownerId], () => {
    generation++
    stopSubscriptions()
    invalidateWrites()
    inFlight = undefined
    hasSnapshot = false
    configurations.value = []
    templates.value = {}
    outputs.value = {}
    runtimes.value = {}
    itemErrors.value = {}
    inaccessibleIds.value = []
    latestErrors.value = {}
    actionError.value = ''
    // owner 变化撤销旧详情和草稿；initialReference 只在本次面板首次读取成功时消费。
    closeDrawer()
    void poll()
  }, { flush: 'sync' })
  watch(() => context.value.editable, editable => { if (!editable && editorOpen.value) closeDrawer() }, { flush: 'sync' })
  onMounted(() => { document.addEventListener('visibilitychange', visibility); void poll() })
  onActivated(() => { if (!active) { active = true; void poll() } })
  onDeactivated(() => { active = false; generation++; invalidateWrites(); stop(); stopSubscriptions() })
  onScopeDispose(() => { active = false; generation++; invalidateWrites(); stop(); stopSubscriptions(); document.removeEventListener('visibilitychange', visibility) })
  async function rename(config: MetricConfig, name: string) {
    await writeConfig(config, id => api.getConfig(id).then(saved => api.saveConfig({ ...saved, name })))
  }
  return { configurations, templates, outputs, runtimes, selectedLatest, itemErrors, inaccessibleIds, latestErrors, actionError, loading, error, busyId, selectedId, selectedOutputId,
    selected, selectedOutput, reference, cards, cardGroups, select, closeDetail, editorOpen, editing, openEditor, closeDrawer, dismissDrawer, takeFocusReference, saved, refresh, setEnabled, rename, remove, canManage, refreshInterval, receiveResult }
}
