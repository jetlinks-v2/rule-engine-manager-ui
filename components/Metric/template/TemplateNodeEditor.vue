<template>
  <div class="node-editor">
    <header class="node-editor__identity">
      <I18nTextEditable class="node-editor__name" size="small" :value="name" :placeholder="displayName" :field="nameKey" :label="t('label')" :i18n-messages="templateMessages(template)" :disabled="disabled"
        @update:value="emit('patch', { [node.kind === 'output' ? 'label' : 'name']: $event })" @update:i18n-messages="emit('messages', $event)" />
      <Editable v-if="node.kind === 'input'" class="node-editor__id" :value="declarationId" :component-props="{ disabled:disabled || published, bordered:false, 'aria-label':t('declarationId') }" @change="changeInputId(String($event ?? '').trim())" />
      <small v-else class="node-editor__id" :title="declarationId" :aria-label="t('declarationId')">{{ declarationId }}</small>
      <p v-if="identityIssue" class="node-editor__identity-error" role="alert">{{ t(identityIssue) }}</p>
      <div v-if="node.kind === 'input' && $slots['input-reference']" class="node-editor__reference"><slot name="input-reference" /></div>
    </header>
    <a-alert v-if="pendingKind" class="node-editor__confirmation" type="warning" show-icon :message="t('calculationChangeConfirm', { method:t(pendingKind) })">
      <template #description><a-space><a-button size="small" :disabled="disabled" @click="pendingKind && changeKind(pendingKind, true)">{{ t('changeCalculation') }}</a-button><a-button size="small" @click="pendingKind = undefined">{{ t('cancel') }}</a-button></a-space></template>
    </a-alert>
    <TemplateRuleEditor v-if="node.kind === 'rule'" :template="template" :rule="rule" :disabled="disabled" :calculators="calculators" @patch="emit('patch', $event)" @invalid="emit('invalid', $event)">
      <template #method>
      <div class="node-editor__method">
        <a-dropdown :trigger="['click']" :disabled="disabled">
          <a-button type="text" :disabled="disabled" :aria-label="t('calculationMethod')">{{ t(kind) }}<AIcon type="DownOutlined" /></a-button>
          <template #overlay>
            <a-menu class="node-editor__methods" :selected-keys="[kind]" :aria-label="t('calculationMethod')" @click="chooseKind">
              <a-menu-item v-for="option in methods" :key="option.value" class="node-editor__method-item" :class="{ 'is-current':option.value === kind }" role="menuitemradio" :aria-checked="option.value === kind">
                <div class="node-editor__method-option">
                  <SelectOption :icon="option.icon" :label="option.label" :description="option.description" />
                  <span class="node-editor__method-check" aria-hidden="true"><AIcon v-if="option.value === kind" type="CheckOutlined" /></span>
                </div>
              </a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </div>
      </template>
    </TemplateRuleEditor>
    <TemplateInputEditor v-if="node.kind === 'input'" :input="input" :template="displayTemplate" :disabled="disabled" :published="published" @patch="emit('patch', $event)" @invalid="inputInvalid = $event" />
    <template v-else-if="node.kind === 'output'">
      <TemplateClause stacked icon="ExportOutlined" :title="t('outputFrom')">
      <div class="node-editor__output-source">
        <span>{{ t('outputTake') }}</span>
        <TemplateReference :metric-id="output.metricId" locatable>
          <AIcon :type="sourceSummary?.icon || 'ExportOutlined'" />
          <Editable class="node-editor__output-choice" type="select" :value="output.metricId" :component-props="{ options:sources, disabled:disabled || published, bordered:false, defaultOpen:true, dropdownMatchSelectWidth:false, 'aria-label':t('outputFrom') }" @change="emit('patch', { metricId:$event })" />
        </TemplateReference>
        <span>{{ t('outputAs') }}{{ t('sentenceEnd') }}</span>
      </div>
      <div v-if="sourceNode && sourceSummary" class="node-editor__output-meaning">
        <TemplateFormulaDisplay v-if="sourceSummary.expression && sourceNode.kind === 'rule'" :template="displayTemplate" :rule="template.definitions[sourceNode.index] as TemplateRule" :expression="sourceSummary.expression" :calculators="calculators" />
        <span v-else>{{ sourceSummary.text }}</span>
        <small>{{ sourceSummary.detail }}</small>
      </div>
      </TemplateClause>
      <TemplateClause stacked icon="TagOutlined" :title="t('outputDataType')">
      <section class="node-editor__output-schema">
        <Editable class="node-editor__output-type" type="select" :value="output.valueType" :component-props="{ disabled:disabled || published, bordered:false, defaultOpen:true, allowClear:true, placeholder:t('inputChooseType'), 'aria-label':t('outputDataType'), options:types }" @change="emit('patch', { valueType:$event || undefined })" />
        <TemplateClause icon="FontSizeOutlined" :title="t('unit')"><Editable class="node-editor__unit-value" :value="output.unit" :component-props="{ disabled:disabled || published, bordered:false, placeholder:t('noUnit'), 'aria-label':t('unit') }" @change="emit('patch', { unit:$event || undefined })" /></TemplateClause>
      </section>
      </TemplateClause>
      <TemplateClause stacked icon="SendOutlined" :title="t('outputUseFor')">
      <div class="node-editor__output-uses">
        <button type="button" :class="{ enabled:output.publish === true }" :disabled="disabled" :aria-pressed="output.publish === true" @click="toggleOutput('publish')"><AIcon type="SendOutlined" />{{ t('outputEvents') }}<AIcon v-if="output.publish === true" type="CheckOutlined" /></button>
      </div>
      </TemplateClause>
      <HistoryRecordingEditor :output="output" :disabled="disabled || published" @patch="emit('patch', $event)" />
      <details :open="outputInvalid"><summary><AIcon type="SettingOutlined" />{{ t('moreSettings') }}</summary>
      <ReadAggregationEditor :output="output" :disabled="disabled || published" @patch="emit('patch', $event)" @invalid="setOutputInvalid" />
      <TemplateClause icon="ProfileOutlined" :title="t('evidenceRecord')" :hint="t('evidenceRecordHint')">
        <a-switch :checked="output.options?.explain === true" :disabled="disabled" :aria-label="t('evidenceRecord')" @change="emit('patch', { options:{ ...output.options, explain:$event } })" />
      </TemplateClause>
        <TemplateClause icon="NumberOutlined" :title="t('property')"><Editable class="node-editor__source" :value="output.property" :component-props="{ disabled:disabled || published, bordered:false, 'aria-label':t('property') }" @change="emit('patch', { property:$event })" /></TemplateClause>
      </details>
    </template>
  </div>
</template>
<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import { metricAggregationsKey } from '../calculatorContext'
import { inputIdentityIssue } from './inputIdentity'
import ReadAggregationEditor from '../collection/ReadAggregationEditor.vue'
import HistoryRecordingEditor from './HistoryRecordingEditor.vue'
import { useI18n } from 'vue-i18n'
import { metricMessages } from '../messages'
import { metricTypeOptions } from '../parameterPresentation'
import { referenceChoice } from './choices'
import TemplateInputEditor from './TemplateInputEditor.vue'
import TemplateRuleEditor from './TemplateRuleEditor.vue'
import TemplateClause from './TemplateClause.vue'
import I18nTextEditable from '@jetlinks-web-core/components/I18n/I18nTextEditable.vue'
import Editable from '@jetlinks-web-core/components/Editable/index.vue'
import SelectOption from '@jetlinks-web-core/components/SelectOption/index.vue'
import { localizedTemplate, templateMessages } from './text'
import TemplateReference from './TemplateReference.vue'
import TemplateFormulaDisplay from './formula/TemplateFormulaDisplay.vue'
import { graphNodeSummary } from './graphPresentation'
import type { MetricCalculatorDescriptor, MetricTemplate, MetricTemplateInput } from '../types'
import { nodeLabel, ruleMetricIds, type TemplateNode, type TemplateRule } from './designer'
import { calculationKind, calculationFields, type CalculationKind } from './window'
const props = defineProps<{ template: MetricTemplate; node: TemplateNode; disabled?: boolean; published?: boolean; calculators?: MetricCalculatorDescriptor[] }>()
const emit = defineEmits<{ (event: 'patch', fields: Record<string, unknown>): void; (event: 'invalid', value: boolean): void; (event: 'messages', value: Record<string, Record<string, string>>): void }>()
const { t, locale } = useI18n({ useScope: 'local', messages: metricMessages })
const aggregations = inject(metricAggregationsKey,undefined)
const types = computed(()=>metricTypeOptions(t))
const input = computed(() => props.template.inputDefinitions[props.node.index] as MetricTemplateInput & { maxAge?: string; minSamples?: number; defaultValue?: unknown })
const output = computed(() => props.template.outputs[props.node.index])
const rule = computed(() => props.template.definitions[props.node.index] as TemplateRule)
const identityIssue = ref<string>()
const inputInvalid = ref(false)
const outputInvalid = ref(false)
watch([identityIssue,inputInvalid],()=>{ if (props.node.kind === 'input') emit('invalid',!!identityIssue.value || inputInvalid.value) },{immediate:true})
function changeInputId(value:string) {
  if (props.disabled || props.published) return
  identityIssue.value = inputIdentityIssue(props.template,props.node.index,value)
  if (!identityIssue.value) emit('patch',{id:value})
}
const kind = computed(() => props.node.kind === 'rule' ? calculationKind(rule.value) : 'expression')
const pendingKind = ref<CalculationKind>()
watch([() => props.template, () => props.node, () => props.disabled], () => { pendingKind.value = undefined })
const methods = computed(() => [
  { value: 'expression', label: t('expression'), icon: 'FunctionOutlined', description: t('expressionMethodHint') },
  { value: 'statistics', label: t('statistics'), icon: 'BarChartOutlined', description: t('statisticsMethodHint') },
  { value: 'temporal', label: t('temporal'), icon: 'ClockCircleOutlined', description: t('temporalMethodHint') },
  { value: 'calculator', label: t('calculator'), icon: 'CalculatorOutlined', description: t('calculatorMethodHint') },
])
const declarationId = computed(() => String(props.node.kind === 'input' ? input.value.id : props.node.kind === 'rule' ? rule.value.id || '' : output.value.metricId))
const name = computed(() => String(props.node.kind === 'input' ? input.value.name || '' : props.node.kind === 'rule' ? rule.value.name || '' : output.value.label || ''))
const displayName = computed(() => nodeLabel(localizedTemplate(props.template, String(locale.value)), props.node))
const nameKey = computed(() => props.node.kind === 'output' ? `output.${output.value.metricId}.label` : `${props.node.kind}.${props.node.kind === 'input' ? input.value.id : rule.value.id}.name`)
const displayTemplate = computed(() => localizedTemplate(props.template, String(locale.value)))
const sources = computed(() => displayTemplate.value.definitions.flatMap((item, index) => ruleMetricIds(item as TemplateRule).map(id => ({ id,label:id === item.id ? String(item.name || nodeLabel(displayTemplate.value,{kind:'rule',index})) : id }))).map(item => referenceChoice(displayTemplate.value,item,t)))
const sourceNode = computed<TemplateNode | undefined>(() => {
  if (props.node.kind !== 'output') return
  const input = props.template.inputDefinitions.findIndex(item => item.id === output.value.metricId)
  if (input >= 0) return { kind:'input', index:input }
  const rule = props.template.definitions.findIndex(item => item.id === output.value.metricId)
  if (rule >= 0) return { kind:'rule', index:rule }
})
const sourceSummary = computed(() => sourceNode.value && graphNodeSummary(displayTemplate.value, sourceNode.value, t, props.calculators,locale.value,aggregations?.value))
function toggleOutput(field: 'publish') {
  if (props.disabled) return
  emit('patch', { [field]:output.value.publish !== true })
}
function setOutputInvalid(value:boolean) { outputInvalid.value=value;emit('invalid',value) }
function changeKind(value: CalculationKind, confirmed = false) {
  if (props.disabled || value === kind.value) return
  const fields = calculationFields(value)
  if (!confirmed && Object.keys(fields).some(key => key !== 'type' && rule.value[key] != null && rule.value[key] !== '')) { pendingKind.value = value; return }
  pendingKind.value = undefined
  emit('patch', fields)
}
function chooseKind({ key }: { key: string | number }) { changeKind(key as CalculationKind) }
</script>
<style scoped>
.node-editor__identity-error { grid-column:1/-1; margin:4px 0; font-size:12px; color:var(--ant-error-color,#ff4d4f); line-height:1.6 }
.node-editor { min-width:0; container-type:inline-size; font-size:var(--fs-14,14px) }
.node-editor__confirmation { margin-bottom:16px }
.node-editor__identity { display:grid; grid-template-columns:minmax(0,1fr) minmax(64px,40%); align-items:center; gap:4px 12px; margin-bottom:16px }
.node-editor__reference { grid-column:1/-1; justify-self:start }
.node-editor__name { min-width:0 }
.node-editor__method { min-width:0; height:32px }
.node-editor__method > .ant-btn { height:32px; font-size:13px; font-weight:500; color:var(--ink-2); padding:0 }
.node-editor__method-option { display:grid; grid-template-columns:minmax(0,1fr) 16px; align-items:start; gap:12px; width:264px; max-width:calc(100vw - 48px); padding:4px 0 }
.node-editor__method-option > .select-option { min-width:0; max-width:none; color:var(--ink-1) }
.node-editor__method-check { display:grid; place-items:center; width:16px; height:20px; margin-top:3px; color:var(--accent) }
.node-editor__method-item.is-current .select-option { color:var(--accent); font-weight:500 }
.node-editor__method-item.is-current :deep(.select-option__icon) { color:var(--accent) }
.node-editor__source { width:184px; min-width:0; color:var(--accent) }
.node-editor__unit-value { width:80px; color:var(--accent) }
.node-editor__output-source { display:flex; align-items:center; flex-wrap:wrap; gap:4px; min-height:32px; font-size:13px; line-height:1.8 }
.node-editor__output-schema { padding:0 }
.node-editor__output-type { min-width:0; max-width:100%; color:var(--accent) }
.node-editor__output-choice { min-width:56px; max-width:220px; color:var(--accent) }
.node-editor__output-meaning { display:flex; flex-direction:column; gap:4px; padding:4px 0 12px; color:var(--ink-2); font-size:13px }
.node-editor__output-meaning small { color:var(--ink-3); font-size:12px }
.node-editor__output-uses { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin:0; font-size:13px; color:var(--ink-3) }
.node-editor__output-uses button { display:inline-flex; align-items:center; gap:6px; min-height:28px; border:1px solid var(--line); border-radius:var(--r-2,6px); padding:2px 8px; background:transparent; color:var(--ink-3); cursor:pointer; font:inherit }
.node-editor__output-uses button.enabled { color:var(--accent); border-color:var(--accent-muted,var(--line)); background:var(--accent-soft) }
.node-editor__output-uses button:focus-visible { outline:2px solid var(--accent); outline-offset:2px }
.node-editor__output-uses button:disabled { cursor:default }
.node-editor :deep(.ant-input-number) { width:96px; max-width:100% }
.node-editor :deep(.template-clause) { padding:6px 0 }
.node-editor :deep(.template-clause__icon) { width:16px; flex:none; margin-top:9px }
.node-editor :deep(.template-clause__body) { display:grid; grid-template-columns:auto minmax(0,1fr); align-items:center; gap:4px 12px; min-height:32px }
.node-editor :deep(.template-clause__content) { min-width:0; justify-content:flex-end }
.node-editor :deep(.template-clause__content:first-child) { grid-column:1/-1; justify-content:flex-start }
.node-editor :deep(.template-clause__title) { margin:0; font-size:13px }
.node-editor :deep(.template-clause.is-stacked) { padding:0; margin-bottom:16px }
.node-editor :deep(.template-clause.is-stacked > .template-clause__icon) { margin:0 }
.node-editor :deep(.template-clause.is-stacked > .template-clause__body) { display:contents }
.node-editor :deep(.template-clause.is-stacked > .template-clause__body > .template-clause__content) { display:block }
.node-editor :deep(.template-clause__body > small) { grid-column:1/-1; margin:0; font-size:12px; line-height:1.6 }
.node-editor > details > summary { display:flex; align-items:center; gap:8px; padding:8px 0; color:var(--ink-3); font-size:13px; cursor:pointer }
.node-editor__id { height:24px; min-height:24px; line-height:24px; font-size:12px; color:var(--ink-3); min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; user-select:text; text-align:right }
.node-editor__id :deep(.text) { display:block; height:24px; line-height:24px; padding-inline:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
@container (max-width:260px) { .node-editor__identity { grid-template-columns:minmax(0,1fr) } .node-editor__id { text-align:left } }
</style>
