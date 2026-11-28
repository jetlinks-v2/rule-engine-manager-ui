import {computed,onMounted,onScopeDispose,ref,watch,type Ref} from 'vue'
import {moveMetric,metricFeatured} from './featured'
import type {MetricConfig,MetricContext} from './types'

/** 把手捕获指针；卡片内容仍用于查看，跨组和被动刷新不能偷偷提交次序。 */
export function useMetricCardDrag(configs:Ref<MetricConfig[]>,context:Ref<MetricContext>,group:(config:MetricConfig)=>MetricConfig[],
  canOrder:(config:MetricConfig)=>boolean,commit:(config:MetricConfig,ids:string[])=>Promise<boolean>,busy:Ref<string>) {
  const moving=ref(''),destination=ref<{id:string;after:boolean;horizontal:boolean}>()
  const browser=typeof window==='undefined' ? undefined : window
  let capture:HTMLElement|undefined,pointer=0,startX=0,startY=0,active=false,snapshot:string[]=[],configuration:MetricConfig|undefined
  function cancel(){
    const element=capture,id=pointer
    capture=undefined;configuration=undefined;moving.value='';destination.value=undefined;active=false;snapshot=[]
    if(element?.hasPointerCapture(id))element.releasePointerCapture(id)
  }
  function start(config:MetricConfig,event:PointerEvent){
    if(event.button!==0 || event.isPrimary===false || busy.value || !canOrder(config))return
    cancel();configuration=config;snapshot=group(config).map(item=>item.id!);pointer=event.pointerId
    startX=event.clientX;startY=event.clientY;capture=event.currentTarget as HTMLElement
    capture.focus({preventScroll:true});capture.setPointerCapture(pointer)
  }
  function move(event:PointerEvent){
    if(!capture || !configuration || event.pointerId!==pointer)return
    if(!active && Math.hypot(event.clientX-startX,event.clientY-startY)<6)return
    active=true;moving.value=configuration.id!
    const element=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-metric-config]')
    const id=element?.dataset.metricConfig
    if(!element || !id || !snapshot.includes(id) || id===configuration.id){destination.value=undefined;return}
    const rect=element.getBoundingClientRect()
    const origin=capture.closest<HTMLElement>('[data-metric-config]')?.getBoundingClientRect()
    const horizontal=!!origin && Math.max(origin.top,rect.top)<Math.min(origin.bottom,rect.bottom)
    destination.value={id,horizontal,after:horizontal ? event.clientX>rect.left+rect.width/2 : event.clientY>rect.top+rect.height/2}
  }
  async function finish(event:PointerEvent){
    if(!capture || event.pointerId!==pointer)return
    const config=configuration,target=destination.value,ids=active && config && target ? moveMetric(snapshot,config.id!,target.id,target.after) : undefined
    cancel()
    if(config && ids)await commit(config,ids)
  }
  const version=computed(()=>JSON.stringify([context.value.ownerType,context.value.ownerId,context.value.editable,
    configs.value.map(config=>[config.id,config.revision,metricFeatured(config),config.ownerType,config.ownerId]).sort()]))
  watch(version,cancel)
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')cancel()}
  onMounted(()=>{browser?.addEventListener('keydown',escape);browser?.addEventListener('blur',cancel)})
  onScopeDispose(()=>{cancel();browser?.removeEventListener('keydown',escape);browser?.removeEventListener('blur',cancel)})
  return {moving,destination,start,move,finish,cancel}
}
