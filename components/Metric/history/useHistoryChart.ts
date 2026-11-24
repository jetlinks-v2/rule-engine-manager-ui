import { computed, type Ref } from 'vue'
import { graphic, type EChartsCoreOption } from 'echarts/core'
import type { CustomSeriesRenderItem } from 'echarts'
import { theme } from 'ant-design-vue'
import { historyGaps, historyGroup, type HistoryEntry } from './projection'
import { formatIntervalDuration, intervalDuration, recordedStateLabel, stateAppearance, stateLabel } from '../stateIntervals'
import type { MetricStateLabel } from '../types'

interface HistoryChartProps {
  entries:HistoryEntry[]; bounds:[number,number]; viewBounds:[number,number]; intervals?:boolean
  labels?:MetricStateLabel[]; selected?:HistoryEntry; filter?:string
}
type ChartDatum = { key?:string; value:[number,number,number]; itemStyle:{color:string;opacity?:number}; entry?:HistoryEntry }

/** Discrete samples keep type-sensitive lanes; confirmed intervals share one chronological band. */
export function historyChartRows(entries:HistoryEntry[], intervals:boolean) {
  const groups = new Map<string,HistoryEntry>()
  for (const entry of entries) if ((entry.kind === 'interval') === intervals) groups.set(historyGroup(entry),entry)
  const ordered = [...groups.entries()]
  if (!intervals) ordered.sort(([,a],[,b]) => Number(b.kind === 'record' ? b.state : 0)-Number(a.kind === 'record' ? a.state : 0))
  return ordered.map(([key,entry]) => ({ key,entry }))
}

/** Custom series delegates clipping, zoom and picking to ECharts; source timestamps and duration remain untouched. */
export function useHistoryChart(props:HistoryChartProps, locale:Ref<string>, t:(key:string,values?:Record<string,unknown>)=>string, extent?:Ref<[number,number] | undefined>) {
  const { token } = theme.useToken()
  const label = (entry:HistoryEntry) => entry.kind === 'interval' ? stateLabel(entry.interval.value,props.labels || [],locale.value)
    : recordedStateLabel(entry.state,props.labels || [],locale.value,t)
  const time = (value:number) => new Date(value).toLocaleString(locale.value,{ month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit' })
  const duration = (entry:HistoryEntry) => entry.kind === 'interval' ? formatIntervalDuration(intervalDuration(entry.interval,entry.cutoff),t) : ''
  const description = (entry:HistoryEntry) => `${label(entry)} · ${time(entry.time)}${entry.kind === 'interval' ? ` — ${time(entry.end)} · ${duration(entry)}` : ''}`
  const rows = computed(() => historyChartRows(props.entries,!!props.intervals))
  const facts = computed(() => props.entries.filter(entry => (entry.kind === 'interval') === !!props.intervals))
  const shortEntries = computed(() => facts.value.filter(entry => entry.kind === 'interval' && entry.end-entry.time < 60000))
  const color = (entry:HistoryEntry) => {
    const value = stateAppearance(entry.kind === 'interval' ? entry.interval.value : entry.state,props.labels).color
    // Platform appearance exposes CSS tokens; Canvas needs their resolved Ant theme colors.
    return value.startsWith('var(--accent') ? token.value.colorPrimary : value.startsWith('var(--ink-3') ? token.value.colorTextTertiary
      : value.startsWith('var(--jet-theme-success') ? token.value.colorSuccess : value
  }
  const data = computed<ChartDatum[]>(() => facts.value.map(entry => ({ key:entry.key,entry,value:[entry.time,entry.kind === 'interval' ? entry.end : entry.time,props.intervals ? 0 : rows.value.findIndex(row => row.key === historyGroup(entry))],itemStyle:{ color:color(entry),opacity:props.filter !== undefined && props.filter !== historyGroup(entry) || props.selected && props.selected.key !== entry.key ? .22 : 1 } })))
  const gaps = computed<ChartDatum[]>(() => props.intervals ? historyGaps(props.entries,props.bounds).map(gap => ({ value:[gap.start,gap.end,0],itemStyle:{color:token.value.colorFillSecondary} })) : [])
  const renderItem:CustomSeriesRenderItem = (params,api) => {
    const from = api.coord([api.value(0),api.value(2)]), to = api.coord([api.value(1),api.value(2)])
    const area = params.coordSys as typeof params.coordSys & { x:number;y:number;width:number;height:number }
    const isGap = params.seriesId === 'unconfirmed'
    if (!props.intervals) {
      return {type:'circle',shape:{cx:from[0],cy:from[1],r:3},style:{fill:api.visual('color'),opacity:data.value[params.dataIndex]?.itemStyle.opacity ?? 1}}
    }
    const height = props.intervals ? 28 : 12
    const rect = graphic.clipRectByRect({ x:from[0]-(props.intervals ? 0 : 2),y:from[1]-height/2,width:props.intervals ? Math.max(3,to[0]-from[0]) : 4,height },area)
    if (!rect) return
    return { type:'rect',shape:{...rect,r:props.intervals ? 3 : 1},focus:props.selected ? 'none' : 'self',blurScope:'series',emphasisDisabled:!!props.selected,
      emphasis:{style:{opacity:1}},blur:{style:{opacity:.22}},
      style:{ fill:api.visual('color'),opacity:isGap ? 1 : data.value[params.dataIndex]?.itemStyle.opacity ?? 1,stroke:isGap ? token.value.colorBorder : undefined,lineWidth:1,...(isGap ? {decal:{symbol:'rect',dashArrayX:[1,0],dashArrayY:[2,4],rotation:-Math.PI/4,color:token.value.colorBorder}} : {}) } }
  }
  const option = computed<EChartsCoreOption>(() => ({
    animation:false,
    grid:{ left:props.intervals ? 8 : 100,right:16,top:12,bottom:28 },
    tooltip:{ trigger:'item',confine:true,renderMode:'richText',formatter:(value:unknown) => {
      const event = value as {seriesId?:string;dataIndex?:number}
      const entry = event.seriesId === 'facts' && event.dataIndex !== undefined ? facts.value[event.dataIndex] : undefined
      return entry ? description(entry) : t('historyUnconfirmedTime')
    } },
    xAxis:{ type:'time',min:extent?.value?.[0] ?? props.bounds[0],max:extent?.value?.[1] ?? props.bounds[1],splitNumber:4,axisLabel:{color:token.value.colorTextTertiary,hideOverlap:true},axisLine:{lineStyle:{color:token.value.colorBorder}} },
    yAxis:{ type:'category',inverse:true,data:props.intervals ? [''] : rows.value.map(row => label(row.entry)),axisTick:{show:false},axisLine:{show:false},axisLabel:{show:!props.intervals,color:token.value.colorTextSecondary,width:88,overflow:'truncate'},splitLine:{show:!props.intervals,lineStyle:{color:token.value.colorSplit}} },
    series:[{ id:'facts',type:'custom',renderItem,encode:{x:[0,1],y:2},data:data.value },{ id:'unconfirmed',type:'custom',silent:true,renderItem,encode:{x:[0,1],y:2},data:gaps.value }],
  }))
  function entryAt(event:unknown) {
    const value = event as {seriesId?:string;dataIndex?:number}
    return value?.seriesId === 'facts' && value.dataIndex !== undefined ? facts.value[value.dataIndex] : undefined
  }
  return { option,rows,facts,shortEntries,label,time,duration,description,entryAt }
}
