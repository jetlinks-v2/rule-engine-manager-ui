import i18n from '@jetlinks-web-core/locales'
import type { AlarmDashboardApi } from '../../../api/alarmDashboard'
import type { AlarmDimension, AlarmRankItem, AlarmTarget, AlarmWidgetData } from '../dashboard.types'
import { countOf, invalidResponse, resolveRange, rowsOf, textOf, timeTerms } from './query'

/** 聚合和名称补全都只读取有权限的设备；未知产品归为单独分组，保留真实数量。 */
async function groupByProduct(api: AlarmDashboardApi, rows: Record<string, unknown>[], signal: AbortSignal) {
  if (rows.length >= 10000) throw invalidResponse()
  const ids = [...new Set(rows.map(row => textOf(row.deviceId)).filter(Boolean))]
  const products = new Map<string, { id: string; name: string }>()
  // 固定批次串行补全，避免告警设备较多时产生逐设备请求或并发洪峰。
  for (let offset = 0; offset < ids.length; offset += 200) {
    signal.throwIfAborted()
    const devices = rowsOf(await api.queryDevices(ids.slice(offset, offset + 200), signal))
    for (const device of devices) {
      products.set(textOf(device.id), { id: textOf(device.productId), name: textOf(device.productName) })
    }
  }
  const result = new Map<string, AlarmRankItem>()
  for (const row of rows) {
    const product = products.get(textOf(row.deviceId))
    const id = product?.id || 'unknown'
    const previous = result.get(id)
    result.set(id, {
      id, name: product?.name || String(i18n.global.t('alarmDashboard.unknownDeviceType')),
      count: (previous?.count ?? 0) + countOf(row.count),
    })
  }
  return [...result.values()]
}

/** 两个统计面板固定今日窗口，维度切换不影响趋势或其他组件。 */
export async function loadStatistics(
  api: AlarmDashboardApi, target: AlarmTarget, dimension: AlarmDimension, limit: number, signal: AbortSignal,
): Promise<AlarmWidgetData> {
  const product = target === 'device' && dimension === 'deviceType'
  const camera = target === 'aiTaskMediaTarget' && dimension === 'camera'
  const groups = product ? [{ column: 'targetId', alias: 'deviceId' }]
    : camera ? [{ column: 'sourceId', alias: 'id' }, { column: 'sourceName', alias: 'name' }]
      : [{ column: 'alarmConfigId', alias: 'id' }, { column: 'alarmName', alias: 'name' }]
  const rows = rowsOf(await api.aggregateAlarms(target, {
    columns: [{ column: 'id', alias: 'count', aggregation: 'COUNT' }],
    groupBy: groups,
    filter: { terms: timeTerms(resolveRange('today')) },
    limit: 10000,
  }, signal))
  const ranking = product ? await groupByProduct(api, rows, signal) : rows.map(row => ({
    id: textOf(row.id), name: textOf(row.name) || String(i18n.global.t('alarmDashboard.unnamed')),
    count: countOf(row.count),
  }))
  signal.throwIfAborted()
  return {
    series: [],
    ranking: ranking.filter(row => row.count > 0)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit),
  }
}

