<template>
  <div v-if="showSnapshot" class="scene-rule-summary scene-rule-summary--snapshot"><span class="scene-rule-summary__snapshot">{{ snapshot }}</span></div>
  <div v-else class="scene-rule-summary">
    <div v-if="triggerForms.length" class="scene-rule-summary__clause scene-rule-summary__clause--trigger">
      <span class="scene-rule-summary__keyword scene-rule-summary__keyword--trigger">{{ $t('IotSceneLinkage.rule.when') }}</span>
      <template v-if="triggerSummaries.length">
        <template v-for="(summary, index) in triggerSummaries" :key="index">
          <template v-for="(part, partIndex) in summary.parts" :key="`${index}-${partIndex}`">
            <span v-if="part.field" class="scene-rule-summary__field scene-rule-summary__field--trigger" :title="part.title || part.text">{{ part.text }}</span>
            <span v-else>{{ part.text }}</span>
          </template>
          <span v-if="index < triggerSummaries.length - 1">{{ $t('IotSceneLinkage.rule.or') }}</span>
        </template>
      </template>
      <span v-else class="scene-rule-summary__empty scene-rule-summary__empty--trigger">{{ $t('IotSceneLinkage.rule.previewNoTrigger') }}</span>
    </div>
    <div v-for="(condition, index) in conditionSummaries" :key="index" class="scene-rule-summary__clause scene-rule-summary__clause--condition">
      <span class="scene-rule-summary__keyword scene-rule-summary__keyword--condition">{{ $t('IotSceneLinkage.rule.and') }}</span>
      <template v-if="condition.type === 'alarm'">
        <span class="scene-rule-summary__field scene-rule-summary__field--condition" :title="condition.title">{{ condition.target }}</span><span>{{ $t('IotSceneLinkage.alarmPhrase.ofAlarm') }}</span>
        <span class="scene-rule-summary__field scene-rule-summary__field--condition" :title="condition.title">{{ condition.alarm }}</span><span>{{ $t('IotSceneLinkage.alarmPhrase.currentState') }}</span>
        <span class="scene-rule-summary__field scene-rule-summary__field--condition" :title="condition.title">{{ condition.state }}</span>
      </template>
      <template v-else v-for="(part, partIndex) in condition.parts" :key="partIndex">
        <span v-if="part.field" class="scene-rule-summary__field scene-rule-summary__field--condition" :title="part.title || part.text">{{ part.text }}</span>
        <span v-else>{{ part.text }}</span>
      </template>
    </div>
    <div class="scene-rule-summary__clause scene-rule-summary__clause--action">
      <span class="scene-rule-summary__keyword scene-rule-summary__keyword--action">{{ $t('IotSceneLinkage.summary.then') }}</span>
      <template v-if="actionSummaries.length">
        <template v-for="(action, index) in actionSummaries" :key="index">
          <template v-if="action.type === 'notify'">
            <span class="scene-rule-summary__action-text">{{ $t('IotSceneLinkage.action.send') }}</span>
            <span class="scene-rule-summary__field scene-rule-summary__field--action" :title="action.title">{{ action.channel }}</span>
            <span class="scene-rule-summary__action-text">{{ $t('IotSceneLinkage.action.to') }}</span>
            <span v-for="user in action.users" :key="user" class="scene-rule-summary__field scene-rule-summary__field--action" :title="action.title">{{ user }}</span>
            <span v-if="action.hasMore" class="scene-rule-summary__action-text">{{ $t('IotSceneLinkage.summary.andMore') }}</span>
          </template>
          <template v-else v-for="(part, partIndex) in action.parts" :key="partIndex">
            <span v-if="part.field" class="scene-rule-summary__field scene-rule-summary__field--action" :title="part.title || part.text">{{ part.text }}</span>
            <span v-else class="scene-rule-summary__action-text">{{ part.text }}</span>
          </template>
        </template>
      </template>
      <span v-if="!actionSummaries.length" class="scene-rule-summary__empty scene-rule-summary__empty--action">{{ $t('IotSceneLinkage.rule.previewNoAction') }}</span>
    </div>
    <div v-if="debounceSummary" class="scene-rule-summary__clause scene-rule-summary__clause--debounce">
      <span class="scene-rule-summary__keyword scene-rule-summary__keyword--debounce">{{ $t('IotSceneLinkage.debounce.enable') }}</span>
      <span class="scene-rule-summary__field scene-rule-summary__field--debounce">{{ debounceSummary }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { getProduct, queryDeviceAlarmPreprocesses } from '../../../../api/scene-linkage'
import { formatSceneDuration, type SceneLinkageForm, type SceneMultiTriggerForm, type SceneTimeRange } from '../../utils'
import { formatDeviceScopeText, formatDeviceScopeTitle, formatProductScopeText, toTriggerScopeValue, type SceneDeviceScopeValue } from '../deviceScopeLabel'
import { toThingModelOptions } from '../thingModel'

const props = defineProps({ form: { type: Object as PropType<SceneLinkageForm>, required: true }, users: { type: Array as PropType<Array<{ id?: string; name?: string }>>, default: () => [] } })
const emit = defineEmits<{
  (event: 'change', value: string): void
  (event: 'title-change', value: string): void
}>()
const { t } = useI18n()
const products = ref<Record<string, any>>({})
const alarmNames = ref<Record<string, string>>({})
const snapshot = ref('')
const resolved = ref(false)
const hasRuleConfiguration = computed(() => Boolean(
  props.form.triggerKind
  || props.form.multiTriggers?.length
  || props.form.additionalConditions.length
  || props.form.actions.length,
))
// 当前快速规则始终按片段预览；历史摘要只作为无法识别任何快速规则时的只读兜底。
const showSnapshot = computed(() => Boolean(snapshot.value) && !hasRuleConfiguration.value)
const triggerForms = computed(() => props.form.multiTriggers?.length ? props.form.multiTriggers : [props.form])
const isVisualAiAlarm = (alarm: any) => alarm.sourceKind === 'visual-ai' || alarm.targetType === 'aiTaskMediaTarget'
const productIds = computed(() => [...new Set([
  ...triggerForms.value.flatMap(trigger => [trigger.productId, trigger.alarm.options?.productId]),
  props.form.alarm.options?.productId,
  ...props.form.additionalConditions.map((item: any) => item.productId || item.alarm?.options?.productId),
  ...props.form.actions.map(action => action.config?.productId),
].filter(Boolean) as string[])])
const deviceAlarmIds = computed(() => [...new Set([
  ...triggerForms.value.map(trigger => trigger.alarm),
  props.form.alarm,
  ...props.form.additionalConditions.filter((item: any) => item.type === 'alarmState').map((item: any) => item.alarm),
].filter(alarm => !isVisualAiAlarm(alarm)).map(alarm => alarm.alarmConfigId).filter(Boolean) as string[])])
const productName = (id?: string) => id ? products.value[id]?.name || (id === props.form.productId ? props.form.productName : '') || id : ''
const productScopeName = (form: SceneMultiTriggerForm, full = false) => formatProductScopeText(t, productName(form.productId), (full ? formatDeviceScopeTitle : formatDeviceScopeText)(t, toTriggerScopeValue(form)))
/** 快速配置已限定单个固定设备；摘要优先显示设备名称，旧范围配置仍保留原有范围描述。 */
const quickDeviceName = (scope: SceneDeviceScopeValue) => {
  if (scope.selector !== 'fixed' || scope.selectorValues?.length !== 1) return ''
  const device = scope.selectorValues[0]
  return device.name || scope.options?.names?.[0] || device.value || ''
}
const triggerTargetName = (form: SceneMultiTriggerForm, full = false) => quickDeviceName(toTriggerScopeValue(form)) || productScopeName(form, full)
const conditionTargetName = (condition: any, full = false) => {
  const scope = { selector: condition.selector, selectorValues: condition.selectorValues, options: condition.options } as SceneDeviceScopeValue
  return quickDeviceName(scope) || formatProductScopeText(t, productName(condition.productId), (full ? formatDeviceScopeTitle : formatDeviceScopeText)(t, scope))
}
const actionTargetName = (action: any, full = false) => {
  const scope = { selector: action.config?.selector, selectorValues: action.config?.selectorValues, options: action.config?.options } as SceneDeviceScopeValue
  return quickDeviceName(scope) || formatProductScopeText(t, productName(action.config?.productId), (full ? formatDeviceScopeTitle : formatDeviceScopeText)(t, scope))
}
const propertyLabel = (productId: string | undefined, id: string | undefined) => {
  const property = products.value[productId || '']?.metadata?.properties?.find((item: any) => item.id === id)
  const option = toThingModelOptions(property ? [property] : [], 'property')[0]
  if (!option) return property?.name || id || ''
  return option.unit ? `${option.label}（${option.unit}）` : option.label
}
const eventName = (productId: string | undefined, id: string | undefined) => products.value[productId || '']?.metadata?.events?.find((item: any) => item.id === id)?.name || id || ''
const functionName = (productId: string | undefined, id: string | undefined) => products.value[productId || '']?.metadata?.functions?.find((item: any) => item.id === id)?.name || id || ''
const alarmName = (alarm: any) => alarm.options?.alarmConfigName || alarmNames.value[alarm.alarmConfigId || ''] || alarm.alarmConfigId || ''
const timeRangeLabel = (range: SceneTimeRange) => {
  if (range.start === '08:00' && range.end === '20:00') return `${t('IotSceneLinkage.effectivePeriod.daytime')} ${range.start}–${range.end}`
  if (range.start === '09:00' && range.end === '18:00') return `${t('IotSceneLinkage.timeTemplate.workday')} ${range.start}–${range.end}`
  if (range.start === '20:00' && range.end === '08:00') return `${t('IotSceneLinkage.timeTemplate.evening')} ${range.start}–${range.end}`
  return `${t('IotSceneLinkage.timeTemplate.custom')} ${range.start}–${range.end}`
}
type SummaryPart = { text: string; title?: string; field?: boolean }
const summaryPlainText = (text: unknown): SummaryPart => ({ text: String(text ?? '') })
const summaryField = (text: unknown, title?: unknown): SummaryPart => ({ text: String(text ?? ''), title: title === undefined ? undefined : String(title), field: true })
const validSummaryParts = (parts: SummaryPart[]) => parts.filter(part => Boolean(part.text))
/** 将保存的单一 AI 结果条件转换为用户术语，不向摘要泄露内部字段名。 */
const aiEventConditionText = (condition: SceneMultiTriggerForm['aiEvent']['condition']) => {
  if (!condition) return ''
  if (condition.column === 'hitResults') {
    if (condition.termType === 'isnull') return t('IotSceneLinkage.aiEvent.conditionValue.noDecision')
    const value = condition.value === 1
      ? t('IotSceneLinkage.aiEvent.conditionValue.hit')
      : t('IotSceneLinkage.aiEvent.conditionValue.miss')
    return `${t('IotSceneLinkage.aiEvent.condition.hitResults')} ${t('IotSceneLinkage.term.eq')} ${value}`
  }
  const name = t(`IotSceneLinkage.aiEvent.condition.${condition.column}`)
  if (condition.termType === 'isnull') return `${name} ${t('IotSceneLinkage.term.isnull')}`
  return `${name} ${t(`IotSceneLinkage.term.${condition.termType || 'eq'}`)} ${condition.value ?? ''}`
}
/** 快速视觉规则以时间窗口和次数呈现，避免在规则预览中暴露内部结果字段。 */
const aiEventRecognitionRuleText = (rule: SceneMultiTriggerForm['aiEvent']['recognitionRule']) => {
  if (!rule) return ''
  const time = formatSceneDuration(t, rule.time)
  return rule.type === 'hits'
    ? t('IotSceneLinkage.aiEvent.rule.hitsPreview', { time, count: rule.threshold })
    : t('IotSceneLinkage.aiEvent.rule.missedPreview', { time })
}
const triggerSummaryTextFor = (form: SceneMultiTriggerForm, full = false) => {
  if (form.triggerKind === 'property') return `${triggerTargetName(form, full)}${t('IotSceneLinkage.summary.deviceThingModelConnector')}${propertyLabel(form.productId, form.propertyId)} ${t(`IotSceneLinkage.term.${form.termType}`)} ${form.termValue ?? ''}`
  if (form.triggerKind === 'event') return `${triggerTargetName(form, full)} ${t('IotSceneLinkage.summary.report')} ${eventName(form.productId, form.eventId)}`
  if (form.triggerKind === 'online' || form.triggerKind === 'offline') return `${triggerTargetName(form, full)} ${t(`IotSceneLinkage.summary.${form.triggerKind}`)}`
  if (form.triggerKind === 'state') {
    if (form.deviceState === 'any') return t('IotSceneLinkage.summary.stateAny', { product: triggerTargetName(form, full) })
    const state = t(`IotSceneLinkage.stateCondition.${form.deviceState}`)
    return form.deviceStateTriggerMode === 'sustained'
      ? t('IotSceneLinkage.summary.stateSustained', { product: triggerTargetName(form, full), state, time: form.deviceStateSustainedTime })
      : t('IotSceneLinkage.summary.state', { product: triggerTargetName(form, full), state })
  }
  if (form.triggerKind === 'repeat') {
    const repeatLabel = form.repeatMode === 'custom'
      ? t('IotSceneLinkage.summary.customTime')
      : t(`IotSceneLinkage.repeat.${form.repeatMode}`)
    return form.repeatTime ? `${repeatLabel} ${form.repeatTime}` : repeatLabel
  }
  if (form.triggerKind === 'date') return form.dateTime || ''
  if (form.triggerKind === 'interval') return t('IotSceneLinkage.summary.interval', { time: form.interval, unit: t(`IotSceneLinkage.unit.${form.intervalUnit}`) })
  if (form.triggerKind === 'ai-event') {
    const mediaTargets = form.aiEvent.mediaTargets || []
    const scope = t('IotSceneLinkage.summary.aiEvent', {
      scene: form.aiEvent.sceneName || form.aiEvent.sceneId || '',
      target: form.aiEvent.taskTargetName || form.aiEvent.taskTarget || '',
      scope: mediaTargets.length
        ? t('IotSceneLinkage.aiEvent.cameraCount', { count: mediaTargets.length })
        : t('IotSceneLinkage.aiEvent.allCameras'),
    })
    const condition = aiEventRecognitionRuleText(form.aiEvent.recognitionRule)
      || aiEventConditionText(form.aiEvent.condition)
    return condition
      ? t('IotSceneLinkage.summary.aiEventWithCondition', { event: scope, condition })
      : scope
  }
  if (form.triggerKind === 'alarm') {
    const state = form.alarm.modes?.[0] === 'relieve' ? 'normal' : 'warning'
    if (isVisualAiAlarm(form.alarm)) return t('IotSceneLinkage.summary.visualAiAlarm', {
      scene: form.alarm.options?.sceneName || form.alarm.options?.sceneId || '',
      target: form.alarm.options?.taskTargetName || form.alarm.options?.taskTarget || '',
      task: alarmName(form.alarm),
      state: t(`IotSceneLinkage.alarmState.${state}`),
    })
    return `${productName(form.alarm.options?.productId)}${t('IotSceneLinkage.alarmPhrase.ofAlarm')}${alarmName(form.alarm)}${t('IotSceneLinkage.alarmPhrase.becomes')}${t(`IotSceneLinkage.alarmState.${state}`)}`
  }
  return form.triggerKind === 'manual' ? t('IotSceneLinkage.summary.manual') : form.triggerKind ? t(`IotSceneLinkage.trigger.${form.triggerKind}`) : ''
}
/** 把规则句子拆成普通叙述与可识别的业务值，只有后者使用色块，避免整段摘要像一个不可读的大标签。 */
const triggerSummaryPartsFor = (form: SceneMultiTriggerForm): SummaryPart[] => {
  const scope = triggerTargetName(form)
  const scopeTitle = triggerTargetName(form, true)
  if (form.triggerKind === 'property') return validSummaryParts([
    summaryField(scope, scopeTitle), summaryPlainText(t('IotSceneLinkage.summary.deviceThingModelConnector')), summaryField(propertyLabel(form.productId, form.propertyId)), summaryPlainText(t(`IotSceneLinkage.term.${form.termType}`)), summaryField(form.termValue),
  ])
  if (form.triggerKind === 'event') return validSummaryParts([
    summaryField(scope, scopeTitle), summaryPlainText(t('IotSceneLinkage.summary.report')), summaryField(eventName(form.productId, form.eventId)),
  ])
  if (form.triggerKind === 'online' || form.triggerKind === 'offline') return validSummaryParts([
    summaryField(scope, scopeTitle), summaryPlainText(t(`IotSceneLinkage.summary.${form.triggerKind}`)),
  ])
  if (form.triggerKind === 'state') {
    const state = t(`IotSceneLinkage.stateCondition.${form.deviceState}`)
    if (form.deviceState === 'any') return validSummaryParts([summaryField(scope, scopeTitle), summaryPlainText(t('IotSceneLinkage.stateCondition.anyPhrasePrefix'))])
    return form.deviceStateTriggerMode === 'sustained'
      ? validSummaryParts([summaryField(scope, scopeTitle), summaryField(state), summaryPlainText(t('IotSceneLinkage.stateTriggerMode.sustained')), summaryField(formatSceneDuration(t, form.deviceStateSustainedTime)), summaryPlainText(t('IotSceneLinkage.summary.afterTrigger'))])
      : validSummaryParts([summaryField(scope, scopeTitle), summaryPlainText(t('IotSceneLinkage.stateCondition.phrasePrefix')), summaryField(state)])
  }
  if (form.triggerKind === 'repeat') {
    const repeatLabel = form.repeatMode === 'custom' ? t('IotSceneLinkage.summary.customTime') : t(`IotSceneLinkage.repeat.${form.repeatMode}`)
    return validSummaryParts([summaryField(repeatLabel), summaryField(form.repeatTime)])
  }
  if (form.triggerKind === 'date') return validSummaryParts([summaryField(form.dateTime)])
  if (form.triggerKind === 'interval') return validSummaryParts([summaryPlainText(t('IotSceneLinkage.editor.every')), summaryField(`${form.interval} ${t(`IotSceneLinkage.unit.${form.intervalUnit}`)}`)])
  if (form.triggerKind === 'ai-event') {
    const mediaTargets = form.aiEvent.mediaTargets || []
    const cameraScope = mediaTargets.length ? t('IotSceneLinkage.aiEvent.cameraCount', { count: mediaTargets.length }) : t('IotSceneLinkage.aiEvent.allCameras')
    return validSummaryParts([
      summaryField(form.aiEvent.sceneName || form.aiEvent.sceneId), summaryField(form.aiEvent.taskTargetName || form.aiEvent.taskTarget), summaryPlainText(t('IotSceneLinkage.aiEvent.phrase.at')), summaryField(cameraScope), summaryPlainText(t('IotSceneLinkage.aiEvent.phrase.resultProduced')), summaryField(aiEventRecognitionRuleText(form.aiEvent.recognitionRule) || aiEventConditionText(form.aiEvent.condition)),
    ])
  }
  if (form.triggerKind === 'alarm') {
    const state = t(`IotSceneLinkage.alarmState.${form.alarm.modes?.[0] === 'relieve' ? 'normal' : 'warning'}`)
    if (isVisualAiAlarm(form.alarm)) return validSummaryParts([
      summaryField(form.alarm.options?.sceneName || form.alarm.options?.sceneId), summaryField(form.alarm.options?.taskTargetName || form.alarm.options?.taskTarget), summaryPlainText(t('IotSceneLinkage.alarmPhrase.ofAlarm')), summaryField(alarmName(form.alarm)), summaryPlainText(t('IotSceneLinkage.alarmPhrase.becomes')), summaryField(state),
    ])
    return validSummaryParts([
      summaryField(productName(form.alarm.options?.productId)), summaryPlainText(t('IotSceneLinkage.alarmPhrase.ofAlarm')), summaryField(alarmName(form.alarm)), summaryPlainText(t('IotSceneLinkage.alarmPhrase.becomes')), summaryField(state),
    ])
  }
  return validSummaryParts([summaryPlainText(triggerSummaryTextFor(form))])
}
const triggerSummaries = computed(() => triggerForms.value.map(form => ({ text: triggerSummaryTextFor(form), title: triggerSummaryTextFor(form, true), parts: triggerSummaryPartsFor(form) })).filter(item => item.text))
// 仅左侧快捷时段受防抖开关影响，右侧单独添加的时间条件仍会参与规则。
const conditionSummaries = computed(() => props.form.additionalConditions
  .filter(condition => condition.type !== 'timeRange' || condition.source !== 'effective-period' || props.form.debounceEnabled)
  .map((condition) => {
  if (condition.type === 'timeRange') {
    const value = condition.ranges.map(timeRangeLabel).join('、')
    return { type: 'text' as const, value, title: value, parts: [summaryField(value)] }
  }
  if (condition.type === 'deviceProperty') {
    const target = conditionTargetName(condition)
    const targetTitle = conditionTargetName(condition, true)
    const property = propertyLabel(condition.productId, condition.propertyId)
    const connector = t('IotSceneLinkage.summary.deviceThingModelConnector')
    const text = `${target}${connector}${property} ${t(`IotSceneLinkage.term.${condition.termType}`)} ${condition.value}`
    const title = `${targetTitle}${connector}${property} ${t(`IotSceneLinkage.term.${condition.termType}`)} ${condition.value}`
    return { type: 'text' as const, value: text, title, parts: validSummaryParts([summaryField(target, targetTitle), summaryPlainText(connector), summaryField(property), summaryPlainText(t(`IotSceneLinkage.term.${condition.termType}`)), summaryField(condition.value)]) }
  }
  const target = productName(condition.alarm.options?.productId)
  const alarm = alarmName(condition.alarm)
  const state = t(`IotSceneLinkage.alarmState.${condition.alarm.state}`)
  return { type: 'alarm' as const, target, alarm, state, title: `${target}${t('IotSceneLinkage.alarmPhrase.ofAlarm')}${alarm}${t('IotSceneLinkage.alarmPhrase.currentState')}${state}` }
}))
type ActionSummary = { type: 'notify'; channel: string; users: string[]; hasMore: boolean; title: string } | { type: 'text'; value: string; title: string; parts: SummaryPart[] }
const actionSummaries = computed<ActionSummary[]>(() => props.form.actions.map((action: any) => {
  if (action.type === 'delay') {
    const value = `${t('IotSceneLinkage.action.delay')} ${action.time} ${t(`IotSceneLinkage.unit.${action.unit}`)}`
    return { type: 'text', value, title: value, parts: [summaryPlainText(t('IotSceneLinkage.action.delay')), summaryField(`${action.time} ${t(`IotSceneLinkage.unit.${action.unit}`)}`)] }
  }
  if (action.type === 'sceneNotify') {
    const users = (action.config?.userIds || []).map((id: string) => props.users.find(user => user.id === id)?.name).filter(Boolean) as string[]
    const channel = action.options?.channelName || t('IotSceneLinkage.action.notify')
    return { type: 'notify', channel, users: users.slice(0, 3), hasMore: users.length > 3, title: `${t('IotSceneLinkage.action.send')} ${channel} ${t('IotSceneLinkage.action.to')} ${users.join('、')}` }
  }
  if (action.type === 'alarmCount') return { type: 'text', value: t('IotSceneLinkage.action.alarmCount'), title: t('IotSceneLinkage.action.alarmCount'), parts: [summaryPlainText(t('IotSceneLinkage.action.alarmCount'))] }
  const message = action.config?.message || {}; const id = message.messageType === 'INVOKE_FUNCTION' ? message.functionId : message.messageType === 'WRITE_PROPERTY' ? Object.keys(message.properties || {})[0] : message.properties?.[0]
  const target = actionTargetName(action)
  const targetTitle = actionTargetName(action, true)
  const operation = message.messageType === 'WRITE_PROPERTY' ? t('IotSceneLinkage.action.writeProperty') : message.messageType === 'INVOKE_FUNCTION' ? t('IotSceneLinkage.action.executeFunction') : t('IotSceneLinkage.action.readProperty')
  const thingModelName = message.messageType === 'INVOKE_FUNCTION' ? functionName(action.config?.productId, id) : propertyLabel(action.config?.productId, id)
  return { type: 'text', value: `${target} ${operation} ${thingModelName}`, title: `${targetTitle} ${operation} ${thingModelName}`, parts: validSummaryParts([summaryField(target, targetTitle), summaryPlainText(operation), summaryField(thingModelName)]) }
}))
const debounceSummary = computed(() => {
  if (!props.form.debounceEnabled || !props.form.debounceLimitEnabled) return ''
  return props.form.debounceMode === 'continuous'
    ? t('IotSceneLinkage.debounce.summary.continuous', { time: formatSceneDuration(t, props.form.debounceTime) })
    : t('IotSceneLinkage.debounce.summary.interval', { time: formatSceneDuration(t, props.form.debounceTime) })
})
const actionSummaryText = (action: ActionSummary) => action.type === 'notify'
  ? `${t('IotSceneLinkage.action.send')} ${action.channel} ${t('IotSceneLinkage.action.to')} ${action.users.join('、')}${action.hasMore ? t('IotSceneLinkage.summary.andMore') : ''}`
  : action.value
const actionSummaryTitle = (action: ActionSummary) => action.title || actionSummaryText(action)
const conditionSummaryText = (condition: typeof conditionSummaries.value[number]) => condition.type === 'alarm' ? `${condition.target}${t('IotSceneLinkage.alarmPhrase.ofAlarm')}${condition.alarm}${t('IotSceneLinkage.alarmPhrase.currentState')}${condition.state}` : condition.value
const conditionSummaryTitle = (condition: typeof conditionSummaries.value[number]) => condition.title || conditionSummaryText(condition)
const summaryText = computed(() => [
  `${t('IotSceneLinkage.rule.when')} ${triggerSummaries.value.length ? triggerSummaries.value.map(item => item.text).join(` ${t('IotSceneLinkage.rule.or')} `) : t('IotSceneLinkage.rule.noTrigger')}`,
  conditionSummaries.value.length ? `${t('IotSceneLinkage.rule.and')} ${conditionSummaries.value.map(conditionSummaryText).join(`，${t('IotSceneLinkage.rule.and')} `)}` : '',
  `${t('IotSceneLinkage.summary.then')} ${actionSummaries.value.length ? actionSummaries.value.map(actionSummaryText).join('，') : t('IotSceneLinkage.rule.noAction')}`,
  debounceSummary.value ? `${t('IotSceneLinkage.debounce.enable')} ${debounceSummary.value}` : '',
].filter(Boolean).join('，'))
const summaryTitleText = computed(() => [
  `${t('IotSceneLinkage.rule.when')} ${triggerSummaries.value.length ? triggerSummaries.value.map(item => item.title || item.text).join(` ${t('IotSceneLinkage.rule.or')} `) : t('IotSceneLinkage.rule.noTrigger')}`,
  conditionSummaries.value.length ? `${t('IotSceneLinkage.rule.and')} ${conditionSummaries.value.map(conditionSummaryTitle).join(`，${t('IotSceneLinkage.rule.and')} `)}` : '',
  `${t('IotSceneLinkage.summary.then')} ${actionSummaries.value.length ? actionSummaries.value.map(actionSummaryTitle).join('，') : t('IotSceneLinkage.rule.noAction')}`,
  debounceSummary.value ? `${t('IotSceneLinkage.debounce.enable')} ${debounceSummary.value}` : '',
].filter(Boolean).join('，'))
// 空规则由当前表单直接渲染；不把本组件刚写回的空摘要当作历史快照，否则会出现“当 当 … 就 就 …”。
watch(() => props.form.summary, value => {
  // 不接收本组件生成的空规则文案，避免空页面又回退到历史摘要分支。
  if (value && !hasRuleConfiguration.value && value !== summaryText.value && !snapshot.value) snapshot.value = value
}, { immediate: true })
watch(productIds, async ids => {
  const unloaded = ids.filter(id => !products.value[id])
  try {
    if (!unloaded.length) return
    const values = await Promise.all(unloaded.map(async id => {
      const response: any = await getProduct(id)
      const product = response?.result ?? response
      return [id, { ...product, metadata: typeof product?.metadata === 'string' ? JSON.parse(product.metadata) : product?.metadata || {} }]
    }))
    products.value = { ...products.value, ...Object.fromEntries(values) }
  } finally {
    // 资源接口异常时仍展示当前规则的可用字段，不能永久落回旧摘要。
    resolved.value = true
  }
}, { immediate: true })
watch(deviceAlarmIds, async ids => { const missing = ids.filter(id => !alarmNames.value[id]); if (!missing.length) return; const result: any = await queryDeviceAlarmPreprocesses({ pageIndex: 0, pageSize: 100, terms: [{ column: 'id', termType: 'in', value: missing }] }); const rows = result?.result?.data || result?.data || []; alarmNames.value = { ...alarmNames.value, ...Object.fromEntries(rows.map((item: any) => [item.id, item.name || item.id])) } }, { immediate: true })
watch([summaryText, resolved], ([value]) => { if (resolved.value || props.form.multiTriggers?.length) emit('change', value) }, { immediate: true })
watch([summaryTitleText, resolved], ([value]) => { if (resolved.value || props.form.multiTriggers?.length) emit('title-change', value) }, { immediate: true })
</script>

<style scoped>
.scene-rule-summary { display: grid; gap: 8px; line-height: 28px; }.scene-rule-summary__clause { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; width: max-content; max-width: 100%; }.scene-rule-summary__clause--trigger { color: #d46b08; }.scene-rule-summary__clause--condition { color: #087443; }.scene-rule-summary__clause--action { color: var(--ant-color-primary); }.scene-rule-summary__clause--debounce { color: #6c4fe0; }
.scene-rule-summary__keyword { padding: 0 8px; border-radius: 4px; font-weight: 600; }.scene-rule-summary__keyword--trigger { color: #d46b08; background: #fff1d6; }.scene-rule-summary__keyword--condition { color: #087443; background: #e8f7ef; }.scene-rule-summary__keyword--action { color: var(--ant-color-primary); background: #e6f0ff; }.scene-rule-summary__keyword--debounce { color: #6c4fe0; background: #efebff; }
.scene-rule-summary__field { padding: 0 8px; border-radius: 4px; }.scene-rule-summary__field--trigger { color: #ad6800; background: #fff7e6; }.scene-rule-summary__field--condition { color: #087443; background: #f0fff7; }.scene-rule-summary__field--action { color: var(--ant-color-primary); background: #eef4ff; }.scene-rule-summary__field--debounce { color: #6c4fe0; background: #efebff; }
.scene-rule-summary__action-text { color: var(--ant-color-primary); }
.scene-rule-summary__clause .scene-rule-summary__empty { padding: 0; color: #86909c; background: transparent; }
.scene-rule-summary__snapshot { color: var(--ant-color-text); }
</style>
