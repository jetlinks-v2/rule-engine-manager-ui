export const ALARM_ANALYSIS_EXTENSION_KEY = 'alarm/alarm-analysis'
export const ALARM_ANALYSIS_PROVIDER_ID = 'alarm:alarm-analysis'
export const ALARM_ANALYSIS_CATEGORY = 'alarm'
export const ALARM_RECORD_ENTRY_NAMESPACE = 'alarm:record'
export const ALARM_SOURCES = ['all', 'vision', 'iot'] as const
export const ALARM_RECORD_SOURCES = ['vision', 'iot'] as const
export const ALARM_RECORD_STATES = ['open', 'handled'] as const
export const ALARM_TREND_INTERVALS = ['1m', '1h', '1d', '1w'] as const
export const ALARM_RANK_GROUPS = ['target', 'level', 'scene', 'algorithm', 'channel'] as const

export const ALARM_MENU_ANCHORS = {
  dashboard: ['rule-engine/DashBoard', '/rule-engine/DashBoard'],
  events: ['rule-engine/Alarm/Log', '/rule-engine/Alarm/Log'],
  search: [],
} as const
