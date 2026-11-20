import { request } from '@jetlinks-web/core'

export const MEDIA_ACCESS_PROVIDERS = ['fixed-media', 'gb28181-2016', 'media-plugin', 'onvif', 'agent-media-device-gateway']

export interface AiSourceDevice {
  id: string
  name?: string
  productId: string
}

export interface AiSourceMapping {
  id: string
  deviceId: string
  name?: string | null
  channelId?: string | null
  channelName?: string | null
  type: 'event' | 'property'
  eventId?: string | null
  imageSource?: string | null
  videoSource?: string | null
  metadataId?: string | null
  propertyImageSource?: string | null
  propertyVideoSource?: string | null
}

export interface AiConfiguredSource {
  type?: string
  deviceId?: string
  channelId?: string | null
}

/** 业务失败及异常响应不能被当作“没有来源/未配置”。 */
export function readAiSourceList<T>(response: unknown): T[] {
  const envelope = response as { result?: unknown; success?: boolean; status?: number } | null
  const result = envelope?.result ?? response
  if (envelope?.success === false || (envelope?.status != null && envelope.status !== 200) || !Array.isArray(result)) {
    throw new Error('Invalid visual source response')
  }
  return result as T[]
}

/** 将媒体接入与映射存在性条件整体嵌套，搜索条件继续与其做 AND。 */
export const queryAiSourceDevices = (pageIndex: number, keyword = '') => request.post('/device-instance/_query', {
  pageIndex, pageSize: 30, includes: ['id', 'name', 'productId', 'state'],
  terms: [
    { terms: [
      { column: 'productId$product-info', value: [{ column: 'accessProvider', termType: 'in', value: MEDIA_ACCESS_PROVIDERS }] },
      { column: 'id', termType: 'ai-device-event-mapping', value: {}, type: 'or' },
    ] },
    ...(keyword ? [{ terms: [
      { column: 'name', termType: 'like', value: `%${keyword}%` },
      { column: 'id', termType: 'like', value: `%${keyword}%`, type: 'or' },
    ] }] : []),
  ],
  sorts: [{ name: 'createTime', order: 'desc' }, { name: 'id', order: 'asc' }],
})

export const queryAiSourceMappings = () => request.post('/ai/device-event-mapping/_query/no-paging', {
  paging: false, sorts: [{ name: 'id', order: 'asc' }],
})

export const queryAiSourceDeviceDetails = (ids: string[]) => request.post('/device-instance/_query', {
  pageIndex: 0, pageSize: ids.length, includes: ['id', 'name', 'productId'],
  terms: [{ column: 'id', termType: 'in', value: ids }],
})

export const queryAiSourceProducts = (ids: string[]) => request.post('/device-product/_query/no-paging', {
  paging: false, includes: ['id', 'accessProvider'], terms: [{ column: 'id', termType: 'in', value: ids }],
})

/** 映射按设备自身的空间绑定归属；包含父级空间以支持按空间及子空间浏览。 */
export const queryAiSourceSpaces = (deviceIds: string[]) => request.post('/space/bind/_detail', {
  paging: false, terms: [
    { column: 'deviceId', termType: 'in', value: deviceIds },
    ...['channelId', 'edgeDeviceId'].map(column => ({ terms: [
      { column, termType: 'isnull', value: true },
      { column, termType: 'eq', value: '', type: 'or' },
    ] })),
  ],
}, { params: { includeParent: true } })

/** 云端任务来源补充边端通道绑定，空通道来源保持设备级身份。 */
export const queryAiConfiguredSources = (sceneId: string, taskTarget: string) => request.post('/ai/cv/_sources', {
  paging: false, terms: [
    { column: 'taskTarget', termType: 'eq', value: taskTarget },
    { column: 'state', termType: 'eq', value: 'enabled' },
    { column: 'modelId', termType: 'ai-model-scene', value: { sceneId } },
  ],
}, { params: { containTask: false }, hiddenError: true }).then(readAiSourceList<AiConfiguredSource>)
