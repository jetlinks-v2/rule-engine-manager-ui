import i18n from '@jetlinks-web-core/locales'

type AlarmLimit = {
  lower?: unknown
  upper?: unknown
}

type AlarmTriggerRow = {
  trigger?: string
  limit: AlarmLimit
  propertyName?: string
}

/**
 * 告警范围文案由场景联动资源统一生成，避免从设备告警页面深路径复用业务工具。
 */
export function formatTriggerText(row: AlarmTriggerRow): string {
  const lower = row.limit.lower ?? '-'
  const upper = row.limit.upper ?? '-'
  const propertyName = row.propertyName || ''
  const key = row.trigger === 'inside'
    ? 'IotSceneLinkage.alarmTriggerText.inside'
    : 'IotSceneLinkage.alarmTriggerText.outside'
  return i18n.global.t(key, { propertyName, lower, upper })
}
