<template>
  <div class="device-action-row">
    <div class="device-action-row__main">
      <span class="device-action-row__index">{{ index + 1 }}</span>
      <span class="device-action-row__icon"><AIcon type="ControlOutlined" /></span>
      <strong>{{ $t('IotSceneLinkage.action.device') }}</strong>
      <IotAlarmTargetSelect
        :model-value="config.productId || undefined"
        class="device-action-row__product"
        :request="requestProducts"
        :selected-option="selectedProduct"
        :placeholder="$t('IotSceneLinkage.placeholder.product')"
        rich
        @change="onProductChange"
      />
      <a-button class="device-action-row__scope" :title="scopeTitle" :disabled="!config.productId" @click="scopeVisible = true">
        <AIcon type="AimOutlined" /><span class="device-action-row__scope-text">{{ scopeText }}</span>
      </a-button>
      <div class="device-action-row__details">
        <div class="device-action-row__details-content">
          <div class="device-action-row__operation-group">
            <span class="device-action-row__label">{{ operationName }}</span>
            <a-select
              :value="operationType"
              class="device-action-row__operation-type"
              popup-class-name="scene-editor__compact-dropdown"
              :dropdown-match-select-width="false"
              :options="operationTypeOptions"
              :disabled="!config.productId"
              @change="changeOperationType"
            />
            <ThingModelSelect
              :model-value="operationValue"
              class="device-action-row__operation"
              :options="operationOptions"
              :placeholder="$t('IotSceneLinkage.placeholder.thingModel')"
              :disabled="!config.productId"
              @change="changeOperation"
            />
          </div>
          <template v-if="config.message.messageType === 'WRITE_PROPERTY'">
            <span class="device-action-row__label">{{ $t('IotSceneLinkage.form.propertyValue') }}</span>
            <ThingModelValueInput
              v-if="writePropertyId"
              v-model="writeValue"
              class="device-action-row__write-value"
              :value-type="getValueType(writeProperty)"
            />
          </template>
          <template v-else-if="config.message.messageType === 'INVOKE_FUNCTION'">
            <a-button v-if="functionInputs.length" @click="openFunctionConfig">{{ $t('IotSceneLinkage.action.configureInputs') }}</a-button>
          </template>
        </div>
        <a-button class="device-action-row__remove" type="text" danger @click="$emit('remove')"><AIcon type="DeleteOutlined" /></a-button>
      </div>
    </div>
    <DeviceScopeModal
      :open="scopeVisible"
      :product-id="config.productId"
      :model-value="{ selector: config.selector, selectorValues: config.selectorValues, options: config.options }"
      @cancel="scopeVisible = false"
      @save="saveScope"
    />
    <a-modal
      v-model:open="functionConfigVisible"
      :title="$t('IotSceneLinkage.action.configureInputs')"
      :ok-text="$t('IotSceneLinkage.action.confirm')"
      :cancel-text="$t('IotSceneLinkage.action.cancel')"
      :mask-closable="false"
      @ok="saveFunctionInputs"
      @cancel="cancelFunctionConfig"
    >
      <a-form layout="vertical">
        <a-form-item v-for="input in functionInputs" :key="input.id" :label="input.name || input.id">
          <ThingModelValueInput v-model="inputValues[input.id]" :value-type="getValueType(input)" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { getProduct, queryProducts } from '../../../../api/scene-linkage'
import IotAlarmTargetSelect, { type IotAlarmTargetSelectOption, type IotAlarmTargetSelectQuery } from '../alarm/IotAlarmTargetSelect.vue'
import type { SceneActionForm } from '../../utils'
import DeviceScopeModal, { type DeviceScope } from './DeviceScopeModal.vue'
import ThingModelSelect from './ThingModelSelect.vue'
import ThingModelValueInput from './ThingModelValueInput.vue'
import { formatDeviceScopeText, formatDeviceScopeTitle } from '../deviceScopeLabel'
import { getValueType, isSupportedValueType, toThingModelOptions } from '../thingModel'

const props = defineProps({
  action: { type: Object as PropType<SceneActionForm>, required: true },
  index: { type: Number, required: true },
})

const emit = defineEmits<{
  (event: 'update', action: SceneActionForm): void
  (event: 'remove'): void
}>()

const { t } = useI18n()
const scopeVisible = ref(false)
const functionConfigVisible = ref(false)
const selectedProduct = ref<IotAlarmTargetSelectOption>()
const metadata = ref<{ properties: any[]; functions: any[] }>({ properties: [], functions: [] })
const inputValues = reactive<Record<string, unknown>>({})
const config = computed(() => {
  const current = props.action.config || {}
  return {
    productId: current.productId || '',
    selector: current.selector || 'fixed',
    selectorValues: current.selectorValues || [],
    options: current.options || {},
    message: current.message || { messageType: 'READ_PROPERTY', properties: [] },
  }
})
const scopeText = computed(() => {
  return formatDeviceScopeText(t, {
    selector: config.value.selector,
    selectorValues: config.value.selectorValues,
    options: config.value.options,
  }, { emptyText: t('IotSceneLinkage.placeholder.device') })
})
const scopeTitle = computed(() => {
  return formatDeviceScopeTitle(t, {
    selector: config.value.selector,
    selectorValues: config.value.selectorValues,
    options: config.value.options,
  }, { emptyText: t('IotSceneLinkage.placeholder.device') })
})
const readableProperties = computed(() => toThingModelOptions(
  metadata.value.properties.filter(item => item.expands?.type?.includes('read') !== false),
  'property',
))
const writableProperties = computed(() => toThingModelOptions(
  metadata.value.properties.filter(item => item.expands?.type?.includes('write') !== false),
  'property',
))
const functions = computed(() => toThingModelOptions(
  metadata.value.functions.filter(item => (item.inputs || []).every((input: any) => isSupportedValueType(getValueType(input)))),
  'function',
))
const functionInputs = computed(() => metadata.value.functions.find(item => item.id === config.value.message.functionId)?.inputs || [])
const writePropertyId = computed(() => Object.keys(config.value.message.properties || {})[0])
const writeProperty = computed(() => metadata.value.properties.find(item => item.id === writePropertyId.value))
const writeValue = computed({
  get: () => writePropertyId.value ? config.value.message.properties?.[writePropertyId.value] ?? '' : '',
  set: value => {
    if (writePropertyId.value) config.value.message.properties = { [writePropertyId.value]: value }
    updateConfig()
  },
})
const operationType = computed(() => {
  const { messageType } = config.value.message
  return ['READ_PROPERTY', 'WRITE_PROPERTY', 'INVOKE_FUNCTION'].includes(messageType)
    ? messageType
    : 'READ_PROPERTY'
})
const operationTypeOptions = computed(() => [
  { value: 'READ_PROPERTY', label: t('IotSceneLinkage.action.readProperty') },
  { value: 'WRITE_PROPERTY', label: t('IotSceneLinkage.action.writeProperty') },
  { value: 'INVOKE_FUNCTION', label: t('IotSceneLinkage.action.executeFunction') },
])
const operationOptions = computed(() => {
  if (operationType.value === 'WRITE_PROPERTY') return writableProperties.value
  if (operationType.value === 'INVOKE_FUNCTION') return functions.value
  return readableProperties.value
})
const operationValue = computed(() => {
  const message = config.value.message
  const id = message.messageType === 'INVOKE_FUNCTION'
    ? message.functionId
    : message.messageType === 'WRITE_PROPERTY'
      ? Object.keys(message.properties || {})[0]
      : message.properties?.[0]
  return id || undefined
})
const operationName = computed(() => t('IotSceneLinkage.action.issueCommand'))

function update(action: SceneActionForm) {
  emit('update', action)
}

function updateConfig() {
  update({ ...props.action, config: { ...config.value, message: { ...config.value.message } } })
}

async function requestProducts(query: IotAlarmTargetSelectQuery) {
  const keyword = query.keyword.trim()
  const terms = keyword
    ? [
        { column: 'name', termType: 'like', value: `%${keyword}%`, type: 'or' },
        { column: 'id', termType: 'like', value: `%${keyword}%`, type: 'or' },
      ]
    : []
  const response: any = await queryProducts({
    pageIndex: query.pageIndex,
    pageSize: query.pageSize,
    sorts: [{ name: 'createTime', order: 'desc' }],
    terms,
  })
  const result = response?.result ?? response
  const data = result?.data || result?.records || []
  return {
    data: data.map((item: any) => ({ label: item.name || item.id, value: item.id, data: item })),
    total: Number(result?.total ?? result?.totalElements ?? data.length),
  }
}

async function loadMetadata(productId = config.value.productId) {
  if (!productId) {
    metadata.value = { properties: [], functions: [] }
    return
  }
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
  selectedProduct.value = {
    label: product.name || product.id,
    value: String(product.id),
    data: product,
  }
  if (config.value.options.productName !== selectedProduct.value.label) {
    update({ ...props.action, config: { ...config.value, options: { ...config.value.options, productName: selectedProduct.value.label } } })
  }
}

function onProductChange(_value?: string, option?: IotAlarmTargetSelectOption) {
  selectedProduct.value = option
  update({ ...props.action, config: { productId: option?.value || '', selector: 'fixed', selectorValues: [], options: { productName: option?.label || '' }, message: { messageType: 'READ_PROPERTY', properties: [] } } })
  void loadMetadata(option?.value)
}

function changeOperationType(value: unknown) {
  if (value !== 'READ_PROPERTY' && value !== 'WRITE_PROPERTY' && value !== 'INVOKE_FUNCTION') return
  const message = value === 'READ_PROPERTY'
    ? { messageType: value, properties: [] }
    : value === 'WRITE_PROPERTY'
      ? { messageType: value, properties: {} }
      : { messageType: value, functionId: '', inputs: [] }
  update({ ...props.action, config: { ...config.value, options: { ...config.value.options, propertiesName: '' }, message } })
}

function changeOperation(value: string) {
  const messageType = operationType.value
  const item = operationOptions.value.find(option => option.value === value)
  const id = value
  const message = messageType === 'READ_PROPERTY'
    ? { messageType, properties: id ? [id] : [] }
    : messageType === 'WRITE_PROPERTY'
      ? { messageType, properties: id ? { [id]: '' } : {} }
      : { messageType, functionId: id, inputs: [] }
  update({ ...props.action, config: { ...config.value, options: { ...config.value.options, propertiesName: item?.label || id }, message } })
}

function syncInputs() {
  config.value.message.inputs = functionInputs.value.map(input => ({ name: input.id, value: inputValues[input.id] }))
  updateConfig()
}

function openFunctionConfig() {
  restoreFunctionInputs(config.value.message.inputs)
  functionConfigVisible.value = true
}

function saveFunctionInputs() {
  syncInputs()
  functionConfigVisible.value = false
}

function cancelFunctionConfig() {
  restoreFunctionInputs(config.value.message.inputs)
  functionConfigVisible.value = false
}

function restoreFunctionInputs(inputs: Array<{ name?: string; value?: unknown }> = []) {
  Object.keys(inputValues).forEach(key => delete inputValues[key])
  inputs.forEach(input => {
    if (input.name) inputValues[input.name] = input.value
  })
}

function saveScope(scope: DeviceScope) {
  update({ ...props.action, config: { ...config.value, ...scope } })
  scopeVisible.value = false
}

watch(() => props.action.config?.productId, value => {
  if (!value) {
    selectedProduct.value = undefined
    return
  }
  void loadMetadata(value)
  void loadSelectedProduct(value)
}, { immediate: true })
watch(() => props.action.config?.message?.inputs, inputs => {
  restoreFunctionInputs(Array.isArray(inputs) ? inputs : [])
}, { immediate: true, deep: true })
</script>

<style scoped>
.device-action-row { padding: 14px; margin-bottom: 10px; border: 1px solid var(--jet-theme-border-secondary); border-radius: 8px; }
.device-action-row__main { display: grid; grid-template-columns: 22px 28px max-content var(--scene-linkage-resource-select-width, 18rem) var(--scene-linkage-device-select-width, 18rem) max-content auto; gap: 10px; align-items: center; width: 100%; min-width: 0; overflow-x: auto; }
.device-action-row__label { flex: none; white-space: nowrap; }
.device-action-row__index, .device-action-row__icon { display: grid; flex: none; place-items: center; width: 28px; height: 28px; border-radius: 6px; }
.device-action-row__index { width: 22px; height: 22px; color: var(--ant-color-primary); background: var(--ant-color-fill-secondary); border-radius: 50%; font-size: 12px; font-weight: 600; }
.device-action-row__icon { color: #1e5eff; background: #e8f0ff; }
.device-action-row__icon :deep(.anticon) { display: block; line-height: 1; }
.device-action-row__product { grid-column: 4; flex: 0 0 var(--scene-linkage-resource-select-width, 18rem); width: var(--scene-linkage-resource-select-width, 18rem); min-width: var(--scene-linkage-resource-select-width, 18rem); }
.device-action-row__scope { grid-column: 5; display: inline-flex; flex: 0 0 var(--scene-linkage-device-select-width, 18rem); justify-content: center; width: var(--scene-linkage-device-select-width, 18rem); min-width: var(--scene-linkage-device-select-width, 18rem); text-align: center; align-items: center }
.device-action-row__scope-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.device-action-row__operation-type { flex: 0 0 var(--scene-linkage-compact-select-width, 8rem); width: var(--scene-linkage-compact-select-width, 8rem); }
.device-action-row__details { display: contents; }
.device-action-row__details-content { grid-column: 6; display: flex; flex-wrap: nowrap; gap: 10px; align-items: center; min-width: max-content; }
.device-action-row__operation-group { display: flex; flex: none; gap: 10px; align-items: center; min-width: 0; }
.device-action-row__operation { flex: 0 0 var(--scene-linkage-thing-model-select-width, 18rem); width: var(--scene-linkage-thing-model-select-width, 18rem); min-width: var(--scene-linkage-thing-model-select-width, 18rem); }
.device-action-row__write-value { flex: 0 0 var(--scene-linkage-value-input-width, 11rem); width: var(--scene-linkage-value-input-width, 11rem) !important; }
.device-action-row__remove { grid-column: 7; align-self: center; justify-self: end; }
.device-action-row__main :deep(.ant-input) { width: 140px; }
</style>
