<template>
  <span class="trial-input">
    <template v-if="snapshot?.entry?.sample && snapshot.entry.sampleIndex !== undefined">
      <AIcon type="ExperimentOutlined" :title="t('simulationInput')" /><small class="trial-input__label">{{ t('semanticSample') }}</small>
      <TemplateSampleValue v-if="simple" class="trial-input__value" :template="template" :input="input" :value="snapshot.entry.sample.value" :disabled="disabled" @change="trial.patchValue(snapshot!.entry!.sampleIndex!, $event)" />
      <button v-else type="button" class="trial-input__complex" :disabled="disabled" @click="emit('details')">{{ simulationValueText(snapshot.entry.sample.value, t) }}</button>
      <small>{{ snapshot.entry.sample.unit || input.unit }}</small>
      <button type="button" class="trial-input__details" :aria-label="`${input.name || input.id} · ${t('simulationInput')}`" :title="`${t('simulationInput')} · ${sampleDate(snapshot.entry.time).replace('T',' ')}`" @click="emit('details')"><AIcon type="UnorderedListOutlined" /><small v-if="snapshot.alternatives.length > 1">{{ snapshot.alternatives.length }}</small></button>
    </template>
    <button v-else type="button" class="trial-input__add" :disabled="disabled || !trial.facts" @click="add"><AIcon type="PlusOutlined" />{{ t('addSimulationInput') }}</button>
  </span>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateSampleValue from './TemplateSampleValue.vue'
import { sampleDate } from './simulation'
import { simulationValueText } from './simulationFlow'
import type { SimulationNodePreview } from './simulationPreview'
import type { TemplateSimulationState } from './useTemplateSimulation'
import type { MetricTemplate, MetricTemplateInput } from '../types'
import { metricMessages } from '../messages'
const props = defineProps<{ template?:MetricTemplate; input:MetricTemplateInput; snapshot?:SimulationNodePreview; trial:TemplateSimulationState; disabled:boolean }>()
const emit = defineEmits<{ (event:'details', editValue?:boolean):void }>()
const { t } = useI18n({ useScope:'local', messages:metricMessages })
const simple = computed(() => !['object','array'].includes(String(props.input.valueType?.type)))
function add() {
  if (props.disabled || !props.trial.facts) return
  props.trial.addSample(props.input.id); emit('details', true)
}
</script>
<style scoped>
.trial-input { display:flex; align-items:center; gap:5px; width:100%; min-width:0; color:var(--ink-3); font-size:11px }
.trial-input small { flex:none; font-size:11px }
.trial-input > :first-child,.trial-input__details { flex:none }
.trial-input__value,.trial-input__complex { flex:1; min-width:0 }
.trial-input__value { flex-wrap:nowrap; height:24px; align-items:center }
.trial-input__value :deep(.editable-field) { width:100%; height:24px; min-width:0; max-width:100% }
.trial-input__value :deep(.editable-field .text) { height:24px; line-height:24px; padding-inline:4px }
.trial-input__value :deep(.ant-input-number),.trial-input__value :deep(.ant-select) { min-width:0; max-width:100% }
.trial-input__value :deep(.ant-input-number-input) { height:24px }
.trial-input button { display:inline-flex; align-items:center; gap:4px; padding:0; border:0; background:transparent; color:var(--ink-3); cursor:pointer; font-size:11px; min-height:24px }
.trial-input button:disabled { cursor:default; opacity:.5 }
.trial-input button:focus-visible { outline:2px solid var(--accent) }
.trial-input__details { margin-left:auto }
.trial-input__label { color:var(--ink-3) }
.trial-input__complex { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; color:var(--accent) !important }
</style>
