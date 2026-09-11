<template>
	<div class="scene-condition-row-wrapper">
		<div :class="['scene-condition-row', { 'scene-condition-row--invalid': invalid }]">
			<span class="scene-condition-row__index">{{ index + 1 }}</span>
			<span :class="['scene-condition-row__icon', `scene-condition-row__icon--${condition.type}`]"><AIcon
				:type="condition.type === 'timeRange' ? 'ClockCircleOutlined' : condition.type === 'alarmState' ? 'AlertOutlined' : 'BarChartOutlined'"/></span>
			<strong>{{
					condition.type === 'timeRange' ? $t('IotSceneLinkage.condition.timeRange') : condition.type === 'alarmState' ? $t('IotSceneLinkage.condition.alarmState') : $t('IotSceneLinkage.condition.deviceProperty')
				}}</strong>
			<template v-if="condition.type === 'deviceProperty'">
				<IotAlarmTargetSelect :model-value="condition.productId || undefined" class="scene-condition-row__product"
				                      :request="requestProducts" :selected-option="selectedProduct"
				                      :placeholder="$t('IotSceneLinkage.placeholder.product')" rich @change="onProductChange"/>
				<a-button class="scene-condition-row__scope" :title="scopeTitle" :disabled="!condition.productId" @click="scopeVisible = true">
					<AIcon type="AimOutlined"/>
					{{ scopeText }}
				</a-button>
			</template>
			<div
				:class="['scene-condition-row__footer', {
					'scene-condition-row__footer--full': condition.type === 'deviceProperty',
					'scene-condition-row__footer--alarm': condition.type === 'alarmState',
				}]">
				<TimeRangeConditionEditor v-if="condition.type === 'timeRange'" :model-value="condition.ranges"
				                          @update:model-value="updateTimeRanges"/>
				<div v-else-if="condition.type === 'deviceProperty'" class="scene-condition-row__condition">
					<span class="scene-condition-row__word">{{ $t('IotSceneLinkage.condition.currentProperty') }}</span>
					<ThingModelSelect class="scene-condition-row__property" :model-value="condition.propertyId || undefined"
					                  :options="propertyOptions" :placeholder="$t('IotSceneLinkage.placeholder.property')"
					                  :disabled="!condition.productId" @change="updateProperty"/>
					<a-select class="scene-condition-row__term-type" :value="condition.termType" :options="termOptions"
					          @change="updateTermType"/>
					<ThingModelValueInput class="scene-condition-row__value" :model-value="condition.value"
					                      :value-type="selectedProperty?.valueType" @update:model-value="updateValue"/>
				</div>
				<AlarmStateConditionRow v-else :model-value="condition.alarm" @update:model-value="updateAlarm"/>
				<a-button class="scene-condition-row__remove" type="text" danger @click="$emit('remove')">
					<AIcon type="DeleteOutlined"/>
				</a-button>
			</div>
			<DeviceScopeModal v-if="condition.type === 'deviceProperty'" :open="scopeVisible"
			                  :product-id="condition.productId"
			                  :model-value="{ selector: condition.selector, selectorValues: condition.selectorValues, options: condition.options }"
			                  @cancel="scopeVisible = false" @save="saveScope"/>
		</div>
		<p v-if="invalid" class="scene-condition-row__error">{{ errorMessage }}</p>
	</div>
</template>

<script setup lang="ts">
import {computed, ref, watch, type PropType} from 'vue'
import {useI18n} from 'vue-i18n'
import {getProduct, queryProducts} from '../../../../api/scene-linkage'
import type {SceneConditionForm} from '../../utils'
import IotAlarmTargetSelect, {
	type IotAlarmTargetSelectOption,
	type IotAlarmTargetSelectQuery
} from '../alarm/IotAlarmTargetSelect.vue'
import AlarmStateConditionRow from './AlarmStateConditionRow.vue'
import DeviceScopeModal, {type DeviceScope} from './DeviceScopeModal.vue'
import TimeRangeConditionEditor from './TimeRangeConditionEditor.vue'
import ThingModelValueInput from './ThingModelValueInput.vue'
import ThingModelSelect from './ThingModelSelect.vue'
import {formatDeviceScopeText, formatDeviceScopeTitle} from '../deviceScopeLabel'
import {getTermTypes, toThingModelOptions} from '../thingModel'

const props = defineProps({
	condition: {type: Object as PropType<SceneConditionForm>, required: true},
	index: {type: Number, required: true},
	invalid: Boolean,
	errorMessage: {type: String, default: ''},
})
const emit = defineEmits<{
	(event: 'update', value: SceneConditionForm): void
	(event: 'remove'): void
}>()

const {t} = useI18n()
const scopeVisible = ref(false)
const selectedProduct = ref<IotAlarmTargetSelectOption>()
const properties = ref<any[]>([])
const propertyOptions = computed(() => toThingModelOptions(properties.value, 'property'))
const selectedProperty = computed(() => propertyOptions.value.find(item => item.value === (props.condition.type === 'deviceProperty' ? props.condition.propertyId : '')))
const termOptions = computed(() => getTermTypes(selectedProperty.value?.valueType).map(value => ({
	value,
	label: t(`IotSceneLinkage.term.${value}`)
})))
const scopeText = computed(() => props.condition.type === 'deviceProperty'
	? formatDeviceScopeText(t, {
		selector: props.condition.selector,
		selectorValues: props.condition.selectorValues,
		options: props.condition.options,
	}, {emptyText: t('IotSceneLinkage.placeholder.device')})
	: t('IotSceneLinkage.placeholder.device'))
const scopeTitle = computed(() => props.condition.type === 'deviceProperty'
	? formatDeviceScopeTitle(t, {
		selector: props.condition.selector,
		selectorValues: props.condition.selectorValues,
		options: props.condition.options,
	}, {emptyText: t('IotSceneLinkage.placeholder.device')})
	: t('IotSceneLinkage.placeholder.device'))

function update(value: SceneConditionForm) {
	emit('update', value)
}

function updateAlarm(alarm: Extract<SceneConditionForm, { type: 'alarmState' }>['alarm']) {
	if (props.condition.type === 'alarmState') update({...props.condition, alarm})
}

function updateTimeRanges(ranges: Extract<SceneConditionForm, { type: 'timeRange' }>['ranges']) {
	if (props.condition.type === 'timeRange') update({...props.condition, ranges})
}

async function requestProducts(query: IotAlarmTargetSelectQuery) {
	const keyword = query.keyword.trim()
	const terms = keyword
		? [
			{column: 'name', termType: 'like', value: `%${keyword}%`, type: 'or'},
			{column: 'id', termType: 'like', value: `%${keyword}%`, type: 'or'},
		]
		: []
	const response: any = await queryProducts({
		pageIndex: query.pageIndex,
		pageSize: query.pageSize,
		sorts: [{name: 'createTime', order: 'desc'}],
		terms,
	})
	const result = response?.result ?? response
	const data = result?.data || result?.records || []
	return {
		data: data.map((item: any) => ({label: item.name || item.id, value: item.id, data: item})),
		total: Number(result?.total ?? result?.totalElements ?? data.length),
	}
}

async function loadMetadata(productId?: string) {
	if (!productId) {
		properties.value = []
		return
	}
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
	selectedProduct.value = {
		label: product.name || product.id,
		value: String(product.id),
		data: product,
	}
	if (props.condition.type === 'deviceProperty' && props.condition.options?.productName !== selectedProduct.value.label) {
		update({...props.condition, options: {...props.condition.options, productName: selectedProduct.value.label}})
	}
}

function onProductChange(_value?: string, option?: IotAlarmTargetSelectOption) {
	if (props.condition.type !== 'deviceProperty') return
	selectedProduct.value = option
	update({
		...props.condition,
		productId: option?.value || '',
		selector: 'fixed',
		selectorValues: [],
		propertyId: '',
		options: {productName: option?.label || ''}
	})
	void loadMetadata(option?.value)
}

function updateProperty(value: unknown) {
	if (props.condition.type !== 'deviceProperty' || typeof value !== 'string') return
	const property = propertyOptions.value.find(item => item.value === value)
	const termTypes = getTermTypes(property?.valueType)
	update({
		...props.condition,
		propertyId: value,
		termType: termTypes.includes(props.condition.termType) ? props.condition.termType : termTypes[0],
		value: '',
		options: {...props.condition.options, propertiesName: property?.label || value},
	})
}

function updateTermType(value: unknown) {
	if (props.condition.type === 'deviceProperty' && typeof value === 'string') update({
		...props.condition,
		termType: value
	})
}

function updateValue(value: unknown) {
	if (props.condition.type === 'deviceProperty') update({...props.condition, value: value as string | number | boolean})
}

function saveScope(scope: DeviceScope) {
	if (props.condition.type === 'deviceProperty') update({
		...props.condition, ...scope,
		options: {
			...props.condition.options, ...scope.options,
			name: scope.selectorValues.map(item => item.name || item.value).join('、')
		}
	})
	scopeVisible.value = false
}

watch(() => props.condition.type === 'deviceProperty' ? props.condition.productId : '', productId => {
	if (!productId) {
		selectedProduct.value = undefined
		return
	}
	void loadMetadata(productId)
	void loadSelectedProduct(productId)
}, {immediate: true})
</script>

<style scoped>
.scene-condition-row-wrapper {
	margin-bottom: var(--space-3, 12px);
}

.scene-condition-row {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-3, 12px);
	align-items: center;
	width: 100%;
	min-width: 0;
	padding: var(--space-4, 16px);
	border: 1px solid #eceff3;
	border-radius: var(--radius-jet-sm, 10px);
	background: var(--jet-theme-bg-container);
}

.scene-condition-row--invalid {
	border-color: var(--ant-color-error);
	box-shadow: 0 0 0 2px rgba(245, 34, 45, .08);
}

.scene-condition-row__error {
	margin: 6px 0 0;
	color: #f5222d;
	font-size: 12px;
	line-height: 18px;
}

.scene-condition-row > strong {
	flex: none;
	white-space: nowrap;
}

.scene-condition-row__index, .scene-condition-row__icon {
	display: grid;
	flex: none;
	place-items: center;
	width: 28px;
	height: 28px;
	border-radius: var(--radius-jet-sm, 10px);
}

.scene-condition-row__index {
	width: 22px;
	height: 22px;
	color: var(--ant-color-success);
	background: var(--ant-color-fill-secondary);
	border-radius: 50%;
	font-size: 12px;
	font-weight: 600;
}

.scene-condition-row__icon {
	color: var(--ant-color-text-secondary);
	background: var(--ant-color-fill-secondary);
}

.scene-condition-row__icon--timeRange {
	color: #6c4fe0;
	background: #efebff;
}

.scene-condition-row__icon--deviceProperty {
	color: #1e5eff;
	background: #e8f0ff;
}

.scene-condition-row__icon--alarmState {
	color: #ff4d4f;
	background: #fff1f0;
}

.scene-condition-row__product {
	flex: 0 0 var(--scene-linkage-resource-select-width, 10.5rem);
	width: var(--scene-linkage-resource-select-width, 10.5rem) !important;
	min-width: var(--scene-linkage-resource-select-width, 10.5rem);
}

.scene-condition-row__scope {
	display: inline-flex;
	flex: 0 0 var(--scene-linkage-device-select-width, 17rem);
	justify-content: center;
	width: var(--scene-linkage-device-select-width, 17rem);
	min-width: var(--scene-linkage-device-select-width, 17rem);
	text-align: center;
}

.scene-condition-row__word {
	flex: none;
	white-space: nowrap;
}

.scene-condition-row__footer {
	display: grid;
	flex: 1;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: var(--space-3, 12px);
	align-items: end;
	min-width: 0;
}

.scene-condition-row__footer--full {
	flex: 0 0 100%;
}

.scene-condition-row__footer--alarm {
	flex: 1 1 0;
}

.scene-condition-row__condition {
	display: flex;
	gap: var(--space-3, 12px);
	align-items: center;
	min-width: 0;
}

.scene-condition-row__remove {
	align-self: end;
	justify-self: end;
}

.scene-condition-row :deep(.ant-select), .scene-condition-row :deep(.ant-input) {
	width: 120px;
}

.scene-condition-row :deep(.scene-condition-row__property) {
	flex: 0 0 var(--scene-linkage-thing-model-select-width, 15.75rem);
	width: var(--scene-linkage-thing-model-select-width, 15.75rem) !important;
	min-width: var(--scene-linkage-thing-model-select-width, 15.75rem);
}

.scene-condition-row :deep(.scene-condition-row__value) {
	width: 11rem;
}

.scene-condition-row :deep(.scene-condition-row__term-type) {
	width: 88px;
}
</style>
