import i18n from '@jetlinks-web-core/locales'
import {
  consumeControlledEntryContext,
  saveControlledEntryContext,
} from '@jetlinks-web-core/layout/components/AiChat/controlledEntryContext'
import {
  createDomainAgentRecordSetCardinality,
  createDomainAgentToolResult,
  resolveDomainAgentInteger,
  resolveDomainAgentTimeRange,
} from '@jetlinks-web-core/layout/components/AiChat/domainAgentTools'
import type { GeneralAgentContext } from '@jetlinks-web-core/layout/components/AiChat/generalAgentRuntime'
import { getProjectIdFromLocation } from '@jetlinks-web-core/utils/project-runtime'
import {
  queryAlarmEvents,
  queryAlarmHandleHistoryPage,
  queryLatestAlarmHistoryEvent,
  querySpaceBoundChannelIds,
} from './alarmData.service'
import type { AlarmEventItem, AlarmEventPage } from './alarmData.types'
import {
  ALARM_MENU_ANCHORS,
  ALARM_RECORD_ENTRY_NAMESPACE,
} from './constants'
import {
  alarmEventTimestamp,
  inputError,
  loadAlarmSources,
  normalizeText,
  resolveAlarmLevel,
  resolveAlarmRecord,
  resolveAlarmSource,
  resolveAlarmState,
  runAlarmTool,
  safeAlarmRecord,
  sourceValue,
  toBackendState,
  type AlarmRecordSource,
} from './alarmAnalysis.shared'

export interface AlarmRecordEntryContext {
  alarmRecordId: string
  source: AlarmRecordSource
}

const getProjectScope = () => `project:${getProjectIdFromLocation()}`

const findEventsMenu = (context: GeneralAgentContext) => (
  ALARM_MENU_ANCHORS.events.map(anchor => context.findMenu(anchor)).find(Boolean)
)

const resolveVisionFilters = async (
  source: AlarmRecordSource,
  args: Record<string, unknown>,
) => {
  const sceneId = normalizeText(args.sceneId)
  const algorithmId = normalizeText(args.algorithmId)
  const spaceId = normalizeText(args.spaceId)
  if (source === 'iot' && (sceneId || algorithmId || spaceId)) {
    throw inputError('ALARM_SOURCE_FILTER_UNSUPPORTED', 'sourceFilterUnsupported', { source })
  }
  if (algorithmId && !sceneId) {
    throw inputError('ALARM_SCENE_REQUIRED', 'sceneRequiredForAlgorithm')
  }
  const sourceIds = spaceId ? await querySpaceBoundChannelIds([spaceId]) : undefined
  return { sceneId, algorithmId, spaceId, sourceIds }
}

const querySourceRecords = async (
  source: AlarmRecordSource,
  args: Record<string, unknown>,
  range: ReturnType<typeof resolveDomainAgentTimeRange>,
  pageIndex: number,
  pageSize: number,
): Promise<AlarmEventPage> => {
  const state = resolveAlarmState(args.state)
  const level = await resolveAlarmLevel(args.level)
  const filters = await resolveVisionFilters(source, args)
  if (filters.spaceId && !filters.sourceIds?.length) return { data: [], total: 0 }
  return queryAlarmEvents(source, {
    sourceIds: filters.sourceIds,
    sceneId: filters.sceneId || undefined,
    algorithmId: filters.algorithmId || undefined,
    level: level?.level,
    state: toBackendState(state),
    searchKeyword: normalizeText(args.keyword),
    timestampRange: [range.start, range.end],
    pageIndex,
    pageSize,
  })
}

const mergePages = (pages: Partial<Record<AlarmRecordSource, AlarmEventPage>>, pageSize: number) => {
  const records = Object.values(pages).flatMap(page => page?.data || [])
    .sort((left, right) => alarmEventTimestamp(right) - alarmEventTimestamp(left))
    .slice(0, pageSize)
  return {
    records,
    total: Object.values(pages).reduce((sum, page) => sum + (page?.total || 0), 0),
  }
}

export const alarmRecordsService = {
  queryRecords: (args: Record<string, unknown>) => runAlarmTool<ReturnType<typeof safeAlarmRecord>[]>([], async () => {
    const source = resolveAlarmSource(args.source)
    const range = resolveDomainAgentTimeRange(args)
    const pageIndex = resolveDomainAgentInteger(args.pageIndex, { name: 'pageIndex', defaultValue: 0, min: 0, max: 10000 })
    const pageSize = resolveDomainAgentInteger(args.pageSize, { name: 'pageSize', defaultValue: 20, min: 1, max: 50 })
    if (source === 'all' && pageIndex > 0) {
      throw inputError('ALARM_ALL_SOURCE_PAGE_UNSUPPORTED', 'allSourcePageUnsupported')
    }
    if (source === 'all' && [args.sceneId, args.algorithmId, args.spaceId].some(normalizeText)) {
      throw inputError('ALARM_ALL_SOURCE_FILTER_UNSUPPORTED', 'allSourceFilterUnsupported')
    }
    const loaded = await loadAlarmSources(
      source,
      item => querySourceRecords(item, args, range, source === 'all' ? 0 : pageIndex, pageSize),
    )
    const merged = mergePages(loaded.data, pageSize)
    const data = merged.records.map(safeAlarmRecord)
    const warnings = [
      ...loaded.warnings,
      ...(source === 'all' && merged.total > data.length
        ? [i18n.global.t('AlarmGeneralAgent.warnings.allSourcePagination')]
        : []),
    ]
    const hasNext = source !== 'all' && (pageIndex + 1) * pageSize < merged.total
    return createDomainAgentToolResult({
      domain: 'alarm',
      status: loaded.warnings.length ? 'partial' : data.length ? undefined : 'empty',
      timeRange: range,
      filters: {
        source,
        state: args.state,
        level: args.level,
        sceneId: args.sceneId,
        algorithmId: args.algorithmId,
        spaceId: args.spaceId,
        keyword: args.keyword,
      },
      summary: { returned: data.length, total: merged.total },
      data,
      total: merged.total,
      cardinality: createDomainAgentRecordSetCardinality({
        returnedCount: data.length,
        totalCount: merged.total,
      }),
      truncated: merged.total > data.length,
      nextPage: hasNext ? pageIndex + 1 : undefined,
      warnings: warnings.length ? warnings : undefined,
      supportsAbsenceClaim: warnings.length === 0 && merged.total === 0,
    })
  }),

  getRecordDetail: (args: Record<string, unknown>) => runAlarmTool<Record<string, unknown>>({}, async () => {
    const source = resolveAlarmSource(args.source, { allowAll: false }) as AlarmRecordSource
    const recordId = normalizeText(args.alarmRecordId)
    if (!recordId) throw inputError('ALARM_RECORD_ID_REQUIRED', 'recordIdRequired')
    const record = await resolveAlarmRecord(source, recordId)
    const [latestResult, handlingResult] = await Promise.allSettled([
      queryLatestAlarmHistoryEvent(record),
      queryAlarmHandleHistoryPage(record, 0, 5),
    ])
    const latest = latestResult.status === 'fulfilled' ? latestResult.value : undefined
    const handling = handlingResult.status === 'fulfilled' ? handlingResult.value : undefined
    const warnings = [
      ...(latestResult.status === 'rejected' ? [i18n.global.t('AlarmGeneralAgent.warnings.historyUnavailable')] : []),
      ...(handlingResult.status === 'rejected' ? [i18n.global.t('AlarmGeneralAgent.warnings.handleHistoryUnavailable')] : []),
    ]
    const data = {
      record: safeAlarmRecord(latest ? { ...record, ...latest } : record),
      recentHandling: (handling?.data || []).map(item => ({
        alarmTime: item.alarmTime,
        handleTime: item.handleTime,
        state: item.state,
        stateText: item.stateText,
        handleType: item.handleType,
        handleResult: item.handleResult,
      })),
    }
    return createDomainAgentToolResult({
      domain: 'alarm',
      status: warnings.length ? 'partial' : undefined,
      summary: { source: sourceValue(source), alarmRecordId: recordId, handlingCount: handling?.total || 0 },
      data,
      warnings: warnings.length ? warnings : undefined,
    })
  }),

  openRecord: (args: Record<string, unknown>, context: GeneralAgentContext) => runAlarmTool<Record<string, unknown>>({}, async () => {
    const source = resolveAlarmSource(args.source, { allowAll: false }) as AlarmRecordSource
    const recordId = normalizeText(args.alarmRecordId)
    if (!recordId) throw inputError('ALARM_RECORD_ID_REQUIRED', 'recordIdRequired')
    const record = await resolveAlarmRecord(source, recordId)
    const menu = findEventsMenu(context)
    if (!menu) throw inputError('ALARM_MENU_FORBIDDEN', 'menuForbidden')
    const entryKey = saveControlledEntryContext<AlarmRecordEntryContext>({
      namespace: ALARM_RECORD_ENTRY_NAMESPACE,
      scope: getProjectScope(),
      target: menu.code,
      context: { alarmRecordId: record.id, source },
    })
    const opened = context.navigateToMenu(menu.code, { query: { agentEntry: entryKey } })
    return createDomainAgentToolResult({
      domain: 'alarm',
      summary: { opened, source: sourceValue(source), alarmRecordId: record.id, alarmName: record.algo },
      data: { opened, menuCode: menu.code, record: safeAlarmRecord(record) },
    })
  }),
}

export const consumeAlarmRecordEntryContext = (entryKey: string, menuCode: string) => {
  for (const target of [menuCode, ...ALARM_MENU_ANCHORS.events]) {
    const record = consumeControlledEntryContext<AlarmRecordEntryContext>(entryKey, {
      namespace: ALARM_RECORD_ENTRY_NAMESPACE,
      scope: getProjectScope(),
      target,
    })
    if (record) return record.context
  }
  return undefined
}
