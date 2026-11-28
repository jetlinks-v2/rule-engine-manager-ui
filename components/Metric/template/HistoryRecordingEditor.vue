<template>
  <TemplateClause stacked icon="HistoryOutlined" :title="title || t('historyRecording')">
    <div class="history-recording">
      <span>{{ t('historyRecordAs') }}</span>
      <Editable type="select" :value="mode" :component-props="{ disabled, bordered:false, defaultOpen:true, dropdownMatchSelectWidth:false, 'aria-label':t('historyRecording'), options:choices }" @change="choose($event as Mode)" />
      <template v-if="mode === 'interval'">
        <span>{{ t('historyRecordEvery') }}</span>
        <TemplateDuration :model-value="duration(output.history?.intervalMillis || 60000)" :min="0.001" :disabled="disabled" @update:model-value="setDuration('intervalMillis',$event)" />
      </template>
      <template v-if="mode === 'onChange'">
        <span>{{ t('historyDeadband') }}</span>
        <Editable type="number" :value="output.history?.deadband || 0" :component-props="{ min:0, disabled, controls:false, bordered:false, 'aria-label':t('historyDeadband') }" @change="patch({ deadband:Number($event || 0) })" />
        <span>{{ output.unit || '' }}{{ t('historyRecordAtMost') }}</span>
        <TemplateDuration :model-value="duration(output.history?.maxIntervalMillis || 0)" :disabled="disabled" :empty-label="t('historyNoHeartbeat')" @update:model-value="setDuration('maxIntervalMillis',$event)" />
      </template>
    </div>
    <small v-if="mode === 'interval' || mode === 'onChange' && output.history?.maxIntervalMillis">{{ t('historyRecordingIntervalHint') }}</small>
  </TemplateClause>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Editable from '@jetlinks-web-core/components/Editable/index.vue'
import TemplateClause from './TemplateClause.vue'
import TemplateDuration from './TemplateDuration.vue'
import { durationSeconds } from './window'
import { metricMessages } from '../messages'
import type { MetricTemplateOutput, MetricHistoryPolicy } from '../types'
import { metricStorageMode, metricStorageSummary } from '../outputStorage'
const props = defineProps<{ output:MetricTemplateOutput; disabled?:boolean; title?:string; defaultOutput?:MetricTemplateOutput; inherited?:boolean; completeHistory?:boolean }>()
const emit = defineEmits<{ (event:'patch', value:Partial<MetricTemplateOutput>):void; (event:'inherit'):void }>()
const { t } = useI18n({ useScope:'local', messages:metricMessages })
type Mode = MetricHistoryPolicy['mode'] | 'latest' | 'inherit'
const mode = computed<Mode>(()=>props.inherited ? 'inherit' : metricStorageMode(props.output))
const choices = computed(()=>[
  ...(props.defaultOutput ? [{ value:'inherit', label:t('storageInheritTemplate',{ policy:metricStorageSummary(props.defaultOutput,t) }), icon:'BranchesOutlined', disabled:props.completeHistory && metricStorageMode(props.defaultOutput) !== 'all' }] : []),
  { value:'all', label:t('historyAllResults'), icon:'UnorderedListOutlined' },
  { value:'onChange', label:t('historyOnChange'), icon:'SwapOutlined', disabled:props.completeHistory },
  { value:'interval', label:t('historyInterval'), icon:'ClockCircleOutlined', disabled:props.completeHistory },
  { value:'latest', label:t('configLatestOnly'), icon:'DashboardOutlined', disabled:props.completeHistory },
])
function choose(value:Mode) {
  if (props.disabled) return
  if (props.completeHistory && (value === 'inherit' ? !props.defaultOutput || metricStorageMode(props.defaultOutput) !== 'all' : value !== 'all')) return
  if (value === 'inherit') { emit('inherit'); return }
  emit('patch',{ persist:value !== 'latest', latestOnly:value === 'latest', history:value === 'all' || value === 'latest' ? undefined : { mode:value, deadband:0, intervalMillis:value === 'interval' ? 60000 : 0, maxIntervalMillis:value === 'onChange' ? 60000 : 0 } })
}
function patch(fields:Partial<MetricHistoryPolicy>) { if (!props.disabled && props.output.history) emit('patch',{ history:{ ...props.output.history, ...fields } }) }
const duration = (millis:number)=>millis > 0 ? `PT${millis / 1000}S` : undefined
function setDuration(field:'intervalMillis'|'maxIntervalMillis', value?:string) {
  const millis = (durationSeconds(value) || 0) * 1000
  if (field === 'intervalMillis' && millis <= 0) return
  patch({ [field]:Math.round(millis) })
}
</script>
<style scoped>
.history-recording { display:flex; flex-wrap:wrap; align-items:center; gap:0 4px; line-height:32px; min-width:0 }
.history-recording :deep(.editable-field) { color:var(--accent) }
.history-recording :deep(.ant-input-number) { width:64px }
small { display:block; color:var(--ink-3); font-size:12px; line-height:1.6 }
</style>
