import i18n from '@jetlinks-web-core/locales';
import type { HomeAgentCapabilityContext } from '@jetlinks-web-core/layout/components/AiChat/homeAgentCapabilities';
import type { AiClientToolDefinition } from '@jetlinks-web-core/layout/components/AiChat/clientTools';
import {
  dashboard,
  getAlarm,
  getAlarmConfigCount,
  getAlarmLevel,
  type DashboardMeasurementRequest,
} from '@rule-engine-manager-ui/api/dashboard';
import { getTargetTypes } from '@rule-engine-manager-ui/api/configuration';
import { resolveAlarmRecordTimeRange } from './homeAgentTime';
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

const DEFAULT_TREND_PARAMS = {
  from: 'now-1d',
  to: 'now',
  time: '1h',
  format: 'yyyy-MM-dd HH:mm:ss',
  limit: 24,
};

const DEFAULT_RANK_PARAMS = {
  from: 'now-1d',
  to: 'now',
  group: 'targetId',
  order: 'desc',
  limit: 10,
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

const pickMetricParams = (args: ToolArgs, defaults: Record<string, any>) => {
  // Dashboard measurements parse date math server-side, so keep from/to as API expressions.
  const params: Record<string, any> = {
    ...defaults,
    from: args.from || args.start || args.startTime || defaults.from,
    to: args.to || args.end || args.endTime || defaults.to,
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
    total: summary.total,
    peak: summary.peak,
    latest: summary.latest,
    average: summary.average,
    series,
    summary: i18n.global.t('DashBoard.homeAgent.tool.trend.summary', [
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
  const total = ranking.reduce((sum, item) => sum + item.count, 0);
  const top = ranking[0];
  return {
    ok: true,
    params,
    total,
    top,
    items: ranking,
    summary: i18n.global.t('DashBoard.homeAgent.tool.rank.summary', [
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
  const timeRange = resolveAlarmRecordTimeRange(args);
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
  if (timeRange.start !== undefined || timeRange.end !== undefined) {
    terms.push({
      column: timeColumn,
      termType: 'btw',
      value: [timeRange.start ?? 0, timeRange.end ?? Date.now()],
    });
  }
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
    total: toNumber(records.total),
    timeRange: timeRange.start !== undefined || timeRange.end !== undefined
      ? { column: timeColumn, from: timeRange.start, to: timeRange.end }
      : undefined,
    items: data,
    summary: i18n.global.t('DashBoard.homeAgent.tool.records.summary', [toNumber(records.total), data.length]),
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
    summary: i18n.global.t('DashBoard.homeAgent.tool.overview.summary', [
      trend.params.from,
      trend.params.to,
      trend.total,
      rank.top?.targetName || '-',
      rank.top?.count || 0,
      records.total,
    ]),
  };
};

export const createAlarmDashboardTools = (): AiClientToolDefinition<HomeAgentCapabilityContext>[] => ([
  { id: ALARM_DASHBOARD_OVERVIEW_TOOL, name: ALARM_DASHBOARD_OVERVIEW_TOOL, displayName: i18n.global.t('DashBoard.homeAgent.tool.overview.displayName'), progressText: i18n.global.t('DashBoard.homeAgent.tool.overview.progressText'), description: i18n.global.t('DashBoard.homeAgent.tool.overview.description'), help: i18n.global.t('DashBoard.homeAgent.tool.overview.help'), inputs: [...metricInputs(), { id: 'recordsLimit', name: 'recordsLimit', description: i18n.global.t('DashBoard.homeAgent.tool.records.limit'), required: false, valueType: 'number' }], output: { type: 'object' }, annotations: { readOnlyHint: true }, execute: getOverview },
  { id: ALARM_DASHBOARD_TARGET_TYPES_TOOL, name: ALARM_DASHBOARD_TARGET_TYPES_TOOL, displayName: i18n.global.t('DashBoard.homeAgent.tool.targetTypes.displayName'), progressText: i18n.global.t('DashBoard.homeAgent.tool.targetTypes.progressText'), description: i18n.global.t('DashBoard.homeAgent.tool.targetTypes.description'), help: i18n.global.t('DashBoard.homeAgent.tool.targetTypes.help'), inputs: [], output: { type: 'object' }, annotations: { readOnlyHint: true }, execute: getTargetTypeOptions },
  { id: ALARM_DASHBOARD_CONFIG_STATS_TOOL, name: ALARM_DASHBOARD_CONFIG_STATS_TOOL, displayName: i18n.global.t('DashBoard.homeAgent.tool.configStats.displayName'), progressText: i18n.global.t('DashBoard.homeAgent.tool.configStats.progressText'), description: i18n.global.t('DashBoard.homeAgent.tool.configStats.description'), help: i18n.global.t('DashBoard.homeAgent.tool.configStats.help'), inputs: [], output: { type: 'object' }, annotations: { readOnlyHint: true }, execute: getConfigStats },
  { id: ALARM_DASHBOARD_RECORDS_TOOL, name: ALARM_DASHBOARD_RECORDS_TOOL, displayName: i18n.global.t('DashBoard.homeAgent.tool.records.displayName'), progressText: i18n.global.t('DashBoard.homeAgent.tool.records.progressText'), description: i18n.global.t('DashBoard.homeAgent.tool.records.description'), help: i18n.global.t('DashBoard.homeAgent.tool.records.help'), inputs: recordInputs(), output: { type: 'object' }, annotations: { readOnlyHint: true }, execute: queryAlarmRecords },
  { id: ALARM_DASHBOARD_TREND_TOOL, name: ALARM_DASHBOARD_TREND_TOOL, displayName: i18n.global.t('DashBoard.homeAgent.tool.trend.displayName'), progressText: i18n.global.t('DashBoard.homeAgent.tool.trend.progressText'), description: i18n.global.t('DashBoard.homeAgent.tool.trend.description'), help: i18n.global.t('DashBoard.homeAgent.tool.trend.help'), inputs: metricInputs(), output: { type: 'object' }, annotations: { readOnlyHint: true }, execute: queryAlarmTrend },
  { id: ALARM_DASHBOARD_RANK_TOOL, name: ALARM_DASHBOARD_RANK_TOOL, displayName: i18n.global.t('DashBoard.homeAgent.tool.rank.displayName'), progressText: i18n.global.t('DashBoard.homeAgent.tool.rank.progressText'), description: i18n.global.t('DashBoard.homeAgent.tool.rank.description'), help: i18n.global.t('DashBoard.homeAgent.tool.rank.help'), inputs: [...metricInputs().filter((item) => !['time', 'format'].includes(item.id)), { id: 'group', name: 'group', description: i18n.global.t('DashBoard.homeAgent.tool.rank.group'), required: false, valueType: 'string' }, { id: 'order', name: 'order', description: i18n.global.t('DashBoard.homeAgent.tool.rank.order'), required: false, valueType: 'string' }], output: { type: 'object' }, annotations: { readOnlyHint: true }, execute: queryAlarmRank },
]);
