<template>
  <div class="ai-event-trigger-row">
    <a-select
      class="ai-event-trigger-row__select"
      :value="modelValue.sceneId"
      :loading="loadingScenes"
      :options="visibleSceneOptions"
      :placeholder="$t('IotSceneLinkage.placeholder.aiScene')"
      show-search
      :filter-option="false"
      @dropdown-visible-change="open => open && loadScenes()"
      @search="searchScenes"
      @popup-scroll="handleScenePopupScroll"
      @change="changeScene"
    >
      <template #option="option"><AiEventResourceOption :option="optionValue(option)" /></template>
    </a-select>
    <a-select
      class="ai-event-trigger-row__select"
      :value="modelValue.taskTarget"
      :options="visibleTargetOptions"
      :disabled="!modelValue.sceneId"
      :placeholder="$t('IotSceneLinkage.placeholder.aiTarget')"
      show-search
      @change="changeTarget"
    >
      <template #option="option"><AiEventResourceOption :option="optionValue(option)" /></template>
    </a-select>
    <span class="ai-event-trigger-row__word">{{ $t('IotSceneLinkage.aiEvent.phrase.at') }}</span>
    <AiEventMediaTargetSelector
      :model-value="modelValue.mediaTargets || []"
      :disabled="!modelValue.taskTarget"
      @update:model-value="changeMedia"
    />
    <a-tag v-if="hasUnavailableMedia" color="warning">{{ $t('IotSceneLinkage.aiEvent.resourceUnavailable') }}</a-tag>
    <span class="ai-event-trigger-row__word">{{ $t(modelValue.condition
      ? 'IotSceneLinkage.aiEvent.phrase.resultMatches'
      : 'IotSceneLinkage.aiEvent.phrase.resultProduced') }}</span>
    <a-select
      class="ai-event-trigger-row__condition-column"
      :value="modelValue.condition?.column"
      :options="conditionOptions"
      :disabled="!modelValue.taskTarget"
      :placeholder="$t(modelValue.condition
        ? 'IotSceneLinkage.placeholder.aiResultField'
        : 'IotSceneLinkage.placeholder.aiResultConditionOptional')"
      allow-clear
      @change="changeConditionColumn"
      @clear="clearCondition"
    />
    <a-select
      v-if="modelValue.condition"
      class="ai-event-trigger-row__condition-type"
      :value="displayTermType"
      :options="conditionTermTypes"
      @change="changeConditionType"
    />
    <a-select
      v-if="modelValue.condition && conditionValueOptions.length && requiresConditionValue"
      class="ai-event-trigger-row__condition-value"
      :value="displayConditionValue as number"
      :options="conditionValueOptions"
      :placeholder="$t('IotSceneLinkage.placeholder.aiResultValue')"
      @update:value="changeConditionValue"
    />
    <a-input-number
      v-else-if="modelValue.condition && isNumberCondition && requiresConditionValue"
      class="ai-event-trigger-row__condition-value"
      :value="modelValue.condition.value as number"
      :min="modelValue.condition.column === 'maxTargetScore' ? 0 : undefined"
      :max="modelValue.condition.column === 'maxTargetScore' ? 100 : undefined"
      :addon-after="modelValue.condition.column === 'maxTargetScore' ? '%' : undefined"
      :placeholder="$t('IotSceneLinkage.placeholder.aiResultValue')"
      @update:value="changeConditionValue"
    />
    <a-input
      v-else-if="modelValue.condition && requiresConditionValue"
      class="ai-event-trigger-row__condition-value"
      :value="modelValue.condition.value"
      :placeholder="$t('IotSceneLinkage.placeholder.aiResultValue')"
      @change="changeConditionValue"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, toRef, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { AI_EVENT_RESULT_COLUMNS, type AiEventResultColumn, type SceneAiEventTriggerConfig } from '../../utils'
import { useAiEventResources } from '../useAiEventResources'
import { useAiEventTermColumns } from '../useAiEventTermColumns'
import { createAiSceneResourceOption, createAiTaskTargetResourceOption } from '../aiEventResourceOptions'
import AiEventMediaTargetSelector from './AiEventMediaTargetSelector.vue'
import AiEventResourceOption, { type AiEventResourceOption as AiEventResourceOptionType } from './AiEventResourceOption.vue'

const props = defineProps({
  modelValue: { type: Object as PropType<SceneAiEventTriggerConfig>, required: true },
})
const emit = defineEmits<{
  (event: 'update:modelValue', value: SceneAiEventTriggerConfig): void
}>()

const { t } = useI18n()
const { scenes, loadingScenes, taskTargets, loadScenes, searchScenes, hasMoreScenes, loadSelectedScene } = useAiEventResources()
const termColumns = useAiEventTermColumns(toRef(props, 'modelValue'))
// 编辑页的资源选项异步加载；资源删除或权限收回时仍保留保存时的名称，避免回显退化为 ID。
const sceneOptions = computed<AiEventResourceOptionType[]>(() => scenes.value
  .map(scene => createAiSceneResourceOption(scene, t)))
const visibleSceneOptions = computed(() => appendSelectedOption(
  sceneOptions.value,
  props.modelValue.sceneId,
  props.modelValue.sceneName || props.modelValue.sceneId,
  '',
  'scene',
))
const targetOptions = computed(() => taskTargets.value(props.modelValue.sceneId)
  .map(createAiTaskTargetResourceOption))
const visibleTargetOptions = computed(() => appendSelectedOption(
  targetOptions.value,
  props.modelValue.taskTarget,
  props.modelValue.taskTargetName || props.modelValue.taskTarget,
  '',
  'AimOutlined',
))
const conditionOptions = computed(() => termColumns.value
  .filter(column => AI_EVENT_RESULT_COLUMNS.includes(column.column as AiEventResultColumn))
  .map(column => ({
  value: column.column,
  label: t(`IotSceneLinkage.aiEvent.condition.${column.column}`),
})))
// 条件字段由 Provider 返回；本期每个已确认字段的可选运算符按场景联动的简化交互固定，
// 不把 Provider 的完整通用运算符集合直接暴露给用户。
const conditionTermTypes = computed(() => supportedTermTypes(props.modelValue.condition?.column)
  .map(termType => ({ value: termType, label: t(`IotSceneLinkage.term.${termType}`) })))
const conditionValueOptions = computed(() => {
  if (props.modelValue.condition?.column === 'hitResults') {
    return [
      { value: 1, label: t('IotSceneLinkage.aiEvent.conditionValue.hit') },
      { value: 0, label: t('IotSceneLinkage.aiEvent.conditionValue.miss') },
      { value: '__noDecision__', label: t('IotSceneLinkage.aiEvent.conditionValue.noDecision') },
    ]
  }
  return []
})
const displayTermType = computed(() => props.modelValue.condition?.column === 'hitResults'
  ? 'eq'
  : props.modelValue.condition?.termType || 'eq')
const displayConditionValue = computed(() => props.modelValue.condition?.column === 'hitResults'
  && props.modelValue.condition.termType === 'isnull'
  ? '__noDecision__'
  : props.modelValue.condition?.value)
const requiresConditionValue = computed(() => props.modelValue.condition?.termType !== 'isnull')
const isNumberCondition = computed(() => ['maxTargetScore', 'targetCount', 'numberResults'].includes(props.modelValue.condition?.column || ''))
const hasUnavailableMedia = computed(() => props.modelValue.mediaTargets?.some(target => target.unavailable))

function optionValue(option: any): AiEventResourceOptionType {
  return option?.data?.value ? option.data : option
}

function appendSelectedOption(
  options: AiEventResourceOptionType[],
  value?: string,
  label?: string,
  description = '',
  icon = 'AppstoreOutlined',
) {
  if (!value || options.some(option => option.value === value)) return options
  return [{ value, label: label || value, description, icon }, ...options]
}

watch(
  () => props.modelValue.sceneId,
  sceneId => {
    void loadSelectedScene(sceneId)
    if (sceneId) void loadScenes()
  },
  { immediate: true },
)

function changeScene(sceneId?: string) {
  const scene = scenes.value.find(item => item.id === sceneId)
  emit('update:modelValue', {
    ...props.modelValue,
    sceneId,
    sceneName: scene?.name || sceneId,
    taskTarget: undefined,
    taskTargetName: undefined,
    mediaTargets: [],
    condition: undefined,
  })
}

function changeTarget(taskTarget?: string) {
  const target = taskTargets.value(props.modelValue.sceneId).find(item => item.value === taskTarget)
  const next = {
    ...props.modelValue,
    taskTarget,
    taskTargetName: target?.text || taskTarget,
    mediaTargets: [],
    condition: undefined,
  }
  emit('update:modelValue', next)
}

function changeMedia(mediaTargets: NonNullable<SceneAiEventTriggerConfig['mediaTargets']>) {
  emit('update:modelValue', {
    ...props.modelValue,
    mediaTargets,
  })
}

function changeConditionColumn(column?: AiEventResultColumn) {
  if (!column) {
    clearCondition()
    return
  }
  emit('update:modelValue', {
    ...props.modelValue,
    condition: { column, termType: supportedTermTypes(column)[0], value: defaultConditionValue(column) },
  })
}

function clearCondition() {
  emit('update:modelValue', { ...props.modelValue, condition: undefined })
}

function changeConditionType(termType: string) {
  if (!props.modelValue.condition) return
  emit('update:modelValue', {
    ...props.modelValue,
    condition: {
      ...props.modelValue.condition,
      termType,
      value: termType === 'isnull' ? undefined : defaultConditionValue(props.modelValue.condition.column),
    },
  })
}

function changeConditionValue(value: unknown) {
  if (!props.modelValue.condition) return
  const nextValue = value instanceof Event
    ? (value.target as HTMLInputElement).value
    : value ?? undefined
  const isNoDecision = props.modelValue.condition.column === 'hitResults' && nextValue === '__noDecision__'
  emit('update:modelValue', {
    ...props.modelValue,
    condition: {
      ...props.modelValue.condition,
      termType: isNoDecision
        ? 'isnull'
        : props.modelValue.condition.column === 'hitResults'
          ? 'eq'
          : props.modelValue.condition.termType,
      value: isNoDecision ? undefined : nextValue as string | number | boolean | undefined,
    },
  })
}

function handleScenePopupScroll(event: Event) {
  const target = event.target as HTMLElement
  if (hasMoreScenes.value && target.scrollTop + target.clientHeight >= target.scrollHeight - 24) {
    void loadScenes()
  }
}

function defaultConditionValue(column: AiEventResultColumn) {
  return column === 'hitResults' ? 1 : undefined
}

function supportedTermTypes(column?: AiEventResultColumn) {
  if (column === 'hitResults') return ['eq']
  if (column === 'results') return ['eq', 'like', 'isnull']
  return ['eq', 'gt', 'gte', 'lt', 'lte', 'isnull']
}
</script>

<style scoped>
.ai-event-trigger-row { display: flex; flex: 1; flex-wrap: wrap; gap: var(--space-2, 8px); align-items: center; min-width: 0; }
.ai-event-trigger-row__select { flex: 0 1 13rem; min-width: 10rem; max-width: 13rem; }
.ai-event-trigger-row__media { flex: 0 0 15rem; min-width: 12rem; }
.ai-event-trigger-row__condition-column { flex: 0 1 11rem; min-width: 9rem; }
.ai-event-trigger-row__condition-type { flex: 0 0 6.5rem; }
.ai-event-trigger-row__condition-value { flex: 0 1 9rem; min-width: 7rem; }
.ai-event-trigger-row__word { flex: none; white-space: nowrap; }
</style>
