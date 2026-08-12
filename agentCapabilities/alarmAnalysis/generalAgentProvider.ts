import i18n from '@jetlinks-web-core/locales'
import type {
  GeneralAgentCapabilityProvider,
  GeneralAgentContext,
} from '@jetlinks-web-core/layout/components/AiChat/generalAgentRuntime'
import {
  ALARM_ANALYSIS_CATEGORY,
  ALARM_ANALYSIS_PROVIDER_ID,
  ALARM_MENU_ANCHORS,
} from './constants'
import { createAlarmAnalysisTools } from './tools'

const findMenu = (context: GeneralAgentContext, anchors: readonly string[]) => (
  anchors.map(anchor => context.findMenu(anchor)).find(Boolean)
)

export const alarmAnalysisGeneralAgentProvider: GeneralAgentCapabilityProvider = {
  id: ALARM_ANALYSIS_PROVIDER_ID,
  order: 40,
  getCapabilities: (context) => {
    const eventsMenu = findMenu(context, ALARM_MENU_ANCHORS.events)
    if (!eventsMenu) return []
    const dashboardMenu = findMenu(context, ALARM_MENU_ANCHORS.dashboard)
    const searchMenu = findMenu(context, ALARM_MENU_ANCHORS.search)
    return [
      {
        id: 'alarm:analysis',
        name: i18n.global.t('AlarmGeneralAgent.capabilities.analysis.name'),
        description: i18n.global.t('AlarmGeneralAgent.capabilities.analysis.description'),
        kind: 'tool',
        category: ALARM_ANALYSIS_CATEGORY,
        menuCode: eventsMenu.code,
        keywords: ['告警', '视联告警', '物联告警', '告警事件', '告警趋势', '告警排行', '告警过滤', '风险事件', '违规事件', 'alarm'],
        metadata: { promptExamples: [i18n.global.t('AlarmGeneralAgent.prompts.overview')] },
      },
      {
        id: 'alarm:events',
        name: eventsMenu.title,
        description: i18n.global.t('AlarmGeneralAgent.capabilities.events.description'),
        kind: 'feature',
        category: ALARM_ANALYSIS_CATEGORY,
        menuCode: eventsMenu.code,
        keywords: ['告警事件', '告警记录', '告警详情', 'alarm events'],
      },
      ...(dashboardMenu ? [{
        id: 'alarm:dashboard',
        name: dashboardMenu.title,
        description: i18n.global.t('AlarmGeneralAgent.capabilities.dashboard.description'),
        kind: 'feature' as const,
        category: ALARM_ANALYSIS_CATEGORY,
        menuCode: dashboardMenu.code,
        keywords: ['告警看板', '告警态势', 'alarm dashboard'],
      }] : []),
      ...(searchMenu ? [{
        id: 'alarm:search',
        name: searchMenu.title,
        description: i18n.global.t('AlarmGeneralAgent.capabilities.search.description'),
        kind: 'feature' as const,
        category: ALARM_ANALYSIS_CATEGORY,
        menuCode: searchMenu.code,
        keywords: ['告警搜索', '智能搜索', 'alarm search'],
      }] : []),
    ]
  },
  getClientTools: context => findMenu(context, ALARM_MENU_ANCHORS.events) ? createAlarmAnalysisTools() : [],
  getWorkflowGuides: context => findMenu(context, ALARM_MENU_ANCHORS.events) ? [
    {
      id: 'alarm-vision-risk-event',
      title: i18n.global.t('AlarmGeneralAgent.workflows.risk.title'),
      when: i18n.global.t('AlarmGeneralAgent.workflows.risk.when'),
      steps: [
        { capability: 'alarm.scene.discover', evidence: 'alarm-scene-id', required: true },
        { capability: 'alarm.records.read', evidence: 'alarm-records', required: true },
        { capability: 'alarm.record.detail', evidence: 'alarm-record-detail', required: false },
      ],
      output: i18n.global.t('AlarmGeneralAgent.workflows.output'),
      notes: [i18n.global.t('AlarmGeneralAgent.workflows.risk.note')],
    },
    {
      id: 'alarm-situation-analysis',
      title: i18n.global.t('AlarmGeneralAgent.workflows.situation.title'),
      when: i18n.global.t('AlarmGeneralAgent.workflows.situation.when'),
      steps: [
        { capability: 'alarm.overview.aggregate', evidence: 'alarm-overview-summary', required: true },
        { capability: 'alarm.trend.aggregate', evidence: 'alarm-trend-summary', required: false },
        { capability: 'alarm.rank.aggregate', evidence: 'alarm-rank-summary', required: false },
      ],
      output: i18n.global.t('AlarmGeneralAgent.workflows.output'),
    },
    {
      id: 'alarm-record-investigation',
      title: i18n.global.t('AlarmGeneralAgent.workflows.record.title'),
      when: i18n.global.t('AlarmGeneralAgent.workflows.record.when'),
      steps: [
        { capability: 'alarm.records.read', evidence: 'alarm-record-id', required: true },
        { capability: 'alarm.record.detail', evidence: 'alarm-record-detail', required: true },
      ],
      output: i18n.global.t('AlarmGeneralAgent.workflows.output'),
    },
    {
      id: 'alarm-noise-analysis',
      title: i18n.global.t('AlarmGeneralAgent.workflows.noise.title'),
      when: i18n.global.t('AlarmGeneralAgent.workflows.noise.when'),
      steps: [{ capability: 'alarm.noise.aggregate', evidence: 'alarm-noise-summary', required: true }],
      output: i18n.global.t('AlarmGeneralAgent.workflows.output'),
    },
  ] : [],
  getPromptExamples: context => findMenu(context, ALARM_MENU_ANCHORS.events) ? [
    i18n.global.t('AlarmGeneralAgent.prompts.overview'),
    i18n.global.t('AlarmGeneralAgent.prompts.rank'),
    i18n.global.t('AlarmGeneralAgent.prompts.noise'),
  ] : [],
}

export default alarmAnalysisGeneralAgentProvider
