<template>
  <a-button block class="alarm-record-query__card" @click="visible = true">
    <span class="alarm-record-query__icon"><AIcon type="AlertOutlined" /></span>
    <span class="alarm-record-query__content">
      <b>{{ $t('IotSceneLinkage.summary.queryAlarmRecords') }}</b>
      <small>{{ summary }}</small>
    </span>
    <AIcon type="RightOutlined" />
  </a-button>

  <AlarmStateConditionModal
    v-if="visible"
    :open="visible"
    :source-kind="draft.sourceKind === 'visual-ai' ? 'visual-ai' : 'iot-device'"
    mode="query"
    :model-value="draft"
    @update:model-value="draft = $event"
    @cancel="visible = false"
    @save="save"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
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
const { t } = useI18n()
// 新增“查询告警状态”后直接进入配置，避免用户还要再点一次中间卡片。
const visible = ref(true)

/**
 * 告警记录查询是详细模式中的执行动作。选择弹窗复用告警状态的资源浏览能力，
 * 但只保存查询范围；是否基于查询结果继续执行由原版动作条件树维护。
 */
const draft = ref<SceneAlarmTriggerConfig>(toAlarmDraft(props.value, props.options))
const summary = computed(() => draft.value.options?.alarmConfigName
  || t('IotSceneLinkage.alarmCondition.selectRule'))

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
  visible.value = false
}

watch(() => [props.value, props.options], ([configuration, options]) => {
  draft.value = toAlarmDraft(configuration as Record<string, any>, options as Record<string, any>)
}, { deep: true })
</script>

<style scoped>
.alarm-record-query__card { display: flex; align-items: center; min-height: 4.125rem; padding: var(--space-3, 12px) var(--space-4, 16px); text-align: left; border-color: var(--ant-color-border-secondary); }
.alarm-record-query__card:hover { border-color: var(--ant-color-primary); }
.alarm-record-query__icon { display: grid; flex: none; place-items: center; width: 2.5rem; height: 2.5rem; margin-right: var(--space-3, 12px); color: var(--ant-color-primary); background: var(--ant-color-primary-bg); border-radius: 50%; }
.alarm-record-query__content { display: grid; flex: 1; gap: 4px; min-width: 0; }.alarm-record-query__content b, .alarm-record-query__content small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.alarm-record-query__content b { color: var(--ant-color-text); }.alarm-record-query__content small { color: var(--ant-color-text-tertiary); font-size: 12px; }
</style>
