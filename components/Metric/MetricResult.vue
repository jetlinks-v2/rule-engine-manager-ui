<template>
  <div class="metric-result">
    <a-alert v-if="error" type="error" show-icon :message="t('readFailed')" :description="error">
      <template #action><a-button size="small" @click="refresh">{{ t('retry') }}</a-button></template>
    </a-alert>
    <a-alert v-if="inaccessible" type="warning" show-icon :message="t('noAccess')" />
    <div v-else>
      <div class="metric-result__summary">
        <MetricStateDuration v-if="intervals" detail :labels="labels" :value="processValue" :disabled="configuration?.state === 'disabled'" :live="!pinned && configuration?.state === 'enabled'"><template #label><MetricOutputSwitch :template="template" :output="output" :output-id="reference.outputId" @change="emit('selectOutput',$event)" /></template></MetricStateDuration>
        <template v-else><div class="metric-result__reading"><MetricOutputSwitch :template="template" :output="output" :output-id="reference.outputId" @change="emit('selectOutput',$event)" /><MetricValueView v-if="processValue || configuration?.state === 'disabled' || runtime?.state === 'loaded'" summary :hide-feedback="sourceFeedback && configuration?.state !== 'disabled'" :hide-quality="processValue?.quality?.valid === true" :value="processValue" :template="template" :output="output" :unit="output?.unit" :disabled="configuration?.state === 'disabled'" :settings="settings" :labels="labels" /><strong v-else>—</strong></div><small v-if="summaryTime" class="metric-result__stamp" :title="t('updatedAtHint')">{{ t('updatedAt') }} <time>{{ time(summaryTime) }}</time></small></template>
      </div>
      <MetricStatisticSummary :output="output" />
      <a-alert v-if="missing || extensionFailed" type="warning" show-icon :message="t(missing ? 'presentationMissing' : 'presentationFailed')" />
      <MetricHistoryView ref="historyView" :reference="reference" :output="output" :bounds="bounds" :inaccessible="inaccessible || !configuration" :state-output="recordHistory" :intervals="intervals" :labels="labels" :data-version="configuration?.dataVersion" :query-key="historyQueryKey" @drilldown="customRange=$event">
      <template #tools><MetricTimeRange v-model:range="range" v-model:custom-range="customRange" /><a-button type="text" size="small" :aria-label="t('refresh')" @click="refresh"><AIcon type="ReloadOutlined" />{{ t('refresh') }}</a-button></template>
      <a-spin :spinning="loading" :delay="150">
      <template v-if="provider?.detail && context && configuration && template && output">
      <MetricExtension :content="provider.detail"
        :content-props="{ context, configuration, template, output, value: processValue, settings, values, loading, error }" @failed="extensionFailed = true">
        <template #fallback><component :is="intervals ? MetricStateHistory : MetricTrend" :key="historyScope" v-bind="intervals ? {} : { output,stateOutput,unit:output.unit,sampleInterval,selectedValue:pinned ? processValue : undefined }" integrated :reset-selection="selectionReset" :values="values" :current="current" :labels="labels" :bounds="bounds" :limited="limited" :unavailable="!!error || loading" @select="selectHistory" /></template>
      </MetricExtension>
      </template>
      <component :is="intervals ? MetricStateHistory : MetricTrend" v-else :key="historyScope" v-bind="intervals ? {} : { output,stateOutput,unit:output?.unit,sampleInterval,selectedValue:pinned ? processValue : undefined }" integrated :reset-selection="selectionReset" :values="values" :current="current" :bounds="bounds" :limited="limited" :labels="labels" :unavailable="!!error || loading" @select="selectHistory"></component>
      </a-spin>
      </MetricHistoryView>
      <section v-if="configuration && sourceTemplate && output" class="metric-result__process">
        <MetricExecutionProcess :template="sourceTemplate" :output="output" :value="processValue" :observation="execution">
          <template #selection><strong>{{ t('executionProcess') }}</strong><time v-if="processValue">{{ t('evidenceComputedAt') }} {{ time(resultTime(processValue)) }}</time><small v-else>{{ t('executionSelectRecord') }}</small><a-button v-if="pinned" type="text" size="small" @click="followLatest"><AIcon type="UndoOutlined" />{{ t('executionFollowLatest') }}</a-button></template>
        </MetricExecutionProcess>
        <MetricSourceIssues :value="processValue" :template="sourceTemplate" :configuration="configuration" :disabled="configuration.state === 'disabled'" :editable="canEdit" @edit-source="emit('editSource',$event)" />
        <MetricLineage definitions-only :configuration="configuration" :template="sourceTemplate" :output="output" :context="context" :value="processValue" />
      </section>
      <MetricDisclosure v-if="processValue && !intervals && !recordHistory" :title="t('dataDetails')" icon="DatabaseOutlined"><MetricValueView :value="processValue" :output="output" :unit="output?.unit" :settings="settings" :labels="labels" /></MetricDisclosure>
      <MetricDisclosure :title="t('runtimeDiagnostics')" icon="DashboardOutlined"><MetricRuntimeFeedback :runtime="runtime" :has-value="!!current" :disabled="configuration?.state === 'disabled'" /></MetricDisclosure>
      <MetricHistoryVersions :reference="reference" :data-version="configuration?.dataVersion" />
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, inject, ref, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MetricValueView from './MetricValue.vue'
import MetricOutputSwitch from './MetricOutputSwitch.vue'
import MetricRuntimeFeedback from './MetricRuntimeFeedback.vue'
import MetricDisclosure from './MetricDisclosure.vue'
import MetricHistoryVersions from './MetricHistoryVersions.vue'
import MetricSourceIssues from './MetricSourceIssues.vue'
import MetricTrend from './MetricTrend.vue'
import MetricStatisticSummary from './MetricStatisticSummary.vue'
import MetricStateDuration from './MetricStateDuration.vue'
import MetricStateHistory from './MetricStateHistory.vue'
import { stateLabels } from './stateIntervals'
import { metricOutputPresentation } from './outputPresentation'
import MetricTimeRange from './MetricTimeRange.vue'
import MetricLineage from './MetricLineage.vue'
import MetricExecutionProcess from './MetricExecutionProcess.vue'
import type { HistoryEntry } from './history/projection'
import { metricHistoryKey } from './useMetricTrends'
import { useMetricResult } from './useMetricResult'
import { useMetricExecution } from './useMetricExecution'
import { useMetricSourceTemplate } from './useMetricSourceTemplate'
import { metricMessages } from './messages'
import { metricInputDiagnostics } from './sourceDiagnostics'
import { resultTime, metricSampleInterval, metricState } from './presentation'
import { metricDateText as time } from './time'
import { useHistoryKind } from './history/useHistoryTimeline'
import MetricHistoryView from './history/MetricHistoryView.vue'
import MetricExtension from './extensions/MetricExtension.vue'
import { useMetricPresentation } from './extensions/useMetricPresentation'
import type { MetricContext, MetricLatest, MetricReference, MetricTemplate, MetricTemplateOutput } from './types'
const props = defineProps<{ reference: MetricReference; latest?: MetricLatest; output?: MetricTemplateOutput; context?: MetricContext; template?: MetricTemplate }>()
const emit = defineEmits<{ (event: 'selectOutput', id: string): void; (event:'editSource',inputId:string):void }>()
const { t, locale } = useI18n({ useScope: 'local', messages: metricMessages })
const labels = computed(() => props.output ? stateLabels(props.template, props.output.metricId) : [])
const presentation = computed(() => metricOutputPresentation(props.output,{template:props.template}))
const intervals = computed(() => presentation.value.history === 'interval')
const { current, runtime, configuration, inaccessible, values, loading, error, range, customRange, refresh:refreshRaw, bounds, limited } = useMetricResult(toRef(props, 'reference'), undefined, toRef(props, 'latest'), inject(metricHistoryKey, undefined), intervals)
const historyView = ref<InstanceType<typeof MetricHistoryView>>()
function refresh() { void refreshRaw(); historyView.value?.refresh() }
const canEdit = computed(()=>!!props.context?.editable && configuration.value?.ownerType === props.context.ownerType && configuration.value?.ownerId === props.context.ownerId)
const sourceFeedback = computed(()=>!!metricInputDiagnostics(processValue.value).total || metricState(processValue.value).tone === 'error')
const historyScope = computed(() => JSON.stringify([props.reference.configId, props.reference.outputId, props.reference.targetType, props.reference.targetId]))
// Query intent resets interactions; rolling response bounds and latest samples do not.
const historyQueryKey = computed(() => JSON.stringify([historyScope.value,range.value,customRange.value]))
const historyKind = useHistoryKind(values, current, historyScope)
const stateOutput = computed(() => presentation.value.history === 'state' || intervals.value)
const sampleInterval = computed(()=>metricSampleInterval(props.template,props.reference.outputId))
const recordHistory = computed(() => stateOutput.value || presentation.value.history === 'boolean' || historyKind.value === 'boolean')
const summaryTime = computed(() => processValue.value && (intervals.value && !pinned.value ? processValue.value.state?.readView?.time ?? resultTime(processValue.value) : resultTime(processValue.value)))
const { provider, missing, settings } = useMetricPresentation(toRef(props, 'template'), configuration)
const extensionFailed = ref(false)
const pinned = ref(false), selection = ref<HistoryEntry>(), selectionReset = ref(0)
const requestedValue = computed(()=>pinned.value ? selection.value?.value : current.value)
const execution = useMetricExecution(toRef(props,'reference'),requestedValue,computed(()=>!inaccessible.value && configuration.value?.state === 'enabled'),undefined,computed(()=>!pinned.value))
const processValue = computed(()=>execution.value.value)
function selectHistory(entry:HistoryEntry|undefined, fixed:boolean) {
  if (!fixed) { pinned.value = false; selection.value = undefined }
  else { pinned.value = true; if (entry) selection.value = entry }
}
function followLatest() { pinned.value = false; selection.value = undefined; selectionReset.value++ }
watch(historyQueryKey,followLatest)
const sourceTemplate = useMetricSourceTemplate(toRef(props,'template'),configuration,toRef(props,'context'),computed(()=>!inaccessible.value))
watch(provider, () => { extensionFailed.value = false })
</script>
<style scoped>
.metric-result { display:grid; gap:8px; min-width:0 }
.metric-result > div { min-width:0 }
.metric-result__tools { display:flex; align-items:center; gap:var(--space-2,8px); flex-wrap:wrap; margin:8px 0 }
.metric-result small { color:var(--ink-2) }
.metric-result__summary { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:2px 8px; min-height:32px; margin:0 0 4px }
.metric-result__reading { display:flex; align-items:center; flex-wrap:wrap; gap:4px 12px; min-width:0 }
.metric-result__reading :deep(.metric-value--summary .metric-value__main) { min-height:28px; align-items:center; gap:6px }
.metric-result__reading :deep(.metric-value--summary .metric-value__main strong) { font-size:var(--fs-20,20px); line-height:1.4; letter-spacing:0 }
.metric-result__reading :deep(.metric-value--summary) { gap:4px 8px }
.metric-result__summary > small { font-size:var(--fs-12,12px); line-height:1.7; color:var(--ink-3) }
.metric-result__stamp time { font-variant-numeric:tabular-nums; white-space:nowrap }
.metric-result__tools { justify-content:space-between }
.metric-result__process { border-top:1px solid var(--line); padding-top:6px; display:grid; gap:6px; min-width:0 }
.metric-result__process strong { font-size:13px; font-weight:500; color:var(--ink-2) }
</style>
