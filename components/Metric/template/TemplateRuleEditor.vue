<template>
  <div class="rule-editor">
    <TemplateClause stacked :icon="methodIcon" :title="t(kind)">
    <template #title><slot name="method">{{ t(kind) }}</slot></template>
    <template v-if="kind === 'statistics'">
      <TemplateWindowEditor :rule="rule" :disabled="disabled" @patch="emit('patch', $event)">
        <template #source><TemplateReference :metric-id="rule.sourceMetric || ruleDependencies(rule)[0]"><Editable class="rule-editor__inline-source" type="select" :value="rule.sourceMetric || ruleDependencies(rule)[0]" :component-props="{ disabled, bordered:false, defaultOpen:true, options:referenceOptions, 'aria-label':t('statisticSource'), placeholder:t('chooseSource'), dropdownMatchSelectWidth:false }" @change="setStatisticSource($event as string)" /></TemplateReference></template>
      </TemplateWindowEditor>
    </template>
    <template v-else-if="kind === 'expression'">
      <TemplateFormulaEditor :model-value="rule.expression || ''" :tree="rule.expressionTree" :references="formulaReferences" :result-labels="resultLabels" :disabled="disabled"
        @change="updateFormula" @invalid="setFormulaInvalid" />
    </template>
    <template v-else-if="kind === 'temporal'">
      <section v-for="phase in temporalPhases" :key="phase.field" class="rule-editor__phase">
        <div class="rule-editor__phase-title"><AIcon :type="phase.icon" /><span>{{ t('sentenceWhen') }}</span><small>{{ t(phase.label) }}</small><a-button v-if="!disabled" type="text" size="small" :aria-label="`${t('editCondition')} · ${t(phase.label)}`" :aria-expanded="editingPhase === phase.field" :disabled="invalidConditions.size > 0" @click="editingPhase = editingPhase === phase.field ? undefined : phase.field">{{ t(editingPhase === phase.field ? 'collapseEditor' : 'editCondition') }}</a-button></div>
        <TemplateFormulaEditor v-if="editingPhase === phase.field" :model-value="rule.temporalCondition?.[phase.field] || ''" :tree="phase.field === 'enterExpression' ? rule.temporalCondition?.enterTree : rule.temporalCondition?.exitTree" :references="formulaReferences" :disabled="disabled" conditions @change="updateCondition(phase.field, $event)" @invalid="setConditionInvalid(phase.key, $event)" />
        <div v-else class="rule-editor__phase-summary"><TemplateFormulaDisplay v-if="ruleExpression(rule,phase.field).trim()" :template="displayTemplate" :rule="rule" :expression="ruleExpression(rule,phase.field)" :calculators="calculators" compact /><span v-else class="rule-editor__muted">{{ t('notConfigured') }}</span></div>
        <div class="rule-editor__timing"><span>{{ t('conditionHeldFor') }}</span><TemplateDuration :model-value="rule.temporalCondition?.[phase.duration]" :disabled="disabled" @update:model-value="temporal(phase.duration, $event)" /><span>{{ t(phase.result) }}{{ t('sentenceEnd') }}</span></div>
      </section>
      <div class="rule-editor__timing"><AIcon type="DisconnectOutlined" /><span>{{ t(rule.temporalCondition?.maxNoData ? 'sentenceNoDataFor' : 'maxNoData') }}</span><TemplateDuration :model-value="rule.temporalCondition?.maxNoData" :min="0.001" :empty-label="t('requiredDuration')" :disabled="disabled" @update:model-value="temporal('maxNoData', $event)" /><span v-if="rule.temporalCondition?.maxNoData">{{ t('sentenceInterrupted') }}{{ t('sentenceEnd') }}</span></div>
      <small v-if="!rule.temporalCondition?.maxNoData">{{ t('noDataTimeoutRequired') }}</small>
    </template>
    <TemplateAlgorithmEditor v-else :template="template" :rule="rule" :disabled="disabled" :calculators="calculators"
      @patch="emit('patch', $event)" @invalid="setCalculatorInvalid" />
    </TemplateClause>
    <TemplateStateTracking v-if="kind === 'expression' || booleanResult || resultLabels.length" :rule="rule" :boolean-result="booleanResult" :labels-only="kind !== 'expression'" :disabled="disabled" @patch="emit('patch', $event)" />
    <section class="rule-editor__execution" :aria-label="t('calculationTrigger')">
    <h4><AIcon type="ClockCircleOutlined" />{{ t('calculationTrigger') }}</h4>
    <div v-if="kind !== 'statistics' && !rule.windowFamily && (!rule.window?.mode || rule.window.mode === 'none')" class="rule-editor__timing">
      <Editable class="rule-editor__trigger" type="select" :value="rule.window?.emitPolicy || 'onEvent'" :component-props="{ disabled, bordered:false, defaultOpen:true, 'aria-label':t('calculationTrigger'), options:timings }" @change="changeTiming($event as 'onEvent' | 'onSchedule')">{{ t(rule.window?.emitPolicy === 'onSchedule' ? 'calculateEvery' : 'calculateOnEvent') }}</Editable>
      <TemplateDuration v-if="rule.window?.emitPolicy === 'onSchedule'" :model-value="rule.window.emitInterval" :min="1" :disabled="disabled" @update:model-value="emit('patch', { window: { ...rule.window, emitInterval: $event } })" />
      <span v-if="rule.window?.emitPolicy === 'onSchedule' && t('scheduleSuffix')">{{ t('scheduleSuffix') }}</span>
    </div>
    <p v-else class="rule-editor__timing">{{ ruleTriggerSummary(rule,t) }}</p>
    <small>{{ t(rule.window?.emitPolicy === 'onSchedule' ? 'scheduledCalculationHint' : rule.window?.emitPolicy === 'onWindowClose' ? 'windowCloseCalculationHint' : 'dependencyCalculationHint') }}</small>
    </section>
    <section class="rule-editor__condition" :aria-label="t('applicability')">
      <h4><AIcon type="FilterOutlined" />{{ t('applicability') }}</h4>
      <div class="rule-editor__condition-summary">
        <span v-if="!hasCondition" class="rule-editor__muted">{{ t('noExtraCondition') }}</span>
        <template v-else><span>{{ t('calculateOnlyWhen') }}</span><TemplateFormulaDisplay class="rule-editor__condition-formula" :template="displayTemplate" :rule="rule" :expression="ruleExpression(rule,'applicabilityExpression')" :calculators="calculators" compact /><span>{{ t('thenCalculate') }}</span></template>
        <a-button v-if="hasCondition || !disabled" type="text" size="small" :disabled="invalidConditions.has('applicability')" :aria-expanded="conditionEditing" @click="conditionEditing = !conditionEditing"><AIcon v-if="!hasCondition && !conditionEditing" type="PlusOutlined" />{{ t(conditionEditing ? 'collapseEditor' : hasCondition ? disabled ? 'review' : 'editCondition' : 'addCondition') }}</a-button>
      </div>
      <div v-if="conditionEditing" class="rule-editor__condition-body">
        <TemplateFormulaEditor :model-value="rule.applicabilityExpression || ''" :tree="rule.applicabilityTree" :references="formulaReferences" :disabled="disabled" conditions @change="updateCondition('applicabilityExpression', $event)" @invalid="setConditionInvalid('applicability', $event)" />
        <a-button v-if="!disabled" type="text" size="small" :disabled="!hasCondition && !invalidConditions.has('applicability')" @click="clearCondition">{{ t('clearCondition') }}</a-button>
      </div>
    </section>
    <details class="rule-editor__requirements">
      <summary><AIcon type="SettingOutlined" />{{ t('moreSettings') }}<small v-if="rule.maxInputSkew"> · {{ t('inputSkewSummary', { duration: simulationDuration(rule.maxInputSkew, t) }) }}</small></summary>
      <TemplateClause icon="SwapOutlined" :title="t('maxInputSkew')"><TemplateDuration :model-value="rule.maxInputSkew" :disabled="disabled" @update:model-value="emit('patch', { maxInputSkew: $event })" /></TemplateClause>
      <div class="rule-editor__dependencies"><AIcon type="BranchesOutlined" /><span><template v-if="dependencyLabels"><TemplateReference v-for="(id,index) in ruleDependencies(rule)" :key="id" :metric-id="id">{{ index ? '、' : '' }}{{ references.find(item => item.id === id)?.label || id }}</TemplateReference></template><template v-else>{{ t('noDependencies') }}</template></span><a-button v-if="!disabled" type="text" size="small" :aria-label="t('dependencies')" :aria-expanded="dependenciesEditing" @click="dependenciesEditing = !dependenciesEditing">{{ t(dependenciesEditing ? 'collapseEditor' : dependencyLabels ? 'adjustDependencies' : 'addDependencies') }}</a-button></div>
      <a-select v-if="dependenciesEditing" class="rule-editor__source" mode="tags" :value="ruleDependencies(rule)" :disabled="disabled" :bordered="false" :aria-label="t('dependencies')" :options="referenceOptions" option-filter-prop="label" @update:value="updateDependencies"><template #option="option"><TemplateReference :metric-id="option.value"><SelectOption :label="option.label" :icon="option.icon || 'BranchesOutlined'" :description="option.description || String(option.value)" /></TemplateReference></template></a-select>
    </details>
  </div>
</template>
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ruleDependencies, ruleExpression, type TemplateRule } from './designer'
import type {StructuredExpression} from '@jetlinks-web-core/components/Expression/types'
import { ruleDataReferences, ruleFormulaReferences } from './formula'
import TemplateFormulaEditor from './TemplateFormulaEditor.vue'
import TemplateAlgorithmEditor from './TemplateAlgorithmEditor.vue'
import TemplateDuration from './TemplateDuration.vue'
import TemplateStateTracking from './TemplateStateTracking.vue'
import TemplateWindowEditor from './TemplateWindowEditor.vue'
import TemplateClause from './TemplateClause.vue'
import Editable from '@jetlinks-web-core/components/Editable/index.vue'
import SelectOption from '@jetlinks-web-core/components/SelectOption/index.vue'
import { referenceChoice } from './choices'
import TemplateFormulaDisplay from './formula/TemplateFormulaDisplay.vue'
import TemplateReference from './TemplateReference.vue'
import { simulationDuration } from './simulationFlow'
import { localizedTemplate } from './text'
import { calculationKind } from './window'
import { metricMessages } from '../messages'
import { metricValueLabels, metricValueSchema } from '../valueSemantics'
import { ruleTriggerIcon, ruleTriggerSummary } from './graphPresentation'
import type { MetricCalculatorDescriptor, MetricTemplate } from '../types'
const props = defineProps<{ template: MetricTemplate; rule: TemplateRule; disabled?: boolean; calculators?: MetricCalculatorDescriptor[] }>()
const emit = defineEmits<{ (event: 'patch', fields: Partial<TemplateRule>): void; (event: 'invalid', value: boolean): void }>()
const { t, locale } = useI18n({ useScope: 'local', messages: metricMessages })
const kind = computed(() => calculationKind(props.rule))
const booleanResult = computed(() => kind.value === 'temporal' || metricValueSchema(props.template,props.rule.id || '',props.calculators)?.type === 'boolean')
const methodIcon=computed(()=>({expression:'FunctionOutlined',statistics:'BarChartOutlined',temporal:'ClockCircleOutlined',calculator:'CalculatorOutlined'})[kind.value])
const temporalPhases = [
  { key: 'enter', field: 'enterExpression', duration: 'dwell', icon: 'ThunderboltOutlined', label: 'enterCondition', result: 'conditionBecomesTrue' },
  { key: 'exit', field: 'exitExpression', duration: 'recovery', icon: 'CheckCircleOutlined', label: 'exitCondition', result: 'thenRecover' },
] as const
const timings = computed(() => [{ value:'onEvent', label:t('calculateOnEvent'), icon:ruleTriggerIcon({window:{emitPolicy:'onEvent'}}), description:t('onEventHint') }, { value:'onSchedule', label:t('calculateEvery'), icon:ruleTriggerIcon({window:{emitPolicy:'onSchedule'}}), description:t('onScheduleHint') }])
const displayTemplate = computed(() => localizedTemplate(props.template, String(locale.value)))
const resultLabels = computed(() => metricValueLabels(displayTemplate.value,props.rule.id || '').map(item=>({value:item.value,label:item.name})))
const references = computed(() => ruleDataReferences(displayTemplate.value, props.rule))
const referenceOptions = computed(() => references.value.map(item => referenceChoice(displayTemplate.value, item, t)))
const calculatorInvalid = ref(false)
const formulaInvalid = ref(false)
const invalidConditions = reactive(new Set<string>())
const editingPhase = ref<'enterExpression' | 'exitExpression' | undefined>(kind.value === 'temporal' && !ruleExpression(props.rule,'enterExpression').trim() ? 'enterExpression' : undefined)
const conditionEditing = ref(false)
const dependenciesEditing = ref(false)
const hasCondition = computed(() => !!ruleExpression(props.rule,'applicabilityExpression').trim())
const dependencyLabels = computed(() => ruleDependencies(props.rule).map(id => references.value.find(item => item.id === id)?.label || id).join('、'))
const formulaReferences = computed(() => ruleFormulaReferences(displayTemplate.value, props.rule, props.calculators,String(locale.value)))
function reportInvalid() { emit('invalid', formulaInvalid.value || calculatorInvalid.value || invalidConditions.size > 0) }
function setCalculatorInvalid(value: boolean) { calculatorInvalid.value = value; reportInvalid() }
function setFormulaInvalid(value: boolean) { formulaInvalid.value = value; reportInvalid() }
function setConditionInvalid(key: string, value: boolean) { if (value) invalidConditions.add(key); else invalidConditions.delete(key); reportInvalid() }
// 更换方式会移除原计算内容，其草稿校验不能继续锁住新方式；共用适用条件仍须保留校验。
watch(kind, () => {
  formulaInvalid.value = false
  calculatorInvalid.value = false
  invalidConditions.delete('enter')
  invalidConditions.delete('exit')
  editingPhase.value = kind.value === 'temporal' && !ruleExpression(props.rule,'enterExpression').trim() ? 'enterExpression' : undefined
  reportInvalid()
}, { flush: 'sync' })
function clearCondition() {
  if (props.disabled) return
  setConditionInvalid('applicability', false)
  updateCondition('applicabilityExpression', { expression: '' })
  conditionEditing.value = false
}
function dependencyFields(ids: string[]): Partial<TemplateRule> {
  if (!props.rule.inputs?.length) return { dependsOn: ids }
  const inputs = props.rule.inputs.filter(item => item.source || ids.includes(item.metricId || ''))
  for (const id of ids) if (!inputs.some(item => !item.source && item.metricId === id)) inputs.push({ id, metricId: id })
  return { sourceMetric: undefined, dependsOn: inputs.filter(item => !item.source).map(item => item.metricId!), inputs }
}
function updateFormula(value: { expression: string; expressionTree?:StructuredExpression; metricIds?: string[] }) {
  if (props.disabled) return
  const fields = value.metricIds ? dependencyFields([...new Set([...ruleDependencies(props.rule), ...value.metricIds])]) : {}
  emit('patch', { ...fields, expression: value.expressionTree ? undefined : value.expression, expressionTree:value.expressionTree })
}
function updateDependencies(ids: string[]) { if (!props.disabled) emit('patch', dependencyFields(ids)) }
function temporal(field: string, value: unknown) { if (!props.disabled) emit('patch', { temporalCondition: { ...props.rule.temporalCondition, [field]: value } }) }
/** 条件复用公式的输入别名和参数路径；补齐依赖，不改变后端表达式语义。 */
function updateCondition(field: 'enterExpression' | 'exitExpression' | 'applicabilityExpression', value: { expression: string; expressionTree?:StructuredExpression; metricIds?: string[] }) {
  if (props.disabled) return
  const fields = value.metricIds ? dependencyFields([...new Set([...ruleDependencies(props.rule), ...value.metricIds])]) : {}
  emit('patch', { ...fields, ...(field === 'applicabilityExpression'
    ? { applicabilityExpression: value.expressionTree ? undefined : value.expression || undefined,applicabilityTree:value.expressionTree }
    : { temporalCondition: { ...props.rule.temporalCondition, [field]: value.expressionTree ? undefined : value.expression,[field === 'enterExpression' ? 'enterTree' : 'exitTree']:value.expressionTree } }) })
}
function setStatisticSource(id: string) { if (!props.disabled) emit('patch', { ...dependencyFields([id]), sourceMetric: id }) }
function changeTiming(value: 'onEvent' | 'onSchedule') {
  if (props.disabled) return
  // 算法随数据运行时不传 window，避免 mode=none/onEvent 触发后端互斥校验。
  const window = value === 'onEvent' && props.rule.calculator ? undefined : { ...props.rule.window, mode: 'none' as const, emitPolicy: value, emitInterval: value === 'onSchedule' ? props.rule.window?.emitInterval || 'PT5M' : undefined }
  emit('patch', { window })
}
</script>
<style scoped>
.rule-editor :deep(.template-clause__content)>.ant-select { width:168px; max-width:100% }
.rule-editor :deep(.template-clause__content)>.rule-editor__source { width:100%; min-width:0 }
.rule-editor__source { width:100%; min-width:0 }
.rule-editor__inline-source { min-width:80px; max-width:180px; color:var(--accent) }
.rule-editor__phase-title > :first-child { color:var(--ink-3) }
.rule-editor__phase + .rule-editor__phase { margin-top:16px }
.rule-editor__phase-title { display:flex; align-items:center; gap:8px; margin-bottom:8px; font-size:13px }
.rule-editor__phase-title small { margin-left:auto; color:var(--ink-3); font-size:12px }
.rule-editor__phase-title > .ant-btn { margin-left:auto; padding:0 }
.rule-editor__phase-summary { min-width:0; line-height:1.8 }
.rule-editor__timing { display:flex; align-items:center; gap:var(--space-2,8px); flex-wrap:wrap; margin:var(--space-3,12px) 0 }
.rule-editor__timing > .rule-editor__trigger { width:auto; flex:0 1 auto; max-width:100%; color:var(--accent) }
.rule-editor__timing > .anticon,.rule-editor__condition-summary > :first-child,.rule-editor__dependencies > :first-child { color:var(--ink-3); flex:none }
.rule-editor__execution,.rule-editor__condition { margin:0 0 16px; padding:0 }
.rule-editor h4 { display:flex; align-items:center; gap:8px; min-height:32px; margin:0 0 8px; font-size:13px; font-weight:500 }
.rule-editor h4 > .anticon { width:16px; color:var(--ink-3) }
.rule-editor :deep(.template-formula .formula-editor__symbol) { display:none }
.rule-editor__execution .rule-editor__timing { margin:6px 0 }
.rule-editor__execution > small { display:block; color:var(--ink-3); font-size:12px; line-height:1.6 }
.rule-editor__condition-summary { display:flex; align-items:center; flex-wrap:wrap; gap:6px; min-width:0; min-height:32px; font-size:13px }
.rule-editor__condition-summary > span { flex:none }
.rule-editor__condition-summary > .rule-editor__condition-formula { flex:0 1 auto; min-width:0; max-width:100%; overflow:hidden }
.rule-editor__condition-summary > .ant-btn { flex:none; margin-left:auto; color:var(--ink-3); font-size:12px }
.rule-editor__condition-body { padding-top:8px }
.rule-editor__muted { color:var(--ink-3) }
.rule-editor__requirements { margin-top:16px; font-size:13px }
.rule-editor__requirements > summary { display:flex; align-items:center; gap:8px; padding:8px 0; color:var(--ink-3); cursor:pointer }
.rule-editor__requirements > summary small { font-size:12px }
.rule-editor__dependencies { display:flex; align-items:center; gap:8px; min-height:32px }
.rule-editor__dependencies > span { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.rule-editor__dependencies > .ant-btn { flex:none; font-size:12px; color:var(--ink-3) }
</style>
