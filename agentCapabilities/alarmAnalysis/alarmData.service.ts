import { request } from '@jetlinks-web/core'
import { aggregationRecord } from '@rule-engine-manager-ui/api/board'
import {
  asRecord,
  extractCount,
  extractPage,
  mergeAlarmHistory,
  normalizeAlarmRecord,
  normalizeHandleHistory,
  text,
  type UnknownRecord,
} from './alarmData.mapper'
import type {
  AiSceneAlgorithm,
  AiSceneTreeItem,
  AlarmEventItem,
  AlarmEventPage,
  AlarmEventQueryOptions,
  AlarmEventSource,
  AlarmHandleHistoryPage,
  AlarmNoiseStats,
  EventSelection,
} from './alarmData.types'
import { queryAlarmLevelOptions } from './alarmLevel'

interface QueryTerm {
  column: string
  termType: string
  value: unknown
}

export const ALARM_RECORD_STATE_FILTER = {
  all: 'all',
  warning: 'warning',
  normal: 'normal',
} as const

const alarmRecordSorts = [
  { name: 'lastAlarmTime', order: 'desc' },
  { name: 'alarmTime', order: 'desc' },
  { name: 'createTime', order: 'desc' },
]

const AI_REVIEW_HANDLE_HISTORY_TERMS = [
  { column: 'success', termType: 'eq', value: true },
  { column: 'taskType', termType: 'eq', value: 'reviewHandle' },
  { column: 'searchCode', termType: 'eq', value: 'alarmTask' },
] as const

export function resolveAlarmRecordTargetType(source: AlarmEventSource): string {
  return source === 'vision' ? 'aiTaskMediaTarget' : 'device'
}

/** Queries and normalizes alarm records without exposing backend query or response structures. */
export async function queryAlarmEvents(
  source: AlarmEventSource,
  options: AlarmEventQueryOptions = {},
): Promise<AlarmEventPage> {
  const [response, levels] = await Promise.all([
    request.post(`/alarm/record/${resolveAlarmRecordTargetType(source)}/_query`, {
      paging: true,
      pageIndex: options.pageIndex ?? 0,
      pageSize: options.pageSize ?? 50,
      terms: buildAlarmRecordTerms(options),
      sorts: alarmRecordSorts,
    }),
    queryAlarmLevelOptions(),
  ])
  const page = extractPage(response)
  return {
    data: page.data.map(raw => normalizeAlarmRecord(raw, source, levels)),
    total: page.total,
  }
}

/** Re-queries the record through the normal permission endpoint before opening the target drawer. */
export async function queryRawAlarmRecord(
  source: AlarmEventSource,
  alarmRecordId: string,
): Promise<UnknownRecord | undefined> {
  const response = await request.post(`/alarm/record/${resolveAlarmRecordTargetType(source)}/_query`, {
    paging: true,
    pageIndex: 0,
    pageSize: 1,
    terms: [{ column: 'id', termType: 'eq', value: alarmRecordId }],
    sorts: alarmRecordSorts,
  })
  return extractPage(response).data.find(item => text(item.id) === alarmRecordId)
}

export async function queryLatestAlarmHistoryEvent(
  event: AlarmEventItem,
): Promise<AlarmEventItem | undefined> {
  const response = await request.post(
    `/alarm/history/alarm-record/${encodeURIComponent(event.id)}/_query`,
    {
      paging: true,
      pageIndex: 0,
      pageSize: 1,
      sorts: [
        { name: 'alarmTime', order: 'desc' },
        { name: 'createTime', order: 'desc' },
      ],
    },
  )
  const history = extractPage(response).data[0]
  return history ? mergeAlarmHistory(event, history) : undefined
}

export async function queryAlarmHandleHistoryPage(
  event: AlarmEventItem,
  pageIndex = 0,
  pageSize = 12,
  terms: QueryTerm[] = [],
): Promise<AlarmHandleHistoryPage> {
  const response = await request.post(
    `/alarm/record/${encodeURIComponent(event.id)}/handle-history/_query`,
    {
      paging: true,
      pageIndex,
      pageSize,
      terms,
      sorts: [{ name: 'createTime', order: 'desc' }],
    },
  )
  const page = extractPage(response)
  return { data: page.data.map(normalizeHandleHistory), total: page.total }
}

export async function queryAlarmNoiseStatsByTimestampRange(
  timestampRange: [number, number],
  selection?: EventSelection,
): Promise<AlarmNoiseStats> {
  const [filtered, valid] = await Promise.all([
    countAiTaskHistory(buildAiReviewTerms(timestampRange, 0, selection)),
    countAiTaskHistory(buildAiReviewTerms(timestampRange, 1, selection)),
  ])
  const total = filtered + valid
  return {
    total,
    valid,
    filtered,
    filterRate: total ? Math.round((filtered / total) * 100) : 0,
    validRate: total ? Math.round((valid / total) * 100) : 0,
  }
}

export async function querySpaceBoundChannelIds(spaceIds: string[]): Promise<string[]> {
  const values = uniqueText(spaceIds)
  if (!values.length) return []
  const response = await request.post('/space/data-bind/_query/no-paging', {
    paging: false,
    terms: [{
      column: 'spaceId',
      termType: values.length > 1 ? 'in' : 'eq',
      value: values.length > 1 ? values : values[0],
    }],
    sorts: [{ name: 'createTime', order: 'desc' }],
  })
  return uniqueText(extractPage(response).data.map(item => item.channelId ?? item.channelRecordId))
}

export async function querySceneTreeData(): Promise<AiSceneTreeItem[]> {
  const response = await request.post('/ai/scene/tree/_query', {
    pageIndex: 0,
    pageSize: 200,
    sorts: [{ name: 'createTime', order: 'desc' }],
  })
  return extractPage(response).data.map(item => clearSceneAlarmCounts(item as AiSceneTreeItem))
}

function buildAlarmRecordTerms(options: AlarmEventQueryOptions): QueryTerm[] {
  const terms: QueryTerm[] = []
  if (options.recordId) terms.push({ column: 'id', termType: 'eq', value: options.recordId })
  if (options.timestampRange) terms.push({ column: 'alarmTime', termType: 'btw', value: options.timestampRange })
  if (options.sceneId) terms.push({ column: 'bizType', termType: 'eq', value: options.sceneId })
  if (options.algorithmId && options.sceneId) {
    terms.push({ column: 'bizId', termType: 'eq', value: `${options.sceneId}-${options.algorithmId}` })
  }
  if (Number.isFinite(options.level)) terms.push({ column: 'level', termType: 'eq', value: options.level })
  const sourceIds = uniqueText(options.sourceIds || [])
  if (sourceIds.length) terms.push({ column: 'sourceId', termType: 'in', value: sourceIds })
  if (options.state && options.state !== ALARM_RECORD_STATE_FILTER.all) {
    terms.push({ column: 'state', termType: 'eq', value: options.state })
  }
  const keyword = String(options.searchKeyword || '').trim()
  if (keyword) terms.push({ column: 'alarmName', termType: 'like', value: `%${keyword}%` })
  return terms
}

function buildAiReviewTerms(
  timestampRange: [number, number],
  hitResults: number,
  selection?: EventSelection,
): QueryTerm[] {
  const terms: QueryTerm[] = [
    ...AI_REVIEW_HANDLE_HISTORY_TERMS,
    { column: 'timestamp', termType: 'btw', value: timestampRange },
    { column: 'hitResults', termType: 'eq', value: hitResults },
  ]
  if (!selection?.value) return terms
  if (selection.dim === 'region') terms.push({ column: 'spaceId', termType: 'eq', value: selection.value })
  if (selection.dim === 'scene') {
    terms.push({ column: 'sceneId', termType: 'eq', value: selection.value })
    if (selection.sub) terms.push({ column: 'taskTarget', termType: 'eq', value: selection.sub })
  }
  if (selection.dim === 'sev') terms.push({ column: 'level', termType: 'eq', value: Number(selection.value) })
  return terms
}

async function countAiTaskHistory(terms: QueryTerm[]): Promise<number> {
  const response = await request.post(
    '/ai/task/history/_count',
    { terms },
    { params: { assetType: 'device' } },
  )
  return extractCount(response)
}

function clearSceneAlarmCounts(scene: AiSceneTreeItem): AiSceneTreeItem {
  return {
    ...scene,
    alarmRecordCount: undefined,
    children: scene.children?.map(clearAlgorithmAlarmCount),
    taskTargetDetails: scene.taskTargetDetails?.map(clearAlgorithmAlarmCount),
  }
}

function clearAlgorithmAlarmCount(algorithm: AiSceneAlgorithm): AiSceneAlgorithm {
  return { ...algorithm, alarmRecordCount: undefined }
}

function uniqueText(values: unknown[]): string[] {
  return Array.from(new Set(values.map(value => text(value)).filter(Boolean)))
}
