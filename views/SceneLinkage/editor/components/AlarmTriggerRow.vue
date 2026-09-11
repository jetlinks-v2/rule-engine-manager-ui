<template>
  <div class="alarm-trigger-row">
    <div class="alarm-trigger-row__product">
      <IotAlarmTargetSelect
        :model-value="modelValue.options?.productId"
        :request="requestProducts"
        :selected-option="selectedProduct"
        :placeholder="$t('IotSceneLinkage.placeholder.product')"
        rich
        @change="changeProduct"
      />
    </div>
    <div class="alarm-trigger-row__device">
      <IotAlarmTargetSelect
        :model-value="deviceValue"
        :request="requestDevices"
        :static-options="deviceStaticOptions"
        :selected-option="selectedDevice"
        :reload-key="modelValue.options?.productId"
        :placeholder="$t('IotSceneLinkage.placeholder.device')"
        :disabled="!modelValue.options?.productId"
        rich
        option-type="device"
        @change="changeDevice"
      />
    </div>
    <div class="alarm-trigger-row__alarm-config">
      <span class="alarm-trigger-row__word">{{ $t('IotSceneLinkage.alarmPhrase.ofAlarm') }}</span>
      <a-select
        class="alarm-trigger-row__alarm-select"
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
      <span class="alarm-trigger-row__word">{{ $t('IotSceneLinkage.alarmPhrase.statusChange') }}</span>
      <a-select
        class="alarm-trigger-row__mode-select alarm-trigger-row__transition-select"
        popup-class-name="scene-editor__compact-dropdown"
        :dropdown-match-select-width="false"
        :value="modeValue"
        :options="modeOptions"
        @change="changeMode"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { getProduct, queryDeviceAlarmPreprocesses, queryDevicesPage, queryProducts } from '../../../../api/scene-linkage'
import IotAlarmTargetSelect, { type IotAlarmTargetSelectOption, type IotAlarmTargetSelectQuery } from '../alarm/IotAlarmTargetSelect.vue'
import IotAlarmTargetOption from '../alarm/IotAlarmTargetOption.vue'
import { formatTriggerText } from '../alarm/utils'
import { normalizeResult, type SceneAlarmTriggerConfig } from '../../utils'
import { enrichDeviceOptionData } from '../deviceOptionData'

const ALL_DEVICES_VALUE = '__all_devices__'

type AlarmConfigOption = {
  label: string
  value: string
  targetType: string
  scope: 'device' | 'product'
  detail: string
}

const props = defineProps({
  modelValue: { type: Object as PropType<SceneAlarmTriggerConfig>, required: true },
})
const emit = defineEmits<{
  (event: 'update:modelValue', value: SceneAlarmTriggerConfig): void
}>()

const { t } = useI18n()
const loading = ref(false)
const optionsLoaded = ref(false)
const options = ref<AlarmConfigOption[]>([])
const selectedProduct = ref<IotAlarmTargetSelectOption>()
const selectedDevice = ref<IotAlarmTargetSelectOption>()
const deviceValue = computed(() => selectedDevice.value?.value || ALL_DEVICES_VALUE)
const deviceStaticOptions = computed<IotAlarmTargetSelectOption[]>(() => [
  { label: t('IotSceneLinkage.scope.all'), value: ALL_DEVICES_VALUE },
])
const modeOptions = computed(() => [
  { value: 'trigger', label: t('IotSceneLinkage.alarmMode.trigger') },
  { value: 'relieve', label: t('IotSceneLinkage.alarmMode.relieve') },
])
const modeValue = computed(() => props.modelValue.modes[0] || 'trigger')

function toOption(item: Record<string, any>): AlarmConfigOption | undefined {
  const alarm = item.alarm || {}
  const processors = alarm.configuration?.processors || []
  const alarmProcessor = processors.find((processor: Record<string, any>) => processor.provider === 'device-alarm')
  const name = alarmProcessor?.configuration?.alarmName || item.propertyName || alarm.name
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
  // 设备告警预处理器 ID 会写入告警事件的 alarmConfigId。
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

function alarmTerms() {
  const deviceId = props.modelValue.options?.deviceId
  const productId = String(props.modelValue.options?.productId || '')
  if (!productId) return []
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
  const result = normalizeResult(await queryDeviceAlarmPreprocesses({
    pageIndex: 0,
    pageSize: 100,
    terms,
    sorts: [{ name: 'createTime', order: 'desc' }],
  }))
  const candidates = result.data
    .map(item => ({ option: toOption(item), property: String(item.alarm?.property || item.alarm?.id || '') }))
    .filter((item): item is { option: AlarmConfigOption; property: string } => Boolean(item.option))
    .sort((left, right) => Number(right.option.scope === 'device') - Number(left.option.scope === 'device'))
  const coveredProperties = new Set<string>()
  return candidates
    .filter(item => {
      if (coveredProperties.has(item.property)) return false
      coveredProperties.add(item.property)
      return true
    })
    .map(item => item.option)
}

async function requestDevices(query: IotAlarmTargetSelectQuery) {
  const result = normalizeResult(await queryDevicesPage({
    pageIndex: query.pageIndex,
    pageSize: query.pageSize,
    terms: [
      { column: 'productId', termType: 'eq', value: props.modelValue.options?.productId },
      ...(query.keyword ? [{ column: 'name', termType: 'like', value: `%${query.keyword}%` }] : []),
    ],
    sorts: [{ name: 'createTime', order: 'desc' }],
  }))
  const devices = await enrichDeviceOptionData(result.data)
  return {
    data: devices.map((item: Record<string, any>) => ({
      label: item.name || item.id,
      value: String(item.id),
      data: item,
    })),
  }
}

async function requestProducts(query: IotAlarmTargetSelectQuery) {
  const result = normalizeResult(await queryProducts({
    pageIndex: query.pageIndex,
    pageSize: query.pageSize,
    terms: query.keyword ? [{ column: 'name', termType: 'like', value: `%${query.keyword}%`, type: 'or' }, { column: 'id', termType: 'like', value: `%${query.keyword}%`, type: 'or' }] : [],
    sorts: [{ name: 'createTime', order: 'desc' }],
  }))
  return {
    data: result.data.map((item: Record<string, any>) => ({
      label: item.name || item.id,
      value: String(item.id),
      data: item,
    })),
  }
}

async function loadOptions(open: boolean) {
  if (!open || optionsLoaded.value || loading.value) return
  loading.value = true
  try {
    const loadedOptions = await requestOptions()
    options.value = [
      ...options.value,
      ...loadedOptions.filter(item => !options.value.some(option => option.value === item.value)),
    ]
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

function changeAlarmConfig(value: unknown) {
  if (typeof value !== 'string') return
  const option = options.value.find(item => item.value === value)
  emit('update:modelValue', {
    ...props.modelValue,
    alarmConfigId: value,
    targetType: option?.targetType,
    options: { ...props.modelValue.options, alarmConfigName: option?.label },
  })
}

function changeDevice(value: string | undefined, option?: IotAlarmTargetSelectOption) {
  selectedDevice.value = value && value !== ALL_DEVICES_VALUE ? option : undefined
  options.value = options.value.filter(item => item.scope === 'product')
  optionsLoaded.value = false
  emit('update:modelValue', {
    ...props.modelValue,
    alarmConfigId: undefined,
    targetType: undefined,
    options: {
      ...props.modelValue.options,
      deviceId: selectedDevice.value?.value,
    },
  })
  void loadDeviceOptions(selectedDevice.value?.value)
}

function changeProduct(value: string | undefined, option?: IotAlarmTargetSelectOption) {
  selectedProduct.value = option
  selectedDevice.value = undefined
  options.value = []
  optionsLoaded.value = false
  emit('update:modelValue', {
    ...props.modelValue,
    alarmConfigId: undefined,
    targetType: undefined,
    options: { productId: value },
  })
  void loadProductOptions(value)
}

function changeMode(value: unknown) {
  if (value !== 'trigger' && value !== 'relieve') return
  emit('update:modelValue', { ...props.modelValue, modes: [value] })
}

async function loadSelectedConfig(id?: string) {
  if (!id || options.value.some(item => item.value === id)) return
  const option = (await requestOptions()).find(item => item.value === id)
  if (!option) return
  options.value = [option, ...options.value]
  if (!props.modelValue.targetType || props.modelValue.options?.alarmConfigName !== option.label) emit('update:modelValue', { ...props.modelValue, targetType: option.targetType, options: { ...props.modelValue.options, alarmConfigName: option.label } })
}

watch(() => [props.modelValue.alarmConfigId, props.modelValue.options?.productId, props.modelValue.options?.deviceId], ([id]) => void loadSelectedConfig(id), { immediate: true })
watch(() => props.modelValue.options?.productId, id => void loadSelectedProduct(id), { immediate: true })
watch(() => props.modelValue.options?.deviceId, id => void loadSelectedDevice(id), { immediate: true })
watch(() => props.modelValue.modes, modes => {
  if (!modes.length) emit('update:modelValue', { ...props.modelValue, modes: ['trigger'] })
}, { immediate: true })

async function loadSelectedProduct(id?: string) {
  if (!id || selectedProduct.value?.value === id) return
  const response: any = await getProduct(id)
  const product = response?.result ?? response
  if (!product?.id) return
  selectedProduct.value = { label: product.name || product.id, value: String(product.id), data: product }
}

async function loadSelectedDevice(id?: string) {
  if (!id || selectedDevice.value?.value === id) return
  const result = normalizeResult(await queryDevicesPage({
    pageIndex: 0,
    pageSize: 1,
    terms: [{ column: 'id', termType: 'eq', value: id }],
  }))
  const device = (await enrichDeviceOptionData(result.data))[0]
  if (!device?.id) return
  selectedDevice.value = { label: device.name || device.id, value: String(device.id), data: device }
}
</script>

<style scoped>
.alarm-trigger-row {
	display: flex;
	gap: var(--space-3, 12px);
	flex: 1;
	align-items: center;
	flex-wrap: nowrap;
}

.alarm-trigger-row__product {
	display: flex;
	flex: 0 0 var(--scene-linkage-resource-select-width, 18rem);
	width: var(--scene-linkage-resource-select-width, 18rem);
	min-width: var(--scene-linkage-resource-select-width, 18rem);
}

.alarm-trigger-row__device {
	display: flex;
	flex: 0 0 var(--scene-linkage-resource-select-width, 18rem);
	width: var(--scene-linkage-resource-select-width, 18rem);
	min-width: var(--scene-linkage-resource-select-width, 18rem);
}

.alarm-trigger-row__alarm-config {
	display: grid;
	grid-column: 1 / -1;
	grid-row: 2;
	grid-template-columns: max-content var(--scene-linkage-resource-select-width, 18rem) max-content var(--scene-linkage-compact-select-width, 8rem);
	gap: 8px;
	min-width: 0;
	align-items: center;
	justify-content: start;
}

.alarm-trigger-row__word {
	white-space: nowrap;
}

.alarm-trigger-row :deep(.ant-select) {
	width: 100% !important;
}
</style>
