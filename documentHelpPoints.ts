import i18n from '@jetlinks-web-core/locales'
import { registerDocumentHelpPoints } from '@jetlinks-web-core/utils/documentHelpRegistry'

/** 模块启动登记，仪表盘未访问时也可扫描和配置帮助。 */
export function registerAlarmDashboardHelpPoints() {
  registerDocumentHelpPoints([
    ...['iotRules', 'visionRules', 'templates', 'channels'].map(key => ({
      code: 'rule-engine/DashBoard', key: `quickStart.${key}`,
      name: () => i18n.global.t(`alarmDashboard.action.${key}`),
      page: () => i18n.global.t('DocumentHelp.alarmDashboard'),
      location: () => i18n.global.t('alarmDashboard.QuickStart'),
    })),
    ...[
      ['dashboard.alarmTrend', 'AlarmTrend'],
      ['dashboard.iotHandling', 'IotHandlingStatistics'],
      ['dashboard.visionHandling', 'VisionHandlingStatistics'],
    ].map(([key, title]) => ({
      code: 'rule-engine/DashBoard', key,
      name: () => i18n.global.t(`alarmDashboard.${title}`),
      page: () => i18n.global.t('DocumentHelp.alarmDashboard'),
    })),
  ])
}
