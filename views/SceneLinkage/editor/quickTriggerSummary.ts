import { formatSceneDuration, type SceneMultiTriggerForm } from '../utils'
import { deviceTriggerTargetParts } from './triggerNodeSummary'
import { localizedSummaryParts, summaryField, summaryPlainText, validSummaryParts, type SummaryPart, type SummaryTranslate } from './summaryParts'

export type QuickTriggerSummaryForm = Omit<SceneMultiTriggerForm, 'clientId'>
type TriggerLabels = { targetParts?: SummaryPart[]; target?: string; property?: string; event?: string; alarm?: string; alarmTarget?: string }

/** 快速模式的单触发卡片、多触发卡片和预览使用相同语句；外部可补充异步解析的资源名称。 */
export function quickTriggerSummaryParts(form: QuickTriggerSummaryForm, t: SummaryTranslate, labels: TriggerLabels = {}): SummaryPart[] {
  const targetParts = labels.targetParts || deviceTriggerTargetParts(form, t, undefined, labels.target)
  const target = targetParts.map(part => part.text).join('')
  const hasValue = (value: unknown) => value !== undefined && value !== null && value !== ''
  const term = (name: string | undefined, value: unknown) => ['isnull', 'notnull'].includes(name || '')
    ? [summaryPlainText(t(`IotSceneLinkage.term.${name}`))]
    : hasValue(value) ? [summaryPlainText(t(`IotSceneLinkage.term.${name || 'eq'}`)), summaryField(value)] : []
  if (!form.triggerKind) return []
  if (form.triggerKind === 'property') return validSummaryParts([...targetParts, summaryPlainText(t('IotSceneLinkage.summary.deviceThingModelConnector')), summaryField(labels.property || form.propertyName || form.propertyId), ...term(form.termType, form.termValue)])
  if (form.triggerKind === 'event') return validSummaryParts([...targetParts, summaryPlainText(t('IotSceneLinkage.summary.report')), summaryField(labels.event || form.eventName || form.eventId), summaryField(form.eventOutputName || form.eventOutputId), ...term(form.eventTermType, form.eventTermValue)])
  if (form.triggerKind === 'online' || form.triggerKind === 'offline') return [...targetParts, summaryPlainText(t(`IotSceneLinkage.deviceState.${form.triggerKind}`))]
  if (form.triggerKind === 'state') {
    if (form.deviceState === 'any') return localizedSummaryParts(t, 'IotSceneLinkage.summary.stateAny', { product: target }, { product: targetParts })
    const state = t(`IotSceneLinkage.stateCondition.${form.deviceState}`)
    return localizedSummaryParts(t, form.deviceStateTriggerMode === 'sustained' ? 'IotSceneLinkage.summary.stateSustained' : 'IotSceneLinkage.summary.state', { product: target, state, time: form.deviceStateSustainedTime }, { product: targetParts })
  }
  if (form.triggerKind === 'repeat') {
    const days = form.repeatCustomMode === 'weekly'
      ? (form.repeatWeekdays || []).map(day => t(`IotSceneLinkage.weekday.${['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'][day - 1]}`)).join('、')
      : (form.repeatMonthDays || []).map(day => t('IotSceneLinkage.monthDay', { day })).join('、')
    const repeat = form.repeatMode === 'custom' ? `${t(`IotSceneLinkage.repeat.${form.repeatCustomMode}`)} ${days}` : t(`IotSceneLinkage.repeat.${form.repeatMode}`)
    return validSummaryParts([summaryField(repeat), summaryPlainText(' '), summaryField(form.repeatTime)])
  }
  if (form.triggerKind === 'date') return validSummaryParts([summaryField(form.dateTime)])
  if (form.triggerKind === 'interval') return localizedSummaryParts(t, 'IotSceneLinkage.summary.interval', { time: form.interval, unit: t(`IotSceneLinkage.unit.${form.intervalUnit}`) })
  if (form.triggerKind === 'manual') return [summaryPlainText(t('IotSceneLinkage.summary.manual'))]
  if (form.triggerKind === 'alarm') {
    const alarm = form.alarm
    const options = alarm.options || {}
    const modes = alarm.modes || []
    const state = modes.length ? modes.map(mode => t(`IotSceneLinkage.alarmMode.${mode}`)).join('、') : t('IotSceneLinkage.detail.previewUnconfigured')
    const resource = alarm.sourceKind === 'visual-ai' || alarm.targetType === 'aiTaskMediaTarget'
      ? [options.sceneName, options.taskTargetName, options.deviceName].filter(Boolean).join(' · ')
      : options.deviceName || options.productName || labels.alarmTarget
    return validSummaryParts([...(resource ? [summaryField(resource), summaryPlainText(t('IotSceneLinkage.alarmPhrase.ofAlarm'))] : []), summaryField(labels.alarm || options.alarmConfigName || t('IotSceneLinkage.detail.previewUnconfigured')), summaryPlainText(' '), summaryField(state)])
  }
  if (form.triggerKind === 'ai-event') {
    const event = form.aiEvent
    const cameras = (event.mediaTargets || []).map(item => item.name).filter(Boolean).join('、') || ((event.mediaTargets || []).length ? t('IotSceneLinkage.aiEvent.cameraCount', { count: event.mediaTargets?.length || 0 }) : t('IotSceneLinkage.aiEvent.allCameras'))
    const parts = validSummaryParts([summaryField(event.sceneName || event.sceneId), summaryField(event.taskTargetName || event.taskTarget), summaryPlainText(t('IotSceneLinkage.aiEvent.phrase.at')), summaryField(cameras), summaryPlainText(t('IotSceneLinkage.aiEvent.phrase.resultProduced'))])
    const rule = event.recognitionRule
    if (rule) parts.push(summaryField(t(rule.type === 'hits' ? 'IotSceneLinkage.aiEvent.rule.hitsPreview' : 'IotSceneLinkage.aiEvent.rule.missedPreview', { time: formatSceneDuration(t, rule.time), count: rule.type === 'hits' ? rule.threshold : undefined })))
    else if (event.condition) {
      const condition = event.condition
      const name = t(`IotSceneLinkage.aiEvent.condition.${condition.column}`)
      parts.push(summaryField(name), summaryPlainText(t(`IotSceneLinkage.term.${condition.termType || 'eq'}`)))
      if (condition.termType !== 'isnull' && condition.termType !== 'notnull') parts.push(summaryField(condition.value))
    }
    return validSummaryParts(parts)
  }
  return [summaryPlainText(t(`IotSceneLinkage.trigger.${form.triggerKind}`))]
}
