export type CollectorPointDataType = { type?: string; [key: string]: unknown }

/** 点位转换接口返回实体权限枚举和嵌套物模型，并非运行时 Point 对象。 */
export type ConvertedCollectorPoint = {
  id: string
  name: string
  accessModes?: Array<string | { value: string; text?: string }>
  metadata?: { dataType?: CollectorPointDataType; [key: string]: unknown }
  [key: string]: unknown
}
export type CollectorPoint = ConvertedCollectorPoint & {
  accessModeMask: number
  dataType?: CollectorPointDataType
}
const accessModeBits: Record<string, number> = { read: 1, write: 2, subscribe: 4 }

/** 在查询边界统一适配，供点位列表及原有读写表单使用；始终保留实体 ID 和完整值类型。 */
export function normalizeCollectorPoint(point: ConvertedCollectorPoint): CollectorPoint {
  return {
    ...point,
    accessModeMask: (point.accessModes || []).reduce((mask, mode) => mask | (accessModeBits[typeof mode === 'string' ? mode : mode.value] || 0), 0),
    dataType: point.metadata?.dataType,
  }
}
