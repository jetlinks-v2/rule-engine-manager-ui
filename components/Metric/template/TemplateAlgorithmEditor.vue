<template>
  <section class="algorithm-editor">
    <div v-if="aliases.length" class="algorithm-editor__sources algorithm-editor__stage">
      <div class="algorithm-editor__stage-title"><AIcon type="DatabaseOutlined" />{{ t('algorithmDataStage') }}</div>
      <div v-for="alias in aliases" :key="alias" class="algorithm-editor__source">
        <label class="algorithm-editor__source-label">{{ inputName(alias) }}<small v-if="inputParameter(alias)"> · {{ t('inputOptional') }}</small></label>
        <span v-if="binding(alias)?.source" class="algorithm-editor__source-chip"><AIcon type="ImportOutlined" />{{ t('algorithmDirectSource') }}</span>
        <TemplateReference v-else class="algorithm-editor__source-chip" :class="{ 'algorithm-editor__source-chip--missing':missingSource(alias) }" :metric-id="binding(alias)?.metricId || inheritedBinding(alias)">
          <AIcon type="ImportOutlined" /><Editable class="algorithm-editor__input" type="select" :value="binding(alias)?.metricId || inheritedBinding(alias)" :component-props="{ options:sourceOptions(alias), allowClear:!!inputParameter(alias), 'aria-label':`${t('source')} · ${inputName(alias)}`, 'aria-invalid':missingSource(alias), placeholder:t('chooseSource'), disabled:disabled || !!yamlError, bordered:false, defaultOpen:true }" @change="bind(alias, $event as string)" />
        </TemplateReference>
        <p v-if="missingSource(alias)" class="algorithm-editor__missing" role="status">{{ t('algorithmMissingSource', { name:inputName(alias) }) }}</p>
        <div class="algorithm-editor__source-detail">
          <template v-if="inputType(alias)?.type === 'array'"><span v-if="history(alias)">{{ t('sentenceWithin', { duration:simulationDuration(history(alias), t) }) }} · </span><span>{{ t('algorithmHistoryData') }}</span><a-tooltip v-if="!history(alias)" :title="t('algorithmHistoryHint')"><AIcon type="InfoCircleOutlined" /></a-tooltip></template>
          <span v-else>{{ t('latestReading') }}</span><span v-if="inputUnit(alias)"> · {{ inputUnit(alias) }}</span><span> · {{ t('algorithmInputAs', { name:inputName(alias) }) }}<template v-if="inputParameter(alias)"> · {{ t('inputOptional') }}</template></span>
        </div>
      </div>
    </div>
    <div class="algorithm-editor__process algorithm-editor__stage">
      <div class="algorithm-editor__stage-title"><AIcon :type="calculatorIcon(descriptor)" />{{ t('algorithmProcessStage') }}</div>
      <div class="algorithm-editor__toolbar">
        <a-select v-if="!spec.provider" class="algorithm-editor__choice" :options="options" show-search option-filter-prop="label" :placeholder="t('chooseAlgorithm')" :aria-label="t('chooseAlgorithm')" :disabled="disabled" :default-open="!disabled" :dropdown-match-select-width="false" @change="choose"><template #option="option"><SelectOption :label="option.label" :icon="option.icon" :description="option.description"><template v-if="option.formula" #description><CalculatorFormula :formula="option.formula" :description="option.description" :symbols="option.symbols" /></template></SelectOption></template></a-select>
        <Editable v-else class="algorithm-editor__choice" type="select" :value="descriptor ? calculatorKey(descriptor) : undefined" :component-props="{ options, showSearch:true, optionFilterProp:'label', placeholder:t('chooseAlgorithm'), 'aria-label':t('chooseAlgorithm'), disabled:disabled || !!yamlError, bordered:false, defaultOpen:true, dropdownMatchSelectWidth:false }" @change="choose"><template #option="option"><SelectOption :label="option.label" :icon="option.icon" :description="option.description"><template v-if="option.formula" #description><CalculatorFormula :formula="option.formula" :description="option.description" :symbols="option.symbols" /></template></SelectOption></template></Editable>
        <a-tooltip v-if="spec.provider" :title="descriptor?.description || t('algorithmYamlHint')"><AIcon type="InfoCircleOutlined" /></a-tooltip>
        <a-button v-if="spec.provider" type="text" size="small" :disabled="!!yamlError || mode === 'yaml' && !canVisualize" :aria-label="mode === 'visual' ? 'YAML' : t('algorithmInteractive')" @click="changeMode(mode === 'visual' ? 'yaml' : 'visual')"><AIcon :type="mode === 'visual' ? 'CodeOutlined' : 'SlidersOutlined'" />{{ mode === 'visual' ? 'YAML' : t('algorithmInteractive') }}</a-button>
      </div>
      <p v-if="spec.provider && !canVisualize" class="algorithm-editor__description">{{ t('algorithmYamlHint') }}</p>
      <template v-if="mode === 'visual'">
        <template v-for="(group, index) in [parameters, advancedParameters]" :key="index">
          <component :is="index ? 'details' : 'div'" v-if="group.length" :class="index ? 'algorithm-editor__advanced' : 'algorithm-editor__parameters'">
            <summary v-if="index"><AIcon type="SettingOutlined" /><span>{{ t('moreSettings') }}</span><AIcon class="algorithm-editor__advanced-chevron" type="DownOutlined" /></summary>
            <span v-if="!index && group.some(parameter => parameter.expands?.editor !== 'table')">{{ t('sentenceSettings') }}</span>
            <span v-for="(parameter, position) in group" :key="parameter.id" class="algorithm-editor__parameter" :class="{ 'algorithm-editor__parameter--table':parameter.expands?.editor === 'table' }">
              <span class="algorithm-editor__parameter-content" :class="{ 'algorithm-editor__parameter-content--missing':!index && missingParameter(parameter) }">
                <span :title="typeof parameter.description === 'string' ? parameter.description : undefined">{{ parameter.name || parameter.id }}<template v-if="parameter.expands?.editor !== 'table'">{{ t('sentenceValue') }}</template></span>
                <TemplateDuration v-if="parameter.expands?.editor === 'duration'" :model-value="parameterValue(parameter) as string | undefined" :disabled="disabled" :min="1" @update:model-value="updateParameter(parameter.id, $event)" />
                <MetricParameterValue v-else inline class="algorithm-editor__value" :class="{ 'algorithm-editor__value--complex':['object','array'].includes(String(parameter.valueType?.type)) }" :parameter="parameter" :disabled="disabled" :model-value="parameterValue(parameter)" :aria-invalid="!index && missingParameter(parameter)" @update:model-value="updateParameter(parameter.id, $event)" />
                <template v-if="parameter.expands?.editor !== 'table'">{{ t(position === group.length - 1 ? 'sentenceEnd' : 'sentenceComma') }}</template>
              </span>
              <span v-if="!index && missingParameter(parameter)" class="algorithm-editor__missing" role="status">{{ t('algorithmMissingParameter', { name:parameter.name || parameter.id }) }}</span>
            </span>
          </component>
        </template>
      </template>
      <template v-else>
        <MonacoEditor :model-value="yamlText" language="yaml" theme="vs" :read-only="disabled" :blur-format="false" :init="initializeYaml" :options="{ minimap: { enabled:false }, wordWrap:'on', automaticLayout:true, scrollBeyondLastLine:false }" class="algorithm-editor__yaml" @update:model-value="updateYaml" />
        <p v-if="yamlError" class="algorithm-editor__error" role="alert">{{ yamlError }}</p>
      </template>
      <TemplateAlgorithmGuide v-if="spec.provider" :key="descriptor ? calculatorKey(descriptor) : spec.provider" :descriptor="descriptor" :invalid="!!yamlError" />
    </div>
    <template v-if="spec.outputType?.type">
      <div class="algorithm-editor__output algorithm-editor__stage">
        <div class="algorithm-editor__stage-title"><AIcon type="ExportOutlined" />{{ t('algorithmResultStage') }}</div>
        <strong>{{ resultName }}</strong><small v-if="numericOutput"> · <Editable :value="spec.outputUnit" :component-props="{ disabled, bordered:false, placeholder:t('noUnit'), 'aria-label':t('outputUnit') }" @change="updateOutputUnit" /></small>
        <div class="algorithm-editor__result-detail">
          <template v-if="outputFields.length"><span v-for="(output, index) in outputFields" :key="output.id">{{ output.name }}<small v-if="output.valueType?.unit"> ({{ output.valueType.unit }})</small>{{ t(index === outputFields.length - 1 ? 'sentenceEnd' : 'sentenceList') }}</span></template>
          <span v-else>{{ t(parameterTypeKeys[String(spec.outputType.type)] || 'algorithmValue') }}</span>
        </div>
      </div>
    </template>
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type * as Monaco from 'monaco-editor'
import MonacoEditor from '@jetlinks-web-core/components/MonacoEditor/monacoEditor.vue'
import Editable from '@jetlinks-web-core/components/Editable/index.vue'
import SelectOption from '@jetlinks-web-core/components/SelectOption/index.vue'
import CalculatorFormula from './CalculatorFormula.vue'
import MetricParameterValue from '../MetricParameterValue.vue'
import TemplateDuration from './TemplateDuration.vue'
import TemplateReference from './TemplateReference.vue'
import TemplateAlgorithmGuide from './TemplateAlgorithmGuide.vue'
import { calculatorIcon, calculatorOption } from './calculatorPresentation'
import { algorithmOutputFields, algorithmParameterValue, algorithmSourceMatches, algorithmSources, algorithmSuggestions, bindAlgorithmInput, calculatorInputParameters, calculatorKey, chooseAlgorithm, findCalculator, interactiveCalculator, visibleAlgorithmParameters } from './algorithm'
import { configurationObject, encodeConfiguration } from './configurationText'
import { nodeLabel, ruleDependencies, type TemplateRule } from './designer'
import { localizedTemplate } from './text'
import { simulationDuration } from './simulationFlow'
import { errorText } from '../service'
import { metricMessages } from '../messages'
import { referenceChoice } from './choices'
import { numericParameter, parameterTypeKeys } from '../parameterPresentation'
import type { MetricCalculatorDescriptor, MetricCalculatorSpec, MetricParameter, MetricTemplate } from '../types'

const props = withDefaults(defineProps<{ template: MetricTemplate; rule: TemplateRule; calculators?: MetricCalculatorDescriptor[]; disabled?: boolean }>(), { calculators: () => [] })
const emit = defineEmits<{ (event: 'patch', fields: Partial<TemplateRule>): void; (event: 'invalid', value: boolean): void }>()
const { t, locale } = useI18n({ useScope: 'local', messages: metricMessages })
const spec = computed(() => props.rule.calculator || {})
const numericOutput = computed(() => numericParameter({ id:'result', valueType:{ type:String(spec.value.outputType?.type || '') } }))
const descriptor = computed(() => findCalculator(spec.value, props.calculators))
const canVisualize = computed(() => interactiveCalculator(spec.value, descriptor.value))
// 尚未选择算法时先选择起点；仅已有且无法可视编辑的配置回退到 YAML。
const mode = ref<'visual' | 'yaml'>(spec.value.provider && !canVisualize.value ? 'yaml' : 'visual')
const yamlText = ref(encodeConfiguration(spec.value, 'yaml'))
const yamlError = ref('')
// 缺少可视输入的描述不是可直接使用的起点；已有声明仍可回显和编辑 YAML。
const options = computed(() => props.calculators.filter(item => item === descriptor.value || interactiveCalculator(item.configuration, item))
  .map(item => ({ value:calculatorKey(item), ...calculatorOption(item, t) })))
const displayTemplate = computed(() => localizedTemplate(props.template, String(locale.value)))
const sources = computed(() => algorithmSources(displayTemplate.value, props.rule))
const resultName = computed(() => {
  const index = props.template.definitions.findIndex(item => item.id === props.rule.id)
  return index >= 0 ? nodeLabel(displayTemplate.value, { kind:'rule', index }) : props.rule.name || props.rule.id
})
const sourceOptions = (alias:string) => sources.value.filter(item => algorithmSourceMatches(spec.value,alias,item.valueType,descriptor.value)).map(item => referenceChoice(displayTemplate.value, item, t))
const inputParameters = computed(() => calculatorInputParameters(descriptor.value))
const inputAlias = (parameter:MetricParameter) => String(spec.value.parameters?.[parameter.id] || parameter.id)
const inputParameter = (alias:string) => inputParameters.value.find(parameter => inputAlias(parameter) === alias)
const inputName = (alias:string) => descriptor.value?.inputNames[alias] || inputParameter(alias)?.name || alias
const inputType = (alias:string) => spec.value.inputTypes?.[alias] || inputParameter(alias)?.expands?.inputType as Record<string,unknown> | undefined
const inputUnit = (alias:string) => sources.value.find(item => item.id === (binding(alias)?.metricId || inheritedBinding(alias)))?.valueType?.unit || inputType(alias)?.unit
const aliases = computed(() => [...new Set([...Object.keys(spec.value.inputTypes || {}), ...inputParameters.value.map(inputAlias)])])
const parameters = computed(() => visibleAlgorithmParameters(descriptor.value, spec.value, false))
const advancedParameters = computed(() => visibleAlgorithmParameters(descriptor.value, spec.value, true))
const outputFields = computed(() => algorithmOutputFields(displayTemplate.value.definitions.find(item=>item.id === props.rule.id)?.calculator as MetricCalculatorSpec || spec.value, descriptor.value))
const parameterValue = (parameter:MetricParameter) => algorithmParameterValue(parameter,spec.value,descriptor.value)
const binding = (alias: string) => props.rule.inputs?.find(input => input.id === alias)
const inheritedBinding = (alias: string) => !props.rule.inputs?.length && ruleDependencies(props.rule).includes(alias) ? alias : undefined
const history = (alias: string) => sources.value.find(item => item.id === (binding(alias)?.metricId || inheritedBinding(alias)))?.lookback
const missingSource = (alias: string) => (!inputParameter(alias) || !!spec.value.inputTypes?.[alias]) && !binding(alias)?.source && !binding(alias)?.metricId && !inheritedBinding(alias)
const missingParameter = (parameter: MetricParameter) => !!parameter.expands?.typeFromInput && spec.value.parameters?.[parameter.id] == null
let lastEmitted = JSON.stringify(spec.value)
let completion: Monaco.IDisposable | undefined
let choseMode = false
// 不完整的绑定就近提示，语义由后端校验；不能阻止用户更换算法或计算方式。
watch([yamlError, () => props.disabled], () => emit('invalid', !props.disabled && !!yamlError.value), { immediate: true })
watch([canVisualize, () => spec.value.provider], ([value, provider]) => {
  if (!yamlError.value && (!choseMode || !value)) mode.value = provider && !value ? 'yaml' : 'visual'
})
watch(() => props.rule.calculator, value => {
  const fingerprint = JSON.stringify(value || {})
  if (fingerprint !== lastEmitted) {
    yamlText.value = encodeConfiguration(value || {}, 'yaml')
    yamlError.value = ''
    lastEmitted = fingerprint
  }
}, { deep: true })
function patch(fields: Partial<TemplateRule>) {
  if (props.disabled) return
  if (fields.calculator) lastEmitted = JSON.stringify(fields.calculator)
  emit('patch', fields)
}
function choose(key: unknown) {
  if (props.disabled || yamlError.value) return
  const item = props.calculators.find(item => calculatorKey(item) === key)
  if (!item || descriptor.value === item) return
  const fields = chooseAlgorithm(props.rule, item, sources.value)
  choseMode = false
  yamlText.value = encodeConfiguration(fields.calculator, 'yaml')
  mode.value = interactiveCalculator(fields.calculator, item) ? 'visual' : 'yaml'
  patch(fields)
}
function bind(alias: string, metricId: string) {
  if (props.disabled || yamlError.value) return
  const fields = bindAlgorithmInput(props.rule, alias, metricId, sources.value.find(item => item.id === metricId)?.valueType, descriptor.value)
  yamlText.value = encodeConfiguration(fields.calculator, 'yaml')
  patch(fields)
}
function updateParameter(id: string, value: unknown) {
  if (props.disabled) return
  const calculator = { ...spec.value, parameters: { ...spec.value.parameters } }
  if (value === undefined) delete calculator.parameters[id]
  else calculator.parameters[id] = value
  patch({ calculator })
}
function updateOutputUnit(value:unknown) {
  patch({calculator:{...spec.value, outputUnit:typeof value === 'string' ? value : undefined}})
}
function changeMode(value: 'visual' | 'yaml') {
  if (yamlError.value || value === 'visual' && !canVisualize.value) return
  if (value === 'yaml' && mode.value !== 'yaml') yamlText.value = encodeConfiguration(spec.value, 'yaml')
  choseMode = true
  mode.value = value
}
function updateYaml(value: string) {
  if (props.disabled) return
  yamlText.value = value
  choseMode = true
  try {
    const calculator = configurationObject(value, 'yaml') as MetricCalculatorSpec
    // 仅检查编辑器所需的对象容器，参数和算法语义继续由后端处理。
    for (const field of ['inputTypes', 'outputType', 'parameters']) {
      const container = calculator[field]
      if (container !== undefined && (!container || typeof container !== 'object' || Array.isArray(container))) throw new Error(t('algorithmObjectRequired', { field }))
    }
    yamlError.value = ''
    patch({ calculator })
  } catch (cause) { yamlError.value = errorText(cause) }
}
/** 建议只作用于此编辑模型；组件/编辑器重建时释放注册，避免污染其他 YAML 编辑器。 */
function initializeYaml(editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) {
  completion?.dispose()
  const ownModel = editor.getModel()
  const registration = monaco.languages.registerCompletionItemProvider('yaml', {
    triggerCharacters: [':', ' '],
    provideCompletionItems(model, position) {
      if (model !== ownModel) return { suggestions: [] }
      const prefix = model.getValueInRange({ startLineNumber: 1, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column })
      const word = model.getWordUntilPosition(position)
      const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: position.column }
      return { suggestions: algorithmSuggestions(prefix, spec.value, descriptor.value, props.calculators).map(item => ({ ...item, range, kind: monaco.languages.CompletionItemKind.Property })) }
    },
  })
  completion = registration
  editor.onDidDispose(() => { registration.dispose(); if (completion === registration) completion = undefined })
}
onBeforeUnmount(() => completion?.dispose())
</script>
<style scoped>
.algorithm-editor { min-width:0; padding-top:8px }
.algorithm-editor__stage { position:relative; min-width:0; padding:0 0 20px 28px }
.algorithm-editor__stage::before { content:''; position:absolute; left:7px; top:20px; bottom:-4px; width:1px; background:var(--line) }
.algorithm-editor__stage:last-of-type { padding-bottom:0 }
.algorithm-editor__stage:last-of-type::before { display:none }
.algorithm-editor__stage-title { display:flex; align-items:center; gap:6px; color:var(--ink-3); font-size:11px; line-height:24px; font-weight:400 }
.algorithm-editor__stage-title > :deep(.anticon) { position:absolute; top:4px; left:0; display:grid; place-items:center; width:16px; height:16px; background:var(--bg-base,#fff) }
.algorithm-editor__source { margin-top:6px; min-width:0 }
.algorithm-editor__source-label { display:block; color:var(--ink-2); font-size:12px; line-height:1.6; margin-bottom:4px }
.algorithm-editor__source-label small { color:var(--ink-3) }
.algorithm-editor__source-chip { display:inline-flex; align-items:center; gap:4px; min-width:100px; max-width:100%; min-height:34px; padding:0 6px; border:1px solid var(--line); border-radius:var(--r-2,6px); background:var(--bg-sunken,#f7f8fa); color:var(--accent) }
.algorithm-editor__source-chip:hover,.algorithm-editor__source-chip:focus-within { border-color:var(--accent); background:var(--bg-selected,#eaf3ff) }
.algorithm-editor__source-chip--missing { border-style:dashed; border-color:var(--danger-color,#ff4d4f) }
.algorithm-editor__source-chip > :first-child { flex:none; font-size:12px }
.algorithm-editor__input { min-width:48px; max-width:100%; font-size:13px }
.algorithm-editor__source-detail { margin:4px 0 0 4px; font-size:11px; line-height:1.7; color:var(--ink-3) }
.algorithm-editor__toolbar { display:flex; align-items:center; gap:4px; min-height:36px }
.algorithm-editor__choice { flex:1; min-width:0; max-width:100%; color:var(--accent); font-size:14px; font-weight:500 }
.algorithm-editor__toolbar > :not(.algorithm-editor__choice) { flex:none; color:var(--ink-3); font-size:12px }
.algorithm-editor__toolbar > .ant-btn { font-size:11px; margin-left:auto; padding:0 4px }
.algorithm-editor__description { color:var(--ink-3); line-height:1.7; margin:8px 0; font-size:12px }
.algorithm-editor__parameters { margin:4px 0 0; line-height:2.5; font-size:13px }
.algorithm-editor__parameter { display:inline-flex; flex-direction:column; align-items:flex-start; min-height:32px; max-width:100%; vertical-align:top; font-size:13px }
.algorithm-editor__parameter-content { display:inline-flex; align-items:center; max-width:100%; min-height:32px }
.algorithm-editor__parameter-content--missing .algorithm-editor__value { border-bottom:1px dashed var(--danger-color,#ff4d4f) }
.algorithm-editor__missing { margin:2px 0 4px; color:var(--danger-color,#ff4d4f); font-size:11px; line-height:1.7; overflow-wrap:anywhere }
.algorithm-editor__value { width:auto; min-width:28px; max-width:180px; color:var(--accent) }
.algorithm-editor__value--complex { display:inline-block; width:180px; overflow:auto }
.algorithm-editor__parameter--table { display:flex; width:100%; margin:4px 0 10px }
.algorithm-editor__parameter--table .algorithm-editor__parameter-content { display:flex; flex-wrap:wrap; width:100%; gap:4px }
.algorithm-editor__parameter--table .algorithm-editor__value { width:100%; max-width:none; overflow:visible }
.algorithm-editor__parameter :deep(.template-duration) { width:auto }
.algorithm-editor__parameter :deep(.template-duration__amount) { width:auto; min-width:28px; flex:0 1 auto }
.algorithm-editor__parameter :deep(.template-duration__unit) { width:auto; min-width:40px }
.algorithm-editor__value :deep(.ant-input),.algorithm-editor__value :deep(.ant-input-number),.algorithm-editor__value :deep(.ant-select) { width:100% }
.algorithm-editor__advanced { color:var(--ink-3); margin:12px 0 0; font-size:12px; line-height:1.65 }
.algorithm-editor__advanced summary { display:flex; align-items:center; gap:6px; min-height:32px; cursor:pointer; list-style:none }
.algorithm-editor__advanced summary::-webkit-details-marker { display:none }
.algorithm-editor__advanced summary:hover,.algorithm-editor__advanced summary:focus-visible { color:var(--accent) }
.algorithm-editor__advanced-chevron { margin-left:auto; font-size:10px; transition:transform .15s }
.algorithm-editor__advanced[open] .algorithm-editor__advanced-chevron { transform:rotate(180deg) }
.algorithm-editor__advanced > .algorithm-editor__parameter { margin-top:8px }
.algorithm-editor__output { font-size:13px; line-height:1.8; overflow-wrap:anywhere }
.algorithm-editor__output strong { font-weight:500; color:var(--ink-2) }
.algorithm-editor__result-detail,.algorithm-editor__output > small { color:var(--ink-3); font-size:11px }
.algorithm-editor__yaml { height:360px; border:1px solid var(--line); border-radius:6px; overflow:hidden; margin:12px 0 }
.algorithm-editor__error { color:var(--danger-color,#ff4d4f); font-size:12px; margin:8px 0; line-height:1.7 }
</style>
