import type { AlarmDashboardApi } from '../../../api/alarmDashboard'
import type { AlarmMetricData, AlarmTarget, AlarmWidgetData } from '../dashboard.types'
import { countOf, rawEventTerms, resolveRange, timeTerms } from './query'

async function settleCounts(loaders: Record<string, () => Promise<unknown>>, signal: AbortSignal) {
  const entries = await Promise.all(Object.entries(loaders).map(async ([key, load]) => {
    try { return [key, countOf(await load())] as const }
    catch (error) {
      if (signal.aborted) throw error
      return [key, null] as const
    }
  }))
  signal.throwIfAborted()
  return Object.fromEntries(entries) as Record<string, number | null>
}

/** 今日主值与历史状态底栏各自查询，局部失败保留同卡已成功的数字。 */
export async function loadAlarmMetrics(api: AlarmDashboardApi, target: AlarmTarget, signal: AbortSignal): Promise<AlarmWidgetData> {
  const range = resolveRange('today')
  const counts = await settleCounts({
    today: () => api.countAlarms(target, { terms: timeTerms(range) }, signal),
    total: () => api.countAlarms(target, { terms: [] }, signal),
    active: () => api.countAlarms(target, { terms: [{ column: 'state', termType: 'eq', value: 'warning' }] }, signal),
    handled: () => api.countAlarms(target, { terms: [{ column: 'state', termType: 'eq', value: 'normal' }] }, signal),
  }, signal)
  const metric: AlarmMetricData = {
    today: counts.today, total: counts.total, active: counts.active, handled: counts.handled,
    failed: Object.keys(counts).filter(key => counts[key] === null),
  }
  return { metric, series: [], ranking: [] }
}

/** 拦截率的分母只包含成功完成且已有判定的复判，不能用原始事件减告警量估算。 */
export async function loadEventMetrics(api: AlarmDashboardApi, signal: AbortSignal): Promise<AlarmWidgetData> {
  const terms = timeTerms(resolveRange('today'), 'timestamp')
  const reviews = [
    ...terms, { column: 'taskType', termType: 'eq', value: 'reviewHandle' },
    { column: 'success', termType: 'eq', value: true },
    { column: 'waiting', termType: 'not', value: true },
  ]
  const counts = await settleCounts({
    today: () => api.countEvents({ terms: [...terms, ...rawEventTerms()] }, signal),
    valid: () => api.countEvents({ terms: [...reviews, { column: 'hitResults', termType: 'eq', value: 1 }] }, signal),
    filtered: () => api.countEvents({ terms: [...reviews, { column: 'hitResults', termType: 'eq', value: 0 }] }, signal),
  }, signal)
  const reviewFailed = counts.valid === null || counts.filtered === null
  const total = (counts.valid ?? 0) + (counts.filtered ?? 0)
  return {
    metric: {
      today: counts.today,
      filterRate: reviewFailed || !total ? null : Number(((counts.filtered! / total) * 100).toFixed(1)),
      failed: [...(counts.today === null ? ['today'] : []), ...(reviewFailed ? ['filterRate'] : [])],
    },
    series: [], ranking: [],
  }
}

