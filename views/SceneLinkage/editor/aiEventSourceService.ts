import {
  MEDIA_ACCESS_PROVIDERS, queryAiSourceMappings, queryAiSourceDeviceDetails, queryAiSourceProducts, queryAiSourceSpaces, readAiSourceList,
  type AiSourceMapping, type AiSourceDevice, type AiConfiguredSource,
} from '../../../api/scene-ai-sources'
import type { AiEventMediaChannel } from '../../../api/scene-linkage'
import { normalizeResult } from '../utils'

export const aiEventSourceKey = (source: { deviceId?: string; channelId?: string | null }) =>
  JSON.stringify([source.deviceId, source.channelId || ''])

/** 空配置允许保留在映射管理中，但不能作为可推理来源。 */
export function hasAiMappingSource(mapping: AiSourceMapping) {
  const fields = mapping.type === 'property'
    ? [mapping.propertyImageSource, mapping.propertyVideoSource]
    : mapping.type === 'event' && mapping.eventId ? [mapping.imageSource, mapping.videoSource, mapping.metadataId] : []
  return fields.some(value => Boolean(value?.trim()))
}

export function mapAiMappingSources(mappings: AiSourceMapping[], devices: AiSourceDevice[], products: Array<{ id: string; accessProvider: string }>): AiEventMediaChannel[] {
  const deviceById = new Map(devices.map(device => [device.id, device]))
  const providerById = new Map(products.map(product => [product.id, product.accessProvider]))
  return mappings.filter(hasAiMappingSource).flatMap(mapping => {
    const device = deviceById.get(mapping.deviceId)
    if (!device) return []
    const channelId = mapping.channelId?.trim() || undefined
    // 真实媒体通道统一由媒体接口提供，避免通道及其映射显示为两个来源。
    if (channelId && MEDIA_ACCESS_PROVIDERS.includes(providerById.get(device.productId) || '')) return []
    return [{ id: `mapping:${mapping.id}`, deviceId: mapping.deviceId, channelId, mappingType: mapping.type,
      name: mapping.name?.trim() || mapping.channelName?.trim() || channelId || device.name || device.id }]
  })
}

/** 只补查映射引用的设备与产品，设备读取权限沿用服务端入口，每批最多 30 个设备。 */
export async function loadAiMappingSources(): Promise<AiEventMediaChannel[]> {
  const mappings = readAiSourceList<AiSourceMapping>(await queryAiSourceMappings()).filter(hasAiMappingSource)
  const ids = [...new Set(mappings.map(mapping => mapping.deviceId))]
  const devices: AiSourceDevice[] = []
  for (let offset = 0; offset < ids.length; offset += 30) {
    devices.push(...normalizeResult<AiSourceDevice>(await queryAiSourceDeviceDetails(ids.slice(offset, offset + 30))).data)
  }
  const channelDeviceIds = new Set(mappings.filter(mapping => mapping.channelId?.trim()).map(mapping => mapping.deviceId))
  const productIds = [...new Set(devices.filter(device => channelDeviceIds.has(device.id)).map(device => device.productId))]
  const products = productIds.length ? readAiSourceList<{ id: string; accessProvider: string }>(await queryAiSourceProducts(
    productIds,
  )) : []
  return mapAiMappingSources(mappings, devices, products)
}

export async function loadAiMappingSpaces(sources: AiEventMediaChannel[]) {
  const ids = [...new Set(sources.map(source => source.deviceId))]
  const spaces = new Map<string, Set<string>>()
  for (let offset = 0; offset < ids.length; offset += 30) {
    const details = readAiSourceList<{ deviceId: string; spaceId: string }>(await queryAiSourceSpaces(ids.slice(offset, offset + 30)))
    details.forEach(detail => {
      const values = spaces.get(detail.deviceId) || new Set<string>()
      values.add(detail.spaceId)
      spaces.set(detail.deviceId, values)
    })
  }
  return spaces
}

/** 云端与边端使用同一设备/通道身份；设备级配置不能使该设备的所有通道变为可选。 */
export function applyAiSourceConfiguration(channels: AiEventMediaChannel[], sources: AiConfiguredSource[], edgeIds: Set<string>) {
  const configured = new Set(sources.filter(source => source.deviceId).map(aiEventSourceKey))
  return channels.map(channel => ({ ...channel,
    modelConfigured: configured.has(aiEventSourceKey(channel)) || (!channel.mappingType && edgeIds.has(channel.id)),
  }))
}
