<template>
  <div v-if="compact" class="metric-trend-mini">
    <div v-if="kind === 'number' && sparkline.path" class="metric-trend-mini__plot" @pointermove="inspectPoint" @pointerleave="pointer = undefined">
    <svg viewBox="0 0 300 56" preserveAspectRatio="none" role="img" :aria-label="t('trend')">
      <path v-if="sparkline.zero !== undefined" class="metric-trend-mini__zero" :d="`M4,${sparkline.zero}H296`"><title>{{ t('statisticZero') }}</title></path>
      <path :d="sparkline.path" /><circle v-for="(point, index) in sparkline.points" :key="index" :cx="point[0]" :cy="point[1]" r="2" />
      <template v-if="inspected"><path class="metric-trend-mini__cursor" :d="`M${inspected.x},0v56`" /><circle :cx="inspected.x" :cy="inspected.y" r="2.5" /></template>
    </svg>
    <span v-if="sparkline.peak" class="metric-trend-mini__peak" role="img" :aria-label="`${t('samplePeak')} · ${time(sparkline.peak.time)} · ${reading(sparkline.peak.value)}`" :title="`${t('samplePeak')} · ${time(sparkline.peak.time)} · ${reading(sparkline.peak.value)}`" :style="{ left:`${sparkline.peak.x / 3}%`, top:`${sparkline.peak.y / 56 * 100}%` }" />
    <span v-if="inspected" class="metric-trend-mini__tooltip" role="tooltip" :style="{ left:`${inspected.x / 3}%`, transform:`translateX(-${inspected.x / 3}%)` }"><time>{{ time(inspected.time) }}</time><b>{{ reading(inspected.value) }}</b><small v-if="inspected.time === sparkline.peak?.time">{{ t('samplePeak') }}</small></span>
    </div>
    <MetricStateSamples v-else-if="(kind === 'state' || kind === 'boolean') && records.length" :entries="records" :labels="labels" :bounds="timeBounds" />
    <div v-else-if="visibleValues.length" class="metric-trend-mini__records">
      <div v-for="(value,index) in ordered.slice(0,2)" :key="metricResultReference(value) || index"><time v-if="resultTime(value)">{{ time(resultTime(value)!,true) }}</time><MetricValueView :value="value" inline hide-quality /></div>
    </div>
    <span v-else class="metric-trend-mini__empty">{{ t('noHistory') }}</span>
    <a-tooltip v-if="timeBounds" :title="limited && values.length ? t('trendSampleRangeHint') : undefined" :trigger="['hover', 'click']">
      <div class="metric-trend-mini__times" :class="{ 'is-limited': limited && values.length }" @click="limited && values.length && $event.stopPropagation()"><time>{{ time(timeBounds[0], true) }}</time><time>{{ time(timeBounds[1], true) }}</time></div>
    </a-tooltip>
  </div>
  <MetricHistoryTimeline v-else-if="kind === 'boolean' || kind === 'state'" :entries="records" :bounds="bounds" :limited="limited" :labels="labels" :can-inspect-source="canInspectSource" :unavailable="unavailable" :integrated="integrated" :reset-selection="resetSelection" @select="(entry:HistoryEntry|undefined,pinned:boolean)=>emit('select',entry,pinned)" @source="emit('source')"><template #tools><slot name="tools" /></template></MetricHistoryTimeline>
  <template v-else>
  <MetricStatisticSummary v-if="!integrated" :output="output" />
  <MetricChartTools :controls="kind === 'number' ? zoom.controls : undefined" :hint="t('trendSampleRangeHint')" :limited="limited"><slot name="tools" /></MetricChartTools>
  <Echarts v-if="kind === 'number' && visibleValues.length" :option="option" :events="chartEvents" :library="zoom.library" class="metric-trend" :class="{'is-integrated':integrated}" :tabindex="integrated ? 0 : undefined" @keydown="navigate" @ready="zoom.ready" @dispose="zoom.dispose" />
  <div v-else-if="visibleValues.length" class="metric-trend__history">
    <article v-for="(value, index) in ordered" :key="metricResultReference(value) || index" @click="selectValue(value)">
      <time v-if="resultTime(value)">{{ time(resultTime(value)!) }}</time>
      <MetricValueView :value="value" :output="output" :unit="displayUnit" inline />
    </article>
  </div>
  <a-empty v-else-if="!unavailable" :description="t('noHistory')" />
  </template>
</template>
<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { theme } from 'ant-design-vue'
import Echarts from '@jetlinks-web-core/components/Echarts'
import MetricValueView from './MetricValue.vue'
import { metricChartPoints, metricDurationText, metricResultReference, metricSparkline, metricSparklinePoint, resultTime } from './presentation'
import { formatMetricValue } from './extensions/presentationSettings'
import { useTimeZoom } from '@jetlinks-web-core/hooks/Echarts/useTimeZoom'
import MetricHistoryTimeline from './history/MetricHistoryTimeline.vue'
import MetricChartTools from './history/MetricChartTools.vue'
import MetricStateSamples from './history/MetricStateSamples.vue'
import { historyRecords, STATE_SAMPLE_LIMIT } from './history/projection'
import type { HistoryEntry } from './history/projection'
import { useHistoryKind } from './history/useHistoryTimeline'
import { metricOutputPresentation } from './outputPresentation'
import { metricStatisticBaseline, metricStatisticSigned, metricStatisticUnit, statisticMessages } from './statisticPresentation'
import MetricStatisticSummary from './MetricStatisticSummary.vue'
import type { MetricStateLabel, MetricTemplateOutput, MetricValue } from './types'
const props = defineProps<{ values: MetricValue[]; current?:MetricValue; output?:MetricTemplateOutput; unit?: string; compact?: boolean; bounds?: [number, number]; limited?: boolean; labels?:MetricStateLabel[]; stateOutput?:boolean; canInspectSource?:boolean; unavailable?:boolean; sampleInterval?:number;integrated?:boolean;resetSelection?:number;selectedValue?:MetricValue;aggregated?:boolean }>()
const emit = defineEmits<{ (event:'source'):void;(event:'select',entry:HistoryEntry|undefined,pinned:boolean):void }>()
const { t, locale } = useI18n({ useScope: 'local', messages: statisticMessages })
const { token } = theme.useToken()
const displayUnit=computed(()=>metricStatisticUnit(props.output,t,props.current,props.unit))
const baseline=computed(()=>metricStatisticBaseline(props.output))
const observedKind = useHistoryKind(toRef(props, 'values'), toRef(props, 'current'))
const declared = computed(() => metricOutputPresentation(props.output,{labels:props.labels}).history)
const declaredState = computed(() => props.stateOutput || declared.value === 'state')
const kind = computed(() => declaredState.value ? 'state' : declared.value === 'auto' ? observedKind.value : declared.value)
const visibleValues = computed(() => props.values.filter(value => {
  const time = resultTime(value)
  return time != null && (!props.bounds || time >= props.bounds[0] && time <= props.bounds[1])
}))
const records = computed(() => historyRecords(visibleValues.value, undefined, !!declaredState.value))
const numericPoints = computed(() => metricChartPoints(visibleValues.value,props.sampleInterval))
// 只有两侧都没有连续读数的孤立点需要常显标记，不能因一个孤点打开整条曲线的标记。
const isolatedIndexes = computed(() => numericPoints.value.flatMap((point,index,points) => point[1]!==null
  && (index===0 || points[index-1][1]===null) && (index===points.length-1 || points[index+1][1]===null) ? [index] : []))
function selectValue(value:MetricValue) {
  if (props.aggregated) return
  const entry = historyRecords([value],undefined,true)[0]
  if (entry) emit('select',entry,true)
}
function navigate(event:KeyboardEvent) {
  if (!props.integrated || !['ArrowLeft','ArrowRight','Home','End','Escape'].includes(event.key)) return
  event.preventDefault(); event.stopPropagation()
  if (event.key === 'Escape') { emit('select',undefined,false); return }
  const values = [...visibleValues.value].sort((left,right)=>(resultTime(left) || 0)-(resultTime(right) || 0))
  const index = values.findIndex(value=>metricResultReference(value) && metricResultReference(value) === metricResultReference(props.selectedValue))
  const target = event.key === 'Home' ? values[0] : event.key === 'End' ? values.at(-1)
    : values[Math.max(0,Math.min(values.length-1,(index < 0 ? values.length-1 : index)+(event.key === 'ArrowLeft' ? -1 : 1)))]
  if (target) selectValue(target)
}
const chartEvents = computed(()=>({...zoom.events,click:(raw:unknown)=>{
  const event=raw as {seriesIndex?:number;dataIndex?:number}
  if (event.dataIndex == null || event.seriesIndex !== 0 && event.seriesIndex !== 1) return
  const index = event.seriesIndex === 1 ? isolatedIndexes.value[event.dataIndex] : event.dataIndex
  const point = numericPoints.value[index]
  if (!point || point[1] === null) return
  // 同时同值的记录仍各有执行身份，按图中实际点序匹配，不能总是选中最后一条。
  const occurrence = numericPoints.value.slice(0,index).filter(item=>item[0] === point[0] && item[1] === point[1]).length
  const value = visibleValues.value.filter(value=>resultTime(value) === point[0] && metricChartPoints([value])[0]?.[1] === point[1])[occurrence]
  if (value) selectValue(value)
}}))
const duration = computed(() => metricDurationText(0, displayUnit.value, t) !== undefined)
const durationLabel = (value: unknown) => metricDurationText(value, displayUnit.value, t) ?? metricStatisticSigned(formatMetricValue(value,undefined,props.output),value,props.output)
// 坐标刻度保持短读数；主值和悬停仍保留既有展示精度，不修改结果数据。
const axisLabel=(value:number)=>new Intl.NumberFormat(String(locale.value),{maximumSignificantDigits:3,
  notation:Math.abs(value)>=1e6 || value!==0 && Math.abs(value)<.001 ? 'scientific' : 'standard'}).format(value)
const ordered = computed(() => [...visibleValues.value].sort((a, b) => (resultTime(b) || 0) - (resultTime(a) || 0)))
const timeBounds = computed<[number, number] | undefined>(() => {
  if (props.compact && (kind.value === 'state' || kind.value === 'boolean') && records.value.length) {
    const recent = records.value.slice(-STATE_SAMPLE_LIMIT)
    return [recent[0].time,recent[recent.length - 1].time]
  }
  const first = ordered.value[ordered.value.length - 1], last = ordered.value[0]
  const start = first && resultTime(first), end = last && resultTime(last)
  const actual: [number, number] | undefined = start != null && end != null ? [start, end] : undefined
  // 达到查询上限时，缩略图明确展示返回样本的时间段；详情仍保留用户选择的完整查询范围。
  return props.compact && props.limited && actual ? actual : props.bounds || actual
})
const sparkline = computed(() => metricSparkline(numericPoints.value, timeBounds.value,baseline.value))
const pointer = ref<number>()
const numericZoom=ref<[number,number]>()
const zoom = useTimeZoom(timeBounds,numericZoom,value => { numericZoom.value=value },t,true)
watch(()=>props.resetSelection,()=>zoom.controls.reset())
const inspected = computed(() => pointer.value === undefined ? undefined : metricSparklinePoint(numericPoints.value, pointer.value, timeBounds.value,baseline.value))
const reading = (value:number) => `${durationLabel(value)}${duration.value || !displayUnit.value ? '' : ` ${displayUnit.value}`}`
/** 悬停只定位已读取的样本，不插值、不查历史；提示覆盖图层，不参与卡片排版。 */
function inspectPoint(event:PointerEvent) {
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  pointer.value = bounds.width ? Math.max(0, Math.min(300, (event.clientX - bounds.left) / bounds.width * 300)) : undefined
}
const time = (value: number, short = false) => {
  const spansDays = timeBounds.value && new Date(timeBounds.value[0]).toDateString() !== new Date(timeBounds.value[1]).toDateString()
  return new Date(value).toLocaleString(String(locale.value), short ? { ...(spansDays ? { month: '2-digit', day: '2-digit' } as const : {}), hour: '2-digit', minute: '2-digit' } : undefined)
}
const option = computed(() => ({
  ...zoom.option.value,
  color: [token.value.colorPrimary],
  grid: { left: duration.value ? 88 : 60, right: 24, top: displayUnit.value && !duration.value ? 28 : 16, bottom: zoom.controls.overview.value ? 60 : 32 },
  tooltip: { trigger: 'axis' as const, confine: true, renderMode: 'richText' as const, valueFormatter:(value:unknown) => duration.value ? durationLabel(value) : `${durationLabel(value)}${displayUnit.value ? ' '+displayUnit.value : ''}` },
  xAxis: { type: 'time' as const, min: zoom.extent.value?.[0], max: zoom.extent.value?.[1] },
  yAxis: { type: 'value' as const, name: duration.value ? '' : displayUnit.value || '', nameTextStyle:{align:'left' as const}, scale: !baseline.value,
    ...(baseline.value==='centered' ? { min:(range:{min:number;max:number})=>-Math.max(Math.abs(range.min),Math.abs(range.max)) || -1,max:(range:{min:number;max:number})=>Math.max(Math.abs(range.min),Math.abs(range.max)) || 1 } : {}),
    axisLabel: { formatter: duration.value ? durationLabel : axisLabel } },
  series: [{ type: 'line' as const, showSymbol: false, connectNulls: false, data: numericPoints.value,
    ...(baseline.value==='centered' ? {markLine:{silent:true,symbol:'none',label:{show:false},lineStyle:{type:'dashed',opacity:.35},data:[{yAxis:0}]}} : {}),
    markPoint: props.selectedValue && Number.isFinite(Number(props.selectedValue.value)) ? {silent:true,symbol:'circle',symbolSize:8,label:{show:false},data:[{coord:[resultTime(props.selectedValue),Number(props.selectedValue.value)]}]} : {data:[]} },
    { type:'scatter' as const, symbolSize:5, tooltip:{show:false}, data:isolatedIndexes.value.map(index=>numericPoints.value[index]) }]
}))
</script>
<style scoped>
.metric-trend { height:280px; width:100% }
.metric-trend.is-integrated { height:172px }
.metric-trend-mini { display:flex; flex-direction:column; justify-content:center; min-width:0; min-height:72px }
.metric-trend-mini svg { display:block; width:100%; height:48px; overflow:visible }
.metric-trend-mini__plot { position:relative; height:48px; flex:none }
.metric-trend-mini__tooltip { position:absolute; top:-6px; display:flex; align-items:center; gap:8px; padding:3px 8px; font-size:11px; white-space:nowrap; pointer-events:none; line-height:18px; background:var(--bg); border:1px solid var(--line); border-radius:var(--r-2,6px); color:var(--ink-3); z-index:1 }
.metric-trend-mini__tooltip b { color:var(--ink-1); font-weight:500 }
.metric-trend-mini__tooltip small { font-size:10px; color:var(--accent) }
.metric-trend-mini path.metric-trend-mini__cursor { stroke:var(--ink-3); stroke-dasharray:2 2; stroke-width:1 }
.metric-trend-mini path.metric-trend-mini__zero { stroke:var(--ink-3); stroke-dasharray:3 3; stroke-width:1; opacity:.5 }
.metric-trend-mini path { fill:none; stroke:var(--accent); stroke-width:1.8; vector-effect:non-scaling-stroke }
.metric-trend-mini circle { fill:var(--accent); stroke:var(--panel-background); stroke-width:1; vector-effect:non-scaling-stroke }
.metric-trend-mini__peak { position:absolute; width:5px; height:5px; transform:translate(-50%,-50%); border:1px solid var(--accent); border-radius:50%; background:var(--bg); pointer-events:none }
.metric-trend-mini__times.is-limited { cursor:help }
.metric-trend-mini__times { display:flex; align-items:center; justify-content:space-between; gap:8px; color:var(--ink-2); font-size:var(--fs-12,12px) }
.metric-trend-mini__times { padding-top:6px; color:var(--ink-3); font-size:11px }
.metric-trend-mini__empty { color:var(--ink-2); font-size:var(--fs-12,12px); text-align:center }
.metric-trend-mini__records { display:grid; gap:4px; min-width:0; font-size:var(--fs-12,12px) }
.metric-trend-mini__records>div { display:flex; align-items:center; gap:8px; min-width:0 }
.metric-trend-mini__records time { flex:none; color:var(--ink-3) }
.metric-trend-mini__records :deep(.metric-value) { min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis }
.metric-trend__history { display:grid; gap:var(--space-3,12px); max-height:320px; overflow:auto }
.metric-trend__history article { display:flex; align-items:center; justify-content:space-between; gap:16px; border-bottom:1px solid var(--line); padding-bottom:10px }
.metric-trend__history time { color:var(--ink-2); font-size:var(--fs-12,12px) }
</style>
