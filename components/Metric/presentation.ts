import type { MetricTemplate, MetricTemplateOutput, MetricValue } from './types'
import { durationSeconds } from './template/window'
export type MetricTone = 'success' | 'warning' | 'error' | 'default'
export function metricState(value?: MetricValue): { key: string; tone: MetricTone } {
  if (!value) return { key: 'waiting', tone: 'default' }
  if (value.reason === 'notApplicable') return { key: 'notApplicable', tone: 'default' }
  // noValue 表示本轮没有可用结果；invalid 还承担阻止空值参与后续计算的职责。
  if (value.reason === 'noValue') return { key: 'noValue', tone: 'default' }
  if (value.status === 'invalid' || value.quality?.valid === false) return { key: value.reason || 'inputInvalid', tone: 'error' }
  if (value.quality?.stale || value.reason === 'inputExpired') return { key: 'inputExpired', tone: 'warning' }
  if (value.value === undefined || value.value === null) return { key: 'noValue', tone: 'default' }
  if (value.status === 'fallback' || value.quality?.estimated) return { key: 'estimatedInput', tone: 'warning' }
  if (value.status === 'partial') return { key: value.reason || 'optionalInputMissing', tone: 'warning' }
  if (value.quality?.valid !== true) return { key: 'unknownQuality', tone: 'default' }
  return { key: 'valid', tone: 'success' }
}
export function metricValueText(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') return Number.isFinite(value) ? new Intl.NumberFormat(undefined, { maximumSignificantDigits: 8 }).format(value) : '—'
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}
/** Format declared time units for display only; calculation and alarm values retain their source unit. */
export function metricDurationText(value: unknown, unit: string | undefined, t: (key: string, values: Record<string, number>) => string): string | undefined {
  const factor = unit === 'ms' ? .001 : unit === 's' ? 1 : unit === 'min' ? 60 : unit === 'h' ? 3600 : undefined
  if (factor === undefined || typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  const duration = value * factor
  if (duration > 0 && duration < 1) return t('intervalMilliseconds', {count:Number((duration * 1000).toPrecision(3))})
  if (duration < 60 && duration > 0) return t('intervalSeconds',{count:Number(duration.toPrecision(8))})
  const seconds = Math.floor(duration)
  const parts = [
    ['intervalDays', Math.floor(seconds / 86400)], ['intervalHours', Math.floor(seconds % 86400 / 3600)],
    ['intervalMinutes', Math.floor(seconds % 3600 / 60)], ['intervalSeconds', seconds % 60],
  ] as const
  const present = parts.filter(([, count]) => count > 0).slice(0, 2)
  return present.length ? present.map(([key, count]) => t(key, { count })).join(' ') : t('intervalSeconds', { count: 0 })
}
export function resultTime(value: MetricValue): number | undefined {
  return value.evaluationTime ?? value.timestamp ?? value.processTime
}
/** 匿名结果使用只读执行引用；值与时间相同不等于同一次计算。 */
export function metricResultReference(value?:Pick<MetricValue,'resultId' | 'executionId'>):string | undefined {
  return value?.resultId || value?.executionId
}
/** 输出标签缺省时沿用模板计算项名称，不向业务用户展示内部输出标识。 */
export function metricOutputName(output?: MetricTemplateOutput, template?: MetricTemplate): string | undefined {
  const declared = template?.outputs.find(item => item.metricId === output?.metricId)
  if (declared?.label || output?.label) return declared?.label || output?.label
  const definition = template?.definitions.find(item => item.id === output?.metricId)
  return typeof definition?.name === 'string' && definition.name ? definition.name : undefined
}
/** 声明的定时输出可直接判定采样缺口；事件输出只在观测到稳定节奏时识别明显中断。 */
export function metricSampleInterval(template:MetricTemplate | undefined,outputId:string):number | undefined {
  const rule = template?.definitions.find(rule=>rule.id === outputId || (rule.windowFamily as {ranges?:{outputs?:{id:string}[]}[]} | undefined)?.ranges?.some(range=>range.outputs?.some(output=>output.id === outputId)))
  const window = rule?.window as {emitPolicy?:string;emitInterval?:string} | undefined
  const seconds = window?.emitPolicy === 'onSchedule' ? durationSeconds(window.emitInterval) : undefined
  return seconds && seconds > 0 ? seconds * 1000 : undefined
}
export function metricChartPoints(values: MetricValue[],sampleInterval?:number): Array<[number, number | null]> {
  const points = values.filter(value => Number.isFinite(resultTime(value)))
    .map(value => [resultTime(value)!, ['valid', 'unknownQuality', 'estimatedInput', 'optionalInputMissing'].includes(metricState(value).key)
      && typeof value.value === 'number' && Number.isFinite(value.value) ? value.value : null] as [number, number | null])
    .sort((left, right) => left[0] - right[0])
  const deltas = points.slice(1).map((point,index)=>point[0] - points[index][0]).filter(delta=>delta > 0).sort((a,b)=>a-b)
  const median = deltas[Math.floor(deltas.length / 2)]
  // 至少五个间隔且四分之三接近中位数；稀疏、不规则事件不推断采样周期。
  const stable = deltas.length >= 5 && deltas.filter(delta=>Math.abs(delta - median) <= median * 0.1).length >= deltas.length * 0.75
  const gap = sampleInterval && sampleInterval > 0 ? sampleInterval * 1.5 : stable ? median * 3 : Infinity
  const result:Array<[number,number | null]> = []
  points.forEach((point,index)=>{
    const previous = points[index - 1]
    if (previous && previous[1] !== null && point[1] !== null && point[0] - previous[0] > gap) result.push([previous[0] + (point[0] - previous[0]) / 2,null])
    result.push(point)
  })
  return result
}

/** 历史类型来自实际结果，不按指标名称猜测告警、健康或运行状态。 */
export function metricHistoryKind(values: MetricValue[]): 'number' | 'boolean' | 'other' {
  const types = new Set(values.filter(value => value.value != null).map(value => typeof value.value))
  return types.size === 1 && types.has('number') ? 'number' : types.size === 1 && types.has('boolean') ? 'boolean' : 'other'
}
/** 布尔历史只保留离散事实，缺失、过期与无效结果是未知，不补成 false 或持续区间。 */
export function metricRecordedBoolean(value: MetricValue): boolean | null {
  const state = metricRecordedState(value)
  return typeof state === 'boolean' ? state : null
}
/** Declared state outputs may use numbers or strings; preserve scalar types and the shared quality boundary. */
export function metricRecordedState(value: MetricValue): string | number | boolean | null {
  return ['valid', 'unknownQuality', 'estimatedInput', 'optionalInputMissing'].includes(metricState(value).key)
    && (typeof value.value === 'boolean' || typeof value.value === 'string' || typeof value.value === 'number' && Number.isFinite(value.value)) ? value.value : null
}
export function metricBooleanPoints(values: MetricValue[]): Array<[number, boolean | null]> {
  return values.filter(value => Number.isFinite(resultTime(value)))
    .map(value => [resultTime(value)!, metricRecordedBoolean(value)] as [number, boolean | null])
    .sort((left, right) => left[0] - right[0])
}
/** Do not magnify a few floating-point rounding bits into a full-height trend. Source values remain intact. */
function sparklineY(value:number,low:number,high:number) {
  const span=high-low
  return span<=Math.max(Math.abs(low),Math.abs(high))*Number.EPSILON*8 ? 28 : 48-(value-low)/span*40
}
function sparklineDomain(low:number,high:number,baseline?:'centered'|'zero'):[number,number] {
  if (baseline==='centered') { const extent=Math.max(Math.abs(low),Math.abs(high));return [-extent,extent] }
  return baseline==='zero' ? [Math.min(0,low),Math.max(0,high)] : [low,high]
}
/** 轻量缩略图保留空值断点，固定坐标只承担几何缩放，文字使用页面字号。 */
export function metricSparkline(points: Array<[number, number | null]>, bounds?: [number, number], baseline?:'centered'|'zero'):{path:string;points:Array<[number,number]>;peak:SparklinePoint|undefined;zero?:number} {
  const start = bounds?.[0] ?? points[0]?.[0], end = bounds?.[1] ?? points[points.length - 1]?.[0]
  const values = points.flatMap(([time, value]) => value === null || time < start || time > end ? [] : [value])
  if (!values.length) return { path: '', points: [] as Array<[number, number]>, peak: undefined as SparklinePoint | undefined }
  const [low,high] = sparklineDomain(Math.min(...values),Math.max(...values),baseline)
  let path = '', connected = false
  const markers: Array<[number, number]> = []
  let isolated: [number, number] | undefined
  let peak: SparklinePoint | undefined
  for (const [time, value] of points) {
    if (value === null || time < start || time > end) { if (isolated) markers.push(isolated); isolated = undefined; connected = false; continue }
    const x = end === start ? 150 : 4 + (time - start) / (end - start) * 292
    const y = sparklineY(value,low,high)
    if (!peak || value > peak.value) peak = { time, value, x, y }
    isolated = connected ? undefined : [x, y]
    path += `${connected ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)} `
    connected = true
  }
  if (isolated) markers.push(isolated)
  return { path: path.trim(), points: markers, peak, ...(baseline ? {zero:sparklineY(0,low,high)} : {}) }
}
interface SparklinePoint { time:number; value:number; x:number; y:number }
/** 悬停选取最近的真实样本；空值仍是断点，不推导中间值。输入沿用已排序的有界历史。 */
export function metricSparklinePoint(points:Array<[number, number | null]>, x:number, bounds?:[number, number], baseline?:'centered'|'zero'):SparklinePoint | undefined {
  if (!points.length) return
  const [start,end] = bounds || [points[0][0], points[points.length - 1][0]]
  const time = start + Math.max(0, Math.min(1, (x - 4) / 292)) * (end - start)
  let nearest: [number, number | null] | undefined
  let low = Infinity, high = -Infinity
  for (const point of points) {
    if (point[0] < start || point[0] > end) continue
    if (!nearest || Math.abs(point[0] - time) < Math.abs(nearest[0] - time)) nearest = point
    if (point[1] !== null) { low = Math.min(low, point[1]); high = Math.max(high, point[1]) }
  }
  if (!nearest || nearest[1] === null) return
  ;[low,high]=sparklineDomain(low,high,baseline)
  return { time:nearest[0], value:nearest[1], x:end === start ? 150 : 4 + (nearest[0] - start) / (end - start) * 292,
    y:sparklineY(nearest[1],low,high) }
}
