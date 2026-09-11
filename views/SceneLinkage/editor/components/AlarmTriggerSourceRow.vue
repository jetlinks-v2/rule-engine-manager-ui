<template>
  <div class="alarm-trigger-source-row">
    <a-radio-group :value="sourceKind" size="small" @change="changeSource">
      <a-radio-button value="iot-device">{{ $t('IotSceneLinkage.alarmSource.iotDevice') }}</a-radio-button>
      <a-radio-button value="visual-ai">{{ $t('IotSceneLinkage.alarmSource.visualAi') }}</a-radio-button>
    </a-radio-group>
    <AlarmTriggerRow v-if="sourceKind === 'iot-device'" :model-value="modelValue" @update:model-value="updateValue" />
    <VisualAiAlarmTriggerRow v-else :model-value="modelValue" @update:model-value="updateValue" />
  </div>
</template>

<script setup lang="ts">
import { computed, type PropType } from 'vue'
import type { SceneAlarmTriggerConfig } from '../../utils'
import AlarmTriggerRow from './AlarmTriggerRow.vue'
import VisualAiAlarmTriggerRow from './VisualAiAlarmTriggerRow.vue'

const props = defineProps({
  modelValue: { type: Object as PropType<SceneAlarmTriggerConfig>, required: true },
})
const emit = defineEmits<{
  (event: 'update:modelValue', value: SceneAlarmTriggerConfig): void
}>()

const sourceKind = computed(() => props.modelValue.sourceKind
  || (props.modelValue.targetType === 'aiTaskMediaTarget' ? 'visual-ai' : 'iot-device'))

function updateValue(value: SceneAlarmTriggerConfig) {
  emit('update:modelValue', value)
}

function changeSource(event: { target?: { value?: unknown } }) {
  const value = event.target?.value
  if (value !== 'iot-device' && value !== 'visual-ai') return
  // 切换来源时清除另一类告警的资源链，避免把产品或算法范围带入新来源。
  emit('update:modelValue', value === 'iot-device'
    ? { sourceKind: value, modes: ['trigger'], options: {} }
    : { sourceKind: value, targetType: 'aiTaskMediaTarget', modes: ['trigger'], options: {} })
}
</script>

<style scoped>
.alarm-trigger-source-row { display: flex; flex: 1; flex-wrap: nowrap; gap: var(--space-3, 12px); align-items: center; min-width: 0; }
.alarm-trigger-source-row > :last-child { flex: 1 1 0; min-width: 0; }
@media (max-width: 70rem) { .alarm-trigger-source-row { flex-wrap: wrap; }.alarm-trigger-source-row > :last-child { flex-basis: 100%; } }
</style>
