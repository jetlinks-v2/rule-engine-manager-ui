import type { MetricStateInterval, MetricStateLabel, MetricTemplate, MetricTemplateOutput, MetricValue } from './types'
import { metricDurationText, resultTime } from './presentation'
import { i18nText } from '@jetlinks-web-core/components/I18n/text'
import { parseTagColorFromIcon } from '@jetlinks-web-core/components/IconValue/iconValue'

export function stateColorIndex(value:unknown) {
  const key = `${typeof value}:${value}`
  let hash = 0
  for (let index = 0; index < key.length; index++) hash = (hash * 31 + key.charCodeAt(index)) | 0
  return Math.abs(hash) % 4
}

/** 平台解析显式状态色；未声明颜色使用中性色，不从数值或排序推断正常/异常。 */
export function stateAppearance(value:unknown, labels:MetricStateLabel[] = []) {
  const icon = labels.find(label => label.value === value)?.icon
  return { icon, color:parseTagColorFromIcon(icon) || 'var(--ink-3)' }
}

/** Capability comes from the rule declaration, never a template or device identifier. */
export function tracksStateIntervals(template: MetricTemplate | undefined, outputId: string) {
  return !!template?.definitions.find(rule => rule.id === outputId)?.stateTracking
}

export function stateLabels(template: MetricTemplate | undefined, outputId: string): MetricStateLabel[] {
  const options = template?.definitions.find(rule => rule.id === outputId)?.options as { stateLabels?: MetricStateLabel[] } | undefined
  return options?.stateLabels || []
}

/** Semantic declarations take precedence over the scalar transport type, e.g. enum codes sent as integers. */
export function isStateOutput(output: MetricTemplateOutput | undefined, labels: MetricStateLabel[] = []) {
  return !!labels.length || output?.metricKind === 'state' || output?.valueType === 'enum' || output?.options?.readAggregation?.semantic === 'state'
}

export function recordedStateLabel(value: unknown, labels: MetricStateLabel[], locale: string, t:(key:string)=>string) {
  return value == null ? t('historyUnconfirmed') : labels.some(item => item.value === value) ? stateLabel(value, labels, locale)
    : typeof value === 'boolean' ? t(value ? 'conditionTrue' : 'conditionFalse') : String(value)
}

export function stateLabel(value: unknown, labels: MetricStateLabel[], locale: string) {
  const item = labels.find(label => label.value === value)
  return item ? i18nText(item.name, item.nameI18n, locale) : String(value ?? '—')
}

/** 实时展示可追加接收后的单调时长，仍受服务端有效期约束；历史和试算默认使用固定截点。 */
export function stateIntervalSummary(value?: MetricValue, elapsed = 0) {
  const fact = value?.state
  const current = fact?.currentInterval
  const recordedCutoff = fact?.readView?.time ?? (value && resultTime(value))
  const cutoff = recordedCutoff == null ? undefined : recordedCutoff + Math.max(0, elapsed)
  const known = !!current && !!cutoff && current.validUntil > cutoff
    && value?.status !== 'invalid' && value?.quality?.valid !== false && !value?.quality?.stale
    && (!fact?.readView || fact.readView.duration != null || !current.startKnown)
  const state = !fact ? 'waiting' : !known ? 'unknown' : 'known'
  const interval = known ? current : undefined
  const seconds = fact?.readView ? fact.readView.duration : fact?.duration
  // 完整起点未知时，保留已确认观测的下界；实时推进不依赖浏览器墙上时钟。
  const observedDuration = known && current && !current.startKnown ? intervalDuration(current, cutoff || 0) : undefined
  return { state, interval, last: fact?.previousInterval, cutoff: cutoff || 0,
    duration: known && seconds != null ? seconds * 1000 + Math.max(0, elapsed) : observedDuration }
}

export function intervalDuration(interval: MetricStateInterval, cutoff: number) {
  return Math.max(0, Math.min(interval.endTime ?? cutoff, interval.validUntil) - interval.startTime)
}

/** History is one item per interval, with complete boundaries even when the view starts later. */
export function stateIntervalHistory(values: MetricValue[], current?: MetricValue, bounds?: [number, number]) {
  const intervals = new Map<string, { interval: MetricStateInterval; cutoff: number }>()
  for (const value of [...values].sort((a, b) => (resultTime(a) || 0) - (resultTime(b) || 0))) {
    const interval = value.state?.closedInterval
    if (interval) intervals.set(interval.id, { interval, cutoff: resultTime(value) || 0 })
  }
  const last = current?.state?.previousInterval
  if (last && !intervals.has(last.id)) intervals.set(last.id, { interval: last, cutoff: resultTime(current!) || 0 })
  const open = current?.state?.currentInterval
  if (open) intervals.set(open.id, { interval: open, cutoff: current?.state?.readView?.time ?? (resultTime(current!) || 0) })
  return [...intervals.values()]
    .filter(({ interval, cutoff }) => !bounds || interval.startTime < bounds[1] && (interval.endTime ?? Math.min(cutoff, interval.validUntil)) > bounds[0])
    .sort((a, b) => b.interval.startTime - a.interval.startTime)
}

/** Proportional segments share one time axis; gaps remain visible as unconfirmed time. */
export function stateIntervalSegments(values: MetricValue[], current?: MetricValue, bounds?: [number, number]) {
  const records = stateIntervalHistory(values, current, bounds)
  const from = bounds?.[0] ?? Math.min(...records.map(({ interval }) => interval.startTime))
  const to = bounds?.[1] ?? Math.max(...records.map(({ interval, cutoff }) => Math.min(interval.endTime ?? cutoff, interval.validUntil)))
  if (!Number.isFinite(from) || to <= from) return []
  return records.flatMap(record => {
    const start = Math.max(from, record.interval.startTime)
    const end = Math.min(to, record.interval.endTime ?? record.cutoff, record.interval.validUntil)
    if (end <= start) return []
    return [{ ...record, left:(start - from) / (to - from) * 100, width:(end - start) / (to - from) * 100, color:stateColorIndex(record.interval.value) }]
  })
}

export function formatIntervalDuration(millis: number, t: (key: string, values: Record<string, number>) => string) {
  return metricDurationText(Math.floor(Math.max(0, millis) / 1000), 's', t) || '—'
}
