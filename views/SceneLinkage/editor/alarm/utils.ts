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

type AlarmMatcher = { provider?: string; configuration?: { not?: boolean; min?: unknown; max?: unknown; operator?: string; value?: unknown; values?: unknown[] } }
type AlarmProcessor = {
  provider?: string
  configuration?: {
    alarmName?: string
    alarmLevel?: number
    matcher?: AlarmMatcher
    processors?: AlarmProcessor[]
  }
}
export type IotAlarmPreprocess = {
  templateId?: string
  propertyName?: string
  alarm?: AlarmProcessor & { id?: string; templateId?: string; thingId?: string; name?: string; propertyName?: string; property?: string }
}

/** simple 和 composite 共用预处理器 ID；只读取产生告警的分支，避免误用解除条件。 */
export function iotAlarmSummary(item: IotAlarmPreprocess) {
  const alarm = item.alarm || {}
  const propertyName = item.propertyName || alarm.propertyName || alarm.property || ''
  const find = (node: AlarmProcessor, matcher?: AlarmMatcher, depth = 0): { processor: AlarmProcessor; matcher?: AlarmMatcher } | undefined => {
    if (depth > 16) return
    const currentMatcher = node.configuration?.matcher || matcher
    if (node.provider === 'device-alarm') return { processor: node, matcher: currentMatcher }
    for (const child of node.configuration?.processors || []) {
      const found = find(child, currentMatcher, depth + 1)
      if (found) return found
    }
  }
  const found = find(alarm)
  return {
    name: found?.processor.configuration?.alarmName || alarm.name || propertyName,
    level: Number(found?.processor.configuration?.alarmLevel) || undefined,
    condition: formatMatcherText(propertyName, found?.matcher),
  }
}

/** 展示完整触发条件；未知匹配器保留属性名，数值 0 和布尔 false 不作为空值处理。 */
export function formatMatcherText(propertyName: string, matcher?: AlarmMatcher): string {
  const config = matcher?.configuration || {}
  if (matcher?.provider === 'number-range') return formatTriggerText({
    propertyName, trigger: config.not ? 'outside' : 'inside', limit: { lower: config.min, upper: config.max },
  })
  const symbols: Record<string, string> = { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', neq: '≠' }
  const label = (value: unknown) => typeof value === 'string' ? JSON.stringify(value) : String(value ?? '-')
  if (matcher?.provider === 'number-compare' && config.operator && symbols[config.operator]) {
    return `${propertyName} ${symbols[config.operator]} ${label(config.value)}`
  }
  if (matcher?.provider === 'value-set' && config.values?.length) {
    if (config.values.length === 1) return `${propertyName} ${config.not ? '≠' : '='} ${label(config.values[0])}`
    return i18n.global.t(`IotSceneLinkage.alarmTriggerText.${config.not ? 'nin' : 'in'}`, {
      propertyName, values: config.values.map(label).join('、'),
    })
  }
  return propertyName
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
