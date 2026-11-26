<template>
  <div class="history-chart">
    <MetricChartTools :controls="zoom.controls" :hint="hint" :limited="limited"><slot name="tools" /></MetricChartTools>
    <slot name="legend" />
    <div class="history-timeline__plot" role="group" tabindex="0" :aria-label="t('historyKeyboard')" aria-keyshortcuts="ArrowLeft ArrowRight Home End Escape" @keydown="onKeydown">
      <Echarts :option="option" :library="library" :events="events" :style="{ height:`${height}px` }" @ready="zoom.ready" @dispose="zoom.dispose" />
    </div>
    <details v-if="shortEntries.length" class="history-chart__shortcuts"><summary>{{ t('historyShortIntervals') }} · {{ shortEntries.length }}</summary><button v-for="entry in shortEntries" :key="entry.key" type="button" :aria-pressed="selected?.key === entry.key" :title="description(entry)" @click="emit('choose',entry)">{{ time(entry.time) }} · {{ label(entry) }} {{ duration(entry) }}</button></details>
  </div>
</template>
<script setup lang="ts">
import { computed, toRef } from 'vue'
import { CustomChart } from 'echarts/charts'
import { useI18n } from 'vue-i18n'
import Echarts from '@jetlinks-web-core/components/Echarts'
import { useTimeZoom } from '@jetlinks-web-core/hooks/Echarts/useTimeZoom'
import { useHistoryChart } from './useHistoryChart'
import MetricChartTools from './MetricChartTools.vue'
import { metricMessages } from '../messages'
import type { MetricStateLabel } from '../types'
import type { HistoryEntry } from './projection'
const props = defineProps<{ entries:HistoryEntry[]; bounds:[number,number]; viewBounds:[number,number]; intervals?:boolean; labels?:MetricStateLabel[]; selected?:HistoryEntry; filter?:string; hint?:string; limited?:boolean }>()
const emit = defineEmits<{ (event:'choose',entry:HistoryEntry):void; (event:'hover',entry?:HistoryEntry):void; (event:'navigate',value:KeyboardEvent):void; (event:'focus',value:boolean):void; (event:'zoom',value?:[number,number]):void }>()
const { t,locale } = useI18n({ useScope:'local',messages:metricMessages })
const zoom = useTimeZoom(toRef(props,'bounds'),toRef(props,'viewBounds'),value => emit('zoom',value),t,true)
const chart = useHistoryChart(props,locale,t,zoom.extent)
const { rows,shortEntries,label,time,duration,description } = chart
const library = [CustomChart,...zoom.library]
const option = computed(() => ({ ...chart.option.value,...zoom.option.value,grid:{ ...chart.option.value.grid as object,bottom:zoom.controls.overview.value ? 52 : 28 } }))
const events = { ...zoom.events,click:(event:unknown) => { const entry = chart.entryAt(event); if (entry) emit('choose',entry) },mouseover:(event:unknown) => emit('hover',chart.entryAt(event)),globalout:() => emit('hover') }
const height = computed(() => (props.intervals ? 136 : Math.max(152,68+rows.value.length*36))+(zoom.controls.overview.value ? 24 : 0))
function onKeydown(event:KeyboardEvent) { if(event.key==='Escape')zoom.cancelBrush();emit('navigate',event) }
</script>
<style scoped>
.history-chart { min-width:0 }
.history-timeline__plot { outline:none }
.history-timeline__plot:focus-visible { outline:2px solid var(--accent); outline-offset:2px; border-radius:4px }
.history-chart__shortcuts { padding-top:6px; font-size:11px }
.history-chart__shortcuts summary { color:var(--ink-3); cursor:pointer }
.history-chart__shortcuts button { margin-right:12px }
.history-chart__shortcuts button { border:0; background:transparent; color:var(--ink-2); font:inherit; padding:3px 0; cursor:pointer }
.history-chart__shortcuts button[aria-pressed=true] { color:var(--accent) }
</style>
