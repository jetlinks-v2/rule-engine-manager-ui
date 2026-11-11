<template>
  <div class="detailed-scene-rule-summary">
    <div class="detailed-scene-rule-summary__tree">
      <article v-for="line in previewLines" :key="line.key" :class="['detailed-scene-rule-summary__node', `is-${line.kind}`]">
        <span v-if="line.label" :class="['detailed-scene-rule-summary__node-label', `detailed-scene-rule-summary__node-label--${line.kind}`]">
          {{ line.label }}
        </span>
        <span v-else class="detailed-scene-rule-summary__node-label detailed-scene-rule-summary__node-label--continuation" aria-hidden="true">{{ continuationLabel(line.kind) }}</span>
        <span :class="['detailed-scene-rule-summary__node-value', { 'is-empty': line.empty, 'has-parts': line.parts?.length }]">
          <SceneSummaryParts v-if="line.parts?.length" :parts="line.parts" />
          <template v-else>{{ line.value }}</template>
        </span>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, type PropType } from 'vue'
import { useSceneNotifyLabels } from './useSceneNotifyLabels'
import SceneSummaryParts from '../components/SceneSummaryParts.vue'
import { actionNodeSummaryParts } from '../actionNodeSummary'
import { useTimerCalendarTags, hasCalendarTimer } from '../../../Scene/Save/components/Timer/useTimerCalendarTags'
import { detailedTriggerSummaryParts } from '../detailedTriggerSummary'
import { summaryPartsText, type SummaryPart } from '../summaryParts'
import { detailedConditionSummaryParts, detailedDebounceSummaryParts, type PreviewColumns } from './detailedRuleSummaryParts'
import { useI18n } from 'vue-i18n'
import { formatSceneSummaryClauses } from '../../sceneSummary'
import type { SceneProviderInfo } from '../../../../api/scene-linkage'
import type { SceneRuleRecord } from '../editorMode'

type PreviewLineKind = 'when' | 'and' | 'then' | 'otherwise' | 'debounce'
type PreviewPart = SummaryPart
type PreviewLine = { key: string; kind: PreviewLineKind; label?: string; value: string; parts?: PreviewPart[]; empty?: boolean }

const props = defineProps({
  rule: { type: Object as PropType<SceneRuleRecord>, required: true },
  triggerProviders: { type: Array as PropType<SceneProviderInfo[]>, default: () => [] },
  actionProviders: { type: Array as PropType<SceneProviderInfo[]>, default: () => [] },
  termColumns: { type: Object as PropType<PreviewColumns>, default: () => ({}) },
})
const emit = defineEmits<{ change: [value: string]; 'title-change': [value: string] }>()
const { t } = useI18n()
const { tags: calendarTags } = useTimerCalendarTags(() => hasCalendarTimer(props.rule.trigger))
const notifyLabels = useSceneNotifyLabels()

const asRecords = (value: unknown): SceneRuleRecord[] => Array.isArray(value)
  ? value.filter(item => Boolean(item) && typeof item === 'object') as SceneRuleRecord[]
  : []
const asRecord = (value: unknown): SceneRuleRecord => value && typeof value === 'object' && !Array.isArray(value)
  ? value as SceneRuleRecord
  : {}
/** 未注册的历史 Provider 使用可读兜底，不把未命中的国际化 key 展示给用户。 */
const providerName = (provider: string, providers: SceneProviderInfo[], prefix: 'triggerType' | 'action') => {
  const name = providers.find(item => item.provider === provider)?.name
  if (name) return name
  const key = `IotSceneLinkage.${prefix}.${provider}`
  const label = t(key)
  return label === key ? t('IotSceneLinkage.detail.legacyAction') : label
}
const continuationLabel = (kind: PreviewLineKind) => kind === 'and'
  ? t('IotSceneLinkage.rule.and')
  : kind === 'when'
  ? t('IotSceneLinkage.rule.when')
  : kind === 'then'
    ? t('IotSceneLinkage.summary.then')
    : ''

/** 卡片与预览读取同一份只读展示片段，防止资源链或参数值在两处丢失。 */
const formatActionParts = (action: SceneRuleRecord): PreviewPart[] => actionNodeSummaryParts(action, t, { users: notifyLabels.users.value, methods: notifyLabels.methods.value, providerName: providerName(String(action.executor || ''), props.actionProviders, 'action') })
const formatAction = (action: SceneRuleRecord) => summaryPartsText(formatActionParts(action))

/** 并行动作保留本地化前后缀，同时让每个动作继续沿用字段标签样式。 */
function formatParallelActionParts(actions: SceneRuleRecord[]): PreviewPart[] {
  const marker = '__scene_preview_actions__'
  const text = t('IotSceneLinkage.detail.previewParallel', { actions: marker })
  const [prefix, suffix] = text.split(marker)
  if (suffix === undefined) return [{ text }]
  return [
    ...(prefix ? [{ text: prefix }] : []),
    ...actions.flatMap((action, index) => [
      ...(index ? [{ text: '、' }] : []),
      ...formatActionParts(action),
    ]),
    ...(suffix ? [{ text: suffix }] : []),
  ]
}

const previewLines = computed<PreviewLine[]>(() => {
  const ruleOptions = asRecord(props.rule.options)
  // 触发器正文不再猜测首个分支的比较值；分支条件在下方按原生组合完整展示。
  const triggerParts = detailedTriggerSummaryParts(asRecord(props.rule.trigger), asRecord(ruleOptions.trigger), t, String(props.rule.triggerType || ''), {}, props.termColumns, calendarTags.value)
  const triggerText = summaryPartsText(triggerParts).trim()
  const triggerLine: PreviewLine = { key: 'trigger', kind: 'when', label: t('IotSceneLinkage.rule.when'), value: triggerText || t('IotSceneLinkage.rule.previewNoTrigger'), parts: triggerParts, empty: !triggerText }
  const rootParts = detailedConditionSummaryParts(props.rule.terms, t, { columns: props.termColumns })
  const rootLine: PreviewLine | undefined = rootParts.length ? { key: 'root-conditions', kind: 'and', label: t('IotSceneLinkage.rule.and'), value: summaryPartsText(rootParts), parts: rootParts } : undefined
  const lines: PreviewLine[] = [triggerLine, ...(rootLine ? [rootLine] : [])]
  const branches = asRecords(props.rule.branches)
  // 触发条件直接归入“当”，没有过滤条件时不补一条空“且”；空动作仍接在条件之后。
  if (!branches.length) lines.push({ key: 'then-empty', kind: 'then', label: t('IotSceneLinkage.summary.then'), value: t('IotSceneLinkage.rule.previewNoAction'), empty: true })

  branches.forEach((branch, branchIndex) => {
    const conditionParts = detailedConditionSummaryParts(branch.when, t, { columns: props.termColumns, options: asRecords(ruleOptions.when)[branchIndex] })
    const isOtherwise = branchIndex > 0 && Boolean(branch.executeAnyway)
    // 普通分支独立判断，重复“当”以免把下一分支的条件误读为上一分支的追加门槛。
    if (branchIndex > 0 && !isOtherwise) {
      lines.push({ ...triggerLine, key: `trigger-${branchIndex}` })
      if (rootLine) lines.push({ ...rootLine, key: `root-conditions-${branchIndex}` })
    }
    if (isOtherwise) {
      // 否则分支先说明触发语义，再单独列出要执行的动作，避免误读为普通“就”分支。
      lines.push({
        key: `otherwise-${branchIndex}`,
        kind: 'otherwise',
        label: t('IotSceneLinkage.detail.previewOtherwise'),
        value: t('IotSceneLinkage.detail.previewOtherwiseDescription'),
      })
    }
    if (conditionParts.length) lines.push({
      key: `when-${branchIndex}`,
      kind: 'and',
      label: t('IotSceneLinkage.rule.and'),
      value: summaryPartsText(conditionParts),
      parts: conditionParts,
    })

    const actionGroups = asRecords(branch.then).filter(group => asRecords(group.actions).length)
    const hasBranchAction = actionGroups.some(group => asRecords(group.actions).length)
    if (!hasBranchAction) lines.push({
      key: `then-empty-${branchIndex}`,
      kind: 'then',
      label: t('IotSceneLinkage.summary.then'),
      value: t('IotSceneLinkage.rule.previewNoAction'),
      empty: true,
    })

    actionGroups.forEach((group, groupIndex) => {
      const groupActions = asRecords(group.actions)
      const actions = groupActions.map(formatAction).filter(Boolean)
      const kind: PreviewLineKind = 'then'
      const label = groupIndex ? undefined : t('IotSceneLinkage.summary.then')
      if (group.parallel) {
        const parts = actions.length ? formatParallelActionParts(groupActions) : []
        lines.push({ key: `parallel-${branchIndex}-${groupIndex}`, kind, label, value: actions.length ? t('IotSceneLinkage.detail.previewParallel', { actions: actions.join('、') }) : t('IotSceneLinkage.detail.noActionBranch'), parts, empty: !actions.length })
      } else {
        groupActions.forEach((action, index) => {
          const parts = formatActionParts(action)
          lines.push({ key: `then-${branchIndex}-${groupIndex}-${index}`, kind, label: index ? undefined : label, value: summaryPartsText(parts), parts })
          // 动作间的继续执行门槛只留在配置区，核心规则预览不展开 action.terms。
        })
      }
    })
    const debounceParts = detailedDebounceSummaryParts(branch.shakeLimit, t)
    if (debounceParts.length) lines.push({ key: `debounce-${branchIndex}`, kind: 'debounce', label: t('IotSceneLinkage.debounce.enable'), value: summaryPartsText(debounceParts), parts: debounceParts })
  })
  return lines
})

const summary = computed(() => formatSceneSummaryClauses(previewLines.value))
watch(summary, value => emit('change', value), { immediate: true })
watch(summary, value => emit('title-change', value), { immediate: true })
</script>

<style scoped>
.detailed-scene-rule-summary { display: grid; min-width: 0; }
.detailed-scene-rule-summary__tree { display: grid; gap: var(--space-2, 8px); min-width: 0; }
.detailed-scene-rule-summary__node { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: var(--space-2, 8px); align-items: start; min-width: 0; line-height: 28px; }
.detailed-scene-rule-summary__node-label { display: inline-flex; min-height: 28px; padding: 0 8px; border-radius: 4px; font-weight: 600; }.detailed-scene-rule-summary__node-label--when { color: #d46b08; background: #fff1d6; }.detailed-scene-rule-summary__node-label--and { color: #087443; background: #e8f7ef; }.detailed-scene-rule-summary__node-label--then { color: var(--ant-color-primary); background: #e6f0ff; }.detailed-scene-rule-summary__node-label--otherwise { color: #6c4fe0; background: #efebff; }.detailed-scene-rule-summary__node-label--debounce { color: #9d4f00; background: #fff7e6; }.detailed-scene-rule-summary__node-label--continuation { visibility: hidden; background: transparent; }
.detailed-scene-rule-summary__node-value { min-width: 0; overflow-wrap: anywhere; color: var(--ant-color-text); }.detailed-scene-rule-summary__node-value.is-empty { color: #86909c; }
</style>
