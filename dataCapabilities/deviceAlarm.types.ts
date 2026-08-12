export type DeviceAlarmState = 'active' | 'handled'

export interface DeviceAlarmQueryTerm {
  column: string
  termType: string
  value: unknown
}

export interface DeviceAlarmTimeQuery {
  startTime?: number
  endTime?: number
}

export interface DeviceAlarmSummaryData {
  total: number
  active: number
  handled: number
  urgent: number
  deviceCount: number
  sampleTime: number
}

export interface DeviceAlarmRankQuery extends DeviceAlarmTimeQuery {
  limit: number
}

export interface DeviceAlarmRankRow {
  rank: number
  deviceId: string
  deviceName: string
  count: number
}

export interface DeviceAlarmListQuery extends DeviceAlarmTimeQuery {
  pageIndex: number
  pageSize: number
  state?: DeviceAlarmState
  deviceId?: string
  level?: number
  filterTerms?: DeviceAlarmQueryTerm[]
}

export interface DeviceAlarmListRow {
  alarmId: string
  deviceId: string | null
  deviceName: string | null
  alarmName: string | null
  level: number | null
  levelText: string | null
  state: DeviceAlarmState
  stateText: string
  content: string | null
  alarmTime: number | null
  handleTime: number | null
  durationMillis: number | null
}

export interface DeviceAlarmPageData {
  data: DeviceAlarmListRow[]
  total: number
  pageIndex: number
  pageSize: number
}
