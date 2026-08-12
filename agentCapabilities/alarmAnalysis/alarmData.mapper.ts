import type {
  AlarmEventItem,
  AlarmEventSource,
  AlarmHandleHistoryItem,
  AlarmLevelOption,
} from './alarmData.types'

export type UnknownRecord = Record<string, unknown>

export interface NormalizedPage<T> {
  data: T[]
  total: number
}

export function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {}
}

export function extractPage(response: unknown): NormalizedPage<UnknownRecord> {
  const result = unwrapResult(response)
  if (Array.isArray(result)) {
    const data = result.map(asRecord).filter(item => Object.keys(item).length > 0)
    return { data, total: data.length }
  }
  const page = asRecord(result)
  const rows = Array.isArray(page.data)
    ? page.data
    : Array.isArray(page.records)
      ? page.records
      : []
  const data = rows.map(asRecord).filter(item => Object.keys(item).length > 0)
  return { data, total: finiteNumber(page.total) ?? data.length }
}

export function extractCount(response: unknown): number {
  const result = unwrapResult(response)
  if (typeof result === 'number') return result
  const record = asRecord(result)
  return finiteNumber(record.total ?? record.count ?? record.value) ?? 0
}

/** Converts the variable alarm-record response into the bounded shape exposed by agent tools. */
export function normalizeAlarmRecord(
  raw: UnknownRecord,
  source: AlarmEventSource,
  levels: AlarmLevelOption[] = [],
): AlarmEventItem {
  const alarmTimestamp = pickTimestamp(raw.alarmTime, raw.createTime)
  const displayTimestamp = pickTimestamp(raw.lastAlarmTime, raw.alarmTime, raw.createTime)
  const level = normalizeLevel(raw.level)
  const state = dictValue(raw.state)
  const bizType = text(raw.bizType)
  const bizId = text(raw.bizId)
  const taskTarget = extractTaskTarget(bizType, bizId)
  const sourceName = text(raw.sourceName)
  const option = levels.find(item => item.level === level)

  return {
    id: text(raw.id) || `${text(raw.alarmConfigId) || 'alarm'}-${displayTimestamp || alarmTimestamp || Date.now()}`,
    source,
    sourceId: text(raw.sourceId) || undefined,
    pack: bizType,
    taskTargetName: text(raw.targetName, taskTarget) || undefined,
    algoId: text(taskTarget, raw.sceneTriggerType, raw.sourceId, raw.alarmConfigId, raw.id),
    algo: text(raw.alarmName),
    store: sourceName,
    loc: sourceName,
    regionPath: sourceName,
    time: formatDateTime(displayTimestamp),
    level,
    levelLabel: option?.label,
    levelShortLabel: option?.shortLabel,
    severity: option?.tone ?? resolveSeverity(level),
    status: state === 'warning' ? 'open' : 'handled',
    summary: text(raw.actualDesc, raw.triggerDesc, raw.description) || undefined,
    ruleName: text(raw.alarmName) || undefined,
    handleContext: {
      alarmRecordId: text(raw.id) || undefined,
      alarmConfigId: text(raw.alarmConfigId),
      alarmTime: alarmTimestamp,
      recordCreatorId: text(raw.creatorId) || undefined,
      level,
      targetType: text(raw.targetType) || undefined,
      targetName: text(raw.targetName) || undefined,
      targetId: text(raw.targetId) || undefined,
      sourceType: text(raw.sourceType) || undefined,
      sourceId: text(raw.sourceId) || undefined,
      sourceName: sourceName || undefined,
      alarmConfigSource: text(raw.alarmConfigSource) || undefined,
      triggerDesc: text(raw.triggerDesc) || undefined,
      actualDesc: text(raw.actualDesc) || undefined,
    },
  }
}

/** History payloads may store their useful fields in alarmInfo JSON, so merge only known safe fields. */
export function mergeAlarmHistory(
  event: AlarmEventItem,
  history: UnknownRecord,
): AlarmEventItem {
  const alarmInfo = parseRecord(history.alarmInfo)
  const data = parseRecord(history.data)
  const timestamp = pickTimestamp(history.alarmTime, alarmInfo.alarmTime, history.createTime)
  return {
    ...event,
    historyId: text(history.id) || undefined,
    sourceId: text(history.sourceId, alarmInfo.sourceId, data.sourceId, event.sourceId) || undefined,
    taskTargetName: text(history.targetName, alarmInfo.targetName, data.taskTargetName, event.taskTargetName) || undefined,
    time: timestamp ? formatDateTime(timestamp) : event.time,
    summary: text(
      asRecord(history.schemaResults).summary,
      history.actualDesc,
      alarmInfo.description,
      history.triggerDesc,
      data.results,
      event.summary,
    ) || undefined,
    ruleName: text(
      alarmInfo.alarmName,
      history.alarmConfigName,
      data.aggregateTaskName,
      data.sourceTaskName,
      data.taskName,
      event.ruleName,
    ) || undefined,
  }
}

export function normalizeHandleHistory(raw: UnknownRecord): AlarmHandleHistoryItem {
  const alarmTime = pickTimestamp(raw.alarmTime)
  const handleTime = pickTimestamp(raw.handleTime, raw.createTime)
  const alarmState = dictValue(raw.state)
  const handleState = dictValue(raw.handleState)
  const handleType = dictValue(raw.handleType)
  const handled = ['processed', 'done'].includes(handleState)
    || alarmState === 'normal'
    || handleTime > 0
    || Boolean(handleType)
  return {
    alarmTime: alarmTime ? formatDateTime(alarmTime) : '--',
    handleTime: handleTime ? formatDateTime(handleTime) : '--',
    state: handled ? 'normal' : 'warning',
    stateText: dictText(raw.handleState) || (handled ? '已处理' : '待处理'),
    handleType: dictText(raw.handleType) || '--',
    handleResult: text(raw.description, raw.describe, raw.remark) || '--',
  }
}

export function text(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
    const record = asRecord(value)
    const nested = record.text ?? record.name ?? record.value
    if (typeof nested === 'string' && nested.trim()) return nested.trim()
    if (typeof nested === 'number' && Number.isFinite(nested)) return String(nested)
  }
  return ''
}

function unwrapResult(value: unknown): unknown {
  const record = asRecord(value)
  return 'result' in record ? record.result : value
}

function finiteNumber(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function normalizeLevel(value: unknown): number | undefined {
  const record = asRecord(value)
  return finiteNumber(record.level ?? record.value ?? record.id ?? value)
}

function dictValue(value: unknown): string {
  const record = asRecord(value)
  return text(record.value ?? value)
}

function dictText(value: unknown): string {
  const record = asRecord(value)
  return text(record.text, record.name, record.value, value)
}

function pickTimestamp(...values: unknown[]): number {
  for (const value of values) {
    const parsed = finiteNumber(value)
    if (parsed && parsed > 0) return parsed
  }
  return 0
}

function resolveSeverity(level?: number): AlarmEventItem['severity'] {
  if (level != null && level <= 2) return 'high'
  if (level === 3) return 'med'
  return 'low'
}

function extractTaskTarget(bizType: string, bizId: string): string {
  if (!bizType || !bizId) return ''
  const prefix = `${bizType}-`
  return bizId.startsWith(prefix) ? bizId.slice(prefix.length) : ''
}

function parseRecord(value: unknown): UnknownRecord {
  if (typeof value !== 'string') return asRecord(value)
  try {
    return asRecord(JSON.parse(value))
  } catch {
    return {}
  }
}

function formatDateTime(timestamp: number): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
