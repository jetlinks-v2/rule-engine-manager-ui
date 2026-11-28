<template>
  <div class="sample-editor">
    <a-empty v-if="!template.inputDefinitions.length" :description="t('noSampleInputs')" />
    <div v-if="selectedInput" class="sample-editor__filter"><AIcon type="FilterOutlined" />{{ inputName(selectedInput) }}<a-button type="text" size="small" :aria-label="t('trialAllInputs')" @click="emit('clear-input')"><AIcon type="CloseOutlined" /></a-button></div>
    <section v-for="moment in moments" :key="moment.time" class="sample-editor__moment" :class="{ selected:moment.time === selectedTime }">
      <button type="button" class="sample-editor__moment-time" :aria-pressed="moment.time === selectedTime" @click="emit('select-time', moment.time)"><AIcon :type="moment.hasInput ? 'ImportOutlined' : 'ClockCircleOutlined'" /><time>{{ sampleDate(moment.time).replace('T',' ') }}</time><small v-if="!moment.entries.length">{{ t(moment.hasInput ? 'trialOtherInputs' : 'trialEvaluation') }}</small></button>
      <div v-for="entry in moment.entries" :key="`${entry.index}:${entry.input.id}`" class="sample-editor__row" :class="{ incomplete:entry.value == null }">
        <div class="sample-editor__sentence">
          <TemplateReference :metric-id="entry.input.id"><span>{{ entry.input.name || entry.input.id }}</span></TemplateReference><span class="sample-editor__is">{{ t('sentenceValue') }}</span>
          <TemplateSampleValue :ref="editor => setValueEditor(entry.index, editor)" class="sample-editor__value" :template="template" :input="entry.input" :value="entry.value" :disabled="loading" show-hint @change="emit('change',patchSimulationInput(facts,entry.index,entry.input.id,$event))" />
          <small>{{ entry.sample.unit || entry.input.unit }}</small>
          <a-popover trigger="click" placement="bottom">
            <template #content><a-input type="datetime-local" :value="sampleDate(entry.sample.eventTime)" :disabled="loading" :aria-label="`${entry.input.name || entry.input.id} · ${t('sampleTime')}`" step="1" @change="changeTime(entry.index, $event.target.value)" /></template>
            <a-button class="sample-editor__action" type="text" size="small" :danger="timeErrors.has(entry.index)" :disabled="loading" :aria-label="`${entry.input.name || entry.input.id} · ${t('editSampleTime')}`"><AIcon type="ClockCircleOutlined" /></a-button>
          </a-popover>
          <a-button class="sample-editor__action" type="text" size="small" :disabled="loading" :aria-label="t('removeSample')" @click="remove(entry.index)"><AIcon type="CloseOutlined" /></a-button>
        </div>
        <small v-if="entry.sample.eventTime !== moment.time" class="sample-editor__data-time">{{ t('trialDataTime') }} · {{ sampleDate(entry.sample.eventTime) }}</small>
      </div>
      <a-dropdown v-if="moment.time === selectedTime && template.inputDefinitions.length" :trigger="['click']" :disabled="loading">
        <a-button type="text" size="small" class="sample-editor__at-add" :disabled="loading" :aria-label="t('trialAddHere')"><AIcon type="PlusOutlined" />{{ t('trialAddHere') }}</a-button>
        <template #overlay><a-menu @click="addAt(moment.time, String($event.key))"><a-menu-item v-for="input in template.inputDefinitions" :key="input.id"><SelectOption :label="input.name || input.id" icon="ImportOutlined" :description="input.unit" /></a-menu-item></a-menu></template>
      </a-dropdown>
    </section>
    <a-button v-if="selectedInput" type="text" class="sample-editor__add" :disabled="loading" @click="add(selectedInput)"><AIcon type="PlusCircleOutlined" />{{ t('addSample') }}</a-button>
    <a-dropdown v-else-if="template.inputDefinitions.length" :trigger="['click']" :disabled="loading">
      <a-button type="text" class="sample-editor__add" :disabled="loading"><AIcon type="PlusCircleOutlined" />{{ t('trialAddMoment') }}</a-button>
      <template #overlay><a-menu @click="add(String($event.key))"><a-menu-item v-for="input in template.inputDefinitions" :key="input.id"><SelectOption :label="input.name || input.id" icon="ImportOutlined" :description="input.unit" /></a-menu-item></a-menu></template>
    </a-dropdown>
    <a-alert v-if="timeErrors.size" type="error" show-icon :message="t('sampleTimeRequired')" />
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateSampleValue from './TemplateSampleValue.vue'
import SelectOption from '@jetlinks-web-core/components/SelectOption/index.vue'
import TemplateReference from './TemplateReference.vue'
import { sampleInputs, simulationInputValue, patchSimulationInput, sampleExecutionTime, sampleDate, addSimulationSample, patchSimulationSample, type SimulationFacts, type SimulationSample } from './simulation'
import type { MetricTemplate, MetricTemplateInput } from '../types'
import { metricMessages } from '../messages'
const props = defineProps<{ template:MetricTemplate; facts:SimulationFacts; loading?:boolean; times?:number[]; selectedTime?:number; selectedInput?:string }>()
const emit = defineEmits<{ (event:'change', facts:SimulationFacts):void; (event:'invalid', value:boolean):void; (event:'select-time', time:number):void; (event:'clear-input'):void }>()
const { t } = useI18n({ useScope:'local', messages:metricMessages })
const valueEditors = new Map<number, InstanceType<typeof TemplateSampleValue>>()
function setValueEditor(index:number, editor:unknown) {
  if (editor) valueEditors.set(index, editor as InstanceType<typeof TemplateSampleValue>)
  else valueEditors.delete(index)
}
async function editSample(index:number) {
  await nextTick()
  if (!props.loading) await valueEditors.get(index)?.edit()
}
defineExpose({ editSample })
const timeErrors = ref(new Set<number>())
const invalid = computed(() => timeErrors.value.size > 0 || props.facts.samples.some(sample => sample.value == null))
watch(invalid, value => emit('invalid', value), { immediate:true, flush:'sync' })
const inputName = (id:string) => props.template.inputDefinitions.find(input => input.id === id)?.name || id
const moments = computed(() => {
  type Entry = { sample:SimulationSample; index:number; input:MetricTemplateInput; value:unknown }
  const inputTimes = new Set(props.facts.samples.map(sampleExecutionTime))
  const groups = new Map<number, Entry[]>((props.times || []).map(time => [time, []]))
  props.facts.samples.forEach((sample, index) => {
    const time = sampleExecutionTime(sample)
    if (time === undefined) return
    const entries = groups.get(time) || []
    const paths = new Set<string>()
    for (const id of sampleInputs(props.template, props.facts, sample)) {
      if (props.selectedInput && props.selectedInput !== id) continue
      const input = props.template.inputDefinitions.find(input => input.id === id)!
      const path=JSON.stringify(props.facts.configuration.inputMappings[id]?.valuePath || [])
      if (paths.has(path)) continue
      paths.add(path); entries.push({sample,index,input,value:simulationInputValue(props.facts,sample,id)})
    }
    groups.set(time, entries)
  })
  return [...groups].sort(([a], [b]) => a - b).map(([time, entries]) => ({ time, entries, hasInput:inputTimes.has(time) }))
})
function patch(index:number, fields:Partial<SimulationSample>) { if (!props.loading) emit('change', patchSimulationSample(props.facts, index, fields)) }
function changeTime(index:number, value:string) {
  if (props.loading) return
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) timeErrors.value.add(index)
  else timeErrors.value.delete(index)
  if (Number.isFinite(time)) patch(index, { eventTime:time })
}
async function addAt(time:number, id:string) {
  if (props.loading) return
  const index = props.facts.samples.length
  emit('change', addSimulationSample(props.template, props.facts, id, time)); emit('select-time', time)
  if (props.selectedInput && props.selectedInput !== id) emit('clear-input')
  await editSample(index)
}
function add(id:string) {
  let last:number | undefined
  for (const sample of props.facts.samples) { const time = sampleExecutionTime(sample); if (time !== undefined) last = Math.max(last ?? time, time) }
  addAt(last === undefined ? Date.now() : last + 60_000, id)
}
function remove(index:number) {
  if (props.loading) return
  timeErrors.value = new Set([...timeErrors.value].filter(position => position !== index).map(position => position > index ? position - 1 : position))
  emit('change', { ...props.facts, samples:props.facts.samples.filter((_, position) => position !== index) })
}
</script>
<style scoped>
.sample-editor { min-width:0 }
.sample-editor__moment { position:relative; margin:0 0 8px; padding:0 0 10px 20px; min-width:0 }
.sample-editor__moment::before { content:''; position:absolute; left:5px; top:18px; bottom:-8px; width:1px; background:var(--line) }
.sample-editor__moment:last-of-type::before { display:none }
.sample-editor__moment::after { content:''; position:absolute; left:1px; top:13px; width:9px; height:9px; border:1px solid var(--ink-3); background:var(--panel-background); border-radius:50% }
.sample-editor__moment.selected::after { border-color:var(--accent); background:var(--accent) }
.sample-editor__moment-time { display:flex; align-items:center; flex-wrap:wrap; gap:6px; width:100%; min-height:34px; padding:0; border:0; background:transparent; color:var(--ink-3); cursor:pointer; font-size:12px; text-align:left; font-variant-numeric:tabular-nums }
.sample-editor__moment-time[aria-pressed=true] { color:var(--accent) }
.sample-editor__sentence { display:flex; align-items:center; flex-wrap:wrap; gap:2px; min-height:34px; min-width:0; font-size:12px }
.sample-editor__sentence > :first-child { max-width:100%; overflow-wrap:anywhere }
.sample-editor__is,.sample-editor small { color:var(--ink-3); font-size:11px }
.sample-editor__value { min-width:44px; max-width:100%; color:var(--accent); font-size:13px }
.sample-editor__value :deep(.editable-field) { max-width:130px; min-width:40px }
.sample-editor__value :deep(.ant-select) { min-width:76px; max-width:160px }
.sample-editor__row.incomplete .sample-editor__value { border-bottom:1px dashed var(--accent) }
.sample-editor__action.ant-btn { padding:0 3px; height:24px; color:var(--ink-3); opacity:0 }
.sample-editor__row:hover .sample-editor__action,.sample-editor__row:focus-within .sample-editor__action { opacity:1 }
.sample-editor__data-time { display:block }
.sample-editor__at-add.ant-btn { height:24px; padding:0; font-size:11px; color:var(--ink-3) }
.sample-editor__add.ant-btn { padding-left:0; color:var(--accent); font-size:12px }
.sample-editor__filter { display:flex; align-items:center; gap:6px; margin-bottom:12px; font-size:12px; color:var(--ink-3) }
@media(hover:none) { .sample-editor__action.ant-btn { opacity:1 } }
</style>
