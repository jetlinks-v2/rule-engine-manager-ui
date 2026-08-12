import i18n from '@jetlinks-web-core/locales'
import {
  clientToolOutput,
  defineClientTool,
  defineClientTools,
  type CompiledClientTool,
  type ClientToolInput,
  type ClientToolConsumedResource,
  type ClientToolDescription,
  type ClientToolOutput,
} from '@jetlinks-web-core/layout/components/AiChat/clientToolApi'
import type { GeneralAgentContext } from '@jetlinks-web-core/layout/components/AiChat/generalAgentRuntime'
import {
  adaptDomainAgentClientToolResult,
  DOMAIN_AGENT_TIME_PRESETS,
  domainAgentDateTimeValueType,
  domainAgentEnumValueType,
  domainAgentIntegerValueType,
} from '@jetlinks-web-core/layout/components/AiChat/domainAgentTools'
import { alarmAnalysisService } from './alarmAnalysis.service'
import {
  ALARM_RANK_GROUPS,
  ALARM_RECORD_SOURCES,
  ALARM_RECORD_STATES,
  ALARM_SOURCES,
  ALARM_TREND_INTERVALS,
} from './constants'
import { visionScenesService } from './visionScenes.service'

const t = (key: string) => i18n.global.t(`AlarmGeneralAgent.${key}`)

const ALARM_TOOL_USAGE: Record<string, Omit<ClientToolDescription, 'text'>> = {
  alarm_search_vision_scenes: {
    capabilities: ['alarm.scene.discover'],
    intents: ['查找当前支持的视联告警场景', 'discover supported vision alarm scenes'],
  },
  alarm_get_overview: {
    capabilities: ['alarm.overview.aggregate'],
    intents: ['汇总告警总量和状态', 'aggregate alarm overview'],
    notFor: ['查询告警明细', 'read alarm records'],
  },
  alarm_query_records: {
    capabilities: ['alarm.records.read'],
    intents: ['查询符合条件的告警记录', 'read filtered alarm records'],
    notFor: ['统计告警趋势或排行', 'aggregate alarm trends or rankings'],
  },
  alarm_query_trend: {
    capabilities: ['alarm.trend.aggregate'],
    intents: ['分析告警时间趋势', 'aggregate alarm trend'],
    notFor: ['查询告警明细', 'read alarm records'],
  },
  alarm_query_rank: {
    capabilities: ['alarm.rank.aggregate'],
    intents: ['统计告警排名和分布', 'aggregate alarm ranking'],
    notFor: ['查询告警明细', 'read alarm records'],
  },
  alarm_get_record_detail: {
    capabilities: ['alarm.record.detail'],
    intents: ['读取一条已定位告警的详情', 'read a selected alarm detail'],
  },
  alarm_get_noise_summary: {
    capabilities: ['alarm.noise.aggregate'],
    intents: ['汇总告警噪声和复判情况', 'aggregate alarm noise summary'],
  },
  alarm_open_record: {
    capabilities: ['alarm.navigation.open'],
    intents: ['打开已定位的告警记录', 'open a selected alarm record'],
  },
}

// Consumer identity mirrors the producer descriptor so resource routing never guesses representation from the slot name.
const ALARM_SCENE_ID_CONSUMER: ClientToolConsumedResource = {
  name: 'alarm-scene-id',
  type: 'structured-data',
  mediaType: 'application/json',
  shape: 'alarm.scene-ids',
  required: false,
  sourcePolicy: 'EITHER',
}

const ALARM_RECORD_ID_CONSUMER: ClientToolConsumedResource = {
  name: 'alarm-record-id',
  type: 'structured-data',
  mediaType: 'application/json',
  shape: 'alarm.record-ids',
  required: false,
  sourcePolicy: 'EITHER',
}

const ALARM_TOOL_CONSUMES: Record<string, ClientToolConsumedResource[]> = {
  alarm_query_records: [ALARM_SCENE_ID_CONSUMER],
  alarm_query_trend: [ALARM_SCENE_ID_CONSUMER],
  alarm_get_record_detail: [ALARM_RECORD_ID_CONSUMER],
  alarm_get_noise_summary: [ALARM_SCENE_ID_CONSUMER],
  alarm_open_record: [ALARM_RECORD_ID_CONSUMER],
}

const selectData = (result: any) => result.data
const selectIds = (field: string) => (result: any) => (
  Array.isArray(result.data) ? result.data.map((item: any) => item?.[field]).filter(Boolean) : []
)

const alarmOutputs = (id: string): ClientToolOutput<any> | ClientToolOutput<any>[] => {
  if (id === 'alarm_search_vision_scenes') {
    return [
      clientToolOutput.lookup({ name: 'alarm-scene-id', shape: 'alarm.scene-ids', select: selectIds('sceneId') }),
      clientToolOutput.lookup({ name: 'alarm-scene-candidates', shape: 'schema.field-candidates', select: selectData }),
    ]
  }
  if (id === 'alarm_query_records') {
    return [
      clientToolOutput.lookup({ name: 'alarm-record-id', shape: 'alarm.record-ids', select: selectIds('id') }),
      clientToolOutput.recordSet({ name: 'alarm-records', shape: 'alarm.records', select: selectData }),
    ]
  }
  if (id === 'alarm_get_record_detail') {
    return clientToolOutput.detail({ name: 'alarm-record-detail', shape: 'alarm.detail', select: selectData })
  }
  if (id === 'alarm_query_trend') {
    return clientToolOutput.aggregateSeries({ name: 'alarm-trend-summary', shape: 'time-series.summary', select: selectData })
  }
  if (id === 'alarm_query_rank') {
    return clientToolOutput.aggregateSeries({ name: 'alarm-rank-summary', shape: 'tabular.summary', select: selectData })
  }
  if (id === 'alarm_get_noise_summary') {
    return clientToolOutput.aggregateSeries({ name: 'alarm-noise-summary', shape: 'tabular.summary', select: selectData })
  }
  return clientToolOutput.aggregateSeries({ name: 'alarm-overview-summary', shape: 'tabular.summary', select: selectData })
}

const input = (
  id: string,
  valueType: NonNullable<ClientToolInput['valueType']> = 'string',
  required = false,
): ClientToolInput => ({
  id,
  name: id,
  description: t(`inputs.${id}`),
  required,
  valueType,
})

const readTool = (
  id: string,
  inputs: ClientToolInput[],
  execute: CompiledClientTool<GeneralAgentContext>['execute'],
): CompiledClientTool<GeneralAgentContext> => defineClientTool<Record<string, any>, GeneralAgentContext, any>({
  id,
  description: {
    text: t(`tools.${id}.description`),
    ...ALARM_TOOL_USAGE[id],
  },
  presentation: {
    displayName: t(`tools.${id}.name`),
    progressText: t(`tools.${id}.progress`),
  },
  inputs,
  consumes: ALARM_TOOL_CONSUMES[id],
  effect: { kind: 'READ' },
  output: alarmOutputs(id),
  owner: { module: 'rule-engine-manager-ui', group: 'alarm' },
  execute: async (args, context, call) => adaptDomainAgentClientToolResult(
    await execute(args, context, call) as any,
  ),
})

const timeInputs = () => [
  input('timeRange', domainAgentEnumValueType(DOMAIN_AGENT_TIME_PRESETS), true),
  input('startTime', domainAgentDateTimeValueType()),
  input('endTime', domainAgentDateTimeValueType()),
]

export const createAlarmAnalysisTools = () => defineClientTools<GeneralAgentContext>([
  readTool('alarm_search_vision_scenes', [
    input('query'), input('limit', domainAgentIntegerValueType(1, 20)),
  ], visionScenesService.search),
  readTool('alarm_get_overview', [
    input('source', domainAgentEnumValueType(ALARM_SOURCES)),
    ...timeInputs(), input('level'), input('state', domainAgentEnumValueType(ALARM_RECORD_STATES)),
  ], alarmAnalysisService.overview),
  readTool('alarm_query_records', [
    input('source', domainAgentEnumValueType(ALARM_SOURCES)),
    ...timeInputs(), input('level'), input('state', domainAgentEnumValueType(ALARM_RECORD_STATES)), input('keyword'),
    input('sceneId'), input('algorithmId'), input('spaceId'),
    input('pageIndex', domainAgentIntegerValueType(0, 10000)), input('pageSize', domainAgentIntegerValueType(1, 50)),
  ], alarmAnalysisService.queryRecords),
  readTool('alarm_query_trend', [
    input('source', domainAgentEnumValueType(ALARM_SOURCES)),
    ...timeInputs(), input('interval', domainAgentEnumValueType(ALARM_TREND_INTERVALS)), input('level'),
    input('state', domainAgentEnumValueType(ALARM_RECORD_STATES)),
  ], alarmAnalysisService.queryTrend),
  readTool('alarm_query_rank', [
    input('source', domainAgentEnumValueType(ALARM_RECORD_SOURCES), true),
    ...timeInputs(), input('groupBy', domainAgentEnumValueType(ALARM_RANK_GROUPS)), input('limit', domainAgentIntegerValueType(1, 20)),
  ], alarmAnalysisService.queryRank),
  readTool('alarm_get_record_detail', [
    input('source', domainAgentEnumValueType(ALARM_RECORD_SOURCES), true),
    input('alarmRecordId', 'string', true),
  ], alarmAnalysisService.getRecordDetail),
  readTool('alarm_get_noise_summary', [
    ...timeInputs(), input('sceneId'), input('spaceId'),
  ], alarmAnalysisService.getNoiseSummary),
  defineClientTool<Record<string, any>, GeneralAgentContext, any>({
    id: 'alarm_open_record',
    description: {
      text: t('tools.alarm_open_record.description'),
      ...ALARM_TOOL_USAGE.alarm_open_record,
    },
    presentation: {
      displayName: t('tools.alarm_open_record.name'),
      progressText: t('tools.alarm_open_record.progress'),
    },
    inputs: [
      input('source', domainAgentEnumValueType(ALARM_RECORD_SOURCES), true),
      input('alarmRecordId', 'string', true),
    ],
    consumes: ALARM_TOOL_CONSUMES.alarm_open_record,
    effect: {
      kind: 'EXTERNAL_ACTION',
      idempotency: 'IDEMPOTENT',
      reversible: true,
      confirmation: {
        title: t('tools.alarm_open_record.confirmTitle'),
        content: args => i18n.global.t('AlarmGeneralAgent.tools.alarm_open_record.confirmContent', [String(args.alarmRecordId || '')]),
        okText: t('tools.alarm_open_record.okText'),
        cancelText: i18n.global.t('verify.cancel'),
      },
    },
    output: clientToolOutput.stateChange({
      name: 'navigation-receipt',
      shape: 'navigation.receipt',
      transition: 'NAVIGATION',
      select: selectData,
    }),
    owner: { module: 'rule-engine-manager-ui', group: 'alarm' },
    execute: alarmAnalysisService.openRecord,
  }),
])
