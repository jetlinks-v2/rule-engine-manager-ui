import i18n from '@jetlinks-web-core/locales'
import type { DashboardWidgetDefaults } from '@jetlinks-web-core/components/DashBoardCanvas'
import { isMetricKind, typeOf, type AlarmDashboardKind, type AlarmWidgetConfig, type AlarmWidgetInfo } from './dashboard.types'

export const timeRanges = ['today', 'yesterday', '3d', '7d', '30d'] as const
export const defaultSettings: AlarmWidgetConfig = {
  title: '', refreshSeconds: 60, timeRange: 'today', dimension: 'type', limit: 20,
}

/** 配置只归入当前组件命名空间，0 禁用轮询，其他值限制在 15 秒至一小时。 */
export function settingsOf(kind: AlarmDashboardKind, info?: AlarmWidgetInfo): AlarmWidgetConfig {
  const value = info?.componentProps?.[typeOf(kind)]
  const raw = value && typeof value === 'object' ? value as Partial<AlarmWidgetConfig> : {}
  const seconds = Number(raw.refreshSeconds ?? defaultSettings.refreshSeconds)
  const dimension = kind === 'IotStatistics' && raw.dimension === 'deviceType' ? 'deviceType'
    : kind === 'VisionStatistics' && raw.dimension === 'camera' ? 'camera' : 'type'
  return {
    title: typeof raw.title === 'string' ? raw.title : '',
    refreshSeconds: Number.isFinite(seconds) ? seconds === 0 ? 0 : Math.min(3600, Math.max(15, seconds)) : 60,
    timeRange: timeRanges.includes(raw.timeRange as typeof timeRanges[number]) ? raw.timeRange! : 'today',
    dimension,
    limit: Math.min(50, Math.max(1, Math.floor(Number(raw.limit) || 20))),
  }
}

export function createWidgetConfig(kind: AlarmDashboardKind): DashboardWidgetDefaults {
  const metric = isMetricKind(kind)
  return {
    name: String(i18n.global.t(`alarmDashboard.${kind}`)),
    type: typeOf(kind),
    componentProps: {
      style: { width: '100%', height: '100%' },
      gridItem: { x: 0, y: 0, w: metric ? 8 : 12, h: metric ? 4 : 10, minW: 4, minH: metric ? 4 : 7 },
      [typeOf(kind)]: { ...defaultSettings },
    },
  }
}

