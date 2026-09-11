<template>
  <div class="visual-ai-alarm-selector">
    <a-select
      class="visual-ai-alarm-selector__scene"
      popup-class-name="scene-editor__resource-dropdown"
      :dropdown-match-select-width="false"
      :value="modelValue.options?.sceneId"
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
      class="visual-ai-alarm-selector__target"
      popup-class-name="scene-editor__resource-dropdown"
      :dropdown-match-select-width="false"
      :value="modelValue.options?.taskTarget"
      :disabled="!modelValue.options?.sceneId"
      :options="visibleTargetOptions"
      :placeholder="$t('IotSceneLinkage.placeholder.aiTarget')"
      show-search
      @change="changeTarget"
    >
      <template #option="option"><AiEventResourceOption :option="optionValue(option)" /></template>
    </a-select>
    <span class="visual-ai-alarm-selector__word">{{ $t('IotSceneLinkage.alarmPhrase.ofAlarm') }}</span>
    <a-select
      class="visual-ai-alarm-selector__task"
      popup-class-name="scene-editor__resource-dropdown"
      :dropdown-match-select-width="false"
      :value="modelValue.alarmConfigId"
      :disabled="!modelValue.options?.taskTarget"
      :loading="loadingAggregateTasks"
      :options="visibleAggregateTaskOptions"
      :placeholder="$t('IotSceneLinkage.placeholder.aiAlarmTask')"
      show-search
      @dropdown-visible-change="open => open && loadAggregateTasks(modelValue.options?.sceneId, modelValue.options?.taskTarget)"
      @change="changeAggregateTask"
    >
      <template #option="option"><AiEventResourceOption :option="optionValue(option)" /></template>
    </a-select>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import AiEventResourceOption, { type AiEventResourceOption as AiEventResourceOptionType } from './AiEventResourceOption.vue'
import type { SceneAlarmTriggerConfig } from '../../utils'
import { useAiEventResources } from '../useAiEventResources'
import { createAiAggregateTaskResourceOption, createAiSceneResourceOption, createAiTaskTargetResourceOption } from '../aiEventResourceOptions'
import { useAlarmLevel } from '../../../../hook/useAlarmLevel'

const props = defineProps({
  modelValue: { type: Object as PropType<SceneAlarmTriggerConfig>, required: true },
})
const emit = defineEmits<{
  (event: 'update:modelValue', value: SceneAlarmTriggerConfig): void
}>()

const { t } = useI18n()
const { scenes, aggregateTasks, loadingScenes, loadingAggregateTasks, taskTargets, loadScenes, searchScenes, hasMoreScenes, loadSelectedScene, loadAggregateTasks } = useAiEventResources('alarm')
const { levelMap } = useAlarmLevel()
const sceneOptions = computed<AiEventResourceOptionType[]>(() => scenes.value
  .map(scene => createAiSceneResourceOption(scene, t)))
const visibleSceneOptions = computed(() => appendSelectedOption(
  sceneOptions.value,
  props.modelValue.options?.sceneId,
  props.modelValue.options?.sceneName,
  '',
  'scene',
))
const targetOptions = computed(() => taskTargets.value(props.modelValue.options?.sceneId)
  .map(createAiTaskTargetResourceOption))
const visibleTargetOptions = computed(() => appendSelectedOption(
  targetOptions.value,
  props.modelValue.options?.taskTarget,
  props.modelValue.options?.taskTargetName,
  '',
  'AimOutlined',
))
const aggregateTaskOptions = computed<AiEventResourceOptionType[]>(() => aggregateTasks.value
  .map(task => createAiAggregateTaskResourceOption(task, levelMap.value as Record<string, string>, t)))
const visibleAggregateTaskOptions = computed(() => appendSelectedOption(
  aggregateTaskOptions.value,
  props.modelValue.alarmConfigId,
  props.modelValue.options?.alarmConfigName,
  '',
  'DeploymentUnitOutlined',
))

function changeScene(value: unknown) {
  if (typeof value !== 'string') return
  const scene = scenes.value.find(item => item.id === value)
  emit('update:modelValue', {
    sourceKind: 'visual-ai',
    targetType: 'aiTaskMediaTarget',
    modes: props.modelValue.modes,
    state: props.modelValue.state,
    options: { sceneId: value, sceneName: scene?.name || value },
  })
}

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

function handleScenePopupScroll(event: Event) {
  const target = event.target as HTMLElement
  if (hasMoreScenes.value && target.scrollTop + target.clientHeight >= target.scrollHeight - 24) {
    void loadScenes()
  }
}

function changeTarget(value: unknown) {
  if (typeof value !== 'string') return
  const target = taskTargets.value(props.modelValue.options?.sceneId).find(item => item.value === value)
  emit('update:modelValue', {
    sourceKind: 'visual-ai',
    targetType: 'aiTaskMediaTarget',
    modes: props.modelValue.modes,
    state: props.modelValue.state,
    options: {
      sceneId: props.modelValue.options?.sceneId,
      sceneName: props.modelValue.options?.sceneName,
      taskTarget: value,
      taskTargetName: target?.text || value,
    },
  })
}

function changeAggregateTask(value: unknown) {
  if (typeof value !== 'string') return
  const task = aggregateTasks.value.find(item => item.id === value)
  emit('update:modelValue', {
    ...props.modelValue,
    sourceKind: 'visual-ai',
    targetType: 'aiTaskMediaTarget',
    alarmConfigId: value,
    options: { ...props.modelValue.options, alarmConfigName: task?.name || value },
  })
}

watch(
  () => [props.modelValue.options?.sceneId, props.modelValue.options?.taskTarget] as const,
  async ([sceneId, taskTarget]) => {
    await loadSelectedScene(sceneId)
    if (!sceneId) return
    await loadScenes()
    if (taskTarget) await loadAggregateTasks(sceneId, taskTarget)
  },
  { immediate: true },
)
</script>

<style scoped>
.visual-ai-alarm-selector { display: flex; flex: 1 1 auto; flex-wrap: wrap; gap: var(--space-2, 8px); align-items: center; min-width: 0; }
.visual-ai-alarm-selector__scene, .visual-ai-alarm-selector__target, .visual-ai-alarm-selector__task {
	flex: 0 0 var(--scene-linkage-resource-select-width, 18rem);
	width: var(--scene-linkage-resource-select-width, 18rem);
	min-width: var(--scene-linkage-resource-select-width, 18rem);
	max-width: var(--scene-linkage-resource-select-width, 18rem);
}
.visual-ai-alarm-selector__word { flex: none; white-space: nowrap; }
</style>
