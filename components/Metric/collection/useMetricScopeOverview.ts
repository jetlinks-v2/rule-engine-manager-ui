import { onActivated, onDeactivated, onScopeDispose, ref, watch, type Ref } from 'vue'
import { metricApi } from '../api'
import { errorText } from '../service'
import type { MetricReadApi, MetricConfig, MetricContext } from '../types'
import type { MetricScopeTemplateOverview } from './types'

export interface MetricScopeOverviewState { data?:MetricScopeTemplateOverview; readTime?:number; members?:number; error?:string; loading?:boolean }
const keyOf = (memberType:string, templateId:string) => JSON.stringify([memberType,templateId])

/** One scope discovery per visible batch; summaries never follow the one-second latest stream or overlap requests. */
export function useMetricScopeOverview(context:Ref<MetricContext>, configs:Ref<MetricConfig[]>, api:MetricReadApi = metricApi) {
  const states = ref<Record<string,MetricScopeOverviewState>>({})
  const elements = new Map<string,Element>(), visible = new Set<string>()
  let active=true, disposed=false, generation=0, pending=false, running=false
  let timer:ReturnType<typeof setTimeout> | undefined
  const targetType = (config:MetricConfig) => config.targetType || context.value.inheritance?.targetType || ''
  const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(changes => {
    for (const change of changes) {
      const id=[...elements].find(([,element])=>element===change.target)?.[0]
      if (id) change.isIntersecting ? visible.add(id) : visible.delete(id)
    }
    schedule(100)
  },{rootMargin:'160px'})
  function schedule(delay=15000) {
    if (timer) clearTimeout(timer)
    timer=undefined
    if (!active || disposed || typeof document !== 'undefined' && document.hidden) return
    timer=setTimeout(()=>{timer=undefined;void refresh()},delay)
  }
  async function refresh() {
    if (!active || disposed || typeof document !== 'undefined' && document.hidden) return
    if (running) { pending=true;return }
    const selected=configs.value.filter(config=>targetType(config) && (!observer || !!config.id && visible.has(config.id)))
    const batches=new Map<string,Set<string>>()
    for(const config of selected) {
      const type=targetType(config)
      if(!batches.has(type)) batches.set(type,new Set())
      batches.get(type)!.add(config.templateId)
    }
    if (!batches.size) return
    const epoch=generation, rootType=context.value.ownerType, rootId=context.value.ownerId
    running=true
    try {
      for(const [memberType,ids] of batches) {
        const templateIds=[...ids].sort()
        for(let offset=0;offset<templateIds.length;offset+=32) {
          if(disposed || epoch!==generation || !active) return
          const batch=templateIds.slice(offset,offset+32)
          for(const id of batch) states.value[keyOf(memberType,id)]={...states.value[keyOf(memberType,id)],loading:true}
          try {
            if(!api.collectionOverview) throw new Error('Metric scope overview unavailable')
            const result=await api.collectionOverview({rootType,rootId,memberType,depth:'descendants',templateIds:batch})
            if(disposed || epoch!==generation) return
            for(const id of batch) states.value[keyOf(memberType,id)]={data:result.templates.find(item=>item.templateId===id),readTime:result.readTime,members:result.visibleMembers}
          } catch(cause) {
            if(disposed || epoch!==generation) return
            for(const id of batch) states.value[keyOf(memberType,id)]={error:errorText(cause)}
          }
        }
      }
    } finally {
      running=false
      if(!disposed) { const queued=pending;pending=false;schedule(queued ? 100 : 15000) }
    }
  }
  function observe(id:string, element:Element | null) {
    const previous=elements.get(id)
    if(previous===element) return
    if(previous) observer?.unobserve(previous)
    elements.delete(id);visible.delete(id)
    if(element) {elements.set(id,element);observer?.observe(element)}
  }
  const state = (config:MetricConfig) => states.value[keyOf(targetType(config),config.templateId)]
  const visibility = () => { if(typeof document === 'undefined' || !document.hidden) schedule(100);else if(timer) {clearTimeout(timer);timer=undefined} }
  if(typeof document !== 'undefined') document.addEventListener('visibilitychange',visibility)
  watch(()=>JSON.stringify([context.value.ownerType,context.value.ownerId,configs.value.map(config=>[config.id,config.templateId,config.revision,config.state,targetType(config)])]),()=>{
    generation++;states.value={};schedule(100)
  },{immediate:true})
  onActivated(()=>{active=true;schedule(100)})
  onDeactivated(()=>{active=false;if(timer)clearTimeout(timer)})
  onScopeDispose(()=>{disposed=true;generation++;observer?.disconnect();if(timer)clearTimeout(timer);if(typeof document!=='undefined')document.removeEventListener('visibilitychange',visibility)})
  return {states,state,observe,refresh}
}
