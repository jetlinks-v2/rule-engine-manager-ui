import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import { metricApi } from './api'
import { copy, errorText } from './service'
import { useTemplateSimulation } from './template/useTemplateSimulation'
import { addSimulationSample, type SimulationFacts } from './template/simulation'
import type { MetricApi, MetricConfig, MetricSimulationResponse, MetricTemplate, MetricValue } from './types'

/** 业务试算只提交固定模板引用与显式样本；过程展示复用模板试算的索引与虚拟时钟。 */
export function useMetricConfigTrial(template:Ref<MetricTemplate | undefined>, configuration:Ref<MetricConfig>, editable:Ref<boolean>, api:Pick<MetricApi,'simulateConfig'> = metricApi, ready:() => boolean = () => true) {
  const text = ref('')
  const format = ref<'json'>('json')
  const response = ref<MetricSimulationResponse>()
  const results = computed(() => response.value?.results || [])
  const loading = ref(false)
  const error = ref('')
  const active = ref(false)
  const readingSample = ref(false), sampleReadError = ref('')
  let generation = 0
  const supported = computed(() => configuration.value.scope !== 'children' && Object.values(configuration.value.inputMappings).every(mapping => mapping.kind !== 'metric' || !!mapping.configId))
  function invalidate() { generation++; response.value = undefined; error.value = '' }
  const trial = useTemplateSimulation({ template, text, format, response, results, loading, invalidate,
    execution:{ run:execute, enabled:() => editable.value && supported.value && ready(), autoEnabled:() => active.value } })
  const bindings = computed(() => JSON.stringify([configuration.value.templateId, configuration.value.templateVersion, configuration.value.templateRevision, configuration.value.scope, configuration.value.inputMappings]))
  watch([bindings, () => JSON.stringify(configuration.value.parameters)], ([key], old) => {
    const previous = old && key === old[0] ? trial.facts : undefined
    if (!previous) trial.cancel()
    text.value = JSON.stringify({ configuration:copy(configuration.value), samples:previous?.samples || [], endAt:previous?.endAt })
    invalidate()
    if (previous) trial.schedule()
    else trial.reset()
  }, { immediate:true, flush:'sync' })
  watch(text, invalidate, { flush:'sync' })
  watch(supported, value => { if (!value) { active.value = false; invalidate() } })
  watch(editable, value => { if (!value) { active.value = false; text.value = ''; invalidate() } })
  watch(active, value => { if (!value) { trial.cancel(); invalidate() } }, { flush:'sync' })
  /** 真实读取只在显式操作时进行，沿来源身份追加样本，保留采集时间；绑定换代后丢弃迟到结果。 */
  async function readSample(inputId:string, read:()=>Promise<MetricValue | undefined>) {
    if (readingSample.value || !template.value || !trial.facts || !editable.value || !active.value) return
    const identity = bindings.value
    readingSample.value = true; sampleReadError.value = ''
    try {
      const value = await read()
      if (identity !== bindings.value || !active.value || !editable.value) return
      const time = value?.eventTime ?? value?.timestamp
      if (!value || time == null || !Number.isFinite(time)) { sampleReadError.value = 'sampleReadEmpty'; return }
      const next = addSimulationSample(template.value,trial.facts,inputId,time)
      const index = next.samples.length - 1
      next.samples[index] = {...next.samples[index],value:value.value,unit:value.unit,eventTime:time,
        ingestTime:value.ingestTime ?? time,processTime:value.processTime ?? time}
      trial.updateFacts(next); trial.selectTime(time)
    } catch { if (identity === bindings.value) sampleReadError.value = 'sampleReadFailed' }
    finally { readingSample.value = false }
  }
  async function execute() {
    if (loading.value || !editable.value || !supported.value || trial.invalid || !trial.facts) return
    const token = ++generation
    loading.value = true; error.value = ''; response.value = undefined
    try {
      const facts = trial.facts as SimulationFacts
      const value = await api.simulateConfig({ configuration:copy(configuration.value), samples:copy(facts.samples),
        endAt:typeof facts.endAt === 'number' ? facts.endAt : undefined, includeIntermediate:true, includeRecords:true })
      if (token === generation) { response.value = value; error.value = value.error || '' }
    } catch (cause) { if (token === generation) error.value = errorText(cause) }
    finally { loading.value = false }
  }
  onScopeDispose(invalidate)
  return { trial, active, supported, run:trial.run, error, readingSample, sampleReadError, readSample }
}
