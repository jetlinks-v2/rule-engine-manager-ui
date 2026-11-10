<template>
  <div v-if="open === undefined" class="ai-event-trigger-row">
    <AiEventMediaTargetSelector
      :model-value="modelValue"
      @update:model-value="$emit('update:modelValue', $event)"
      @confirm="$emit('confirm', $event)"
      @cancel="$emit('cancel')"
    />
    <span v-if="summary" class="ai-event-trigger-row__summary">{{ summary }}</span>
    <span v-else class="ai-event-trigger-row__placeholder">{{ $t('IotSceneLinkage.aiEvent.selectCameraSource') }}</span>
  </div>
  <AiEventMediaTargetSelector
    v-else
    :open="open"
    :model-value="modelValue"
    @confirm="$emit('confirm', $event)"
    @cancel="$emit('cancel')"
  />
</template>

<script setup lang="ts">
import { computed, type PropType } from 'vue'
import type { SceneAiEventTriggerConfig } from '../../utils'
import AiEventMediaTargetSelector from './AiEventMediaTargetSelector.vue'

const props = defineProps({
  modelValue: { type: Object as PropType<SceneAiEventTriggerConfig>, required: true },
  open: { type: Boolean as PropType<boolean | undefined>, default: undefined },
})
defineEmits<{
  (event: 'update:modelValue', value: SceneAiEventTriggerConfig): void
  (event: 'confirm', value: SceneAiEventTriggerConfig): void
  (event: 'cancel'): void
}>()

const summary = computed(() => {
  const camera = props.modelValue.mediaTargets?.[0]?.name
  if (!camera) return ''
  return [camera, props.modelValue.sceneName, props.modelValue.taskTargetName].filter(Boolean).join(' · ')
})
</script>

<style scoped>
.ai-event-trigger-row { display: flex; flex: 1; flex-wrap: wrap; gap: var(--space-2, 8px); align-items: center; min-width: 0; }
.ai-event-trigger-row__summary { min-width: 0; color: var(--ant-color-text-secondary); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ai-event-trigger-row__placeholder { color: var(--ant-color-text-tertiary); font-size: 13px; }
</style>
