<template>
  <a-spin :spinning="!!observation?.loading && !snapshot?.steps.length">
    <a-alert v-if="observation?.error" type="warning" show-icon :message="t('executionReadFailed')">
      <template #action><a-button size="small" @click="observation.refresh">{{ t('retry') }}</a-button></template>
    </a-alert>
    <div v-if="snapshot?.steps.length" class="metric-process">
      <TemplateGraph :template="template" :selected="chosen" :visible-nodes="visibleNodes" fit-content :overlay="{nodes:graph.nodes,edges:graph.edges,focus:focusKey}" @select="select" @background="clearSelection">
        <template #clock><div class="metric-process__tools">
        <slot name="selection"><time>{{ t('evidenceComputedAt') }} {{ time(snapshot.evaluationTime) }}</time></slot>
        <small v-if="snapshot.truncated">{{ t('executionIncomplete') }}</small>
        </div></template>
        <template #tools>
        <a-button v-if="unusedCount" type="text" size="small" :aria-expanded="showUnused" @click="showUnused = !showUnused"><AIcon :type="showUnused ? 'EyeInvisibleOutlined' : 'EyeOutlined'" />{{ t(showUnused ? 'executionHideUnused' : 'executionShowUnused',{count:unusedCount}) }}</a-button>
        <a-button type="text" size="small" :title="t('refresh')" :aria-label="t('refresh')" @click="observation?.refresh"><AIcon type="ReloadOutlined" /></a-button>
        </template>
        <template #node-summary="{node}">
          <b class="metric-process__reading">{{ reading(node) }}</b>
          <small>{{ caption(node) }}</small>
        </template>
        <template #node-action="{node}">
        <MetricNodeInspect v-if="canInspect(node)" :open="detailsKey === executionNodeKey(node)" :detail="{template,node,metricId:executionNodeMetric(template,node),step:graph.owners[executionNodeKey(node)],value:inspectionValue(node),reads:graph.reads[executionNodeKey(node)]}" @open-change="openDetails(node,$event)" @read="readKey = `${$event.step.id}:${$event.input.id}`" />
        </template>
      </TemplateGraph>
      <small class="metric-process__hint">{{ t('executionSelectNode') }}</small>
    </div>
    <template v-else-if="!observation?.loading && !observation?.error"><div class="metric-process__tools"><slot name="selection" /></div><MetricExecutionEvidence v-if="value?.evidence?.execution" :value="value" :template="template" :output="output" /><p v-else class="metric-process__loading">{{ t('executionRoundMissing') }}</p></template>
    <p v-else-if="observation?.loading" class="metric-process__loading">{{ t('executionLoading') }}</p>
  </a-spin>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MetricExecutionEvidence from './MetricExecutionEvidence.vue'
import MetricNodeInspect from './MetricNodeInspect.vue'
import TemplateGraph from './template/TemplateGraph.vue'
import { executionGraph, executionNodeKey, executionNodeMetric, executionReadForStep, distinctExecutionReads } from './execution'
import { metricMessages } from './messages'
import { localizedTemplate } from './template/text'
import { semanticValueText, metricValueLabels, metricValueUnit, metricValueSchema } from './valueSemantics'
import { metricDurationText, metricResultReference } from './presentation'
import { metricDateText as time } from './time'
import { nodeLabel, type TemplateNode } from './template/designer'
import type { MetricExecutionView, MetricTemplate, MetricTemplateOutput, MetricValue } from './types'
const props = defineProps<{observation?:MetricExecutionView;value?:MetricValue;template:MetricTemplate;output:MetricTemplateOutput}>()
const {t,locale} = useI18n({useScope:'local',messages:metricMessages})
const snapshot = computed(()=>metricResultReference(props.value) && metricResultReference(props.observation?.snapshot) === metricResultReference(props.value) ? props.observation?.snapshot : undefined)
const template = computed(()=>localizedTemplate(props.template,String(locale.value)))
const chosen = ref<TemplateNode>()
const detailsKey = ref<string>()
const readKey = ref<string>()
const showUnused = ref(false)
const graph = computed(()=>executionGraph(template.value,snapshot.value))
const participating = computed(()=>new Set(Object.entries(graph.value.nodes)
  .filter(([,state])=>state !== 'inactive').map(([key])=>key)))
const unusedCount = computed(()=>template.value.inputDefinitions.length + template.value.definitions.length + template.value.outputs.length - participating.value.size)
const visibleNodes = computed(()=>showUnused.value ? undefined : participating.value)
const outputMetric = computed(()=>chosen.value ? executionNodeMetric(template.value,chosen.value) : props.output.metricId)
const sourceReads = computed(()=>chosen.value?.kind === 'input' ? graph.value.reads[executionNodeKey(chosen.value)] || [] : [])
const selectedRead = computed(()=>sourceReads.value.length === 1 ? sourceReads.value[0] : sourceReads.value.find(read=>`${read.step.id}:${read.input.id}` === readKey.value))
const selectedStep = computed(()=>chosen.value && graph.value.nodes[executionNodeKey(chosen.value)] === 'done'
  && chosen.value.kind !== 'input' && graph.value.owners[executionNodeKey(chosen.value)]?.state !== 'skipped'
  ? graph.value.owners[executionNodeKey(chosen.value)] : undefined)
function inspectionValue(node:TemplateNode) {
  const step=graph.value.owners[executionNodeKey(node)],value=graph.value.values[executionNodeKey(node)]
  return node.kind === 'output' && value ? {...value,evidence:step?.value.evidence} : step?.value
}
const focusKey = computed(()=>{
  const step = selectedRead.value?.step
  const index = step && template.value.definitions.findIndex(item=>item.id === step.definitionId)
  return index !== undefined && index >= 0 ? `rule-${index}` : undefined
})
// 同模板的新轮次只替换事实；切换对象/输出由详情作用域隔离，不重建画布或重置视口。
watch([()=>props.template.id,()=>props.template.version,()=>props.output.metricId],()=>{showUnused.value=false;clearSelection()})
watch(()=>metricResultReference(snapshot.value),()=>{readKey.value=undefined})
function clearSelection() { chosen.value = undefined; readKey.value = undefined; detailsKey.value = undefined }
function select(node:TemplateNode) { chosen.value = node; readKey.value = undefined; detailsKey.value = undefined }
function canInspect(node:TemplateNode) {
  const key = executionNodeKey(node)
  return node.kind === 'input' ? !!graph.value.reads[key]?.length
    : graph.value.nodes[key] === 'done' && !!graph.value.owners[key] && graph.value.owners[key].state !== 'skipped'
}
// 浮层只消费当前已加载的快照；迟到的关闭事件不能关闭另一个节点。
function openDetails(node:TemplateNode, open:boolean) {
  const key = executionNodeKey(node)
  if (open) { if (detailsKey.value !== key) select(node); detailsKey.value = key }
  else if (detailsKey.value === key) detailsKey.value = undefined
}
function valueText(value:MetricValue,id:string) {
  const unit = value.unit || metricValueUnit(template.value,id)
  const text = semanticValueText(value.value,{labels:metricValueLabels(template.value,id),schema:metricValueSchema(template.value,id),unit,locale:String(locale.value)},t)
  return unit && value.value != null && metricDurationText(value.value,unit,t) === undefined ? `${text} ${unit}` : text
}
function focusedRead(node:TemplateNode) {
  const key = executionNodeKey(node)
  const step = selectedStep.value || selectedRead.value?.step
  return step ? executionReadForStep(graph.value.reads[key] || [],step) : undefined
}
function reading(node:TemplateNode) {
  const key = executionNodeKey(node)
  const read = focusedRead(node)
  const value = read?.value || graph.value.values[key]
  const id = executionNodeMetric(template.value,node)
  const count = distinctExecutionReads(graph.value.reads[key] || []).length
  return read ? valueText(read.value,id) : value ? valueText(value,id) : count > 1 ? t('executionMultipleReads',{count}) : '—'
}
function caption(node:TemplateNode) {
  const key = executionNodeKey(node), state = graph.value.nodes[key], owner = graph.value.owners[key]
  if (state === 'inactive' || state === 'incomplete') return t(state === 'inactive' ? 'executionUnused' : 'executionIncomplete')
  const read = focusedRead(node) || (node.kind === 'input' ? executionReadForStep(graph.value.reads[key] || []) : undefined)
  if (read) return read.value.eventTime ? `${t('evidenceDataTime')} ${time(read.value.eventTime)}` : t('executionRead')
  if (node.kind === 'input') return t('executionDifferentReads')
  return t(owner?.state === 'failed' ? 'calculationFailed' : owner?.state === 'produced' ? 'executionProduced' : owner?.state === 'skipped' ? 'executionRead' : 'executionNoOutput')
}
</script>
<style scoped>
.metric-process { display:grid; gap:4px; min-width:0 }
.metric-process__tools { display:flex; align-items:center; gap:4px; flex-wrap:wrap }
.metric-process__tools time { margin-right:4px; font-variant-numeric:tabular-nums }
.metric-process small,.metric-process time,.metric-process__loading { color:var(--ink-3); font-size:12px; line-height:1.7 }
.metric-process > .template-graph-shell { flex:none }
.metric-process__reading { font-size:15px; font-weight:500; overflow-wrap:anywhere; color:var(--ink-1); padding-right:24px; box-sizing:border-box; width:100% }
</style>
