import type { MetricActionRecord, MetricSimulationResponse, MetricTemplate, MetricValue } from '../types'
import { nodeKey, type TemplateNode } from './designer'
import { evaluationTime } from './simulationFlow'
import { sampleExecutionTime, sampleInputs, type SimulationFacts, type SimulationSample } from './simulation'
import { metricValueLabels, metricValueSchema, metricValueUnit } from '../valueSemantics'
import { metricState } from '../presentation'
import type { MetricCalculatorDescriptor } from '../types'

export interface SimulationEntry {
  key: string
  time: number
  order: number
  value?: MetricValue
  record?: MetricActionRecord
  sample?: SimulationSample
  sampleIndex?: number
}
export interface SimulationNodePreview {
  entry?: SimulationEntry
  alternatives: SimulationEntry[]
  previous: boolean
  state: 'awaitSimulation' | 'trialPending' | 'calculating' | 'processUnavailable' | 'notExecuted' | 'notApplicable' | 'calculationFailed' | 'trialProduced' | 'trialInput' | 'notTriggered' | 'stepNoResult'
}
export interface SimulationPreview {
  time?: number
  nodes: Record<string, SimulationNodePreview>
}

/** 响应未携带单位时，复用模板声明；只影响显示，不修改真实结果。 */
export function simulationUnit(template: MetricTemplate, node: TemplateNode, entry?: SimulationEntry) {
  if (entry?.value?.unit || entry?.sample?.unit) return entry.value?.unit || entry.sample?.unit
  if (node.kind === 'input') return template.inputDefinitions[node.index]?.unit
  if (node.kind === 'output') return template.outputs[node.index]?.unit
  return template.outputs.find(output => output.metricId === (entry?.value?.metricId || template.definitions[node.index]?.id))?.unit
}

/** 节点、结果面板与时间轴读取同一份声明，不从输出名称或字段名猜测状态和单位。 */
export function simulationMeaning(template:MetricTemplate, node:TemplateNode, entry?:SimulationEntry, calculators:MetricCalculatorDescriptor[] = []) {
  const id = String(node.kind === 'input' ? template.inputDefinitions[node.index]?.id || ''
    : node.kind === 'output' ? template.outputs[node.index]?.metricId || '' : template.definitions[node.index]?.id || '')
  return { labels:metricValueLabels(template,id), schema:metricValueSchema(template,id,calculators),
    unit:simulationUnit(template,node,entry) || metricValueUnit(template,id,calculators) }
}

/** 索引同一份响应，不复制结果或历史数组；时间只定位展示组，结果与过程按显式身份关联。 */
export function simulationIndex(template: MetricTemplate, facts: SimulationFacts | undefined, results: MetricValue[], response?: MetricSimulationResponse) {
  const series = new Map<string, SimulationEntry[]>()
  const times = new Set<number>()
  const put = (key: string, entry: SimulationEntry) => {
    if (!Number.isFinite(entry.time)) return
    times.add(entry.time)
    const values = series.get(key) || []
    values.push(entry); series.set(key, values)
  }
  const records = response?.records || []
  const byId = new Map(records.map(record => [record.id, record]))
  const recordOrder = new Map(records.map((record, index) => [record.id, index]))
  const outputs = new Map<number, MetricActionRecord>()
  for (const record of records) if (record.action === 'metric.output' && typeof record.attributes.resultIndex === 'number') outputs.set(record.attributes.resultIndex, record)
  const resultEntries = results.map((value, index) => {
    const output = outputs.get(index)
    const parent = output?.parentId ? byId.get(output.parentId) : undefined
    return { key:`result-${index}`, time:Number(evaluationTime(value)), order:output ? recordOrder.get(output.id)! : records.length + index, value, record:parent?.action === 'metric.node' ? parent : undefined }
  })
  const byMetric = new Map<string, SimulationEntry[]>()
  for (const entry of resultEntries) {
    const values = byMetric.get(entry.value.metricId) || []
    values.push(entry); byMetric.set(entry.value.metricId, values)
    if (Number.isFinite(entry.time)) times.add(entry.time)
  }
  const definitions = new Map(template.definitions.map((definition, index) => [definition.id, index]))
  const outputDefinitions = new Map<string, number>()
  template.definitions.forEach((definition, index) => {
    const family = definition.windowFamily as { ranges?: { outputs?: { id?: string }[] }[] } | undefined
    if (family) {
      for (const range of family.ranges || []) for (const output of range.outputs || []) { if (output.id) outputDefinitions.set(output.id, index) }
    } else if (definition.id) outputDefinitions.set(String(definition.id), index)
  })
  const linkedNodes = new Set<string>()
  for (const entry of resultEntries) {
    const index = definitions.get(entry.record?.attributes.definitionId || '') ?? outputDefinitions.get(entry.value.metricId)
    if (index !== undefined) {
      put(`rule-${index}`, entry)
      if (entry.record) linkedNodes.add(entry.record.id)
    }
  }
  for (const record of records) {
    if (record.action !== 'metric.node') continue
    const time = Number(record.attributes.evaluationTime)
    if (Number.isFinite(time)) times.add(time)
    const index = definitions.get(record.attributes.definitionId || '')
    if (index !== undefined && !linkedNodes.has(record.id)) put(`rule-${index}`, { key:`record-${record.id}`, time, order:recordOrder.get(record.id)!, record })
  }
  template.outputs.forEach((output, index) => {
    for (const entry of byMetric.get(output.metricId) || []) put(`output-${index}`, entry)
  })
  if (facts) facts.samples.forEach((sample, index) => {
    const time = Number(sampleExecutionTime(sample))
    if (Number.isFinite(time)) times.add(time)
    for (const id of sampleInputs(template, facts, sample)) {
      const input = template.inputDefinitions.findIndex(item => item.id === id)
      put(`input-${input}`, { key:`sample-${index}`, time, order:index, sample, sampleIndex:index })
    }
  })
  for (const values of series.values()) values.sort((a, b) => a.time - b.time || a.order - b.order)
  return { series, times:[...times].sort((a, b) => a - b), response }
}

/** 二分定位截至游标的最后一组；同刻多输出保留原次序，不能读到未来结果。 */
export function simulationNodeAt(index: ReturnType<typeof simulationIndex>, node: TemplateNode, time?: number, selectedEntry?: string): SimulationNodePreview {
  const series = index.series.get(nodeKey(node)) || []
  let left = 0, right = series.length
  while (left < right) {
    const middle = (left + right) >>> 1
    if (time !== undefined && series[middle].time <= time) left = middle + 1
    else right = middle
  }
  const last = series[left - 1]
  const alternatives: SimulationEntry[] = []
  if (last) for (let i = left - 1; i >= 0 && series[i].time === last.time; i--) alternatives.push(series[i])
  alternatives.reverse()
  // 同刻重复触发可能在产出后记录 skipped；默认展示该时刻最后一次实际评估，逐条选择仍保留原过程。
  let evaluated = last
  for (let i = alternatives.length - 1; i >= 0; i--) {
    const candidate = alternatives[i]
    if (candidate.value || candidate.record?.hasError || candidate.record?.attributes.state !== 'skipped') {
      evaluated = candidate
      break
    }
  }
  const entry = alternatives.find(item => item.key === selectedEntry) || evaluated
  const state = !entry ? !index.response ? 'awaitSimulation' : index.response.recordsTruncated ? 'processUnavailable' : 'notExecuted'
    : entry.sample ? 'trialInput' : entry.record?.hasError ? 'calculationFailed'
      : entry.value && metricState(entry.value).key === 'notApplicable' ? 'notApplicable'
      : entry.value?.status === 'invalid' || entry.value?.quality?.valid === false ? 'calculationFailed'
      : entry.value ? 'trialProduced' : entry.record?.attributes.state === 'skipped' ? 'notTriggered' : 'stepNoResult'
  return { entry, alternatives, previous:!!entry && entry.time !== time, state }
}
