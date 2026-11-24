import type { MetricInputMapping, MetricTemplate, MetricTemplateInput } from './types'
import { ruleDependencies, type TemplateRule } from './template/designer'

/** 与装配器保持一致：直接读取快照的计算必须定时，后续依赖结果的节点不受此限制。 */
export function supportsSnapshotSource(template:MetricTemplate, input:MetricTemplateInput):boolean {
  const consumers = (template.definitions as TemplateRule[]).filter(rule => ruleDependencies(rule).includes(input.id))
  return !input.source?.lookback && consumers.length > 0 && consumers.every(rule => rule.window?.emitPolicy === 'onSchedule')
}

export const sourceScheduleMissing = (template:MetricTemplate, input:MetricTemplateInput, mapping?:MetricInputMapping) =>
  !!mapping && (mapping.kind === 'builtin' || !!mapping.statistics) && !supportsSnapshotSource(template, input)
