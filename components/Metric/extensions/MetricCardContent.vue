<template>
  <div class="metric-card-content" :class="{ 'is-boolean': typeof value?.value === 'boolean', 'has-intervals':intervals }">
  <a-skeleton v-if="configuration.state !== 'disabled' && !value && (!history || history.latestLoading)" class="metric-card-content__skeleton" active :title="false" :paragraph="{ rows: 2, width: ['45%', '70%'] }" />
  <MetricStateDuration v-else-if="intervals" :labels="labels" :value="value" :disabled="configuration.state === 'disabled'" :live="configuration.state === 'enabled'" compact />
  <MetricValueView v-else-if="value || configuration.state === 'disabled' || runtime?.state === 'loaded'" compact summary hide-quality :value="value" :template="template" :output="output" :unit="output.unit" :disabled="configuration.state === 'disabled'" :settings="settings" :labels="labels">
    <template v-if="provider?.card" #default="{ text }">
      <MetricExtension :content="provider.card" :content-props="{ context, configuration, template, output, value, settings }" @failed="failed = true">
        <template #fallback><strong :title="text">{{ text }}</strong></template>
      </MetricExtension>
    </template>
  </MetricValueView>
  <strong v-else class="metric-card-empty">—</strong>
  <MetricStatisticSummary v-if="!provider?.card" :output="output" />
  <div v-if="!hideTrend && output.persist !== false && !output.latestOnly && (configuration.state !== 'disabled' || historyValues.length)" class="metric-card-content__trend">
    <span v-if="history?.error" class="metric-card-content__error">{{ t('historyFailed') }}</span>
    <a-skeleton v-else-if="!history || history.loading && !history.values.length" class="metric-card-content__skeleton" active :title="false" :paragraph="{ rows: 2 }" />
    <MetricStateHistory v-else-if="intervals" :labels="labels" :values="historyValues" :current="value" :bounds="history.bounds" compact />
    <MetricTrend v-else :values="historyValues" :current="value" :output="output" :sample-interval="metricSampleInterval(template,output.metricId)" :state-output="stateOutput" :bounds="history.bounds" :unit="output.unit" :limited="history.values.length >= 200" :labels="labels" compact />
  </div>
  <footer class="metric-card-content__footer">
    <a-tooltip v-if="observedTime && observedTime > 0" :title="timeHint" :trigger="['hover', 'click']"><time @click.stop>{{ t(timeLabel) }} {{ shortTime }}</time></a-tooltip><span v-else-if="configuration.state !== 'disabled' && (!runtime || runtime.state === 'loaded')">{{ t('waiting') }}</span>
    <span v-if="configuration.state !== 'disabled' && metricInputDiagnostics(value).total" class="metric-card-content__inspect">{{ t('issueDetails') }}<AIcon type="RightOutlined" /></span>
  </footer>
  <MetricRuntimeFeedback v-if="runtime && runtime.state !== 'loaded'" :runtime="runtime" :has-value="!!value" :disabled="configuration.state === 'disabled'" compact />
  <a-alert v-if="missing || failed" type="warning" show-icon :message="t(missing ? 'presentationMissing' : 'presentationFailed')" />
  </div>
</template>
<script setup lang="ts">
import { computed, inject, ref, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MetricValueView from '../MetricValue.vue'
import MetricStatisticSummary from '../MetricStatisticSummary.vue'
import MetricRuntimeFeedback from '../MetricRuntimeFeedback.vue'
import MetricTrend from '../MetricTrend.vue'
import MetricStateDuration from '../MetricStateDuration.vue'
import MetricStateHistory from '../MetricStateHistory.vue'
import { stateIntervalSummary, stateLabels } from '../stateIntervals'
import { metricOutputPresentation } from '../outputPresentation'
import MetricExtension from './MetricExtension.vue'
import { useMetricPresentation } from './useMetricPresentation'
import { metricMessages } from '../messages'
import { metricState, metricSampleInterval, resultTime } from '../presentation'
import { metricInputDiagnostics } from '../sourceDiagnostics'
import { metricHistoryKey, type MetricHistoryState } from '../useMetricTrends'
import type { MetricConfig, MetricContext, MetricRuntime, MetricTemplate, MetricTemplateOutput, MetricValue } from '../types'
// 与现有 SFC 一样内联宏结构，兼容 setup-name-support 的匿名预编译；领域类型仍复用共享契约。
const props = defineProps<{ context: MetricContext; configuration: MetricConfig; template: MetricTemplate; output: MetricTemplateOutput; value?: MetricValue; runtime?: MetricRuntime; hideTrend?:boolean; history?:MetricHistoryState }>()
const { t, locale } = useI18n({ useScope: 'local', messages: metricMessages })
const { provider, missing, settings } = useMetricPresentation(toRef(props, 'template'), toRef(props, 'configuration'))
const failed = ref(false)
const labels = computed(() => stateLabels(props.template, props.output.metricId))
const presentation = computed(() => metricOutputPresentation(props.output,{template:props.template}))
const stateOutput = computed(() => presentation.value.history === 'state' || presentation.value.history === 'interval')
const intervals = computed(() => presentation.value.history === 'interval' && !provider.value?.card)
watch(provider, () => { failed.value = false })
const shared = inject(metricHistoryKey, undefined)
const history = computed(() => props.history || (props.configuration.id ? shared?.entries.value[props.configuration.id] : undefined))
const historyValues = computed(() => history.value?.values.filter(value => value.metricId === props.output.metricId) || [])
const state = computed(() => intervals.value && stateIntervalSummary(props.value).state === 'unknown' ? { key:'inputExpired', tone:'warning' } : metricState(props.value))
const evaluated = computed(() => props.value && resultTime(props.value))
const observedTime = computed(() => props.value?.state?.readView?.time || evaluated.value || props.value?.eventTime)
const fullTime = computed(() => observedTime.value ? new Date(observedTime.value).toLocaleString(String(locale.value)) : '')
const shortTime = computed(() => observedTime.value ? new Date(observedTime.value).toLocaleString(String(locale.value), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
const timeLabel = computed(() => props.value?.state?.readView ? 'readAt' : evaluated.value ? 'updatedAt' : 'sourceTime')
const timeHint = computed(() => `${fullTime.value} · ${t(`${timeLabel.value}Hint`)} · ${t(state.value.key)}`)
</script>
<style scoped>
.metric-card-empty { display:flex; align-items:center; min-height:46px; font-size:var(--fs-24,24px) }
.metric-card-content { display:flex; flex:1; flex-direction:column; min-height:0; min-width:0; gap:var(--space-1,4px) }
.metric-card-content :deep(.metric-value--summary .metric-value__main) { min-height:46px }
.has-intervals .metric-card-content__trend { height:40px; min-height:40px }
.metric-card-content__trend { min-height:64px; flex:none; margin-top:auto }
.metric-card-content__skeleton { min-height:46px; padding:4px 0 }
.metric-card-content__skeleton :deep(.ant-skeleton-paragraph) { margin:0 }
.metric-card-content__pending,.metric-card-content__error { display:flex; align-items:center; justify-content:center; height:100%; font-size:var(--fs-12,12px); color:var(--ink-2) }
.metric-card-content__error { color:var(--jet-theme-error-color,var(--ink-2)) }
.metric-card-content__footer { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px; color:var(--ink-3); font-size:11px; padding-top:6px }
.metric-card-content__footer time { cursor:help }
.metric-card-content__inspect { display:inline-flex; align-items:center; gap:4px; color:var(--ink-2) }
</style>
