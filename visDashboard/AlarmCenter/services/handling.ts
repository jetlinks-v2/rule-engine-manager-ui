import type { AlarmDashboardApi } from '../../../api/alarmDashboard'
import type { AlarmHandlingData, AlarmHandlingSource, AlarmHandlingStats, AlarmTarget, AlarmTimeRange, AlarmWidgetData } from '../dashboard.types'
import { countOf, invalidResponse, isRecord, resolveRange, rowsOf, timeTerms } from './query'

/** 同一分类一次聚合两种状态，计数与比例来自同一窗口、同一查询快照。 */
export async function loadHandlingStatistics(api: AlarmDashboardApi, timeRange: AlarmTimeRange, signal: AbortSignal, source?: AlarmHandlingSource): Promise<AlarmWidgetData> {
  const range = resolveRange(timeRange)
  const load = async (target: AlarmTarget): Promise<AlarmHandlingStats> => {
    try {
      const rows = rowsOf(await api.aggregateAlarms(target, {
        columns: [{ column: 'id', alias: 'count', aggregation: 'COUNT' }],
        groupBy: [{ column: 'state', alias: 'state' }],
        filter: { terms: timeTerms(range) }, limit: 10,
      }, signal))
      let active = 0, handled = 0
      for (const row of rows) {
        const state = isRecord(row.state) ? row.state.value : row.state
        const count = countOf(row.count)
        if (state === 'warning') active += count
        else if (state === 'normal') handled += count
        else throw invalidResponse()
      }
      signal.throwIfAborted()
      const total = active + handled
      return { total, active, handled, rate: total ? Number((handled / total * 100).toFixed(1)) : null, failed: false }
    } catch (error) {
      signal.throwIfAborted()
      return { total: null, active: null, handled: null, rate: null, failed: true }
    }
  }
  const sources: AlarmHandlingSource[] = source ? [source] : ['iot', 'vision']
  const handling: AlarmHandlingData = Object.fromEntries(await Promise.all(sources.map(async key =>
    [key, await load(key === 'iot' ? 'device' : 'aiTaskMediaTarget')])))
  return { handling, window: range, series: [], ranking: [] }
}
