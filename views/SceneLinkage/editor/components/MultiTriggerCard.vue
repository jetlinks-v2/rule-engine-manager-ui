<template>
  <article :class="['multi-trigger-card', { 'multi-trigger-card--alarm': trigger.triggerKind === 'alarm' }]">
    <header class="multi-trigger-card__header">
      <span :class="['multi-trigger-card__icon', `multi-trigger-card__icon--${trigger.triggerKind}`]"><AIcon :type="icon" /></span>
      <strong>{{ $t(`IotSceneLinkage.trigger.${trigger.triggerKind}`) }}</strong>
    </header>

    <div class="multi-trigger-card__content">
      <div class="multi-trigger-card__main">
        <div v-if="isDevice" class="multi-trigger-card__row">
          <IotAlarmTargetSelect v-model="trigger.productId" class="multi-trigger-card__product" :request="requestProducts" :selected-option="selectedProduct" :placeholder="$t('IotSceneLinkage.placeholder.product')" rich @change="changeProduct" />
          <a-button class="multi-trigger-card__scope" :title="scopeTitle" :disabled="!trigger.productId" @click="scopeVisible = true"><AIcon type="AimOutlined" /><span class="multi-trigger-card__scope-text">{{ scopeText }}</span></a-button>
          <template v-if="trigger.triggerKind === 'property'">
            <span>{{ $t('IotSceneLinkage.condition.current') }}</span>
            <ThingModelSelect v-model="trigger.propertyId" class="multi-trigger-card__thing" :options="propertyOptions" :disabled="!trigger.productId" @change="changeProperty" />
            <a-select v-model:value="trigger.termType" class="multi-trigger-card__term" popup-class-name="scene-editor__compact-dropdown" :dropdown-match-select-width="false" :options="termOptions" />
            <ThingModelValueInput v-model="trigger.termValue" class="multi-trigger-card__value" :value-type="selectedProperty?.valueType" />
          </template>
          <template v-else-if="trigger.triggerKind === 'event'">
            <span>{{ $t('IotSceneLinkage.rule.when') }}</span>
            <ThingModelSelect v-model="trigger.eventId" class="multi-trigger-card__thing" :options="eventOptions" :disabled="!trigger.productId" @change="changeEvent" />
            <template v-if="trigger.eventId">
              <span>{{ $t('IotSceneLinkage.condition.eventOutput') }}</span>
              <ThingModelSelect v-model="trigger.eventOutputId" class="multi-trigger-card__output" :options="eventOutputOptions" @change="changeEventOutput" />
              <a-select v-model:value="trigger.eventTermType" class="multi-trigger-card__term" popup-class-name="scene-editor__compact-dropdown" :dropdown-match-select-width="false" :options="eventTermOptions" />
              <ThingModelValueInput v-model="trigger.eventTermValue" class="multi-trigger-card__value" :value-type="selectedEventOutput?.valueType" />
            </template>
          </template>
          <DeviceStateTriggerRow v-else-if="trigger.triggerKind === 'state'" v-model:state="trigger.deviceState" v-model:mode="trigger.deviceStateTriggerMode" v-model:sustained-time="trigger.deviceStateSustainedTime" :removable="false" />
        </div>
        <AlarmTriggerSourceRow v-else-if="trigger.triggerKind === 'alarm'" v-model="trigger.alarm" />
        <AiEventTriggerRow v-else-if="trigger.triggerKind === 'ai-event'" v-model="trigger.aiEvent" class="multi-trigger-card__row" />
        <div v-else-if="trigger.triggerKind === 'repeat'" class="multi-trigger-card__row">
          <a-radio-group v-model:value="trigger.repeatMode">
            <a-radio-button value="daily">{{ $t('IotSceneLinkage.repeat.daily') }}</a-radio-button><a-radio-button value="weekdays">{{ $t('IotSceneLinkage.repeat.weekdays') }}</a-radio-button><a-radio-button value="weekends">{{ $t('IotSceneLinkage.repeat.weekends') }}</a-radio-button><a-radio-button value="custom">{{ $t('IotSceneLinkage.repeat.custom') }}</a-radio-button>
          </a-radio-group>
          <a-time-picker v-model:value="trigger.repeatTime" format="HH:mm" value-format="HH:mm" />
        </div>
        <div v-else-if="trigger.triggerKind === 'date'" class="multi-trigger-card__row"><a-date-picker v-model:value="trigger.dateTime" show-time format="YYYY-MM-DD HH:mm:ss" value-format="YYYY-MM-DD HH:mm:ss" /><span>{{ $t('IotSceneLinkage.editor.dateExecutionHint') }}</span></div>
        <div v-else-if="trigger.triggerKind === 'interval'" class="multi-trigger-card__row"><span>{{ $t('IotSceneLinkage.editor.every') }}</span><a-input-number v-model:value="trigger.interval" :min="1" /><a-select v-model:value="trigger.intervalUnit" popup-class-name="scene-editor__compact-dropdown" :dropdown-match-select-width="false" :options="units" /><span>{{ $t('IotSceneLinkage.editor.triggerOnce') }}</span></div>
      </div>

      <div v-if="trigger.triggerKind === 'repeat' && trigger.repeatMode === 'custom'" class="multi-trigger-card__repeat-options">
        <a-radio-group v-model:value="trigger.repeatCustomMode"><a-radio-button value="weekly">{{ $t('IotSceneLinkage.repeat.weekly') }}</a-radio-button><a-radio-button value="monthly">{{ $t('IotSceneLinkage.repeat.monthly') }}</a-radio-button></a-radio-group>
        <a-checkbox-group v-if="trigger.repeatCustomMode === 'weekly'" v-model:value="trigger.repeatWeekdays" :options="weekOptions" />
        <a-checkbox-group v-else v-model:value="trigger.repeatMonthDays" :options="monthDayOptions" />
      </div>

      <a-button v-if="removable" class="multi-trigger-card__remove" type="text" danger @click="$emit('remove')"><AIcon type="DeleteOutlined" /></a-button>
    </div>

    <DeviceScopeModal :open="scopeVisible" :product-id="trigger.productId" :model-value="scope" @cancel="scopeVisible = false" @save="saveScope" />
  </article>
</template>

<script setup lang="ts">
import { computed, ref, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { getProduct, queryProducts } from '../../../../api/scene-linkage'
import type { SceneMultiTriggerForm } from '../../utils'
import IotAlarmTargetSelect, { type IotAlarmTargetSelectOption, type IotAlarmTargetSelectQuery } from '../alarm/IotAlarmTargetSelect.vue'
import AlarmTriggerSourceRow from './AlarmTriggerSourceRow.vue'
import AiEventTriggerRow from './AiEventTriggerRow.vue'
import DeviceScopeModal, { type DeviceScope } from './DeviceScopeModal.vue'
import DeviceStateTriggerRow from './DeviceStateTriggerRow.vue'
import ThingModelSelect from './ThingModelSelect.vue'
import ThingModelValueInput from './ThingModelValueInput.vue'
import { formatDeviceScopeText, formatDeviceScopeTitle, toTriggerScopeValue } from '../deviceScopeLabel'
import { getTermTypes, toThingModelOptions } from '../thingModel'

const props = defineProps({ trigger: { type: Object as PropType<SceneMultiTriggerForm>, required: true }, removable: Boolean })
defineEmits<{ (event: 'remove'): void }>()
const { t } = useI18n()
const scopeVisible = ref(false)
const selectedProduct = ref<IotAlarmTargetSelectOption>()
const properties = ref<any[]>([])
const events = ref<any[]>([])
const trigger = computed(() => props.trigger)
const isDevice = computed(() => ['property', 'event', 'online', 'offline', 'state'].includes(trigger.value.triggerKind))
const icon = computed(() => ({ manual: 'ThunderboltOutlined', repeat: 'ClockCircleOutlined', date: 'CalendarOutlined', interval: 'SyncOutlined', property: 'RiseOutlined', event: 'NotificationOutlined', online: 'LoginOutlined', offline: 'LogoutOutlined', state: 'SyncOutlined', alarm: 'AlertOutlined' }[trigger.value.triggerKind] || 'ThunderboltOutlined'))
const units = computed(() => ['seconds', 'minutes', 'hours'].map(value => ({ value, label: t(`IotSceneLinkage.unit.${value}`) })))
const weekOptions = computed(() => ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day, index) => ({ value: index + 1, label: t(`IotSceneLinkage.weekday.${day}`) })))
const monthDayOptions = computed(() => Array.from({ length: 31 }, (_, index) => ({ value: index + 1, label: t('IotSceneLinkage.monthDay', { day: index + 1 }) })))
const propertyOptions = computed(() => toThingModelOptions(properties.value, 'property'))
const eventOptions = computed(() => toThingModelOptions(events.value, 'event'))
const selectedProperty = computed(() => propertyOptions.value.find(item => item.value === trigger.value.propertyId))
const selectedEvent = computed(() => events.value.find(item => item.id === trigger.value.eventId))
const eventOutputOptions = computed(() => toThingModelOptions(selectedEvent.value?.outputs || selectedEvent.value?.output?.properties || selectedEvent.value?.output || selectedEvent.value?.valueType?.properties || [], 'property'))
const selectedEventOutput = computed(() => eventOutputOptions.value.find(item => item.value === trigger.value.eventOutputId))
const termOptions = computed(() => getTermTypes(selectedProperty.value?.valueType).map(value => ({ value, label: t(`IotSceneLinkage.term.${value}`) })))
const eventTermOptions = computed(() => getTermTypes(selectedEventOutput.value?.valueType).map(value => ({ value, label: t(`IotSceneLinkage.term.${value}`) })))
const scopeText = computed(() => formatDeviceScopeText(t, toTriggerScopeValue(trigger.value), { emptyText: t('IotSceneLinkage.placeholder.device') }))
const scopeTitle = computed(() => formatDeviceScopeTitle(t, toTriggerScopeValue(trigger.value), { emptyText: t('IotSceneLinkage.placeholder.device') }))
const scope = computed(() => ({ selector: trigger.value.allDevices ? 'all' : trigger.value.dynamicScope ? trigger.value.dynamicScopeType : 'fixed', selectorValues: trigger.value.dynamicScope ? trigger.value.groupIds.map(value => ({ value })) : trigger.value.deviceIds.map((value, index) => ({ value, name: trigger.value.scopeOptions.names?.[index] })), options: trigger.value.scopeOptions }))

async function requestProducts(query: IotAlarmTargetSelectQuery) {
  const terms = query.keyword ? [{ column: 'name', termType: 'like', value: `%${query.keyword}%`, type: 'or' }, { column: 'id', termType: 'like', value: `%${query.keyword}%`, type: 'or' }] : []
  const response: any = await queryProducts({ pageIndex: query.pageIndex, pageSize: query.pageSize, sorts: [{ name: 'createTime', order: 'desc' }], terms })
  const result = response?.result ?? response
  const data = result?.data || result?.records || []
  return { data: data.map((item: any) => ({ label: item.name || item.id, value: item.id, data: item })), total: Number(result?.total ?? data.length) }
}
async function loadMetadata(productId?: string) {
  if (!productId) { properties.value = []; events.value = []; return }
  const response: any = await getProduct(productId)
  const product = response?.result ?? response
  const metadata = typeof product?.metadata === 'string' ? JSON.parse(product.metadata) : product?.metadata || {}
  properties.value = metadata.properties || []
  events.value = metadata.events || []
}
async function loadSelectedProduct(productId?: string) {
  if (!productId || selectedProduct.value?.value === productId) return
  const response: any = await getProduct(productId)
  const product = response?.result ?? response
  if (product?.id) selectedProduct.value = { label: product.name || product.id, value: String(product.id), data: product }
}
function changeProduct(value?: string, option?: IotAlarmTargetSelectOption) {
  selectedProduct.value = option
  Object.assign(trigger.value, { productId: value, productName: option?.label, allDevices: false, dynamicScope: false, groupIds: [], deviceIds: [], propertyId: undefined, propertyName: undefined, eventId: undefined, eventName: undefined, eventOutputId: undefined, eventOutputName: undefined, termValue: undefined, eventTermValue: undefined })
  void loadMetadata(value)
}
function changeProperty(value?: string) { const option = propertyOptions.value.find(item => item.value === value); trigger.value.propertyName = option?.label; trigger.value.termValue = undefined }
function changeEvent(value?: string) { const option = eventOptions.value.find(item => item.value === value); Object.assign(trigger.value, { eventName: option?.label, eventOutputId: undefined, eventOutputName: undefined, eventTermValue: undefined }) }
function changeEventOutput(value?: string) { trigger.value.eventOutputName = eventOutputOptions.value.find(item => item.value === value)?.label; trigger.value.eventTermValue = undefined }
function saveScope(value: DeviceScope) {
  const isDynamicScope = ['space', 'device-group'].includes(value.selector)
  const selectorValues = value.selectorValues
  Object.assign(trigger.value, { allDevices: value.selector === 'all', dynamicScope: isDynamicScope, dynamicScopeType: value.selector === 'space' ? 'space' : 'device-group', scopeOptions: { ...value.options, names: selectorValues.map(item => item.name || item.value) }, groupIds: isDynamicScope ? selectorValues.map(item => item.value) : [], deviceIds: value.selector === 'fixed' ? selectorValues.map(item => item.value) : [] })
  scopeVisible.value = false
}
watch(() => trigger.value.productId, value => { void loadMetadata(value); void loadSelectedProduct(value) }, { immediate: true })
</script>

<style scoped>
.multi-trigger-card {
  position: relative;
  display: grid;
  grid-template-columns: 1.75rem var(--scene-linkage-title-column-width, 5.5rem) minmax(0, 1fr);
  gap: var(--space-3, 12px);
  align-items: center;
  padding: var(--space-4, 16px);
  margin-top: var(--space-3, 12px);
  overflow-x: auto;
  background: #fffdf8;
  border: 1px solid #f5dfc7;
  border-radius: var(--radius-jet-sm, 10px);
}

.multi-trigger-card__header {
  display: contents;
}

.multi-trigger-card__header > strong {
  grid-column: 2;
}

.multi-trigger-card__icon {
  display: grid;
  grid-column: 1;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
}

.multi-trigger-card--alarm .multi-trigger-card__header > strong {
  align-self: start;
  margin-top: 7px;
}

.multi-trigger-card--alarm .multi-trigger-card__icon {
  align-self: start;
  margin-top: 4px;
}

.multi-trigger-card__content {
  display: grid;
  grid-column: 3;
  grid-template-columns: minmax(0, max-content) minmax(2rem, 1fr);
  grid-template-rows: auto auto;
  gap: var(--space-3, 12px);
  align-items: center;
  width: 100%;
  min-width: max-content;
}

.multi-trigger-card__main {
  display: flex;
  grid-column: 1;
  grid-row: 1;
  gap: var(--space-3, 12px);
  align-items: center;
  min-width: max-content;
}

.multi-trigger-card__row {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: nowrap;
  gap: var(--space-3, 12px);
  align-items: center;
  min-width: max-content;
}

.multi-trigger-card__main > :deep(.alarm-trigger-source-row),
.multi-trigger-card__main > :deep(.ai-event-trigger-row) {
  flex: 0 0 auto;
  flex-wrap: nowrap;
  width: max-content;
  min-width: max-content;
}

.multi-trigger-card__main > :deep(.alarm-trigger-source-row) > :last-child {
  flex: 0 0 auto;
  min-width: max-content;
}

.multi-trigger-card__main :deep(.alarm-trigger-row),
.multi-trigger-card__main :deep(.visual-ai-alarm-trigger-row),
.multi-trigger-card__main :deep(.visual-ai-alarm-selector) {
  flex: 0 0 auto;
  flex-wrap: nowrap;
  width: max-content;
  min-width: max-content;
}

.multi-trigger-card__repeat-options {
  display: grid;
  grid-column: 1;
  grid-row: 2;
  gap: var(--space-3, 12px);
  width: max-content;
  min-width: max-content;
  padding: var(--space-3, 12px);
  background: var(--ant-color-fill-quaternary);
  border-radius: 6px;
}

.multi-trigger-card__icon--manual,
.multi-trigger-card__icon--offline {
  color: #4e5969;
  background: #f2f3f5;
}

.multi-trigger-card__icon--repeat {
  color: #1e5eff;
  background: #e8f0ff;
}

.multi-trigger-card__icon--date,
.multi-trigger-card__icon--online {
  color: #0e8a5f;
  background: #e6f5ee;
}

.multi-trigger-card__icon--interval,
.multi-trigger-card__icon--state {
  color: #6c4fe0;
  background: #efebff;
}

.multi-trigger-card__icon--property {
  color: #1e5eff;
  background: #e8f0ff;
}

.multi-trigger-card__icon--event {
  color: #d02f5a;
  background: #ffecf0;
}

.multi-trigger-card__icon--alarm {
  color: #ff4d4f;
  background: #fff1f0;
}

.multi-trigger-card__product {
  flex: 0 0 var(--scene-linkage-resource-select-width, 18rem);
  width: var(--scene-linkage-resource-select-width, 18rem) !important;
  min-width: var(--scene-linkage-resource-select-width, 18rem);
}

.multi-trigger-card__scope {
  display: inline-flex;
  flex: 0 0 var(--scene-linkage-device-select-width, 18rem);
  width: var(--scene-linkage-device-select-width, 18rem);
  min-width: var(--scene-linkage-device-select-width, 18rem);
  align-items: center;
  justify-content: center;
}

.multi-trigger-card__scope-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.multi-trigger-card__thing,
.multi-trigger-card__output {
  flex: 0 0 var(--scene-linkage-thing-model-select-width, 18rem);
  width: var(--scene-linkage-thing-model-select-width, 18rem) !important;
  min-width: var(--scene-linkage-thing-model-select-width, 18rem);
}

.multi-trigger-card__term {
  flex: 0 0 var(--scene-linkage-compact-select-width, 8rem);
  width: var(--scene-linkage-compact-select-width, 8rem);
}

.multi-trigger-card__value {
  flex: 0 0 var(--scene-linkage-value-input-width, 11rem);
  width: var(--scene-linkage-value-input-width, 11rem);
}

.multi-trigger-card :deep(.alarm-trigger-row__target-select),
.multi-trigger-card :deep(.alarm-trigger-row__product) {
  flex: 0 0 var(--scene-linkage-resource-select-width, 18rem) !important;
  width: var(--scene-linkage-resource-select-width, 18rem) !important;
  min-width: var(--scene-linkage-resource-select-width, 18rem);
}

.multi-trigger-card :deep(.alarm-trigger-row__alarm-config) {
  flex-basis: calc(100% - 3rem);
}

.multi-trigger-card__row :deep(.device-state-trigger) {
  flex: 1 1 auto;
}

.multi-trigger-card__remove {
  grid-column: 2;
  grid-row: 1 / -1;
  flex: none;
  align-self: center;
  justify-self: end;
  width: auto;
  min-width: auto;
  padding: 0;
  color: #ff4d4f !important;
}

.multi-trigger-card__remove :deep(.anticon) {
  color: #ff4d4f !important;
}
</style>
