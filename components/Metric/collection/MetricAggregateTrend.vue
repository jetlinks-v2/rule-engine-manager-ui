<template>
  <div class="aggregate-trend">
    <MetricTrend v-if="operation!=='distribution' && hasData" :values="numericSamples" :output="group.output" :unit="group.output.unit" :bounds="bounds" :sample-interval="interval" :compact="compact" />
    <template v-else-if="operation==='distribution' && hasData">
      <MetricChartTools v-if="!compact" :controls="zoom.controls" :hint="t('aggregateHistoryHint')" />
      <Echarts :option="option" :library="library" :events="zoom.events" :style="{height:compact ? '72px' : zoom.controls.overview.value ? '184px' : '160px'}" @ready="zoom.ready" @dispose="zoom.dispose" />
    </template>
    <div v-else class="aggregate-trend__empty"><AIcon type="LineChartOutlined" />{{ t('noTrendPoints') }}</div>
  </div>
</template>
<script setup lang="ts">
import { computed,toRef } from 'vue'
import { theme } from 'ant-design-vue'
import { BarChart } from 'echarts/charts'
import { useI18n } from 'vue-i18n'
import Echarts from '@jetlinks-web-core/components/Echarts'
import MetricChartTools from '../history/MetricChartTools.vue'
import MetricTrend from '../MetricTrend.vue'
import { useTimeZoom } from '@jetlinks-web-core/hooks/Echarts/useTimeZoom'
import { stateAppearance,recordedStateLabel } from '../stateIntervals'
import { formatMetricValue } from '../extensions/presentationSettings'
import { metricMessages } from '../messages'
import { aggregateValue,aggregateStateValue } from './aggregatePresentation'
import { collectionMessages } from './messages'
import type { MetricAggregateGroup,ReadOperation } from './types'
const props=defineProps<{group:MetricAggregateGroup;operation:ReadOperation;bounds:[number,number];interval:number;view?:[number,number];compact?:boolean}>()
const emit=defineEmits<{(event:'update:view',value:[number,number] | undefined):void}>()
const { t,locale }=useI18n({useScope:'local',messages:{zh:{...metricMessages.zh,...collectionMessages.zh},en:{...metricMessages.en,...collectionMessages.en}}})
const {token}=theme.useToken()
const zoom=useTimeZoom(toRef(props,'bounds'),toRef(props,'view'),value=>emit('update:view',value),t,true)
const library=[BarChart,...zoom.library]
const hasData=computed(()=>props.group.points.some(point=>props.operation==='distribution' ? point.observed>0 : aggregateValue(point,props.operation)!==undefined))
// A view of recorded bucket readings; it carries no execution identity or inferred member state.
const numericSamples=computed(()=>props.group.points.map(point=>({metricId:props.group.output.metricId,evaluationTime:point.time,value:aggregateValue(point,props.operation)})))
const label=(key:string)=>recordedStateLabel(aggregateStateValue(props.group,key),props.group.stateLabels || [],String(locale.value),t)
const color=(key:string)=>{
  const value=stateAppearance(aggregateStateValue(props.group,key),props.group.stateLabels).color
  return value.startsWith('var(--accent') ? token.value.colorPrimary : value.startsWith('var(--ink') ? token.value.colorTextTertiary : value.startsWith('var(--jet-theme-success') ? token.value.colorSuccess : value
}
const option=computed(()=>{
  const points=new Map(props.group.points.map(point=>[point.time,point]))
  const times=Array.from({length:Math.ceil((props.bounds[1]-props.bounds[0])/props.interval)},(_,index)=>props.bounds[0]+index*props.interval)
  const states=[...new Set(props.group.points.flatMap(point=>Object.keys(point.distribution)))]
  return {...zoom.option.value,animation:false,
    grid:{left:props.compact ? 4 : 38,right:12,top:8,bottom:props.compact ? 20 : zoom.controls.overview.value ? 52 : 28},
    tooltip:{trigger:'axis',appendTo:'body',renderMode:'html',valueFormatter:(value:unknown)=>formatMetricValue(value)},
    xAxis:{type:'time',min:zoom.extent.value?.[0],max:zoom.extent.value?.[1],splitNumber:3,axisLabel:{hideOverlap:true,color:token.value.colorTextTertiary}},
    yAxis:{type:'value',show:!props.compact,min:0,minInterval:1,splitNumber:3,axisLabel:{color:token.value.colorTextTertiary},splitLine:{lineStyle:{color:token.value.colorSplit}}},
    series:[...states.map(key=>({id:'state:'+key,name:label(key),type:'bar',stack:'states',barMaxWidth:12,itemStyle:{color:color(key)},data:times.map(time=>[time,points.has(time) ? points.get(time)!.distribution[key] || 0 : null])})),
      {id:'unknown',name:t('unknown'),type:'bar',stack:'states',barMaxWidth:12,itemStyle:{color:token.value.colorTextQuaternary},data:times.map(time=>[time,points.has(time) ? points.get(time)!.observed-points.get(time)!.valid : null])}],
  }
})
</script>
<style scoped>
.aggregate-trend__empty{min-height:72px;display:flex;align-items:center;justify-content:center;gap:6px;font-size:12px;color:var(--ink-3)}
</style>
