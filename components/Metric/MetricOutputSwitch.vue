<template>
  <a-dropdown v-if="outputs.length > 1" :trigger="['click']">
    <button type="button" class="metric-output-switch" :aria-label="t('allOutputs')"><AIcon :type="metricOutputPresentation(selectedOutput,{template}).icon" />{{ name }}<AIcon type="DownOutlined" /></button>
    <template #overlay><a-menu :selected-keys="[outputId]" :aria-label="t('allOutputs')" @click="emit('change',String($event.key))">
      <a-menu-item v-for="item in outputs" :key="item.metricId"><SelectOption :label="metricOutputName(item,template) || t('unnamedOutput')" :icon="metricOutputPresentation(item,{template}).icon" /></a-menu-item>
    </a-menu></template>
  </a-dropdown>
  <span v-else class="metric-output-switch is-single">{{ name }}</span>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SelectOption from '@jetlinks-web-core/components/SelectOption/index.vue'
import { metricMessages } from './messages'
import { metricOutputName } from './presentation'
import { metricOutputPresentation } from './outputPresentation'
import type { MetricTemplate, MetricTemplateOutput } from './types'
const props=defineProps<{ template?:MetricTemplate; outputs?:MetricTemplateOutput[]; output?:MetricTemplateOutput; outputId:string }>()
const emit=defineEmits<{ (event:'change',id:string):void }>()
const { t }=useI18n({useScope:'local',messages:metricMessages})
const outputs=computed(()=>props.outputs || props.template?.outputs || [])
const selectedOutput=computed(()=>props.output || outputs.value.find(item=>item.metricId===props.outputId))
const name=computed(()=>metricOutputName(props.output,props.template) || t('unnamedOutput'))
</script>
<style scoped>
.metric-output-switch { display:inline-flex; align-items:center; gap:6px; max-width:100%; min-width:0; padding:3px 0; border:0; background:transparent; color:var(--ink-2); font:inherit; font-size:var(--fs-14,14px); text-align:left; overflow-wrap:anywhere; cursor:pointer }
.metric-output-switch>.anticon { flex:none; color:var(--ink-3); font-size:10px }
.metric-output-switch:not(.is-single):hover { color:var(--accent) }
.metric-output-switch:focus-visible { outline:2px solid var(--accent); outline-offset:3px; border-radius:3px }
.metric-output-switch.is-single { cursor:default }
</style>
