<template>
  <div class="detailed-scene-rule-summary">
    <div class="detailed-scene-rule-summary__tree">
      <article v-for="line in previewLines" :key="line.key" :class="['detailed-scene-rule-summary__node', `is-${line.kind}`]">
        <span v-if="line.label" :class="['detailed-scene-rule-summary__node-label', `detailed-scene-rule-summary__node-label--${line.kind}`]">
          {{ line.label }}
        </span>
        <span v-else class="detailed-scene-rule-summary__node-label detailed-scene-rule-summary__node-label--continuation" aria-hidden="true">{{ continuationLabel(line.kind) }}</span>
        <span :class="['detailed-scene-rule-summary__node-value', { 'is-empty': line.empty, 'has-parts': line.parts?.length }]">
          <template v-if="line.parts?.length">
            <span v-for="(part, partIndex) in line.parts" :key="partIndex" :class="['detailed-scene-rule-summary__part', { 'is-field': part.field }]">{{ part.text }}</span>
          </template>
          <template v-else>{{ line.value }}</template>
        </span>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SceneProviderInfo } from '../../../../api/scene-linkage'
import type { SceneRuleRecord } from '../editorMode'

type PreviewLineKind = 'trigger' | 'when' | 'then' | 'otherwise' | 'debounce'
type PreviewPart = { text: string; field?: boolean }
type PreviewLine = { key: string; kind: PreviewLineKind; label?: string; value: string; parts?: PreviewPart[]; empty?: boolean }

const props = defineProps({
  rule: { type: Object as PropType<SceneRuleRecord>, required: true },
  triggerProviders: { type: Array as PropType<SceneProviderInfo[]>, default: () => [] },
  actionProviders: { type: Array as PropType<SceneProviderInfo[]>, default: () => [] },
  termColumns: { type: Object as PropType<Record<string, string>>, default: () => ({}) },
})
const emit = defineEmits<{ change: [value: string]; 'title-change': [value: string] }>()
const { t } = useI18n()

const asRecords = (value: unknown): SceneRuleRecord[] => Array.isArray(value)
  ? value.filter(item => Boolean(item) && typeof item === 'object') as SceneRuleRecord[]
  : []
const asRecord = (value: unknown): SceneRuleRecord => value && typeof value === 'object' && !Array.isArray(value)
  ? value as SceneRuleRecord
  : {}
const displayList = (value: unknown): string => Array.isArray(value)
  ? value.map(displayList).filter(Boolean).join('、')
  : value === undefined || value === null || value === '' ? '' : String(value)
// Provider 配置会在选择触发器后逐步补齐；预览必须能先展示未配置状态，不能因可选 options 尚不存在而中断编辑器渲染。
const optionText = (options: SceneRuleRecord | undefined, ...keys: string[]) => keys.map(key => displayList(options?.[key])).find(Boolean) || ''
const providerName = (provider: string, providers: SceneProviderInfo[], prefix: 'triggerType' | 'action') => providers.find(item => item.provider === provider)?.name
  || t(`IotSceneLinkage.${prefix}.${provider}`)
const continuationLabel = (kind: PreviewLineKind) => kind === 'when'
  ? t('IotSceneLinkage.rule.when')
  : kind === 'then'
    ? t('IotSceneLinkage.summary.then')
    : ''

function formatTerm(term: SceneRuleRecord) {
  const options = asRecord(term.options)
  const column = optionText(options, 'fullName', 'name', 'label') || props.termColumns[String(term.column || '')] || String(term.column || '')
  if (!column) return ''
  const termType = String(term.termType || 'eq')
  const operator = t(`IotSceneLinkage.term.${termType}`)
  if (['isnull', 'notnull'].includes(termType)) return `${column} ${operator}`
  const rawValue = asRecord(term.value)
  const value = rawValue.source === 'metric'
    ? optionText(asRecord(rawValue.metric), 'name', 'label', 'value')
    : displayList(Object.keys(rawValue).length ? rawValue.value : term.value)
  return [column, operator, value].filter(Boolean).join(' ')
}

function formatConditions(conditions: unknown) {
  return asRecords(conditions).map(group => {
    if (group.column) return formatTerm(group)
    const terms = asRecords(group.terms).map(formatTerm).filter(Boolean)
    return terms.reduce((text, value, index) => index
      ? `${text} ${group.type === 'or' || asRecords(group.terms)[index]?.type === 'or' ? t('IotSceneLinkage.rule.or') : t('IotSceneLinkage.rule.and')} ${value}`
      : value, '')
  }).filter(Boolean)
}

/** 动作串行门槛逐条展开为“当”，让多个条件的作用位置比压缩成一整句更清楚。 */
function formatConditionLines(conditions: unknown): string[] {
  return asRecords(conditions).flatMap(condition => condition.column
    ? [formatTerm(condition)]
    : formatConditionLines(condition.terms)).filter(Boolean)
}

function formatTrigger(trigger: SceneRuleRecord, options: SceneRuleRecord, fallback = ''): string {
  const type = String(trigger.type || fallback || '')
  if (!type) return ''
  if (type === 'multi') {
    return asRecords(asRecord(trigger.multi).triggers)
      .map(item => formatTrigger(asRecord(item.trigger), asRecord(item.options), String(item.trigger?.type || '')))
      .filter(Boolean)
      .join(` ${t('IotSceneLinkage.rule.or')} `)
  }
  if (type === 'device') {
    const device = asRecord(trigger.device)
    const operation = asRecord(device.operation)
    const target = optionText(options, 'name', 'productName') || t('IotSceneLinkage.detail.previewUnconfigured')
    const action = optionText(options, 'action', 'propertiesName')
    const operator = String(operation.operator || '')
    if (operator === 'online') return `${target}${t('IotSceneLinkage.summary.online')}`
    if (operator === 'offline') return `${target}${t('IotSceneLinkage.summary.offline')}`
    if (operator === 'reportProperty') return `${target}${t('IotSceneLinkage.operator.reportProperty')}${action}`
    if (operator === 'reportEvent') return `${target}${t('IotSceneLinkage.operator.reportEvent')}${action}`
    if (operator === 'readProperty') return t('IotSceneLinkage.detail.previewRead', { target, property: action })
    if (operator === 'writeProperty') return t('IotSceneLinkage.detail.previewWrite', { target, property: action })
    if (operator === 'invokeFunction') return t('IotSceneLinkage.detail.previewInvoke', { target, function: action })
  }
  if (type === 'manual') return t('IotSceneLinkage.summary.manual')
  if (type === 'timer') return optionText(options, 'name', 'type') || t('IotSceneLinkage.detail.timerTrigger')
  if (type === 'alarm') return optionText(asRecord(trigger.configuration).options, 'alarmConfigName', 'name') || providerName(type, props.triggerProviders, 'triggerType')
  if (type === 'ai-event') return optionText(asRecord(trigger.configuration).options, 'sceneName', 'taskTargetName') || providerName(type, props.triggerProviders, 'triggerType')
  return providerName(type, props.triggerProviders, 'triggerType')
}

function formatDeviceAction(action: SceneRuleRecord) {
  const device = asRecord(action.device || action.configuration)
  const message = asRecord(device.message)
  const options = asRecord(action.options)
  const target = optionText(options, 'name', 'productName') || t('IotSceneLinkage.detail.previewUnconfigured')
  const property = optionText(options, 'propertiesName') || displayList(message.functionId || message.properties)
  if (message.messageType === 'READ_PROPERTY') return t('IotSceneLinkage.detail.previewRead', { target, property })
  if (message.messageType === 'WRITE_PROPERTY') return t('IotSceneLinkage.detail.previewWrite', { target, property })
  if (message.messageType === 'INVOKE_FUNCTION') return t('IotSceneLinkage.detail.previewInvoke', { target, function: property })
  return `${providerName('device', props.actionProviders, 'action')} ${target}${property ? ` ${property}` : ''}`
}

function formatAction(action: SceneRuleRecord) {
  const executor = String(action.executor || '')
  const options = asRecord(action.options)
  if (executor === 'alarm') return t('IotSceneLinkage.summary.legacyAlarmAction')
  if (executor === 'notify') return t('IotSceneLinkage.detail.legacyAction')
  if (executor === 'delay') {
    const delay = asRecord(action.delay)
    return t('IotSceneLinkage.summary.delay', { value: delay.time ?? '', unit: t(`IotSceneLinkage.unit.${delay.unit || 'seconds'}`) })
  }
  if (executor === 'device' || executor === 'device-data') return formatDeviceAction(action)
  if (executor === 'sceneNotify') {
    const config = asRecord(action.configuration)
    const channel = optionText(options, 'channelName', 'methodName', 'notifyChannelName', 'type') || t('IotSceneLinkage.action.notify')
    const recipients = optionText(options, 'userNames', 'users', 'recipientNames')
      || t('IotSceneLinkage.detail.previewRecipientCount', { count: Array.isArray(config.userIds) ? config.userIds.length : 0 })
    return t('IotSceneLinkage.detail.previewNotify', { channel, recipients })
  }
  if (executor === 'alarm-record-query') return `${t('IotSceneLinkage.summary.queryAlarmRecords')}${optionText(options, 'name', 'alarmConfigName') ? `：${optionText(options, 'name', 'alarmConfigName')}` : ''}`
  return optionText(options, 'name', 'type') || providerName(executor, props.actionProviders, 'action')
}

/**
 * 详细规则预览与快速模式使用同一阅读语言：动作动词保持普通文本，通知通道、设备等业务对象以字段标签突出。
 * 对无法从旧动作配置稳定拆出字段的 Provider，保留完整的原始描述，避免预览损失兼容信息。
 */
function formatActionParts(action: SceneRuleRecord): PreviewPart[] {
  const executor = String(action.executor || '')
  if (executor === 'device' || executor === 'device-data') {
    const device = asRecord(action.device || action.configuration)
    const message = asRecord(device.message)
    const options = asRecord(action.options)
    const target = optionText(options, 'name', 'productName') || t('IotSceneLinkage.detail.previewUnconfigured')
    const property = optionText(options, 'propertiesName') || displayList(message.functionId || message.properties)
    if (message.messageType === 'READ_PROPERTY') return formatLocalizedActionParts('IotSceneLinkage.detail.previewRead', { target, property })
    if (message.messageType === 'WRITE_PROPERTY') return formatLocalizedActionParts('IotSceneLinkage.detail.previewWrite', { target, property })
    if (message.messageType === 'INVOKE_FUNCTION') return formatLocalizedActionParts('IotSceneLinkage.detail.previewInvoke', { target, function: property })
  }
  if (action.executor === 'sceneNotify') {
    const options = asRecord(action.options)
    const config = asRecord(action.configuration)
    const channel = optionText(options, 'channelName', 'methodName', 'notifyChannelName', 'type') || t('IotSceneLinkage.action.notify')
    const recipients = optionText(options, 'userNames', 'users', 'recipientNames')
      || t('IotSceneLinkage.detail.previewRecipientCount', { count: Array.isArray(config.userIds) ? config.userIds.length : 0 })
    return [
      { text: t('IotSceneLinkage.action.send') },
      { text: channel, field: true },
      { text: t('IotSceneLinkage.action.to') },
      { text: recipients, field: true },
    ]
  }
  return [{ text: formatAction(action) }]
}

/** 在不假设语序的前提下，将 i18n 动作模板中的业务对象替换为可高亮字段。 */
function formatLocalizedActionParts(key: string, values: Record<string, string>): PreviewPart[] {
  const markers = Object.fromEntries(Object.keys(values).map(name => [name, `__scene_preview_${name}__`]))
  const markerPattern = Object.values(markers).map(marker => marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const text = t(key, markers)
  if (!markerPattern) return [{ text }]
  const markerValues = Object.fromEntries(Object.entries(markers).map(([name, marker]) => [marker, values[name]]))
  return text.split(new RegExp(`(${markerPattern})`)).filter(Boolean).map(part => markerValues[part]
    ? { text: markerValues[part], field: true }
    : { text: part })
}

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
  const triggerText = formatTrigger(asRecord(props.rule.trigger), asRecord(ruleOptions.trigger), String(props.rule.triggerType || ''))
  const lines: PreviewLine[] = [{ key: 'trigger', kind: 'trigger', label: t('IotSceneLinkage.detail.triggerRule'), value: triggerText || t('IotSceneLinkage.detail.noTriggerRule'), empty: !triggerText }]
  const branches = asRecords(props.rule.branches)
  const hasBranchCondition = branches.some(branch => formatConditions(branch.when).length)
  const hasThenAction = branches.some((branch, branchIndex) => {
    const isOtherwise = branchIndex > 0 && Boolean(branch.executeAnyway)
    return !isOtherwise && asRecords(branch.then).some(group => asRecords(group.actions).length)
  })

  // 与快速模式一致，未添加过滤条件或执行动作时也保留“当 / 就”的完整阅读骨架。
  if (!hasBranchCondition) lines.push({
    key: 'when-empty',
    kind: 'when',
    label: t('IotSceneLinkage.rule.when'),
    value: t('IotSceneLinkage.detail.previewNoFilter'),
    empty: true,
  })
  if (!hasThenAction) lines.push({
    key: 'then-empty',
    kind: 'then',
    label: t('IotSceneLinkage.summary.then'),
    value: t('IotSceneLinkage.rule.previewNoAction'),
    empty: true,
  })

  branches.forEach((branch, branchIndex) => {
    const conditions = formatConditions(branch.when)
    const isOtherwise = branchIndex > 0 && Boolean(branch.executeAnyway)
    if (isOtherwise) {
      // 否则分支先说明触发语义，再单独列出要执行的动作，避免误读为普通“就”分支。
      lines.push({
        key: `otherwise-${branchIndex}`,
        kind: 'otherwise',
        label: t('IotSceneLinkage.detail.previewOtherwise'),
        value: t('IotSceneLinkage.detail.previewOtherwiseDescription'),
      })
    }
    conditions.forEach((condition, index) => lines.push({
      key: `when-${branchIndex}-${index}`,
      kind: 'when',
      label: t('IotSceneLinkage.rule.when'),
      value: condition,
    }))

    const actionGroups = asRecords(branch.then)
    const hasBranchAction = actionGroups.some(group => asRecords(group.actions).length)
    if (isOtherwise && !hasBranchAction) lines.push({
      key: `otherwise-then-empty-${branchIndex}`,
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
          lines.push({ key: `then-${branchIndex}-${groupIndex}-${index}`, kind, label: index ? undefined : label, value: parts.map(part => part.text).join(' '), parts })
          // 串行动作的 terms 是“继续执行下一动作”的门槛；紧跟所属动作展示，避免误读为分支总条件。
          formatConditionLines(action.terms).forEach((filter, filterIndex) => lines.push({ key: `filter-${branchIndex}-${groupIndex}-${index}-${filterIndex}`, kind: 'when', label: t('IotSceneLinkage.rule.when'), value: `${filter}，${t('IotSceneLinkage.detail.previewContinueNextAction')}` }))
        })
      }
    })
    if (branch.shakeLimit?.enabled) lines.push({ key: `debounce-${branchIndex}`, kind: 'debounce', label: t('IotSceneLinkage.debounce.enable'), value: branch.shakeLimit.continuous ? t('IotSceneLinkage.debounce.continuousHint', { time: branch.shakeLimit.time }) : t('IotSceneLinkage.debounce.frequencyHint', { time: branch.shakeLimit.time }) })
  })
  return lines
})

const summary = computed(() => previewLines.value.map(line => `${line.label ? `${line.label}：` : ''}${line.value}`).join('；'))
watch(summary, value => emit('change', value), { immediate: true })
watch(summary, value => emit('title-change', value), { immediate: true })
</script>

<style scoped>
.detailed-scene-rule-summary { display: grid; min-width: 0; }
.detailed-scene-rule-summary__tree { display: grid; gap: var(--space-2, 8px); min-width: 0; }
.detailed-scene-rule-summary__node { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: var(--space-2, 8px); align-items: start; min-width: 0; line-height: 28px; }
.detailed-scene-rule-summary__node-label { display: inline-flex; min-height: 28px; padding: 0 8px; border-radius: 4px; font-weight: 600; }.detailed-scene-rule-summary__node-label--trigger { color: #d46b08; background: #fff1d6; }.detailed-scene-rule-summary__node-label--when { color: #087443; background: #e8f7ef; }.detailed-scene-rule-summary__node-label--then { color: var(--ant-color-primary); background: #e6f0ff; }.detailed-scene-rule-summary__node-label--otherwise { color: #6c4fe0; background: #efebff; }.detailed-scene-rule-summary__node-label--debounce { color: #9d4f00; background: #fff7e6; }.detailed-scene-rule-summary__node-label--continuation { visibility: hidden; background: transparent; }
.detailed-scene-rule-summary__node-value { min-width: 0; overflow-wrap: anywhere; color: var(--ant-color-text); }.detailed-scene-rule-summary__node-value.has-parts { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }.detailed-scene-rule-summary__part { color: var(--ant-color-primary); }.detailed-scene-rule-summary__part.is-field { padding: 0 8px; color: var(--ant-color-primary); background: #eef4ff; border-radius: 4px; }.detailed-scene-rule-summary__node-value.is-empty { color: #86909c; }
</style>
