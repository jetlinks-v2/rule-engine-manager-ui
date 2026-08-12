import { loadVisionAlarmLevelTrend } from './visionAlarm.service'
import type {
  TimeRangeQuery,
  VisionAlarmTrendRow,
} from './visionAlarm.types'

/** 将既有等级趋势汇总为资源组件消费的告警总趋势。 */
export async function loadVisionAlarmTrend(
  query: TimeRangeQuery,
  signal?: AbortSignal,
): Promise<VisionAlarmTrendRow[]> {
  const levelRows = await loadVisionAlarmLevelTrend(query, signal)
  const totals = new Map<number, number>()
  levelRows.forEach((row) => {
    totals.set(row.timestamp, (totals.get(row.timestamp) ?? 0) + row.count)
  })
  return [...totals.entries()]
    .sort(([left], [right]) => left - right)
    .map(([timestamp, count]) => ({ timestamp, count }))
}

