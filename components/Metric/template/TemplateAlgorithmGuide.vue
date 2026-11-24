<template>
  <details v-if="documentation" class="algorithm-guide">
    <summary><AIcon type="QuestionCircleOutlined" />{{ t('algorithmGuide') }}<AIcon class="algorithm-guide__chevron" type="DownOutlined" /></summary>
    <div class="algorithm-guide__content">
      <p v-if="invalid" class="algorithm-guide__warning" role="status">{{ t('guideInvalid') }}</p>
      <template v-else>
        <section v-if="example" class="algorithm-guide__example" :aria-label="t('guideExample')">
          <div class="algorithm-guide__heading">
            <span>{{ t('guideExample') }}</span>
            <a-select v-if="documentation.examples.length > 1" :value="exampleIndex" size="small" :aria-label="t('guideChooseExample')" :options="documentation.examples.map((item,index)=>({value:index,label:item.name}))" @change="selectExample" />
            <strong v-else>{{ example.name }}</strong>
          </div>
          <ExamplePlot v-if="example.visualization" :plot="example.visualization" :label="example.name" />
          <template v-else><div v-for="(samples,alias) in example.inputs" :key="alias" class="algorithm-guide__input">
            <span class="algorithm-guide__label">{{ descriptor?.inputNames?.[alias] || alias }}</span>
            <ol class="algorithm-guide__samples"><li v-for="(sample,index) in samples" :key="index"><strong>{{ format(sample.value) }}</strong><small>{{ sample.offsetSeconds }}s</small></li></ol>
          </div></template>
          <div class="algorithm-guide__result">
            <span class="algorithm-guide__label">{{ t('guideResult') }}</span>
            <dl v-if="resultFields.length" class="algorithm-guide__fields"><div v-for="field in resultFields" :key="field.id"><dt>{{ field.name }}</dt><dd>{{ format(field.value) }}<small v-if="field.unit"> {{ field.unit }}</small></dd></div></dl>
            <strong v-else>{{ example.reason ? t('guideNoValue') : format(example.result) }}<small v-if="!example.reason && descriptor?.configuration?.outputUnit"> {{ descriptor.configuration.outputUnit }}</small></strong>
            <span v-if="example.estimated" class="algorithm-guide__estimated">{{ t('guideEstimated') }}</span>
          </div>
          <p class="algorithm-guide__explanation">{{ example.explanation }}</p>
          <details class="algorithm-guide__parameters">
            <summary>{{ t('guideExampleParameters') }}</summary>
            <dl><div v-for="item in parameters" :key="item.id"><dt>{{ item.name }}</dt><dd>{{ item.value }}</dd></div><div><dt>{{ t('guideCutoff') }}</dt><dd>{{ example.cutoffSeconds }}s</dd></div></dl>
          </details>
        </section>
        <details v-if="documentation.formula || documentation.steps?.length" class="algorithm-guide__reference">
          <summary>{{ t('guideFormula') }}</summary>
          <CalculatorFormula v-if="documentation.formula" class="algorithm-guide__formula" :formula="documentation.formula" :description="descriptor?.description" :symbols="documentation.symbols" />
          <ol v-if="documentation.steps?.length" class="algorithm-guide__steps"><li v-for="step in documentation.steps" :key="step">{{ step }}</li></ol>
        </details>
      </template>
    </div>
  </details>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import CalculatorFormula from './CalculatorFormula.vue'
import ExamplePlot from './ExamplePlot.vue'
import type { MetricCalculatorDescriptor } from '../types'
import { metricMessages } from '../messages'
import { algorithmGuideMessages } from './algorithmGuideMessages'

const props = defineProps<{ descriptor?:Pick<MetricCalculatorDescriptor,'description'|'documentation'> & Partial<Pick<MetricCalculatorDescriptor,'configuration'|'inputNames'|'parameterDefinitions'>>; invalid?:boolean }>()
const { t, locale } = useI18n({ useScope:'local', messages:{ zh:{...metricMessages.zh,...algorithmGuideMessages.zh}, en:{...metricMessages.en,...algorithmGuideMessages.en} } })
const documentation = computed(() => props.descriptor?.documentation)
const exampleIndex = ref(0)
const example = computed(() => documentation.value?.examples?.[exampleIndex.value] || documentation.value?.examples?.[0])
function selectExample(value:unknown) {
  if(typeof value === 'number')exampleIndex.value=value
}
// 仅排版服务端固定算例；参数变化和实际取数继续由模板试算统一处理。
function format(value:unknown):string {
  if(value == null)return '—'
  if(typeof value === 'number')return new Intl.NumberFormat(String(locale.value),{maximumFractionDigits:4}).format(value)
  if(Array.isArray(value))return value.map(format).join(' · ')
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}
const resultFields = computed(() => {
  const value=example.value?.result
  if(!value || typeof value !== 'object' || Array.isArray(value))return []
  const fields=props.descriptor?.configuration?.outputType?.properties
  return Object.entries(value).map(([id,value])=>{
    const field=Array.isArray(fields) ? fields.find(item=>item.id === id) : undefined
    return {id,name:field?.name || id,unit:field?.valueType?.unit,value}
  })
})
const parameters = computed(() => {
  const descriptor=props.descriptor
  const definitions=descriptor?.parameterDefinitions || []
  return Object.entries({...descriptor?.configuration?.parameters,...example.value?.parameters})
    .filter(([id])=>definitions.some(item=>item.id === id))
    .map(([id,value])=>{
      const field=definitions.find(item=>item.id === id)!
      const choices=field.valueType?.elements
      const choice=Array.isArray(choices) ? choices.find(item=>item.value === value) : undefined
      return {id,name:field.name || id,value:choice?.text || choice?.label || format(value)}
    })
})
</script>
<style scoped>
.algorithm-guide { margin-top:12px; border-top:1px solid var(--line); color:var(--ink-2); font-size:12px; line-height:1.65; min-width:0 }
.algorithm-guide > summary { display:flex; align-items:center; gap:6px; min-height:32px; cursor:pointer; color:var(--ink-3); list-style:none }
.algorithm-guide > summary::-webkit-details-marker { display:none }
.algorithm-guide > summary:hover,.algorithm-guide > summary:focus-visible { color:var(--accent) }
.algorithm-guide__chevron { margin-left:auto; font-size:10px; transition:transform .15s }
.algorithm-guide[open] .algorithm-guide__chevron { transform:rotate(180deg) }
.algorithm-guide__content { padding-top:4px; overflow-wrap:anywhere }
.algorithm-guide__formula { padding:6px 0 }
.algorithm-guide__steps { margin:4px 0 12px; padding-left:18px; color:var(--ink-3) }
.algorithm-guide__example { padding-top:4px }
.algorithm-guide__heading { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px; color:var(--ink-3) }
.algorithm-guide__heading strong { font-weight:500; color:var(--ink-2) }
.algorithm-guide__heading .ant-select { min-width:0; max-width:70% }
.algorithm-guide__input { display:flex; align-items:center; gap:12px; margin:8px 0 }
.algorithm-guide__label { flex-shrink:0; color:var(--ink-3); max-width:88px }
.algorithm-guide__samples { display:flex; align-items:center; justify-content:space-between; flex:1; min-width:0; gap:12px; margin:0; padding:0; list-style:none; overflow-x:auto }
.algorithm-guide__samples li { display:flex; flex-direction:column; align-items:center; flex-shrink:0 }
.algorithm-guide__samples strong { font-weight:500; font-variant-numeric:tabular-nums }
.algorithm-guide small { color:var(--ink-3); font-size:11px }
.algorithm-guide__result { display:flex; flex-wrap:wrap; align-items:baseline; gap:6px 12px; border-top:1px dashed var(--line); margin-top:10px; padding-top:8px }
.algorithm-guide__result > strong { font-size:16px; font-weight:600; font-variant-numeric:tabular-nums }
.algorithm-guide__estimated { color:var(--ink-3); font-size:11px }
.algorithm-guide__fields { margin:0; flex:1; min-width:0 }
.algorithm-guide__fields > div,.algorithm-guide__parameters dl > div { display:flex; justify-content:space-between; gap:12px }
.algorithm-guide dd { margin:0; font-variant-numeric:tabular-nums }
.algorithm-guide__fields dt { color:var(--ink-3) }
.algorithm-guide__explanation { margin:8px 0; color:var(--ink-2) }
.algorithm-guide__parameters { color:var(--ink-3); font-size:11px }
.algorithm-guide__parameters summary { cursor:pointer }
.algorithm-guide__parameters dl { margin:6px 0 0 }
.algorithm-guide__reference { margin-top:10px; color:var(--ink-3); font-size:12px }
.algorithm-guide__reference > summary { cursor:pointer; padding:4px 0 }
.algorithm-guide__warning { margin:0; color:var(--warning,#ad6800) }
</style>
