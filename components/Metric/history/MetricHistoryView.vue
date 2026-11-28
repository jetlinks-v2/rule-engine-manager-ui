<template>
  <div ref="element" class="metric-history-view">
    <div class="metric-history-view__tools">
      <slot name="tools" />
      <a-select v-if="available && (!aggregate.operation.value || aggregate.operations.value.length)" :value="aggregate.operation.value" :aria-label="t('historyAggregation')" :loading="aggregate.loading.value" option-label-prop="label" :bordered="false" :dropdown-match-select-width="false" :virtual="false" :list-height="320" size="small" @keydown.esc.stop @dropdownVisibleChange="($event:boolean) => $event && aggregate.describe()" @change="aggregate.operation.value = $event">
        <a-select-option value="" :label="t('historyRaw')"><SelectOption icon="HistoryOutlined" :label="t('historyRaw')" :description="t('historyRawHint')" /></a-select-option>
        <a-select-option v-for="option in aggregate.operations.value" :key="option.id" :value="option.id" :label="option.name"><SelectOption :icon="option.icon" :label="option.name" :description="t('historyOperationHint_'+option.id)" /></a-select-option>
      </a-select>
      <a-select v-if="aggregate.operation.value" v-model:value="aggregate.interval.value" :aria-label="t('historyBucket')" option-label-prop="label" :bordered="false" :dropdown-match-select-width="false" :virtual="false" :list-height="320" size="small" @keydown.esc.stop>
        <a-select-option :value="0" :label="t('historyBucketAuto')"><SelectOption icon="CompressOutlined" :label="t('historyBucketAuto')" :description="t('historyBucketAutoHint')" /></a-select-option>
        <a-select-option v-for="option in intervals" :key="option.value" :value="option.value" :label="t('historyBucketEvery',{value:t(option.label)})" :disabled="!bounds || option.value > bounds[1]-bounds[0] || Math.ceil((bounds[1]-bounds[0])/option.value)>256"><SelectOption icon="ClockCircleOutlined" :label="t('historyBucketEvery',{value:t(option.label)})" :description="t('historyBucketHint')" /></a-select-option>
      </a-select>
      <MetricChartTools v-if="chartTools" v-bind="chartTools" inline />
    </div>
    <slot name="caption" />
    <a-alert v-if="aggregate.error.value" type="error" show-icon :message="t('readFailed')" :description="aggregate.error.value"><template #action><a-button size="small" @click="aggregate.refresh">{{ t('retry') }}</a-button><a-button v-if="states" size="small" @click="aggregate.operation.value=''">{{ t('historyRaw') }}</a-button></template></a-alert>
    <template v-if="aggregate.operation.value">
      <a-skeleton v-if="aggregate.loading.value" active :paragraph="{rows:4}" />
      <template v-else-if="!aggregate.error.value && aggregate.bounds.value">
        <template v-if="aggregate.operation.value==='distribution'"><div class="metric-history-view__caption"><a-tooltip :title="t('stateMatrixHint')"><span>{{ t('stateRecordCount',{count:records}) }} <AIcon type="InfoCircleOutlined" /></span></a-tooltip><time>{{ t('readAt') }} {{ new Date(aggregate.bounds.value[1]).toLocaleTimeString() }}</time></div><MetricStateMatrix :buckets="aggregate.response.value?.buckets || []" :bounds="aggregate.bounds.value" :labels="labels" @drilldown="drilldown" /></template>
        <template v-else><small class="metric-history-view__caption">{{ t('historyAggregatedValid') }}</small><MetricTrend aggregated integrated :values="aggregate.values.value" :output="output" :bounds="aggregate.bounds.value" :sample-interval="aggregate.width.value" /></template>
      </template>
    </template>
    <slot v-else />
  </div>
</template>
<script setup lang="ts">
import { computed, provide, ref, shallowRef, toRef } from 'vue'
import { useElementSize } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import MetricTrend from '../MetricTrend.vue'
import MetricStateMatrix from './MetricStateMatrix.vue'
import SelectOption from '@jetlinks-web-core/components/SelectOption/index.vue'
import { metricMessages } from '../messages'
import { metricOutputPresentation } from '../outputPresentation'
import { useMetricHistoryAggregate } from './useMetricHistoryAggregate'
import MetricChartTools from './MetricChartTools.vue'
import { metricChartToolsKey, type MetricChartToolsState } from './chartTools'
import type { MetricReference, MetricTemplateOutput, MetricStateLabel, MetricHistoryOperation } from '../types'
const props = defineProps<{reference:MetricReference;output?:MetricTemplateOutput;bounds?:[number,number];inaccessible?:boolean;stateOutput?:boolean;intervals?:boolean;labels?:MetricStateLabel[];dataVersion?:string;queryKey?:string}>()
const emit=defineEmits<{(event:'drilldown',range:[number,number]):void}>()
const {t} = useI18n({useScope:'local',messages:metricMessages})
const chartTools=shallowRef<MetricChartToolsState>()
provide(metricChartToolsKey,chartTools)
const element=ref<HTMLElement>(),{width}=useElementSize(element)
const states=computed(()=>!props.intervals && (props.stateOutput || ['state','boolean'].includes(metricOutputPresentation(props.output).history)))
const available = computed(() => !props.inaccessible && !props.intervals && (states.value || ['number','auto'].includes(metricOutputPresentation(props.output).history)) && props.output?.aggregatable !== false)
const initialOperation=computed<MetricHistoryOperation | ''>(()=>states.value ? 'distribution' : '')
const bucketCount=computed(()=>states.value ? Math.max(8,Math.min(128,Math.floor(width.value/12) || 64)) : 200)
const aggregate = useMetricHistoryAggregate(toRef(props,'reference'),toRef(props,'bounds'),available,undefined,toRef(props,'dataVersion'),toRef(props,'queryKey'),initialOperation,bucketCount)
const records=computed(()=>aggregate.response.value?.buckets.reduce((total,bucket)=>total+(bucket.states || []).reduce((sum,state)=>sum+state.count,0),0) || 0)
function drilldown(range:[number,number]){aggregate.operation.value='';emit('drilldown',range)}
const intervals = [{value:60000,label:'historyOneMinute'},{value:300000,label:'historyFiveMinutes'},{value:3600000,label:'historyOneHour'}]
defineExpose({refresh:() => { if (aggregate.operation.value) void aggregate.refresh() }})
</script>
<style scoped>
.metric-history-view { min-width:0 }
.metric-history-view__tools { display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:8px }
.metric-history-view__tools :deep(.ant-select) { min-width:104px; font-size:12px }
.metric-history-view__tools :deep(.metric-chart-tools) { flex:0 0 auto; margin:0 0 0 auto }
.metric-history-view__caption { display:flex; justify-content:space-between; gap:8px; color:var(--ink-3); font-size:12px; margin:4px 0 }
</style>
