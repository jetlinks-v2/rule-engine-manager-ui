<template>
  <section class="history-timeline" :aria-label="t(intervals ? 'intervalRecords' : 'historyRecords')">
    <template v-if="entries.length && axis && fullAxis">
    <MetricHistoryChart :entries="entries" :bounds="fullAxis" :view-bounds="axis" :intervals="intervals" :labels="labels" :selected="pinned ? detail : undefined" :filter="filter" :hint="hint" :limited="limited" @choose="choose" @hover="hover" @navigate="keydown" @focus="focus" @zoom="setZoom">
    <template #tools><slot name="tools" /></template>
    <template #legend>
    <nav class="history-timeline__legend" :aria-label="t('historyFilter')">
      <button v-if="legendGroups.length > 1" type="button" :aria-pressed="filter === undefined" @click="chooseFilter()">{{ t('historyAll') }}</button>
      <button v-for="group in legendGroups" :key="group.key" type="button" :aria-pressed="filter === group.key" @click="chooseFilter(filter === group.key ? undefined : group.key)"><IconValueView v-if="group.appearance.icon" :value="group.appearance.icon" :size="12" indicator :fallback-text="group.label" /><i v-else :class="group.tone" :style="{ background:group.appearance.color }" />{{ group.label }}<small v-if="legendGroups.length > 1">{{ group.count }}</small></button>
      <span v-if="hasGaps" class="history-timeline__gap"><i />{{ t('historyUnconfirmedTime') }}</span>
    </nav>
    </template>
    </MetricHistoryChart>
    </template>
    <template v-else><div class="history-timeline__empty-tools"><slot name="tools" /></div><p v-if="!unavailable" class="history-timeline__empty">{{ t(intervals ? 'intervalNoHistory' : 'noHistory') }}</p></template>
    <MetricHistoryRecord v-if="!integrated && (pinned || missing)" :entry="detail" :label="detail ? label(detail) : ''" :icon="detail && appearance(detail).icon" :outside-view="outsideView" :missing="missing" :count="visible.length" :position="position" @move="move" @clear="clear" />
  </section>
</template>
<script setup lang="ts">
import { computed, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { metricMessages } from '../messages'
import { recordedStateLabel, stateAppearance, stateLabel } from '../stateIntervals'
import IconValueView from '@jetlinks-web-core/components/IconValue/IconValueView.vue'
import type { MetricStateLabel } from '../types'
import type { HistoryEntry } from './projection'
import { historyGaps } from './projection'
import { useHistoryTimeline } from './useHistoryTimeline'
import MetricHistoryRecord from './MetricHistoryRecord.vue'
import MetricHistoryChart from './MetricHistoryChart.vue'
const props = defineProps<{ entries:HistoryEntry[]; bounds?:[number,number]; labels?:MetricStateLabel[]; intervals?:boolean; limited?:boolean; canInspectSource?:boolean; unavailable?:boolean; integrated?:boolean; resetSelection?:number }>()
const emit = defineEmits<{ (event:'source'):void; (event:'select',entry:HistoryEntry|undefined,pinned:boolean):void }>()
const { t, locale } = useI18n({ useScope:'local', messages:metricMessages })
const { axis, fullAxis, groups, visible, filter, pinned, selected, detail, missing, position, chooseFilter, choose, move, clear, keydown, hover, setZoom, focus } = useHistoryTimeline(toRef(props, 'entries'), toRef(props, 'bounds'))
// 悬停不查询过程；同一区间实时延长也不替换已固定的计算身份。
watch([pinned,()=>selected.value?.key],()=>emit('select',selected.value,pinned.value))
watch(()=>props.resetSelection,()=>{ chooseFilter();clear();setZoom() })
defineExpose({move,clear})
const hint = computed(() => `${t(props.intervals ? 'historyIntervalHint' : 'discreteStatesHint')}${props.limited ? ` ${t(props.intervals ? 'historyIntervalLimitHint' : 'resultsLimit')}` : ''}`)
const label = (entry:HistoryEntry) => entry.kind === 'interval' ? stateLabel(entry.interval.value, props.labels || [], String(locale.value))
  : recordedStateLabel(entry.state, props.labels || [], String(locale.value), t)
const tone = (entry:HistoryEntry) => entry.kind === 'interval' ? `state-color-${entry.color}` : entry.state === null ? 'is-unknown' : entry.state ? 'is-true' : 'is-false'
const appearance = (entry:HistoryEntry) => stateAppearance(entry.kind === 'interval' ? entry.interval.value : entry.state,props.labels)
const multiState = computed(() => props.labels?.some(item => typeof item.value !== 'boolean') || props.entries.some(entry => entry.kind === 'record' && entry.state !== null && typeof entry.state !== 'boolean'))
const legendGroups=computed(()=>(props.intervals ? groups.value.map(group=>({...group,label:label(group.entry),tone:tone(group.entry),appearance:appearance(group.entry)}))
  : multiState.value ? [...new Set([...(props.labels || []).map(item => item.value), ...groups.value.map(group => group.entry.kind === 'record' ? group.entry.state : null)])].map(state => {
    const key = JSON.stringify([typeof state,state]), group = groups.value.find(group => group.key === key)
    return { key,count:group?.count || 0,label:recordedStateLabel(state,props.labels || [],String(locale.value),t),tone:state == null ? 'is-unknown' : '',appearance:stateAppearance(state,props.labels) }
  })
  : ([true,false,...(groups.value.some(group=>group.entry.kind==='record' && group.entry.state===null)?[null]:[])] as Array<boolean|null>).map(state=>{
    const group=groups.value.find(group=>group.entry.kind==='record' && group.entry.state===state)
    return {key:JSON.stringify([typeof state,state]),count:group?.count||0,label:group ? label(group.entry) : props.labels?.some(item=>item.value===state) ? stateLabel(state,props.labels,String(locale.value)) : t(state?'conditionTrue':'conditionFalse'),tone:state===null?'is-unknown':state?'is-true':'is-false',appearance:stateAppearance(state,props.labels)}
  })).filter(group => group.count > 0))
const hasGaps=computed(()=>!!props.intervals && !!fullAxis.value && historyGaps(props.entries,fullAxis.value).length>0)
const outsideView = computed(() => !!detail.value && !!axis.value && (detail.value.kind==='interval'
  ? detail.value.end<=axis.value[0] || detail.value.time>=axis.value[1]
  : detail.value.time<axis.value[0] || detail.value.time>axis.value[1]))
</script>
<style scoped>
.history-timeline { min-width:0; color:var(--ink-2); font-size:12px }
.history-timeline__empty-tools { display:flex; align-items:center; justify-content:space-between; gap:8px }
.history-timeline__gap { display:inline-flex; align-items:center; gap:6px; padding:3px 8px; color:var(--ink-3) }
.history-timeline__gap i { width:8px; height:8px; background:repeating-linear-gradient(135deg,var(--bg-2) 0px,var(--bg-2) 2px,var(--line) 2px,var(--line) 3px) }
.history-timeline__legend { display:flex; align-items:center; flex-wrap:wrap; min-height:28px; gap:4px }
.history-timeline__legend button { display:inline-flex; align-items:center; gap:6px; background:transparent; border:1px solid transparent; border-radius:var(--r-2,6px); color:var(--ink-2); font:inherit; padding:3px 8px; cursor:pointer; max-width:100%; overflow-wrap:anywhere }
.history-timeline__legend button[aria-pressed=true] { background:var(--bg-2); color:var(--ink-1); border-color:var(--line) }
.history-timeline__legend button:disabled { opacity:.4; cursor:default }
.history-timeline__legend small { color:var(--ink-3); font-variant-numeric:tabular-nums }
.history-timeline__legend i { display:inline-block; flex:none; width:6px; height:6px; border-radius:2px; background:var(--accent,#1677ff) }
.history-timeline__legend i.is-false { background:var(--ink-3) }
.history-timeline__legend i.is-unknown { background:transparent; border:1px dashed var(--ink-3) }
.history-timeline__legend button:focus-visible { outline:2px solid var(--accent); outline-offset:3px; border-radius:4px }
.history-timeline__empty { min-height:112px; display:grid; place-items:center; color:var(--ink-3); margin:0 }
@media(max-width:480px) { .history-timeline__head { align-items:flex-start } }
</style>
