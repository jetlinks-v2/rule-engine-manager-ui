import dayjs from 'dayjs'
import type { AlarmDashboardApi } from '../../../api/alarmDashboard'
import type { AlarmSource, AlarmTarget, AlarmTimeRange, AlarmWidgetData } from '../dashboard.types'
import { rawEventTerms, resolveRange, rowsOf, timeTerms, toTrendPoints } from './query'

/** 三条曲线保持同一窗口和粒度，告警按记录计数，不混入重复触发次数。 */
export async function loadTrends(api: AlarmDashboardApi, timeRange: AlarmTimeRange, signal: AbortSignal): Promise<AlarmWidgetData> {
  const range = resolveRange(timeRange)
  const format = range.interval === '1h' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd'
  const alarm = (target: AlarmTarget) => api.aggregateAlarms(target, {
    columns: [{ column: 'id', alias: 'count', aggregation: 'COUNT' }],
    groupByTime: {
      column: 'alarmTime', alias: 'time', interval: range.interval, format,
      from: dayjs(range.startTime).format('YYYY-MM-DD HH:mm:ss'),
      to: dayjs(range.endTime).format('YYYY-MM-DD HH:mm:ss'),
    },
    filter: { terms: timeTerms(range) },
    limit: 1000,
  }, signal)
  const loaders: Array<[AlarmSource, () => Promise<unknown>]> = [
    ['events', () => api.aggregateEvents({
      from: range.startTime, to: range.endTime, interval: range.interval, format,
      groupBy: [], filter: { terms: rawEventTerms() },
    }, signal)],
    ['iot', () => alarm('device')],
    ['vision', () => alarm('aiTaskMediaTarget')],
  ]
  const series = await Promise.all(loaders.map(async ([source, load]) => {
    try { return { source, points: toTrendPoints(rowsOf(await load()), range) } }
    catch (error) {
      if (signal.aborted) throw error
      return { source, points: [], failed: true }
    }
  }))
  signal.throwIfAborted()
  return { series, ranking: [] }
}

