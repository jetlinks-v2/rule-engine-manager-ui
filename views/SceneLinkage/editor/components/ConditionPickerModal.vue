<template>
  <a-modal
    :open="open"
    :width="520"
    :footer="null"
    :mask-closable="false"
    wrap-class-name="condition-picker-modal"
    @cancel="$emit('cancel')"
  >
    <template #title>
      <div class="condition-picker__title">
        <span>{{ $t('IotSceneLinkage.title.condition') }}</span>
        <small>{{ $t('IotSceneLinkage.editor.conditionPickerHint') }}</small>
      </div>
    </template>
    <div class="condition-picker__body">
      <div class="condition-picker__items">
        <button v-for="item in conditionTypes" :key="item.value" class="condition-picker__item" :disabled="item.disabled" @click="selectType(item.value)">
          <span class="condition-picker__icon"><AIcon :type="item.icon" /></span>
          <span class="condition-picker__content"><b>{{ item.label }}</b><small>{{ item.description }}</small></span>
        </button>
      </div>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SceneConditionForm } from '../../utils'

const props = defineProps({ open: { type: Boolean, default: false } })
const emit = defineEmits<{
  (event: 'cancel'): void
  (event: 'select', value: SceneConditionForm['type']): void
}>()

const { t } = useI18n()
type ConditionPickerType = SceneConditionForm['type']
const conditionTypes = computed(() => [
  { value: 'timeRange', icon: 'ClockCircleOutlined', label: t('IotSceneLinkage.condition.timeRange'), description: t('IotSceneLinkage.condition.timeRangeHint') },
  { value: 'deviceProperty', icon: 'BarChartOutlined', label: t('IotSceneLinkage.condition.deviceProperty'), description: t('IotSceneLinkage.condition.devicePropertyHint') },
  { value: 'alarmState', icon: 'SafetyCertificateOutlined', label: t('IotSceneLinkage.condition.alarmState'), description: t('IotSceneLinkage.condition.alarmStateHint') },
])

function selectType(type: ConditionPickerType) {
  emit('select', type)
}
</script>

<style scoped>
:global(.condition-picker-modal .ant-modal-content) {
  padding: 1rem;
  overflow: hidden;
  background: linear-gradient(180deg, #bad6ff 0%, #ebf3ff 10%, #fff 31%);
  border-radius: 1.25rem;
  box-shadow: none;
}

:global(.condition-picker-modal .ant-modal-body) {
  padding: 0;
}

:global(.condition-picker-modal .ant-modal-header) {
  margin-bottom: 0 !important;
}

:global(.condition-picker-modal .ant-modal-title) {
  padding-bottom: var(--space-1, 4px) !important;
}

.condition-picker__title {
  display: flex;
  gap: var(--space-2, 8px);
  align-items: baseline;
  min-width: 0;
}

.condition-picker__title span {
  flex: none;
}

.condition-picker__title small {
  overflow: hidden;
  color: var(--ant-color-text-tertiary);
  font-size: .75rem;
  font-weight: 400;
  line-height: 1rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.condition-picker__body {
  padding: var(--space-2, 8px) .875rem .75rem;
  background: rgb(255 255 255 / 70%);
  border: 1px solid #eceff3;
  border-radius: 1rem;
}

.condition-picker__items {
  display: grid;
  gap: .5rem;
}

.condition-picker__item {
  display: flex;
  gap: .375rem;
  align-items: center;
  width: 100%;
  min-height: 4.125rem;
  padding: .6875rem .9375rem;
  text-align: left;
  cursor: pointer;
  background: linear-gradient(123deg, #fff 0%, #f8fbff 100%);
  border: 1px solid #f1f5f9;
  border-radius: .5rem;
  transition: border-color .2s, background-color .2s;
}

.condition-picker__item:hover:not(:disabled) {
  border-color: #1e72f0;
}

.condition-picker__item:disabled {
  cursor: not-allowed;
  opacity: .56;
}

.condition-picker__content {
  display: grid;
  flex: 1;
  gap: .25rem;
  min-width: 0;
}

.condition-picker__content b {
  color: #1d2129;
  font-size: .875rem;
  font-weight: 500;
  line-height: 1.25rem;
}

.condition-picker__content small {
  overflow: hidden;
  color: #4e5969;
  font-size: .75rem;
  font-weight: 400;
  line-height: 1rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.condition-picker__icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  color: #1e72f0;
  background: linear-gradient(180deg, #f6f9fe 0%, #fefefe 100%);
  border: 1px solid #f3f7fc;
  border-radius: 50%;
}

.condition-picker__icon :deep(.anticon) {
  font-size: 1.25rem;
}
</style>
