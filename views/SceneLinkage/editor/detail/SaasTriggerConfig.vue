<template>
  <section class="saas-trigger-config">
    <header class="saas-trigger-config__header">
      <span class="saas-trigger-config__icon"><AIcon :type="data.triggerType === 'alarm' ? 'AlertOutlined' : 'RadarChartOutlined'" /></span>
      <div><strong>{{ title }}</strong><small>{{ hint }}</small></div>
    </header>
    <AlarmTriggerSourceRow v-if="data.triggerType === 'alarm'" v-model="alarm" />
    <AiEventTriggerRow
      v-else-if="data.triggerType === 'ai-event'"
      :open="aiEventConfigOpen"
      :model-value="aiEvent"
      @confirm="confirmAiEvent"
      @cancel="aiEventConfigOpen = false"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useSceneStore } from '@rule-engine-manager-ui/store/scene'
import type { SceneAiEventTriggerConfig, SceneAlarmTriggerConfig } from '../../utils'
import { AI_EVENT_RESULT_COLUMNS } from '../../utils'
import { findSceneCondition, replaceManagedSceneCondition } from '../../sceneRule'
import AlarmTriggerSourceRow from '../components/AlarmTriggerSourceRow.vue'
import AiEventTriggerRow from '../components/AiEventTriggerRow.vue'
import { useI18n } from 'vue-i18n'

const { data: storeData } = storeToRefs(useSceneStore())
// 原版 Store 类型只声明了早期触发器，详细桥接需要同时承载 SaaS 专用 Provider 配置。
const data = storeData as unknown as Ref<Record<string, any>>
const { t } = useI18n()
const aiEventConfigOpen = ref(false)
const title = computed(() => data.value.triggerType === 'alarm'
  ? t('IotSceneLinkage.detail.alarmTrigger')
  : t('IotSceneLinkage.detail.aiEventTrigger'))
const hint = computed(() => data.value.triggerType === 'alarm'
  ? t('IotSceneLinkage.detail.alarmTriggerHint')
  : t('IotSceneLinkage.detail.aiEventTriggerHint'))

const ensureFirstBranch = () => {
  if (!data.value.branches?.length) data.value.branches = [{ when: [], then: [] }] as any
  return data.value.branches[0]
}

const visualAiAlarmBizId = (configuration: Record<string, any> = {}) => {
  const isVisualAi = configuration.sourceKind === 'visual-ai'
    || configuration.targetType === 'aiTaskMediaTarget'
  return isVisualAi && configuration.options?.sceneId && configuration.options?.taskTarget
    ? `${configuration.options.sceneId}-${configuration.options.taskTarget}`
    : undefined
}

const alarm = computed<SceneAlarmTriggerConfig>({
  get: () => ({
    modes: [],
    ...(data.value.trigger?.configuration || {}),
    sourceKind: data.value.trigger?.configuration?.sourceKind === 'visual-ai'
      || data.value.trigger?.configuration?.targetType === 'aiTaskMediaTarget'
      ? 'visual-ai'
      : 'iot-device',
  }),
  set: value => {
    const branch = ensureFirstBranch()
    const previousBizId = visualAiAlarmBizId(data.value.trigger?.configuration)
    const nextBizId = visualAiAlarmBizId(value)
    data.value.trigger = { type: 'alarm', configuration: { ...value } } as any
    data.value.triggerType = 'alarm'
    // 视觉告警只维护自身生成的 bizId 条件，不能覆盖管理员在详细模式添加的其它条件。
    branch.when = replaceManagedSceneCondition(
      branch.when,
      term => term.column === 'bizId' && term.termType === 'eq' && term.value === previousBizId,
      nextBizId ? { column: 'bizId', termType: 'eq', value: nextBizId } : undefined,
    )
  },
})

/** 详细模式选择视觉事件后立即进入与快速模式相同的资源配置弹窗。 */
function openConfig() {
  if (data.value.triggerType === 'ai-event') aiEventConfigOpen.value = true
}

function confirmAiEvent(value: SceneAiEventTriggerConfig) {
  aiEvent.value = value
  aiEventConfigOpen.value = false
}

const aiEvent = computed<SceneAiEventTriggerConfig>({
  get: () => {
    const configuration = data.value.trigger?.configuration || {}
    const condition = findSceneCondition(data.value.branches?.[0]?.when, term => AI_EVENT_RESULT_COLUMNS.includes(term.column))
    return {
      ...configuration,
      mediaTargets: configuration.mediaTargets || [],
      condition: condition ? { column: condition.column, termType: condition.termType, value: condition.value } : undefined,
    }
  },
  set: value => {
    data.value.trigger = {
      type: 'ai-event',
      configuration: {
        sceneId: value.sceneId,
        taskTarget: value.taskTarget,
        mediaTargets: (value.mediaTargets || []).map(target => ({ deviceId: target.deviceId, channelId: target.channelId })),
      },
    } as any
    data.value.triggerType = 'ai-event'
    const branch = ensureFirstBranch()
    // 识别结果字段只由视觉事件控件维护，其他详细条件必须原样保留。
    branch.when = replaceManagedSceneCondition(
      branch.when,
      term => AI_EVENT_RESULT_COLUMNS.includes(term.column),
      value.condition ? {
        column: value.condition.column,
        termType: value.condition.termType || 'eq',
        value: value.condition.value,
      } : undefined,
    )
  },
})

/** 专用 SaaS 触发器没有原版 FormItem，保存前由父编辑器调用此校验。 */
function validate() {
  const trigger = data.value.trigger as any
  const configuration = trigger?.configuration || {}
  if (data.value.triggerType === 'alarm') {
    const visualAi = configuration.sourceKind === 'visual-ai' || configuration.targetType === 'aiTaskMediaTarget'
    const valid = Boolean(configuration.alarmConfigId && configuration.modes?.length
      && (visualAi
        ? configuration.options?.sceneId && configuration.options?.taskTarget
        : configuration.targetType && configuration.options?.productId))
    return valid ? undefined : 'IotSceneLinkage.message.alarmTriggerRequired'
  }
  if (data.value.triggerType === 'ai-event') {
    const condition = findSceneCondition(data.value.branches?.[0]?.when, term => AI_EVENT_RESULT_COLUMNS.includes(term.column))
    const validCondition = !condition || condition.termType === 'isnull' || (condition.value !== undefined && condition.value !== null && condition.value !== '')
    const valid = Boolean(configuration.sceneId && configuration.taskTarget && validCondition)
    return valid ? undefined : 'IotSceneLinkage.message.aiEventTriggerRequired'
  }
  return undefined
}

defineExpose({ validate, openConfig })
</script>

<style scoped>
.saas-trigger-config { display: grid; gap: var(--space-4, 16px); padding: var(--space-4, 16px); margin-bottom: var(--space-4, 16px); background: var(--ant-color-bg-container); border: 1px solid var(--ant-color-border-secondary); border-radius: var(--radius-jet-sm, 10px); }
.saas-trigger-config__header { display: flex; gap: var(--space-3, 12px); align-items: center; padding-bottom: var(--space-3, 12px); border-bottom: 1px solid var(--ant-color-border-secondary); }.saas-trigger-config__header > div { display: grid; gap: 2px; }.saas-trigger-config__header strong { color: var(--ant-color-text); font-weight: 600; }.saas-trigger-config__header small { color: var(--ant-color-text-tertiary); font-size: 12px; }.saas-trigger-config__icon { display: grid; place-items: center; width: 30px; height: 30px; color: var(--ant-color-primary); background: var(--ant-color-primary-bg); border-radius: 6px; }
</style>
