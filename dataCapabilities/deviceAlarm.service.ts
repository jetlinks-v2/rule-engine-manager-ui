import dayjs from 'dayjs'
import i18n from '@jetlinks-web-core/locales'
import {
  aggregateIotAlarms,
  countIotAlarms,
  queryIotAlarmPage,
  queryIotDashboard,
  type AlarmRecord,
} from '../api/iotAlarm'
import {
  formatAlarmLevelLabel,
  getCachedAlarmLevelOptions,
  normalizeAlarmLevelValue,
  queryAlarmLevelOptions,
  type AlarmLevelOption,
} from '../api/alarmLevel'
import type {
  DeviceAlarmListQuery,
  DeviceAlarmListRow,
  DeviceAlarmPageData,
  DeviceAlarmRankQuery,
  DeviceAlarmRankRow,
  DeviceAlarmQueryTerm,
  DeviceAlarmState,
  DeviceAlarmSummaryData,
  DeviceAlarmTimeQuery,
} from './deviceAlarm.types'

type UnknownRecord = Record<string, unknown>
type QueryTerm = DeviceAlarmQueryTerm

const t = (key: string) => String(i18n.global.t(key))

/**
 * 查询当前仍处于告警状态的设备 ID，供设备总览按设备口径统计告警数量。
 */
export async function loadActiveDeviceIds(
  signal?: AbortSignal,
): Promise<string[]> {
  const devices = await aggregateIotAlarms({
    columns: [{ column: 'id', alias: 'count', aggregation: 'COUNT' }],
    groupBy: [{ column: 'targetId', alias: 'targetId' }],
    filter: { terms: [stateTerm('active')] },
  }, { signal })

  return Array.from(new Set(
    devices
      .map(valueRecord)
      .map(row => text(row.targetId).trim())
      .filter(Boolean),
  ))
}

/**
 * 查询设备告警总览，所有统计使用同一时间窗口，避免卡片之间出现口径差异。
 */
export async function loadDeviceAlarmSummary(
  query: DeviceAlarmTimeQuery,
  signal?: AbortSignal,
): Promise<DeviceAlarmSummaryData> {
  const range = resolveDefaultRange(query)
  const timeTerms = buildTimeTerms(range)
  const [total, active, urgent, devices] = await Promise.all([
    countIotAlarms({ terms: timeTerms }, { signal }),
    countIotAlarms({ terms: [...timeTerms, stateTerm('active')] }, { signal }),
    countIotAlarms({ terms: [...timeTerms, { column: 'level', termType: 'eq', value: 1 }] }, { signal }),
    aggregateIotAlarms({
      columns: [{ column: 'id', alias: 'count', aggregation: 'COUNT' }],
      groupBy: [{ column: 'targetId', alias: 'targetId' }],
      filter: { terms: timeTerms },
    }, { signal }),
  ])

  return {
    total,
    active,
    handled: Math.max(total - active, 0),
    urgent,
    deviceCount: devices.map(valueRecord).filter(row => Boolean(text(row.targetId))).length,
    sampleTime: Date.now(),
  }
}

/**
 * 查询设备告警排行，Provider 固定 dashboard 聚合口径，不向调用方暴露聚合表达式。
 */
export async function loadDeviceAlarmRank(
  query: DeviceAlarmRankQuery,
  signal?: AbortSignal,
): Promise<DeviceAlarmRankRow[]> {
  const range = resolveDefaultRange(query)
  const aggregation = resolveDashboardAggregation(range.startTime, range.endTime)
  const response = await queryIotDashboard([{
    dashboard: 'alarm',
    object: 'record',
    measurement: 'rank',
    dimension: 'agg',
    group: 'deviceAlarmRank',
    params: {
      targetType: 'device',
      from: formatApiTime(range.startTime),
      to: formatApiTime(range.endTime),
      limit: query.limit,
      time: aggregation.time,
      format: aggregation.format,
    },
  }], { signal })

  return response
    .filter(item => text(item.group) === 'deviceAlarmRank')
    .map(item => valueRecord(asRecord(item.data).value))
    .map(toRankRow)
    .filter((item): item is Omit<DeviceAlarmRankRow, 'rank'> => Boolean(item))
    .sort((left, right) => right.count - left.count)
    .slice(0, query.limit)
    .map((item, index) => ({ ...item, rank: index + 1 }))
}

/**
 * 查询设备告警分页，外部 active/handled 状态在此映射为后端 warning 状态规则。
 */
export async function loadDeviceAlarmList(
  query: DeviceAlarmListQuery,
  signal?: AbortSignal,
): Promise<DeviceAlarmPageData> {
  const [page, levelOptions] = await Promise.all([
    queryIotAlarmPage({
      paging: true,
      pageIndex: query.pageIndex,
      pageSize: query.pageSize,
      sorts: [{ name: 'alarmTime', order: 'desc' }],
      terms: buildListTerms(query),
    }, { signal }),
    loadAlarmLevelOptions(),
  ])

  return {
    data: page.data.map(row => normalizeAlarmRow(row, levelOptions)),
    total: page.total,
    pageIndex: page.pageIndex,
    pageSize: page.pageSize,
  }
}

function buildListTerms(query: DeviceAlarmListQuery): QueryTerm[] {
  const terms = [...buildTimeTerms(query), ...(query.filterTerms || [])]
  if (query.state) terms.push(stateTerm(query.state))
  if (query.deviceId) terms.push({ column: 'targetId', termType: 'eq', value: query.deviceId })
  if (query.level !== undefined) terms.push({ column: 'level', termType: 'eq', value: query.level })
  return terms
}

function buildTimeTerms(query: DeviceAlarmTimeQuery): QueryTerm[] {
  const terms: QueryTerm[] = []
  if (query.startTime !== undefined) {
    terms.push({ column: 'alarmTime', termType: 'gte', value: formatApiTime(query.startTime) })
  }
  if (query.endTime !== undefined) {
    terms.push({ column: 'alarmTime', termType: 'lte', value: formatApiTime(query.endTime) })
  }
  return terms
}

function stateTerm(state: DeviceAlarmState): QueryTerm {
  return state === 'active'
    ? { column: 'state', termType: 'eq', value: 'warning' }
    : { column: 'state', termType: 'neq', value: 'warning' }
}

function normalizeAlarmRow(row: AlarmRecord, levelOptions: AlarmLevelOption[]): DeviceAlarmListRow {
  const raw = valueRecord(row)
  const alarmTime = toTimestamp(raw.alarmTime ?? raw.createTime)
  const handleTime = toTimestamp(raw.handleTime)
  const state = enumValue(raw.state) === 'warning' ? 'active' : 'handled'
  const level = normalizeAlarmLevelValue(raw.level) ?? null
  const durationEnd = handleTime ?? (state === 'active' ? Date.now() : null)

  return {
    alarmId: text(raw.id ?? row.id),
    deviceId: textOrNull(raw.targetId ?? raw.deviceId ?? raw.sourceId),
    deviceName: textOrNull(raw.targetName ?? raw.deviceName ?? raw.sourceName),
    alarmName: textOrNull(raw.alarmName ?? raw.name),
    level,
    levelText: enumText(raw.level) ?? textOrNull(formatAlarmLevelLabel(level, levelOptions)),
    state,
    stateText: t(state === 'active'
      ? 'AlarmDataCapability.state.active'
      : 'AlarmDataCapability.state.handled'),
    content: textOrNull(raw.actualDesc ?? raw.description ?? raw.triggerDesc ?? raw.trigger),
    alarmTime,
    handleTime,
    durationMillis: alarmTime !== null && durationEnd !== null
      ? Math.max(durationEnd - alarmTime, 0)
      : null,
  }
}

async function loadAlarmLevelOptions(): Promise<AlarmLevelOption[]> {
  const cached = getCachedAlarmLevelOptions()
  if (cached.length) return cached
  return queryAlarmLevelOptions().catch(() => [])
}

function toRankRow(value: UnknownRecord): Omit<DeviceAlarmRankRow, 'rank'> | undefined {
  const deviceId = text(value.targetId ?? value.deviceId).trim()
  const count = finiteNumber(value.count ?? value.value) ?? 0
  if (!deviceId || count <= 0) return undefined
  return {
    deviceId,
    deviceName: text(value.targetName ?? value.deviceName ?? deviceId),
    count,
  }
}

function resolveDefaultRange(query: DeviceAlarmTimeQuery): Required<DeviceAlarmTimeQuery> {
  const endTime = query.endTime ?? Date.now()
  return {
    startTime: query.startTime ?? dayjs(endTime).startOf('day').valueOf(),
    endTime,
  }
}

function resolveDashboardAggregation(startTime: number, endTime: number) {
  const duration = endTime - startTime
  const hour = 60 * 60 * 1000
  const day = 24 * hour
  const year = 365 * day
  if (duration <= hour) return { time: '1m', format: 'HH:mm' }
  if (duration <= day) return { time: '1h', format: 'MM-dd HH:mm' }
  if (duration < year) return { time: '1d', format: 'MM-dd HH:mm:ss' }
  return { time: '1M', format: 'yyyy-MM' }
}

function formatApiTime(timestamp: number): string {
  return dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss')
}

function valueRecord(value: unknown): UnknownRecord {
  const row = asRecord(value)
  const data = asRecord(row.data)
  return isRecord(data.value) ? data.value : row
}

function enumValue(value: unknown): string {
  return text(isRecord(value) ? value.value : value)
}

function enumText(value: unknown): string | null {
  return textOrNull(isRecord(value) ? value.text : undefined)
}

function toTimestamp(value: unknown): number | null {
  const raw = isRecord(value) ? value.value : value
  if (raw === undefined || raw === null || raw === '') return null
  const numeric = Number(raw)
  if (Number.isFinite(numeric)) {
    if (numeric > 1_000_000_000_000) return numeric
    if (numeric > 1_000_000_000) return numeric * 1000
  }
  const parsed = dayjs(String(raw)).valueOf()
  return Number.isFinite(parsed) ? parsed : null
}

function finiteNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function textOrNull(value: unknown): string | null {
  const valueText = text(value).trim()
  return valueText || null
}

function text(value: unknown): string {
  return value == null ? '' : String(value)
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {}
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
