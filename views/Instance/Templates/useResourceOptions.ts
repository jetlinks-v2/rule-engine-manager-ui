import { onScopeDispose, ref } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import type { ResourceOption } from './types'
import type { ResourcePage } from '../../../api/ruleTemplates'

export function useResourceOptions(query:(keyword:string,page:number)=>Promise<ResourcePage>) {
  const items=ref<ResourceOption[]>([]),loading=ref(false),error=ref(false),more=ref(false)
  let sequence=0, keyword='', page=0, loaded=false, disposed=false
  const known=new Map<string,ResourceOption>()
  async function load(reset=false) {
    if(disposed)return
    if (loading.value && !reset) return
    const token=++sequence
    if (reset) {page=0;items.value=[];more.value=false}
    loading.value=true;error.value=false
    try {
      const result=await query(keyword,page)
      if (token!==sequence) return
      result.data.forEach(item=>known.set(item.id,item))
      const existing=new Set(items.value.map(item=>item.id))
      items.value.push(...result.data.filter(item=>!existing.has(item.id)))
      more.value=(page+1)*20 < result.total
      page++
      loaded=true
    } catch {if(token===sequence)error.value=true}
    finally {if(token===sequence)loading.value=false}
  }
  const delayedSearch=useDebounceFn((value:string,token:number)=>{if(token!==sequence || disposed)return;keyword=value;return load(true)},250)
  const search=(value:string)=>delayedSearch(value,sequence)
  const clear=()=>{sequence++;keyword='';page=0;loaded=false;items.value=[];known.clear();loading.value=false;error.value=false;more.value=false}
  const open=(visible:boolean)=>{if(visible && !loaded && !loading.value)void load()}
  const scroll=(event:Event)=>{
    const target=event.target as HTMLElement
    if (more.value && target.scrollTop+target.clientHeight >= target.scrollHeight-24) void load()
  }
  onScopeDispose(()=>{disposed=true;sequence++})
  const remember=(item:ResourceOption)=>{known.set(item.id,item);if(!items.value.some(value=>value.id===item.id))items.value.push(item)}
  return {items,loading,error,more,load,search,clear,open,scroll,remember,find:(id:string)=>known.get(id)}
}
