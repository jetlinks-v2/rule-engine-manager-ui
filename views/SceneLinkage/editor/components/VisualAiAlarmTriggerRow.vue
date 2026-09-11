<template>
  <div class="visual-ai-alarm-trigger-row">
    <VisualAiAlarmSelector :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" />
    <span class="visual-ai-alarm-trigger-row__word">{{ $t('IotSceneLinkage.alarmPhrase.statusChange') }}</span>
    <a-select
      class="visual-ai-alarm-trigger-row__mode"
      :value="modelValue.modes[0] || 'trigger'"
      :options="modeOptions"
      @change="changeMode"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import VisualAiAlarmSelector from './VisualAiAlarmSelector.vue'
import type { SceneAlarmTriggerConfig } from '../../utils'

const props = defineProps({
  modelValue: { type: Object as PropType<SceneAlarmTriggerConfig>, required: true },
})
const emit = defineEmits<{
  (event: 'update:modelValue', value: SceneAlarmTriggerConfig): void
}>()

const { t } = useI18n()
const modeOptions = computed(() => [
  { value: 'trigger', label: t('IotSceneLinkage.alarmMode.trigger') },
  { value: 'relieve', label: t('IotSceneLinkage.alarmMode.relieve') },
])

function changeMode(value: unknown) {
  if (value !== 'trigger' && value !== 'relieve') return
  emit('update:modelValue', { ...props.modelValue, modes: [value] })
}

</script>

<style scoped>
.visual-ai-alarm-trigger-row { display: flex; flex: 1; flex-wrap: wrap; gap: var(--space-2, 8px); align-items: center; min-width: 0; }
.visual-ai-alarm-trigger-row__mode { flex: 0 1 11rem; min-width: 10rem; max-width: 11rem; }
.visual-ai-alarm-trigger-row__word { flex: none; white-space: nowrap; }
</style>
