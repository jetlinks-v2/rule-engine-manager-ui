import i18n from '@jetlinks-web-core/locales';
import {
  registerHomeAgentCapabilityProvider,
  type HomeAgentCapabilityContext,
  type HomeAgentCapabilityProvider,
  type HomeAgentWorkflowGuide,
} from '@jetlinks-web-core/layout/components/AiChat/homeAgentCapabilities';
import {
  ALARM_DASHBOARD_CONFIG_STATS_TOOL,
  ALARM_DASHBOARD_OVERVIEW_TOOL,
  ALARM_DASHBOARD_RANK_TOOL,
  ALARM_DASHBOARD_RECORDS_TOOL,
  ALARM_DASHBOARD_TARGET_TYPES_TOOL,
  ALARM_DASHBOARD_TREND_TOOL,
  createAlarmDashboardTools,
} from './homeAgentTools';

export const ALARM_DASHBOARD_MENU_CODE = 'rule-engine/DashBoard';
export const ALARM_DASHBOARD_PATH = '/iot/Alarm/dashboard';

const isAlarmDashboardRoute = (context: HomeAgentCapabilityContext) => (
  context.currentRoute.path === ALARM_DASHBOARD_PATH
  || context.currentRoute.name === ALARM_DASHBOARD_MENU_CODE
  || context.currentRoute.name === 'AlarmDashboard'
  || context.currentView === ALARM_DASHBOARD_MENU_CODE
);

const isAlarmDashboardAvailable = (context: HomeAgentCapabilityContext) => (
  !!context.findMenu(ALARM_DASHBOARD_MENU_CODE)
  || !!context.findMenu(ALARM_DASHBOARD_PATH)
);

const getPromptExamples = () => [
  i18n.global.t('DashBoard.homeAgent.prompt.overview'),
  i18n.global.t('DashBoard.homeAgent.prompt.trend'),
  i18n.global.t('DashBoard.homeAgent.prompt.rank'),
  i18n.global.t('DashBoard.homeAgent.prompt.records'),
  i18n.global.t('DashBoard.homeAgent.prompt.targetTypes'),
];

const getWorkflowGuides = (): HomeAgentWorkflowGuide[] => [
  {
    id: 'alarm-dashboard:statistics',
    name: i18n.global.t('DashBoard.homeAgent.workflow.statistics.name'),
    description: i18n.global.t('DashBoard.homeAgent.workflow.statistics.description'),
    when: i18n.global.t('DashBoard.homeAgent.workflow.statistics.when'),
    scenarios: [
      i18n.global.t('DashBoard.homeAgent.workflow.statistics.scenario.trend'),
      i18n.global.t('DashBoard.homeAgent.workflow.statistics.scenario.rank'),
      i18n.global.t('DashBoard.homeAgent.workflow.statistics.scenario.records'),
      i18n.global.t('DashBoard.homeAgent.workflow.statistics.scenario.target'),
    ],
    keywords: ['alarm', 'dashboard', 'trend', 'rank', 'record', 'target', '告警', '仪表盘', '趋势', '排名', '记录', '对象'],
    priority: 80,
    steps: [
      {
        title: i18n.global.t('DashBoard.homeAgent.workflow.statistics.step.scope.title'),
        description: i18n.global.t('DashBoard.homeAgent.workflow.statistics.step.scope.description'),
        tools: [ALARM_DASHBOARD_TARGET_TYPES_TOOL],
        required: false,
      },
      {
        title: i18n.global.t('DashBoard.homeAgent.workflow.statistics.step.query.title'),
        description: i18n.global.t('DashBoard.homeAgent.workflow.statistics.step.query.description'),
        tools: [ALARM_DASHBOARD_TREND_TOOL, ALARM_DASHBOARD_RANK_TOOL, ALARM_DASHBOARD_RECORDS_TOOL],
        inputs: {
          from: 'now-1d | yyyy-MM-dd HH:mm:ss',
          to: 'now | yyyy-MM-dd HH:mm:ss',
          time: '1m | 1h | 1d | 1M',
          targetType: 'optional',
        },
        required: true,
      },
      {
        title: i18n.global.t('DashBoard.homeAgent.workflow.statistics.step.summarize.title'),
        description: i18n.global.t('DashBoard.homeAgent.workflow.statistics.step.summarize.description'),
        required: true,
      },
    ],
    output: [
      i18n.global.t('DashBoard.homeAgent.workflow.statistics.output.range'),
      i18n.global.t('DashBoard.homeAgent.workflow.statistics.output.trend'),
      i18n.global.t('DashBoard.homeAgent.workflow.statistics.output.rank'),
      i18n.global.t('DashBoard.homeAgent.workflow.statistics.output.records'),
    ],
    notes: i18n.global.t('DashBoard.homeAgent.workflow.statistics.notes'),
  },
];

const createAlarmDashboardCapabilities = (context: HomeAgentCapabilityContext) => {
  const currentRoute = isAlarmDashboardRoute(context);
  const base = {
    category: 'alarm-dashboard',
    menuCode: ALARM_DASHBOARD_MENU_CODE,
    routeName: ALARM_DASHBOARD_MENU_CODE,
    path: ALARM_DASHBOARD_PATH,
    metadata: { currentRoute },
  };

  return [
    {
      ...base,
      id: 'alarm-dashboard:overview',
      name: i18n.global.t('DashBoard.homeAgent.capability.overview.name'),
      description: i18n.global.t('DashBoard.homeAgent.capability.overview.description'),
      kind: 'feature' as const,
      order: 10,
      keywords: ['alarm', 'dashboard', 'overview', '告警', '仪表盘', '概览'],
      metadata: {
        ...base.metadata,
        promptExamples: getPromptExamples(),
      },
    },
    {
      ...base,
      id: 'alarm-dashboard:trend',
      name: i18n.global.t('DashBoard.homeAgent.capability.trend.name'),
      description: i18n.global.t('DashBoard.homeAgent.capability.trend.description'),
      kind: 'feature' as const,
      order: 20,
      keywords: ['alarm', 'trend', 'time', '告警', '趋势', '时间'],
    },
    {
      ...base,
      id: 'alarm-dashboard:rank',
      name: i18n.global.t('DashBoard.homeAgent.capability.rank.name'),
      description: i18n.global.t('DashBoard.homeAgent.capability.rank.description'),
      kind: 'feature' as const,
      order: 30,
      keywords: ['alarm', 'rank', 'top', '告警', '排行', '排名'],
    },
    {
      ...base,
      id: 'alarm-dashboard:records',
      name: i18n.global.t('DashBoard.homeAgent.capability.records.name'),
      description: i18n.global.t('DashBoard.homeAgent.capability.records.description'),
      kind: 'feature' as const,
      order: 40,
      keywords: ['alarm', 'record', 'warning', '告警', '记录', '未恢复'],
    },
    {
      ...base,
      id: 'alarm-dashboard:config',
      name: i18n.global.t('DashBoard.homeAgent.capability.configStats.name'),
      description: i18n.global.t('DashBoard.homeAgent.capability.configStats.description'),
      kind: 'feature' as const,
      order: 50,
      keywords: ['alarm', 'config', 'enabled', 'disabled', '告警', '配置', '启用', '禁用'],
    },
  ];
};

export const alarmDashboardHomeAgentProvider: HomeAgentCapabilityProvider = {
  id: 'alarm-dashboard',
  order: 120,
  getCapabilities: (context) => (isAlarmDashboardAvailable(context)
    ? createAlarmDashboardCapabilities(context)
    : []),
  getClientTools: (context) => (isAlarmDashboardAvailable(context) ? createAlarmDashboardTools() : []),
  getPromptExamples: (context) => (isAlarmDashboardRoute(context) ? getPromptExamples() : []),
  getWorkflowGuides: (context) => (isAlarmDashboardAvailable(context) ? getWorkflowGuides() : []),
  getSystemPromptLines: (context) => (isAlarmDashboardRoute(context)
    ? i18n.global.t('DashBoard.homeAgent.prompt.system')
    : []),
};

export const registerAlarmDashboardHomeAgentProvider = () => (
  registerHomeAgentCapabilityProvider(alarmDashboardHomeAgentProvider)
);

export default alarmDashboardHomeAgentProvider;
