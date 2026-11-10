import { deviceScopeSummaryParts } from './deviceScopeLabel'
import type { SceneRuleRecord } from './editorMode'
import { getNotificationSummary } from './notificationSummary'
import type { SceneNotifyMethod, SceneNotifyUser } from '../../../api/scene-linkage'
import { localizedSummaryParts, summaryField, summaryPlainText, summaryText, validSummaryParts, summaryPartsText, type SummaryPart, type SummaryTranslate } from './summaryParts'

type SummaryContext = { users?: SceneNotifyUser[]; methods?: SceneNotifyMethod[]; providerName?: string }
const record = (value: unknown): SceneRuleRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as SceneRuleRecord : {}
const firstText = (...values: unknown[]) => values.map(summaryText).find(Boolean) || ''

/** 设备范围同时兼容指令的平铺选择器和设备信息的嵌套选择器；保留变量、关系及动态范围含义。 */
export function deviceNodeTarget(configuration: SceneRuleRecord, options: SceneRuleRecord, t: SummaryTranslate): string {
  return summaryPartsText(deviceNodeTargetParts(configuration, options, t))
}

/** 原生选择器的名称优先来自实际选择值，旧汇总名称只用于固定设备的缺省回显。 */
export function deviceNodeTargetParts(configuration: SceneRuleRecord, options: SceneRuleRecord, t: SummaryTranslate): SummaryPart[] {
  const scope = typeof configuration.selector === 'object' ? record(configuration.selector) : configuration
  const selector = scope.selector || 'fixed'
  const names = firstText(options.name, scope.selectorValues?.map((item: SceneRuleRecord) => item.name), scope.options?.names)
  const product = firstText(options.productName, configuration.productName)
  const fallback = t('IotSceneLinkage.detail.previewUnconfigured')
  if (['fixed', 'space', 'device-group', 'org', 'all'].includes(selector)) return deviceScopeSummaryParts(t, scope, product, Array.isArray(options.name) ? options.name : names)
  if (selector === 'context') return [summaryField(names || t('IotSceneLinkage.node.contextDevice'))]
  if (selector === 'tag') return [summaryField(t('IotSceneLinkage.node.tagDevices', { product: product || fallback, tag: firstText(options.tagName, names) || fallback }))]
  if (selector === 'relation') return [summaryField(t('IotSceneLinkage.node.relatedDevices', { device: firstText(options.triggerName, names) || fallback, relation: options.relationName || fallback, product }))]
  return [summaryField(names || product || fallback)]
}

/** 普通值直接显示；参数引用优先展示已保存名称，避免泄露内部列结构。 */
function actionValue(value: unknown, t: SummaryTranslate): string {
  if (!value || typeof value !== 'object') return summaryText(value)
  const item = record(value)
  if (item.source && item.source !== 'fixed') return firstText(item.label, item.fullName, item.column?.fullName, item.column?.name) || t('IotSceneLinkage.node.variableValue')
  return summaryText(item.value ?? value)
}

/** 通知卡片和两种预览使用相同的名称解析及字段标注，逐个保留收信人。 */
export function notificationSummaryParts(notification: { method: string; recipients: string[] }, t: SummaryTranslate): SummaryPart[] {
  const marker = '__scene_recipients__'
  const parts = localizedSummaryParts(t, 'IotSceneLinkage.detail.previewNotify', { channel: notification.method, recipients: marker })
  return parts.flatMap(part => part.field && part.text === marker
    ? notification.recipients.flatMap((name, index) => [...(index ? [summaryPlainText(t('IotSceneLinkage.scope.nameSeparator'))] : []), summaryField(name)])
    : [part])
}

/** 按原生动作模型生成只读摘要；名称来自 options，执行参数和未知扩展字段从不回写。 */
export function actionNodeSummaryParts(action: SceneRuleRecord, t: SummaryTranslate, context: SummaryContext = {}): SummaryPart[] {
  const executor = String(action.executor || '')
  const options = record(action.options)
  const fallback = t('IotSceneLinkage.detail.previewUnconfigured')
  if (executor === 'sceneNotify') return notificationSummaryParts(getNotificationSummary(action.configuration, options, t, context.users, context.methods), t)
  if (executor === 'delay') return localizedSummaryParts(t, 'IotSceneLinkage.summary.delay', { value: action.delay?.time ?? 1, unit: t(`IotSceneLinkage.unit.${action.delay?.unit || 'seconds'}`) })
  if (executor === 'collector') return collectorNodeSummaryParts(record(action.collector || action.configuration), options, t)
  if (executor === 'device-data') return localizedSummaryParts(t, 'IotSceneLinkage.node.deviceInfo', { target: '' }, { target: deviceNodeTargetParts(record(action.configuration), options, t) })
  if (executor === 'device') {
    const device = record(action.device || action.configuration)
    const message = record(device.message)
    const targetParts = deviceNodeTargetParts(device, options, t)
    const target = summaryPartsText(targetParts)
    const properties = record(message.properties)
    const propertyIds = Array.isArray(message.properties) ? message.properties : Object.keys(properties)
    const property = firstText(options.propertiesName, message.functionId, propertyIds) || fallback
    if (message.messageType === 'READ_PROPERTY') return localizedSummaryParts(t, 'IotSceneLinkage.detail.previewRead', { target, property }, { target: targetParts })
    if (message.messageType === 'WRITE_PROPERTY') {
      const entries = Object.entries(properties)
      // 原版支持一次写多个属性，不能只展示第一个，也不能因 0/false 被当作空值丢弃。
      const values = entries.map(([id, value]) => `${entries.length > 1 ? `${id}=` : ''}${actionValue(value, t)}`).join('、')
      return localizedSummaryParts(t, 'IotSceneLinkage.node.deviceWrite', { target, property, value: (entries.length > 1 ? values : firstText(options.propertiesValue, values)) || fallback }, { target: targetParts })
    }
    if (message.messageType === 'INVOKE_FUNCTION') {
      const parts = localizedSummaryParts(t, 'IotSceneLinkage.detail.previewInvoke', { target, function: property }, { target: targetParts })
      const inputs = (message.inputs || []).map((input: SceneRuleRecord) => `${input.name || input.id || ''}=${actionValue(input, t)}`).join('、')
      return inputs ? [...parts, summaryPlainText('（'), summaryField(firstText(options.propertiesValue, inputs)), summaryPlainText('）')] : parts
    }
    return validSummaryParts([summaryPlainText(options.type || context.providerName || t('IotSceneLinkage.action.device')), ...targetParts, summaryField(property)])
  }
  if (executor === 'alarm-record-query') {
    const target = firstText(options.name, options.alarmConfigName)
    return validSummaryParts([summaryPlainText(t('IotSceneLinkage.summary.queryAlarmRecords')), ...(target ? [summaryPlainText('：'), summaryField(target)] : [])])
  }
  if (executor === 'alarm') return [summaryPlainText(t(action.alarm?.mode === 'trigger' ? 'ListItem.Item.637563-0' : 'ListItem.Item.637563-2'))]
  if (executor === 'notify') {
    const channelKey = options.provider === 'dingTalkRobotWebHook' ? 'ListItem.Item.637563-4' : ({ dingTalk: 'ListItem.Item.637563-6', weixin: 'ListItem.Item.637563-8', email: 'ListItem.Item.637563-9', sms: 'ListItem.Item.637563-11', voice: 'ListItem.Item.637563-10' } as Record<string, string>)[action.notify?.notifyType]
    const recipients = [options.sendTo, options.orgName, options.tagName].map(summaryText).filter(Boolean).join(t('IotSceneLinkage.scope.nameSeparator'))
    return validSummaryParts([
      summaryPlainText(t('ListItem.Item.637563-3')), summaryField(options.type || t(channelKey || 'IotSceneLinkage.action.notify')),
      ...(recipients ? [summaryPlainText(t('ListItem.Item.637563-7')), summaryField(recipients)] : []),
      summaryPlainText(t('ListItem.Item.637563-5')), summaryField(options.templateName || action.notify?.templateId),
    ])
  }
  return validSummaryParts([summaryPlainText(options.type || context.providerName || t('IotSceneLinkage.detail.legacyAction')), summaryField(options.name)])
}

/** 采集器触发和输出共用资源链语句，通道、采集器、点位分别标注，写入值保持完整。 */
export function collectorNodeSummaryParts(collector: SceneRuleRecord, options: SceneRuleRecord, t: SummaryTranslate): SummaryPart[] {
  const fallback = t('IotSceneLinkage.detail.previewUnconfigured')
  const selection = collector.pointSelectInfo || collector.pointSelectInfos?.[0] || collector.collectorConfig?.pointSelectInfos?.[0] || {}
  const values = { channel: firstText(options.channelName, options.productName) || fallback, collector: firstText(options.name, options.collectorName, options.triggerName, selection.collectorName) || fallback, point: firstText(options.pointName, options.pointsName, collector.operator === 'sub' ? t('IotSceneLinkage.node.allPoints') : '', options.action) || fallback }
  const handler = collector.handlerType || collector.operator
  const key = handler === 'write' ? 'collectorWrite' : ['subscribe', 'sub', 'reportProperty'].includes(handler) ? 'collectorSubscribe' : 'collectorRead'
  return localizedSummaryParts(t, `IotSceneLinkage.node.${key}`, { ...values, value: firstText(options.propertiesValue, actionValue({ source: collector.source || collector.collectorConfig?.source, value: collector.value ?? collector.collectorConfig?.value }, t)) || fallback })
}
