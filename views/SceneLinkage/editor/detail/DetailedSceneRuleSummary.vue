<template>
  <span v-if="summary" class="detailed-scene-rule-summary" :title="summaryTitle">{{ summary }}</span>
</template>

<script setup lang="ts">
import { computed, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SceneProviderInfo } from '../../../../api/scene-linkage'
import type { SceneRuleRecord } from '../editorMode'

const props = defineProps({
  rule: {
    type: Object as PropType<SceneRuleRecord>,
    required: true,
  },
  triggerProviders: {
    type: Array as PropType<SceneProviderInfo[]>,
    default: () => [],
  },
  actionProviders: {
    type: Array as PropType<SceneProviderInfo[]>,
    default: () => [],
  },
})

const emit = defineEmits<{
  change: [value: string]
  'title-change': [value: string]
}>()

const { t } = useI18n()

const asRecords = (value: unknown): SceneRuleRecord[] => Array.isArray(value)
  ? value.filter(item => Boolean(item) && typeof item === 'object')
  : []

const triggerName = computed(() => {
  const provider = String(props.rule.trigger?.type || props.rule.triggerType || '')
  if (!provider) return ''
  return props.triggerProviders.find(item => item.provider === provider)?.name
    || t(`IotSceneLinkage.triggerType.${provider}`)
})

const actionNames = computed(() => asRecords(props.rule.branches)
  .flatMap(branch => asRecords(branch.then))
  .flatMap(group => asRecords(group.actions))
  .map(action => {
    if (action.executor === 'alarm') return t('IotSceneLinkage.summary.legacyAlarmAction')
    const provider = String(action.executor || '')
    return props.actionProviders.find(item => item.provider === provider)?.name
      || t(`IotSceneLinkage.action.${provider}`)
  })
  .filter(Boolean))

const countConditions = (conditions: unknown): number => asRecords(conditions)
  .reduce((count, condition) => count + (Array.isArray(condition.terms)
    ? countConditions(condition.terms)
    : 1), 0)

const conditionCount = computed(() => asRecords(props.rule.branches)
  .reduce((count, branch) => count + countConditions(branch.when), 0))

const summary = computed(() => {
  if (!triggerName.value) return ''
  const conditions = conditionCount.value
    ? `${t('IotSceneLinkage.rule.and')} ${t('IotSceneLinkage.summary.detailConditionCount', { count: conditionCount.value })}`
    : ''
  const actions = actionNames.value.length
    ? `${t('IotSceneLinkage.summary.then')} ${actionNames.value.join('、')}`
    : t('IotSceneLinkage.summary.detailConfigured')
  return `${t('IotSceneLinkage.rule.when')} ${triggerName.value}${conditions}，${actions}`
})

const summaryTitle = computed(() => summary.value)

watch(summary, value => emit('change', value), { immediate: true })
watch(summaryTitle, value => emit('title-change', value), { immediate: true })
</script>

<style scoped>
.detailed-scene-rule-summary {
  display: inline-block;
  max-width: 720px;
  overflow: hidden;
  color: var(--ant-color-text-secondary);
  line-height: 22px;
  text-overflow: ellipsis;
  vertical-align: middle;
  white-space: nowrap;
}
</style>
