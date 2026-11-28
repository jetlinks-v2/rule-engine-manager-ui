<template>
  <section v-if="node" class="config-node">
    <header><AIcon :type="summary.icon" /><b>{{ nodeLabel(template, node) }}</b><span>{{ t(node.kind === 'input' ? 'inputs' : node.kind === 'rule' ? 'calculation' : 'outputs') }}</span></header>
    <template v-if="input">
      <button type="button" class="config-node__source" :disabled="disabled || !picker" @click="emit('choose', input)"><AIcon :type="description?.error ? 'ExclamationCircleOutlined' : mapping?.kind === 'metric' ? 'NodeIndexOutlined' : mapping?.kind === 'builtin' ? 'ThunderboltOutlined' : mapping?.id === '$online' ? 'PoweroffOutlined' : mapping ? 'DatabaseOutlined' : 'PlusOutlined'" /><span class="config-node__source-copy"><span>{{ description?.error || sourceLabel || t(mapping ? 'configBound' : 'chooseSource') }}</span><small v-if="mapping">{{ t('configChangeSource') }}</small></span><AIcon type="RightOutlined" /></button>
      <p v-if="description?.detail">{{ description.detail }}</p>
      <p v-if="description?.capabilities?.length">{{ description.capabilities.map(capability=>t(`sourceCapability_${capability}`)).join(t('sentenceList')) }}</p>
      <p v-if="mapping?.statistics" class="config-node__fixed">{{ t('statisticsSimulationHint') }}</p>
      <p v-if="sourceScheduleMissing(template, input, mapping)" role="alert" class="config-node__warning"><AIcon type="ClockCircleOutlined" />{{ t('sourceScheduleRequired') }}</p>
      <p>{{ input.source?.lookback ? t('configReadHistory', { duration:simulationDuration(input.source.lookback, t) }) : t('latestReadingHint') }}</p>
      <p v-if="input.maxAge"><AIcon type="ClockCircleOutlined" />{{ t('configFreshness', { duration:simulationDuration(input.maxAge, t) }) }}</p>
      <p v-if="input.minSamples">{{ t('configMinSamples', { count:input.minSamples }) }}</p>
      <p v-if="input.maxGap">{{ t('maxGap') }} · {{ simulationDuration(input.maxGap, t) }}</p>
      <p><AIcon type="SafetyOutlined" />{{ t(input.presence === 'optional' ? 'inputOptionalHint' : input.presence === 'defaultValue' ? 'inputDefaultHint' : 'inputRequiredHint') }}<template v-if="input.presence === 'defaultValue'"> · {{ metricValueText(input.defaultValue) }}</template></p>
      <p v-if="input.unit">{{ t('inputUnit') }} · {{ input.unit }}<template v-if="description?.unit"> / {{ t('configSourceUnit') }} · {{ description.unit }}</template></p>
      <details v-if="mapping"><summary>{{ t('dataDetails') }}</summary><code>{{ mapping.thingType || configuration.targetType }} / {{ mapping.thingId || (configuration.scope === 'children' ? t('currentMember') : configuration.targetId) }} / {{ mapping.id }}</code></details>
    </template>
    <template v-else-if="rule">
      <p v-if="dependencies.length" class="config-node__dependencies"><span>{{ t('configUses') }}</span><button v-for="item in dependencies" :key="item.id" type="button" @click="emit('locate', item.id)"><AIcon type="LinkOutlined" />{{ item.label }}</button></p>
      <TemplateWindowDescription v-if="isStatistics" :rule="rule" :catalog="aggregations" :source="windowSourceLabel(template,rule,t('sentenceList'))" />
      <TemplateFormulaDisplay v-if="summary.expression" :template="template" :rule="rule" :expression="summary.expression" />
      <p v-else-if="!isStatistics" class="config-node__meaning">{{ summary.text }}</p>
      <p><AIcon type="ClockCircleOutlined" />{{ summary.detail }}</p>
      <p v-if="!isStatistics && rule.window?.size">{{ t('configWindow') }} · {{ rule.window.mode === 'latestN' ? t('configMinSamples', { count:rule.window.size }) : simulationDuration(rule.window.size, t) }}</p>
      <p v-if="rule.maxInputSkew">{{ t('configSkew', { duration:simulationDuration(rule.maxInputSkew, t) }) }}</p>
      <div v-if="rule.applicabilityExpression" class="config-node__condition"><small>{{ t('applicability') }}</small><TemplateFormulaDisplay :template="template" :rule="rule" :expression="rule.applicabilityExpression" compact /></div>
      <p v-if="rule.stateTracking">{{ t('configStateGap', { duration:simulationDuration(rule.stateTracking.maxNoData, t) }) }}</p>
      <div v-if="stateLabels.length" class="config-node__states"><span v-for="item in stateLabels" :key="String(item.value)"><code>{{ item.value }}</code>{{ i18nText(item.name, item.nameI18n, locale) }}</span></div>
      <small class="config-node__fixed"><AIcon type="LockOutlined" />{{ t('configRuleFixed') }}</small>
    </template>
    <template v-else-if="output">
      <p class="config-node__fixed"><AIcon type="FontSizeOutlined" />{{ output.unit || t('noUnit') }}</p>
      <MetricOutputStorageFields :template="template" :model-value="configuration.outputStorage" :output-id="output.metricId" :constraints="storageConstraints" :loading="storageLoading" :error="storageError" :disabled="disabled" @update:model-value="emit('storage',$event)" @retry="emit('retryStorage')" />
      <p><AIcon type="ThunderboltOutlined" />{{ t(output.publish ? 'outputEvents' : 'configNoEvent') }}</p>
    </template>
  </section>
</template>
<script setup lang="ts">
import { computed, inject } from 'vue'
import MetricOutputStorageFields from './MetricOutputStorageFields.vue'
import { useI18n } from 'vue-i18n'
import { i18nText } from '@jetlinks-web-core/components/I18n/text'
import TemplateFormulaDisplay from './template/formula/TemplateFormulaDisplay.vue'
import { metricMessages } from './messages'
import { metricValueText } from './presentation'
import { nodeLabel, nodeList, ruleDependencies, type TemplateNode, type TemplateRule } from './template/designer'
import { graphNodeSummary } from './template/graphPresentation'
import { metricCalculatorsKey, metricAggregationsKey } from './calculatorContext'
import { calculationKind } from './template/window'
import { windowSourceLabel } from './template/windowPresentation'
import TemplateWindowDescription from './template/TemplateWindowDescription.vue'
import { simulationDuration } from './template/simulationFlow'
import { sourceScheduleMissing } from './sourcePolicy'
import type { MetricConfig, MetricSourceDescription, MetricSourcePicker, MetricStateLabel, MetricTemplate, MetricTemplateInput } from './types'
const props = defineProps<{ template:MetricTemplate; configuration:MetricConfig; node?:TemplateNode; sourceLabel?:string; description?:MetricSourceDescription; picker?:MetricSourcePicker; disabled?:boolean; storageConstraints?:string[]; storageLoading?:boolean; storageError?:string }>()
const emit = defineEmits<{ (event:'choose', input:MetricTemplateInput):void; (event:'locate', id:string):void; (event:'storage',value:NonNullable<MetricConfig['outputStorage']>):void; (event:'retryStorage'):void }>()
const { t, locale } = useI18n({ useScope:'local', messages:metricMessages })
const input = computed(() => props.node?.kind === 'input' ? props.template.inputDefinitions[props.node.index] : undefined)
const mapping = computed(() => input.value && props.configuration.inputMappings[input.value.id])
const rule = computed(() => props.node?.kind === 'rule' ? props.template.definitions[props.node.index] as TemplateRule : undefined)
const output = computed(() => props.node?.kind === 'output' ? props.template.outputs[props.node.index] : undefined)
const calculators=inject(metricCalculatorsKey,computed(()=>[]))
const aggregations=inject(metricAggregationsKey,computed(()=>[]))
const summary = computed(() => graphNodeSummary(props.template, props.node!, t,calculators.value,String(locale.value),aggregations.value))
const isStatistics=computed(()=>!!rule.value && calculationKind(rule.value)==='statistics')
const dependencies = computed(() => rule.value ? ruleDependencies(rule.value).map(id => {
  const node = nodeList(props.template).find(node => node.kind === 'input' ? props.template.inputDefinitions[node.index].id === id : node.kind === 'rule' && props.template.definitions[node.index].id === id)
  return { id, label:node ? nodeLabel(props.template,node) : id }
}) : [])
const stateLabels = computed(() => Array.isArray(rule.value?.options) ? [] : (rule.value?.options as { stateLabels?:MetricStateLabel[] } | undefined)?.stateLabels || [])
</script>
<style scoped>
.config-node { min-width:0; display:grid; gap:12px; font-size:12px; line-height:1.7 }
.config-node header { display:flex; align-items:center; gap:7px; min-height:28px }
.config-node header b { flex:1; min-width:0; overflow-wrap:anywhere; font-weight:500; font-size:14px }
.config-node header>span { color:var(--ink-3); font-size:11px }
.config-node p { margin:0; display:flex; align-items:baseline; gap:6px; color:var(--ink-2); flex-wrap:wrap }
.config-node p>.anticon { color:var(--ink-3) }
.config-node .config-node__warning { color:var(--warning, #bf871a) }
.config-node__source { display:flex; align-items:center; gap:8px; min-width:0; width:100%; border:1px solid var(--line); background:var(--panel-background); border-radius:var(--r-2,6px); color:var(--accent); padding:12px; text-align:left; cursor:pointer }
.config-node__source>.anticon { flex:none; width:16px; font-size:14px }
.config-node__source-copy { flex:1; min-width:0; overflow-wrap:anywhere }
.config-node__source-copy>span { display:block }
.config-node__source small { display:block; color:var(--ink-3); margin-top:4px }
.config-node__source:focus-visible { outline:2px solid var(--accent) }
.config-node__source:disabled { cursor:default }
.config-node .config-node__meaning { color:var(--ink-1); font-size:15px }
.config-node__dependencies button { border:0; border-radius:4px; padding:2px 6px; background:var(--accent-soft); color:var(--accent); font-size:12px; cursor:pointer }
.config-node__fixed,.config-node details { color:var(--ink-3); font-size:11px }
.config-node__states { display:flex; flex-wrap:wrap; gap:6px }
.config-node__states span { display:inline-flex; align-items:center; gap:4px; border-radius:4px; padding:2px 6px; background:var(--bg-sunken) }
.config-node code { font-size:11px; overflow-wrap:anywhere }
.config-node__condition { display:grid; gap:4px }
</style>
