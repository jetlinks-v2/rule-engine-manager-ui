import {
  createDomainAgentAggregateCardinality,
  createDomainAgentRecordSetCardinality,
  createDomainAgentToolResult,
  resolveDomainAgentEnum,
  resolveDomainAgentInteger,
  resolveDomainAgentTimeRange,
} from '@jetlinks-web-core/layout/components/AiChat/domainAgentTools'
import { aggregationRecord } from '@rule-engine-manager-ui/api/board'
import { resolveAlarmRecordTargetType } from './alarmData.service'
import { queryAlarmLevelOptions } from './alarmLevel'
import type { AlarmLevelOption } from './alarmData.types'
import {
  ALARM_RANK_GROUPS,
} from './constants'
import {
  buildAlarmRecordTerms,
  dictValue,
  formatLocalDateTime,
  inputError,
  loadAlarmSources,
  resolveAlarmLevel,
  resolveAlarmSource,
  resolveAlarmState,
  resolveTrendInterval,
  runAlarmTool,
  sourceValue,
  toBackendState,
  toNumber,
  unwrapAggregationRows,
  type AggregationRow,
  type AlarmRecordSource,
  type AlarmState,
} from './alarmAnalysis.shared'

type AlarmRankGroup = typeof ALARM_RANK_GROUPS[number]

interface SourceOverview {
  source: ReturnType<typeof sourceValue>
  total: number
  open: number
  handled: number
  handledRate: number
  byLevel: Array<{ level: ReturnType<typeof levelValue>; count: number }>
}

const levelValue = (level: number, levels: AlarmLevelOption[]) => ({
  value: level,
  text: levels.find(item => item.level === level)?.label || String(level),
})

const querySourceOverview = async (
  source: AlarmRecordSource,
  range: ReturnType<typeof resolveDomainAgentTimeRange>,
  state: AlarmState | undefined,
  level: AlarmLevelOption | undefined,
  levels: AlarmLevelOption[],
): Promise<SourceOverview> => {
  const rows = unwrapAggregationRows(await aggregationRecord(resolveAlarmRecordTargetType(source), {
    columns: [{ column: 'id', alias: 'count', aggregation: 'COUNT' }],
    groupBy: [
      { column: 'state', alias: 'state' },
      { column: 'level', alias: 'level' },
    ],
    filter: { terms: buildAlarmRecordTerms(range, state, level) },
  }))
  const byLevelMap = new Map<number, number>()
  let open = 0
  let handled = 0
  rows.forEach((row) => {
    const count = toNumber(row.count)
    const levelNumber = toNumber(row.level)
    if (levelNumber) byLevelMap.set(levelNumber, (byLevelMap.get(levelNumber) || 0) + count)
    if (dictValue(row.state) === toBackendState('open')) open += count
    else handled += count
  })
  const total = open + handled
  return {
    source: sourceValue(source),
    total,
    open,
    handled,
    handledRate: total ? Number(((handled / total) * 100).toFixed(2)) : 0,
    byLevel: Array.from(byLevelMap.entries())
      .map(([value, count]) => ({ level: levelValue(value, levels), count }))
      .sort((left, right) => left.level.value - right.level.value),
  }
}

const mergeOverview = (items: SourceOverview[], levels: AlarmLevelOption[]) => {
  const byLevel = new Map<number, number>()
  items.forEach(item => item.byLevel.forEach(({ level, count }) => {
    byLevel.set(level.value, (byLevel.get(level.value) || 0) + count)
  }))
  const total = items.reduce((sum, item) => sum + item.total, 0)
  const open = items.reduce((sum, item) => sum + item.open, 0)
  const handled = items.reduce((sum, item) => sum + item.handled, 0)
  return {
    total,
    open,
    handled,
    handledRate: total ? Number(((handled / total) * 100).toFixed(2)) : 0,
    byLevel: Array.from(byLevel.entries())
      .map(([value, count]) => ({ level: levelValue(value, levels), count }))
      .sort((left, right) => left.level.value - right.level.value),
    bySource: items,
  }
}

const querySourceTrend = async (
  source: AlarmRecordSource,
  range: ReturnType<typeof resolveDomainAgentTimeRange>,
  interval: string,
  state: AlarmState | undefined,
  level: AlarmLevelOption | undefined,
) => {
  const format = interval === '1m' || interval === '1h' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd'
  const rows = unwrapAggregationRows(await aggregationRecord(resolveAlarmRecordTargetType(source), {
    columns: [{ column: 'id', alias: 'count', aggregation: 'COUNT' }],
    groupByTime: {
      column: 'alarmTime',
      alias: 'time',
      interval,
      format,
      from: formatLocalDateTime(range.start, true),
      to: formatLocalDateTime(range.end, true),
    },
    filter: { terms: buildAlarmRecordTerms(range, state, level) },
  }))
  return rows
    .map(row => ({ time: String(row.time || ''), count: toNumber(row.count) }))
    .filter(item => item.time)
    .sort((left, right) => left.time.localeCompare(right.time))
}

const mergeTrend = (trends: Partial<Record<AlarmRecordSource, Array<{ time: string; count: number }>>>) => {
  const buckets = new Map<string, { time: string; count: number; bySource: Partial<Record<AlarmRecordSource, number>> }>()
  Object.entries(trends).forEach(([source, points]) => points?.forEach((point) => {
    const bucket = buckets.get(point.time) || { time: point.time, count: 0, bySource: {} }
    bucket.count += point.count
    bucket.bySource[source as AlarmRecordSource] = point.count
    buckets.set(point.time, bucket)
  }))
  return Array.from(buckets.values()).sort((left, right) => left.time.localeCompare(right.time))
}

const rankGroupColumns = (source: AlarmRecordSource, groupBy: AlarmRankGroup) => {
  if (groupBy === 'level') return [{ column: 'level', alias: 'key' }]
  if (source === 'iot' && groupBy === 'target') {
    return [{ column: 'targetId', alias: 'key' }, { column: 'targetName', alias: 'name' }]
  }
  if (source === 'vision' && groupBy === 'scene') return [{ column: 'bizType', alias: 'key' }]
  if (source === 'vision' && groupBy === 'algorithm') {
    return [{ column: 'bizId', alias: 'key' }, { column: 'bizType', alias: 'scene' }]
  }
  if (source === 'vision' && (groupBy === 'channel' || groupBy === 'target')) {
    return [{ column: 'sourceId', alias: 'key' }, { column: 'sourceName', alias: 'name' }]
  }
  throw inputError('ALARM_RANK_GROUP_UNSUPPORTED', 'rankGroupUnsupported', { source, groupBy })
}

export const alarmMetricsService = {
  overview: (args: Record<string, unknown>) => runAlarmTool<Record<string, unknown>>({}, async () => {
    const source = resolveAlarmSource(args.source)
    const range = resolveDomainAgentTimeRange(args)
    const state = resolveAlarmState(args.state)
    const [level, levels] = await Promise.all([resolveAlarmLevel(args.level), queryAlarmLevelOptions()])
    const loaded = await loadAlarmSources(source, item => querySourceOverview(item, range, state, level, levels))
    const data = mergeOverview(Object.values(loaded.data), levels)
    return createDomainAgentToolResult({
      domain: 'alarm',
      status: loaded.warnings.length ? 'partial' : data.total ? undefined : 'empty',
      timeRange: range,
      filters: { source, state, level: level?.level },
      summary: { total: data.total, open: data.open, handled: data.handled, handledRate: data.handledRate },
      data,
      total: data.total,
      cardinality: createDomainAgentRecordSetCardinality({ returnedCount: data.total }),
      warnings: loaded.warnings.length ? loaded.warnings : undefined,
      supportsAbsenceClaim: loaded.warnings.length === 0 && data.total === 0,
    })
  }),

  queryTrend: (args: Record<string, unknown>) => runAlarmTool<AggregationRow[]>([], async () => {
    const source = resolveAlarmSource(args.source)
    const range = resolveDomainAgentTimeRange(args)
    const state = resolveAlarmState(args.state)
    const level = await resolveAlarmLevel(args.level)
    const { interval, bucketCount } = resolveTrendInterval(args, range)
    const loaded = await loadAlarmSources(source, item => querySourceTrend(item, range, interval, state, level))
    const data = mergeTrend(loaded.data)
    const total = data.reduce((sum, item) => sum + item.count, 0)
    const peak = data.reduce<{ time?: string; count: number }>(
      (current, item) => item.count > current.count ? item : current,
      { count: 0 },
    )
    return createDomainAgentToolResult({
      domain: 'alarm',
      status: loaded.warnings.length ? 'partial' : data.length ? undefined : 'empty',
      timeRange: range,
      filters: { source, state, level: level?.level, interval },
      summary: { total, interval, bucketCount: data.length, requestedBucketCount: bucketCount, peak },
      data,
      cardinality: createDomainAgentAggregateCardinality({
        bucketCount: data.length,
        populatedBucketCount: data.length,
        measurementCount: data.length,
      }),
      warnings: loaded.warnings.length ? loaded.warnings : undefined,
      supportsAbsenceClaim: loaded.warnings.length === 0 && data.length === 0,
    })
  }),

  queryRank: (args: Record<string, unknown>) => runAlarmTool<AggregationRow[]>([], async () => {
    const source = resolveAlarmSource(args.source, { allowAll: false }) as AlarmRecordSource
    const range = resolveDomainAgentTimeRange(args)
    const groupBy = resolveDomainAgentEnum(args.groupBy, ALARM_RANK_GROUPS, { name: 'groupBy', defaultValue: 'target' })
    const limit = resolveDomainAgentInteger(args.limit, { name: 'limit', defaultValue: 10, min: 1, max: 20 })
    const levels = groupBy === 'level' ? await queryAlarmLevelOptions() : []
    const rows = unwrapAggregationRows(await aggregationRecord(resolveAlarmRecordTargetType(source), {
      columns: [{ column: 'id', alias: 'count', aggregation: 'COUNT' }],
      groupBy: rankGroupColumns(source, groupBy),
      filter: { terms: buildAlarmRecordTerms(range) },
    }))
    const data = rows.map(row => ({
      source: sourceValue(source),
      id: String(row.key || ''),
      name: groupBy === 'level'
        ? levelValue(toNumber(row.key), levels).text
        : String(row.name || row.key || ''),
      level: groupBy === 'level' ? levelValue(toNumber(row.key), levels) : undefined,
      sceneId: groupBy === 'algorithm' ? String(row.scene || '') : undefined,
      count: toNumber(row.count),
    })).filter(item => item.id).sort((left, right) => right.count - left.count).slice(0, limit)
    return createDomainAgentToolResult({
      domain: 'alarm',
      timeRange: range,
      filters: { source, groupBy, limit },
      summary: { source: sourceValue(source), groupBy, returned: data.length },
      data,
      total: data.length,
      cardinality: createDomainAgentRecordSetCardinality({ returnedCount: data.length }),
    })
  }),
}
