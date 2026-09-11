import { request } from '@jetlinks-web/core'

type ApiResponse<T> = {
  result?: T
}

type PageResult<T> = {
  data?: T[]
}

export type SceneDeviceGroup = {
  id: string
  name: string
  parentId?: string
}

export type SceneSpaceArea = {
  id: string
  name: string
  parentId?: string
}

export type SceneDeviceSpaceBinding = {
  deviceId: string
  areaId: string
  area?: string
}

const unwrapList = <T>(response: ApiResponse<T[] | PageResult<T>> | T[] | PageResult<T> | undefined): T[] => {
  if (Array.isArray(response)) return response
  const result = response?.result ?? response
  if (Array.isArray(result)) return result
  return result?.data ?? []
}

/**
 * 场景联动只需要分组树的标识和层级；不复用设备管理模块的运行时分组 API。
 */
export async function queryDeviceGroupDetailList_api(): Promise<SceneDeviceGroup[]> {
  const response = await request.post('/device/group/_query/_detail', {
    paging: false,
    sorts: [{ name: 'sortIndex', order: 'asc' }],
  })

  return unwrapList<Record<string, unknown>>(response).map((item) => ({
    id: String(item.id || ''),
    name: String(item.name || item.id || ''),
    parentId: item.parentId ? String(item.parentId) : undefined,
  })).filter((item) => Boolean(item.id))
}

/**
 * 按设备补充分组归属，供场景的设备范围树展示，不改变设备列表的默认过滤语义。
 */
export async function queryDeviceBoundGroups_api(deviceIds: string[]): Promise<Record<string, SceneDeviceGroup[]>> {
  const ids = [...new Set(deviceIds.filter(Boolean))]
  if (!ids.length) return {}

  const groups = await queryDeviceGroupDetailList_api()
  const groupByDeviceId: Record<string, SceneDeviceGroup[]> = {}

  await Promise.all(groups.map(async (group) => {
    const response = await request.post('/device/group/device/_runtime-query', {
      pageIndex: 0,
      pageSize: ids.length,
      terms: [
        { column: 'id', termType: 'dev-group', value: group.id },
        { column: 'id', termType: 'in', value: ids },
      ],
    })
    unwrapList<Record<string, unknown>>(response).forEach((device) => {
      const deviceId = String(device.id || '')
      if (!deviceId) return
      groupByDeviceId[deviceId] = [...(groupByDeviceId[deviceId] || []), group]
    })
  }))

  return groupByDeviceId
}

/**
 * 私有化场景页只消费区域树的基础字段，避免把 SaaS 项目空间模型带入规则引擎模块。
 */
export async function queryProjectSpaceAreaSettings_api(_projectId: string): Promise<{ areas: SceneSpaceArea[] }> {
  const response = await request.post('/space/_query/tree', {
    paging: false,
    sorts: [{ name: 'sortIndex', order: 'asc' }],
  })

  const flatten = (items: Record<string, unknown>[]): Record<string, unknown>[] =>
    items.flatMap((item) => [item, ...flatten(Array.isArray(item.children) ? item.children as Record<string, unknown>[] : [])])

  return {
    areas: flatten(unwrapList<Record<string, unknown>>(response)).map((item) => ({
      id: String(item.id || ''),
      name: String(item.name || item.code || item.id || ''),
      parentId: item.parentId ? String(item.parentId) : undefined,
    })).filter((item) => Boolean(item.id)),
  }
}

export async function queryDeviceSpaceAreaBindings_api(deviceIds: string[]): Promise<SceneDeviceSpaceBinding[]> {
  const ids = [...new Set(deviceIds.filter(Boolean))]
  if (!ids.length) return []

  const response = await request.post('/space/data-bind/_query/no-paging', {
    paging: false,
    terms: [{ column: 'deviceId', termType: 'in', value: ids }],
  })

  return unwrapList<Record<string, any>>(response).flatMap((item) => {
    const deviceId = String(item.deviceId || item.extensions?.deviceId || '')
    const areaId = String(item.spaceId || '')
    if (!deviceId || !areaId || !ids.includes(deviceId)) return []
    if (String(item.extensions?.assetType || 'DEVICE').toUpperCase() !== 'DEVICE') return []
    return [{
      deviceId,
      areaId,
      area: typeof item.extensions?.spaceName === 'string' ? item.extensions.spaceName : undefined,
    }]
  })
}
