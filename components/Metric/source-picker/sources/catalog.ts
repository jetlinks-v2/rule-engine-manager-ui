import type { BusinessCommand, BusinessEvent, ObjectSourceCapability } from '../../../../api/metricBusinessSources'
import type { MetricPropertyOption } from '../metricSources'
import type { MetricInputMapping, MetricTemplate, MetricTemplateOutput, MetricValue } from '../../types'

export type SourceKind = 'property'|'event'|'builtin'|'metric'|'businessEvent'|'businessQuery'
/** 来源目录与建议来源使用同一套图标，只影响展示。 */
export const sourceKindIcon = (kind:string) => ({property:'DatabaseOutlined',event:'ThunderboltOutlined',builtin:'ApiOutlined',metric:'NodeIndexOutlined',businessEvent:'ThunderboltOutlined',businessQuery:'SearchOutlined'}[kind] || 'DatabaseOutlined')
export interface SourceMethod {
  key:string
  kind:SourceKind
  id:string
  name:string
  group?:string
  description?:string
  unit?:string
  preview?:{template:MetricTemplate;output:MetricTemplateOutput;value?:MetricValue}
  icon?:string
  valueType?:Record<string,unknown>
  expands?:Record<string,unknown>
  capabilities:('current'|'history'|'subscribe')[]
  service?:string
  event?:BusinessEvent
  command?:BusinessCommand
  capability?:ObjectSourceCapability
  valuePath?:string
}
export interface SourceItem { key:string; name:string; group?:string; methods:SourceMethod[] }

/** 原生来源保留原交互；扩展来源由管理目录反显，具体匹配仍使用完整引用。 */
export function mappingSourceKind(mapping?:MetricInputMapping):SourceKind|'unsupported' {
  const source = mapping?.providerSource
  if (source) {
    if ((source.provider === 'things' || source.provider === 'device-events') && source.sourceType === 'event') return 'event'
    if (source.provider === 'events') return 'businessEvent'
    if (mapping.kind === 'provider') return 'businessQuery'
    return 'unsupported'
  }
  return mapping?.kind === 'metric' ? 'metric' : mapping?.kind === 'builtin' || mapping?.id?.startsWith('$') ? 'builtin' : 'property'
}

/** 属性、事件和平台数据共享一种目录投影，读取能力仍来自各自的真实契约。 */
export function propertyMethod(item:MetricPropertyOption, event=false):SourceMethod {
  const kind = event ? 'event' : item.platform ? 'builtin' : 'property'
  const declaration = item.expands?.metricSource as {capabilities?:SourceMethod['capabilities']} | undefined
  return {...item,key:`${kind}:${item.id}`,kind,capabilities:declaration?.capabilities || (event ? ['subscribe','history'] : item.platform ? ['current',...(item.history ? ['history' as const] : [])] : ['current','subscribe','history'])}
}

/** 查询须显式声明对应事件且取值路径相同才合并；不同字段不能成为同一数据的读取方式。 */
export function sourceItems(methods:SourceMethod[]):SourceItem[] {
  const groups = new Map<string,SourceItem>()
  const eventIds = new Set(methods.filter(item=>item.kind === 'businessEvent').map(item=>item.id))
  for (const method of methods) {
    const declaration = method.command?.expands?.metricSource as {eventType?:string;group?:string} | undefined
    const eventId = method.kind === 'businessEvent' ? method.id : declaration?.eventType
    const key = eventId && eventIds.has(eventId) ? `businessEvent:${eventId}:${method.valuePath || '$'}` : method.key
    let item = groups.get(key)
    if (!item) { item = {key,name:method.name,group:method.group || declaration?.group,methods:[]}; groups.set(key,item) }
    item.methods.push(method)
  }
  return [...groups.values()]
}

/** 搜索跨分组，建议范围只过滤展示；已有选择始终保留在目录中。 */
export function sourceGroups(items:SourceItem[], keyword:string, suggestions:string[], all:boolean, selectedKey:string) {
  const groups = new Map<string,SourceItem[]>()
  const search = keyword.trim().toLocaleLowerCase()
  for (const item of items) {
    if (!all && suggestions.length && item.key !== selectedKey && !item.methods.some(method=>suggestions.includes(method.kind))) continue
    if (search && !`${item.name} ${item.group || ''} ${item.methods.map(method=>`${method.id} ${method.description || ''}`).join(' ')}`.toLocaleLowerCase().includes(search)) continue
    const key = item.group || ''
    if (!groups.has(key)) groups.set(key,[])
    groups.get(key)!.push(item)
  }
  return [...groups].map(([name,items])=>({name,items}))
}
