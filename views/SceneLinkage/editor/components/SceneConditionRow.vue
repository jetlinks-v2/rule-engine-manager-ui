<template>
  <div class="scene-condition-row-wrapper">
    <article :class="['scene-condition-row', { 'scene-condition-row--invalid': invalid }]">
      <header><span :class="['scene-condition-row__icon', `scene-condition-row__icon--${condition.type}`]"><AIcon :type="condition.type === 'timeRange' ? 'ClockCircleOutlined' : condition.type === 'alarmState' ? 'AlertOutlined' : 'BarChartOutlined'" /></span><strong>{{ conditionTitle }}</strong><small>{{ $t('IotSceneLinkage.editor.conditionNumber', { index: index + 1 }) }}</small><span class="scene-condition-row__actions"><a-tooltip :title="$t('IotSceneLinkage.action.edit')"><a-button type="text" @click="openEditor"><AIcon type="EditOutlined" /></a-button></a-tooltip><a-button type="text" danger @click="$emit('remove')"><AIcon type="DeleteOutlined" /></a-button></span></header>
      <div class="scene-condition-row__description">{{ conditionSummary }}</div>
    </article>
    <p v-if="invalid" class="scene-condition-row__error">{{ errorMessage }}</p>

    <DeviceScopeModal
      v-if="condition.type === 'deviceProperty'"
      :open="deviceEditorVisible"
      :title="$t('IotSceneLinkage.condition.deviceProperty')"
      :width="1180"
      :product-id="condition.productId"
      :model-value="{ selector: condition.selector, selectorValues: condition.selectorValues, options: condition.options, productId: condition.productId, productName: condition.options?.productName }"
      @cancel="cancelDeviceEditor"
      @select-device="selectDevice"
      @save="saveScope"
    >
      <template #configuration="{ hasSelection }">
        <div class="scene-condition-row__config">
          <a-form layout="vertical">
            <a-form-item v-if="hasSelection" :label="$t('IotSceneLinkage.condition.currentProperty')">
              <a-space direction="vertical" class="scene-condition-row__config-fields">
                <ThingModelSelect :model-value="condition.propertyId || undefined" :options="propertyOptions" :placeholder="$t('IotSceneLinkage.placeholder.property')" @change="updateProperty" />
                <a-select :value="condition.termType" :options="termOptions" @change="updateTermType" />
                <ThingModelValueInput :model-value="condition.value" :value-type="selectedProperty?.valueType" :unit="selectedProperty?.unit" @update:model-value="updateValue" />
              </a-space>
            </a-form-item>
          </a-form>
        </div>
      </template>
      <template #preview><span>{{ conditionSummary }}</span></template>
    </DeviceScopeModal>
    <AlarmStateConditionModal
      v-else-if="condition.type === 'alarmState'"
      :open="conditionEditorVisible"
      :source-kind="condition.alarm.sourceKind === 'visual-ai' ? 'visual-ai' : 'iot-device'"
      :model-value="condition.alarm"
      @update:model-value="updateAlarm"
      @cancel="cancelConditionEditor"
      @save="saveConditionEditor"
    />
    <a-modal v-else-if="condition.type !== 'deviceProperty'" :open="conditionEditorVisible" :title="conditionTitle" :mask-closable="false" @cancel="cancelConditionEditor" @ok="saveConditionEditor">
      <TimeRangeConditionEditor v-if="condition.type === 'timeRange'" :model-value="condition.ranges" @update:model-value="updateTimeRanges" />
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { getProduct } from '../../../../api/scene-linkage'
import type { SceneConditionForm } from '../../utils'
import type { IotAlarmTargetSelectOption } from '../alarm/IotAlarmTargetSelect.vue'
import AlarmStateConditionModal from './AlarmStateConditionModal.vue'
import DeviceScopeModal, { type DeviceScope } from './DeviceScopeModal.vue'
import TimeRangeConditionEditor from './TimeRangeConditionEditor.vue'
import ThingModelValueInput from './ThingModelValueInput.vue'
import ThingModelSelect from './ThingModelSelect.vue'
import { formatDeviceScopeText } from '../deviceScopeLabel'
import { getTermTypes, toThingModelOptions } from '../thingModel'

const props = defineProps({ condition: { type: Object as PropType<SceneConditionForm>, required: true }, index: { type: Number, required: true }, autoOpen: Boolean, invalid: Boolean, errorMessage: { type: String, default: '' } })
const emit = defineEmits<{ (event: 'update', value: SceneConditionForm): void; (event: 'remove'): void; (event: 'opened'): void; (event: 'cancel-new'): void }>()
const { t } = useI18n()
const deviceEditorVisible = ref(false)
const conditionEditorVisible = ref(false)
const originalCondition = ref<SceneConditionForm>()
const createdByPicker = ref(false)
const selectedProduct = ref<IotAlarmTargetSelectOption>()
const properties = ref<any[]>([])
const propertyOptions = computed(() => toThingModelOptions(properties.value, 'property'))
const selectedProperty = computed(() => propertyOptions.value.find(item => item.value === (props.condition.type === 'deviceProperty' ? props.condition.propertyId : '')))
const termOptions = computed(() => getTermTypes(selectedProperty.value?.valueType).map(value => ({ value, label: t(`IotSceneLinkage.term.${value}`) })))
const conditionTitle = computed(() => {
  if (props.condition.type === 'timeRange') return t('IotSceneLinkage.condition.timeRange')
  if (props.condition.type === 'deviceProperty') return t('IotSceneLinkage.condition.deviceProperty')
  return props.condition.alarm.sourceKind === 'visual-ai'
    ? t('IotSceneLinkage.condition.visualAlarmState')
    : t('IotSceneLinkage.condition.iotAlarmState')
})
const deviceConditionSummary = computed(() => {
  if (props.condition.type !== 'deviceProperty') return ''
  const scope = formatDeviceScopeText(t, { selector: props.condition.selector, selectorValues: props.condition.selectorValues, options: props.condition.options }, { emptyText: t('IotSceneLinkage.placeholder.device') })
  const term = t(`IotSceneLinkage.term.${props.condition.termType}`)
  return [scope, props.condition.options?.propertiesName || props.condition.propertyId, term, props.condition.value].filter(value => value !== undefined && value !== '').join(' · ')
})
const conditionSummary = computed(() => {
  if (props.condition.type === 'deviceProperty') return deviceConditionSummary.value
  if (props.condition.type === 'timeRange') return props.condition.ranges.map(range => `${range.start}–${range.end}`).join('、')
  const alarm = props.condition.alarm
  return [alarm.options?.alarmConfigName, alarm.state === 'normal' ? t('IotSceneLinkage.alarmState.normal') : t('IotSceneLinkage.alarmState.warning')].filter(Boolean).join(' · ')
})

function update(value: SceneConditionForm) { emit('update', value) }
function updateAlarm(alarm: Extract<SceneConditionForm, { type: 'alarmState' }>['alarm']) { if (props.condition.type === 'alarmState') update({ ...props.condition, alarm }) }
function updateTimeRanges(ranges: Extract<SceneConditionForm, { type: 'timeRange' }>['ranges']) { if (props.condition.type === 'timeRange') update({ ...props.condition, ranges }) }

/** 非设备条件也在确认弹窗中编辑，取消时还原快照，和设备条件使用同一提交边界。 */
function openEditor() {
  if (props.condition.type === 'deviceProperty') openDeviceEditor()
  else { originalCondition.value = JSON.parse(JSON.stringify(props.condition)) as SceneConditionForm; conditionEditorVisible.value = true }
}
function cancelConditionEditor() {
  if (originalCondition.value) update(originalCondition.value)
  originalCondition.value = undefined
  conditionEditorVisible.value = false
  if (createdByPicker.value) emit('cancel-new')
}
function saveConditionEditor() { originalCondition.value = undefined; conditionEditorVisible.value = false; createdByPicker.value = false }

/** 设备附加条件与设备触发保持相同的确认边界，取消不保留临时产品或物模型选择。 */
function openDeviceEditor() {
  originalCondition.value = JSON.parse(JSON.stringify(props.condition)) as SceneConditionForm
  deviceEditorVisible.value = true
}

function cancelDeviceEditor() {
  if (originalCondition.value) update(originalCondition.value)
  deviceEditorVisible.value = false
  originalCondition.value = undefined
  if (createdByPicker.value) emit('cancel-new')
}

async function loadMetadata(productId?: string) {
  if (!productId) { properties.value = []; return }
  const response: any = await getProduct(productId)
  const product = response?.result ?? response
  const metadata = typeof product?.metadata === 'string' ? JSON.parse(product.metadata) : product?.metadata || {}
  properties.value = metadata.properties || []
}

async function loadSelectedProduct(productId?: string) {
  if (!productId || selectedProduct.value?.value === productId) return
  const response: any = await getProduct(productId)
  const product = response?.result ?? response
  if (!product?.id) return
  selectedProduct.value = { label: product.name || product.id, value: String(product.id), data: product }
  if (props.condition.type === 'deviceProperty' && props.condition.options?.productName !== selectedProduct.value.label) update({ ...props.condition, options: { ...props.condition.options, productName: selectedProduct.value.label } })
}

/** 设备选择决定产品；跨产品切换时同步清空旧物模型条件，避免把错误属性保存到新产品。 */
function selectDevice(device: { productId: string; productName: string }) {
  if (props.condition.type !== 'deviceProperty') return
  if (props.condition.productId !== device.productId) {
    update({ ...props.condition, productId: device.productId, selector: 'fixed', selectorValues: [], propertyId: '', termType: 'eq', value: '', options: { productName: device.productName } })
  }
  selectedProduct.value = { label: device.productName, value: device.productId, data: {} }
  void loadMetadata(device.productId)
}

function updateProperty(value: unknown) {
  if (props.condition.type !== 'deviceProperty' || typeof value !== 'string') return
  const property = propertyOptions.value.find(item => item.value === value)
  const termTypes = getTermTypes(property?.valueType)
  update({ ...props.condition, propertyId: value, termType: termTypes.includes(props.condition.termType) ? props.condition.termType : termTypes[0], value: '', options: { ...props.condition.options, propertiesName: property?.label || value } })
}
function updateTermType(value: unknown) { if (props.condition.type === 'deviceProperty' && typeof value === 'string') update({ ...props.condition, termType: value }) }
function updateValue(value: unknown) { if (props.condition.type === 'deviceProperty') update({ ...props.condition, value: value as string | number | boolean }) }
function saveScope(scope: DeviceScope) {
  if (props.condition.type !== 'deviceProperty') return
  update({ ...props.condition, ...scope, productId: scope.productId || props.condition.productId, options: { ...props.condition.options, ...scope.options, productName: scope.productName || props.condition.options?.productName, name: scope.selectorValues.map(item => item.name || item.value).join('、') } })
  deviceEditorVisible.value = false
  originalCondition.value = undefined
  createdByPicker.value = false
}

watch(() => props.condition.type === 'deviceProperty' ? props.condition.productId : '', productId => {
  if (!productId) { selectedProduct.value = undefined; properties.value = []; return }
  void loadMetadata(productId)
  void loadSelectedProduct(productId)
}, { immediate: true })

watch(() => props.autoOpen, value => {
  if (!value || deviceEditorVisible.value || conditionEditorVisible.value) return
  createdByPicker.value = true
  openEditor()
  emit('opened')
}, { immediate: true })
</script>

<style scoped>
.scene-condition-row-wrapper { margin-bottom: var(--space-3, 12px); }
.scene-condition-row { overflow: hidden; width: 100%; border: 1px solid #eceff3; border-radius: var(--radius-jet-sm, 10px); background: var(--jet-theme-bg-container); }.scene-condition-row > header { display: flex; gap: var(--space-3, 12px); align-items: center; min-height: 48px; padding: 0 var(--space-4, 16px); background: var(--ant-color-fill-quaternary); }.scene-condition-row > header small { color: var(--ant-color-text-tertiary); }.scene-condition-row__actions { display: inline-flex; gap: 2px; margin-left: auto; }.scene-condition-row__description { padding: var(--space-4, 16px); overflow-wrap: anywhere; }
.scene-condition-row--invalid { border-color: var(--ant-color-error); box-shadow: 0 0 0 2px rgba(245, 34, 45, .08); }
.scene-condition-row__error { margin: 6px 0 0; color: #f5222d; font-size: 12px; line-height: 18px; }
.scene-condition-row__index, .scene-condition-row__icon { display: grid; flex: none; place-items: center; width: 28px; height: 28px; border-radius: var(--radius-jet-sm, 10px); }
.scene-condition-row__index { width: 22px; height: 22px; color: var(--ant-color-success); background: var(--ant-color-fill-secondary); border-radius: 50%; font-size: 12px; font-weight: 600; }
.scene-condition-row__icon { color: var(--ant-color-text-secondary); background: var(--ant-color-fill-secondary); }
.scene-condition-row__icon--timeRange { color: #6c4fe0; background: #efebff; }
.scene-condition-row__icon--deviceProperty { color: #1e5eff; background: #e8f0ff; }
.scene-condition-row__icon--alarmState { color: #ff4d4f; background: #fff1f0; }
.scene-condition-row__summary { display: flex; gap: var(--space-3, 12px); align-items: center; min-width: 0; }
.scene-condition-row__summary > span { min-width: 0; overflow: hidden; color: var(--ant-color-text-secondary); text-overflow: ellipsis; white-space: nowrap; }
.scene-condition-row__config { min-height: 100%; }
.scene-condition-row__config-fields { width: 100%; }
.scene-condition-row__config-fields :deep(.ant-select), .scene-condition-row__config-fields :deep(.thing-model-select) { width: 100%; }
.scene-condition-row__config-empty { margin: var(--space-4, 16px) 0 0; color: var(--ant-color-text-secondary); }
</style>
