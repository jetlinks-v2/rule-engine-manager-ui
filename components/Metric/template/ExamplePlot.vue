<template>
  <figure v-if="points.length" class="example-plot" :aria-label="label">
    <svg viewBox="0 0 300 154" role="img" :aria-label="label">
      <title>{{ label }}</title>
      <line class="example-plot__axis" x1="30" y1="118" x2="280" y2="118" />
      <text class="example-plot__caption" x="30" y="12">{{ plot.valueLabel }}</text>
      <text class="example-plot__caption" x="280" y="152" text-anchor="end">{{ plot.timeLabel }}</text>
      <template v-for="time in ticks" :key="time">
        <line class="example-plot__tick" :x1="x(time)" :x2="x(time)" y1="118" y2="122" />
        <text class="example-plot__caption" :x="x(time)" y="136" text-anchor="middle">{{ time }}</text>
      </template>
      <template v-if="plot.style === 'bar'"><line v-for="(point,index) in points" :key="index" class="example-plot__bar" :x1="x(point.time)" :x2="x(point.time)" :y1="y(0)" :y2="y(point.value)" /></template>
      <path v-if="plot.style === 'line' || plot.style === 'step'" class="example-plot__line" :d="path" />
      <g v-for="(guide,index) in plot.guides || []" :key="'g'+index" class="example-plot__guide">
        <line :x1="x(guide.fromTime)" :y1="y(guide.fromValue)" :x2="x(guide.toTime)" :y2="y(guide.toValue)" />
        <circle v-if="guide.fromTime === guide.toTime && guide.fromValue === guide.toValue" :cx="x(guide.fromTime)" :cy="y(guide.fromValue)" r="6" />
        <text v-if="guide.label" :x="guideLabel(guide).x" :y="guideLabel(guide).y" :text-anchor="guideLabel(guide).anchor">{{ guide.label }}</text>
      </g>
      <g v-for="(point,index) in points" :key="'p'+index" class="example-plot__point">
        <circle :cx="x(point.time)" :cy="y(point.value)" r="3"><title>{{ point.value }} · {{ point.time }}s</title></circle>
        <text :x="x(point.time)" :y="y(point.value)-9" text-anchor="middle">{{ point.value }}</text>
      </g>
    </svg>
  </figure>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import type { MetricCalculatorDocumentation } from '../types'
type Visualization = NonNullable<MetricCalculatorDocumentation['examples'][number]['visualization']>
const props = defineProps<{ plot:Visualization; label:string }>()
// 只投影后端算例坐标，不拟合、插值或计算结果。
const points = computed(() => props.plot.samples.filter(point=>typeof point.value === 'number' && Number.isFinite(point.value)).map(point=>({time:point.offsetSeconds,value:point.value as number})))
const ticks = computed(() => [...new Set([...points.value.map(point=>point.time),...(props.plot.endSeconds == null ? [] : [props.plot.endSeconds])])])
const timeBounds = computed(() => {
  const times=[...ticks.value,...(props.plot.guides || []).flatMap(guide=>[guide.fromTime,guide.toTime])]
  return {min:Math.min(0,...times),max:Math.max(1,...times)}
})
const valueBounds = computed(() => {
  const values=[...points.value.map(point=>point.value),...(props.plot.guides || []).flatMap(guide=>[guide.fromValue,guide.toValue])]
  return {min:Math.min(0,...values),max:Math.max(1,...values)}
})
const x=(time:number)=>30+(time-timeBounds.value.min)/(timeBounds.value.max-timeBounds.value.min)*250
const y=(value:number)=>114-(value-valueBounds.value.min)/(valueBounds.value.max-valueBounds.value.min)*82
const path=computed(()=>{
  const segments=points.value.map((point,index)=>index === 0 ? `M${x(point.time)},${y(point.value)}` : props.plot.style === 'step' ? `H${x(point.time)}V${y(point.value)}` : `L${x(point.time)},${y(point.value)}`)
  if(props.plot.style === 'step' && props.plot.endSeconds != null && points.value.length)segments.push(`H${x(props.plot.endSeconds)}`)
  return segments.join(' ')
})
function guideLabel(guide:Visualization['guides'][number]) {
  const vertical=guide.fromTime === guide.toTime
  const point=vertical && guide.fromValue === guide.toValue
  const nearStart=point && guide.fromTime === timeBounds.value.min
  return {x:point ? x(guide.toTime)+(nearStart ? 10 : -10) : vertical ? x(guide.toTime)-6 : (x(guide.fromTime)+x(guide.toTime))/2,
    y:point ? y(guide.toValue)+4 : vertical ? (y(guide.fromValue)+y(guide.toValue))/2 : y(guide.fromValue)-6,
    anchor:vertical ? nearStart ? 'start' : 'end' : 'middle'}
}
</script>
<style scoped>
.example-plot { margin:8px 0; min-width:0 }
.example-plot svg { display:block; width:100%; height:auto; overflow:visible }
.example-plot__axis,.example-plot__tick { stroke:var(--line,#e6e8eb) }
.example-plot__caption { fill:var(--ink-2,#595959); font-size:10px }
.example-plot__line { fill:none; stroke:var(--accent,#1677ff); stroke-width:1.7 }
.example-plot__bar { stroke:var(--accent,#1677ff); stroke-width:12; opacity:.45 }
.example-plot__point circle { fill:var(--accent,#1677ff) }
.example-plot__point text { fill:var(--ink-2,#595959); font-size:11px; font-variant-numeric:tabular-nums }
.example-plot__guide line,.example-plot__guide circle { fill:none; stroke:var(--ink-3,#8c8c8c); stroke-width:1; stroke-dasharray:3 3 }
.example-plot__guide text { fill:var(--ink-2,#595959); font-size:10px; paint-order:stroke; stroke:var(--bg-base,#fff); stroke-width:3px }
</style>
