import dayjs from 'dayjs'
import { handlingSourceOf, isHandlingKind, type AlarmDashboardKind, type AlarmDimension, type AlarmHandlingStats, type AlarmTimeRange, type AlarmWidgetData } from '../dashboard.types'
import { resolveRange } from './query'

/** 样例仅在显式编辑预览中生成；正式接口失败不会降级为这些数字。 */
export function previewData(kind: AlarmDashboardKind, range: AlarmTimeRange, dimension: AlarmDimension): AlarmWidgetData {
  const window = resolveRange(range, new Date(2026, 9, 20, 18).getTime())
  const unit = window.interval === '1h' ? 'hour' : 'day'
  const points = Array.from({ length: window.interval === '1h' ? range === 'yesterday' ? 24 : 19 : Number.parseInt(range, 10) || 1 }, (_, index) => ({
    timestamp: dayjs(window.startTime).add(index, unit).valueOf(),
    count: [7, 2, 4, 1, 3, 5, 10, 24, 48, 78, 64, 58, 72, 82, 68, 64, 76, 86, 102][index % 19],
  }))
  if (isHandlingKind(kind)) {
    const sample = (active: number, handled: number): AlarmHandlingStats => {
      const weight = points.reduce((sum, point) => sum + point.count, 0)
      let cursor = 0
      return {
        total: active + handled, active, handled, rate: Number((handled / (active + handled) * 100).toFixed(1)), failed: false,
        points: points.map(point => {
          const previous = cursor
          cursor += point.count
          return {
            timestamp: point.timestamp,
            active: Math.floor(cursor * active / weight) - Math.floor(previous * active / weight),
            handled: Math.floor(cursor * handled / weight) - Math.floor(previous * handled / weight),
          }
        }),
      }
    }
    const handling = { iot: sample(27, 159), vision: sample(304, 824) }
    const source = handlingSourceOf(kind)
    return { handling: source ? { [source]: handling[source] } : handling, window, series: [], ranking: [] }
  }
  return {
    metric: kind === 'TodayEvents'
      ? { today: 1280, filterRate: 86.2, failed: [] }
      : kind === 'IotAlarms' ? { today: 46, total: 512, active: 23, handled: 489, failed: [] }
        : { today: 132, total: 2148, active: 67, handled: 2081, failed: [] },
    series: (['events', 'iot', 'vision'] as const).map((source, index) => ({
      source, points: points.map(point => ({ ...point, count: Math.round(point.count / [1, 12, 7][index]) })),
    })),
    ranking: Array.from({ length: 12 }, (_, index) => ({
      id: String(index), name: `preview.${dimension}.${index % 6}`, count: Math.max(1, 24 - index * 2),
    })),
  }
}

