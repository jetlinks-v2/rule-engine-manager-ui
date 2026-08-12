import i18n from '@jetlinks-web-core/locales'
import type {
  CapabilitySchema,
  DataCapabilityProvider,
  DataSource,
  DataSourceDefinition,
  DataSourceRequest,
  DataSourceResult,
  RuntimeContext,
} from '@jetlinks-web-core/data-capability'
import { defer, map } from 'rxjs'
import {
  loadAlarmEventList,
  loadAlarmEventSummary,
  loadVisionAlarmAiReviewSummary,
  loadVisionAlarmChannelRank,
  loadVisionAlarmHandlingTrend,
  loadVisionAlarmLevelDistribution,
  loadVisionAlarmLevelTrend,
  loadVisionAlarmList,
  loadVisionAlarmSceneDistribution,
  loadVisionAlarmSceneRank,
  loadVisionAlarmSummary as loadVisionAlarmBaseSummary,
  loadVisionAlarmTypeDistribution,
} from './visionAlarm.service'
import { loadVisionAlarmCountSummary } from './visionAlarmSummary.service'
import { loadVisionAlarmTrend } from './visionAlarmTrend.service'
import { visionAlarmOutputSchemas } from './outputSchemas'
import type {
  AlarmEventListQuery,
  AlarmEventPageData,
  AlarmEventSummaryQuery,
  TimeRangeQuery,
  VisionAlarmAiReviewQuery,
  VisionAlarmListQuery,
  VisionAlarmPageData,
  VisionAlarmRankQuery,
  VisionAlarmState,
  VisionAlarmSummaryData,
  VisionAlarmTypeDistributionQuery,
} from './visionAlarm.types'

const MODULE_ID = 'rule-engine-manager-ui'
const PROVIDER_ID = 'alarm:vision-monitoring'
const SOURCE_IDS = {
  summary: 'alarm.vision.summary',
  trend: 'alarm.vision.trend',
  typeDistribution: 'alarm.vision.type.distribution',
  levelDistribution: 'alarm.vision.level.distribution',
  sceneDistribution: 'alarm.vision.scene.distribution',
  sceneRank: 'alarm.vision.scene.rank',
  list: 'alarm.vision.list',
  levelTrend: 'alarm.vision.level.trend',
  handlingTrend: 'alarm.vision.handling.trend',
  channelRank: 'alarm.vision.channel.rank',
  aiReview: 'alarm.vision.ai-review.summary',
  eventSummary: 'alarm.event.summary',
  eventList: 'alarm.event.list',
} as const

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 200
const DEFAULT_LIMIT = 5
const DEFAULT_TYPE_DISTRIBUTION_LIMIT = 6
const MAX_LIMIT = 20
const AREA_OPTION_SOURCE_ID = 'space.area.options'
const VISION_STATES: VisionAlarmState[] = ['active', 'handled']
const EVENT_SOURCES = ['iot', 'vision'] as const
const owner = { moduleId: MODULE_ID, providerId: PROVIDER_ID }
const t = (key: string) => String(i18n.global.t(key))
const timeProperties = {
  startTime: {
    type: 'integer' as const,
    format: 'timestamp-ms',
    title: t('VisionAlarmDataCapability.query.startTime'),
  },
  endTime: {
    type: 'integer' as const,
    format: 'timestamp-ms',
    title: t('VisionAlarmDataCapability.query.endTime'),
  },
}
const timeRangeFilterProperty: CapabilitySchema = {
  type: 'array',
  format: 'timestamp-ms-range',
  title: t('VisionAlarmDataCapability.query.timeRange'),
  items: { type: 'integer', format: 'timestamp-ms' },
  filter: { operators: ['between'] },
}
const stateProperty = {
  type: 'string' as const,
  enum: VISION_STATES,
  title: t('VisionAlarmDataCapability.query.state'),
  optionSource: {
    type: 'static' as const,
    options: VISION_STATES.map(value => ({
      label: t(`VisionAlarmDataCapability.state.${value}`),
      value,
    })),
  },
}
const eventSourceProperty = {
  type: 'string' as const,
  enum: [...EVENT_SOURCES],
  default: 'iot' as const,
  title: t('VisionAlarmDataCapability.query.source'),
  optionSource: {
    type: 'static' as const,
    options: EVENT_SOURCES.map(value => ({
      label: t(`VisionAlarmDataCapability.source.${value}`),
      value,
    })),
  },
}
const spaceProperty = {
  type: 'string' as const,
  format: 'tree-select',
  title: t('VisionAlarmDataCapability.query.spaceId'),
  optionSource: {
    type: 'provider' as const,
    capability: { capabilityId: AREA_OPTION_SOURCE_ID, version: 1 },
  },
}

async function loadVisionAlarmSummary(
  query: TimeRangeQuery,
  signal?: AbortSignal,
): Promise<VisionAlarmSummaryData> {
  const [summary, countSummary] = await Promise.all([
    loadVisionAlarmBaseSummary(query, signal),
    loadVisionAlarmCountSummary(query, signal),
  ])
  return { ...summary, ...countSummary }
}

const sources: DataSourceDefinition[] = [
  snapshotSource(
    SOURCE_IDS.summary,
    'summary',
    loadVisionAlarmSummary,
    toTimeQuery,
    visionAlarmOutputSchemas.summary,
  ),
  snapshotSource(
    SOURCE_IDS.trend,
    'trend',
    loadVisionAlarmTrend,
    toTimeQuery,
    visionAlarmOutputSchemas.trend,
  ),
  snapshotSource(
    SOURCE_IDS.typeDistribution,
    'typeDistribution',
    loadVisionAlarmTypeDistribution,
    toTypeDistributionQuery,
    visionAlarmOutputSchemas.typeDistribution,
  ),
  snapshotSource(
    SOURCE_IDS.levelDistribution,
    'levelDistribution',
    loadVisionAlarmLevelDistribution,
    toTimeQuery,
    visionAlarmOutputSchemas.levelDistribution,
  ),
  snapshotSource(
    SOURCE_IDS.sceneDistribution,
    'sceneDistribution',
    loadVisionAlarmSceneDistribution,
    toTimeQuery,
    visionAlarmOutputSchemas.sceneDistribution,
  ),
  snapshotSource(
    SOURCE_IDS.sceneRank,
    'sceneRank',
    loadVisionAlarmSceneRank,
    toRankQuery,
    visionAlarmOutputSchemas.sceneRank,
  ),
  pageSource(
    SOURCE_IDS.list,
    'list',
    loadVisionAlarmList,
    toVisionListQuery,
    visionAlarmOutputSchemas.list,
  ),
  snapshotSource(
    SOURCE_IDS.levelTrend,
    'levelTrend',
    loadVisionAlarmLevelTrend,
    toTimeQuery,
    visionAlarmOutputSchemas.levelTrend,
  ),
  snapshotSource(
    SOURCE_IDS.handlingTrend,
    'handlingTrend',
    loadVisionAlarmHandlingTrend,
    toTimeQuery,
    visionAlarmOutputSchemas.handlingTrend,
  ),
  snapshotSource(
    SOURCE_IDS.channelRank,
    'channelRank',
    loadVisionAlarmChannelRank,
    toRankQuery,
    visionAlarmOutputSchemas.channelRank,
  ),
  snapshotSource(
    SOURCE_IDS.aiReview,
    'aiReview',
    loadVisionAlarmAiReviewSummary,
    toAiReviewQuery,
    visionAlarmOutputSchemas.aiReview,
  ),
  snapshotSource(
    SOURCE_IDS.eventSummary,
    'eventSummary',
    loadAlarmEventSummary,
    toEventSummaryQuery,
    visionAlarmOutputSchemas.eventSummary,
  ),
  pageSource(
    SOURCE_IDS.eventList,
    'eventList',
    loadAlarmEventList,
    toEventListQuery,
    visionAlarmOutputSchemas.eventList,
  ),
]

function snapshotSource<TQuery, TData>(
  id: string,
  nameKey: string,
  loader: (query: TQuery, signal?: AbortSignal) => Promise<TData>,
  mapper: (request: DataSourceRequest) => TQuery,
  outputSchema: DataSourceDefinition['outputSchema'],
): DataSourceDefinition {
  const properties = nameKey === 'eventSummary' || id === SOURCE_IDS.levelTrend
    ? {}
    : {
        ...timeProperties,
        ...(nameKey.includes('Rank')
          ? { limit: { type: 'integer' as const, default: DEFAULT_LIMIT } }
          : nameKey === 'typeDistribution'
            ? { limit: { type: 'integer' as const, default: DEFAULT_TYPE_DISTRIBUTION_LIMIT } }
            : {}),
        ...(nameKey === 'aiReview' ? { spaceId: spaceProperty } : {}),
      }
  return {
    id,
    kind: 'data-source',
    version: 1,
    name: t(`VisionAlarmDataCapability.${nameKey}.name`),
    description: t(`VisionAlarmDataCapability.${nameKey}.description`),
    owner,
    tags: ['alarm', 'vision', nameKey],
    facets: { category: 'vision-alarm-monitoring' },
    modes: ['snapshot', 'poll'],
    defaults: { pollInterval: 30_000 },
    querySchema: {
      type: 'object',
      properties,
    },
    ...(id === SOURCE_IDS.levelTrend ? {
      filterSchema: {
        type: 'object' as const,
        properties: { timeRange: timeRangeFilterProperty },
      },
    } : {}),
    outputSchema,
    create: () => createSnapshot(loader, mapper),
  }
}

function pageSource<TQuery, TPage extends { data: unknown[] }>(
  id: string,
  nameKey: string,
  loader: (query: TQuery, signal?: AbortSignal) => Promise<TPage>,
  mapper: (request: DataSourceRequest) => TQuery,
  outputSchema: DataSourceDefinition['outputSchema'],
): DataSourceDefinition {
  const commonProperties = {
    pageIndex: { type: 'integer' as const, default: 0 },
    pageSize: { type: 'integer' as const, default: DEFAULT_PAGE_SIZE },
    ...timeProperties,
    state: stateProperty,
    level: {
      type: 'integer' as const,
      title: t('VisionAlarmDataCapability.query.level'),
    },
  }
  const properties = nameKey === 'eventList'
    ? { ...commonProperties, source: eventSourceProperty }
    : {
        ...commonProperties,
        sceneId: {
          type: 'string' as const,
          title: t('VisionAlarmDataCapability.query.sceneId'),
        },
        algorithmId: {
          type: 'string' as const,
          title: t('VisionAlarmDataCapability.query.algorithmId'),
        },
      }
  return {
    id,
    kind: 'data-source',
    version: 1,
    name: t(`VisionAlarmDataCapability.${nameKey}.name`),
    description: t(`VisionAlarmDataCapability.${nameKey}.description`),
    owner,
    tags: ['alarm', 'page', nameKey],
    facets: { category: 'vision-alarm-monitoring' },
    modes: ['page', 'snapshot', 'poll'],
    defaults: { pollInterval: 30_000 },
    querySchema: {
      type: 'object',
      properties,
    },
    outputSchema,
    create: () => createPage(loader, mapper),
  }
}

function createSnapshot<TQuery, TData>(
  loader: (query: TQuery, signal?: AbortSignal) => Promise<TData>,
  mapper: (request: DataSourceRequest) => TQuery,
): DataSource {
  return {
    query<T = unknown>(request: DataSourceRequest, context: RuntimeContext) {
      return defer(() => loader(mapper(request), request.signal || context.signal))
        .pipe(map(data => ({ data: data as unknown as T })))
    },
  }
}

function createPage<TQuery, TPage extends { data: unknown[] }>(
  loader: (query: TQuery, signal?: AbortSignal) => Promise<TPage>,
  mapper: (request: DataSourceRequest) => TQuery,
): DataSource {
  return {
    query<T = unknown>(request: DataSourceRequest, context: RuntimeContext) {
      return defer(() => loader(mapper(request), request.signal || context.signal))
        .pipe(map(page => ({
          ...page,
          data: page.data as unknown as T,
        })))
    },
  }
}

function toTimeQuery(request: DataSourceRequest): TimeRangeQuery {
  const rangeTerm = request.filter?.terms.find(term => term.field === 'timeRange')
  const range = Array.isArray(rangeTerm?.value) ? rangeTerm.value : undefined
  const startTime = optionalTimestamp(range?.[0] ?? request.query?.startTime)
  const endTime = optionalTimestamp(range?.[1] ?? request.query?.endTime)
  if (startTime !== undefined && endTime !== undefined && startTime > endTime) {
    throw new Error(t('VisionAlarmDataCapability.error.invalidTimeRange'))
  }
  return { startTime, endTime }
}

function toRankQuery(request: DataSourceRequest): VisionAlarmRankQuery {
  return {
    ...toTimeQuery(request),
    limit: integerInRange(request.query?.limit ?? request.limit, DEFAULT_LIMIT, 1, MAX_LIMIT),
  }
}

function toTypeDistributionQuery(request: DataSourceRequest): VisionAlarmTypeDistributionQuery {
  return {
    ...toTimeQuery(request),
    limit: integerInRange(
      request.query?.limit ?? request.limit,
      DEFAULT_TYPE_DISTRIBUTION_LIMIT,
      1,
      MAX_LIMIT,
    ),
  }
}

function toVisionListQuery(request: DataSourceRequest): VisionAlarmListQuery {
  const state = optionalEnum(request.query?.state, ['active', 'handled'] as const)
  return {
    ...toTimeQuery(request),
    pageIndex: integerInRange(request.query?.pageIndex, 0, 0),
    pageSize: integerInRange(request.query?.pageSize ?? request.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE),
    state: state as VisionAlarmState | undefined,
    sceneId: optionalText(request.query?.sceneId),
    algorithmId: optionalText(request.query?.algorithmId),
    level: optionalInteger(request.query?.level),
  }
}

function toAiReviewQuery(request: DataSourceRequest): VisionAlarmAiReviewQuery {
  return {
    ...toTimeQuery(request),
    spaceId: optionalText(request.query?.spaceId),
  }
}

function toEventSummaryQuery(_request: DataSourceRequest): AlarmEventSummaryQuery {
  return {}
}

function toEventListQuery(request: DataSourceRequest): AlarmEventListQuery {
  const base = toVisionListQuery(request)
  return {
    ...base,
    source: optionalEnum(request.query?.source, EVENT_SOURCES) ?? 'iot',
  }
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  return String(value).trim() || undefined
}

function optionalInteger(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const number = Number(value)
  if (!Number.isInteger(number)) throw new Error(t('VisionAlarmDataCapability.error.invalidLevel'))
  return number
}

function optionalTimestamp(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const number = Number(value)
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(t('VisionAlarmDataCapability.error.invalidTimestamp'))
  }
  return number
}

function optionalEnum<T extends string>(value: unknown, values: readonly T[]): T | undefined {
  const normalized = optionalText(value)
  if (!normalized) return undefined
  if (!values.includes(normalized as T)) {
    throw new Error(t('VisionAlarmDataCapability.error.invalidState'))
  }
  return normalized as T
}

function integerInRange(value: unknown, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER) {
  if (value === undefined || value === null || value === '') return fallback
  const number = Number(value)
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(t('VisionAlarmDataCapability.error.invalidPagination'))
  }
  return number
}

const visionAlarmProvider: DataCapabilityProvider = {
  id: PROVIDER_ID,
  owner,
  capabilityIds: Object.values(SOURCE_IDS),
  load: () => ({ sources }),
}

export default visionAlarmProvider
