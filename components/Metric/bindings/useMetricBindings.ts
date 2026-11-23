import {computed,onScopeDispose,ref,shallowRef,watch,type Ref} from 'vue'
import {useDiagnosticQuery} from '@jetlinks-web-core/hooks/useDiagnosticQuery'
import { metricApi } from '../api'
import { errorText } from '@jetlinks-web-core/components/Metric/service'
import type {MetricApi,MetricContext,MetricObjectBinding,MetricObjectBindingPage,MetricSourcePicker} from '@jetlinks-web-core/components/Metric/types'

/** 对象切换使旧请求失效；关联只负责原宿主上的添加、移除和重新授权读取。 */
export function useMetricBindings(context:Ref<MetricContext>,picker:Ref<MetricSourcePicker | undefined>,api:MetricApi=metricApi) {
  const page=useDiagnosticQuery<MetricObjectBindingPage>()
  const busy=ref(false),mutationError=ref('')
  const includeDescendants=ref(true)
  const pendingAdd=shallowRef<MetricObjectBinding>()
  let loadedPages=1,writeGeneration=0,readGeneration=0,timer:ReturnType<typeof setTimeout> | undefined,disposed=false
  const key=computed(()=>JSON.stringify([context.value.ownerType,context.value.ownerId]))
  const types=computed(()=>[...new Set(page.data.value?.items.flatMap(item=>item.reference ? [item.reference.targetType] : []) || [])])
  async function refresh(cursor?:string) {
    clearTimeout(timer)
    const token=++readGeneration
    const owner={...context.value},current=key.value,descendants=includeDescendants.value,previous=cursor ? page.data.value?.items || [] : []
    const pages=cursor ? 1 : loadedPages
    await page.run(async()=>{
      let next=cursor,items=[...previous]
      for(let index=0;index<pages;index++){
        const value=await api.objectBindings!(owner.ownerType,owner.ownerId,next,descendants)
        items.push(...value.items);next=value.nextCursor
        if(!next || key.value!==current || token!==readGeneration)break
      }
      return {items,nextCursor:next}
    },!!owner.ownerId,{retainData:true})
    if(current!==key.value || token!==readGeneration || disposed)return
    if(page.state.value.status==='error')page.clear({...page.state.value})
    if(cursor && page.state.value.status==='ready')loadedPages++
    // 与原结果面板同频重新授权；显式加载的页数有界保留，不因后台刷新丢掉后续页。
    scheduleRefresh()
  }
  function scheduleRefresh(){timer=setTimeout(()=>{if(typeof document==='undefined' || !document.hidden)void refresh();else scheduleRefresh()},15000)}
  async function add(invalidMessage:string) {
    if (!picker.value || busy.value) return
    const current=key.value,owner={...context.value}
    const selected=await picker.value({context:{...owner,targetType:owner.ownerType,targetId:owner.ownerId,scope:'single'},purpose:'reference',
      input:{id:'metric',source:{kind:'metric'}},hint:{sources:['metric']}})
    if (!selected || current!==key.value) return
    const value=selected.mapping
    if (value.kind!=='metric' || !value.configId || !value.id || !value.thingType || !value.thingId || value.thingId==='*') {
      mutationError.value=invalidMessage; return
    }
    pendingAdd.value={objectType:owner.ownerType,objectId:owner.ownerId,configId:value.configId!,
      outputId:value.id,targetType:value.thingType!,targetId:value.thingId!}
    await retryAdd()
  }
  /** 添加失败保留已选结果供重试，切换对象或明确取消后失效。 */
  async function retryAdd(){
    const request=pendingAdd.value
    if(!request)return
    if(await mutate(()=>api.bindObjectMetric!(request)) && pendingAdd.value===request)pendingAdd.value=undefined
  }
  function cancelAdd(){pendingAdd.value=undefined;mutationError.value=''}
  async function mutate(action:()=>Promise<unknown>,current=key.value) {
    if (busy.value) return false
    const token=++writeGeneration
    busy.value=true;mutationError.value=''
    try {await action();if(current===key.value)await refresh();return true}
    catch(error){if(current===key.value)mutationError.value=errorText(error);return false}
    finally {if(token===writeGeneration)busy.value=false}
  }
  function remove(id:string) {
    const owner={...context.value}
    return mutate(()=>api.unbindObjectMetric!(owner.ownerType,owner.ownerId,id))
  }
  watch(key,()=>{picker.value?.cancel?.();page.clear();loadedPages=1;writeGeneration++;busy.value=false;cancelAdd();void refresh()},{immediate:true})
  watch(includeDescendants,()=>{loadedPages=1;page.clear();void refresh()})
  onScopeDispose(()=>{disposed=true;clearTimeout(timer);picker.value?.cancel?.()})
  return {page,busy,mutationError,pendingAdd,retryAdd,cancelAdd,types,includeDescendants,refresh,add,remove}
}
