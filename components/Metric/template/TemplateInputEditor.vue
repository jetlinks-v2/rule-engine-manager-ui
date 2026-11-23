<template>
  <div class="input-editor">
    <section class="input-editor__schema" :aria-label="t('inputDataType')">
      <TemplateInputSchema :model-value="input.valueType" :disabled="disabled || published" :unit-editable="false" hide-type-label @update:model-value="updateSchema">
        <template #prefix><span class="input-editor__type-label"><AIcon type="TagOutlined" />{{ t('inputDataType') }}</span></template>
        <template #suffix><span class="input-editor__unit-inline"><span>{{ t('unit') }}</span><Editable :value="input.unit" :component-props="{ disabled:disabled || published, bordered:false, placeholder:t('noUnit'), 'aria-label':t('unit') }" @change="emit('patch', { unit:$event })" /></span><a-tooltip :trigger="['hover','focus']" :title="t(published ? 'inputPublishedType' : 'inputBindingHint')"><button type="button" class="input-editor__help" :aria-label="t(published ? 'inputPublishedType' : 'inputBindingHint')"><AIcon :type="published ? 'LockOutlined' : 'InfoCircleOutlined'" /></button></a-tooltip></template>
      </TemplateInputSchema>
      <p v-if="schemaIssue" class="input-editor__error" role="alert">{{ t(schemaIssue) }}</p>
    </section>
    <TemplateClause stacked icon="DatabaseOutlined" :title="t('readMode')" class="input-editor__reading">
      <template #title>{{ t('readMode') }}<a-tooltip :trigger="['hover','focus']" :title="t(input.source?.lookback ? 'inputHistoryTiming' : 'inputLatestTiming')"><button type="button" class="input-editor__help" :aria-label="t('inputReadTiming')"><AIcon type="InfoCircleOutlined" /></button></a-tooltip></template>
      <div class="input-editor__sentence">
        <Editable class="input-editor__mode" type="select" :value="input.source?.lookback ? 'history' : 'latest'" :component-props="{ disabled, bordered:false, defaultOpen:true, dropdownMatchSelectWidth:false, 'aria-label':t('readMode'), options:readModes }" @change="setReadMode($event as string)" />
      </div>
      <div v-if="input.source?.lookback" class="input-editor__sentence input-editor__continuation">
        <span>{{ t('inputLookback') }}</span><TemplateDuration :model-value="input.source.lookback" :disabled="disabled" @update:model-value="sourceField('lookback', $event)" />
      </div>
    </TemplateClause>
    <TemplateClause stacked icon="SafetyOutlined" :title="t('inputRequirements')" class="input-editor__requirements">
      <div class="input-editor__sentence"><span>{{ t('maxAge') }}</span><TemplateDuration :model-value="input.maxAge" :empty-label="t('unlimited')" :disabled="disabled" @update:model-value="emit('patch', { maxAge:$event })" /></div>
      <div class="input-editor__sentence"><span>{{ t('inputPresence') }}</span><Editable class="input-editor__presence" type="select" :value="input.presence || 'required'" :component-props="{ disabled:disabled || published, bordered:false, defaultOpen:true, dropdownMatchSelectWidth:false, 'aria-label':t('inputPresence'), options:presenceOptions }" @change="emit('patch', { presence:$event })" /></div>
      <div v-if="input.presence === 'defaultValue'" class="input-editor__sentence"><span>{{ t('defaultValue') }}</span><span class="input-editor__default"><MetricParameterValue inline :disabled="disabled" :parameter="defaultParameter" :model-value="input.defaultValue" @update:model-value="emit('patch', { defaultValue:$event })" /></span></div>
    </TemplateClause>
    <details class="input-editor__advanced"><summary><AIcon type="SettingOutlined" />{{ t('moreSettings') }}</summary>
    <section v-if="available.length" class="input-editor__available" :aria-label="t('inputAvailable')">
      <h4><AIcon type="FunctionOutlined" />{{ t('inputAvailable') }}</h4>
      <dl>
        <div v-for="(field, index) in available" :key="field.key" class="input-editor__field" :data-reference="field.key">
          <dt>{{ index === 0 ? t('inputValue') : field.label }}</dt>
          <dd><span>{{ field.type }}</span><span v-if="index > 0 && field.unit"> · {{ field.unit }}</span></dd>
          <dd v-if="field.choices.length" class="input-editor__choices">
            <span v-for="choice in field.choices" :key="`${typeof choice.value}:${choice.value}`">{{ choice.name }}<code v-if="choice.name !== String(choice.value)">{{ choice.value }}</code></span>
          </dd>
        </div>
      </dl>
    </section>
    <section v-if="consumers.length" class="input-editor__execution" :aria-label="t('calculationTrigger')">
      <h4><AIcon type="ThunderboltOutlined" />{{ t('calculationTrigger') }}</h4>
      <p>{{ t('inputTriggerHint') }}</p>
      <div v-for="consumer in consumers" :key="consumer.id" class="input-editor__consumer">
        <TemplateReference :metric-id="consumer.id" locatable>{{ consumer.name }}</TemplateReference>
        <span>{{ consumer.timing }}</span>
      </div>
    </section>
    <template v-if="input.source?.lookback">
      <div class="input-editor__sentence"><AIcon type="DotChartOutlined" /><span>{{ t('minSamples') }}</span><Editable class="input-editor__amount" type="number" :value="input.minSamples" :component-props="{ disabled, min:1, controls:false, bordered:false, 'aria-label':t('minSamples') }" @change="emit('patch', { minSamples:$event ?? undefined })" /></div>
      <div class="input-editor__sentence"><AIcon type="DatabaseOutlined" /><span>{{ t('maxPoints') }}</span><Editable class="input-editor__amount" type="number" :value="input.source.maxPoints" :component-props="{ disabled, min:1, controls:false, bordered:false, 'aria-label':t('maxPoints') }" @change="sourceField('maxPoints', $event ?? undefined)" /></div>
      <div class="input-editor__sentence"><AIcon type="DisconnectOutlined" /><span>{{ t('maxGap') }}</span><TemplateDuration :model-value="input.maxGap" :empty-label="t('unlimited')" :disabled="disabled" @update:model-value="emit('patch', { maxGap:$event })" /></div>
    </template>
    </details>
  </div>
</template>
<script setup lang="ts">
import { computed, watch } from 'vue'
import TemplateInputSchema from './TemplateInputSchema.vue'
import TemplateClause from '@jetlinks-web-core/components/Metric/template/TemplateClause.vue'
import { inputSchemaIssue } from './inputSchema'
import { useI18n } from 'vue-i18n'
import Editable from '@jetlinks-web-core/components/Editable/index.vue'
import MetricParameterValue from '@jetlinks-web-core/components/Metric/MetricParameterValue.vue'
import TemplateDuration from './TemplateDuration.vue'
import TemplateReference from './TemplateReference.vue'
import { ruleDependencies, type TemplateRule } from '@jetlinks-web-core/components/Metric/template/designer'
import { ruleTriggerSummary } from '@jetlinks-web-core/components/Metric/template/graphPresentation'
import { dataFormulaReferences } from '@jetlinks-web-core/components/Metric/template/formula'
import { schemaValueLabels } from '@jetlinks-web-core/components/Metric/valueSemantics'
import { parameterTypeKeys } from '@jetlinks-web-core/components/Metric/parameterPresentation'
import { metricMessages } from '@jetlinks-web-core/components/Metric/messages'
import type { MetricTemplate, MetricTemplateInput } from '@jetlinks-web-core/components/Metric/types'
const props = defineProps<{ input: MetricTemplateInput; template?:MetricTemplate; disabled?: boolean; published?: boolean }>()
const emit = defineEmits<{ (event:'patch', fields:Record<string, unknown>):void; (event:'invalid',value:boolean):void }>()
const { t, locale } = useI18n({ useScope:'local', messages:metricMessages })
const schemaIssue = computed(()=>props.disabled || props.published ? undefined : inputSchemaIssue(props.input.valueType))
watch(schemaIssue,value=>emit('invalid',!!value),{immediate:true})
function updateSchema(valueType:Record<string,unknown>) { if (!props.disabled && !props.published) emit('patch',{valueType}) }
const available = computed(() => {
  const template = props.template
  if (!template) return []
  const input = template.inputDefinitions.find(item => item.id === props.input.id) || props.input
  const references = dataFormulaReferences(template, {id:input.id, label:input.name || input.id}, [], String(locale.value))
  return references.map((field, index) => {
    const type = String(field.schema?.type || '')
    return { key:field.key, label:index === 0 ? field.label : field.label.slice(references[0].label.length + 3),
      type:t(type === 'date' ? 'inputDateType' : parameterTypeKeys[type] || (type ? 'inputUnknownType' : 'inputUndeclaredType')),
      unit:field.unit, choices:schemaValueLabels(field.schema) }
  })
})
const consumers=computed(()=>(props.template?.definitions || []).flatMap(item=>{
  const rule=item as TemplateRule
  return ruleDependencies(rule).includes(props.input.id) ? [{id:rule.id || '',name:rule.name || rule.id || '',timing:ruleTriggerSummary(rule,t)}] : []
}))
const readModes = computed(() => [{ value:'latest', label:t('latestReading'), icon:'ThunderboltOutlined', description:t('latestReadingHint') }, { value:'history', label:t('historySeries'), icon:'HistoryOutlined', description:t('historySeriesHint') }])
const presenceOptions = computed(() => [{value:'required',label:t('inputRequired'),icon:'SafetyOutlined',description:t('inputRequiredHint')},{value:'optional',label:t('inputOptional'),icon:'MinusCircleOutlined',description:t('inputOptionalHint')},{value:'defaultValue',label:t('inputDefault'),icon:'RollbackOutlined',description:t('inputDefaultHint')}])
const defaultParameter = computed(() => ({ ...props.input, valueType:{ ...props.input.valueType, type:String(props.input.valueType?.type || 'double') } }))
function sourceField(field:string, value:unknown) { if (!props.disabled) emit('patch', { source:{ ...props.input.source, [field]:value } }) }
function setReadMode(mode:string) {
  if (props.disabled) return
  if (mode === 'history') sourceField('lookback', 'PT1H')
  // 单值不携带已隐藏的序列约束；来源扩展和其他输入要求保留。
  else emit('patch', { source:{ ...props.input.source, lookback:undefined, maxPoints:undefined }, minSamples:undefined, maxGap:undefined })
}
</script>
<style scoped>
.input-editor { display:grid; min-width:0; font-size:13px; line-height:1.6 }
.input-editor__schema { margin:0 0 16px }
.input-editor__type-label { display:inline-flex; align-items:center; gap:8px; color:var(--ink-3); font-size:12px }
.input-editor__type-label > .anticon { width:16px; font-size:14px }
.input-editor__unit-inline { display:inline-flex; align-items:center; gap:6px; color:var(--ink-3); font-size:12px; min-width:0; max-width:100% }
.input-editor__unit-inline :deep(.editable-field) { max-width:100px; color:var(--accent) }
.input-editor__help { display:inline-flex; align-items:center; justify-content:center; flex:none; width:20px; height:24px; border:0; padding:0; color:var(--ink-3); background:transparent; cursor:help }
.input-editor__help:focus-visible { outline:2px solid var(--accent); border-radius:3px }
.input-editor__error { margin:4px 0; color:var(--ant-error-color,#ff4d4f); font-size:12px }
.input-editor__sentence { display:flex; align-items:center; flex-wrap:wrap; gap:4px 8px; min-height:32px; min-width:0 }
.input-editor__sentence > .anticon { flex:none; width:16px; color:var(--ink-3) }
.input-editor__sentence > span:not(.editable-field):not(.template-duration) { flex:none }
.input-editor__continuation { padding-left:0 }
.input-editor__muted { color:var(--ink-3) }
.input-editor__mode { width:104px; color:var(--accent) }
.input-editor__presence { width:120px; color:var(--accent) }
.input-editor__unit,.input-editor__amount { width:96px; color:var(--accent) }
.input-editor__default { width:128px; max-width:100% }
.input-editor h4 { display:flex; align-items:center; gap:8px; margin:0; font-size:13px; font-weight:500 }
.input-editor h4 > .anticon { width:16px; color:var(--ink-3) }
.input-editor__available dl { margin:6px 0 0 24px; font-size:12px; line-height:1.6 }
.input-editor__field { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:2px 12px; padding:3px 0 }
.input-editor__field dt { min-width:0; font-weight:400; overflow-wrap:anywhere }
.input-editor__field dd { margin:0; color:var(--ink-3) }
.input-editor__field .input-editor__choices { grid-column:1 / -1; display:flex; flex-wrap:wrap; gap:2px 12px; color:var(--ink-2) }
.input-editor__choices > span { overflow-wrap:anywhere }
.input-editor__choices code { margin-left:4px; font-size:11px; color:var(--ink-3) }
.input-editor__execution p { margin:4px 0 8px 24px; color:var(--ink-3); font-size:12px; line-height:1.6 }
.input-editor__consumer { display:flex; align-items:baseline; gap:12px; padding:4px 0 4px 24px; font-size:12px }
.input-editor__consumer > :first-child { flex:1; min-width:0; overflow-wrap:anywhere }
.input-editor__consumer > span { flex:0 1 50%; color:var(--ink-2); text-align:right }
.input-editor__advanced > summary { display:flex; align-items:center; gap:8px; padding:8px 0; font-size:13px; color:var(--ink-3); cursor:pointer }
.input-editor__advanced > section { margin:8px 0 16px }
.input-editor :deep(.ant-input-number) { width:128px; max-width:100% }
</style>
