<template>
  <SceneNodeCard class="device-action-row" :title="$t('IotSceneLinkage.action.device')" icon="ControlOutlined" :number="index + 1">
    <template #actions><a-tooltip :title="$t('IotSceneLinkage.action.edit')"><a-button type="text" @click="openEditor"><AIcon type="EditOutlined" /></a-button></a-tooltip><a-button type="text" danger @click="$emit('remove')"><AIcon type="DeleteOutlined" /></a-button></template>
    <SceneActionSummary :action="{ executor: 'device', device: action.config, options: { ...action.config?.options, ...action.options } }" />
  </SceneNodeCard>

  <DeviceScopeModal
    :open="editorVisible"
    :title="$t('IotSceneLinkage.action.device')"
    :width="1180"
    :product-id="config.productId"
    :model-value="{ selector: config.selector, selectorValues: config.selectorValues, options: config.options, productId: config.productId, productName: config.options.productName }"
    :validate="validateAction"
    @cancel="cancelEditor"
    @select-device="selectDevice"
    @save="saveEditor"
  >
    <template #configuration="{ hasSelection }">
      <div class="device-action-row__config">
        <a-form layout="vertical">
          <template v-if="hasSelection">
            <a-form-item :label="operationName">
              <a-space direction="vertical" class="device-action-row__operation-fields">
                <a-select
                  class="device-action-row__operation-select"
                  popup-class-name="scene-editor__thing-model-dropdown"
                  :dropdown-match-select-width="false"
                  :value="operationType"
                  :options="operationTypeOptions"
                  @change="changeOperationType"
                >
                  <template #option="option">
                    <div class="device-action-row__operation-option">
                      <span :class="['device-action-row__operation-icon', `device-action-row__operation-icon--${optionValue(option).value}`]">
                        <AIcon :type="optionValue(option).icon" />
                      </span>
                      <span class="device-action-row__operation-option-content">
                        <b>{{ optionValue(option).label }}</b>
                        <small>{{ optionValue(option).description }}</small>
                      </span>
                    </div>
                  </template>
                </a-select>
                <ThingModelSelect class="device-action-row__operation-select" :model-value="operationValue" :options="operationOptions" :placeholder="operationPlaceholder" @change="changeOperation" />
              </a-space>
            </a-form-item>
            <a-form-item v-if="config.message.messageType === 'WRITE_PROPERTY'" :label="$t('IotSceneLinkage.form.propertyValue')">
              <ThingModelValueInput v-if="writePropertyId" v-model="writeValue" :value-type="getValueType(writeProperty)" :unit="writePropertyOption?.unit" :placeholder="$t('IotSceneLinkage.placeholder.propertyValue')" />
            </a-form-item>
            <template v-else-if="config.message.messageType === 'INVOKE_FUNCTION'">
              <a-form-item v-for="input in functionInputs" :key="input.id" :label="input.name || input.id">
                <ThingModelValueInput v-model="inputValues[input.id]" :value-type="getValueType(input)" :placeholder="$t('IotSceneLinkage.placeholder.functionInput')" />
              </a-form-item>
            </template>
          </template>
        </a-form>
      </div>
    </template>
    <template #preview><SceneActionSummary :action="{ executor: 'device', device: config, options: config.options }" /></template>
  </DeviceScopeModal>
</template>

<script setup lang="ts">
import SceneActionSummary from './SceneActionSummary.vue'
import { computed, reactive, ref, watch, type PropType } from 'vue'
import SceneNodeCard from './SceneNodeCard.vue'
import { useI18n } from 'vue-i18n'
import { onlyMessage } from '@jetlinks-web-core/utils/comm'
import { getProduct } from '../../../../api/scene-linkage'
import type { IotAlarmTargetSelectOption } from '../alarm/IotAlarmTargetSelect.vue'
import type { SceneActionForm } from '../../utils'
import DeviceScopeModal, { type DeviceScope } from './DeviceScopeModal.vue'
import ThingModelSelect from './ThingModelSelect.vue'
import ThingModelValueInput from './ThingModelValueInput.vue'
import { getValueType, isSupportedValueType, toThingModelOptions } from '../thingModel'

const props = defineProps({ action: { type: Object as PropType<SceneActionForm>, required: true }, index: { type: Number, required: true }, autoOpen: Boolean })
const emit = defineEmits<{ (event: 'update', action: SceneActionForm): void; (event: 'remove'): void; (event: 'opened'): void; (event: 'cancel-new'): void }>()
const { t } = useI18n()
const editorVisible = ref(false)
const editingAction = ref<SceneActionForm>()
const createdByPicker = ref(false)
const selectedProduct = ref<IotAlarmTargetSelectOption>()
const metadata = ref<{ properties: any[]; functions: any[] }>({ properties: [], functions: [] })
const inputValues = reactive<Record<string, unknown>>({})

const config = computed(() => {
  const current = editingAction.value?.config || props.action.config || {}
  return { productId: current.productId || '', selector: current.selector || 'fixed', selectorValues: current.selectorValues || [], options: current.options || {}, message: current.message || { messageType: 'READ_PROPERTY', properties: [] } }
})
const readableProperties = computed(() => toThingModelOptions(metadata.value.properties.filter(item => item.expands?.type?.includes('read') !== false), 'property'))
const writableProperties = computed(() => toThingModelOptions(metadata.value.properties.filter(item => item.expands?.type?.includes('write') !== false), 'property'))
const functions = computed(() => toThingModelOptions(metadata.value.functions.filter(item => (item.inputs || []).every((input: any) => isSupportedValueType(getValueType(input)))), 'function'))
const functionInputs = computed(() => metadata.value.functions.find(item => item.id === config.value.message.functionId)?.inputs || [])
const writePropertyId = computed(() => Object.keys(config.value.message.properties || {})[0])
const writeProperty = computed(() => metadata.value.properties.find(item => item.id === writePropertyId.value))
const writePropertyOption = computed(() => toThingModelOptions(writeProperty.value ? [writeProperty.value] : [])[0])
const writeValue = computed({
  get: () => writePropertyId.value ? config.value.message.properties?.[writePropertyId.value] ?? '' : '',
  set: value => { if (writePropertyId.value) config.value.message.properties = { [writePropertyId.value]: value }; updateConfig() },
})
const operationType = computed(() => config.value.message.messageType)
const operationTypeOptions = computed(() => [
  { value: 'READ_PROPERTY', icon: 'ReadOutlined', label: t('IotSceneLinkage.action.readProperty'), description: t('IotSceneLinkage.actionDescription.readProperty') },
  { value: 'WRITE_PROPERTY', icon: 'EditOutlined', label: t('IotSceneLinkage.action.writeProperty'), description: t('IotSceneLinkage.actionDescription.writeProperty') },
  { value: 'INVOKE_FUNCTION', icon: 'ApiOutlined', label: t('IotSceneLinkage.action.executeFunction'), description: t('IotSceneLinkage.actionDescription.executeFunction') },
].filter(item => ({ READ_PROPERTY: readableProperties.value.length, WRITE_PROPERTY: writableProperties.value.length, INVOKE_FUNCTION: functions.value.length } as Record<string, number>)[item.value]))
const operationOptions = computed(() => {
  const description = operationType.value === 'WRITE_PROPERTY'
    ? t('IotSceneLinkage.actionDescription.writeProperty')
    : operationType.value === 'INVOKE_FUNCTION'
      ? t('IotSceneLinkage.actionDescription.executeFunction')
      : t('IotSceneLinkage.actionDescription.readProperty')
  const options = operationType.value === 'WRITE_PROPERTY'
    ? writableProperties.value
    : operationType.value === 'INVOKE_FUNCTION'
      ? functions.value
      : readableProperties.value
  return options.map(option => ({ ...option, description }))
})
const operationPlaceholder = computed(() => operationType.value === 'INVOKE_FUNCTION'
  ? t('IotSceneLinkage.placeholder.function')
  : t('IotSceneLinkage.placeholder.property'))
const operationValue = computed(() => {
  const message = config.value.message
  return message.messageType === 'INVOKE_FUNCTION' ? message.functionId : message.messageType === 'WRITE_PROPERTY' ? Object.keys(message.properties || {})[0] : message.properties?.[0]
})
const operationName = computed(() => t('IotSceneLinkage.action.issueCommand'))
/** 设备动作只有点击确定后才回写规则，避免取消弹窗时泄露半成品字段。 */
function openEditor() {
  editingAction.value = cloneAction(props.action)
  restoreFunctionInputs(config.value.message.inputs)
  editorVisible.value = true
  void loadMetadata(config.value.productId)
  void loadSelectedProduct(config.value.productId)
}

function cancelEditor() {
  editorVisible.value = false
  editingAction.value = undefined
  if (createdByPicker.value) emit('cancel-new')
}

function updateConfig() {
  if (!editingAction.value) return
  editingAction.value = { ...editingAction.value, config: { ...config.value, message: { ...config.value.message } } }
}

async function loadMetadata(productId = config.value.productId) {
  if (!productId) { metadata.value = { properties: [], functions: [] }; return }
  const response: any = await getProduct(productId)
  const product = response?.result ?? response
  const value = typeof product?.metadata === 'string' ? JSON.parse(product.metadata) : product?.metadata || {}
  if (config.value.productId !== productId) return
  metadata.value = { properties: value.properties || [], functions: value.functions || [] }
  // 产品切换后只保留实际可配置的指令类型，取消编辑仍不会回写原规则。
  if (!operationTypeOptions.value.some(item => item.value === operationType.value)) {
    changeOperationType(operationTypeOptions.value[0]?.value || '')
  }
}

async function loadSelectedProduct(productId = config.value.productId) {
  if (!productId || selectedProduct.value?.value === productId) return
  const response: any = await getProduct(productId)
  const product = response?.result ?? response
  if (!product?.id) return
  selectedProduct.value = { label: product.name || product.id, value: String(product.id), data: product }
  if (editingAction.value && config.value.options.productName !== selectedProduct.value.label) {
    editingAction.value = {
      ...editingAction.value,
      config: { ...config.value, options: { ...config.value.options, productName: selectedProduct.value.label } },
    }
  }
}

/** 设备是动作产品的唯一来源，切换到另一产品时不能保留旧指令与参数。 */
function selectDevice(device: { productId: string; productName: string }) {
  if (!editingAction.value) return
  if (config.value.productId !== device.productId) {
    editingAction.value = { ...editingAction.value, config: { productId: device.productId, selector: 'fixed', selectorValues: [], options: { productName: device.productName }, message: { messageType: 'READ_PROPERTY', properties: [] } } }
    restoreFunctionInputs([])
  }
  selectedProduct.value = { label: device.productName, value: device.productId, data: {} }
  void loadMetadata(device.productId)
}

function changeOperationType(value: unknown) {
  if (!editingAction.value || (value !== '' && !operationTypeOptions.value.some(item => item.value === value))) return
  const message = value === '' || value === 'READ_PROPERTY' ? { messageType: value, properties: [] } : value === 'WRITE_PROPERTY' ? { messageType: value, properties: {} } : { messageType: value, functionId: '', inputs: [] }
  editingAction.value = { ...editingAction.value, config: { ...config.value, options: { ...config.value.options, propertiesName: '' }, message } }
  restoreFunctionInputs([])
}

function changeOperation(value: string) {
  if (!editingAction.value) return
  const item = operationOptions.value.find(option => option.value === value)
  const message = operationType.value === 'READ_PROPERTY' ? { messageType: operationType.value, properties: value ? [value] : [] } : operationType.value === 'WRITE_PROPERTY' ? { messageType: operationType.value, properties: value ? { [value]: '' } : {} } : { messageType: operationType.value, functionId: value, inputs: [] }
  editingAction.value = { ...editingAction.value, config: { ...config.value, options: { ...config.value.options, propertiesName: item?.label || value }, message } }
  restoreFunctionInputs([])
}

const optionValue = (option: any) => option?.data?.value ? option.data : option

function restoreFunctionInputs(inputs: Array<{ name?: string; value?: unknown }> = []) {
  Object.keys(inputValues).forEach(key => delete inputValues[key])
  inputs.forEach(input => { if (input.name) inputValues[input.name] = input.value })
}

function syncInputs() { config.value.message.inputs = functionInputs.value.map(input => ({ name: input.id, value: inputValues[input.id] })); updateConfig() }

/** The shared device shell only knows the selected device; this component owns command and parameter completeness. */
function validateAction() {
  if (!operationValue.value || !operationOptions.value.some(item => item.value === operationValue.value)) {
    onlyMessage(t('IotSceneLinkage.message.deviceActionRequired'), 'warning')
    return false
  }
  if (operationType.value === 'WRITE_PROPERTY' && (writeValue.value === undefined || writeValue.value === '')) {
    onlyMessage(t('IotSceneLinkage.message.deviceActionValueRequired'), 'warning')
    return false
  }
  const missingInputs = functionInputs.value
    .filter(input => input.expands?.required && (inputValues[input.id] === undefined || inputValues[input.id] === ''))
    .map(input => input.name || input.id)
  if (missingInputs.length) {
    onlyMessage(t('IotSceneLinkage.message.deviceFunctionInputRequired', { names: missingInputs.join('、') }), 'warning')
    return false
  }
  return true
}

function saveEditor(scope: DeviceScope) {
  if (!editingAction.value) return
  syncInputs()
  emit('update', { ...editingAction.value, config: { ...config.value, ...scope, productId: scope.productId || config.value.productId, options: { ...config.value.options, ...scope.options, productName: scope.productName || config.value.options.productName } } })
  editorVisible.value = false
  editingAction.value = undefined
  createdByPicker.value = false
}

function cloneAction(action: SceneActionForm): SceneActionForm { return JSON.parse(JSON.stringify(action)) as SceneActionForm }

watch(() => props.autoOpen, value => {
  if (!value || editorVisible.value) return
  createdByPicker.value = true
  openEditor()
  emit('opened')
}, { immediate: true })
</script>

<style scoped>
.device-action-row { margin-bottom: var(--space-3, 12px); }
.device-action-row__index, .device-action-row__icon { display: grid; flex: none; place-items: center; width: 28px; height: 28px; border-radius: 6px; }
.device-action-row__index { width: 22px; height: 22px; color: var(--ant-color-primary); background: var(--ant-color-fill-secondary); border-radius: 50%; font-size: 12px; font-weight: 600; }
.device-action-row__icon { color: #1e5eff; background: #e8f0ff; }
.device-action-row__summary { display: flex; gap: 8px; align-items: center; min-width: 0; }
.device-action-row__summary span { overflow: hidden; color: var(--ant-color-text-secondary); text-overflow: ellipsis; white-space: nowrap; }
.device-action-row__config { min-height: 100%; }
.device-action-row__operation-fields { width: 100%; align-items: flex-start; }
.device-action-row__operation-select { width: var(--scene-linkage-resource-select-width, 18rem); }
.device-action-row__operation-option { display: flex; gap: var(--space-2, 8px); align-items: center; min-width: 0; padding: var(--space-1, 4px) 0; }
.device-action-row__operation-icon { display: grid; flex: none; place-items: center; width: 28px; height: 28px; border-radius: var(--radius-jet-sm, 8px); }
.device-action-row__operation-icon--READ_PROPERTY { color: #0e8a5f; background: #e6f5ee; }
.device-action-row__operation-icon--WRITE_PROPERTY { color: #d46b08; background: #fff7e8; }
.device-action-row__operation-icon--INVOKE_FUNCTION { color: #6c4fe0; background: #efebff; }
.device-action-row__operation-option-content { display: grid; gap: 3px; min-width: 0; }
.device-action-row__operation-option-content b { color: var(--ant-color-text); font-size: 13px; font-weight: 600; }
.device-action-row__operation-option-content small { color: var(--ant-color-text-tertiary); font-size: 12px; line-height: 18px; }
.device-action-row__config-empty { margin: 16px 0 0; color: var(--ant-color-text-secondary); }
</style>
