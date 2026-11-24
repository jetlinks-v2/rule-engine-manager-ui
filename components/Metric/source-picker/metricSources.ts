import type { MetricContext } from '../types'

export interface MetricDeviceOption { id: string; name: string; productId?: string }
export interface MetricPropertyOption { id: string; name: string; unit?: string; description?: string; valueType?: Record<string, unknown>; platform?:boolean; history?:boolean; icon?:string; group?:string; expands?:Record<string,unknown> }
export interface MetricSourceTerm { column: string; termType: string; value: string }

/** 范围仅决定候选列表；保存的每个输入始终是明确设备与属性。 */
export function metricSourceTerms(context: MetricContext): MetricSourceTerm[] {
  if (!context.ownerId) return []
  switch (context.ownerType) {
    case 'device': return [{ column: 'id', termType: 'eq', value: context.ownerId }]
    case 'product': return [{ column: 'productId', termType: 'eq', value: context.ownerId }]
    case 'deviceGroup': return [{ column: 'id', termType: 'dev-group', value: context.ownerId }]
    case 'space': return [{ column: 'id', termType: 'space-bind$device', value: context.ownerId }]
    default: return []
  }
}
