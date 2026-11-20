<template>
  <!-- 弹窗字段独立于多条件列表的整体校验状态。 -->
  <a-form-item no-style>
  <SceneNodeCard class="multi-trigger-card" variant="trigger" :title="triggerNodeTitle(trigger.triggerKind, t)" :icon="icon" :number="$t('IotSceneLinkage.editor.conditionNumber', { index: index + 1 })">
    <template #actions><a-tooltip :title="$t('IotSceneLinkage.action.edit')"><a-button type="text" @click="openEditor"><AIcon type="EditOutlined" /></a-button></a-tooltip><a-button v-if="removable" type="text" danger @click="$emit('remove')"><AIcon type="DeleteOutlined" /></a-button></template>
    <SceneTriggerSummary :form="trigger" />

    <a-modal v-if="isDevice" :open="productSelectorVisible" :title="$t('Device.AddModal.3725211-1')" :width="1180" :footer="null" :mask-closable="false" @cancel="cancelEditor">
      <section class="multi-trigger-card__product-step">
        <Product :row-key="trigger.productId" v-model:detail="productDetail" @change="changeProduct" />
        <footer><a-button @click="cancelEditor">{{ $t('IotSceneLinkage.action.cancel') }}</a-button><a-button type="primary" @click="openDeviceScope">{{ $t('IotSceneLinkage.action.next') }}</a-button></footer>
      </section>
    </a-modal>
    <DeviceScopeModal v-if="isDevice" :open="deviceEditorVisible" detailed multiple lock-product :title="$t(`IotSceneLinkage.trigger.${trigger.triggerKind}`)" :width="1180" :product-id="trigger.productId" :model-value="scope" :validate="validateDeviceTrigger" @cancel="cancelEditor" @save="saveScope">
      <template #toolbar-actions><a-button type="link" @click="changeProductStep">{{ $t('IotSceneLinkage.action.changeProduct') }}</a-button></template>
      <template #configuration>
        <a-form layout="vertical" class="multi-trigger-card__config">
          <p v-if="metadataLoading" role="status">{{ $t('IotSceneLinkage.message.metadataLoading') }}</p>
          <p v-else-if="metadataFailed" role="alert">{{ $t('IotSceneLinkage.message.metadataLoadFailed') }} <a-button type="link" @click="loadMetadata">{{ $t('IotSceneLinkage.action.retry') }}</a-button></p>
          <a-form-item :label="$t('IotSceneLinkage.form.triggerType')"><a-select :value="selectedDeviceTriggerKind" :options="deviceTriggerKinds" :loading="metadataLoading" :disabled="metadataLoading || metadataFailed" :placeholder="$t('IotSceneLinkage.placeholder.triggerType')" popup-class-name="scene-editor__resource-dropdown scene-editor__device-trigger-dropdown" :dropdown-match-select-width="true" @change="changeDeviceTriggerKind"><template #option="option"><div class="scene-editor__device-trigger-option"><span><AIcon :type="optionValue(option).icon" /></span><div><b>{{ optionValue(option).label }}</b><a-tooltip :title="optionValue(option).description"><small>{{ optionValue(option).description }}</small></a-tooltip></div></div></template></a-select></a-form-item>
          <a-form-item v-if="selectedDeviceTriggerKind === 'property'" :label="$t('IotSceneLinkage.condition.current')"><a-space direction="vertical" class="multi-trigger-card__config-fields"><ThingModelSelect v-model="trigger.propertyId" :options="propertyOptions" :placeholder="$t('IotSceneLinkage.placeholder.property')" @change="changeProperty" /><a-select v-model:value="trigger.termType" :options="termOptions" /><ThingModelValueInput v-model="trigger.termValue" :value-type="selectedProperty?.valueType" :unit="selectedProperty?.unit" /></a-space></a-form-item>
          <a-form-item v-else-if="selectedDeviceTriggerKind === 'event'" :label="$t('IotSceneLinkage.form.event')"><a-space direction="vertical" class="multi-trigger-card__config-fields"><ThingModelSelect v-model="trigger.eventId" :options="eventOptions" :placeholder="$t('IotSceneLinkage.placeholder.event')" @change="changeEvent" /><template v-if="trigger.eventId"><ThingModelSelect v-model="trigger.eventOutputId" :options="eventOutputOptions" :placeholder="$t('IotSceneLinkage.placeholder.eventOutput')" @change="changeEventOutput" /><a-select v-model:value="trigger.eventTermType" :options="eventTermOptions" /><ThingModelValueInput v-model="trigger.eventTermValue" :value-type="selectedEventOutput?.valueType" :placeholder="$t('IotSceneLinkage.placeholder.eventOutputValue')" /></template></a-space></a-form-item>
          <a-form-item v-else-if="selectedDeviceTriggerKind === 'state'" :label="$t('IotSceneLinkage.stateCondition.label')"><DeviceStateTriggerRow v-model:state="trigger.deviceState" v-model:mode="trigger.deviceStateTriggerMode" v-model:sustained-time="trigger.deviceStateSustainedTime" :removable="false" /></a-form-item>
        </a-form>
      </template>
      <template v-if="selectedDeviceTriggerKind" #preview><span v-if="(trigger.triggerKind === 'property' && (!trigger.propertyId || trigger.termValue === undefined || trigger.termValue === '')) || (trigger.triggerKind === 'event' && !trigger.eventId)">{{ $t('IotSceneLinkage.message.completeDeviceTrigger') }}</span><SceneTriggerSummary v-else :form="trigger" /></template>
    </DeviceScopeModal>
    <AlarmStateConditionModal
      v-else-if="trigger.triggerKind === 'alarm'"
      :open="triggerEditorVisible"
      :source-kind="trigger.alarm.sourceKind === 'visual-ai' ? 'visual-ai' : 'iot-device'"
      mode="trigger"
      :model-value="trigger.alarm"
      @update:model-value="trigger.alarm = $event"
      @cancel="cancelEditor"
      @save="saveEditor"
    />
    <AiEventTriggerRow
      v-else-if="trigger.triggerKind === 'ai-event'"
      :open="triggerEditorVisible"
      :model-value="trigger.aiEvent"
      @confirm="confirmAiEventTrigger"
      @cancel="cancelEditor"
    />
    <a-modal v-else :open="triggerEditorVisible" :title="$t(`IotSceneLinkage.trigger.${trigger.triggerKind}`)" :mask-closable="false" @cancel="cancelEditor" @ok="saveEditor">
      <div class="multi-trigger-card__editor">
        <template v-if="isTimer"><a-radio-group :value="trigger.triggerKind" @change="changeTimerTriggerKind"><a-radio-button value="repeat">{{ $t('IotSceneLinkage.timer.fixed') }}</a-radio-button><a-radio-button value="interval">{{ $t('IotSceneLinkage.timer.interval') }}</a-radio-button><a-radio-button value="date">{{ $t('IotSceneLinkage.timer.once') }}</a-radio-button></a-radio-group><template v-if="trigger.triggerKind === 'repeat'"><a-radio-group v-model:value="trigger.repeatMode"><a-radio-button value="daily">{{ $t('IotSceneLinkage.repeat.daily') }}</a-radio-button><a-radio-button value="weekdays">{{ $t('IotSceneLinkage.repeat.weekdays') }}</a-radio-button><a-radio-button value="weekends">{{ $t('IotSceneLinkage.repeat.weekends') }}</a-radio-button><a-radio-button value="custom">{{ $t('IotSceneLinkage.repeat.custom') }}</a-radio-button></a-radio-group><a-time-picker style="width: 128px; max-width: 100%" v-model:value="trigger.repeatTime" format="HH:mm" value-format="HH:mm" /><div v-if="trigger.repeatMode === 'custom'" class="multi-trigger-card__repeat-options"><a-radio-group v-model:value="trigger.repeatCustomMode" @change="resetRepeatSelections"><a-radio-button value="weekly">{{ $t('IotSceneLinkage.repeat.weekly') }}</a-radio-button><a-radio-button value="monthly">{{ $t('IotSceneLinkage.repeat.monthly') }}</a-radio-button></a-radio-group><a-checkbox-group v-if="trigger.repeatCustomMode === 'weekly'" v-model:value="trigger.repeatWeekdays" :options="weekOptions" /><a-checkbox-group v-else v-model:value="trigger.repeatMonthDays" :options="monthDayOptions" /></div></template><template v-else-if="trigger.triggerKind === 'date'"><a-date-picker style="width: 240px; max-width: 100%" v-model:value="trigger.dateTime" show-time value-format="YYYY-MM-DD HH:mm:ss" /><span>{{ $t('IotSceneLinkage.editor.dateExecutionHint') }}</span></template><template v-else><span>{{ $t('IotSceneLinkage.editor.every') }}</span><a-input-number v-model:value="trigger.interval" :min="1" /><a-select v-model:value="trigger.intervalUnit" :options="units" /><span>{{ $t('IotSceneLinkage.editor.triggerOnce') }}</span></template></template>
      </div>
      <p v-if="timerError" class="scene-editor__error-message" role="alert">{{ $t(timerError) }}</p>
      <SceneConfigPreview v-if="isTimer"><SceneTriggerSummary :form="trigger" /></SceneConfigPreview>
    </a-modal>
  </SceneNodeCard>
  </a-form-item>
</template>

<script setup lang="ts">
import SceneConfigPreview from './SceneConfigPreview.vue'
import { quickTimerValidation } from '../quickTimerValidation'
import SceneTriggerSummary from './SceneTriggerSummary.vue'
import { computed, ref, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { onlyMessage } from '@jetlinks-web-core/utils/comm'
import { useProductMetadata } from '../useProductMetadata'
import type { SceneAiEventTriggerConfig, SceneMultiTriggerForm } from '../../utils'
import AlarmStateConditionModal from './AlarmStateConditionModal.vue'
import AiEventTriggerRow from './AiEventTriggerRow.vue'
import DeviceScopeModal, { type DeviceScope } from './DeviceScopeModal.vue'
import DeviceStateTriggerRow from './DeviceStateTriggerRow.vue'
import ThingModelSelect from './ThingModelSelect.vue'
import ThingModelValueInput from './ThingModelValueInput.vue'
import SceneNodeCard from './SceneNodeCard.vue'
import { triggerNodeTitle } from '../triggerNodeSummary'
import { getTermTypes, toThingModelOptions } from '../thingModel'
import Product from '../../../Scene/Save/Device/Product.vue'

const props = defineProps({ trigger: { type: Object as PropType<SceneMultiTriggerForm>, required: true }, index: { type: Number, default: 0 }, removable: Boolean, autoOpen: Boolean })
const emit = defineEmits<{ (event: 'remove'): void; (event: 'opened'): void; (event: 'cancel-new'): void }>()
const { t } = useI18n()
const timerError = ref<string>(); const productSelectorVisible = ref(false); const deviceEditorVisible = ref(false); const triggerEditorVisible = ref(false); const originalTrigger = ref<SceneMultiTriggerForm>(); const createdByPicker = ref(false); const productDetail = ref<Record<string, any>>({})
const trigger = computed(() => props.trigger)
const { product: metadataProduct, metadata, loading: metadataLoading, failed: metadataFailed, load: loadMetadata } = useProductMetadata(() => trigger.value.productId)
const properties = computed(() => metadata.value.properties)
const events = computed(() => metadata.value.events)
const deviceTriggerChosen = ref(true)
const selectedDeviceTriggerKind = computed(() => !metadataLoading.value && !metadataFailed.value && deviceTriggerChosen.value && deviceTriggerKinds.value.some(item => item.value === trigger.value.triggerKind) ? trigger.value.triggerKind : undefined)
const isDevice = computed(() => ['property', 'event', 'online', 'offline', 'state'].includes(trigger.value.triggerKind))
const isTimer = computed(() => ['repeat', 'interval', 'date'].includes(trigger.value.triggerKind))
const deviceTriggerKinds = computed(() => [['property', 'RiseOutlined'], ['event', 'NotificationOutlined'], ['online', 'LoginOutlined'], ['offline', 'LogoutOutlined'], ['state', 'SyncOutlined']].filter(([value]) => value === 'property' ? propertyOptions.value.length : value === 'event' ? eventOptions.value.length : true).map(([value, icon]) => ({ value, icon, label: t(`IotSceneLinkage.trigger.${value}`), description: t(`IotSceneLinkage.triggerDesc.${value}`) })))
const icon = computed(() => ({ manual: 'ThunderboltOutlined', repeat: 'ClockCircleOutlined', date: 'CalendarOutlined', interval: 'SyncOutlined', property: 'RiseOutlined', event: 'NotificationOutlined', online: 'LoginOutlined', offline: 'LogoutOutlined', state: 'SyncOutlined', alarm: 'AlertOutlined', 'ai-event': 'RadarChartOutlined' }[trigger.value.triggerKind] || 'ThunderboltOutlined'))
const units = computed(() => ['seconds', 'minutes', 'hours'].map(value => ({ value, label: t(`IotSceneLinkage.unit.${value}`) })))
const weekOptions = computed(() => ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day, index) => ({ value: index + 1, label: t(`IotSceneLinkage.weekday.${day}`) })))
const monthDayOptions = computed(() => Array.from({ length: 31 }, (_, index) => ({ value: index + 1, label: t('IotSceneLinkage.monthDay', { day: index + 1 }) })))
const propertyOptions = computed(() => toThingModelOptions(properties.value, 'property')); const eventOptions = computed(() => toThingModelOptions(events.value, 'event')); const selectedProperty = computed(() => propertyOptions.value.find(item => item.value === trigger.value.propertyId)); const selectedEvent = computed(() => events.value.find(item => item.id === trigger.value.eventId)); const eventOutputOptions = computed(() => toThingModelOptions(selectedEvent.value?.outputs || selectedEvent.value?.output?.properties || selectedEvent.value?.output || selectedEvent.value?.valueType?.properties || [], 'property')); const selectedEventOutput = computed(() => eventOutputOptions.value.find(item => item.value === trigger.value.eventOutputId)); const termOptions = computed(() => getTermTypes(selectedProperty.value?.valueType).map(value => ({ value, label: t(`IotSceneLinkage.term.${value}`) }))); const eventTermOptions = computed(() => getTermTypes(selectedEventOutput.value?.valueType).map(value => ({ value, label: t(`IotSceneLinkage.term.${value}`) })))
const scope = computed(() => { const selector = trigger.value.allDevices ? 'all' : trigger.value.dynamicScope ? trigger.value.dynamicScopeType : 'fixed'; const values = trigger.value.dynamicScope ? trigger.value.groupIds : trigger.value.deviceIds; return { selector, selectorValues: values.map((value, index) => ({ value, name: trigger.value.scopeOptions.names?.[index] })), options: trigger.value.scopeOptions, productId: trigger.value.productId, productName: trigger.value.productName } })
/** 已有关联产品的设备触发器直接进入设备列表并回显范围；跨产品时才回到产品选择。 */
function openEditor() {
  timerError.value = undefined
  deviceTriggerChosen.value = !createdByPicker.value
  originalTrigger.value = JSON.parse(JSON.stringify(trigger.value)) as SceneMultiTriggerForm
  if (!isDevice.value) { triggerEditorVisible.value = true; return }
  if (!trigger.value.productId) { productSelectorVisible.value = true; return }
  deviceEditorVisible.value = true
  void loadMetadata()
}
function cancelEditor() { if (createdByPicker.value) emit('cancel-new'); else if (originalTrigger.value) Object.assign(trigger.value, originalTrigger.value); originalTrigger.value = undefined; createdByPicker.value = false; productSelectorVisible.value = false; deviceEditorVisible.value = false; triggerEditorVisible.value = false }
/** 视觉事件弹窗确认后才写回叶子，取消时沿用卡片的草稿回滚。 */
function confirmAiEventTrigger(value: SceneAiEventTriggerConfig) { trigger.value.aiEvent = value; saveEditor() }
function saveEditor() { timerError.value = quickTimerValidation(trigger.value); if (timerError.value) return; originalTrigger.value = undefined; createdByPicker.value = false; productSelectorVisible.value = false; deviceEditorVisible.value = false; triggerEditorVisible.value = false }
/** 产品变更会改变物模型边界，必须同步清理旧的范围和模型字段。 */
function changeProduct(product: Record<string, any>) { if (!product?.id) return; productDetail.value = product; if (trigger.value.productId !== String(product.id)) { deviceTriggerChosen.value = false; Object.assign(trigger.value, { productId: String(product.id), productName: product.name || String(product.id), allDevices: false, dynamicScope: false, dynamicScopeType: undefined, groupIds: [], deviceIds: [], propertyId: undefined, propertyName: undefined, eventId: undefined, eventName: undefined, eventOutputId: undefined, eventOutputName: undefined, termValue: undefined, eventTermValue: undefined }) }; if (trigger.value.productId === String(product.id)) trigger.value.productName = product.name || trigger.value.productName; void loadMetadata() }
function openDeviceScope() { if (!trigger.value.productId) { onlyMessage(t('IotSceneLinkage.message.selectProductFirst'), 'warning'); return } productSelectorVisible.value = false; deviceEditorVisible.value = true }
function changeProductStep() { deviceEditorVisible.value = false; productSelectorVisible.value = true }
/** 与单触发器一致，切换类型时清空物模型字段并恢复有效的默认运算符。 */
function changeDeviceTriggerKind(value: unknown) { if (!['property', 'event', 'online', 'offline', 'state'].includes(String(value))) return; deviceTriggerChosen.value = true; if (trigger.value.triggerKind === value) return; Object.assign(trigger.value, { triggerKind: value as SceneMultiTriggerForm['triggerKind'], propertyId: undefined, propertyName: undefined, termType: 'eq', termValue: undefined, eventId: undefined, eventName: undefined, eventOutputId: undefined, eventOutputName: undefined, eventTermType: 'eq', eventTermValue: undefined }) }
function optionValue(option: any) { return option?.data?.value ? option.data : option }
function changeTimerTriggerKind(event: { target?: { value?: unknown } }) { const value = event.target?.value; if (value === 'repeat' || value === 'interval' || value === 'date') trigger.value.triggerKind = value }
function validateDeviceTrigger() {
  if (!selectedDeviceTriggerKind.value) { onlyMessage(t('IotSceneLinkage.message.chooseDeviceTrigger'), 'warning'); return false }
  if (trigger.value.triggerKind === 'property' && (!propertyOptions.value.some(item => item.value === trigger.value.propertyId) || trigger.value.termValue === undefined || trigger.value.termValue === '')) {
    onlyMessage(t('IotSceneLinkage.message.propertyRequired'), 'warning')
    return false
  }
  if (trigger.value.triggerKind === 'event' && !eventOptions.value.some(item => item.value === trigger.value.eventId)) {
    onlyMessage(t('IotSceneLinkage.message.eventRequired'), 'warning')
    return false
  }
  return true
}
function saveScope(value: DeviceScope) { const dynamic = value.selector !== 'fixed' && value.selector !== 'all'; Object.assign(trigger.value, { productId: value.productId || trigger.value.productId, productName: value.productName || trigger.value.productName, allDevices: value.selector === 'all', dynamicScope: dynamic, dynamicScopeType: dynamic ? value.selector : undefined, scopeOptions: { ...value.options, names: value.selectorValues.map(item => item.name || item.value) }, groupIds: dynamic ? value.selectorValues.map(item => item.value) : [], deviceIds: value.selector === 'fixed' ? value.selectorValues.map(item => item.value) : [] }); saveEditor() }
function changeProperty(value?: string) { const option = propertyOptions.value.find(item => item.value === value); trigger.value.propertyName = option?.label; trigger.value.termValue = undefined }
function changeEvent(value?: string) { const option = eventOptions.value.find(item => item.value === value); Object.assign(trigger.value, { eventName: option?.label, eventOutputId: undefined, eventOutputName: undefined, eventTermValue: undefined }) }
function changeEventOutput(value?: string) { const option = eventOutputOptions.value.find(item => item.value === value); Object.assign(trigger.value, { eventOutputName: option?.label, eventTermValue: undefined }) }
function resetRepeatSelections() { trigger.value.repeatWeekdays = []; trigger.value.repeatMonthDays = [] }
watch(metadataProduct, product => { if (product?.name) trigger.value.productName ||= product.name })
watch(() => trigger.value.productId, () => { void loadMetadata() }, { immediate: true })
watch(() => props.autoOpen, value => { if (!value || productSelectorVisible.value || deviceEditorVisible.value || triggerEditorVisible.value) return; createdByPicker.value = true; openEditor(); emit('opened') }, { immediate: true })
</script>

<style scoped>
.multi-trigger-card { margin-top: var(--space-3, 12px); }.multi-trigger-card__config-fields { width: 100%; }.multi-trigger-card__config-fields :deep(.ant-select), .multi-trigger-card__config-fields :deep(.thing-model-select) { width: 100%; }.multi-trigger-card__editor { display: flex; flex-wrap: wrap; gap: var(--space-3, 12px); align-items: center; min-height: 8rem; }.multi-trigger-card__editor > :deep(.alarm-trigger-source-row), .multi-trigger-card__editor > :deep(.ai-event-trigger-row) { width: 100%; }.multi-trigger-card__repeat-options { display: grid; gap: var(--space-3, 12px); width: 100%; padding: var(--space-3, 12px); background: var(--ant-color-fill-quaternary); border-radius: 6px; }.multi-trigger-card__product-step { display: grid; gap: var(--space-4, 16px); min-height: 0; }.multi-trigger-card__product-step > header { display: grid; gap: 4px; }.multi-trigger-card__product-step > header small { color: var(--ant-color-text-secondary); }.multi-trigger-card__product-step > footer { display: flex; justify-content: flex-end; gap: var(--space-2, 8px); }
</style>
