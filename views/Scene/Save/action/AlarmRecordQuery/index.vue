<template>
  <AlarmStateConditionModal
    open
    :source-kind="draft.sourceKind === 'visual-ai' ? 'visual-ai' : 'iot-device'"
    mode="query"
    :model-value="draft"
    @update:model-value="draft = $event"
    @cancel="$emit('cancel')"
    @save="save"
  />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import AlarmStateConditionModal from '../../../../SceneLinkage/editor/components/AlarmStateConditionModal.vue'
import type { SceneAlarmTriggerConfig } from '../../../../SceneLinkage/utils'

const props = defineProps({
  value: { type: Object, default: () => ({}) },
  options: { type: Object, default: () => ({}) },
})
const emit = defineEmits<{
  (event: 'cancel'): void
  (event: 'save', configuration: Record<string, unknown>, options: Record<string, unknown>): void
}>()

/**
 * 告警记录查询是详细模式中的执行动作。选择弹窗复用告警状态的资源浏览能力，
 * 但只保存查询范围；是否基于查询结果继续执行由原版动作条件树维护。
 */
const draft = ref<SceneAlarmTriggerConfig>(toAlarmDraft(props.value, props.options))

function toAlarmDraft(configuration: Record<string, any>, options: Record<string, any>): SceneAlarmTriggerConfig {
  const visualAi = configuration?.targetType === 'aiTaskMediaTarget'
  return {
    sourceKind: visualAi ? 'visual-ai' : 'iot-device',
    alarmConfigId: configuration?.alarmConfigId,
    targetType: configuration?.targetType || (visualAi ? 'aiTaskMediaTarget' : 'device'),
    modes: [],
    state: configuration?.state || 'warning',
    options: {
      productId: configuration?.productId || options?.productId,
      deviceId: configuration?.deviceId || options?.deviceId,
      alarmConfigName: options?.name || options?.alarmConfigName,
      sceneId: options?.sceneId,
      sceneName: options?.sceneName,
      taskTarget: options?.taskTarget,
      taskTargetName: options?.taskTargetName,
    },
  }
}

function save() {
  const value = draft.value
  const visualAi = value.sourceKind === 'visual-ai' || value.targetType === 'aiTaskMediaTarget'
  const configuration = {
    alarmConfigId: value.alarmConfigId,
    targetType: visualAi ? 'aiTaskMediaTarget' : 'device',
    ...(visualAi ? {} : {
      productId: value.options?.productId,
      deviceId: value.options?.deviceId,
    }),
  }
  const options = {
    name: value.options?.alarmConfigName,
    ...(visualAi ? {
      sceneId: value.options?.sceneId,
      sceneName: value.options?.sceneName,
      taskTarget: value.options?.taskTarget,
      taskTargetName: value.options?.taskTargetName,
    } : {
      productId: value.options?.productId,
      deviceId: value.options?.deviceId,
    }),
  }
  emit('save', configuration, options)
}

watch(() => [props.value, props.options], ([configuration, options]) => {
  draft.value = toAlarmDraft(configuration as Record<string, any>, options as Record<string, any>)
}, { deep: true })
</script>
