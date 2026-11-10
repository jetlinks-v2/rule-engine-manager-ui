import { detailedConditionSummaryParts, detailedDebounceSummaryParts, type PreviewColumns } from './detail/detailedRuleSummaryParts'
import { toForm } from '../utils'
import type { SceneRuleRecord } from './editorMode'
import { quickTriggerSummaryParts } from './quickTriggerSummary'
import { collectorNodeSummaryParts, deviceNodeTargetParts, actionNodeSummaryParts } from './actionNodeSummary'
import type { TimerCalendarTag } from '../../Scene/Save/components/Timer/useTimerCalendarTags'
import { timerNodeSummaryParts } from './timerNodeSummary'
import { summaryField, summaryPlainText, summaryText, validSummaryParts, type SummaryPart, type SummaryTranslate } from './summaryParts'

/** 原生触发器只投影为展示字段；主动读写、采集器及未知 Provider 不经过快速配置保存转换。 */
export function detailedTriggerSummaryParts(trigger: SceneRuleRecord, options: SceneRuleRecord, t: SummaryTranslate, fallbackType = '', rule: SceneRuleRecord = {}, columns: PreviewColumns = {}, calendarTags: TimerCalendarTag[] = []): SummaryPart[] {
  const type = String(trigger.type || fallbackType)
  if (!type) return []
  if (type === 'multi') return (trigger.multi?.triggers || []).flatMap((item: SceneRuleRecord, index: number) => {
    const leafColumns = { ...columns }
    const prefix = `${item.index ?? index}:`
    Object.entries(columns).forEach(([key, column]) => { if (key.startsWith(prefix)) leafColumns[key.slice(prefix.length)] = column })
    // 每个事件源的过滤和防抖必须留在自己的括号内，避免被误读为所有事件源共用。
    const conditions = detailedConditionSummaryParts(item.terms, t, { columns: leafColumns })
    const debounce = detailedDebounceSummaryParts(item.shakeLimit, t)
    return [
      ...(index ? [summaryPlainText(` ${t('IotSceneLinkage.rule.or')} `)] : []),
      summaryPlainText('（'),
      ...detailedTriggerSummaryParts(item.trigger || {}, item.options || {}, t, '', {}, leafColumns, calendarTags),
      ...(conditions.length ? [summaryPlainText(` ${t('IotSceneLinkage.rule.and')}（`), ...conditions, summaryPlainText('）')] : []),
      ...(debounce.length ? [summaryPlainText(`；${t('IotSceneLinkage.debounce.enable')}：`), ...debounce] : []),
      summaryPlainText('）'),
    ]
  })
  if (type === 'collector') {
    const collector = trigger.collector || trigger.configuration || {}
    const parts = collectorNodeSummaryParts(collector, options, t)
    return collector.timer ? [...timerNodeSummaryParts(collector.timer, calendarTags), summaryPlainText('：'), ...parts] : parts
  }
  if (type === 'timer') return trigger.timer ? timerNodeSummaryParts(trigger.timer, calendarTags) : validSummaryParts([summaryField(options.when), summaryField(options.time), summaryField(options.extraTime)])
  if (type === 'device') {
    const device = trigger.device || {}
    const operation = device.operation || {}
    // 规则预览将分支条件单列为“且”；无条件的属性上报不能拼成残缺的“设备的”。
    if (operation.operator === 'reportProperty' && !rule.branches?.length && !rule.terms?.length) return [...deviceNodeTargetParts(device, options, t), summaryPlainText(t('IotSceneLinkage.node.reportProperties'))]

    const property = summaryText(options.action) || summaryText(options.propertiesName) || summaryText(operation.readProperties) || summaryText(Object.keys(operation.writeProperties || {})) || operation.functionId || t('IotSceneLinkage.detail.previewUnconfigured')
    if (['readProperty', 'writeProperty', 'invokeFunction'].includes(operation.operator)) {
      const messageType = ({ readProperty: 'READ_PROPERTY', writeProperty: 'WRITE_PROPERTY', invokeFunction: 'INVOKE_FUNCTION' } as Record<string, string>)[operation.operator]
      const parts = actionNodeSummaryParts({ executor: 'device', device: { ...device, message: { messageType, properties: operation.operator === 'writeProperty' ? operation.writeProperties : operation.readProperties, functionId: operation.functionId, inputs: operation.functionParameters } }, options: { ...options, propertiesName: property } }, t)
      const timer = operation.timer ? timerNodeSummaryParts(operation.timer, calendarTags) : undefined
      return timer ? [...timer, summaryPlainText('：'), ...parts] : parts
    }
  }
  if (['device', 'manual', 'alarm', 'ai-event'].includes(type)) {
    const form = toForm({ ...rule, triggerType: type, trigger, options: { ...rule.options, trigger: options } })
    return quickTriggerSummaryParts(form, t, type === 'device' ? { targetParts: deviceNodeTargetParts(trigger.device || {}, options, t) } : {})
  }
  return validSummaryParts([summaryPlainText(options.type || t('IotSceneLinkage.detail.triggerRule')), summaryField(options.name), summaryField(options.action)])
}
