import type { TemplateRule } from './designer'

export interface TemplateWindow extends Record<string, unknown> {
  mode?: 'none' | 'time' | 'latestN'
  size?: string
  timeMode?: 'processing' | 'event' | 'hybrid'
  emitPolicy?: 'onEvent' | 'onSchedule' | 'onWindowClose'
  emitInterval?: string
  expectedCount?: number
  maxEntries?: number
  timeUnit?: string
  maxGap?: string
}
export type CalculationKind = 'expression' | 'statistics' | 'temporal' | 'calculator'

/** 只解析可视时长，其他后端支持的文本原样保留。 */
export function durationSeconds(value?: string): number | undefined {
  if (!value || !/\d/.test(value)) return undefined
  const match = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/)
  return match ? Number(match[1] || 0) * 86400 + Number(match[2] || 0) * 3600 + Number(match[3] || 0) * 60 + Number(match[4] || 0) : undefined
}
export function durationParts(value?: string): { amount: number; unit: string } | undefined {
  const seconds = durationSeconds(value)
  if (seconds === undefined) return undefined
  const units = [[86400, 'days'], [3600, 'hours'], [60, 'minutes'], [1, 'seconds']] as const
  const [scale, unit] = units.find(([scale]) => seconds > 0 && seconds % scale === 0) || units[3]
  return { amount: seconds / scale, unit }
}
export function calculationKind(rule: TemplateRule): CalculationKind {
  return rule.calculator ? 'calculator' : rule.temporalCondition ? 'temporal' : rule.aggregation || rule.timeAggregation || rule.type === 'raw' ? 'statistics' : 'expression'
}
/** 显式切换计算方式时清除互斥字段，其余引用、质量策略与扩展字段不变。 */
export function calculationFields(kind: CalculationKind): Partial<TemplateRule> {
  const fields = { expression: undefined, expressionTree:undefined, calculator: undefined, temporalCondition: undefined, stateTracking: undefined, aggregation: undefined, timeAggregation: undefined, windowFamily: undefined, window: undefined }
  if (kind === 'statistics') return { ...fields, type: 'feature', aggregation: 'avg', window: { mode: 'time', size: 'PT15M', timeMode: 'event', emitPolicy: 'onEvent' } }
  if (kind === 'temporal') return { ...fields, type: 'composite', temporalCondition: { enterExpression: '', exitExpression: '', dwell: 'PT3M', recovery: 'PT1M' } }
  if (kind === 'calculator') return { ...fields, type: 'feature', calculator: { provider: '', providerVersion: '1', parameters: {} } }
  return { ...fields, type: 'composite', expression: '' }
}
/** 范围切换只重置相关字段，不把定时策略带入普通窗口。 */
export function windowFields(window: TemplateWindow | undefined, mode: TemplateWindow['mode']): TemplateWindow {
  return { ...window, mode, size: mode === 'none' ? undefined : mode === window?.mode ? window?.size : mode === 'latestN' ? '5' : 'PT15M',
    step: undefined, allowedLateness: undefined, timeMode: window?.timeMode || 'event', emitPolicy: 'onEvent', emitInterval: undefined,
    timeUnit:mode === 'time' ? window?.timeUnit : undefined, maxGap:mode === 'time' ? window?.maxGap : undefined }
}
