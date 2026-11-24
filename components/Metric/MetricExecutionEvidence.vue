<template>
  <section class="metric-evidence">
    <header v-if="!inputId"><h4>{{ rule?.name || t('evidenceUsedData') }}</h4><strong v-if="!objectResult" class="metric-evidence__recorded" :title="t('executionRecordedResult')">{{ result }}</strong></header>
    <MetricValueFields v-if="objectResult && !inputId" class="metric-evidence__result" :value="value?.value" :schema="schema" />
    <div v-if="isCalculator && !inputId" class="metric-evidence__algorithm">
      <span v-if="calculator"><AIcon type="FunctionOutlined" />{{ calculator.name }}</span>
      <span v-for="group in calculatorParameters" :key="group.id"><small>{{ group.name }}</small><b v-for="(item,index) in group.values" :key="index">{{ reading(item,group.metricId).text }}</b></span>
    </div>
    <component :is="isCalculator ? 'details' : 'div'" v-if="rule && !inputId" class="metric-evidence__method">
      <summary v-if="isCalculator">{{ t('evidenceTemplateMethod') }}</summary>
      <TemplateFormulaDisplay v-if="formulaTree" :template="template" :rule="rule" :expression="method?.expression || ''" :calculators="calculators" :explanation="explanation" :format="explanationReading" @expanded-change="emit('expandedChange',$event)" />
      <template v-else-if="explanation"><ExpressionExplanation :explanation="explanation" :format="explanationReading" /></template>
      <template v-else-if="substitution">
        <h4>{{ t('executionSubstitution') }}</h4>
        <dl v-if="substitution.branches" class="metric-evidence__branches"><template v-for="(branch,index) in substitution.branches" :key="index"><dt><small>{{ t(branch.condition ? 'semanticWhen' : 'semanticOtherwise') }}</small> {{ branch.condition }}</dt><dd>{{ branch.value }}</dd></template></dl>
        <p v-else class="metric-evidence__formula">{{ substitution.text }}</p>
      </template>
      <template v-else><h4><AIcon :type="method?.icon || 'FunctionOutlined'" /> {{ t('executionMethod') }}</h4><TemplateWindowDescription v-if="isStatistics" :rule="rule" :catalog="aggregations" :source="windowSourceLabel(template,rule,t('sentenceList'))" /><TemplateFormulaDisplay v-if="method?.expression" :template="template" :rule="rule" :expression="method.expression" :calculators="calculators" /><p v-else-if="!isStatistics">{{ method?.text }}<small v-if="method?.detail"> · {{ method.detail }}</small></p><p v-if="method?.description && method.description !== method.text">{{ method.description }}</p></template>
    </component>
    <p v-if="!value?.evidence?.execution" class="metric-evidence__notice">{{ t('evidenceNotRecorded') }}</p>
    <p v-else-if="value.evidence.execution.truncated" class="metric-evidence__notice">{{ t('evidenceTruncated') }}</p>
    <component :is="inputId || isCalculator ? 'div' : 'details'" v-if="inputs.length || parameters.length" class="metric-evidence__data" :open="!explanation && !substitution">
      <summary v-if="!inputId && !isCalculator">{{ t('evidenceDataAndParameters') }}</summary>
    <div v-for="group in inputs" :key="group.id" class="metric-evidence__input">
      <div class="metric-evidence__identity"><strong><AIcon type="DatabaseOutlined" />{{ group.name }}</strong>
        <small v-if="group.input && group.input.count > 0">{{ t('evidenceSamples',{ count:group.input.count }) }}<template v-if="group.input.inputTimeEnd > 0"> · {{ t(group.input.count > 1 ? 'evidenceSourceTime' : 'evidenceDataTime') }} {{ time(group.input.inputTimeStart || group.input.inputTimeEnd) }}<template v-if="group.input.inputTimeStart > 0 && group.input.inputTimeStart !== group.input.inputTimeEnd"> — {{ time(group.input.inputTimeEnd) }}</template></template></small>
      </div>
      <div v-for="(item,index) in group.values" :key="`${item.path}:${index}`" class="metric-evidence__value">
        <span>{{ reading(item,group.metricId).label || t(group.input && group.input.count > 1 ? 'evidenceLastSample' : 'evidenceValue') }}<small v-if="item.state !== 'available'"> · {{ t(`evidenceInput_${item.state}`) }}</small></span><b>{{ reading(item,group.metricId).text }}</b>
      </div>
      <small v-if="!group.values.length">{{ t('evidenceValuesMissing') }}</small>
    </div>
    <component :is="isCalculator ? 'details' : 'div'" v-if="parameters.length && !inputId" class="metric-evidence__parameters">
      <summary v-if="isCalculator">{{ t('evidenceOtherParameters') }}</summary><h4 v-else>{{ t('evidenceParameters') }}</h4>
      <div v-for="group in parameters" :key="group.id"><div v-for="(item,index) in group.values" :key="index" class="metric-evidence__value"><span>{{ group.name }}<template v-if="reading(item,group.metricId).label"> / {{ reading(item,group.metricId).label }}</template></span><b>{{ reading(item,group.metricId).text }}</b></div></div>
    </component>
    <small v-if="value?.evidence?.execution" class="metric-evidence__hint">{{ t('evidenceSnapshotHint') }}</small>
    </component>
    <details v-if="!formulaTree && rule && !inputId && (explanation || substitution) && method?.expression" class="metric-evidence__original"><summary>{{ t('executionMethod') }}</summary><TemplateFormulaDisplay :template="template" :rule="rule" :expression="method.expression" :calculators="calculators" /></details>
    <div v-if="facts.length && !inputId" class="metric-evidence__facts"><h4>{{ t('evidenceAlgorithmFacts') }}</h4><p v-for="(fact,index) in facts" :key="index">{{ fact.text }}<template v-if="fact.amount != null"> · {{ fact.amount }}</template></p></div>
    <details v-if="!inputId && (value?.evidence?.contributions?.length || value?.evidence?.uncertainty)" class="metric-evidence__extra"><summary>{{ t('evidenceAlgorithmDetails') }}</summary>
      <div v-for="(item,index) in value.evidence.contributions || []" :key="index" class="metric-evidence__value"><span>{{ inputs.find(group=>group.id === item.inputId)?.name || item.inputId }}</span><b>{{ item.amount }}</b></div>
      <p v-if="value.evidence.uncertainty">{{ t('evidenceInterval') }} {{ value.evidence.uncertainty.lower }} – {{ value.evidence.uncertainty.upper }} · {{ value.evidence.uncertainty.method }}</p>
    </details>
  </section>
</template>
<script setup lang="ts">
import { computed, inject } from 'vue'
import ExpressionExplanation from '@jetlinks-web-core/components/Expression/ExpressionExplanation.vue'
import type { ExpressionExplanation as ExplanationNode } from '@jetlinks-web-core/components/Expression/types'
import { useI18n } from 'vue-i18n'
import { metricMessages } from './messages'
import MetricValueFields from './MetricValueFields.vue'
import { findCalculator } from './template/algorithm'
import { localizedTemplate } from './template/text'
import { evidenceGroups, evidenceValue } from './evidence'
import { metricDateText as time, metricDateFormat } from './time'
import { metricCalculatorsKey, metricAggregationsKey } from './calculatorContext'
import { executionFormula } from './template/formula/execution'
import { expressionToTree,formulaReferencePath,ruleFormulaReferences } from './template/formula'
import { graphNodeSummary } from './template/graphPresentation'
import { calculationKind } from './template/window'
import { windowSourceLabel } from './template/windowPresentation'
import TemplateWindowDescription from './template/TemplateWindowDescription.vue'
import { metricValueFields, metricValueLabels, metricValueSchema, metricValueUnit, schemaValueLabels, semanticValueText } from './valueSemantics'
import TemplateFormulaDisplay from './template/formula/TemplateFormulaDisplay.vue'
import type { TemplateRule } from './template/designer'
import type { MetricSnapshotValue, MetricTemplate, MetricTemplateOutput, MetricValue } from './types'
const props = defineProps<{ value?:MetricValue; template:MetricTemplate; output:MetricTemplateOutput; inputId?:string; explanation?:ExplanationNode }>()
const emit=defineEmits<{(event:'expandedChange',value:boolean):void}>()
const { t,locale } = useI18n({ useScope:'local',messages:metricMessages })
const template = computed(()=>localizedTemplate(props.template,String(locale.value)))
const calculators = inject(metricCalculatorsKey,computed(()=>[]))
const aggregations = inject(metricAggregationsKey,computed(()=>[]))
const ruleIndex = computed(()=>template.value.definitions.findIndex(item=>item.id === props.output.metricId || (item.windowFamily as {ranges?:{outputs?:{id:string}[]}[]} | undefined)?.ranges?.some(range=>range.outputs?.some(output=>output.id === props.output.metricId))))
const rule = computed(()=>template.value.definitions[ruleIndex.value] as TemplateRule | undefined)
const method = computed(()=>rule.value ? graphNodeSummary(template.value,{kind:'rule',index:ruleIndex.value},t,calculators.value,String(locale.value),aggregations.value) : undefined)
const isStatistics = computed(()=>!!rule.value && calculationKind(rule.value)==='statistics')
const isCalculator = computed(()=>!!rule.value?.calculator)
const calculator = computed(()=>findCalculator(rule.value?.calculator,calculators.value))
const schema = computed(()=>metricValueSchema(template.value,props.output.metricId,calculators.value))
const objectResult = computed(()=>props.value?.value != null && typeof props.value.value === 'object' && !Array.isArray(props.value.value))
const references = computed(()=>rule.value ? ruleFormulaReferences(template.value,rule.value,calculators.value,String(locale.value)) : [])
const formulaTree = computed(()=>rule.value && (rule.value.expressionTree || method.value?.expression && expressionToTree(method.value.expression,references.value)))
const substitution = computed(()=>rule.value && props.value?.evidence?.execution ? executionFormula(template.value,rule.value,props.value,calculators.value,t) : undefined)
const result = computed(()=>semanticValueText(props.value?.value,{labels:metricValueLabels(template.value,props.output.metricId),schema:metricValueSchema(template.value,props.output.metricId,calculators.value),unit:metricValueUnit(template.value,props.output.metricId,calculators.value),locale:String(locale.value)},t))
const inputs = computed(()=>evidenceGroups(props.value?.evidence,template.value,'input',props.output.metricId).filter(item=>!props.inputId || item.id === props.inputId))
const algorithmParameters = computed(()=>evidenceGroups(props.value?.evidence,template.value,'calculatorParameter',props.output.metricId,calculators.value))
const calculatorParameters = computed(()=>algorithmParameters.value.filter(group=>calculator.value?.parameterDefinitions.some(item=>item.id === group.id)))
const parameters = computed(()=>[...evidenceGroups(props.value?.evidence,template.value,'parameter',props.output.metricId),
  ...algorithmParameters.value.filter(group=>!calculatorParameters.value.includes(group)).map(group=>({...group,id:`calculator:${group.id}`}))])
const facts = computed(()=>props.value?.evidence?.facts?.filter(item=>item.text) || [])
const reading = (value:MetricSnapshotValue, id:string)=>evidenceValue(value,id,template.value,String(locale.value),t,calculators.value,props.output.metricId)
function explanationReading(node:ExplanationNode, relative?:ExplanationNode) {
  const path = node.kind === 'read' ? node.path : relative?.path || []
  // 编辑与回放共用引用类型，包括计算时间、输入区间、嵌套字段和枚举。
  const reference = references.value.find(item=>{
    const value=formulaReferencePath(item)
    return value.id === path[0] && JSON.stringify(value.path) === JSON.stringify(path.slice(1))
  })
  // 公式会计算毫秒差；未指定显示格式的日期保留毫秒，避免两端看似相同却产生非零差值。
  const referenceSchema = reference?.schema?.type === 'date'
    ? {...reference.schema,format:metricDateFormat(reference.schema.format) || 'YYYY-MM-DD HH:mm:ss.SSS'} : reference?.schema
  if (reference) return {label:node.kind === 'read' ? reference.label : undefined,
    text:node.state === 'unknown' ? t('evidenceValuesMissing') : semanticValueText(node.value,{schema:referenceSchema,unit:reference.unit,
      labels:schemaValueLabels(reference.schema),locale:String(locale.value)},t)}
  const parameter = path[0] === 'params' ? template.value.parameterDefinitions.find(item=>item.id === path[1]) : undefined
  const alias = ['metrics','metricValues'].includes(path[0]) ? path[1] : path[0]
  const id = rule.value?.inputs?.find(item=>item.id === alias)?.metricId || alias
  let name = parameter?.name || template.value.inputDefinitions.find(item=>item.id === id)?.name || template.value.definitions.find(item=>item.id === id)?.name || id
  let schema = parameter?.valueType || metricValueSchema(template.value,id,calculators.value)
  let unit = metricValueUnit(template.value,id,calculators.value)
  const fields = path.slice(parameter || ['metrics','metricValues'].includes(path[0]) ? 2 : 1).filter((key,index)=>!(path[0] === 'metricValues' && index === 0 && key === 'value'))
  for (const key of fields) {
    const field = metricValueFields({[key]:null},schema)[0]
    name = `${name} / ${field.name}`; schema = field.schema; unit = field.unit
  }
  const text = node.state === 'unknown' ? t('evidenceValuesMissing') : semanticValueText(node.value,{labels:fields.length ? schemaValueLabels(schema) : metricValueLabels(template.value,id),schema,unit,locale:String(locale.value)},t)
  return {label:node.kind === 'read' ? String(name || path.join('.')) : undefined,text}
}
</script>
<style scoped>
.metric-evidence { display:grid; gap:8px; min-width:0 }
.metric-evidence header { display:flex; align-items:baseline; justify-content:space-between; flex-wrap:wrap; gap:6px 12px }
.metric-evidence h4 { font-size:14px; font-weight:500; color:var(--ink-1); margin:0 }
.metric-evidence time,.metric-evidence small { font-size:12px; color:var(--ink-3); font-weight:400 }
.metric-evidence__notice { padding:10px 12px; margin:0; border-radius:6px; background:var(--bg-sunken); color:var(--ink-2); font-size:12px; line-height:1.7 }
.metric-evidence__input { padding:8px 0; min-width:0 }
.metric-evidence__input + .metric-evidence__input { border-top:1px solid var(--line) }
.metric-evidence__identity { display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 12px; margin-bottom:8px }
.metric-evidence__identity strong { display:flex; align-items:center; gap:6px; font-size:13px; font-weight:500; color:var(--ink-2) }
.metric-evidence__identity .anticon { color:var(--ink-3); font-size:12px }
.metric-evidence__value { display:flex; align-items:baseline; justify-content:space-between; gap:12px; padding:4px 0; font-size:13px; min-width:0 }
.metric-evidence__value > span { color:var(--ink-2); overflow-wrap:anywhere }
.metric-evidence__value > b { color:var(--ink-1); font-weight:500; text-align:right; overflow-wrap:anywhere; font-variant-numeric:tabular-nums }
.metric-evidence__parameters { border-top:1px solid var(--line); padding-top:8px }
.metric-evidence__parameters h4,.metric-evidence__facts h4 { font-size:12px; margin-bottom:6px; color:var(--ink-2) }
.metric-evidence__facts p,.metric-evidence__extra { font-size:12px; color:var(--ink-2); line-height:1.7; margin:0 }
.metric-evidence__extra summary { cursor:pointer }
.metric-evidence__hint { line-height:1.7 }
.metric-evidence__method { display:grid; gap:6px; min-width:0 }
.metric-evidence__method h4 { font-size:12px; color:var(--ink-3) }
.metric-evidence__method p { margin:0; font-size:13px; color:var(--ink-2); line-height:1.7; overflow-wrap:anywhere }
.metric-evidence__formula { white-space:pre-wrap; font-variant-numeric:tabular-nums }
.metric-evidence__formula > span { color:var(--ink-1); font-weight:500 }
.metric-evidence__recorded { color:var(--ink-1); font-size:15px; font-weight:500; overflow-wrap:anywhere; font-variant-numeric:tabular-nums }
.metric-evidence__data summary { cursor:pointer; color:var(--ink-3); font-size:12px; line-height:1.8 }
.metric-evidence__branches { display:grid; grid-template-columns:minmax(0,1fr) auto; margin:0; font-size:12px; color:var(--ink-2); line-height:1.7 }
.metric-evidence__branches dt,.metric-evidence__branches dd { border-bottom:1px solid var(--line); padding:6px 0; margin:0; overflow-wrap:anywhere }
.metric-evidence__branches dd { padding-left:12px; font-variant-numeric:tabular-nums; color:var(--ink-1) }
.metric-evidence__original summary { cursor:pointer; color:var(--ink-3); font-size:12px }
.metric-evidence__method summary,.metric-evidence__parameters summary { cursor:pointer; color:var(--ink-3); font-size:12px; line-height:1.8 }
.metric-evidence__result { margin-top:0 }
.metric-evidence__result :deep(.metric-value-fields__field>span) { font-size:14px; font-weight:500; font-variant-numeric:tabular-nums }
.metric-evidence__algorithm { display:flex; flex-wrap:wrap; gap:6px; font-size:12px; color:var(--ink-2) }
.metric-evidence__algorithm>span { display:inline-flex; align-items:baseline; gap:5px; border-radius:4px; background:var(--bg-sunken); padding:3px 7px }
.metric-evidence__algorithm .anticon { color:var(--ink-3); font-size:11px }
.metric-evidence__algorithm b { color:var(--ink-1); font-weight:500; font-variant-numeric:tabular-nums }
</style>
