import i18n from '@jetlinks-web-core/locales';
import type { HomeAgentCapabilityContext } from '@jetlinks-web-core/layout/components/AiChat/homeAgentCapabilities';
import {
  clientToolOutput,
  clientToolResult,
  defineClientTool,
  defineClientToolAnalyticalProducer,
  defineClientToolBoundedAnalyticalProducer,
  defineClientTools,
  type ClientToolAnalyticalAuthoring,
  type ClientToolAnalyticalSemanticIntentBindingDefinition,
  type ClientToolDefinition,
  type ClientToolInput,
  type ClientToolOutput,
} from '@jetlinks-web-core/layout/components/AiChat/clientToolApi';
import {
  DomainAgentInputError,
  createDomainAgentTimeScopeContract,
  domainAgentIntegerValueType,
  resolveDomainAgentTimeRange,
} from '@jetlinks-web-core/layout/components/AiChat/domainAgentTools';
import {
  dashboard,
  getAlarm,
  getAlarmConfigCount,
  getAlarmLevel,
  type DashboardMeasurementRequest,
} from '@rule-engine-manager-ui/api/dashboard';
import { getTargetTypes } from '@rule-engine-manager-ui/api/configuration';
import {
  createBoundedQueryEvidence,
  formatLocalDateTime,
} from '../../agentCapabilities/alarmAnalysis/alarmAnalysis.shared';
import { metricInputs, recordInputs } from './homeAgentToolInputs';

export const ALARM_DASHBOARD_OVERVIEW_TOOL = 'alarm_dashboard_get_overview';
export const ALARM_DASHBOARD_TARGET_TYPES_TOOL = 'alarm_dashboard_get_target_types';
export const ALARM_DASHBOARD_CONFIG_STATS_TOOL = 'alarm_dashboard_get_config_stats';
export const ALARM_DASHBOARD_RECORDS_TOOL = 'alarm_dashboard_query_records';
export const ALARM_DASHBOARD_TREND_TOOL = 'alarm_dashboard_query_trend';
export const ALARM_DASHBOARD_RANK_TOOL = 'alarm_dashboard_query_rank';

type ApiResponse<T> = { status?: number; success?: boolean; result?: T; message?: string };
type DashboardResponseItem = { group?: string; data?: Record<string, any> };
type ToolArgs = Record<string, any>;

const t = (key: string, args?: unknown[]) => i18n.global.t(key, args as any);

const DEFAULT_TREND_PARAMS = {
  time: '1h',
  format: 'yyyy-MM-dd HH:mm:ss',
  limit: 24,
};

const DEFAULT_RANK_PARAMS = {
  group: 'targetId',
  order: 'desc',
  limit: 10,
};

const toDashboardFailure = (error: unknown) => {
  if (error instanceof DomainAgentInputError) {
    return clientToolResult.failure({
      code: error.code,
      message: error.message,
      failureDisposition: error.failureDisposition,
      recoveryAction: error.recoveryAction,
      retryable: error.retryable,
      repair: error.repair,
    });
  }
  return clientToolResult.failure({
    code: 'alarm_dashboard.request_failed',
    message: error instanceof Error && error.message ? error.message : 'alarm dashboard request failed',
    failureDisposition: 'dependency',
    recoveryAction: 'retry',
    retryable: true,
  });
};

const runDashboardTool = async <T>(action: () => Promise<T>) => {
  try {
    return await action();
  } catch (error) {
    return toDashboardFailure(error);
  }
};

const ensureSuccess = <T>(response: ApiResponse<T> | undefined): T => {
  if (response?.status !== 200 && response?.success !== true) {
    throw new Error(response?.message || 'alarm dashboard request failed');
  }
  return (response.result ?? null) as T;
};

const toNumber = (value: unknown) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const normalizeText = (value: unknown) => String(value || '').trim();

const clampLimit = (value: unknown, defaultValue: number, max = 100) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return defaultValue;
  }
  return Math.min(max, Math.max(1, Math.floor(numberValue)));
};

const dashboardTimeScope = () => createDomainAgentTimeScopeContract({
  timeRange: t('DashBoard.homeAgent.tool.timeRange.preset'),
  startTime: t('DashBoard.homeAgent.tool.timeRange.startTime'),
  endTime: t('DashBoard.homeAgent.tool.timeRange.endTime'),
});

const pickMetricParams = (args: ToolArgs, defaults: Record<string, any>) => {
  const range = resolveDomainAgentTimeRange(args);
  const params: Record<string, any> = {
    ...defaults,
    from: formatLocalDateTime(range.start),
    to: formatLocalDateTime(range.end),
    time: args.time || args.interval || defaults.time,
    format: args.format || defaults.format,
    limit: clampLimit(args.limit, defaults.limit || 10),
    targetType: normalizeText(args.targetType) || undefined,
    targetId: normalizeText(args.targetId) || undefined,
    alarmConfigId: normalizeText(args.alarmConfigId) || undefined,
  };

  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== ''));
};

const createRequest = (
  measurement: 'trend' | 'rank',
  group: string,
  params: Record<string, any>,
): DashboardMeasurementRequest => ({
  dashboard: 'alarm',
  object: 'record',
  measurement,
  dimension: 'agg',
  group,
  params,
});

const getDashboardItems = async (request: DashboardMeasurementRequest) => {
  const response = await dashboard([request]) as ApiResponse<DashboardResponseItem[]>;
  return ensureSuccess<DashboardResponseItem[]>(response);
};

const toTrendSeries = (items: DashboardResponseItem[], group: string) => items
  .filter((item) => item.group === group)
  .map((item) => ({
    time: item.data?.timeString,
    value: toNumber(item.data?.value),
    timestamp: toNumber(item.data?.timestamp),
  }))
  .reverse();

const summarizeSeries = (series: Array<{ time?: string; value: number }>) => {
  const total = series.reduce((sum, item) => sum + item.value, 0);
  const peak = series.reduce((max, item) => (item.value > max.value ? item : max), { time: '', value: 0 });
  const latest = series[series.length - 1] || { time: '', value: 0 };
  return {
    total,
    peak,
    latest,
    average: series.length ? Number((total / series.length).toFixed(2)) : 0,
  };
};

const toRankItems = (items: DashboardResponseItem[], group: string) => items
  .filter((item) => item.group === group)
  .map((item) => item.data?.value)
  .filter(Boolean)
  .map((item) => ({
    targetId: normalizeText(item.targetId),
    targetName: normalizeText(item.targetName || item.targetId),
    count: toNumber(item.count),
  }));

const queryAlarmTrend = async (args: ToolArgs = {}) => {
  const params = pickMetricParams(args, DEFAULT_TREND_PARAMS);
  const items = await getDashboardItems(createRequest('trend', 'alarmTrend', params));
  const series = toTrendSeries(items, 'alarmTrend');
  const summary = summarizeSeries(series);
  return {
    ok: true,
    params,
    peak: summary.peak,
    latest: summary.latest,
    average: summary.average,
    series,
    summary: t('DashBoard.homeAgent.tool.trend.summary', [
      params.from,
      params.to,
      summary.total,
      summary.peak.time || '-',
      summary.peak.value,
      summary.average,
    ]),
  };
};

const queryAlarmRank = async (args: ToolArgs = {}) => {
  const params = {
    ...pickMetricParams(args, DEFAULT_RANK_PARAMS),
    group: normalizeText(args.group || args.groupBy || DEFAULT_RANK_PARAMS.group),
    order: normalizeText(args.order || DEFAULT_RANK_PARAMS.order).toLowerCase() === 'asc' ? 'asc' : 'desc',
  };
  const items = await getDashboardItems(createRequest('rank', 'alarmRank', params));
  const ranking = toRankItems(items, 'alarmRank');
  const top = ranking[0];
  return {
    ok: true,
    params,
    top,
    items: ranking,
    summary: t('DashBoard.homeAgent.tool.rank.summary', [
      params.from,
      params.to,
      top?.targetName || '-',
      top?.count || 0,
      ranking.length,
    ]),
  };
};

const getConfigStats = async () => {
  const [total, enabled, disabled] = await Promise.all([
    getAlarmConfigCount({}),
    getAlarmConfigCount({ terms: [{ column: 'state', value: 'enabled' }] }),
    getAlarmConfigCount({ terms: [{ column: 'state', value: 'disabled' }] }),
  ]);
  return {
    ok: true,
    total: toNumber(ensureSuccess<number>(total)),
    enabled: toNumber(ensureSuccess<number>(enabled)),
    disabled: toNumber(ensureSuccess<number>(disabled)),
  };
};

const getTargetTypeOptions = async () => {
  const response = await getTargetTypes() as ApiResponse<Array<Record<string, any>>>;
  const items = ensureSuccess<Array<Record<string, any>>>(response).map((item) => ({
    id: normalizeText(item.id),
    name: normalizeText(item.name),
    supportTriggers: item.supportTriggers || [],
  }));
  return { ok: true, items };
};

const queryAlarmRecords = async (args: ToolArgs = {}) => {
  const limit = clampLimit(args.limit || args.pageSize, 10, 50);
  const range = resolveDomainAgentTimeRange(args);
  const rawTimeColumn = normalizeText(args.timeColumn);
  const timeColumn = ['alarmTime', 'lastAlarmTime'].includes(rawTimeColumn) ? rawTimeColumn : 'lastAlarmTime';
  const filters = [
    { column: 'state', value: normalizeText(args.state || 'warning') || undefined },
    { column: 'targetType', value: normalizeText(args.targetType) || undefined },
    { column: 'targetId', value: normalizeText(args.targetId) || undefined },
    { column: 'alarmConfigId', value: normalizeText(args.alarmConfigId) || undefined },
  ].filter((item) => item.value);
  const terms: Record<string, any>[] = filters.length
    ? [{ terms: filters.map((item) => ({ ...item, termType: 'eq' })) }]
    : [];
  terms.push({
    column: timeColumn,
    termType: 'btw',
    value: [range.start, range.end],
  });
  const [levelsResponse, recordsResponse] = await Promise.all([
    getAlarmLevel().catch(() => undefined),
    getAlarm({
      pageIndex: 0,
      pageSize: limit,
      sorts: [{ name: 'lastAlarmTime', order: 'desc' }],
      terms,
    }),
  ]);
  const levels = (levelsResponse && ensureSuccess<Record<string, any>>(levelsResponse)?.levels) || [];
  const records = ensureSuccess<{ data?: Array<Record<string, any>>; total?: number }>(recordsResponse);
  const data = (records.data || []).map((item) => ({
    id: item.id,
    alarmName: item.alarmName,
    targetId: item.targetId,
    targetName: item.targetName,
    targetType: item.targetType,
    state: item.state,
    level: item.level,
    levelName: levels.find((level: any) => level.level === item.level)?.title,
    alarmTime: item.alarmTime,
    lastAlarmTime: item.lastAlarmTime,
  }));
  return {
    ok: true,
    timeRange: { column: timeColumn, from: range.start, to: range.end },
    items: data,
    summary: t('DashBoard.homeAgent.tool.records.summary', [toNumber(records.total), data.length]),
  };
};

const getOverview = async (args: ToolArgs = {}) => {
  const [config, trend, rank, records, targetTypes] = await Promise.all([
    getConfigStats(),
    queryAlarmTrend(args),
    queryAlarmRank(args),
    queryAlarmRecords({ ...args, limit: args.recordsLimit || 10 }),
    getTargetTypeOptions(),
  ]);
  return {
    ok: true,
    config,
    trend,
    rank,
    records,
    targetTypes,
    series: trend.series,
    summary: t('DashBoard.homeAgent.tool.overview.summary', [
      trend.params.from,
      trend.params.to,
      summarizeSeries(trend.series).total,
      rank.top?.targetName || '-',
      rank.top?.count || 0,
      records.items.length,
    ]),
  };
};

const bindDashboardIntents = (
  intents: readonly string[],
  criterion: string,
  measures: readonly string[],
  dimensions: readonly string[],
): readonly [
  ClientToolAnalyticalSemanticIntentBindingDefinition,
  ...ClientToolAnalyticalSemanticIntentBindingDefinition[],
] => intents.map(intent => ({
  intent,
  criterion,
  measures: [...measures] as [string, ...string[]],
  dimensions: [...dimensions] as [string, ...string[]],
})) as unknown as [
  ClientToolAnalyticalSemanticIntentBindingDefinition,
  ...ClientToolAnalyticalSemanticIntentBindingDefinition[],
];

const DASHBOARD_TREND_FIELDS = [
  {
    name: 'timestamp',
    type: 'timestamp' as const,
    role: 'temporal_dimension' as const,
    axis: 'time',
    encoding: 'epoch-millis' as const,
    label: t('DashBoard.homeAgent.fields.time'),
  },
  { name: 'time', type: 'string' as const, role: 'label' as const, label: t('DashBoard.homeAgent.fields.time') },
  {
    name: 'value',
    type: 'integer' as const,
    role: 'measure' as const,
    label: t('DashBoard.homeAgent.fields.alarmCount'),
    format: 'integer' as const,
    measure: 'alarm_count',
    unit: 'count',
    aggregation: 'count' as const,
  },
];

const DASHBOARD_RANK_FIELDS = [
  { name: 'targetId', type: 'string' as const, role: 'dimension' as const, label: t('DashBoard.homeAgent.fields.targetId') },
  { name: 'targetName', type: 'string' as const, role: 'label' as const, label: t('DashBoard.homeAgent.fields.targetName') },
  {
    name: 'count',
    type: 'integer' as const,
    role: 'measure' as const,
    label: t('DashBoard.homeAgent.fields.alarmCount'),
    format: 'integer' as const,
    measure: 'alarm_count',
    unit: 'count',
    aggregation: 'count' as const,
  },
];

const DASHBOARD_TREND_CAPABILITY = defineClientToolAnalyticalProducer<Record<string, any>>({
  producerKey: 'alarm.dashboard.trend',
  factKey: 'alarm.records',
  subjects: ['alarm'],
  measures: [{ name: 'alarm_count', aggregations: ['count'], units: ['count'] }],
  dimensions: ['time'],
  filters: [],
  grains: [],
  criteria: ['trend'],
  semanticIntentBindings: bindDashboardIntents(
    [t('DashBoard.homeAgent.tool.trend.description')],
    'trend',
    ['alarm_count'],
    ['time'],
  ),
  ordering: [{ axis: 'timestamp', direction: 'asc' }],
  coverage: 'complete-or-partial',
  output: 'alarm-dashboard-trend',
});

const DASHBOARD_OVERVIEW_CAPABILITY = defineClientToolAnalyticalProducer<Record<string, any>>({
  producerKey: 'alarm.dashboard.overview',
  factKey: 'alarm.records',
  subjects: ['alarm'],
  measures: [{ name: 'alarm_count', aggregations: ['count'], units: ['count'] }],
  dimensions: ['time'],
  filters: [],
  grains: [],
  criteria: ['summary'],
  semanticIntentBindings: bindDashboardIntents(
    [t('DashBoard.homeAgent.tool.overview.description')],
    'summary',
    ['alarm_count'],
    ['time'],
  ),
  ordering: [{ axis: 'timestamp', direction: 'asc' }],
  coverage: 'complete-or-partial',
  output: 'alarm-dashboard-overview',
});

const DASHBOARD_RANK_CAPABILITY = defineClientToolBoundedAnalyticalProducer<Record<string, any>>({
  producerKey: 'alarm.dashboard.rank',
  factKey: 'alarm.records',
  subjects: ['alarm'],
  measures: [{ name: 'alarm_count', aggregations: ['count'], units: ['count'] }],
  dimensions: ['target'],
  filters: [],
  grains: [],
  criterion: {
    name: 'rank',
    measure: 'alarm_count',
    direction: 'desc',
    valueField: 'count',
    coordinateField: 'targetId',
    axis: 'target',
  },
  semanticIntentBindings: bindDashboardIntents(
    [t('DashBoard.homeAgent.tool.rank.description')],
    'rank',
    ['alarm_count'],
    ['target'],
  ),
  boundedBy: 'limit',
  output: 'alarm-dashboard-rank',
});

const defineDashboardTool = (
  definition: ClientToolDefinition<Record<string, any>, HomeAgentCapabilityContext, any>,
) => defineClientTool(definition);

const metricFilterInputs = (): ClientToolInput[] => (
  metricInputs().filter((item) => !['from', 'to'].includes(item.id))
);

const recordFilterInputs = (): ClientToolInput[] => (
  recordInputs().filter((item) => !['from', 'to', 'timeRange'].includes(item.id))
);

const readDashboardTool = (
  id: string,
  extraInputs: ClientToolInput[],
  output: ClientToolOutput<any> | ClientToolOutput<any>[],
  execute: (args: ToolArgs) => Promise<unknown>,
  options: {
    capabilities: [string, ...string[]];
    intents?: string[];
    notFor?: string[];
    timeScoped?: boolean;
    analytical?: ClientToolAnalyticalAuthoring<Record<string, any>>;
  },
) => {
  const contract = options.timeScoped ? dashboardTimeScope() : undefined;
  return defineDashboardTool({
    id,
    description: {
      text: t(`DashBoard.homeAgent.tool.${toolLocaleKey(id)}.description`),
      capabilities: options.capabilities,
      ...(options.intents?.length ? { intents: options.intents } : {}),
      ...(options.notFor?.length ? { notFor: options.notFor } : {}),
      help: t(`DashBoard.homeAgent.tool.${toolLocaleKey(id)}.help`),
    },
    presentation: {
      displayName: t(`DashBoard.homeAgent.tool.${toolLocaleKey(id)}.displayName`),
      progressText: t(`DashBoard.homeAgent.tool.${toolLocaleKey(id)}.progressText`),
    },
    inputs: [...extraInputs, ...(contract?.inputs || [])],
    inputAlternatives: contract?.inputAlternatives,
    ...(contract ? { temporal: contract.temporal } : {}),
    ...(options.analytical ? { analytical: options.analytical } : {}),
    effect: { kind: 'READ' },
    output,
    owner: { module: 'rule-engine-manager-ui', group: 'alarm-dashboard' },
    execute: (args) => runDashboardTool(() => execute(args)),
  });
};

const toolLocaleKey = (id: string) => ({
  [ALARM_DASHBOARD_OVERVIEW_TOOL]: 'overview',
  [ALARM_DASHBOARD_TARGET_TYPES_TOOL]: 'targetTypes',
  [ALARM_DASHBOARD_CONFIG_STATS_TOOL]: 'configStats',
  [ALARM_DASHBOARD_RECORDS_TOOL]: 'records',
  [ALARM_DASHBOARD_TREND_TOOL]: 'trend',
  [ALARM_DASHBOARD_RANK_TOOL]: 'rank',
}[id] || id);

export const createAlarmDashboardTools = () => defineClientTools<HomeAgentCapabilityContext>([
  readDashboardTool(
    ALARM_DASHBOARD_OVERVIEW_TOOL,
    [
      ...metricFilterInputs(),
      { id: 'recordsLimit', name: 'recordsLimit', description: t('DashBoard.homeAgent.tool.records.limit'), required: false, valueType: 'number' },
    ],
    clientToolOutput.aggregateSeries({
      name: 'alarm-dashboard-overview',
      shape: 'time-series.summary',
      select: (result: any) => result.series,
      recordPath: '$',
      fields: DASHBOARD_TREND_FIELDS,
      ordering: { keys: [{ field: 'timestamp', direction: 'asc' }], producerGuaranteed: true },
    }),
    getOverview,
    {
      capabilities: ['alarm.dashboard.overview.aggregate'],
      intents: [t('DashBoard.homeAgent.tool.overview.description')],
      timeScoped: true,
      analytical: DASHBOARD_OVERVIEW_CAPABILITY,
    },
  ),
  readDashboardTool(
    ALARM_DASHBOARD_TARGET_TYPES_TOOL,
    [],
    [
      clientToolOutput.lookup({
        name: 'alarm-dashboard-target-type-id',
        shape: 'alarm.target-type-ids',
        select: (result: any) => (Array.isArray(result.items) ? result.items.map((item: any) => item?.id).filter(Boolean) : []),
      }),
      clientToolOutput.recordSet({
        name: 'alarm-dashboard-target-types',
        shape: 'alarm.target-types',
        select: (result: any) => result.items,
      }),
    ],
    getTargetTypeOptions,
    { capabilities: ['alarm.dashboard.target-type.lookup'] },
  ),
  readDashboardTool(
    ALARM_DASHBOARD_CONFIG_STATS_TOOL,
    [],
    clientToolOutput.detail({
      name: 'alarm-dashboard-config-stats',
      shape: 'alarm.config-stats',
    }),
    getConfigStats,
    { capabilities: ['alarm.dashboard.config.aggregate'] },
  ),
  readDashboardTool(
    ALARM_DASHBOARD_RECORDS_TOOL,
    recordFilterInputs(),
    [
      clientToolOutput.lookup({
        name: 'alarm-dashboard-record-id',
        shape: 'alarm.record-ids',
        select: (result: any) => (Array.isArray(result.items) ? result.items.map((item: any) => item?.id).filter(Boolean) : []),
      }),
      clientToolOutput.recordSet({
        name: 'alarm-dashboard-records',
        shape: 'alarm.records',
        select: (result: any) => result.items,
      }),
    ],
    queryAlarmRecords,
    {
      capabilities: ['alarm.dashboard.records.read'],
      notFor: [t('DashBoard.homeAgent.tool.trend.description')],
      timeScoped: true,
    },
  ),
  readDashboardTool(
    ALARM_DASHBOARD_TREND_TOOL,
    metricFilterInputs(),
    clientToolOutput.aggregateSeries({
      name: 'alarm-dashboard-trend',
      shape: 'time-series.summary',
      select: (result: any) => result.series,
      recordPath: '$',
      fields: DASHBOARD_TREND_FIELDS,
      ordering: { keys: [{ field: 'timestamp', direction: 'asc' }], producerGuaranteed: true },
    }),
    queryAlarmTrend,
    {
      capabilities: ['alarm.dashboard.trend.aggregate'],
      intents: [t('DashBoard.homeAgent.tool.trend.description')],
      notFor: [t('DashBoard.homeAgent.tool.records.description')],
      timeScoped: true,
      analytical: DASHBOARD_TREND_CAPABILITY,
    },
  ),
  readDashboardTool(
    ALARM_DASHBOARD_RANK_TOOL,
    [
      ...metricFilterInputs().filter((item) => !['time', 'format', 'limit'].includes(item.id)),
      {
        id: 'group',
        name: 'group',
        description: t('DashBoard.homeAgent.tool.rank.group'),
        required: false,
        valueType: 'string',
      },
      { id: 'order', name: 'order', description: t('DashBoard.homeAgent.tool.rank.order'), required: false, valueType: 'string' },
      {
        id: 'limit',
        name: 'limit',
        description: t('DashBoard.homeAgent.tool.limit'),
        required: false,
        valueType: domainAgentIntegerValueType(1, 100),
        defaultValue: 10,
      },
    ],
    clientToolOutput.aggregateSeries({
      name: 'alarm-dashboard-rank',
      shape: 'tabular.summary',
      select: (result: any) => result.items,
      recordPath: '$',
      fields: DASHBOARD_RANK_FIELDS,
    }),
    async (args) => {
      const result = await queryAlarmRank(args);
      const evidence = createBoundedQueryEvidence(
        result.items.length,
        Number(result.params.limit) || result.items.length,
      );
      return clientToolResult.partial(result, {
        displayTruncated: evidence.truncated,
        exhaustive: evidence.exhaustive,
        supportsAbsenceClaim: evidence.supportsAbsenceClaim,
        cardinality: evidence.cardinality,
        facts: evidence.facts,
      });
    },
    {
      capabilities: ['alarm.dashboard.rank.aggregate'],
      intents: [t('DashBoard.homeAgent.tool.rank.description')],
      notFor: [t('DashBoard.homeAgent.tool.records.description')],
      timeScoped: true,
      analytical: DASHBOARD_RANK_CAPABILITY,
    },
  ),
]);
