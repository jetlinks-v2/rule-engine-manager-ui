import type { StyleValue } from 'vue'

export const legacyDashboardKinds = [
  'TodayEvents', 'IotAlarms', 'VisionAlarms', 'QuickStart',
  'AlarmTrend', 'IotStatistics', 'VisionStatistics',
] as const
export const dashboardKinds = [...legacyDashboardKinds, 'IotHandlingStatistics', 'VisionHandlingStatistics'] as const
// 旧组合卡仍可在已保存的自定义仪表盘中渲染。
export type AlarmDashboardKind = typeof dashboardKinds[number] | 'HandlingStatistics'
export type AlarmHandlingSource = 'iot' | 'vision'
export const handlingSourceOf = (kind: AlarmDashboardKind): AlarmHandlingSource | undefined =>
  kind === 'IotHandlingStatistics' ? 'iot' : kind === 'VisionHandlingStatistics' ? 'vision' : undefined
export const isHandlingKind = (kind: AlarmDashboardKind) => kind === 'HandlingStatistics' || Boolean(handlingSourceOf(kind))
export type AlarmTimeRange = 'today' | 'yesterday' | '3d' | '7d' | '30d'
export type AlarmDimension = 'type' | 'deviceType' | 'camera'
export type AlarmSource = 'events' | 'iot' | 'vision'
export type AlarmTarget = 'device' | 'aiTaskMediaTarget'
export const alarmRankingLimit = 10
export interface AlarmWidgetConfig {
  title: string
  refreshSeconds: number
  timeRange: AlarmTimeRange
  dimension: AlarmDimension
  limit: number
}
export interface AlarmWidgetInfo {
  type?: string
  componentProps?: Record<string, unknown>
}
export interface AlarmWidgetProps {
  info?: AlarmWidgetInfo
  isEdit?: boolean
  style?: StyleValue
}
export interface AlarmMetricData {
  today: number | null
  total?: number | null
  active?: number | null
  handled?: number | null
  filterRate?: number | null
  failed: string[]
}
export interface AlarmTrendPoint { timestamp: number; count: number }
export interface AlarmTrendSeries {
  source: AlarmSource
  points: AlarmTrendPoint[]
  failed?: boolean
}
export interface AlarmRankItem { id: string; name: string; count: number }
export interface AlarmHandlingPoint { timestamp: number; active: number; handled: number }
export interface AlarmHandlingStats {
  total: number | null
  active: number | null
  handled: number | null
  rate: number | null
  points: AlarmHandlingPoint[]
  failed: boolean
}
export type AlarmHandlingData = Partial<Record<AlarmHandlingSource, AlarmHandlingStats>>
export interface AlarmWidgetData {
  handling?: AlarmHandlingData
  window?: AlarmQueryRange
  metric?: AlarmMetricData
  series: AlarmTrendSeries[]
  ranking: AlarmRankItem[]
}
export interface AlarmQueryRange {
  startTime: number
  endTime: number
  interval: '1h' | '1d'
}
export interface AlarmQueryTerm { column: string; termType: string; value: unknown }
export interface AlarmQuickAction { key: string; icon: string; disabled?: boolean; unconfigured?: boolean }
export const emptyWidgetData = (): AlarmWidgetData => ({ series: [], ranking: [] })
export const typeOf = (kind: AlarmDashboardKind) => `alarmCenter${kind === 'AlarmTrend' ? 'Trend' : kind}`
export const isMetricKind = (kind: AlarmDashboardKind) => ['TodayEvents', 'IotAlarms', 'VisionAlarms'].includes(kind)

