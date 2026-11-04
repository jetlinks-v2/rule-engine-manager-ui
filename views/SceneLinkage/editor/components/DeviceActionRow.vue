<template>
  <article class="device-action-row">
    <header><span class="device-action-row__icon"><AIcon type="ControlOutlined" /></span><strong>{{ $t('IotSceneLinkage.action.device') }}</strong><small>{{ index + 1 }}</small><span class="device-action-row__actions"><a-tooltip :title="$t('IotSceneLinkage.action.edit')"><a-button type="text" @click="openEditor"><AIcon type="EditOutlined" /></a-button></a-tooltip><a-button type="text" danger @click="$emit('remove')"><AIcon type="DeleteOutlined" /></a-button></span></header>
    <div class="device-action-row__description">{{ actionSummary }}</div>
  </article>

  <DeviceScopeModal
    :open="editorVisible"
    :title="$t('IotSceneLinkage.action.device')"
    :width="1180"
    :product-id="config.productId"
    :model-value="{ selector: config.selector, selectorValues: config.selectorValues, options: config.options, productId: config.productId, productName: config.options.productName }"
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
                <a-select :value="operationType" :options="operationTypeOptions" @change="changeOperationType" />
                <ThingModelSelect :model-value="operationValue" :options="operationOptions" :placeholder="operationPlaceholder" @change="changeOperation" />
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
    <template #preview><span>{{ actionSummary }}</span></template>
  </DeviceScopeModal>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { getProduct } from '../../../../api/scene-linkage'
import type { IotAlarmTargetSelectOption } from '../alarm/IotAlarmTargetSelect.vue'
import type { SceneActionForm } from '../../utils'
import DeviceScopeModal, { type DeviceScope } from './DeviceScopeModal.vue'
import ThingModelSelect from './ThingModelSelect.vue'
import ThingModelValueInput from './ThingModelValueInput.vue'
import { formatDeviceScopeText } from '../deviceScopeLabel'
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
const scopeText = computed(() => formatDeviceScopeText(t, { selector: config.value.selector, selectorValues: config.value.selectorValues, options: config.value.options }, { emptyText: t('IotSceneLinkage.placeholder.device') }))
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
const operationType = computed(() => ['READ_PROPERTY', 'WRITE_PROPERTY', 'INVOKE_FUNCTION'].includes(config.value.message.messageType) ? config.value.message.messageType : 'READ_PROPERTY')
const operationTypeOptions = computed(() => [
  { value: 'READ_PROPERTY', label: t('IotSceneLinkage.action.readProperty') },
  { value: 'WRITE_PROPERTY', label: t('IotSceneLinkage.action.writeProperty') },
  { value: 'INVOKE_FUNCTION', label: t('IotSceneLinkage.action.executeFunction') },
])
const operationOptions = computed(() => operationType.value === 'WRITE_PROPERTY' ? writableProperties.value : operationType.value === 'INVOKE_FUNCTION' ? functions.value : readableProperties.value)
const operationPlaceholder = computed(() => operationType.value === 'INVOKE_FUNCTION'
  ? t('IotSceneLinkage.placeholder.function')
  : t('IotSceneLinkage.placeholder.property'))
const operationValue = computed(() => {
  const message = config.value.message
  return message.messageType === 'INVOKE_FUNCTION' ? message.functionId : message.messageType === 'WRITE_PROPERTY' ? Object.keys(message.properties || {})[0] : message.properties?.[0]
})
const operationName = computed(() => t('IotSceneLinkage.action.issueCommand'))
const actionSummary = computed(() => {
  const actionName = operationTypeOptions.value.find(item => item.value === operationType.value)?.label || operationName.value
  const targetName = config.value.options.propertiesName || operationValue.value || '-'
  return `${scopeText.value} · ${actionName} ${targetName}`
})

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
  metadata.value = { properties: value.properties || [], functions: value.functions || [] }
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
  if (!editingAction.value || !['READ_PROPERTY', 'WRITE_PROPERTY', 'INVOKE_FUNCTION'].includes(String(value))) return
  const message = value === 'READ_PROPERTY' ? { messageType: value, properties: [] } : value === 'WRITE_PROPERTY' ? { messageType: value, properties: {} } : { messageType: value, functionId: '', inputs: [] }
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

function restoreFunctionInputs(inputs: Array<{ name?: string; value?: unknown }> = []) {
  Object.keys(inputValues).forEach(key => delete inputValues[key])
  inputs.forEach(input => { if (input.name) inputValues[input.name] = input.value })
}

function syncInputs() { config.value.message.inputs = functionInputs.value.map(input => ({ name: input.id, value: inputValues[input.id] })); updateConfig() }

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
.device-action-row { overflow: hidden; margin-bottom: 10px; border: 1px solid var(--jet-theme-border-secondary); border-radius: 8px; background: var(--ant-color-bg-container); }.device-action-row > header { display: flex; gap: 10px; align-items: center; min-height: 48px; padding: 0 16px; background: var(--ant-color-fill-quaternary); }.device-action-row > header small { color: var(--ant-color-text-tertiary); }.device-action-row__actions { display: inline-flex; gap: 2px; margin-left: auto; }.device-action-row__description { padding: 14px 16px; overflow-wrap: anywhere; }
.device-action-row__index, .device-action-row__icon { display: grid; flex: none; place-items: center; width: 28px; height: 28px; border-radius: 6px; }
.device-action-row__index { width: 22px; height: 22px; color: var(--ant-color-primary); background: var(--ant-color-fill-secondary); border-radius: 50%; font-size: 12px; font-weight: 600; }
.device-action-row__icon { color: #1e5eff; background: #e8f0ff; }
.device-action-row__summary { display: flex; gap: 8px; align-items: center; min-width: 0; }
.device-action-row__summary span { overflow: hidden; color: var(--ant-color-text-secondary); text-overflow: ellipsis; white-space: nowrap; }
.device-action-row__config { min-height: 100%; }
.device-action-row__operation-fields { width: 100%; }
.device-action-row__operation-fields :deep(.ant-select), .device-action-row__operation-fields :deep(.thing-model-select) { width: 100%; }
.device-action-row__config-empty { margin: 16px 0 0; color: var(--ant-color-text-secondary); }
</style>
