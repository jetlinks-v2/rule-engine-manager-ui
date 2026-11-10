import { formatSceneTimeRange, type SceneConditionForm } from '../utils'
import { deviceNodeTargetParts } from './actionNodeSummary'
import { summaryField, summaryPlainText, validSummaryParts, type SummaryPart, type SummaryTranslate } from './summaryParts'

/** 附加条件也遵循同一语句和字段样式；资源名称可由宿主已有查询补齐。 */
export function conditionNodeSummaryParts(condition: SceneConditionForm, t: SummaryTranslate, labels: { targetParts?: SummaryPart[]; target?: string; property?: string; alarm?: string } = {}) {
  if (condition.type === 'timeRange') return [summaryField(condition.ranges.map(range => formatSceneTimeRange(t, range)).join('、'))]
  if (condition.type === 'deviceProperty') return validSummaryParts([
    ...(labels.targetParts || deviceNodeTargetParts(condition, condition.options || {}, t)), summaryPlainText(t('IotSceneLinkage.summary.deviceThingModelConnector')),
    summaryField(labels.property || condition.options?.propertiesName || condition.propertyId), summaryPlainText(t(`IotSceneLinkage.term.${condition.termType}`)),
    ...(['isnull', 'notnull'].includes(condition.termType) ? [] : [summaryField(condition.value)]),
  ])
  const options = condition.alarm.options || {}
  return validSummaryParts([summaryField(labels.target || options.deviceName || options.productName || options.sceneName), summaryPlainText(t('IotSceneLinkage.alarmPhrase.ofAlarm')), summaryField(labels.alarm || options.alarmConfigName), summaryPlainText(t('IotSceneLinkage.alarmPhrase.currentState')), summaryField(t(`IotSceneLinkage.alarmState.${condition.alarm.state}`))])
}
