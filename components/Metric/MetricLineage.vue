<template>
  <div class="metric-lineage-shell">
    <MetricExecutionProcess v-if="!definitionsOnly" :observation="observation" :value="value" :template="template" :output="output" />
    <MetricDisclosure class="metric-lineage-definition" :title="t('evidenceDefinition')" icon="BranchesOutlined">
    <small>{{ t('evidenceDefinitionHint') }}</small>
    <div class="metric-lineage">
    <section>
      <h4><AIcon type="ImportOutlined" /> {{ t('algorithmDataStage') }}</h4>
      <div v-for="node in sources" :key="node.key" class="metric-lineage__source">
        <AIcon type="DatabaseOutlined" /><div><strong>{{ node.label }}</strong><small :title="mappingDetail(node.index)">{{ sourceLabel(node.index) }}</small></div>
      </div>
      <small v-if="!sources.length">{{ t('noDeclaredSources') }}</small>
    </section>
    <section>
      <h4><AIcon type="FunctionOutlined" /> {{ t('algorithmProcessStage') }}</h4>
      <article v-for="node in rules" :key="node.key" class="metric-lineage__rule">
        <strong>{{ node.label }}</strong>
        <TemplateWindowDescription v-if="isStatistics(node)" :rule="rule(node.index)" :catalog="aggregations" :source="windowSourceLabel(template,rule(node.index),t('sentenceList'))" />
        <TemplateFormulaDisplay v-if="summary(node).expression" :template="template" :rule="rule(node.index)" :expression="summary(node).expression!" />
        <p v-else-if="!isStatistics(node)">{{ summary(node).text }}</p><small><AIcon :type="summary(node).detailIcon || 'ThunderboltOutlined'" /> {{ summary(node).detail }}</small>
        <p v-if="summary(node).condition" class="metric-lineage__condition">{{ t('applicability') }} {{ summary(node).condition }}</p>
      </article>
      <small v-if="!rules.length">{{ t('noDependencies') }}</small>
    </section>
    <section>
      <h4><AIcon type="ExportOutlined" /> {{ t('algorithmResultStage') }}</h4>
      <strong>{{ metricOutputName(output, template) || t('unnamedOutput') }}</strong>
      <div class="metric-lineage__uses"><span v-if="output.persist"><AIcon type="HistoryOutlined" /> {{ t('outputHistory') }}</span><span v-if="output.publish"><AIcon type="SendOutlined" /> {{ t('outputEvents') }}</span></div>
    </section>
    </div>
    </MetricDisclosure>
  </div>
</template>
<script setup lang="ts">
import { computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { metricMessages } from './messages'
import { metricOutputName } from './presentation'
import { templateGraph, type TemplateNode, type TemplateRule } from './template/designer'
import { graphNodeSummary } from './template/graphPresentation'
import { calculationKind } from './template/window'
import { windowSourceLabel } from './template/windowPresentation'
import TemplateWindowDescription from './template/TemplateWindowDescription.vue'
import { metricCalculatorsKey, metricAggregationsKey } from './calculatorContext'
import TemplateFormulaDisplay from './template/formula/TemplateFormulaDisplay.vue'
import MetricExecutionProcess from './MetricExecutionProcess.vue'
import MetricDisclosure from './MetricDisclosure.vue'
import type { MetricConfig, MetricContext, MetricExecutionView, MetricTemplate, MetricTemplateOutput, MetricValue } from './types'
const props = defineProps<{ configuration: MetricConfig; template: MetricTemplate; output: MetricTemplateOutput; context?: MetricContext; value?:MetricValue; observation?:MetricExecutionView; definitionsOnly?:boolean }>()
const { t,locale } = useI18n({ useScope: 'local', messages: metricMessages })
const calculators=inject(metricCalculatorsKey,computed(()=>[]))
const aggregations=inject(metricAggregationsKey,computed(()=>[]))
/** 只沿已声明依赖反向展开，不把模板中的其他输入或未查询的下游当成当前输出的引用。 */
const ancestors = computed(() => {
  const graph = templateGraph(props.template)
  const target = graph.nodes.find(node => node.kind === 'output' && props.template.outputs[node.index].metricId === props.output.metricId)
  const incoming = new Map<string, string[]>()
  for (const edge of graph.edges) incoming.set(edge.target, [...(incoming.get(edge.target) || []), edge.source])
  const visited = new Set<string>(), pending = target ? [target.key] : []
  while (pending.length) { const key = pending.pop()!; if (!visited.has(key)) { visited.add(key); pending.push(...(incoming.get(key) || [])) } }
  return graph.nodes.filter(node => visited.has(node.key))
})
const sources = computed(() => ancestors.value.filter(node => node.kind === 'input'))
const rules = computed(() => ancestors.value.filter(node => node.kind === 'rule'))
const summaries = computed(() => new Map(rules.value.map(node => [node.key, graphNodeSummary(props.template, node, t,calculators.value,String(locale.value),aggregations.value)])))
const rule = (index: number) => props.template.definitions[index] as TemplateRule
const isStatistics=(node:TemplateNode)=>calculationKind(rule(node.index)) === 'statistics'
const summary = (node: TemplateNode) => summaries.value.get(`${node.kind}-${node.index}`)!
function mappingDetail(index: number) {
  const mapping = props.configuration.inputMappings[props.template.inputDefinitions[index].id]
  return mapping ? [mapping.thingId || (props.configuration.scope === 'children' ? props.context?.ownerId || t('currentMember') : mapping.ruleId), mapping.id].filter(Boolean).join(' / ') : t('notBound')
}
function sourceLabel(index: number) {
  const mapping = props.configuration.inputMappings[props.template.inputDefinitions[index].id]
  if (!mapping) return t('notBound')
  const own = props.configuration.scope === 'children' && !mapping.thingId || mapping.thingId === props.configuration.targetId || mapping.thingId === props.context?.ownerId
  return own && props.context?.label ? `${props.context.label} / ${props.template.inputDefinitions[index].name || mapping.id}` : mappingDetail(index)
}
</script>
<style scoped>
.metric-lineage-shell { display:grid; gap:20px; min-width:0 }
.metric-lineage-definition :deep(.metric-disclosure__content > small) { display:block; margin:0 0 12px; color:var(--ink-3); font-size:12px }
.metric-lineage { display:grid; gap:var(--space-5,20px); padding-left:22px; border-left:1px solid var(--line); margin-left:8px }
.metric-lineage section { position:relative; min-width:0 }
.metric-lineage section::before { position:absolute; content:''; top:7px; left:-27px; width:8px; height:8px; border:2px solid var(--accent); background:var(--panel-background); border-radius:50% }
.metric-lineage h4 { font-size:var(--fs-12,12px); font-weight:400; color:var(--ink-2); margin:0 0 12px; display:flex; gap:6px; align-items:center }
.metric-lineage__source { display:flex; gap:10px; align-items:center; background:var(--bg-sunken); border:1px solid var(--line); border-radius:var(--r-2,6px); padding:10px 12px; margin-top:8px }
.metric-lineage__source > .anticon { color:var(--accent) }
.metric-lineage__source div { min-width:0 }
.metric-lineage strong { display:block; font-size:var(--fs-14,14px); font-weight:500; overflow-wrap:anywhere }
.metric-lineage small { display:block; font-size:var(--fs-12,12px); color:var(--ink-2); margin-top:4px; overflow-wrap:anywhere }
.metric-lineage__rule + .metric-lineage__rule { border-top:1px solid var(--line); padding-top:14px; margin-top:14px }
.metric-lineage p { font-size:var(--fs-14,14px); line-height:1.8; margin:8px 0; overflow-wrap:anywhere }
.metric-lineage__condition,.metric-lineage__uses { color:var(--ink-2); font-size:var(--fs-12,12px) }
.metric-lineage__uses { display:flex; flex-wrap:wrap; gap:16px; margin-top:12px }
</style>
