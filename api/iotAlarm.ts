import { request } from '@jetlinks-web/core'

export const IOT_ALARM_TARGET_TYPE = 'device'

export type AlarmRecord = Record<string, unknown>

export interface AlarmPage {
  data: AlarmRecord[]
  total: number
  pageIndex: number
  pageSize: number
}

const unwrap = (payload: unknown): unknown => {
  if (payload && typeof payload === 'object' && 'result' in payload) {
    return (payload as { result: unknown }).result
  }
  return payload
}

/** Query device alarm records while preserving the runtime cancellation signal. */
export async function queryIotAlarmPage(
  data: Record<string, unknown>,
  config?: Record<string, unknown>,
): Promise<AlarmPage> {
  const response = config
    ? request.post(`/alarm/record/${IOT_ALARM_TARGET_TYPE}/_query`, data, config)
    : request.post(`/alarm/record/${IOT_ALARM_TARGET_TYPE}/_query`, data)
  const result = unwrap(await response)
  if (Array.isArray(result)) {
    const rows = result.filter(isAlarmRecord)
    return { data: rows, total: rows.length, pageIndex: 0, pageSize: rows.length }
  }
  const page = isAlarmRecord(result) ? result : {}
  const rows = Array.isArray(page.data)
    ? page.data
    : Array.isArray(page.records)
      ? page.records
      : []
  const records = rows.filter(isAlarmRecord)
  return {
    data: records,
    total: Number(page.total ?? records.length),
    pageIndex: Number(page.pageIndex ?? data.pageIndex ?? 0),
    pageSize: Number(page.pageSize ?? data.pageSize ?? 10),
  }
}

export async function countIotAlarms(
  data: Record<string, unknown>,
  config?: Record<string, unknown>,
): Promise<number> {
  const response = config
    ? request.post(`/alarm/record/${IOT_ALARM_TARGET_TYPE}/_count`, data, config)
    : request.post(`/alarm/record/${IOT_ALARM_TARGET_TYPE}/_count`, data)
  const result = unwrap(await response)
  return Number(isAlarmRecord(result) ? result.total ?? result.count ?? 0 : result ?? 0)
}

export async function aggregateIotAlarms(
  data: Record<string, unknown>,
  config?: Record<string, unknown>,
): Promise<AlarmRecord[]> {
  const response = config
    ? request.post(`/alarm/record/${IOT_ALARM_TARGET_TYPE}/_aggregation`, data, config)
    : request.post(`/alarm/record/${IOT_ALARM_TARGET_TYPE}/_aggregation`, data)
  const result = unwrap(await response)
  return Array.isArray(result) ? result.filter(isAlarmRecord) : []
}

export async function queryIotDashboard(
  data: object,
  config?: Record<string, unknown>,
): Promise<AlarmRecord[]> {
  const response = config
    ? request.post('/dashboard/_multi', data, config)
    : request.post('/dashboard/_multi', data)
  const result = unwrap(await response)
  return Array.isArray(result) ? result.filter(isAlarmRecord) : []
}

function isAlarmRecord(value: unknown): value is AlarmRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
