<template>
  <section class="metric-storage-fields" :aria-label="t('historyRecording')">
    <header v-if="!outputId"><b>{{ t('historyRecording') }}</b><small>{{ t('storageCount',{ stored:metricStoredOutputCount(template,modelValue || {}), total:template.outputs.length }) }}</small></header>
    <a-alert v-if="error" type="warning" show-icon :message="t('storageLoadFailed')"><template #action><a-button type="link" size="small" @click="emit('retry')">{{ t('retry') }}</a-button></template></a-alert>
    <div class="metric-storage-fields__list" :aria-busy="loading">
      <section v-for="output in outputs" :key="output.metricId" class="metric-storage-fields__row">
        <HistoryRecordingEditor :title="outputId ? undefined : metricOutputName(output,template)" :output="metricOutputWithStorage(output,modelValue?.[output.metricId])" :default-output="output" :inherited="!modelValue?.[output.metricId]" :complete-history="constraints?.includes(output.metricId)" :disabled="disabled || loading || !!error" @patch="change(output,$event)" @inherit="inherit(output.metricId)" />
        <small v-if="modelValue?.[output.metricId]" class="metric-storage-fields__override">{{ t('storageOverride') }}</small>
        <small v-if="constraints?.includes(output.metricId)"><AIcon type="LinkOutlined" />{{ t('storageHistoryRequired') }}</small>
      </section>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import HistoryRecordingEditor from './template/HistoryRecordingEditor.vue'
import { metricOutputName } from './presentation'
import { metricOutputWithStorage, metricStorageOverride, metricStoredOutputCount } from './outputStorage'
import { metricMessages } from './messages'
import type { MetricOutputStorage, MetricTemplate, MetricTemplateOutput } from './types'
const props = defineProps<{ template:MetricTemplate; modelValue?:Record<string,MetricOutputStorage>|null; outputId?:string; constraints?:string[]; disabled?:boolean; loading?:boolean; error?:string }>()
const emit = defineEmits<{ (event:'update:modelValue',value:Record<string,MetricOutputStorage>):void; (event:'retry'):void }>()
const { t } = useI18n({ useScope:'local',messages:metricMessages })
const outputs = computed(()=>props.outputId ? props.template.outputs.filter(output=>output.metricId === props.outputId) : props.template.outputs)
function change(output:MetricTemplateOutput, patch:Partial<MetricTemplateOutput>) {
  if (props.disabled || props.loading || props.error) return
  emit('update:modelValue',{ ...props.modelValue,[output.metricId]:metricStorageOverride({ ...metricOutputWithStorage(output,props.modelValue?.[output.metricId]), ...patch }) })
}
function inherit(id:string) {
  if (props.disabled || props.loading || props.error) return
  const next = { ...props.modelValue }; delete next[id]
  emit('update:modelValue',next)
}
</script>
<style scoped>
.metric-storage-fields { min-width:0; min-height:0; display:flex; flex-direction:column; gap:12px }
.metric-storage-fields>header { flex:none; display:grid; gap:4px }
.metric-storage-fields>header b { font-size:13px; font-weight:500 }
.metric-storage-fields__list { min-height:0; overflow:auto; overscroll-behavior:contain }
.metric-storage-fields__row { padding:12px 0; border-bottom:1px solid var(--line) }
.metric-storage-fields__row:first-child { padding-top:0 }
.metric-storage-fields__row:last-child { border:0 }
.metric-storage-fields small { display:block; color:var(--ink-3); font-size:11px; line-height:1.7 }
.metric-storage-fields small .anticon { margin-inline-end:5px }
.metric-storage-fields .metric-storage-fields__override { color:var(--accent) }
</style>
