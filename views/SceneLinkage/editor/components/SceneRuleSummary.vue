<template>
  <div v-if="showSnapshot" class="scene-rule-summary scene-rule-summary--snapshot"><span class="scene-rule-summary__snapshot">{{ snapshot }}</span></div>
  <div v-else class="scene-rule-summary">
    <div v-if="triggerForms.length" class="scene-rule-summary__clause scene-rule-summary__clause--trigger">
      <span class="scene-rule-summary__keyword scene-rule-summary__keyword--trigger">{{ $t('IotSceneLinkage.rule.when') }}</span>
      <template v-if="triggerSummaries.length"><template v-for="(summary, index) in triggerSummaries" :key="index"><SceneSummaryParts :parts="summary.parts" /><span v-if="index < triggerSummaries.length - 1">{{ $t('IotSceneLinkage.rule.or') }}</span></template></template>
      <span v-else class="scene-rule-summary__empty">{{ $t('IotSceneLinkage.rule.previewNoTrigger') }}</span>
    </div>
    <div v-for="(condition, index) in conditionSummaries" :key="index" class="scene-rule-summary__clause scene-rule-summary__clause--condition">
      <span class="scene-rule-summary__keyword scene-rule-summary__keyword--condition">{{ $t('IotSceneLinkage.rule.and') }}</span>
      <SceneSummaryParts :parts="condition.parts" />
    </div>
    <template v-if="actionSummaries.length">
      <div v-for="(action, index) in actionSummaries" :key="index" class="scene-rule-summary__clause scene-rule-summary__clause--action">
        <span :class="['scene-rule-summary__keyword', 'scene-rule-summary__keyword--action', { 'scene-rule-summary__keyword--continuation': index > 0 }]" :aria-hidden="index > 0">{{ $t('IotSceneLinkage.summary.then') }}</span>
        <SceneSummaryParts :parts="action.parts" />
      </div>
    </template>
    <div v-else class="scene-rule-summary__clause scene-rule-summary__clause--action"><span class="scene-rule-summary__keyword scene-rule-summary__keyword--action">{{ $t('IotSceneLinkage.summary.then') }}</span><span class="scene-rule-summary__empty">{{ $t('IotSceneLinkage.rule.previewNoAction') }}</span></div>
    <div v-if="debounceSummary" class="scene-rule-summary__clause scene-rule-summary__clause--debounce"><span class="scene-rule-summary__keyword scene-rule-summary__keyword--debounce">{{ $t('IotSceneLinkage.debounce.enable') }}</span><SceneSummaryParts :parts="[summaryField(debounceSummary)]" /></div>
  </div>
</template>

<script setup lang="ts">
import SceneSummaryParts from './SceneSummaryParts.vue'
import { quickTriggerSummaryParts } from '../quickTriggerSummary'
import { actionNodeSummaryParts } from '../actionNodeSummary'
import { conditionNodeSummaryParts } from '../conditionNodeSummary'
import { summaryField, summaryPartsText } from '../summaryParts'
import { computed, ref, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { getProduct, queryDeviceAlarmPreprocesses, type SceneNotifyUser } from '../../../../api/scene-linkage'
import { formatSceneDuration, type SceneLinkageForm, type SceneMultiTriggerForm } from '../../utils'
import { formatDeviceScopeText, formatDeviceScopeTitle, formatProductScopeText, toTriggerScopeValue, type SceneDeviceScopeValue } from '../deviceScopeLabel'
import { toThingModelOptions } from '../thingModel'

const props = defineProps({ form: { type: Object as PropType<SceneLinkageForm>, required: true }, users: { type: Array as PropType<SceneNotifyUser[]>, default: () => [] } })
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
const productScopeName = (form: Omit<SceneMultiTriggerForm, 'clientId'>, full = false) => formatProductScopeText(t, productName(form.productId), (full ? formatDeviceScopeTitle : formatDeviceScopeText)(t, toTriggerScopeValue(form)))
/** 快速配置已限定单个固定设备；摘要优先显示设备名称，旧范围配置仍保留原有范围描述。 */
const quickDeviceName = (scope: SceneDeviceScopeValue) => {
  if (scope.selector !== 'fixed' || scope.selectorValues?.length !== 1) return ''
  const device = scope.selectorValues[0]
  return device.name || scope.options?.names?.[0] || device.value || ''
}
const triggerTargetName = (form: Omit<SceneMultiTriggerForm, 'clientId'>, full = false) => quickDeviceName(toTriggerScopeValue(form)) || productScopeName(form, full)
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
const triggerSummaries = computed(() => triggerForms.value.map(form => {
  const parts = quickTriggerSummaryParts(form, t, { target: triggerTargetName(form), targetTitle: triggerTargetName(form, true), property: propertyLabel(form.productId, form.propertyId), event: eventName(form.productId, form.eventId), alarm: alarmName(form.alarm), alarmTarget: productName(form.alarm.options?.productId) })
  return { text: summaryPartsText(parts), title: summaryPartsText(parts), parts }
}).filter(item => item.text))
// 仅左侧快捷时段受防抖开关影响，右侧单独添加的时间条件仍会参与规则。
const conditionSummaries = computed(() => props.form.additionalConditions
  .filter(condition => condition.type !== 'timeRange' || condition.source !== 'effective-period' || props.form.debounceEnabled)
  .map(condition => {
    const parts = conditionNodeSummaryParts(condition, t, condition.type === 'deviceProperty'
      ? { target: conditionTargetName(condition), property: propertyLabel(condition.productId, condition.propertyId) }
      : condition.type === 'alarmState' ? { target: productName(condition.alarm.options?.productId), alarm: alarmName(condition.alarm) } : {})
    const value = summaryPartsText(parts)
    return { value, title: value, parts }
  }))

const actionSummaries = computed(() => props.form.actions.map(action => {
  const config = action.config || {}
  const message = config.message || {}
  const id = message.messageType === 'INVOKE_FUNCTION' ? message.functionId : message.messageType === 'WRITE_PROPERTY' ? Object.keys(message.properties || {})[0] : message.properties?.[0]
  const property = message.messageType === 'INVOKE_FUNCTION' ? functionName(config.productId, id) : propertyLabel(config.productId, id)
  const native = { executor: action.type, delay: action, configuration: config, device: config, options: { ...config.options, ...action.options } }
  if (action.type === 'device') native.options = { ...native.options, name: actionTargetName(action), propertiesName: property }
  const parts = actionNodeSummaryParts(native, t, { users: props.users })
  return { value: summaryPartsText(parts), title: summaryPartsText(parts), parts }
}))

const debounceSummary = computed(() => {
  if (!props.form.debounceEnabled || !props.form.debounceLimitEnabled) return ''
  return props.form.debounceMode === 'continuous'
    ? t('IotSceneLinkage.debounce.summary.continuous', { time: formatSceneDuration(t, props.form.debounceTime) })
    : t('IotSceneLinkage.debounce.summary.interval', { time: formatSceneDuration(t, props.form.debounceTime) })
})
type ActionSummary = typeof actionSummaries.value[number]
const actionSummaryText = (action: ActionSummary) => action.value
const actionSummaryTitle = (action: ActionSummary) => action.title || action.value
const conditionSummaryText = (condition: typeof conditionSummaries.value[number]) => condition.value
const conditionSummaryTitle = (condition: typeof conditionSummaries.value[number]) => condition.title
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
.scene-rule-summary__keyword { padding: 0 8px; border-radius: 4px; font-weight: 600; }.scene-rule-summary__keyword--trigger { color: #d46b08; background: #fff1d6; }.scene-rule-summary__keyword--condition { color: #087443; background: #e8f7ef; }.scene-rule-summary__keyword--action { color: var(--ant-color-primary); background: #e6f0ff; }.scene-rule-summary__keyword--debounce { color: #6c4fe0; background: #efebff; }.scene-rule-summary__keyword--continuation { visibility: hidden; background: transparent; }
.scene-rule-summary__clause .scene-rule-summary__empty { padding: 0; color: #86909c; background: transparent; }
.scene-rule-summary__snapshot { color: var(--ant-color-text); }
</style>
