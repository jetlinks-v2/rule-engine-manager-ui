import dayjs from 'dayjs'
import i18n from '@jetlinks-web-core/locales'
import type { AlarmQueryRange, AlarmQueryTerm, AlarmTimeRange, AlarmTrendPoint } from '../dashboard.types'

export const invalidResponse = () => new Error(String(i18n.global.t('alarmDashboard.invalidResponse')))
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
export const textOf = (value: unknown): string =>
  isRecord(value) ? textOf(value.text ?? value.name ?? value.value) : value == null ? '' : String(value)

/** 请求失败与非法响应不能被转换为业务零值。 */
export function resultOf(value: unknown): unknown {
  if (isRecord(value)) {
    if (value.success === false || (typeof value.status === 'number' && value.status >= 400)) throw invalidResponse()
    if ('result' in value) return value.result
  }
  return value
}
export function countOf(value: unknown): number {
  const raw = resultOf(value)
  const count = isRecord(raw) ? raw.count ?? raw.total : raw
  if (!['number', 'string'].includes(typeof count) || count === '' || !Number.isFinite(Number(count)) || Number(count) < 0) {
    throw invalidResponse()
  }
  return Number(count)
}
export function rowsOf(value: unknown): Record<string, unknown>[] {
  const result = resultOf(value)
  const rows = isRecord(result) ? result.data : result
  if (!Array.isArray(rows) || rows.some(row => !isRecord(row))) throw invalidResponse()
  return rows.map(row => isRecord(row.value) ? row.value : row)
}

/** 自然日窗口与项目现有页面一致；今天截止当前时刻，昨天覆盖完整自然日。 */
export function resolveRange(range: AlarmTimeRange, now = Date.now()): AlarmQueryRange {
  const end = dayjs(now)
  if (range === 'yesterday') {
    const day = end.subtract(1, 'day')
    return { startTime: day.startOf('day').valueOf(), endTime: day.endOf('day').valueOf(), interval: '1h' }
  }
  const days = range === 'today' ? 1 : Number.parseInt(range, 10)
  return { startTime: end.subtract(days - 1, 'day').startOf('day').valueOf(), endTime: now, interval: days === 1 ? '1h' : '1d' }
}
export const timeTerms = (range: AlarmQueryRange, column = 'alarmTime'): AlarmQueryTerm[] => [
  { column, termType: 'btw', value: [range.startTime, range.endTime] },
]

/** 复判是另一条历史记录，排除它才能让原始事件与后续执行只计一次。 */
export const rawEventTerms = (): AlarmQueryTerm[] => [
  { column: 'taskType', termType: 'not', value: 'reviewHandle' },
]

export function toTrendPoints(rows: Record<string, unknown>[], range: AlarmQueryRange): AlarmTrendPoint[] {
  const unit = range.interval === '1h' ? 'hour' : 'day'
  const points = new Map<number, number>()
  for (const row of rows) {
    const rawTime = row.time ?? row.timestamp
    if (rawTime == null || rawTime === '') throw invalidResponse()
    const time = typeof rawTime === 'number' || /^\d{13}$/.test(String(rawTime))
      ? dayjs(Number(rawTime)) : dayjs(String(rawTime))
    if (!time.isValid()) throw invalidResponse()
    const timestamp = time.startOf(unit).valueOf()
    const count = countOf(row.count ?? row.total ?? row.alarmCount)
    points.set(timestamp, (points.get(timestamp) ?? 0) + count)
  }
  return [...points].sort(([a], [b]) => a - b).map(([timestamp, count]) => ({ timestamp, count }))
}

