import dayjs from 'dayjs'
import { request } from '@jetlinks-web/core'
import i18n from '@jetlinks-web-core/locales'
import {
  formatAlarmLevelLabel,
  queryAlarmLevelOptions,
  type AlarmLevelOption,
} from '../api/alarmLevel'
import { aggregationRecord } from '../api/board'
import {
  loadDeviceAlarmList,
  loadDeviceAlarmSummary,
} from './deviceAlarm.service'
import type {
  AlarmEventListQuery,
  AlarmEventListRow,
  AlarmEventPageData,
  AlarmEventSummaryData,
  AlarmEventSummaryQuery,
  TimeRangeQuery,
  VisionAlarmAiReviewQuery,
  VisionAlarmAiReviewSummaryData,
  VisionAlarmChannelRankRow,
  VisionAlarmHandlingTrendRow,
  VisionAlarmLevelDistributionRow,
  VisionAlarmLevelTrendRow,
  VisionAlarmListQuery,
  VisionAlarmListRow,
  VisionAlarmPageData,
  VisionAlarmRankQuery,
  VisionAlarmRecognitionRow,
  VisionAlarmSceneDistributionRow,
  VisionAlarmSceneRankRow,
  VisionAlarmSummaryData,
  VisionAlarmTypeDistributionQuery,
  VisionAlarmTypeDistributionRow,
} from './visionAlarm.types'

type UnknownRecord = Record<string, unknown>
type QueryTerm = { column: string; termType: string; value: unknown }
type VisionAlarmBaseSummaryData = Omit<
  VisionAlarmSummaryData,
  'alarmCount' | 'alarmCameraCount'
>

const DAY = 24 * 60 * 60 * 1000
const VISION_TARGET = 'aiTaskMediaTarget'
const t = (key: string) => String(i18n.global.t(key))
const requestConfig = (signal?: AbortSignal) => ({ signal, hiddenError: true })

/**
 * 视联告警的数据权限、查询 DSL 与后端兼容逻辑集中在规则引擎模块，
 * 资源组件只消费稳定、扁平的 DataCapability 输出。
 */
export async function loadVisionAlarmSummary(
  query: TimeRangeQuery,
  signal?: AbortSignal,
): Promise<VisionAlarmBaseSummaryData> {
  const terms = buildTimeTerms(query)
  const [active, handled] = await Promise.all([
    countVisionAlarms([...terms, stateTerm('active')], signal),
    countVisionAlarms([...terms, stateTerm('handled')], signal),
  ])
  const total = active + handled
  return {
    total,
    active,
    handled,
    activeRate: percentage(active, total),
    handledRate: percentage(handled, total),
    sampleTime: Date.now(),
  }
}

export async function loadVisionAlarmLevelDistribution(
  query: TimeRangeQuery,
  signal?: AbortSignal,
): Promise<VisionAlarmLevelDistributionRow[]> {
  const range = resolveRange(query, DAY)
  const levels = await loadLevelOptions(signal)
  const counts = await Promise.all(levels.map(item =>
    countVisionAlarms([
      ...buildTimeTerms(range),
      { column: 'level', termType: 'eq', value: item.level },
    ], signal)))
  const total = counts.reduce((sum, count) => sum + count, 0)
  const highestIndex = counts.findIndex(count => count > 0)
  return levels.map((item, index) => ({
    level: item.level,
    levelText: levelText(item),
    count: counts[index] || 0,
    rate: percentage(counts[index] || 0, total),
    isHighest: index === highestIndex,
  }))
}

export async function loadVisionAlarmSceneRank(
  query: VisionAlarmRankQuery,
  signal?: AbortSignal,
): Promise<VisionAlarmSceneRankRow[]> {
  const range = resolveRange(query, DAY)
  const [rows, scenes] = await Promise.all([
    queryHistoryAggregation({
      aggColumns: [{ property: 'id', alias: 'alarmCount', aggregation: 'COUNT' }],
      groupBy: [{ property: 'bizType', alias: 'sceneId' }],
      startWithTime: range.startTime,
      endWithTime: range.endTime,
      limit: Math.max(query.limit * 4, 40),
      queryParam: { paging: false, terms: [] },
    }, signal),
    querySceneRows(signal),
  ])
  const names = new Map(scenes.map((row, index) => [
    text(row.id ?? row.category) || `scene-${index + 1}`,
    text(row.name ?? row.category ?? row.id) || `scene-${index + 1}`,
  ]))
  return toRankRows(rows, query.limit, 'sceneId', 'sceneName')
    .map(row => ({
      rank: row.rank,
      sceneId: row.id,
      sceneName: names.get(row.id) || row.name || row.id,
      count: row.count,
      rate: row.rate,
    }))
}

export async function loadVisionAlarmSceneDistribution(
  query: TimeRangeQuery,
  signal?: AbortSignal,
): Promise<VisionAlarmSceneDistributionRow[]> {
  const range = resolveRange(query, DAY)
  const [rows, scenes] = await Promise.all([
    queryHistoryAggregation({
      aggColumns: [{ property: 'id', alias: 'alarmCount', aggregation: 'COUNT' }],
      groupBy: [{ property: 'bizType', alias: 'sceneId' }],
      startWithTime: range.startTime,
      endWithTime: range.endTime,
      limit: 200,
      queryParam: { paging: false, terms: [] },
    }, signal),
    querySceneRows(signal),
  ])
  const counts = new Map<string, number>()
  rows.forEach((row) => {
    const sceneId = text(row.sceneId)
    if (!sceneId) return
    counts.set(sceneId, (counts.get(sceneId) ?? 0) + (finiteNumber(row.alarmCount) ?? 0))
  })

  const seen = new Set<string>()
  return scenes
    .flatMap((scene): VisionAlarmSceneDistributionRow[] => {
      const sceneId = text(scene.id ?? scene.category)
      if (!sceneId || seen.has(sceneId)) return []
      seen.add(sceneId)
      return [{
        sceneId,
        sceneName: text(scene.name ?? scene.category ?? scene.id) || sceneId,
        count: counts.get(sceneId) ?? 0,
      }]
    })
    .sort((left, right) => right.count - left.count || left.sceneName.localeCompare(right.sceneName))
}

export async function loadVisionAlarmTypeDistribution(
  query: VisionAlarmTypeDistributionQuery,
  signal?: AbortSignal,
): Promise<VisionAlarmTypeDistributionRow[]> {
  const range = resolveRange(query, DAY)
  const response = await aggregationRecord(VISION_TARGET, {
    columns: [{ column: 'id', alias: 'alarmCount', aggregation: 'COUNT' }],
    groupBy: [
      { column: 'alarmConfigId', alias: 'typeId' },
      { column: 'alarmName', alias: 'typeName' },
    ],
    filter: { terms: buildTimeTerms(range) },
  }, requestConfig(signal))
  const rows = rowsOf(response)
    .map((row): VisionAlarmTypeDistributionRow | undefined => {
      const typeId = text(row.typeId)
      const typeName = text(row.typeName)
      const count = Math.max(finiteNumber(row.alarmCount) || 0, 0)
      if (!typeId || !typeName || count <= 0) return undefined
      return { typeId, typeName, count, rate: 0 }
    })
    .filter((row): row is VisionAlarmTypeDistributionRow => Boolean(row))
    .sort((left, right) => right.count - left.count || left.typeName.localeCompare(right.typeName))
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  const visibleCount = rows.length > query.limit ? Math.max(query.limit - 1, 0) : query.limit
  const visible = rows.slice(0, visibleCount).map(row => ({
    ...row,
    rate: percentage(row.count, total),
  }))
  const otherCount = rows.slice(visibleCount).reduce((sum, row) => sum + row.count, 0)
  if (otherCount > 0) {
    visible.push({
      typeId: 'other',
      typeName: t('VisionAlarmDataCapability.typeDistribution.other'),
      count: otherCount,
      rate: percentage(otherCount, total),
    })
  }
  return visible
}

export async function loadVisionAlarmChannelRank(
  query: VisionAlarmRankQuery,
  signal?: AbortSignal,
): Promise<VisionAlarmChannelRankRow[]> {
  const range = resolveRange(query, DAY)
  const rows = await queryHistoryAggregation({
    aggColumns: [{ property: 'id', alias: 'alarmCount', aggregation: 'COUNT' }],
    groupBy: [
      { property: 'sourceName', alias: 'channelName' },
      { property: 'sourceId', alias: 'channelId' },
    ],
    startWithTime: range.startTime,
    endWithTime: range.endTime,
    limit: query.limit,
    queryParam: { paging: false, terms: [] },
  }, signal)
  return toRankRows(rows, query.limit, 'channelId', 'channelName')
    .map(row => ({
      rank: row.rank,
      channelId: row.id,
      channelName: row.name || row.id,
      count: row.count,
      rate: row.rate,
    }))
}

export async function loadVisionAlarmLevelTrend(
  query: TimeRangeQuery,
  signal?: AbortSignal,
): Promise<VisionAlarmLevelTrendRow[]> {
  const range = resolveRange(query, DAY)
  const bucket = resolveBucket(range.endTime - range.startTime)
  const [rows, levels] = await Promise.all([
    queryHistoryAggregation({
      aggColumns: [{ property: 'id', alias: 'alarmCount', aggregation: 'COUNT' }],
      groupByTime: {
        property: 'alarmTime',
        alias: 'time',
        interval: bucket.interval,
        format: bucket.format,
      },
      groupBy: [{ property: 'level', alias: 'level' }],
      startWithTime: range.startTime,
      endWithTime: range.endTime,
      limit: 500,
      queryParam: { paging: false, terms: [] },
    }, signal),
    loadLevelOptions(signal),
  ])
  return fillLevelTrend(rows, levels, range, bucket)
}

export async function loadVisionAlarmHandlingTrend(
  query: TimeRangeQuery,
  signal?: AbortSignal,
): Promise<VisionAlarmHandlingTrendRow[]> {
  const range = resolveRange(query, DAY)
  const bucket = resolveBucket(range.endTime - range.startTime)
  const [activeRows, handledRows] = await Promise.all([
    queryVisionAlarmHandlingTrend(range, bucket, 'active', signal),
    queryVisionAlarmHandlingTrend(range, bucket, 'handled', signal),
  ])
  return fillVisionAlarmHandlingTrend(activeRows, handledRows, range, bucket)
}

export async function loadVisionAlarmAiReviewSummary(
  query: VisionAlarmAiReviewQuery,
  signal?: AbortSignal,
): Promise<VisionAlarmAiReviewSummaryData> {
  const range = resolveRange(query, 7 * DAY)
  const duration = Math.max(range.endTime - range.startTime, 1)
  const previous = {
    startTime: Math.max(range.startTime - duration, 0),
    endTime: Math.max(range.startTime - 1, 0),
  }
  const [valid, filtered, previousValid, previousFiltered] = await Promise.all([
    countAiReviews(1, range, query.spaceId, signal),
    countAiReviews(0, range, query.spaceId, signal),
    countAiReviews(1, previous, query.spaceId, signal),
    countAiReviews(0, previous, query.spaceId, signal),
  ])
  const total = valid + filtered
  const previousTotal = previousValid + previousFiltered
  const validRate = percentage(valid, total)
  const previousValidRate = previousTotal ? percentage(previousValid, previousTotal) : null
  return {
    total,
    valid,
    filtered,
    validRate,
    previousValidRate,
    validRateDelta: previousValidRate === null
      ? null
      : Number((validRate - previousValidRate).toFixed(2)),
    filterRate: percentage(filtered, total),
    startTime: range.startTime,
    endTime: range.endTime,
    sampleTime: Date.now(),
  }
}

export async function loadVisionAlarmList(
  query: VisionAlarmListQuery,
  signal?: AbortSignal,
): Promise<VisionAlarmPageData> {
  const range = resolveRange(query, dayjs().diff(dayjs().startOf('day')))
  const terms = [
    ...buildTimeTerms(range),
    ...buildVisionListTerms(query),
  ]
  const response = await request.post(`/alarm/record/${VISION_TARGET}/_query`, {
    paging: true,
    pageIndex: query.pageIndex,
    pageSize: query.pageSize,
    terms,
    sorts: query.state === 'handled'
      ? [{ name: 'handleTime', order: 'desc' }, { name: 'lastAlarmTime', order: 'desc' }]
      : [{ name: 'lastAlarmTime', order: 'desc' }, { name: 'alarmTime', order: 'desc' }],
  }, requestConfig(signal))
  const page = pageOf(response)
  const levels = await loadLevelOptions(signal)
  const levelMap = new Map(levels.map(item => [item.level, levelText(item)]))
  return {
    data: page.data.map(row => mapVisionAlarmRow(row, levelMap)),
    total: page.total,
    pageIndex: page.pageIndex ?? query.pageIndex,
    pageSize: page.pageSize ?? query.pageSize,
  }
}

export async function loadAlarmEventSummary(
  _query: AlarmEventSummaryQuery,
  signal?: AbortSignal,
): Promise<AlarmEventSummaryData> {
  const today = dayjs().startOf('day').valueOf()
  const [iot, vision, iotToday, visionToday] = await Promise.all([
    loadDeviceAlarmSummary({}, signal),
    loadVisionAlarmSummary({}, signal),
    loadDeviceAlarmSummary({ startTime: today }, signal),
    loadVisionAlarmSummary({ startTime: today }, signal),
  ])
  const total = iot.total + vision.total
  const active = iot.active + vision.active
  const handled = iot.handled + vision.handled
  const todayCreated = iotToday.total + visionToday.total
  return {
    total,
    totalChangeRate: null,
    todayCreated,
    todayCreatedChangeRate: null,
    active,
    activeChangeRate: null,
    handled,
    handled24h: iotToday.handled + visionToday.handled,
    handled24hChangeRate: null,
    avgHandleDurationMillis: null,
    avgHandleDurationChangeRate: null,
    activeRate: percentage(active, total),
    handledRate: percentage(handled, total),
    sampleTime: Date.now(),
  }
}

export async function loadAlarmEventList(
  query: AlarmEventListQuery,
  signal?: AbortSignal,
): Promise<AlarmEventPageData> {
  if (query.source === 'vision') {
    const page = await loadVisionAlarmList(query, signal)
    return {
      ...page,
      data: page.data.map(mapVisionEventRow),
    }
  }
  const page = await loadDeviceAlarmList({
    pageIndex: query.pageIndex,
    pageSize: query.pageSize,
    startTime: query.startTime,
    endTime: query.endTime,
    state: query.state,
    level: query.level,
  }, signal)
  return {
    ...page,
    data: page.data.map(row => ({
      alarmId: row.alarmId,
      source: 'iot',
      categoryId: 'device',
      categoryName: row.alarmName,
      deviceId: row.deviceId,
      deviceName: row.deviceName,
      channelId: null,
      channelName: null,
      location: null,
      level: row.level,
      levelText: row.levelText,
      state: row.state,
      stateText: row.stateText,
      content: row.content,
      alarmTime: row.alarmTime,
      handleTime: row.handleTime,
      durationMillis: row.durationMillis,
    })),
  }
}

function mapVisionEventRow(row: VisionAlarmListRow): AlarmEventListRow {
  return {
    alarmId: row.alarmId,
    source: 'vision',
    categoryId: row.typeId || 'vision',
    categoryName: row.typeName,
    deviceId: null,
    deviceName: null,
    channelId: row.channelId,
    channelName: row.channelName,
    location: row.location,
    level: row.level,
    levelText: row.levelText,
    state: row.state,
    stateText: row.stateText,
    content: row.content,
    alarmTime: row.alarmTime,
    handleTime: row.handleTime,
    durationMillis: duration(row.alarmTime, row.handleTime),
  }
}

async function countVisionAlarms(terms: QueryTerm[], signal?: AbortSignal): Promise<number> {
  const response = await request.post(
    `/alarm/record/${VISION_TARGET}/_count`,
    { terms },
    requestConfig(signal),
  )
  return countOf(response)
}

async function countAiReviews(
  hitResults: 0 | 1,
  range: Required<TimeRangeQuery>,
  spaceId: string | undefined,
  signal?: AbortSignal,
): Promise<number> {
  const terms: QueryTerm[] = [
    { column: 'success', termType: 'eq', value: true },
    { column: 'taskType', termType: 'eq', value: 'reviewHandle' },
    { column: 'searchCode', termType: 'eq', value: 'alarmTask' },
    { column: 'hitResults', termType: 'eq', value: hitResults },
    { column: 'timestamp', termType: 'btw', value: [range.startTime, range.endTime] },
  ]
  if (spaceId) terms.push({ column: 'spaceId', termType: 'eq', value: spaceId })
  const response = await request.post(
    '/ai/task/history/_count',
    { terms },
    { ...requestConfig(signal), params: { assetType: 'device' } },
  )
  return countOf(response)
}

async function queryHistoryAggregation(
  payload: UnknownRecord,
  signal?: AbortSignal,
): Promise<UnknownRecord[]> {
  try {
    const response = await request.post(
      '/ai/aggregate/task/alarm/history/_aggregation',
      payload,
      requestConfig(signal),
    )
    return rowsOf(response)
  } catch (error) {
    const compatible = toCompatibleAggregationPayload(payload)
    if (!compatible) throw error
    const response = await request.post(
      '/ai/aggregate/task/alarm/history/_aggregation',
      compatible,
      requestConfig(signal),
    )
    return rowsOf(response)
  }
}

async function queryVisionAlarmHandlingTrend(
  range: Required<TimeRangeQuery>,
  bucket: { interval: string; format: string },
  state: 'active' | 'handled',
  signal?: AbortSignal,
): Promise<UnknownRecord[]> {
  const response = await aggregationRecord(VISION_TARGET, {
    columns: [{ column: 'id', alias: 'alarmCount', aggregation: 'COUNT' }],
    groupByTime: {
      column: 'alarmTime',
      alias: 'time',
      interval: bucket.interval,
      format: bucket.format,
      from: dayjs(range.startTime).format('YYYY-MM-DD HH:mm:ss'),
      to: dayjs(range.endTime).format('YYYY-MM-DD HH:mm:ss'),
    },
    filter: { terms: [stateTerm(state)] },
  }, requestConfig(signal))
  return rowsOf(response)
}

async function querySceneRows(signal?: AbortSignal): Promise<UnknownRecord[]> {
  const response = await request.post('/ai/scene/tree/_query', {
    paging: true,
    pageIndex: 0,
    pageSize: 200,
    sorts: [{ name: 'createTime', order: 'desc' }],
    terms: [],
  }, requestConfig(signal))
  return rowsOf(response)
}

async function loadLevelOptions(signal?: AbortSignal): Promise<AlarmLevelOption[]> {
  try {
    return await queryAlarmLevelOptions(signal)
  } catch (error) {
    if (isAbortError(error)) throw error
    return []
  }
}

function fillLevelTrend(
  rows: UnknownRecord[],
  levels: AlarmLevelOption[],
  range: Required<TimeRangeQuery>,
  bucket: { interval: string; format: string; unit: dayjs.ManipulateType },
): VisionAlarmLevelTrendRow[] {
  const configured = levels.length
    ? levels
    : [...new Set(rows.map(row => finiteNumber(row.level)).filter(isNumber))]
        .sort((a, b) => a - b)
        .map(level => ({ level } as AlarmLevelOption))
  const countMap = new Map<string, number>()
  rows.forEach((row) => {
    const timestamp = bucketTimestamp(row.time, bucket.unit)
    const level = finiteNumber(row.level)
    if (timestamp === null || level === undefined) return
    countMap.set(`${timestamp}:${level}`, finiteNumber(row.alarmCount) || 0)
  })
  const result: VisionAlarmLevelTrendRow[] = []
  let cursor = dayjs(range.startTime).startOf(bucket.unit)
  const end = dayjs(range.endTime).startOf(bucket.unit)
  while ((cursor.isBefore(end) || cursor.isSame(end)) && result.length < 2000) {
    const timestamp = cursor.valueOf()
    const counts = configured.map(item => countMap.get(`${timestamp}:${item.level}`) || 0)
    const total = counts.reduce((sum, count) => sum + count, 0)
    configured.forEach((item, index) => {
      result.push({
        timestamp,
        level: item.level,
        levelText: levelText(item),
        count: counts[index] || 0,
        total,
      })
    })
    cursor = cursor.add(1, bucket.unit)
  }
  return result
}

function fillVisionAlarmHandlingTrend(
  activeRows: UnknownRecord[],
  handledRows: UnknownRecord[],
  range: Required<TimeRangeQuery>,
  bucket: { unit: dayjs.ManipulateType },
): VisionAlarmHandlingTrendRow[] {
  const toCountMap = (rows: UnknownRecord[]) => {
    const counts = new Map<number, number>()
    rows.forEach((row) => {
      const timestamp = bucketTimestamp(row.time, bucket.unit)
      if (timestamp === null) return
      counts.set(timestamp, Math.max(finiteNumber(row.alarmCount) || 0, 0))
    })
    return counts
  }
  const activeCounts = toCountMap(activeRows)
  const handledCounts = toCountMap(handledRows)
  const result: VisionAlarmHandlingTrendRow[] = []
  let cursor = dayjs(range.startTime).startOf(bucket.unit)
  const end = dayjs(range.endTime).startOf(bucket.unit)
  while ((cursor.isBefore(end) || cursor.isSame(end)) && result.length < 2000) {
    const timestamp = cursor.valueOf()
    const activeCount = activeCounts.get(timestamp) || 0
    const handledCount = handledCounts.get(timestamp) || 0
    result.push({
      timestamp,
      activeCount,
      handledCount,
      handledRate: percentage(handledCount, activeCount + handledCount),
    })
    cursor = cursor.add(1, bucket.unit)
  }
  return result
}

function mapVisionAlarmRow(
  row: UnknownRecord,
  levelMap: Map<number, string>,
): VisionAlarmListRow {
  const latest = asRecord(row.latestHistory)
  const state = normalizeState(row.state)
  const level = finiteNumber(row.level) ?? null
  const recognitions = extractRecognitions(latest.schemaResults ?? row.schemaResults)
  const alarmTime = timestampOf(row.lastAlarmTime ?? row.alarmTime ?? row.createTime)
  const handleTime = timestampOf(row.handleTime ?? latest.handleTime)
  return {
    alarmId: text(row.id) || `vision-alarm-${alarmTime || Date.now()}`,
    typeId: nullableText(row.bizType ?? row.alarmConfigId),
    typeName: nullableText(row.alarmName ?? row.targetName ?? row.bizType),
    channelId: nullableText(latest.mediaChannelId ?? latest.sourceId ?? row.sourceId),
    channelName: nullableText(
      latest.mediaChannelName ?? latest.mediaDeviceName ?? latest.sourceName ?? row.sourceName,
    ),
    location: nullableText(latest.spaceName ?? row.spaceName ?? latest.sourceName),
    level,
    levelText: level === null ? null : levelMap.get(level) || String(level),
    state,
    stateText: state === 'active'
      ? t('VisionAlarmDataCapability.state.active')
      : t('VisionAlarmDataCapability.state.handled'),
    content: nullableText(
      row.actualDesc ?? latest.actualDesc ?? row.triggerDesc ?? row.description,
    ),
    alarmTime,
    handleTime,
    imageUrl: findMediaUrl(latest, row),
    targetCount: recognitions.length,
    confidence: highestConfidence(recognitions, latest, row),
    canHandle: state === 'active',
    recognitions,
  }
}

function extractRecognitions(value: unknown): VisionAlarmRecognitionRow[] {
  const schema = asRecord(value)
  const objects = Array.isArray(schema.objects) ? schema.objects : []
  return objects.map(asRecord).flatMap((item) => {
    const box = Array.isArray(item.box)
      ? item.box.map(Number)
      : [item.left, item.top, item.right ?? item.width, item.bottom ?? item.height].map(Number)
    if (box.length < 4 || box.some(value => !Number.isFinite(value))) return []
    const unit = box.some(value => value > 1) ? 'pixel' : 'percent'
    const multiplier = unit === 'percent' ? 100 : 1
    const left = box[0] * multiplier
    const top = box[1] * multiplier
    const third = box[2] * multiplier
    const fourth = box[3] * multiplier
    const right = item.right === undefined ? left + third : third
    const bottom = item.bottom === undefined ? top + fourth : fourth
    return [{
      label: nullableText(item.label ?? item.name ?? item.className),
      confidence: normalizeConfidence(item.score ?? item.confidence),
      top,
      left,
      right,
      bottom,
      unit,
    }]
  })
}

function findMediaUrl(...records: UnknownRecord[]): string | null {
  for (const record of records) {
    const direct = nullableText(
      record.imageUrl ?? record.snapshotUrl ?? record.pictureUrl ?? record.fileUrl,
    )
    if (direct) return direct
    const files = Array.isArray(record.fileResults) ? record.fileResults : []
    for (const file of files) {
      const url = nullableText(asRecord(file).url ?? asRecord(file).fileUrl)
      if (url) return url
    }
  }
  return null
}

function highestConfidence(
  recognitions: VisionAlarmRecognitionRow[],
  ...records: UnknownRecord[]
): number | null {
  const values = [
    ...recognitions.map(item => item.confidence),
    ...records.map(item => normalizeConfidence(item.confidence ?? item.score)),
  ].filter(isNumber)
  return values.length ? Math.max(...values) : null
}

function buildVisionListTerms(query: VisionAlarmListQuery): QueryTerm[] {
  const terms: QueryTerm[] = []
  if (query.state) terms.push(stateTerm(query.state))
  if (query.sceneId) terms.push({ column: 'bizType', termType: 'eq', value: query.sceneId })
  if (query.algorithmId) terms.push({ column: 'bizId', termType: 'like', value: query.algorithmId })
  if (query.level !== undefined) terms.push({ column: 'level', termType: 'eq', value: query.level })
  return terms
}

function stateTerm(state: 'active' | 'handled'): QueryTerm {
  return {
    column: 'state',
    termType: 'eq',
    value: state === 'active' ? 'warning' : 'normal',
  }
}

function buildTimeTerms(query: TimeRangeQuery): QueryTerm[] {
  const terms: QueryTerm[] = []
  if (query.startTime !== undefined) {
    terms.push({ column: 'alarmTime', termType: 'gte', value: query.startTime })
  }
  if (query.endTime !== undefined) {
    terms.push({ column: 'alarmTime', termType: 'lte', value: query.endTime })
  }
  return terms
}

function resolveRange(
  query: TimeRangeQuery,
  duration: number,
): Required<TimeRangeQuery> {
  const endTime = query.endTime ?? Date.now()
  const startTime = query.startTime ?? Math.max(endTime - Math.max(duration, 0), 0)
  if (startTime > endTime) throw new Error(t('VisionAlarmDataCapability.error.invalidTimeRange'))
  return { startTime, endTime }
}

function resolveBucket(duration: number) {
  if (duration <= DAY) {
    return { interval: '1h', format: 'yyyy-MM-dd HH:mm', unit: 'hour' as const }
  }
  if (duration <= 31 * DAY) {
    return { interval: '1d', format: 'yyyy-MM-dd', unit: 'day' as const }
  }
  if (duration <= 180 * DAY) {
    return { interval: '1w', format: 'yyyy-MM-dd', unit: 'week' as const }
  }
  return { interval: '1M', format: 'yyyy-MM', unit: 'month' as const }
}

function bucketTimestamp(value: unknown, unit: dayjs.ManipulateType): number | null {
  const parsed = dayjs(value as string | number | Date)
  return parsed.isValid() ? parsed.startOf(unit).valueOf() : null
}

function toCompatibleAggregationPayload(payload: UnknownRecord): UnknownRecord | undefined {
  const aggColumns = Array.isArray(payload.aggColumns) ? payload.aggColumns.map(asRecord) : []
  const groupBy = Array.isArray(payload.groupBy) ? payload.groupBy.map(asRecord) : []
  if (!aggColumns.length) return undefined
  return {
    columns: aggColumns.map(item => ({
      column: item.property,
      alias: item.alias,
      aggregation: item.aggregation,
    })),
    groupBy: groupBy.map(item => ({ column: item.property, alias: item.alias })),
    groupByTime: payload.groupByTime,
    startWithTime: payload.startWithTime,
    endWithTime: payload.endWithTime,
    limit: payload.limit,
    filter: payload.queryParam,
  }
}

function toRankRows(
  rows: UnknownRecord[],
  limit: number,
  idKey: string,
  nameKey: string,
) {
  const ranked = rows
    .map(row => ({
      id: text(row[idKey]),
      name: text(row[nameKey]),
      count: finiteNumber(row.alarmCount ?? row.total) || 0,
    }))
    .filter(item => item.id || item.name)
    .sort((left, right) => right.count - left.count)
    .slice(0, limit)
  const total = ranked.reduce((sum, item) => sum + item.count, 0)
  return ranked.map((item, index) => ({
    ...item,
    id: item.id || item.name,
    rank: index + 1,
    rate: percentage(item.count, total),
  }))
}

function levelText(item: AlarmLevelOption): string {
  return formatAlarmLevelLabel(item)
    || text(item.label ?? item.shortLabel ?? item.raw?.title ?? item.raw?.name ?? item.level)
    || String(item.level)
}

function normalizeState(value: unknown): 'active' | 'handled' {
  const state = enumValue(value).toLowerCase()
  return ['normal', 'handled', 'closed', 'done'].includes(state) ? 'handled' : 'active'
}

function normalizeConfidence(value: unknown): number | null {
  const number = finiteNumber(value)
  if (number === undefined) return null
  return Number((number <= 1 ? number * 100 : number).toFixed(2))
}

function percentage(value: number, total: number): number {
  return total > 0 ? Number((value / total * 100).toFixed(2)) : 0
}

function duration(start: number | null, end: number | null): number | null {
  return start !== null && end !== null ? Math.max(end - start, 0) : null
}

function countOf(value: unknown): number {
  const result = unwrap(value)
  const candidate = isRecord(result) ? result.total ?? result.count : result
  return Math.max(finiteNumber(candidate) || 0, 0)
}

function pageOf(value: unknown) {
  const result = asRecord(unwrap(value))
  return {
    data: rowsOf(result.data),
    total: finiteNumber(result.total) || 0,
    pageIndex: finiteNumber(result.pageIndex),
    pageSize: finiteNumber(result.pageSize),
  }
}

function rowsOf(value: unknown): UnknownRecord[] {
  const result = unwrap(value)
  if (Array.isArray(result)) return result.filter(isRecord)
  const record = asRecord(result)
  const data = Array.isArray(record.data) ? record.data : []
  return data.filter(isRecord)
}

function unwrap(value: unknown): unknown {
  return isRecord(value) && 'result' in value ? value.result : value
}

function timestampOf(value: unknown): number | null {
  const raw = isRecord(value) ? value.value : value
  if (raw === undefined || raw === null || raw === '') return null
  const numeric = Number(raw)
  if (Number.isFinite(numeric)) return numeric > 1_000_000_000_000
    ? numeric
    : numeric > 1_000_000_000 ? numeric * 1000 : numeric
  const parsed = dayjs(String(raw)).valueOf()
  return Number.isFinite(parsed) ? parsed : null
}

function enumValue(value: unknown): string {
  return text(isRecord(value) ? value.value : value)
}

function finiteNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function nullableText(value: unknown): string | null {
  return text(value) || null
}

function text(value: unknown): string {
  if (isRecord(value)) return text(value.text ?? value.label ?? value.name ?? value.value)
  return value == null ? '' : String(value).trim()
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {}
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (
    (error as { name?: string }).name === 'AbortError'
    || (error as { code?: string }).code === 'ERR_CANCELED'
    || (error as { name?: string }).name === 'CanceledError'
  ))
}
