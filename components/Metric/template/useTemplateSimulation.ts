import { computed, reactive, ref, watch, type Ref } from 'vue'
import type { MetricSimulationResponse, MetricTemplate, MetricValue } from '../types'
import { nodeKey, nodeList } from './designer'
import { configurationObject, encodeConfiguration, type ConfigurationFormat } from './configurationText'
import { addSimulationSample, patchSimulationSample, visualSamples, type SimulationFacts } from './simulation'
import { simulationIndex, simulationNodeAt, type SimulationPreview } from './simulationPreview'
import { useAutoSimulation } from './useAutoSimulation'

/** 当前编辑会话的样本与观察游标；请求、模板保存及结果失效仍由 useMetricTemplates 负责。 */
export function useTemplateSimulation(options: {
  template: Ref<MetricTemplate | undefined>; text: Ref<string>; format: Ref<ConfigurationFormat>
  results: Ref<MetricValue[]>; response: Ref<MetricSimulationResponse | undefined>; loading: Ref<boolean>
  invalidate: () => void
  execution?: { run:() => Promise<void>; enabled:() => boolean; autoEnabled?:() => boolean }
}) {
  const facts = computed(() => {
    try {
      const value = configurationObject(options.text.value, options.format.value)
      return options.template.value && visualSamples(options.template.value, value) ? value : undefined
    } catch { return undefined }
  })
  const advanced = ref(false)
  const sampleInvalid = ref(false)
  const endAtInvalid = ref(false)
  const time = ref<number>()
  const timeSelected = ref(false)
  const selectedEntry = ref<string>()
  const hasResponse = ref(false)
  const index = computed<ReturnType<typeof simulationIndex>>(() => options.template.value
    ? simulationIndex(options.template.value, facts.value, options.results.value, options.response.value)
    : { series:new Map(), times:[], response:undefined })
  const position = computed(() => index.value.times.indexOf(time.value!))
  const invalid = computed(() => sampleInvalid.value || endAtInvalid.value || (!advanced.value && (!facts.value?.samples.length || facts.value.samples.some(sample => sample.value == null))))
  const execution = options.execution
  const automatic = execution && useAutoSimulation({ execute:execution.run,
    allowed:() => !!options.template.value && execution.enabled() && !invalid.value,
    active:() => !!facts.value && (execution.autoEnabled?.() ?? true) })
  // 异步加载模板后重新判断样本展示方式，避免加载期间误进入高级配置。
  watch(() => options.template.value?.id + ':' + options.template.value?.version, reset, { flush:'sync' })
  watch([options.text, options.format], ([_text, format], [_previous, previousFormat]) => {
    if (advanced.value && format === previousFormat) automatic?.schedule()
  }, { flush:'post' })
  if (execution) watch(execution.enabled, value => { if (!value) { automatic?.cancel(); options.invalidate() } }, { flush:'sync' })
  watch(index, () => {
    if (options.response.value) hasResponse.value = true
    // 默认跟随最新截点，主动选择后保留游标，避免自动试算将早期样本的编辑跳回末尾。
    if (!index.value.times.includes(time.value!)) timeSelected.value = false
    if (!timeSelected.value) time.value = index.value.times.at(-1)
    selectedEntry.value = undefined
  }, { immediate:true })
  const preview = computed<SimulationPreview>(() => ({ time:time.value, nodes:Object.fromEntries((options.template.value ? nodeList(options.template.value) : []).map(node => {
    const snapshot = simulationNodeAt(index.value, node, time.value, selectedEntry.value)
    if (!options.response.value) {
      snapshot.state = options.loading.value ? 'calculating' : hasResponse.value ? 'trialPending' : 'awaitSimulation'
      if (node.kind !== 'input') { snapshot.entry = undefined; snapshot.alternatives = []; snapshot.previous = false }
    }
    return [nodeKey(node), snapshot]
  })) }))
  function updateFacts(value:SimulationFacts) {
    const text = encodeConfiguration(value, options.format.value)
    if (text === options.text.value) return
    options.text.value = text; automatic?.schedule()
  }
  /** 只迁移逻辑映射键，样本仍属于原来的物理来源，不能改写报文身份。 */
  function renameInput(previous:string,next:string) {
    const value = facts.value
    if (!value || !Object.hasOwn(value.configuration.inputMappings,previous)) return
    const inputMappings = {...value.configuration.inputMappings,[next]:value.configuration.inputMappings[previous]}
    delete inputMappings[previous]
    updateFacts({...value,configuration:{...value.configuration,inputMappings}})
  }
  function selectTime(value:number) { timeSelected.value = true; time.value = value; selectedEntry.value = undefined }
  function setSampleInvalid(value:boolean) {
    const previous = sampleInvalid.value
    sampleInvalid.value = value
    if (value) options.invalidate()
    else if (previous) automatic?.schedule()
  }
  function changeEndAt(text:string) {
    if (!facts.value) return
    const value = text ? new Date(text).getTime() : undefined
    endAtInvalid.value = value !== undefined && !Number.isFinite(value)
    if (endAtInvalid.value) { options.invalidate(); return }
    const next = { ...facts.value }
    if (value === undefined) delete next.endAt
    else next.endAt = value
    updateFacts(next)
  }
  function addSample(inputId:string) {
    if (!facts.value || !options.template.value) return
    const at = time.value ?? Date.now()
    updateFacts(addSimulationSample(options.template.value, facts.value, inputId, at)); selectTime(at)
  }
  function patchValue(index:number, value:unknown) {
    if (facts.value) updateFacts(patchSimulationSample(facts.value, index, { value:value ?? null }))
  }
  function reset() {
    automatic?.cancel()
    advanced.value = !facts.value; sampleInvalid.value = false; endAtInvalid.value = false
    hasResponse.value = false; selectedEntry.value = undefined; timeSelected.value = false; time.value = index.value.times.at(-1)
  }
  return reactive({ facts, advanced, sampleInvalid, endAtInvalid, invalid, time, selectedEntry, index, position, preview,
    loading:options.loading, format:options.format, text:options.text, results:options.results, response:options.response,
    updateFacts, renameInput, selectTime, setSampleInvalid, changeEndAt, addSample, patchValue, reset,
    run:() => automatic?.run() || Promise.resolve(), schedule:() => automatic?.schedule(), cancel:() => automatic?.cancel() })
}
export type TemplateSimulationState = ReturnType<typeof useTemplateSimulation>
