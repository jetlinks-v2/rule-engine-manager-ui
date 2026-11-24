import { metricValueText } from '../presentation'
import { copy, outputId, parameterOverrides } from '../service'
import { tracksStateIntervals } from '../stateIntervals'
import type { MetricConfig, MetricConfigFieldsPatch, MetricTemplate, MetricTemplateOutput } from '../types'

/** Absence, null and an empty map represent the same empty instance override. */
export function normalizePresentation(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {}
}
/** Settings merge shallowly: nested values replace a whole key and 0/false remain explicit overrides. */
export function presentationSettings(template?: Pick<MetricTemplate, 'options'>, config?: Pick<MetricConfig, 'presentation'>): Record<string, unknown> {
  return { ...normalizePresentation(template?.options?.presentation?.settings), ...normalizePresentation(config?.presentation) }
}
/** 显示设置只影响主次；未指定或所选输出已移除时沿用模板首个输出。 */
export function primaryMetricOutput(template: MetricTemplate, config?: Pick<MetricConfig, 'presentation'>) {
  const id = presentationSettings(template, config).primaryOutput
  return template.outputs.find(output => outputId(output) === id) || template.outputs[0]
}
/** 配置身份使用模板图标，缺省按主要输出声明推导；不随实时值类型变化。 */
export function metricConfigurationIcon(template?: MetricTemplate, config?: Pick<MetricConfig, 'presentation'>): string {
  if (typeof template?.options?.icon === 'string' && template.options.icon) return template.options.icon
  if (!template) return 'LineChartOutlined'
  const output = primaryMetricOutput(template, config)
  return output && tracksStateIntervals(template, outputId(output)) ? 'ClockCircleOutlined'
    : output?.valueType === 'boolean' ? 'FilterOutlined' : 'LineChartOutlined'
}
/** 卡片摘要有界；状态卡默认由区间事实概览，其他结果仍可在详情中查看。 */
export function summaryMetricOutputs(template: MetricTemplate, config?: Pick<MetricConfig, 'presentation'>) {
  const primary = primaryMetricOutput(template, config)
  if (!primary) return []
  const candidates = template.outputs.filter(output => output !== primary)
  const ids = presentationSettings(template, config).summaryOutputs
  if (!Array.isArray(ids)) return tracksStateIntervals(template, outputId(primary)) ? [] : candidates.slice(0, 2)
  return [...new Set(ids)].flatMap(id => {
    const output = candidates.find(output => outputId(output) === id)
    return output ? [output] : []
  }).slice(0, 2)
}
export function formatMetricValue(value: unknown, settings: Record<string, unknown> = {}, output?:MetricTemplateOutput): string {
  const decimals = settings.decimals ?? (output?.metricKind === 'score' || output?.options?.readAggregation?.semantic === 'score' ? 1 : undefined)
  return typeof value === 'number' && Number.isFinite(value) && typeof decimals === 'number' && Number.isInteger(decimals) && decimals >= 0 && decimals <= 8
    ? new Intl.NumberFormat(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value) : metricValueText(value)
}
/** Specialized forms may change bindings and editable parameters, never identity, revision or presentation. */
export function applyMetricConfigFields(draft: MetricConfig, template: MetricTemplate, patch: MetricConfigFieldsPatch): MetricConfig {
  return { ...copy(draft),
    inputMappings: patch.inputMappings === undefined ? draft.inputMappings : copy(patch.inputMappings),
    parameters: patch.parameters === undefined ? draft.parameters : parameterOverrides(template, patch.parameters),
  }
}
