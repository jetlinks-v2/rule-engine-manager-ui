import {computed,watch,type Ref} from 'vue'
import {useDiagnosticQuery} from '@jetlinks-web-core/hooks/useDiagnosticQuery'
import { metricApi } from '../api'
import {collectMetricResources} from '../extensions/registry'
import {metricOutputName} from '../presentation'
import {localizedTemplate} from '../template/text'
import { metricValueMatches, newerMetricValue } from '../service'
import type {MetricApi,MetricConfig,MetricContext,MetricLatest,MetricObjectBindingView,MetricResultFrame,MetricTemplate,MetricTemplateOutput,MetricValue} from '../types'

export interface MetricBindingCard {
  key:string; links:MetricObjectBindingView[]; title:string; source?:string; locations:Record<string,string>
  config?:MetricConfig; template?:MetricTemplate; output?:MetricTemplateOutput; value?:MetricValue
  runtime?:MetricLatest['runtime']; unavailable?:boolean; failed?:boolean
}
export const bindingResultKey=(link:MetricObjectBindingView)=>link.reference ? JSON.stringify([link.reference.configId,link.reference.outputId,link.reference.targetType,link.reference.targetId]) : `unavailable:${link.id}`
export const bindingLocation=(link:MetricObjectBindingView)=>link.addedAt || (link.reference ? {type:link.reference.objectType,id:link.reference.objectId} : undefined)
/** 同一配置可在多个实际对象上运行；历史批次按真实目标隔离。 */
export const bindingHistoryKey=(link:MetricObjectBindingView)=>JSON.stringify([link.reference?.configId,link.reference?.targetType,link.reference?.targetId])
export function bindingSourceContext(card:MetricBindingCard):MetricContext {
  const source=card.links[0].reference
  return {ownerType:source?.targetType || '',ownerId:source?.targetId || '',targetType:source?.targetType,targetId:source?.targetId,label:card.source,editable:false}
}
const targetKey=(link:MetricObjectBindingView)=>JSON.stringify([link.reference?.targetType,link.reference?.targetId])

/** 一页内复用配置、模板和名称；同一输出经多个添加位置只展示一次。授权结果只活在当前查询。 */
export function useMetricBindingResults(links:Ref<MetricObjectBindingView[]>,locale:Ref<string>,api:MetricApi=metricApi) {
  const query=useDiagnosticQuery<MetricBindingCard[]>()
  let identity=''
  async function refresh(){
    const snapshot=[...links.value],language=locale.value,previous=new Map(query.data.value?.map(card=>[card.key,card]))
    const nextIdentity=JSON.stringify(snapshot.map(link=>[link.id,bindingResultKey(link),bindingLocation(link),!!link.unavailable]))
    // 同一批关系刷新时保留布局；对象、来源或授权占位改变时立即清掉旧值。
    const retainData=identity===nextIdentity
    identity=nextIdentity
    await query.run(async signal=>{
      const cards=new Map<string,MetricBindingCard>(),targets=new Map<string,MetricObjectBindingView[]>()
      const publish=()=>{
        if(!api.watchResults || signal.aborted)return
        const current=new Map(query.data.value?.map(card=>[card.key,card]))
        query.data.value=[...cards.values()].map(card=>{
          const before=current.get(card.key)
          return {...card,...(before?.value && card.config && metricValueMatches(card.config,card.links[0].reference,before.value)
            ? {value:card.value ? newerMetricValue(before.value,card.value) : before.value,runtime:before.runtime || card.runtime} : {})}
        })
      }
      for(const link of snapshot){
        const key=bindingResultKey(link),card=cards.get(key)
        if(card)card.links.push(link)
        else cards.set(key,{key,links:[link],title:link.configName || '',locations:{},unavailable:link.unavailable || !link.reference})
        if(!link.reference)continue
        const target=targetKey(link);targets.set(target,[...(targets.get(target)||[]),link])
      }
      publish()
      const jobs=[...targets.values()]
      const names=new Map<string,Set<string>>()
      await Promise.all(Array.from({length:Math.min(4,jobs.length)},async()=>{
        while(jobs.length){
          const group=jobs.shift()!,target={targetType:group[0].reference!.targetType,targetId:group[0].reference!.targetId}
          const ids=[...new Set(group.map(link=>link.reference!.configId))]
          const latest=new Map<string,MetricLatest>();let readFailed=false
          for(let offset=0;!api.watchResults && offset<ids.length;offset+=128){
            try{for(const item of await api.latest(ids.slice(offset,offset+128),target))latest.set(item.configId,item)}catch{readFailed=true}
          }
          for(const id of ids){
            const matching=[...cards.values()].filter(card=>card.links[0].reference?.configId===id && targetKey(card.links[0])===targetKey(group[0]))
            const value=latest.get(id)
            if(readFailed || !api.watchResults && (!value || value.inaccessible)){for(const card of matching){card.failed=readFailed;card.unavailable=!readFailed};continue}
            try{
              const [config,raw]=await Promise.all([api.getConfig(id,target),api.configTemplate(id,target)])
              const template=localizedTemplate(raw,language)
              for(const card of matching){
                const output=template.outputs.find(output=>output.metricId===card.links[0].reference!.outputId)
                if(!output){card.unavailable=true;continue}
                Object.assign(card,{config,template,output,value:value?.outputs[output.metricId],runtime:value?.runtime,
                  title:metricOutputName(output,template)})
                const before=previous.get(card.key)?.value
                if(before && metricValueMatches(config,target,before))card.value=card.value ? newerMetricValue(before,card.value) : before
                for(const link of card.links)for(const [type,id] of [[link.reference!.targetType,link.reference!.targetId],[link.reference!.objectType,link.reference!.objectId]]){
                  const set=names.get(type)||new Set<string>();set.add(id);names.set(type,set)
                }
              }
            }catch{for(const card of matching)card.failed=true}
            publish()
          }
        }
      }))
      const resolved=new Map<string,string>()
      for(const [type,ids] of names){
        const provider=collectMetricResources().dimensions.find(item=>item.provider.ownerType===type)?.provider
        if(!provider?.resolveObjects)continue
        const batch=[...ids]
        for(let offset=0;offset<batch.length;offset+=128){
          try{for(const object of await provider.resolveObjects(batch.slice(offset,offset+128)))resolved.set(JSON.stringify([type,object.ownerId]),object.label)}catch{/* 名称失败不影响已授权结果。 */}
        }
      }
      for(const card of cards.values()){
        if(card.unavailable || card.failed){card.title='';continue}
        const source=card.links[0].reference!
        card.source=resolved.get(JSON.stringify([source.targetType,source.targetId]))
        for(const link of card.links){const location=bindingLocation(link);card.locations[link.id]=resolved.get(JSON.stringify([location?.type,location?.id])) || ''}
      }
      publish()
      return api.watchResults ? query.data.value || [] : [...cards.values()]
    },true,{retainData})
  }
  function receiveResult(id:string,frame:MetricResultFrame){
    if(frame.kind==='changed'){void refresh();return}
    query.data.value=query.data.value?.map(card=>{
      if(bindingHistoryKey(card.links[0])!==id || !card.config || !card.output)return card
      if(frame.kind==='reset' || frame.kind==='inaccessible')return {...card,value:undefined,runtime:undefined,unavailable:frame.kind==='inaccessible'}
      if(frame.kind!=='latest' || !frame.latest)return card
      const value=frame.latest.outputs[card.output.metricId]
      const accepted=value && metricValueMatches(card.config,card.links[0].reference,value)
      return {...card,unavailable:!!frame.latest.inaccessible,value:accepted ? newerMetricValue(card.value,value) : card.value,runtime:frame.latest.runtime || card.runtime}
    })
  }
  watch([links,locale],refresh,{immediate:true})
  return {query,cards:computed(()=>query.data.value||[]),refresh,receiveResult}
}
