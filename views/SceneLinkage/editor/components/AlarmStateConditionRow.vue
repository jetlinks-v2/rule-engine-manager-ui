<template>
  <div class="alarm-state-condition-row">
    <a-radio-group class="alarm-state-condition-row__source" :value="sourceKind" size="small" @change="changeSource">
      <a-radio-button value="iot-device">{{ $t('IotSceneLinkage.alarmSource.iotDevice') }}</a-radio-button>
      <a-radio-button value="visual-ai">{{ $t('IotSceneLinkage.alarmSource.visualAi') }}</a-radio-button>
    </a-radio-group>
    <template v-if="sourceKind === 'iot-device'">
      <IotAlarmTargetSelect
        class="alarm-state-condition-row__product"
        :model-value="modelValue.options?.productId"
        :request="requestProducts"
        :selected-option="selectedProduct"
        :placeholder="$t('IotSceneLinkage.placeholder.product')"
        rich
        @change="changeProduct"
      />
      <IotAlarmTargetSelect
        class="alarm-state-condition-row__device"
        :model-value="modelValue.options?.deviceId"
        :request="requestDevices"
        :selected-option="selectedDevice"
        :reload-key="modelValue.options?.productId"
        :placeholder="$t('IotSceneLinkage.placeholder.device')"
        :disabled="!modelValue.options?.productId"
        rich
        option-type="device"
        @change="changeDevice"
      />
      <span class="alarm-state-condition-row__word">{{ $t('IotSceneLinkage.alarmPhrase.ofAlarm') }}</span>
      <a-select
        class="alarm-state-condition-row__alarm"
        popup-class-name="scene-editor__resource-dropdown"
        :dropdown-match-select-width="false"
        :value="modelValue.alarmConfigId"
        :options="options"
        :loading="loading"
        :placeholder="$t('IotSceneLinkage.placeholder.alarmConfig')"
        :disabled="!modelValue.options?.productId"
        show-search
        :filter-option="filterAlarmOption"
        @dropdown-visible-change="loadOptions"
        @change="changeAlarmConfig"
      >
        <template #option="option">
          <IotAlarmTargetOption :option="alarmOption(option)" type="alarm" />
        </template>
      </a-select>
    </template>
    <VisualAiAlarmSelector v-else :model-value="modelValue" @update:model-value="updateValue" />
    <span class="alarm-state-condition-row__word">{{ $t('IotSceneLinkage.alarmPhrase.currentState') }}</span>
    <a-select class="alarm-state-condition-row__state" popup-class-name="scene-editor__compact-dropdown" :dropdown-match-select-width="false" :value="modelValue.state || 'warning'" :options="stateOptions" @change="changeState" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { getProduct, queryDeviceAlarmPreprocesses, queryDevicesPage, queryProducts } from '../../../../api/scene-linkage'
import IotAlarmTargetSelect, { type IotAlarmTargetSelectOption, type IotAlarmTargetSelectQuery } from '../alarm/IotAlarmTargetSelect.vue'
import IotAlarmTargetOption from '../alarm/IotAlarmTargetOption.vue'
import VisualAiAlarmSelector from './VisualAiAlarmSelector.vue'
import { formatTriggerText } from '../alarm/utils'
import { normalizeResult, type SceneAlarmTriggerConfig } from '../../utils'
import { enrichDeviceOptionData } from '../deviceOptionData'

type AlarmConfigOption = { label: string; value: string; targetType: string; scope: 'device' | 'product'; detail: string }

const props = defineProps({ modelValue: { type: Object as PropType<SceneAlarmTriggerConfig>, required: true } })
const emit = defineEmits<{ (event: 'update:modelValue', value: SceneAlarmTriggerConfig): void }>()

const { t } = useI18n()
const loading = ref(false)
const optionsLoaded = ref(false)
const options = ref<AlarmConfigOption[]>([])
const selectedProduct = ref<IotAlarmTargetSelectOption>()
const selectedDevice = ref<IotAlarmTargetSelectOption>()
const stateOptions = computed(() => [
  { value: 'warning', label: t('IotSceneLinkage.alarmState.warning') },
  { value: 'normal', label: t('IotSceneLinkage.alarmState.normal') },
])
const sourceKind = computed(() => props.modelValue.sourceKind
  || (props.modelValue.targetType === 'aiTaskMediaTarget' ? 'visual-ai' : 'iot-device'))

function updateValue(value: SceneAlarmTriggerConfig) {
  emit('update:modelValue', value)
}

function changeSource(event: { target?: { value?: unknown } }) {
  const value = event.target?.value
  if (value !== 'iot-device' && value !== 'visual-ai') return
  // 告警来源决定可选资源和后端查询维度，切换时不能保留另一类告警的筛选条件。
  emit('update:modelValue', value === 'iot-device'
    ? { sourceKind: value, modes: [], state: props.modelValue.state || 'warning', options: {} }
    : { sourceKind: value, targetType: 'aiTaskMediaTarget', modes: [], state: props.modelValue.state || 'warning', options: {} })
}

function toOption(item: Record<string, any>): AlarmConfigOption | undefined {
  const alarm = item.alarm || {}
  const processor = (alarm.configuration?.processors || []).find((item: Record<string, any>) => item.provider === 'device-alarm')
  const name = processor?.configuration?.alarmName || item.propertyName || alarm.name
  const propertyName = item.propertyName || alarm.propertyName || alarm.property || ''
  const matcher = alarm.configuration?.matcher || {}
  const matcherConfig = matcher.configuration || {}
  const triggerText = matcher.provider === 'number-range'
    ? formatTriggerText({
        propertyName,
        trigger: matcherConfig.not === false ? 'inside' : 'outside',
        limit: { lower: matcherConfig.min, upper: matcherConfig.max },
      })
    : propertyName
  if (!alarm.id || !name) return undefined
  const detail = triggerText ? t('IotDeviceDetail.overview.alarmTrigger', { value: triggerText }) : ''
  return {
    label: name,
    value: String(alarm.id),
    targetType: 'device',
    scope: String(alarm.thingId || '') === props.modelValue.options?.deviceId ? 'device' : 'product',
    detail,
  }
}

const alarmOption = (option: any): AlarmConfigOption =>
  option?.data?.value ? option.data : option

function filterAlarmOption(input: string, option: any) {
  const keyword = input.trim().toLocaleLowerCase()
  if (!keyword) return true
  const item = alarmOption(option)
  return [item.label, item.detail]
    .filter(Boolean)
    .some(value => String(value).toLocaleLowerCase().includes(keyword))
}

async function requestProducts(query: IotAlarmTargetSelectQuery) {
  const terms = query.keyword ? [{ column: 'name', termType: 'like', value: `%${query.keyword}%`, type: 'or' }, { column: 'id', termType: 'like', value: `%${query.keyword}%`, type: 'or' }] : []
  const result = normalizeResult(await queryProducts({ pageIndex: query.pageIndex, pageSize: query.pageSize, terms, sorts: [{ name: 'createTime', order: 'desc' }] }))
  return { data: result.data.map((item: Record<string, any>) => ({ label: item.name || item.id, value: String(item.id), data: item })) }
}

async function requestDevices(query: IotAlarmTargetSelectQuery) {
  const result = normalizeResult(await queryDevicesPage({ pageIndex: query.pageIndex, pageSize: query.pageSize, terms: [{ column: 'productId', termType: 'eq', value: props.modelValue.options?.productId }, ...(query.keyword ? [{ column: 'name', termType: 'like', value: `%${query.keyword}%` }] : [])], sorts: [{ name: 'createTime', order: 'desc' }] }))
  const devices = await enrichDeviceOptionData(result.data)
  return { data: devices.map((item: Record<string, any>) => ({ label: item.name || item.id, value: String(item.id), data: item })) }
}

function alarmTerms() {
  const deviceId = props.modelValue.options?.deviceId
  const productId = String(props.modelValue.options?.productId || '')
  if (!productId) return []
  // 未指定设备时只查询产品级告警，与告警触发条件保持一致。
  if (!deviceId) return [
    { column: 'templateId', termType: 'eq', value: productId },
    { column: 'thingId', termType: 'eq', value: '@all' },
  ]
  return [
    { column: 'templateId', termType: 'eq', value: productId },
    { column: 'thingId', termType: 'in', value: [deviceId, '@all'] },
  ]
}

function productAlarmTerms(productId?: string) {
  return productId ? [
    { column: 'templateId', termType: 'eq', value: productId },
    { column: 'thingId', termType: 'eq', value: '@all' },
  ] : []
}

function deviceAlarmTerms(deviceId?: string) {
  const productId = props.modelValue.options?.productId
  return deviceId && productId ? [
    { column: 'templateId', termType: 'eq', value: productId },
    { column: 'thingId', termType: 'eq', value: deviceId },
  ] : []
}

async function requestOptions(terms = alarmTerms()) {
  const result = normalizeResult(await queryDeviceAlarmPreprocesses({ pageIndex: 0, pageSize: 100, terms, sorts: [{ name: 'createTime', order: 'desc' }] }))
  const candidates = result.data.map(item => ({ option: toOption(item), property: String(item.alarm?.property || item.alarm?.id || '') })).filter((item): item is { option: AlarmConfigOption; property: string } => Boolean(item.option)).sort((left, right) => Number(right.option.scope === 'device') - Number(left.option.scope === 'device'))
  const covered = new Set<string>()
  return candidates.filter(item => !covered.has(item.property) && Boolean(covered.add(item.property))).map(item => item.option)
}

async function loadOptions(open: boolean) {
  if (!open || optionsLoaded.value || loading.value) return
  loading.value = true
  try {
    options.value = await requestOptions()
    optionsLoaded.value = true
  } finally {
    loading.value = false
  }
}

async function loadProductOptions(productId?: string) {
  if (!productId) return
  loading.value = true
  try {
    options.value = await requestOptions(productAlarmTerms(productId))
    optionsLoaded.value = true
  } finally {
    loading.value = false
  }
}

async function loadDeviceOptions(deviceId?: string) {
  if (!deviceId) return
  loading.value = true
  try {
    const deviceOptions = await requestOptions(deviceAlarmTerms(deviceId))
    options.value = [...options.value.filter(item => item.scope === 'product'), ...deviceOptions]
    optionsLoaded.value = true
  } finally {
    loading.value = false
  }
}

function changeProduct(value?: string, option?: IotAlarmTargetSelectOption) {
  selectedProduct.value = option
  selectedDevice.value = undefined
  options.value = []
  optionsLoaded.value = false
  emit('update:modelValue', { ...props.modelValue, alarmConfigId: undefined, targetType: undefined, options: { productId: value } })
  void loadProductOptions(value)
}

function changeDevice(value?: string, option?: IotAlarmTargetSelectOption) {
  selectedDevice.value = option
  options.value = options.value.filter(item => item.scope === 'product')
  optionsLoaded.value = false
  emit('update:modelValue', { ...props.modelValue, alarmConfigId: undefined, targetType: undefined, options: { ...props.modelValue.options, deviceId: value } })
  void loadDeviceOptions(value)
}

function changeAlarmConfig(value: unknown) {
  if (typeof value !== 'string') return
  const option = options.value.find(item => item.value === value)
  emit('update:modelValue', { ...props.modelValue, alarmConfigId: value, targetType: option?.targetType, options: { ...props.modelValue.options, alarmConfigName: option?.label } })
}

function changeState(value: unknown) {
  if (value === 'warning' || value === 'normal') emit('update:modelValue', { ...props.modelValue, state: value })
}

async function loadSelectedConfig(id?: string) {
  if (!id || options.value.some(item => item.value === id)) return
  const option = (await requestOptions()).find(item => item.value === id)
  if (!option) return
  options.value = [option, ...options.value]
  if (!props.modelValue.targetType || props.modelValue.options?.alarmConfigName !== option.label) {
    emit('update:modelValue', { ...props.modelValue, targetType: option.targetType, options: { ...props.modelValue.options, alarmConfigName: option.label } })
  }
}

async function loadSelectedProduct(id?: string) {
  if (!id || selectedProduct.value?.value === id) return
  const response: any = await getProduct(id)
  const product = response?.result ?? response
  if (product?.id) selectedProduct.value = { label: product.name || product.id, value: String(product.id), data: product }
}

async function loadSelectedDevice(id?: string) {
  if (!id || selectedDevice.value?.value === id) return
  const result = normalizeResult(await queryDevicesPage({ pageIndex: 0, pageSize: 1, terms: [{ column: 'id', termType: 'eq', value: id }] }))
  const device = (await enrichDeviceOptionData(result.data))[0]
  if (device?.id) selectedDevice.value = { label: device.name || device.id, value: String(device.id), data: device }
}

watch(() => props.modelValue.options?.productId, id => void loadSelectedProduct(id), { immediate: true })
watch(() => props.modelValue.options?.deviceId, id => void loadSelectedDevice(id), { immediate: true })
watch(() => [props.modelValue.alarmConfigId, props.modelValue.options?.productId, props.modelValue.options?.deviceId], ([id]) => void loadSelectedConfig(id), { immediate: true })
</script>

<style scoped>
.alarm-state-condition-row { display: flex; flex: 0 0 auto; flex-wrap: nowrap; gap: var(--space-2, 8px); width: max-content; min-width: max-content; align-items: center; }
.alarm-state-condition-row__source, .alarm-state-condition-row__word, .alarm-state-condition-row__state { flex: none; }
.alarm-state-condition-row__product, .alarm-state-condition-row__device, .alarm-state-condition-row__alarm {
	flex: 0 0 var(--scene-linkage-resource-select-width, 18rem);
	width: var(--scene-linkage-resource-select-width, 18rem);
	min-width: var(--scene-linkage-resource-select-width, 18rem);
	max-width: var(--scene-linkage-resource-select-width, 18rem);
}
.alarm-state-condition-row__state {
	flex: 0 0 var(--scene-linkage-compact-select-width, 8rem);
	width: var(--scene-linkage-compact-select-width, 8rem);
}
.alarm-state-condition-row__word { white-space: nowrap; }
.alarm-state-condition-row :deep(.visual-ai-alarm-selector) {
	flex: 0 0 auto;
	flex-wrap: nowrap;
	width: max-content;
	min-width: max-content;
}
</style>
