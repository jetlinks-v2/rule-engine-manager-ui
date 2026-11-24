<template>
  <div class="metric-value" :class="{ 'metric-value--compact': compact, 'metric-value--inline': inline, 'metric-value--summary': summary }">
    <div class="metric-value__main">
      <small v-if="renderable && state.key === 'inputExpired'" class="metric-value__last-known">{{ t('lastKnownResult') }}</small>
      <IconValueView v-if="renderable && appearance.icon" :value="appearance.icon" :size="inline ? 14 : 20" indicator :fallback-text="text" />
      <slot v-if="renderable" :text="text"><strong :title="text">{{ text }}</strong></slot>
      <strong v-else :title="text">{{ text }}</strong><span v-if="renderable && duration === undefined && displayUnit">{{ displayUnit }}</span>
    </div>
    <template v-if="!hideFeedback">
    <p v-if="summary && !disabled && issueCaption" class="metric-value__issue" :title="issueCaption"><AIcon type="ExclamationCircleOutlined" />{{ issueCaption }}</p>
    <span v-else-if="inline && !disabled && !['valid', 'unknownQuality', 'waiting', 'noValue'].includes(state.key)" class="metric-value__inline-issue" :title="issueCaption || feedback">{{ t(state.tone === 'error' ? 'issueNoResult' : 'issuePartial') }}</span>
    <a-tag v-else-if="!inline && (!hideQuality || !['valid', 'unknownQuality'].includes(state.key))" :color="state.tone === 'default' ? undefined : state.tone" :title="!issueCaption && partialCoverage !== undefined ? t('coveragePartialHint') : undefined">{{ !disabled && issueCaption || feedback }}</a-tag>
    </template>
    <MetricValueFields v-if="schema && renderable && value?.value && typeof value.value === 'object' && !Array.isArray(value.value)" :value="value.value" :schema="schema" />
    <div v-if="!summary && !inline && compact && value && !disabled" class="metric-value__facts">
      <span v-if="hasTime(value.inputTimeStart) && hasTime(value.inputTimeEnd)">{{ t('inputRange') }} {{ time(value.inputTimeStart) }} — {{ time(value.inputTimeEnd) }}</span>
      <span v-else-if="hasTime(value.eventTime)">{{ t('sourceTime') }} {{ time(value.eventTime) }}</span>
      <span v-else>{{ t('inputTimeUnknown') }}</span>
    </div>
    <div v-if="!summary && !inline && !compact && value && !disabled" class="metric-value__facts">
      <span v-if="hasTime(value.eventTime)">{{ t('sourceTime') }} {{ time(value.eventTime) }}</span>
      <span v-if="hasTime(evaluated)">{{ t('updatedAt') }} {{ time(evaluated) }}</span>
      <span v-if="hasTime(value.inputTimeStart) && hasTime(value.inputTimeEnd)">
        {{ t('inputRange') }} {{ time(value.inputTimeStart) }} — {{ time(value.inputTimeEnd) }}
      </span>
      <span v-if="value.quality?.coverage != null">{{ t('coverage') }} {{ percentage(value.quality.coverage) }}</span>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { metricStatisticUnit, metricStatisticSigned, statisticMessages } from './statisticPresentation'
import { metricDurationText, metricState, resultTime } from './presentation'
import { formatMetricValue } from './extensions/presentationSettings'
import type { MetricStateLabel, MetricTemplate, MetricTemplateOutput, MetricValue } from './types'
import { metricIssueCaption } from './sourceDiagnostics'
import { semanticValueText, metricValueLabels, metricValueSchema, schemaValueLabels, type ValueSchema } from './valueSemantics'
import { metricDateText as time } from './time'
import MetricValueFields from './MetricValueFields.vue'
import IconValueView from '@jetlinks-web-core/components/IconValue/IconValueView.vue'
import { stateAppearance, stateLabel } from './stateIntervals'
const props = defineProps<{ value?: MetricValue; template?:MetricTemplate; output?:MetricTemplateOutput; unit?: string; disabled?: boolean; compact?: boolean; inline?: boolean; summary?: boolean; hideQuality?: boolean; hideFeedback?:boolean; settings?: Record<string, unknown>; labels?:MetricStateLabel[]; meaning?:{ schema?:ValueSchema; labels?:MetricStateLabel[] } }>()
const { t, locale } = useI18n({ useScope: 'local', messages: statisticMessages })
const state = computed(() => props.disabled ? { key: 'disabled', tone: 'default' } : metricState(props.value))
const issueCaption = computed(()=>metricIssueCaption(props.value,props.template,t))
const schema = computed(()=>props.meaning?.schema || (props.template && props.output ? metricValueSchema(props.template,props.output.metricId) : undefined) || (props.output?.valueType ? {type:props.output.valueType} : undefined))
const labels = computed(()=>{
  const declared=props.meaning?.labels || (props.labels?.length ? props.labels : props.template && props.output ? metricValueLabels(props.template,props.output.metricId) : [])
  return declared.length ? declared : schemaValueLabels(schema.value)
})
const appearance = computed(() => stateAppearance(props.value?.value,labels.value))
const renderable = computed(() => !props.disabled && props.value?.status !== 'invalid' && props.value?.quality?.valid !== false)
const displayUnit=computed(()=>metricStatisticUnit(props.output,t,props.value,props.unit))
const duration = computed(() => renderable.value ? metricDurationText(props.value?.value, displayUnit.value, t) : undefined)
const text = computed(() => !renderable.value ? props.summary && !props.disabled && state.value.tone === 'error' ? t('issueNoResult') : '—' : props.meaning || ['date','enum','object','array'].includes(String(schema.value?.type)) ? semanticValueText(props.value?.value,{ schema:schema.value,labels:labels.value,locale:String(locale.value), unit:displayUnit.value },t)
  : labels.value.some(item=>item.value===props.value?.value) ? stateLabel(props.value?.value,labels.value,String(locale.value))
    : duration.value ?? (typeof props.value?.value === 'boolean' ? t(props.value.value ? 'conditionTrue' : 'conditionFalse') : metricStatisticSigned(formatMetricValue(props.value?.value, props.settings, props.output),props.value?.value,props.output)))
const evaluated = computed(() => props.value && resultTime(props.value))
// 后端原始时间字段为 long；0 表示尚无来源事实，不能反显为 epoch 日期。
const hasTime = (value?: number): value is number => value !== undefined && Number.isFinite(value) && value > 0
const percentage = (value: number) => new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 }).format(value)
// 只展示服务端已有覆盖率，不把未知时段补为正常，也不覆盖具体来源诊断。
const partialCoverage = computed(()=>{ const coverage=props.value?.quality?.coverage;return state.value.key === 'optionalInputMissing' && typeof coverage === 'number' && Number.isFinite(coverage) && coverage >= 0 && coverage < 1 ? coverage : undefined })
const feedback = computed(()=>partialCoverage.value !== undefined ? `${t('coverage')} ${percentage(partialCoverage.value)}` : t(state.value.key))
</script>
<style scoped>
.metric-value__main { display:flex; align-items:baseline; flex-wrap:wrap; gap:var(--space-2, 8px) }
.metric-value__main>.icon-value-view { align-self:center }
.metric-value__last-known { color:var(--ink-3); font-size:12px; font-weight:400 }
.metric-value__main strong { font-size:var(--fs-20, 20px); font-weight:600; color:var(--ink-1); max-width:26rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.metric-value__main > span { color:var(--ink-2) }
.metric-value > .ant-tag { margin-top:var(--space-2,8px) }
.metric-value--compact .metric-value__main strong { font-size:var(--fs-24,24px) }
.metric-value--summary .metric-value__main { min-height:46px }
.metric-value--summary { display:flex; align-items:center; flex-wrap:wrap; gap:8px }
.metric-value--summary > .ant-tag { margin:0 }
.metric-value__issue { display:flex; align-items:baseline; gap:6px; flex-basis:100%; margin:0; color:var(--ink-2); font-size:var(--fs-12,12px); line-height:1.6; overflow-wrap:anywhere }
.metric-value__issue :deep(.anticon) { color:var(--color-warning,#faad14); flex:none }
.metric-value__inline-issue { font-size:var(--fs-12,12px); color:var(--ink-3) }
.metric-value--summary .metric-value__main strong { font-size:var(--fs-32,32px); letter-spacing:-.5px; max-width:100%; line-height:1.4 }
.metric-value__facts { display:flex; flex-wrap:wrap; gap:var(--space-1,4px) var(--space-4,16px); color:var(--ink-3); font-size:var(--fs-12,12px); margin-top:var(--space-1,4px) }
.metric-value--inline { display:flex; align-items:center; justify-content:flex-end; flex-wrap:wrap; gap:6px }
.metric-value--inline .metric-value__main strong { font-size:var(--fs-14,14px); color:var(--ink-2) }
.metric-value--inline > .ant-tag { margin:0; font-size:var(--fs-12,12px) }
</style>
