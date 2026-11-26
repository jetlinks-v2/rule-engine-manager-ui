import type { MetricConfig, MetricInputMapping, MetricTemplate } from '../types'
import type { TemplateRule } from './designer'
import { durationSeconds } from './window'
import { isEqual } from 'lodash-es'

export interface SimulationSample extends Record<string, unknown> {
  thingType?: string; thingId?: string; metricId?: string; value?: unknown
  eventTime?: number; ingestTime?: number; processTime?: number; unit?: string
  configId?: string
  sourceKind?: MetricInputMapping['kind']
  includeChildren?: boolean
  statistics?: MetricInputMapping['statistics']
  providerSource?: MetricInputMapping['providerSource']
}
export interface SimulationFacts extends Record<string, unknown> { configuration: MetricConfig; samples: SimulationSample[] }
/** 与后端虚拟时钟的推进顺序一致，数据时间仍保留用于窗口归属。 */
export const sampleExecutionTime = (sample: SimulationSample) => Number(sample.processTime) > 0 ? Number(sample.processTime)
  : Number(sample.ingestTime) > 0 ? Number(sample.ingestTime) : sample.eventTime
const statisticsFields = ['memberType','sourceType','sourceId','operation','operator','value','maxAge','period','zone','periodMetricId','coverageMetricId'] as const
const sameStatistics = (left:MetricInputMapping['statistics'], right:MetricInputMapping['statistics']) => !left || !right
  ? !left && !right : statisticsFields.every(field => left[field] === right[field])
const matches = (sample: SimulationSample, source: MetricInputMapping, config: MetricConfig) => (source.kind === 'metric' ? !!source.configId && sample.configId === source.configId
  : !sample.configId && (source.kind === 'builtin' ? sample.sourceKind === 'builtin' && !!source.includeChildren === !!sample.includeChildren
    : source.kind === 'provider' ? sample.sourceKind === 'provider' && isEqual(source.providerSource, sample.providerSource)
    : !sample.sourceKind || sample.sourceKind === 'property'))
  && sample.thingType === (source.thingType || config.targetType) && sample.thingId === (source.thingId || config.targetId) && sample.metricId === source.id
  && sameStatistics(sample.statistics, source.statistics)
  && (!source.statistics || !!sample.includeChildren === !!source.includeChildren)

/** 同一来源可以供多个输入使用；每条样本只发送一次，展示时关联所有引用它的输入。 */
export function sampleInputs(template: MetricTemplate, facts: SimulationFacts, sample: SimulationSample): string[] {
  return template.inputDefinitions.filter(input => {
    const source = facts.configuration.inputMappings?.[input.id]
    return source && matches(sample, source, facts.configuration)
  }).map(input => input.id)
}
export const sampleInput = (template:MetricTemplate, facts:SimulationFacts, sample:SimulationSample) => sampleInputs(template, facts, sample)[0]
export function visualSamples(template: MetricTemplate, value: Record<string, unknown>): value is SimulationFacts {
  const facts = value as SimulationFacts
  return !!facts.configuration?.inputMappings && Array.isArray(facts.samples) && facts.samples.every(sample => !!sample && typeof sample === 'object'
    && typeof sample.eventTime === 'number' && Number.isFinite(sample.eventTime) && !!sampleInput(template, facts, sample))
}
/** 为未绑定输入分配独立模拟来源，保持既有配置、来源及样本扩展不变。 */
export function addSimulationSample(template: MetricTemplate, facts: SimulationFacts, inputId: string, time: number): SimulationFacts {
  const input = template.inputDefinitions.find(item => item.id === inputId)
  if (!input) return facts
  const inputMappings = { ...facts.configuration.inputMappings }
  for (const item of template.inputDefinitions) inputMappings[item.id] ||= { kind: 'property', thingType: 'device', thingId: `simulation-${item.id}`, id: item.id }
  const config = { ...facts.configuration, templateId: template.id, templateVersion: template.version, inputMappings }
  const source = inputMappings[inputId]
  return { ...facts, configuration: config, samples: [...facts.samples, { thingType: source.thingType || config.targetType,
    thingId: source.thingId || config.targetId, metricId: source.id, ...(source.kind === 'metric' ? { configId:source.configId,
      ...(source.statistics ? { statistics:{ ...source.statistics }, includeChildren:!!source.includeChildren } : {}) } : source.kind === 'builtin' ? { sourceKind:'builtin', includeChildren:!!source.includeChildren }
        : source.kind === 'provider' ? {sourceKind:'provider',providerSource:source.providerSource} : {}), unit: input.unit, value: null,
    eventTime: time, ingestTime: time, processTime: time }] }
}
/** 修改数据时间保留原到达延迟，0和false作为真实样本值保留。 */
export function patchSimulationSample(facts: SimulationFacts, index: number, fields: Partial<SimulationSample>): SimulationFacts {
  return { ...facts, samples: facts.samples.map((sample, position) => {
    if (position !== index) return sample
    const timing = fields.eventTime !== undefined && sample.eventTime !== undefined ? {
      ingestTime: fields.eventTime + ((sample.ingestTime ?? sample.eventTime) - sample.eventTime),
      processTime: fields.eventTime + ((sample.processTime ?? sample.eventTime) - sample.eventTime),
    } : {}
    return { ...sample, ...timing, ...fields }
  }) }
}
/** datetime-local 使用本地时区；传给后端的时间始终为毫秒时间戳。 */
export function sampleDate(time?: number): string {
  if (time === undefined || !Number.isFinite(time)) return ''
  const date = new Date(time)
  if (!Number.isFinite(date.getTime())) return ''
  return new Date(time - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19)
}

/** 时间分布仅预览给定样本；多级计算的参与区间仍以服务端结果为准。 */
export function simulationRange(template: MetricTemplate, facts: SimulationFacts, rule?: TemplateRule) {
  const source = rule?.sourceMetric || rule?.dependsOn?.[0]
  const direct = template.inputDefinitions.some(input => input.id === source)
  const time = (sample: SimulationSample) => rule?.window?.timeMode === 'processing' ? sample.processTime ?? sample.eventTime! : sample.eventTime!
  const points = facts.samples.flatMap((sample, index) => sampleInputs(template, facts, sample).map(input => ({ index, input, time:time(sample), value:sample.value })))
  const ordered = points.filter(point => !direct || point.input === source).sort((a, b) => a.time - b.time)
  if (!ordered.length) return undefined
  const end = ordered.at(-1)!.time
  const mode = rule?.window?.mode
  const duration = durationSeconds(rule?.window?.size)
  const selected = mode === 'time' && duration !== undefined ? ordered.filter(point => point.time >= end - duration * 1000)
    : mode === 'latestN' ? ordered.slice(-Number(rule?.window?.size || 1)) : mode === 'none' ? ordered.slice(-1) : []
  const ids = new Set(direct ? selected.map(point => point.index) : [])
  const start = mode === 'time' && duration !== undefined ? end - duration * 1000 : selected[0]?.time ?? ordered[0].time
  const first = Math.min(start, ...points.map(point => point.time)), last = Math.max(end, ...points.map(point => point.time))
  const percent = (value: number) => last === first ? 50 : (value - first) / (last - first) * 100
  return { start, end, first, last, startPercent: percent(start), endPercent: percent(end),
    lanes: template.inputDefinitions.map(input => ({ id: input.id, label: input.name || input.id, points: points.filter(point => point.input === input.id)
      .map(point => ({ ...point, percent: percent(point.time), selected: ids.has(point.index) })) })) }
}
