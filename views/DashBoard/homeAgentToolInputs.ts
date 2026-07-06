import i18n from '@jetlinks-web-core/locales';

export const metricInputs = () => [
  { id: 'from', name: 'from', description: i18n.global.t('DashBoard.homeAgent.tool.timeRange.from'), required: false, valueType: 'string' },
  { id: 'to', name: 'to', description: i18n.global.t('DashBoard.homeAgent.tool.timeRange.to'), required: false, valueType: 'string' },
  { id: 'time', name: 'time', description: i18n.global.t('DashBoard.homeAgent.tool.timeRange.time'), required: false, valueType: 'string' },
  { id: 'format', name: 'format', description: i18n.global.t('DashBoard.homeAgent.tool.timeRange.format'), required: false, valueType: 'string' },
  { id: 'limit', name: 'limit', description: i18n.global.t('DashBoard.homeAgent.tool.limit'), required: false, valueType: 'number' },
  { id: 'targetType', name: 'targetType', description: i18n.global.t('DashBoard.homeAgent.tool.targetType'), required: false, valueType: 'string' },
  { id: 'targetId', name: 'targetId', description: i18n.global.t('DashBoard.homeAgent.tool.targetId'), required: false, valueType: 'string' },
  { id: 'alarmConfigId', name: 'alarmConfigId', description: i18n.global.t('DashBoard.homeAgent.tool.alarmConfigId'), required: false, valueType: 'string' },
];

export const targetInputs = () => metricInputs().slice(5);

export const recordInputs = () => [
  { id: 'state', name: 'state', description: i18n.global.t('DashBoard.homeAgent.tool.records.state'), required: false, valueType: 'string' },
  { id: 'limit', name: 'limit', description: i18n.global.t('DashBoard.homeAgent.tool.records.limit'), required: false, valueType: 'number' },
  { id: 'from', name: 'from', description: i18n.global.t('DashBoard.homeAgent.tool.timeRange.from'), required: false, valueType: 'string' },
  { id: 'to', name: 'to', description: i18n.global.t('DashBoard.homeAgent.tool.timeRange.to'), required: false, valueType: 'string' },
  { id: 'timeRange', name: 'timeRange', description: i18n.global.t('DashBoard.homeAgent.tool.records.timeRange'), required: false, valueType: 'string' },
  { id: 'timeColumn', name: 'timeColumn', description: i18n.global.t('DashBoard.homeAgent.tool.records.timeColumn'), required: false, valueType: 'string' },
  ...targetInputs(),
];
