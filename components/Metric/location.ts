import type { LocationQuery, LocationQueryRaw } from 'vue-router'
import type { MetricContext, MetricReference, MetricWorkspaceSelection } from './types'

/** 返回时同时恢复业务对象、所在视图及具体指标，避免页面重建后落到首项。 */
export function metricReturnQuery(query: LocationQueryRaw, context: MetricContext, reference: MetricReference): LocationQueryRaw {
  return {
    ...query, metricOwnerType: context.ownerType, metricOwnerId: context.ownerId,
    metricConfigId: reference.configId, metricOutputId: reference.outputId,
  }
}

export function metricReferenceFromQuery(query: LocationQuery, context: MetricContext): MetricReference | undefined {
  if (query.metricOwnerType !== context.ownerType || query.metricOwnerId !== context.ownerId) return
  return typeof query.metricConfigId === 'string' && typeof query.metricOutputId === 'string'
    ? { configId: query.metricConfigId, outputId: query.metricOutputId } : undefined
}

export function metricWorkspaceSelectionFromQuery(query: LocationQuery): MetricWorkspaceSelection | undefined {
  return typeof query.metricOwnerType === 'string' && Boolean(query.metricOwnerType) && typeof query.metricOwnerId === 'string'
    ? { ownerType: query.metricOwnerType, ownerId: query.metricOwnerId } : undefined
}

export function metricWorkspaceQuery(query: LocationQuery, selection?: MetricWorkspaceSelection): LocationQueryRaw {
  const same = selection?.ownerType === query.metricOwnerType && selection?.ownerId === query.metricOwnerId
  return { ...query, metricOwnerType: selection?.ownerType, metricOwnerId: selection?.ownerId,
    metricConfigId: same ? query.metricConfigId : undefined, metricOutputId: same ? query.metricOutputId : undefined }
}

/** 当前详情关闭或不可读后，返回业务页不能重新携带 URL 中的旧详情引用。 */
export function metricBusinessQuery(query: LocationQueryRaw, context: MetricContext, reference?: MetricReference): LocationQueryRaw {
  return reference ? metricReturnQuery(query, context, reference) : {
    ...query, metricOwnerType: undefined, metricOwnerId: undefined, metricConfigId: undefined, metricOutputId: undefined,
  }
}

/** 未获取登录身份时不读写范围记忆；JSON 元组避免分隔符碰撞。 */
export function metricScopeKey(userId: string, projectId: string, tenant: string): string {
  return userId ? JSON.stringify([userId, projectId, tenant]) : ''
}
