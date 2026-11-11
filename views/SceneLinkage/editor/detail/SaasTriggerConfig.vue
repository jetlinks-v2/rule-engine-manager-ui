<template>
  <DetailedTriggerNode :rule="data" @edit="openConfig" @remove="emit('remove')" />
  <AlarmStateConditionModal
    v-if="data.triggerType === 'alarm'"
    :open="alarmConfigOpen"
    :source-kind="alarmDraft.sourceKind === 'visual-ai' ? 'visual-ai' : 'iot-device'"
    mode="trigger"
    v-model="alarmDraft"
    @cancel="cancelConfig"
    @save="saveAlarm"
  />
  <AiEventTriggerRow v-if="data.triggerType === 'ai-event'" :open="aiEventConfigOpen" :model-value="aiEvent" @confirm="confirmAiEvent" @cancel="cancelConfig" />
</template>

<script setup lang="ts">
import { computed, ref, type Ref } from 'vue'
import { cloneDeep } from 'lodash-es'
import { onlyMessage } from '@jetlinks-web-core/utils/comm'
import DetailedTriggerNode from './DetailedTriggerNode.vue'
import { storeToRefs } from 'pinia'
import { useSceneStore } from '@rule-engine-manager-ui/store/scene'
import type { SceneAiEventTriggerConfig, SceneAlarmTriggerConfig } from '../../utils'
import { AI_EVENT_RESULT_COLUMNS } from '../../utils'
import { findSceneCondition, replaceManagedSceneCondition } from '../../sceneRule'
import AlarmStateConditionModal from '../components/AlarmStateConditionModal.vue'
import AiEventTriggerRow from '../components/AiEventTriggerRow.vue'
import { useI18n } from 'vue-i18n'

const { data: storeData } = storeToRefs(useSceneStore())
// 原版 Store 类型只声明了早期触发器，详细桥接需要同时承载 SaaS 专用 Provider 配置。
const data = storeData as unknown as Ref<Record<string, any>>
const { t } = useI18n()
const aiEventConfigOpen = ref(false)
const alarmConfigOpen = ref(false)
const alarmDraft = ref<SceneAlarmTriggerConfig>({ modes: [] })
const emit = defineEmits<{ remove: []; 'cancel-config': []; 'save-config': [] }>()


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
  else if (data.value.triggerType === 'alarm') { alarmDraft.value = cloneDeep(alarm.value); alarmConfigOpen.value = true }
}

function confirmAiEvent(value: SceneAiEventTriggerConfig) {
  aiEvent.value = value
  aiEventConfigOpen.value = false
  emit('save-config')
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
function validate(configuration: Record<string, any> = data.value.trigger?.configuration || {}) {
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

/** 卡片编辑只在确认后提交告警配置，仍由原有 setter 维护关联条件。 */
function saveAlarm() {
  const message = validate(alarmDraft.value)
  if (message) { onlyMessage(t(message), 'warning'); return }
  alarm.value = cloneDeep(alarmDraft.value)
  alarmConfigOpen.value = false
  emit('save-config')
}

/** 取消新建由父级撤销占位，已有触发器仅关闭弹窗。 */
function cancelConfig() {
  alarmConfigOpen.value = false
  aiEventConfigOpen.value = false
  emit('cancel-config')
}

defineExpose({ validate, openConfig })
</script>
