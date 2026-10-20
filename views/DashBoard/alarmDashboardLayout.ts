import type { AlarmDashboardKind } from '../../visDashboard/AlarmCenter/dashboard.types'

export type AlarmLayoutItem = readonly [AlarmDashboardKind, number, number, number, number]
export type AlarmLayoutMode = 'wide' | 'medium' | 'compact'
export const alarmLayoutMode = (width: number): AlarmLayoutMode =>
  width > 0 && width < 560 ? 'compact' : width > 0 && width < 1000 ? 'medium' : 'wide'

/** 实际画布宽度决定默认布局；个人布局仍由画布恢复，窄屏不继承桌面坐标。 */
export function alarmDashboardLayout(mode: AlarmLayoutMode): readonly AlarmLayoutItem[] {
  if (mode === 'wide') return [
    ['TodayEvents', 0, 0, 8, 4], ['IotAlarms', 8, 0, 8, 4], ['VisionAlarms', 16, 0, 8, 4],
    ['QuickStart', 0, 4, 12, 10], ['AlarmTrend', 12, 4, 12, 10],
    ['IotStatistics', 0, 14, 12, 13], ['VisionStatistics', 12, 14, 12, 13],
  ]
  if (mode === 'medium') return [
    ['TodayEvents', 0, 0, 24, 4], ['IotAlarms', 0, 4, 12, 5], ['VisionAlarms', 12, 4, 12, 5],
    ['QuickStart', 0, 9, 24, 9], ['AlarmTrend', 0, 18, 24, 10],
    ['IotStatistics', 0, 28, 12, 13], ['VisionStatistics', 12, 28, 12, 13],
  ]
  return [
    ['TodayEvents', 0, 0, 24, 4], ['IotAlarms', 0, 4, 24, 5], ['VisionAlarms', 0, 9, 24, 5],
    ['QuickStart', 0, 14, 24, 12], ['AlarmTrend', 0, 26, 24, 10],
    ['IotStatistics', 0, 36, 24, 13], ['VisionStatistics', 0, 49, 24, 13],
  ]
}

