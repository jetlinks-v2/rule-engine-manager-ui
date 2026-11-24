import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import { metricApi } from './api'
import { errorText } from './service'
import { metricHistoryRequest } from './useMetricTrends'
import { metricOutputPresentation } from './outputPresentation'
import type { MetricReadApi, MetricConfigHistory, MetricReference, MetricValue } from './types'

/** 旧口径按需读取；不加入实时订阅，不用当前输出定义解释已移除的输出。 */
export function useMetricHistoryVersions(reference: Ref<MetricReference>, open: Ref<boolean>, api: MetricReadApi = metricApi) {
  const versions = ref<MetricConfigHistory[]>([]), selected = ref<string>(), outputId = ref('')
  const values = ref<MetricValue[]>([]), loading = ref(false), listing = ref(false), error = ref('')
  const cursor = ref<number>(), range = ref(3600000), customRange = ref<[number, number]>()
  const bounds = ref<[number, number]>([Date.now() - range.value, Date.now()])
  const version = computed(() => versions.value.find(item => item.configuration.dataVersion === selected.value))
  const outputs = computed(() => version.value?.template.outputs.filter(item => item.persist !== false && !item.latestOnly) || [])
  const output = computed(() => outputs.value.find(item => item.metricId === outputId.value))
  const intervals = computed(() => !!output.value && metricOutputPresentation(output.value, { template: version.value?.template }).history === 'interval')
  let generation = 0, listGeneration = 0
  async function loadMore(reset = false) {
    if (!open.value || !api.historyVersions) return
    const token = ++listGeneration, target = reference.value
    listing.value = true; error.value = ''
    try {
      const page = await api.historyVersions(target.configId, reset ? undefined : cursor.value,
        target.targetType && target.targetId ? { targetType: target.targetType, targetId: target.targetId } : undefined)
      if (token !== listGeneration) return
      versions.value = reset ? page.records : [...versions.value, ...page.records]
      cursor.value = page.nextRevision ?? undefined
    } catch (cause) { if (token === listGeneration) { error.value = errorText(cause); if (reset) versions.value = [] } }
    finally { if (token === listGeneration) listing.value = false }
  }
  async function refresh() {
    const token = ++generation, snapshot = version.value, currentOutput = output.value
    values.value = []; error.value = ''
    if (!open.value || !snapshot || !currentOutput) { loading.value = false; return }
    loading.value = true
    const now = Date.now()
    bounds.value = customRange.value || [now - range.value, now]
    const config = snapshot.configuration, selectedTarget = reference.value
    const target = config.scope === 'children' ? selectedTarget : { targetType: config.targetType, targetId: config.targetId }
    try {
      const response = await api.history(config.id!, { ...metricHistoryRequest([currentOutput.metricId], bounds.value, intervals.value),
        targetType: target.targetType, targetId: target.targetId, dataVersion: config.dataVersion })
      if (token === generation) values.value = response
    } catch (cause) { if (token === generation) error.value = errorText(cause) }
    finally { if (token === generation) loading.value = false }
  }
  watch(selected, () => {
    const index = versions.value.findIndex(item => item.configuration.dataVersion === selected.value)
    const end = index > 0 ? versions.value[index - 1].recordedAt : Date.now()
    customRange.value = [end - range.value, end]
    outputId.value = outputs.value.find(item => item.metricId === reference.value.outputId)?.metricId || outputs.value[0]?.metricId || ''
  }, { flush: 'sync' })
  watch(() => JSON.stringify(reference.value), () => {
    generation++; listGeneration++; versions.value = []; values.value = []; selected.value = undefined; cursor.value = undefined
    if (open.value) void loadMore(true)
  })
  watch(open, value => {
    if (value) void loadMore(true)
    else { generation++; listGeneration++; values.value = []; selected.value = undefined; loading.value = false; listing.value = false }
  }, { immediate: true })
  watch([selected, outputId, range, customRange], () => { void refresh() })
  onScopeDispose(() => { generation++; listGeneration++ })
  return { versions, selected, version, outputId, outputs, output, intervals, values, loading, listing, error, cursor, range, customRange, bounds, loadMore, refresh }
}
