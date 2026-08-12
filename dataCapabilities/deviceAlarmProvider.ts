import i18n from '@jetlinks-web-core/locales'
import type {
  CapabilitySchema,
  CapabilityFilterOperator,
  DataCapabilityProvider,
  DataSource,
  DataSourceDefinition,
  DataSourceRequest,
  DataSourceResult,
  RuntimeContext,
} from '@jetlinks-web-core/data-capability'
import { defer, map } from 'rxjs'
import {
  loadActiveDeviceIds,
  loadDeviceAlarmList,
  loadDeviceAlarmRank,
  loadDeviceAlarmSummary,
} from './deviceAlarm.service'
import type {
  DeviceAlarmListQuery,
  DeviceAlarmPageData,
  DeviceAlarmQueryTerm,
  DeviceAlarmRankQuery,
  DeviceAlarmState,
  DeviceAlarmTimeQuery,
} from './deviceAlarm.types'
import { deviceAlarmOutputSchemas } from './outputSchemas'

const MODULE_ID = 'rule-engine-manager-ui'
const PROVIDER_ID = 'alarm:device-monitoring'
const SUMMARY_SOURCE_ID = 'alarm.device.summary'
const ACTIVE_DEVICE_IDS_SOURCE_ID = 'alarm.device.active.ids'
const RANK_SOURCE_ID = 'alarm.device.rank'
const LIST_SOURCE_ID = 'alarm.device.list'

const DEFAULT_PAGE_INDEX = 0
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 200
const DEFAULT_RANK_LIMIT = 5
const MAX_RANK_LIMIT = 50
const STATES: DeviceAlarmState[] = ['active', 'handled']
const LEVEL_FILTER_TERM_TYPES: Partial<Record<CapabilityFilterOperator, string>> = {
  eq: 'eq',
  neq: 'neq',
  gte: 'gte',
  lte: 'lte',
}

const owner = { moduleId: MODULE_ID, providerId: PROVIDER_ID }
const t = (key: string) => String(i18n.global.t(key))
const timeProperties = {
  startTime: {
    type: 'integer' as const,
    format: 'timestamp-ms',
    title: t('AlarmDataCapability.query.startTime'),
  },
  endTime: {
    type: 'integer' as const,
    format: 'timestamp-ms',
    title: t('AlarmDataCapability.query.endTime'),
  },
}
const timeRangeFilterProperty: CapabilitySchema = {
  type: 'array' as const,
  format: 'timestamp-ms-range',
  title: t('AlarmDataCapability.query.timeRange'),
  items: { type: 'integer' as const, format: 'timestamp-ms' },
  filter: { operators: ['between'] },
}
const stateProperty = {
  type: 'string' as const,
  enum: STATES,
  title: t('AlarmDataCapability.query.state'),
  optionSource: {
    type: 'static' as const,
    options: STATES.map(value => ({
      label: t(`AlarmDataCapability.state.${value}`),
      value,
    })),
  },
}

const summarySource: DataSourceDefinition = {
  id: SUMMARY_SOURCE_ID,
  kind: 'data-source',
  version: 1,
  name: t('AlarmDataCapability.summary.name'),
  description: t('AlarmDataCapability.summary.description'),
  owner,
  tags: ['alarm', 'device', 'summary'],
  facets: { category: 'device-alarm-monitoring' },
  modes: ['snapshot', 'poll'],
  defaults: { pollInterval: 10_000 },
  querySchema: { type: 'object', properties: timeProperties },
  outputSchema: deviceAlarmOutputSchemas.summary,
  create: (): DataSource => ({
    query<T = unknown>(request: DataSourceRequest, context: RuntimeContext) {
      return defer(() => loadDeviceAlarmSummary(
        toTimeQuery(request),
        request.signal || context.signal,
      )).pipe(map(data => ({ data: data as unknown as T })))
    },
  }),
}

const activeDeviceIdsSource: DataSourceDefinition = {
  id: ACTIVE_DEVICE_IDS_SOURCE_ID,
  kind: 'data-source',
  version: 1,
  name: t('AlarmDataCapability.activeDeviceIds.name'),
  description: t('AlarmDataCapability.activeDeviceIds.description'),
  owner,
  tags: ['alarm', 'device', 'active'],
  facets: { category: 'device-alarm-monitoring' },
  modes: ['snapshot', 'poll'],
  defaults: { pollInterval: 10_000 },
  querySchema: { type: 'object' },
  outputSchema: deviceAlarmOutputSchemas.activeDeviceIds,
  create: (): DataSource => ({
    query<T = unknown>(request: DataSourceRequest, context: RuntimeContext) {
      return defer(() => loadActiveDeviceIds(
        request.signal || context.signal,
      )).pipe(map(data => ({ data: data as unknown as T })))
    },
  }),
}

const rankSource: DataSourceDefinition = {
  id: RANK_SOURCE_ID,
  kind: 'data-source',
  version: 1,
  name: t('AlarmDataCapability.rank.name'),
  description: t('AlarmDataCapability.rank.description'),
  owner,
  tags: ['alarm', 'device', 'rank'],
  facets: { category: 'device-alarm-monitoring' },
  modes: ['snapshot'],
  querySchema: {
    type: 'object',
    properties: {
      ...timeProperties,
      limit: { type: 'integer', default: DEFAULT_RANK_LIMIT },
    },
  },
  outputSchema: deviceAlarmOutputSchemas.rank,
  create: (): DataSource => ({
    query<T = unknown>(request: DataSourceRequest, context: RuntimeContext) {
      return defer(() => loadDeviceAlarmRank(
        toRankQuery(request),
        request.signal || context.signal,
      )).pipe(map(data => ({ data: data as unknown as T })))
    },
  }),
}

const listSource: DataSourceDefinition = {
  id: LIST_SOURCE_ID,
  kind: 'data-source',
  version: 1,
  name: t('AlarmDataCapability.list.name'),
  description: t('AlarmDataCapability.list.description'),
  owner,
  tags: ['alarm', 'device', 'page'],
  facets: { category: 'device-alarm-monitoring' },
  modes: ['page', 'snapshot', 'poll'],
  defaults: { pollInterval: 10_000 },
  querySchema: {
    type: 'object',
  },
  filterSchema: {
    type: 'object',
    properties: {
      timeRange: timeRangeFilterProperty,
      state: {
        ...stateProperty,
        filter: { operators: ['eq'] },
      },
      deviceId: {
        type: 'array',
        format: 'device-ids',
        items: { type: 'string' },
        title: t('AlarmDataCapability.query.deviceId'),
        filter: { operators: ['in', 'notIn'] },
      },
      level: {
        type: 'integer',
        title: t('AlarmDataCapability.query.level'),
        filter: { operators: ['eq', 'neq', 'gte', 'lte'] },
      },
    },
  },
  outputSchema: deviceAlarmOutputSchemas.list,
  create: (): DataSource => ({
    query<T = unknown>(request: DataSourceRequest, context: RuntimeContext) {
      return defer(() => loadDeviceAlarmList(
        toListQuery(request),
        request.signal || context.signal,
      )).pipe(map(page => {
        const result = toPageResult(page)
        return {
          ...result,
          data: result.data as unknown as T,
        }
      }))
    },
  }),
}

function toTimeQuery(request: DataSourceRequest): DeviceAlarmTimeQuery {
  const startTime = optionalTimestamp(request.query?.startTime)
  const endTime = optionalTimestamp(request.query?.endTime)
  if (startTime !== undefined && endTime !== undefined && startTime > endTime) {
    throw new Error(t('AlarmDataCapability.error.invalidTimeRange'))
  }
  return { startTime, endTime }
}

function toRankQuery(request: DataSourceRequest): DeviceAlarmRankQuery {
  return {
    ...toTimeQuery(request),
    limit: integerInRange(request.query?.limit, DEFAULT_RANK_LIMIT, 1, MAX_RANK_LIMIT),
  }
}

function toListQuery(request: DataSourceRequest): DeviceAlarmListQuery {
  const stateFilter = request.filter?.terms.find(term => term.field === 'state')
  const state = optionalText(stateFilter?.value ?? request.query?.state)
  if (state && !STATES.includes(state as DeviceAlarmState)) {
    throw new Error(t('AlarmDataCapability.error.invalidState'))
  }
  return {
    ...toFilterTimeQuery(request),
    pageIndex: integerInRange(request.query?.pageIndex, DEFAULT_PAGE_INDEX, 0),
    pageSize: integerInRange(request.query?.pageSize ?? request.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE),
    state: state as DeviceAlarmState | undefined,
    deviceId: optionalText(request.query?.deviceId),
    level: optionalInteger(request.query?.level),
    filterTerms: toListFilterTerms(request),
  }
}

function toFilterTimeQuery(request: DataSourceRequest): DeviceAlarmTimeQuery {
  const term = request.filter?.terms.find(item => item.field === 'timeRange')
  if (!term) return toTimeQuery(request)
  const value = Array.isArray(term.value) ? term.value : []
  const startTime = optionalTimestamp(value[0])
  const endTime = optionalTimestamp(value[1])
  if (startTime === undefined || endTime === undefined || startTime > endTime) {
    throw new Error(t('AlarmDataCapability.error.invalidTimeRange'))
  }
  return { startTime, endTime }
}

function toListFilterTerms(request: DataSourceRequest): DeviceAlarmQueryTerm[] {
  return (request.filter?.terms || []).flatMap((term): DeviceAlarmQueryTerm[] => {
    if (term.field === 'deviceId') {
      const values = Array.isArray(term.value)
        ? term.value.map(optionalText).filter((value): value is string => !!value)
        : []
      if (!values.length) return []
      return [{
        column: 'targetId',
        termType: term.operator === 'notIn' ? 'nin' : 'in',
        value: values,
      }]
    }
    if (term.field === 'level') {
      const value = optionalInteger(term.value)
      if (value === undefined) return []
      const termType = LEVEL_FILTER_TERM_TYPES[term.operator]
      return termType ? [{ column: 'level', termType, value }] : []
    }
    return []
  })
}

function toPageResult(page: DeviceAlarmPageData): DataSourceResult<DeviceAlarmPageData['data']> {
  return {
    data: page.data,
    total: page.total,
    pageIndex: page.pageIndex,
    pageSize: page.pageSize,
  }
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  const text = String(value).trim()
  return text || undefined
}

function optionalInteger(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const number = Number(value)
  if (!Number.isInteger(number)) throw new Error(t('AlarmDataCapability.error.invalidLevel'))
  return number
}

function optionalTimestamp(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const timestamp = Number(value)
  if (!Number.isInteger(timestamp) || timestamp < 0) {
    throw new Error(t('AlarmDataCapability.error.invalidTimestamp'))
  }
  return timestamp
}

function integerInRange(
  value: unknown,
  fallback: number,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (value === undefined || value === null || value === '') return fallback
  const number = Number(value)
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(t('AlarmDataCapability.error.invalidPagination'))
  }
  return number
}

const deviceAlarmProvider: DataCapabilityProvider = {
  id: PROVIDER_ID,
  owner,
  capabilityIds: [
    SUMMARY_SOURCE_ID,
    ACTIVE_DEVICE_IDS_SOURCE_ID,
    RANK_SOURCE_ID,
    LIST_SOURCE_ID,
  ],
  load: () => ({
    sources: [summarySource, activeDeviceIdsSource, rankSource, listSource],
  }),
}

export default deviceAlarmProvider
