import dayjs from 'dayjs'
import type { AlarmDashboardApi } from '../../../api/alarmDashboard'
import type { AlarmHandlingData, AlarmHandlingPoint, AlarmHandlingSource, AlarmHandlingStats, AlarmTarget, AlarmTimeRange, AlarmWidgetData } from '../dashboard.types'
import { invalidResponse, resolveRange, rowsOf, timeTerms, toTrendPoints } from './query'

/** 按告警发生时间分桶，展示这些告警当前的处理状态；不是按处理时间统计操作次数。 */
export async function loadHandlingStatistics(api: AlarmDashboardApi, timeRange: AlarmTimeRange, signal: AbortSignal, source?: AlarmHandlingSource, visionEnabled = true): Promise<AlarmWidgetData> {
  const range = resolveRange(timeRange)
  const unit = range.interval === '1h' ? 'hour' : 'day'
  const load = async (target: AlarmTarget): Promise<AlarmHandlingStats> => {
    try {
      // 沿用既有处理趋势的单状态时间聚合契约，两种状态均成功后才发布该来源。
      const queryState = async (state: 'warning' | 'normal') => {
        const rows = rowsOf(await api.aggregateAlarms(target, {
          columns: [{ column: 'id', alias: 'count', aggregation: 'COUNT' }],
          groupByTime: {
            column: 'alarmTime', alias: 'time', interval: range.interval,
            format: range.interval === '1h' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd',
            from: dayjs(range.startTime).format('YYYY-MM-DD HH:mm:ss'),
            to: dayjs(range.endTime).format('YYYY-MM-DD HH:mm:ss'),
          },
          filter: { terms: [...timeTerms(range), { column: 'state', termType: 'eq', value: state }] },
          limit: 1000,
        }, signal))
        if (rows.length >= 1000) throw invalidResponse()
        return new Map(toTrendPoints(rows, range).map(point => [point.timestamp, point.count]))
      }
      const [activeCounts, handledCounts] = await Promise.all([queryState('warning'), queryState('normal')])
      signal.throwIfAborted()
      const points: AlarmHandlingPoint[] = []
      for (let time = dayjs(range.startTime).startOf(unit); time.valueOf() <= range.endTime; time = time.add(1, unit)) {
        const timestamp = time.valueOf()
        // 完整计数聚合成功后，未返回的时间桶表示该状态没有记录。
        points.push({ timestamp, active: activeCounts.get(timestamp) ?? 0, handled: handledCounts.get(timestamp) ?? 0 })
      }
      const timestamps = new Set(points.map(point => point.timestamp))
      if ([...activeCounts.keys(), ...handledCounts.keys()].some(timestamp => !timestamps.has(timestamp))) throw invalidResponse()
      const active = points.reduce((sum, point) => sum + point.active, 0)
      const handled = points.reduce((sum, point) => sum + point.handled, 0)
      const total = active + handled
      return { total, active, handled, rate: total ? Number((handled / total * 100).toFixed(1)) : null, points, failed: false }
    } catch (error) {
      signal.throwIfAborted()
      return { total: null, active: null, handled: null, rate: null, points: [], failed: true }
    }
  }
  const sources = (source ? [source] : ['iot', 'vision'] as AlarmHandlingSource[]).filter(key => key !== 'vision' || visionEnabled)
  const handling: AlarmHandlingData = Object.fromEntries(await Promise.all(sources.map(async key =>
    [key, await load(key === 'iot' ? 'device' : 'aiTaskMediaTarget')])))
  return { handling, window: range, series: [], ranking: [] }
}
