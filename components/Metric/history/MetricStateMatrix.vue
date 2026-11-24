<template>
  <div class="state-matrix" :class="{'is-compact':compact}">
      <div v-if="cells.length" class="state-matrix__body" :tabindex="compact ? undefined : 0" role="group" :aria-label="t('stateMatrixHint')" @pointerleave="index=undefined" @blur="index=undefined" @focus="index=cells.length-1" @keydown="navigate">
        <div v-for="group in groups" :key="group.key" class="state-matrix__row">
          <span class="state-matrix__label" :title="label(group.state)">{{ label(group.state) }} <small>{{ group.cells.reduce((total,cell)=>total+cell.count,0) }}</small></span>
          <div class="state-matrix__lane">
            <span v-for="cell in group.cells" :key="cell.from" class="state-matrix__cell" :class="{'is-selected':selected===cell,'is-unknown':cell.state===null}" :style="cellStyle(cell)" @pointerenter="index=cells.indexOf(cell)" @click="choose(cell,$event)"><a-tooltip v-if="selected===cell" :open="true" :title="`${label(cell.state)} · ${time(cell.from)} — ${time(cell.to)} · ${t('stateRecordCount',{count:cell.count})}`"><span class="state-matrix__anchor" /></a-tooltip></span>
          </div>
        </div>
      </div>
    <p v-else class="state-matrix__empty">{{ t('noHistory') }}</p>
    <div v-if="!compact" class="state-matrix__times"><time>{{ time(bounds[0],true) }}</time><time>{{ time(bounds[1],true) }}</time></div>
  </div>
</template>
<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {metricMessages} from '../messages'
import {recordedStateLabel,stateAppearance} from '../stateIntervals'
import type {MetricHistoryAggregate,MetricStateLabel} from '../types'
const props=defineProps<{buckets:MetricHistoryAggregate['buckets'];bounds:[number,number];labels?:MetricStateLabel[];compact?:boolean}>()
const emit=defineEmits<{(event:'drilldown',range:[number,number]):void}>()
const {t,locale}=useI18n({useScope:'local',messages:metricMessages})
const cells=computed(()=>props.buckets.filter(bucket=>bucket.to>props.bounds[0] && bucket.from<props.bounds[1]).flatMap(bucket=>(bucket.states || []).filter(state=>state.count>0).map(state=>({...state,from:bucket.from,to:bucket.to}))))
type Cell = typeof cells.value[number]
const groups=computed(()=>{
  const groups=new Map<string,{key:string;state:Cell['state'];cells:Cell[]}>()
  for(const cell of cells.value){
    const key=JSON.stringify([typeof cell.state,cell.state]),group=groups.get(key)
    if(group)group.cells.push(cell);else groups.set(key,{key,state:cell.state,cells:[cell]})
  }
  return [...groups.values()].sort((a,b)=>a.key.localeCompare(b.key))
})
const index=ref<number>()
watch(()=>props.buckets,()=>{index.value=undefined})
const selected=computed(()=>index.value===undefined ? undefined : cells.value[index.value])
const maximum=computed(()=>Math.max(1,...cells.value.map(cell=>cell.count)))
const label=(state:Cell['state'])=>recordedStateLabel(state,props.labels || [],String(locale.value),t)
const time=(value:number,short=false)=>new Date(value).toLocaleString(String(locale.value),short ? {hour:'2-digit',minute:'2-digit'} : {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'})
function cellStyle(cell:Cell){
  const span=props.bounds[1]-props.bounds[0],from=Math.max(props.bounds[0],cell.from),to=Math.min(props.bounds[1],cell.to)
  return {left:`${(from-props.bounds[0])/span*100}%`,width:`${Math.max(0,to-from)/span*100}%`,background:stateAppearance(cell.state,props.labels).color,opacity:.35+.65*Math.log1p(cell.count)/Math.log1p(maximum.value)}
}
function choose(cell:Cell,event?:Event){
  if(props.compact)return
  event?.stopPropagation()
  emit('drilldown',[Math.max(props.bounds[0],cell.from),Math.min(props.bounds[1],cell.to)])
}
function navigate(event:KeyboardEvent){
  if(props.compact || !['ArrowLeft','ArrowRight','Home','End','Enter','Escape'].includes(event.key))return
  event.preventDefault();event.stopPropagation()
  if(event.key==='Escape'){index.value=undefined;return}
  if(event.key==='Enter'){if(selected.value)choose(selected.value);return}
  index.value=event.key==='Home' ? 0 : event.key==='End' ? cells.value.length-1 : Math.max(0,Math.min(cells.value.length-1,(index.value ?? cells.value.length-1)+(event.key==='ArrowLeft' ? -1 : 1)))
}
</script>
<style scoped>
.state-matrix { min-width:0 }
.state-matrix__body { max-height:280px; overflow:auto }
.state-matrix__body:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; border-radius:4px }
.state-matrix__row { display:flex; align-items:center; gap:8px; min-height:36px }
.state-matrix__label { flex:0 0 88px; font-size:12px; color:var(--ink-2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.state-matrix__lane { position:relative; flex:1; min-width:0; height:24px; background:var(--bg-2); border-radius:4px }
.state-matrix__cell { position:absolute; top:2px; bottom:2px; min-width:4px; border:1px solid var(--bg); border-radius:3px; box-sizing:border-box; cursor:zoom-in }
.state-matrix__anchor { display:block; width:100%; height:100% }
.state-matrix__label small { color:var(--ink-3); font-variant-numeric:tabular-nums }
.state-matrix__empty { min-height:100px; display:grid; place-items:center; color:var(--ink-3) }
.state-matrix__cell.is-unknown { background:repeating-linear-gradient(135deg,var(--ink-3) 0px,var(--ink-3) 2px,var(--line) 2px,var(--line) 4px)!important }
.state-matrix__cell.is-selected { outline:2px solid var(--accent); outline-offset:-1px; opacity:1!important }
.state-matrix__times { display:flex; justify-content:space-between; padding:6px 0 0 96px; color:var(--ink-3); font-size:11px }
.is-compact .state-matrix__body { max-height:66px }
.is-compact .state-matrix__row { min-height:22px }
.is-compact .state-matrix__label { flex-basis:64px; font-size:11px }
.is-compact .state-matrix__lane { height:14px }
.is-compact .state-matrix__cell { cursor:inherit }
.is-compact .state-matrix__times { padding-left:72px }
</style>
