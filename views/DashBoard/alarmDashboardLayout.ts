import { typeOf, type AlarmDashboardKind } from '../../visDashboard/AlarmCenter/dashboard.types'
import type { DashboardStoredLayoutItem } from '@jetlinks-web-core/components/DashBoardCanvas/types'

export type AlarmLayoutItem = readonly [AlarmDashboardKind, number, number, number, number]
export type AlarmLayoutMode = 'wide' | 'medium' | 'compact'
export const alarmLayoutMode = (width: number): AlarmLayoutMode =>
  width > 0 && width < 560 ? 'compact' : width > 0 && width < 1000 ? 'medium' : 'wide'

/** 七卡历史布局只用于迁移，不能随当前组件清单变化。 */
export function legacyAlarmDashboardLayout(mode: AlarmLayoutMode): readonly AlarmLayoutItem[] {
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

function combinedLayout(mode: AlarmLayoutMode, height: number): readonly AlarmLayoutItem[] {
  const existing = legacyAlarmDashboardLayout(mode)
  const y = existing[5][2]
  return [
    ...existing.slice(0, 5),
    ['HandlingStatistics', 0, y, 24, height],
    ...existing.slice(5).map(([kind, x, oldY, w, h]): AlarmLayoutItem => [kind, x, oldY + height, w, h]),
  ]
}

/** 两类处理卡与对应排行同宽，窄屏按行排列，各自保留独立筛选。 */
function separateLayout(mode: AlarmLayoutMode, h: number): readonly AlarmLayoutItem[] {
  const existing = legacyAlarmDashboardLayout(mode)
  const y = existing[5][2]
  const compact = mode === 'compact'
  return [
    ...existing.slice(0, 5),
    ['IotHandlingStatistics', 0, y, compact ? 24 : 12, h],
    ['VisionHandlingStatistics', compact ? 0 : 12, compact ? y + h : y, compact ? 24 : 12, h],
    ...existing.slice(5).map(([kind, x, oldY, w, height]): AlarmLayoutItem =>
      [kind, x, oldY + h * (compact ? 2 : 1), w, height]),
  ]
}

export function alarmDashboardLayout(mode: AlarmLayoutMode): readonly AlarmLayoutItem[] {
  return separateLayout(mode, 9)
}

function toStored(items: readonly AlarmLayoutItem[]): DashboardStoredLayoutItem[] {
  return items.map(([kind, x, y, w, h]) => ({ i: typeOf(kind), x, y, w, h }))
}

function hasIds(saved: DashboardStoredLayoutItem[], expected: DashboardStoredLayoutItem[]) {
  const ids = new Set(expected.map(item => item.i))
  return saved.length === ids.size && new Set(saved.map(item => item.i)).size === ids.size
    && saved.every(item => ids.has(item.i))
}

function matchesLayout(saved: DashboardStoredLayoutItem[], expected: DashboardStoredLayoutItem[]) {
  const positions = new Map(expected.map(item => [item.i, item]))
  return hasIds(saved, expected) && saved.every(item => {
    const value = positions.get(item.i)!
    return item.x === value.x && item.y === value.y && item.w === value.w && item.h === value.h
  })
}

/** 旧默认升级九卡；个人布局仅拆原处理区，其他卡片坐标和尺寸不变。 */
export function addHandlingStatisticsToLayout(saved: DashboardStoredLayoutItem[], mode: AlarmLayoutMode): DashboardStoredLayoutItem[] | undefined {
  const current = toStored(alarmDashboardLayout(mode))
  // 仅加高历史完整默认九卡（桌面 6 / 8 行）；手动位置或尺寸有改动时保持原样。
  const previousHeights = mode === 'wide' ? [6, 8] : [9]
  if (!matchesLayout(saved, current) && previousHeights.some(height => matchesLayout(saved, toStored(separateLayout(mode, height))))) return current
  if (hasIds(saved, current)) return
  const legacy = toStored(legacyAlarmDashboardLayout(mode))
  const combined = toStored(combinedLayout(mode, mode === 'wide' ? 8 : mode === 'medium' ? 9 : 18))
  const previous = toStored(combinedLayout(mode, mode === 'compact' ? 18 : 10))
  if ([legacy, combined, previous].some(layout => matchesLayout(saved, layout))) return current
  if (!hasIds(saved, legacy) && !hasIds(saved, combined)) return
  const sources = current.filter(item => item.i === typeOf('IotHandlingStatistics') || item.i === typeOf('VisionHandlingStatistics'))
  const old = saved.find(item => item.i === typeOf('HandlingStatistics'))
  if (old && mode !== 'compact' && old.w >= 8) {
    const left = Math.floor(old.w / 2)
    return saved.flatMap(item => item === old ? [
      { ...old, i: sources[0].i, w: left },
      { ...old, i: sources[1].i, x: old.x + left, w: old.w - left },
    ] : [item])
  }
  if (old && old.h >= 14) {
    const top = Math.floor(old.h / 2)
    return saved.flatMap(item => item === old ? [
      { ...old, i: sources[0].i, h: top },
      { ...old, i: sources[1].i, y: old.y + top, h: old.h - top },
    ] : [item])
  }
  const retained = saved.filter(item => item !== old)
  const bottom = Math.max(0, ...retained.map(item => item.y + item.h))
  const y = sources[0].y
  return [...retained, ...sources.map(item => ({ ...item, y: bottom + item.y - y }))]
}
