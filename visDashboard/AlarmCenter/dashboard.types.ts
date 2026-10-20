import type { StyleValue } from 'vue'

export const dashboardKinds = [
  'TodayEvents', 'IotAlarms', 'VisionAlarms', 'QuickStart',
  'AlarmTrend', 'IotStatistics', 'VisionStatistics',
] as const
export type AlarmDashboardKind = typeof dashboardKinds[number]
export type AlarmTimeRange = 'today' | 'yesterday' | '3d' | '7d' | '30d'
export type AlarmDimension = 'type' | 'deviceType' | 'camera'
export type AlarmSource = 'events' | 'iot' | 'vision'
export type AlarmTarget = 'device' | 'aiTaskMediaTarget'
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
export interface AlarmWidgetData {
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
export interface AlarmQuickAction { key: string; icon: string; disabled?: boolean }
export const emptyWidgetData = (): AlarmWidgetData => ({ series: [], ranking: [] })
export const typeOf = (kind: AlarmDashboardKind) => `alarmCenter${kind === 'AlarmTrend' ? 'Trend' : kind}`
export const isMetricKind = (kind: AlarmDashboardKind) => ['TodayEvents', 'IotAlarms', 'VisionAlarms'].includes(kind)

