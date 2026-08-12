import i18n from '@jetlinks-web-core/locales'
import {
  createDomainAgentErrorResult,
  createDomainAgentInputError,
  DomainAgentInputError,
  resolveDomainAgentEnum,
  type DomainAgentTimeRange,
  type DomainAgentToolResult,
} from '@jetlinks-web-core/layout/components/AiChat/domainAgentTools'
import { queryAlarmLevelOptions } from './alarmLevel'
import type { AlarmEventItem, AlarmLevelOption } from './alarmData.types'
import {
  ALARM_RECORD_STATE_FILTER,
  queryAlarmEvents,
} from './alarmData.service'
import {
  ALARM_RECORD_SOURCES,
  ALARM_RECORD_STATES,
  ALARM_SOURCES,
  ALARM_TREND_INTERVALS,
} from './constants'

export type AlarmSource = typeof ALARM_SOURCES[number]
export type AlarmRecordSource = typeof ALARM_RECORD_SOURCES[number]
export type AlarmState = typeof ALARM_RECORD_STATES[number]
export type AlarmTrendInterval = typeof ALARM_TREND_INTERVALS[number]
export type AggregationRow = Record<string, unknown>

const TREND_INTERVAL_MS: Record<AlarmTrendInterval, number> = {
  '1m': 60 * 1000,
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
}
const MAX_TREND_BUCKETS = 200

export const normalizeText = (value: unknown) => String(value || '').trim()

export const inputError = (
  code: string,
  key: string,
  params?: Record<string, string | number>,
) => createDomainAgentInputError(code, `AlarmGeneralAgent.errors.${key}`, params)

export const runAlarmTool = async <T>(
  data: T,
  action: () => Promise<DomainAgentToolResult<T>>,
): Promise<DomainAgentToolResult<T>> => {
  try {
    return await action()
  } catch (error) {
    if (error instanceof DomainAgentInputError) throw error
    return createDomainAgentErrorResult('alarm', data, error)
  }
}

export const resolveAlarmSource = (
  value: unknown,
  options: { allowAll?: boolean; defaultValue?: AlarmSource } = {},
): AlarmSource => {
  const source = resolveDomainAgentEnum(value, ALARM_SOURCES, {
    name: 'source',
    defaultValue: options.defaultValue ?? 'all',
  })
  if (options.allowAll === false && source === 'all') {
    throw inputError('ALARM_SOURCE_REQUIRED', 'sourceRequired')
  }
  return source
}

export const recordSources = (source: AlarmSource): AlarmRecordSource[] => (
  source === 'all' ? [...ALARM_RECORD_SOURCES] : [source]
)

export const sourceValue = (source: AlarmRecordSource) => ({
  value: source,
  text: i18n.global.t(`AlarmGeneralAgent.values.source.${source}`),
})

export const resolveAlarmState = (value: unknown): AlarmState | undefined => {
  if (!normalizeText(value)) return undefined
  return resolveDomainAgentEnum(value, ALARM_RECORD_STATES, { name: 'state' })
}

export const toBackendState = (state?: AlarmState) => {
  if (state === 'open') return ALARM_RECORD_STATE_FILTER.warning
  if (state === 'handled') return ALARM_RECORD_STATE_FILTER.normal
  return ALARM_RECORD_STATE_FILTER.all
}

export const resolveAlarmLevel = async (value: unknown): Promise<AlarmLevelOption | undefined> => {
  if (value === undefined || value === null || value === '') return undefined
  const input = normalizeText(value)
  const options = await queryAlarmLevelOptions()
  const numeric = Number(input)
  const matched = Number.isFinite(numeric)
    ? options.find(item => item.level === numeric)
    : options.find(item => [item.label, item.shortLabel]
      .some(label => normalizeText(label).toLowerCase() === input.toLowerCase()))
  if (!matched) throw inputError('ALARM_LEVEL_UNSUPPORTED', 'levelUnsupported', { level: input })
  return matched
}

export const buildAlarmRecordTerms = (
  range: DomainAgentTimeRange,
  state?: AlarmState,
  level?: AlarmLevelOption,
) => [
  { column: 'alarmTime', termType: 'btw', value: [range.start, range.end] },
  ...(state ? [{ column: 'state', termType: 'eq', value: toBackendState(state) }] : []),
  ...(level ? [{ column: 'level', termType: 'eq', value: level.level }] : []),
]

export const unwrapAggregationRows = (response: unknown): AggregationRow[] => {
  const result = response && typeof response === 'object' && 'result' in response
    ? (response as { result?: unknown }).result
    : response
  if (Array.isArray(result)) return result.filter(item => item && typeof item === 'object') as AggregationRow[]
  if (result && typeof result === 'object' && Array.isArray((result as { data?: unknown }).data)) {
    return (result as { data: unknown[] }).data.filter(item => item && typeof item === 'object') as AggregationRow[]
  }
  return []
}

export const toNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const dictValue = (value: unknown) => (
  value && typeof value === 'object' && 'value' in value
    ? normalizeText((value as { value?: unknown }).value)
    : normalizeText(value)
)

export const formatLocalDateTime = (timestamp: number, milliseconds = false) => {
  const date = new Date(timestamp)
  const pad = (value: number, width = 2) => String(value).padStart(width, '0')
  const text = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  return milliseconds ? `${text}.${pad(date.getMilliseconds(), 3)}` : text
}

export const resolveTrendInterval = (
  args: Record<string, unknown>,
  range: DomainAgentTimeRange,
) => {
  const duration = range.end - range.start
  const defaultInterval = duration <= 3 * 60 * 60 * 1000
    ? '1m'
    : duration <= 7 * 24 * 60 * 60 * 1000
      ? '1h'
      : '1d'
  const interval = resolveDomainAgentEnum(args.interval, ALARM_TREND_INTERVALS, {
    name: 'interval',
    defaultValue: defaultInterval,
  })
  const bucketCount = Math.ceil(duration / TREND_INTERVAL_MS[interval]) + 1
  if (bucketCount > MAX_TREND_BUCKETS) {
    throw inputError(
      'ALARM_TREND_BUCKETS_TOO_MANY',
      'trendBucketsTooMany',
      { interval, count: bucketCount, max: MAX_TREND_BUCKETS },
    )
  }
  return { interval, bucketCount }
}

const stateValue = (state: AlarmState) => ({
  value: state,
  text: i18n.global.t(`AlarmGeneralAgent.values.state.${state}`),
})

export const safeAlarmRecord = (event: AlarmEventItem) => {
  const isVision = event.source === 'vision'
  const targetId = isVision ? event.sourceId : event.handleContext?.targetId
  const targetName = isVision
    ? event.loc || event.handleContext?.sourceName
    : event.handleContext?.targetName || event.taskTargetName
  return {
    id: event.id,
    name: event.algo,
    source: sourceValue(event.source),
    target: {
      type: isVision ? 'media-channel' : 'device',
      id: targetId,
      name: targetName,
    },
    sourceId: event.sourceId || event.handleContext?.sourceId,
    sceneId: isVision ? event.pack || undefined : undefined,
    algorithmId: isVision ? event.algoId || undefined : undefined,
    level: event.level == null ? undefined : {
      value: event.level,
      text: event.levelLabel || event.levelShortLabel || String(event.level),
    },
    state: stateValue(event.status),
    alarmTime: event.handleContext?.alarmTime,
    time: event.time,
    summary: event.summary || event.handleContext?.actualDesc || event.handleContext?.triggerDesc,
    ruleName: event.ruleName,
  }
}

export const alarmEventTimestamp = (event: AlarmEventItem) => {
  const value = Number(event.handleContext?.alarmTime)
  if (Number.isFinite(value) && value > 0) return value
  const parsed = new Date(event.time).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

export const resolveAlarmRecord = async (source: AlarmRecordSource, recordId: string) => {
  const page = await queryAlarmEvents(source, {
    recordId,
    pageIndex: 0,
    pageSize: 1,
  })
  const record = page.data.find(item => item.id === recordId)
  if (!record) throw inputError('ALARM_RECORD_NOT_FOUND', 'recordNotFound', { recordId })
  return record
}

export const sourceUnavailableWarning = (source: AlarmRecordSource) => (
  i18n.global.t('AlarmGeneralAgent.warnings.sourceUnavailable', {
    source: i18n.global.t(`AlarmGeneralAgent.values.source.${source}`),
  })
)

/** Runs source-specific requests independently so `all` can preserve real partial results. */
export const loadAlarmSources = async <T>(
  source: AlarmSource,
  loader: (item: AlarmRecordSource) => Promise<T>,
) => {
  const sources = recordSources(source)
  const settled = await Promise.allSettled(sources.map(loader))
  const data = {} as Partial<Record<AlarmRecordSource, T>>
  const warnings: string[] = []
  let firstError: unknown
  settled.forEach((result, index) => {
    const item = sources[index]
    if (result.status === 'fulfilled') data[item] = result.value
    else {
      firstError ??= result.reason
      warnings.push(sourceUnavailableWarning(item))
    }
  })
  if (!Object.keys(data).length && firstError) throw firstError
  return { data, warnings }
}
