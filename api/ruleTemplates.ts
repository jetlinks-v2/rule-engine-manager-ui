import { request } from '@jetlinks-web/core'
import type { ModelDefinition, ResourceOption, ThingModel } from '../views/Instance/Templates/types'

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
export function ruleApiResult(response: unknown): unknown {
  if (record(response) && typeof response.status === 'number' && response.status !== 200) throw new Error(String(response.message || response.status))
  return record(response) && 'result' in response ? response.result : response
}
const options = { hiddenError:true }
export async function loadRuleTemplateNodes(): Promise<Set<string>> {
  let result=ruleApiResult(await request.get('/rule-editor/nodes', undefined, options))
  if (typeof result === 'string') result=JSON.parse(result)
  if (!Array.isArray(result)) throw new Error('invalid node directory')
  return new Set(result.flatMap(item => record(item) && item.enabled === true && Array.isArray(item.types)
    ? item.types.filter((type):type is string => typeof type === 'string') : []))
}
export interface ResourcePage { data:ResourceOption[]; total:number }
export async function loadTemplateResource(kind:'product'|'device',id:string):Promise<ResourceOption> {
  const result=ruleApiResult(await request.get(kind==='product' ? `/device-product/${encodeURIComponent(id)}` : `/device-instance/${encodeURIComponent(id)}/detail`,undefined,options))
  if(!record(result) || result.id!==id)throw new Error('invalid resource identity')
  return {id,name:typeof result.name==='string' ? result.name : id,...(typeof result.productId==='string' ? {productId:result.productId} : {})}
}
export async function queryTemplateResources(kind:'product'|'device', keyword:string, pageIndex=0, productId?:string):Promise<ResourcePage> {
  const terms:Record<string,unknown>[]=[]
  if (productId) terms.push({column:'productId',termType:'eq',value:productId})
  if (keyword.trim()) terms.push({terms:[{column:'name',termType:'like',value:`%${keyword.trim()}%`},{column:'id',termType:'like',value:`%${keyword.trim()}%`,type:'or'}]})
  const result=ruleApiResult(await request.post(kind === 'product' ? '/device-product/_query' : '/device-instance/_query', {
    pageIndex,pageSize:20,paging:true,terms,sorts:[{name:'name',order:'asc'}],includes:kind === 'product' ? ['id','name'] : ['id','name','productId'],
  },options))
  if (!record(result) || !Array.isArray(result.data)) throw new Error('invalid resource page')
  return {data:result.data.filter(record).map(item=>({id:String(item.id),name:String(item.name || item.id),...(item.productId ? {productId:String(item.productId)} : {})})),total:Number(result.total || 0)}
}
export function parseThingModel(value:unknown):ThingModel {
  const parsed=typeof value === 'string' ? JSON.parse(value) : value
  if (!record(parsed)) throw new Error('invalid thing model')
  const definitions=(key:string):ModelDefinition[] => {
    if (parsed[key] === undefined) return []
    if (!Array.isArray(parsed[key]) || !(parsed[key] as unknown[]).every(item=>record(item) && typeof item.id === 'string')) throw new Error('invalid model definitions')
    return parsed[key] as ModelDefinition[]
  }
  return {properties:definitions('properties'),events:definitions('events'),functions:definitions('functions')}
}
export async function loadTemplateThingModel(kind:'product'|'device',id:string):Promise<ThingModel> {
  const result=ruleApiResult(await request.get(kind === 'product' ? `/device-product/${encodeURIComponent(id)}` : `/device-instance/${encodeURIComponent(id)}/detail`,undefined,options))
  if (!record(result)) throw new Error('invalid model response')
  return parseThingModel(result.metadata)
}
