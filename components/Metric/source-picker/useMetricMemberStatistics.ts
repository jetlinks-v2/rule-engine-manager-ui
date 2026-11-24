import { computed, onScopeDispose, ref, watch, type Ref, type ShallowRef } from 'vue'
import type { MetricInputMapping, MetricScopeStatistics, MetricSourceRequest, MetricSourceSelection } from '../types'
import { loadMetricInheritedOutputs, loadMetricProductName, queryMetricProducts, type MetricOutputSource } from '../../../api/metricSources'
import { durationSeconds } from '../template/window'

const numeric = (item:MetricOutputSource) => !item.output.valueType || ['number', 'int', 'long', 'float', 'double', 'decimal'].includes(item.output.valueType)
const outputKey = (item:MetricOutputSource) => `${item.config.id}/${item.output.metricId}`
const validZone = (zone:string) => { try { new Intl.DateTimeFormat('en', { timeZone:zone }); return !!zone } catch { return false } }
const defaults = ():MetricScopeStatistics => ({ memberType:'device', sourceType:'product', sourceId:'', operation:'count', operator:'gt',
  value:0, maxAge:'PT10M', period:'current', zone:Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' })

/** 只持有当前配置会话的有界候选，未完成的配置不能作为一个普通标量绑定。 */
export function useMetricMemberStatistics(request:ShallowRef<MetricSourceRequest | undefined>,
  scope:Ref<{ type:string; id:string } | undefined>, includeChildren:Ref<boolean>, accept:(selection:MetricSourceSelection) => void) {
  const active = ref(false), choosingProduct = ref(false), loading = ref(false), error = ref(false)
  const productId = ref(''), keyword = ref(''), page = ref(1), total = ref(0)
  const products = ref<{ id:string; name:string }[]>([]), outputs = ref<MetricOutputSource[]>([])
  const productName = ref('')
  const selectedKey = ref(''), spec = ref<MetricScopeStatistics>(defaults())
  let generation = 0
  const selected = computed(() => outputs.value.find(item => outputKey(item) === selectedKey.value))
  const auxiliary = computed(() => outputs.value.filter(item => item.config.id === selected.value?.config.id && numeric(item)
    && item.output.metricId !== selected.value?.output.metricId))
  const productLabel = computed(() => productName.value || productId.value)
  const problems = computed(() => {
    const value = spec.value, issues:string[] = [], age = durationSeconds(value.maxAge)
    if (!age || age > 86400) issues.push('statisticsInvalidAge')
    if (!validZone(value.zone)) issues.push('statisticsInvalidZone')
    if (value.operation === 'count' && !value.operator || value.operator && (value.value === undefined || value.value === ''
      || typeof value.value === 'number' && !Number.isFinite(value.value)
      || !['eq','ne'].includes(value.operator) && typeof value.value !== 'number')) issues.push('statisticsMissingCondition')
    if (value.period !== 'current') {
      if (!auxiliary.value.some(item => item.output.metricId === value.periodMetricId)) issues.push('statisticsMissingStart')
      if (!auxiliary.value.some(item => item.output.metricId === value.coverageMetricId)) issues.push('statisticsMissingCoverage')
      if (value.periodMetricId && value.periodMetricId === value.coverageMetricId) issues.push('statisticsDistinctOutputs')
    }
    return issues
  })
  const canConfirm = computed(() => {
    const item = selected.value, value = spec.value
    if (!active.value || choosingProduct.value || !request.value || request.value.scheduled === false || request.value.input.source?.lookback || loading.value || error.value
      || !scope.value || !item || !productId.value || value.operation === 'sum' && !numeric(item)) return false
    return !problems.value.length
  })
  async function search() {
    const token = ++generation
    loading.value = true; error.value = false
    try {
      const result = await queryMetricProducts(keyword.value, page.value - 1)
      if (token === generation) { products.value = result.data; total.value = result.total }
    } catch { if (token === generation) error.value = true }
    finally { if (token === generation) loading.value = false }
  }
  async function selectProduct(id:string, restoring = false) {
    const token = ++generation
    productId.value = id; choosingProduct.value = false; outputs.value = []
    productName.value = products.value.find(item => item.id === id)?.name || ''
    if (!restoring) { selectedKey.value = ''; spec.value.periodMetricId = undefined; spec.value.coverageMetricId = undefined }
    loading.value = true; error.value = false
    try {
      const [result, name] = await Promise.all([loadMetricInheritedOutputs(id), productName.value || loadMetricProductName(id)])
      if (token === generation) { outputs.value = result.filter(item => item.config.id !== request.value?.configId); productName.value = name }
    } catch { if (token === generation) error.value = true }
    finally { if (token === generation) loading.value = false }
  }
  function open(mapping?:MetricInputMapping) {
    generation++; active.value = true; outputs.value = []; products.value = []; keyword.value = ''; page.value = 1
    spec.value = mapping?.statistics ? { ...mapping.statistics } : defaults()
    productId.value = mapping?.statistics?.sourceId || (scope.value?.type === 'product' ? scope.value.id : '')
    selectedKey.value = mapping?.configId ? `${mapping.configId}/${mapping.id}` : ''
    if (productId.value) void selectProduct(productId.value, true)
    else { choosingProduct.value = true; void search() }
  }
  function selectOutput(item:MetricOutputSource) {
    selectedKey.value = outputKey(item)
    spec.value.periodMetricId = undefined; spec.value.coverageMetricId = undefined
    if (!numeric(item)) { spec.value.operation = 'count'; spec.value.operator = 'eq' }
    spec.value.value = !spec.value.operator ? undefined : item.output.valueType === 'boolean' ? true : numeric(item) ? 0 : ''
  }
  function operation(value:MetricScopeStatistics['operation']) {
    spec.value.operation = value
    if (value === 'count' && !spec.value.operator) { spec.value.operator = 'gt'; spec.value.value = 0 }
  }
  function predicate(value:MetricScopeStatistics['operator']) { spec.value.operator = value; spec.value.value = value ? selected.value?.output.valueType === 'boolean' ? true : selected.value && numeric(selected.value) ? 0 : '' : undefined }
  function confirm(label:string) {
    if (!canConfirm.value || !selected.value || !scope.value) return
    const value = { ...spec.value, sourceId:productId.value }
    if (value.period === 'current') { delete value.periodMetricId; delete value.coverageMetricId }
    accept({ mapping:{ kind:'metric', configId:selected.value.config.id, id:selected.value.output.metricId,
      thingType:scope.value.type, thingId:scope.value.id, includeChildren:includeChildren.value, statistics:value }, label })
  }
  function close() { generation++; active.value = false; loading.value = false }
  function changeProduct() { choosingProduct.value = true; page.value = 1; void search() }
  function changePage(value:number) { page.value = value; void search() }
  watch(request, value => { if (!value) close() })
  onScopeDispose(close)
  return { active, choosingProduct, loading, error, productId, productLabel, products, keyword, page, total, outputs, selectedKey,
    spec, selected, auxiliary, problems, canConfirm, numeric, outputKey, open, close, search, selectProduct, selectOutput, operation, predicate, confirm, changeProduct, changePage }
}
export type MetricMemberStatisticsState = ReturnType<typeof useMetricMemberStatistics>
