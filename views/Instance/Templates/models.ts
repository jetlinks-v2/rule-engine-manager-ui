import type { ModelDefinition, ThingModel } from './types'

const displayKeys=new Set(['name','nameI18n','description','text','label'])
function semantic(value:unknown):unknown {
  if (Array.isArray(value)) return value.map(semantic)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key])=>!displayKeys.has(key)).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,semantic(item)]))
  return value
}
const schemaKey=(definition:ModelDefinition) => JSON.stringify(semantic({valueType:definition.valueType,outputs:definition.outputs,inputs:definition.inputs}))
/** A device's own schema participates in compatibility; names never establish identity. */
export function compatibleThingModels(models:ThingModel[]):ThingModel {
  const common=(key:keyof ThingModel):ModelDefinition[] => (models[0]?.[key] || []).flatMap(definition=>{
    const matches=models.map(model=>model[key].find(item=>item.id === definition.id))
    if (!matches.every(item=>item && schemaKey(item) === schemaKey(definition))) return []
    const access=definition.expands?.type?.filter(type=>matches.every(item=>item?.expands?.type?.includes(type)))
    return [{...structuredClone(definition),...(access ? {expands:{...definition.expands,type:access}} : {})}]
  })
  return {properties:common('properties'),events:common('events'),functions:common('functions')}
}
export function eventDefinitions(event?:ModelDefinition):ModelDefinition[] {
  return Array.isArray(event?.outputs) ? event.outputs : event?.outputs?.properties || []
}
