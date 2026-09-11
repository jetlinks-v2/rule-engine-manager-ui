<template>
  <div v-if="showSnapshot" class="scene-rule-summary"><span class="scene-rule-summary__snapshot">{{ snapshot }}</span></div>
  <div v-else class="scene-rule-summary">
    <span v-if="triggerForms.length" class="scene-rule-summary__clause scene-rule-summary__clause--trigger">
      <span class="scene-rule-summary__keyword scene-rule-summary__keyword--trigger">{{ $t('IotSceneLinkage.rule.when') }}</span>
      <template v-for="(summary, index) in triggerSummaries" :key="index">
        <span class="scene-rule-summary__field scene-rule-summary__field--trigger" :title="summary.title">{{ summary.text }}</span>
        <span v-if="index < triggerSummaries.length - 1">{{ $t('IotSceneLinkage.rule.or') }}</span>
      </template>
    </span>
    <span v-for="(condition, index) in conditionSummaries" :key="index" class="scene-rule-summary__clause scene-rule-summary__clause--condition">
      <span class="scene-rule-summary__keyword scene-rule-summary__keyword--condition">{{ $t('IotSceneLinkage.rule.and') }}</span>
      <template v-if="condition.type === 'alarm'">
        <span class="scene-rule-summary__field scene-rule-summary__field--condition" :title="condition.title">{{ condition.target }}</span><span>{{ $t('IotSceneLinkage.alarmPhrase.ofAlarm') }}</span>
        <span class="scene-rule-summary__field scene-rule-summary__field--condition" :title="condition.title">{{ condition.alarm }}</span><span>{{ $t('IotSceneLinkage.alarmPhrase.currentState') }}</span>
        <span class="scene-rule-summary__field scene-rule-summary__field--condition" :title="condition.title">{{ condition.state }}</span>
      </template>
      <span v-else class="scene-rule-summary__field scene-rule-summary__field--condition" :title="condition.title">{{ condition.value }}</span>
    </span>
    <span class="scene-rule-summary__clause scene-rule-summary__clause--action">
      <span class="scene-rule-summary__keyword scene-rule-summary__keyword--action">{{ $t('IotSceneLinkage.summary.then') }}</span>
      <template v-for="(action, index) in actionSummaries" :key="index">
        <template v-if="action.type === 'notify'">
          <span class="scene-rule-summary__action-text">{{ $t('IotSceneLinkage.action.send') }}</span>
          <span class="scene-rule-summary__field scene-rule-summary__field--action" :title="action.title">{{ action.channel }}</span>
          <span class="scene-rule-summary__action-text">{{ $t('IotSceneLinkage.action.to') }}</span>
          <span v-for="user in action.users" :key="user" class="scene-rule-summary__field scene-rule-summary__field--action" :title="action.title">{{ user }}</span>
          <span v-if="action.hasMore" class="scene-rule-summary__action-text">{{ $t('IotSceneLinkage.summary.andMore') }}</span>
        </template>
        <span v-else class="scene-rule-summary__field scene-rule-summary__field--action" :title="action.title">{{ action.value }}</span>
      </template>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { getProduct, queryDeviceAlarmPreprocesses } from '../../../../api/scene-linkage'
import type { SceneLinkageForm, SceneMultiTriggerForm, SceneTimeRange } from '../../utils'
import { formatDeviceScopeText, formatDeviceScopeTitle, formatProductScopeText, toTriggerScopeValue } from '../deviceScopeLabel'

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
const showSnapshot = computed(() => Boolean(snapshot.value) && !resolved.value && !props.form.multiTriggers?.length)
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
const propertyName = (productId: string | undefined, id: string | undefined) => products.value[productId || '']?.metadata?.properties?.find((item: any) => item.id === id)?.name || id || ''
const eventName = (productId: string | undefined, id: string | undefined) => products.value[productId || '']?.metadata?.events?.find((item: any) => item.id === id)?.name || id || ''
const functionName = (productId: string | undefined, id: string | undefined) => products.value[productId || '']?.metadata?.functions?.find((item: any) => item.id === id)?.name || id || ''
const alarmName = (alarm: any) => alarm.options?.alarmConfigName || alarmNames.value[alarm.alarmConfigId || ''] || alarm.alarmConfigId || ''
const timeRangeLabel = (range: SceneTimeRange) => {
  if (range.start === '09:00' && range.end === '18:00') return t('IotSceneLinkage.timeTemplate.workday')
  if (range.start === '20:00' && range.end === '08:00') return t('IotSceneLinkage.timeTemplate.evening')
  return `${t('IotSceneLinkage.timeTemplate.custom')} ${range.start}–${range.end}`
}
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
const triggerSummaryTextFor = (form: SceneMultiTriggerForm, full = false) => {
  if (form.triggerKind === 'property') return `${productScopeName(form, full)} ${propertyName(form.productId, form.propertyId)} ${t(`IotSceneLinkage.term.${form.termType}`)} ${form.termValue ?? ''}`
  if (form.triggerKind === 'event') return `${productScopeName(form, full)} ${t('IotSceneLinkage.summary.report')} ${eventName(form.productId, form.eventId)}`
  if (form.triggerKind === 'online' || form.triggerKind === 'offline') return `${productScopeName(form, full)} ${t(`IotSceneLinkage.summary.${form.triggerKind}`)}`
  if (form.triggerKind === 'state') {
    if (form.deviceState === 'any') return t('IotSceneLinkage.summary.stateAny', { product: productScopeName(form, full) })
    const state = t(`IotSceneLinkage.stateCondition.${form.deviceState}`)
    return form.deviceStateTriggerMode === 'sustained'
      ? t('IotSceneLinkage.summary.stateSustained', { product: productScopeName(form, full), state, time: form.deviceStateSustainedTime })
      : t('IotSceneLinkage.summary.state', { product: productScopeName(form, full), state })
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
    const condition = aiEventConditionText(form.aiEvent.condition)
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
const triggerSummaries = computed(() => triggerForms.value.map(form => ({ text: triggerSummaryTextFor(form), title: triggerSummaryTextFor(form, true) })).filter(item => item.text))
const conditionSummaries = computed(() => props.form.additionalConditions.map((condition) => {
  if (condition.type === 'timeRange') {
    const value = condition.ranges.map(timeRangeLabel).join('、')
    return { type: 'text' as const, value, title: value }
  }
  if (condition.type === 'deviceProperty') {
    const shortScopeText = formatDeviceScopeText(t, { selector: condition.selector, selectorValues: condition.selectorValues, options: condition.options })
    const fullScopeText = formatDeviceScopeTitle(t, { selector: condition.selector, selectorValues: condition.selectorValues, options: condition.options })
    const text = `${formatProductScopeText(t, productName(condition.productId), shortScopeText)} ${propertyName(condition.productId, condition.propertyId)} ${t(`IotSceneLinkage.term.${condition.termType}`)} ${condition.value}`
    const title = `${formatProductScopeText(t, productName(condition.productId), fullScopeText)} ${propertyName(condition.productId, condition.propertyId)} ${t(`IotSceneLinkage.term.${condition.termType}`)} ${condition.value}`
    return { type: 'text' as const, value: text, title }
  }
  const target = productName(condition.alarm.options?.productId)
  const alarm = alarmName(condition.alarm)
  const state = t(`IotSceneLinkage.alarmState.${condition.alarm.state}`)
  return { type: 'alarm' as const, target, alarm, state, title: `${target}${t('IotSceneLinkage.alarmPhrase.ofAlarm')}${alarm}${t('IotSceneLinkage.alarmPhrase.currentState')}${state}` }
}))
type ActionSummary = { type: 'notify'; channel: string; users: string[]; hasMore: boolean; title: string } | { type: 'text'; value: string; title: string }
const actionSummaries = computed<ActionSummary[]>(() => props.form.actions.map((action: any) => {
  if (action.type === 'delay') {
    const value = `${t('IotSceneLinkage.action.delay')} ${action.time} ${t(`IotSceneLinkage.unit.${action.unit}`)}`
    return { type: 'text', value, title: value }
  }
  if (action.type === 'sceneNotify') {
    const users = (action.config?.userIds || []).map((id: string) => props.users.find(user => user.id === id)?.name).filter(Boolean) as string[]
    const channel = action.options?.channelName || t('IotSceneLinkage.action.notify')
    return { type: 'notify', channel, users: users.slice(0, 3), hasMore: users.length > 3, title: `${t('IotSceneLinkage.action.send')} ${channel} ${t('IotSceneLinkage.action.to')} ${users.join('、')}` }
  }
  if (action.type === 'alarmCount') return { type: 'text', value: t('IotSceneLinkage.action.alarmCount'), title: t('IotSceneLinkage.action.alarmCount') }
  const message = action.config?.message || {}; const id = message.messageType === 'INVOKE_FUNCTION' ? message.functionId : message.messageType === 'WRITE_PROPERTY' ? Object.keys(message.properties || {})[0] : message.properties?.[0]
  const scopeText = formatDeviceScopeText(t, { selector: action.config?.selector, selectorValues: action.config?.selectorValues, options: action.config?.options })
  const scopeTitle = formatDeviceScopeTitle(t, { selector: action.config?.selector, selectorValues: action.config?.selectorValues, options: action.config?.options })
  const target = formatProductScopeText(t, productName(action.config?.productId), scopeText)
  const targetTitle = formatProductScopeText(t, productName(action.config?.productId), scopeTitle)
  const operation = message.messageType === 'WRITE_PROPERTY' ? t('IotSceneLinkage.action.writeProperty') : message.messageType === 'INVOKE_FUNCTION' ? t('IotSceneLinkage.action.executeFunction') : t('IotSceneLinkage.action.readProperty')
  const thingModelName = message.messageType === 'INVOKE_FUNCTION' ? functionName(action.config?.productId, id) : propertyName(action.config?.productId, id)
  return { type: 'text', value: `${target} ${operation} ${thingModelName}`, title: `${targetTitle} ${operation} ${thingModelName}` }
}))
const actionSummaryText = (action: ActionSummary) => action.type === 'notify'
  ? `${t('IotSceneLinkage.action.send')} ${action.channel} ${t('IotSceneLinkage.action.to')} ${action.users.join('、')}${action.hasMore ? t('IotSceneLinkage.summary.andMore') : ''}`
  : action.value
const actionSummaryTitle = (action: ActionSummary) => action.title || actionSummaryText(action)
const conditionSummaryText = (condition: typeof conditionSummaries.value[number]) => condition.type === 'alarm' ? `${condition.target}${t('IotSceneLinkage.alarmPhrase.ofAlarm')}${condition.alarm}${t('IotSceneLinkage.alarmPhrase.currentState')}${condition.state}` : condition.value
const conditionSummaryTitle = (condition: typeof conditionSummaries.value[number]) => condition.title || conditionSummaryText(condition)
const summaryText = computed(() => [
  triggerSummaries.value.length ? `${t('IotSceneLinkage.rule.when')} ${triggerSummaries.value.map(item => item.text).join(` ${t('IotSceneLinkage.rule.or')} `)}` : '',
  conditionSummaries.value.length ? `${t('IotSceneLinkage.rule.and')} ${conditionSummaries.value.map(conditionSummaryText).join(`，${t('IotSceneLinkage.rule.and')} `)}` : '',
  `${t('IotSceneLinkage.summary.then')} ${actionSummaries.value.map(actionSummaryText).join('，')}`,
].filter(Boolean).join('，'))
const summaryTitleText = computed(() => [
  triggerSummaries.value.length ? `${t('IotSceneLinkage.rule.when')} ${triggerSummaries.value.map(item => item.title || item.text).join(` ${t('IotSceneLinkage.rule.or')} `)}` : '',
  conditionSummaries.value.length ? `${t('IotSceneLinkage.rule.and')} ${conditionSummaries.value.map(conditionSummaryTitle).join(`，${t('IotSceneLinkage.rule.and')} `)}` : '',
  `${t('IotSceneLinkage.summary.then')} ${actionSummaries.value.map(actionSummaryTitle).join('，')}`,
].filter(Boolean).join('，'))
watch(() => props.form.summary, value => { if (value && !snapshot.value) { snapshot.value = value; resolved.value = false } }, { immediate: true })
watch(productIds, async ids => { const unloaded = ids.filter(id => !products.value[id]); if (unloaded.length) { const values = await Promise.all(unloaded.map(async id => { const response: any = await getProduct(id); const product = response?.result ?? response; return [id, { ...product, metadata: typeof product?.metadata === 'string' ? JSON.parse(product.metadata) : product?.metadata || {} }] })); products.value = { ...products.value, ...Object.fromEntries(values) } }; resolved.value = true }, { immediate: true })
watch(deviceAlarmIds, async ids => { const missing = ids.filter(id => !alarmNames.value[id]); if (!missing.length) return; const result: any = await queryDeviceAlarmPreprocesses({ pageIndex: 0, pageSize: 100, terms: [{ column: 'id', termType: 'in', value: missing }] }); const rows = result?.result?.data || result?.data || []; alarmNames.value = { ...alarmNames.value, ...Object.fromEntries(rows.map((item: any) => [item.id, item.name || item.id])) } }, { immediate: true })
watch([summaryText, resolved], ([value]) => { if (resolved.value || props.form.multiTriggers?.length) emit('change', value) }, { immediate: true })
watch([summaryTitleText, resolved], ([value]) => { if (resolved.value || props.form.multiTriggers?.length) emit('title-change', value) }, { immediate: true })
</script>

<style scoped>
.scene-rule-summary { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; line-height: 28px; }.scene-rule-summary__clause { display: inline-flex; flex-wrap: wrap; gap: 4px; align-items: center; padding: 0 8px; border-radius: 4px; }.scene-rule-summary__clause--trigger { color: #d46b08; background: #fff7e6; }.scene-rule-summary__clause--condition { color: #087443; background: #f0fff7; }.scene-rule-summary__clause--action { color: var(--ant-color-primary); background: #eef4ff; }.scene-rule-summary__clause :deep(.scene-rule-summary__field) { padding: 0; color: inherit; background: transparent; }
.scene-rule-summary__keyword { font-weight: 600; }.scene-rule-summary__keyword--trigger { color: #d46b08; }.scene-rule-summary__keyword--condition { color: #087443; }.scene-rule-summary__keyword--action { color: var(--ant-color-primary); }
.scene-rule-summary__field { padding: 0 8px; border-radius: 4px; }.scene-rule-summary__field--trigger { color: #ad6800; background: #fff7e6; }.scene-rule-summary__field--condition { color: #087443; background: #f0fff7; }.scene-rule-summary__field--action { color: var(--ant-color-primary); background: #eef4ff; }
.scene-rule-summary__action-text { color: var(--ant-color-primary); font-weight: 600; }
.scene-rule-summary__snapshot { color: var(--ant-color-text); }
</style>
