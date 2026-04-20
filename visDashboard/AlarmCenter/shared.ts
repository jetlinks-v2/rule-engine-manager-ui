import type { StyleValue } from 'vue'

export interface CountSummaryComponentConfig {
  topTitle: string
  customLabel?: string
  badgeText: string
  tooltip: string
  fallbackName: string
  iconType: string
  iconColor: string
  valueColor: string
  mockValue: number
  emptyText: string
}

export interface CountSummaryCardInfo {
  id?: string
  componentProps?: Record<string, Record<string, unknown>>
  extraProps?: {
    options?: CountSummaryDataItem[]
  }
  dataSourceProps?: unknown[]
}

export interface CountSummaryCardProps {
  info?: CountSummaryCardInfo
  style?: StyleValue
  isEdit?: boolean
}

export interface CountSummaryDataItem {
  key?: string | number
  name?: string
  mappingName?: string
  value?: unknown
  isMock?: boolean
  sourceId?: string
  deviceId?: string
  mappingId?: string
  config?: Record<string, unknown>
  [key: string]: unknown
}

export interface CountSummaryMetricViewModel {
  topTitle: string
  badgeText: string
  tooltip: string
  label: string
  value: string
  iconType: string
  iconColor: string
  valueColor: string
  emptyText: string
}

export type CountSummaryCardStyle = StyleValue

export const mergeCountSummaryConfig = <T extends object>(defaults: T, value?: Partial<T>): T =>
  ({
    ...defaults,
    ...(value || {})
  }) as T
