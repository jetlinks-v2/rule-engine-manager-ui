import { request } from '@jetlinks-web/core'
import type { DataCapabilityRequest } from '@jetlinks-web-core/data-capability'
import type { AlarmTarget } from '../visDashboard/AlarmCenter/dashboard.types'

/** 沿用平台请求上下文与资产权限；组件服务注入同一 client 便于验证真实请求契约。 */
export function createAlarmDashboardApi(client: DataCapabilityRequest = request) {
  // 历史部署可能只按路径注入资产权限；显式限制目标类型，避免两个来源返回同一份全量统计。
  const scoped = (target: AlarmTarget, data: object) => {
    const query = data as Record<string, unknown>
    return { ...query, terms: [
      { column: 'targetType', termType: 'eq', value: target },
      ...(Array.isArray(query.terms) ? query.terms : []),
    ] }
  }
  const post = (path: string, data: object, signal?: AbortSignal, deviceAsset = false) =>
    client.post(path, data, {
      signal, hiddenError: true,
      ...(deviceAsset ? { params: { assetType: 'device' } } : {}),
    })
  return {
    countAlarms: (target: AlarmTarget, data: object, signal?: AbortSignal) =>
      post(`/alarm/record/${target}/_count`, scoped(target, data), signal),
    aggregateAlarms: (target: AlarmTarget, data: object, signal?: AbortSignal) =>
      post(`/alarm/record/${target}/_aggregation`, {
        ...data, filter: scoped(target, (data as { filter?: object }).filter || {}),
      }, signal),
    countEvents: (data: object, signal?: AbortSignal) =>
      post('/ai/task/history/_count', data, signal, true),
    aggregateEvents: (data: object, signal?: AbortSignal) =>
      post('/ai/task/history/aggregation/_count', data, signal, true),
    queryDevices: (ids: string[], signal?: AbortSignal) =>
      post('/device/instance/_query/no-paging', {
        paging: false, includes: ['id', 'productId', 'productName'],
        terms: [{ column: 'id', termType: 'in', value: ids }],
      }, signal),
  }
}
export type AlarmDashboardApi = ReturnType<typeof createAlarmDashboardApi>

