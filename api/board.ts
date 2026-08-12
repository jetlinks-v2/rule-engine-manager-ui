import { request } from '@jetlinks-web/core'

export const queryRule = (data: object) =>
  request.post('/alarm/config/detail/_query', data)

export const queryRecord = (targetType: string, data: object, config?: Record<string, unknown>) =>
  config
    ? request.post(`/alarm/record/${targetType}/_query`, data, config)
    : request.post(`/alarm/record/${targetType}/_query`, data)

export const queryAlarmHistoryByRecord = (alarmRecordId: string, data: object) =>
  request.post(`/alarm/history/alarm-record/${encodeURIComponent(alarmRecordId)}/_query`, data)

export const queryAlarmHandleHistory = (alarmRecordId: string, data: object) =>
  request.post(`/alarm/record/${encodeURIComponent(alarmRecordId)}/handle-history/_query`, data)

export const queryAiTaskHistory = (data: object) =>
  request.post('/ai/task/history/_query', data, { params: { assetType: 'device' } })

export const countAiTaskHistory = (data: object) =>
  request.post('/ai/task/history/_count', data, { params: { assetType: 'device' } })

export const countRecord = (targetType: string, data: object, config?: Record<string, unknown>) =>
  config
    ? request.post(`/alarm/record/${targetType}/_count`, data, config)
    : request.post(`/alarm/record/${targetType}/_count`, data)

export const aggregationRecord = (targetType: string, data: object, config?: Record<string, unknown>) =>
  config
    ? request.post(`/alarm/record/${targetType}/_aggregation`, data, config)
    : request.post(`/alarm/record/${targetType}/_aggregation`, data)

export const aggregateAiAlarmHistory = (data: object, config?: Record<string, unknown>) =>
  config
    ? request.post('/ai/aggregate/task/alarm/history/_aggregation', data, config)
    : request.post('/ai/aggregate/task/alarm/history/_aggregation', data)

export const queryAlarmDashboard = (data: object) =>
  request.post('/dashboard/_multi', data)

export const detail = (id: string) =>
  request.get(`/alarm/record/${id}/detail`)

export const handle = (data: object) =>
  request.post('/alarm/record/_handle', data)

export const handleAggregateTaskAlarm = (data: object) =>
  request.post('/ai/aggregate/task/alarm/_handle', data)
