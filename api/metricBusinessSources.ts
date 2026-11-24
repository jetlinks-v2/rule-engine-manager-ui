import { request } from '@jetlinks-web/core'
import { collectMetricResources } from '../components/Metric/extensions/registry'
import { loadMetricObjectTypes as loadDeclaredObjectTypes } from '../components/Metric/api'
import { type MetricObjectType } from '../components/Metric/readApi'

export interface BusinessEvent { id:string; name:string; description?:string; group?:string; schema:Record<string,unknown> }
export interface BusinessCommand { id:string; name:string; description?:string; inputs?:{id:string;name?:string;valueType?:Record<string,unknown>}[]; output?:Record<string,unknown>; expands?:Record<string,unknown> }
/** 指标桥接声明的候选来源；前端不推断业务来源或执行路由。 */
export interface ObjectSourceCapability {
  id:string; name:string; kind:'query'|'event'|'action'
  reference:import('../components/Metric/types').MetricSourceReference
  metadata:BusinessCommand
  capabilities?:('current'|'history'|'subscribe'|'maintainedHistory')[]
  event?:{transport?:'thingMessage'|'structuredEvent';definitionId:string}
  configurableParameters?:string[]
  bindings?:Record<string,{source:string;value?:unknown}>
  evidenceMapping?:{observedAt?:string}
}
export type SourceObjectType = MetricObjectType
const options = { hiddenError:true }
async function read<T>(url:string):Promise<T> {
  const response:{status?:number;message?:string;result:T} = await request.get(url,undefined,options)
  if (response.status && response.status >= 400) throw new Error(response.message || String(response.status))
  return response.result
}
const objectPath=(type:string,id:string)=>`/metric/configs/sources/objects/${encodeURIComponent(type)}/${encodeURIComponent(id)}`
export const loadObjectSourceCapabilities=(type:string,id:string)=>read<ObjectSourceCapability[]>(`${objectPath(type,id)}/capabilities`)
/** 后端实际类型与业务维度取交集；额外根来源由后端显式声明，绑定仍按原权限执行。 */
export async function loadMetricObjectTypes():Promise<SourceObjectType[]> {
  const types = await loadDeclaredObjectTypes()
  const installed = new Map<string,SourceObjectType>(collectMetricResources().dimensions.map(({provider})=>[provider.ownerType,
    {id:provider.ownerType,name:typeof provider.label === 'function' ? provider.label() : provider.label,icon:provider.icon}]))
  const declared = new Set(types.map(type=>type.id))
  const roots = new Map<string,SourceObjectType>([...installed].filter(([key])=>declared.has(key)))
  for (const type of types) {
    if (!installed.has(type.id) && !type.metricSource?.root) continue
    const registered = installed.get(type.id)
    roots.set(type.id,{...type,...registered,name:registered?.name || type.i18nName || type.name,icon:type.metricSource?.icon || registered?.icon})
  }
  return [...roots.values()]
}
export async function queryMetricBusinessObjects(type:string,keyword:string,pageIndex=0,
  scopeTerms:{column:string;termType:string;value:unknown}[] = []) {
  const response:{status?:number;message?:string;result?:{data:{id:string;name?:string;productId?:string}[];total:number}} = await request.post(`/metric/configs/sources/objects/${encodeURIComponent(type)}/_query`,{
    pageIndex,pageSize:20,sorts:[{name:'name',order:'asc'}],terms:[...scopeTerms,
      ...(keyword.trim() ? [{column:'name',termType:'like',value:`%${keyword.trim()}%`}] : [])],
  },options)
  if (response.status && response.status >= 400) throw new Error(response.message || String(response.status))
  return {data:(response.result?.data || []).map(item=>({...item,name:item.name || item.id})),total:response.result?.total || 0}
}
