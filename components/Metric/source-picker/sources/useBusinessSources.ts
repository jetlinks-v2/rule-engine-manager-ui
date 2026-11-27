import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import type { MetricSourceRequest, MetricSourceSelection } from '../../types'
import { metricSourceSchema, metricSourceSemantics } from '../../sourceSchema'
import { loadObjectSourceCapabilities, type BusinessCommand, type ObjectSourceCapability } from '../../../../api/metricBusinessSources'
import { describeMetricProvider } from '../../../../api/metricSources'
import type { SourceMethod } from './catalog'

/** 来源只消费指标管理返回的桥接声明；元数据发现不执行查询。 */
export function useBusinessSources(request:Ref<MetricSourceRequest | undefined>, object:Ref<{type:string;id:string;name:string}>, visible:Ref<boolean>) {
  const methods = ref<SourceMethod[]>([]), loading = ref(false), failed = ref(false)
  const selected = ref<SourceMethod>(), parameters = ref<Record<string,unknown>>({})
  let generation = 0
  const canConfirm = computed(()=>!!selected.value && !loading.value
    && (request.value?.purpose === 'declaration' || !!object.value.id))
  function hasTimeWindow(capability:ObjectSourceCapability) {
    if (capability.capabilities) return !capability.capabilities.includes('current') && capability.kind === 'query'
    const sources = Object.values(capability.bindings || {}).map(binding=>binding.source)
    return sources.includes('timeWindowTerms') || sources.includes('from') && sources.includes('to')
  }
  function history(capability:ObjectSourceCapability) {
    if (capability.capabilities) return capability.capabilities.includes('history')
    return !!capability.evidenceMapping?.observedAt && hasTimeWindow(capability)
  }
  function reference(capability:ObjectSourceCapability, path:string, values:Record<string,unknown> = {}) {
    return {...capability.reference,configuration:{...capability.reference.configuration,valuePath:path,parameters:values,
      ...(history(capability) ? {historyCapability:capability.id} : {})}}
  }
  /** 保留原字段语义、类型和层级；一个查询可以提供多个可选输出，不按名称猜来源。 */
  function outputs(schema:Record<string,unknown>, name:string, path='$', expands?:Record<string,unknown>):{path:string;name:string;schema:Record<string,unknown>;expands?:Record<string,unknown>}[] {
    const result: {path:string;name:string;schema:Record<string,unknown>;expands?:Record<string,unknown>}[] = [{path,name,schema,expands}]
    if (Array.isArray(schema.properties)) for (const field of schema.properties) {
      result.push(...outputs(field.valueType || {},field.name || field.id,path === '$' ? field.id : `${path}.${field.id}`,field.expands))
    }
    return result
  }
  async function describe(capability:ObjectSourceCapability, target:{type:string;id:string}):Promise<SourceMethod[]> {
    // 原生物消息已按实例物模型投影为属性/事件，不重复展示同一个订阅入口。
    if (capability.kind === 'action' || capability.event?.transport === 'thingMessage' || request.value?.context.scope === 'children') return []
    const event = capability.kind === 'event'
    let command:BusinessCommand | undefined, schema:Record<string,unknown>
    if (event) {
      const source = reference(capability,'$')
      const description = await describeMetricProvider({id:capability.id,thingType:target.type,...source,configuration:{...source.configuration,thingId:target.id}})
      schema = metricSourceSchema(description.schema)
    } else {
      command = capability.metadata
      schema = metricSourceSchema(command.output || {})
      command = {...command,inputs:(command.inputs || []).filter(input=>!capability.configurableParameters || capability.configurableParameters.includes(input.id))}
    }
    const kind = event ? 'businessEvent' as const : 'businessQuery' as const
    return outputs(schema,capability.name,'$',command?.expands).map(field=>({
      key:`${kind}:${capability.id}:${field.path}`,kind,id:capability.id,name:field.name,group:capability.name,
      description:command?.description,capability,command,valuePath:field.path,valueType:field.schema,expands:field.expands,
      capabilities:event ? ['subscribe'] : history(capability) ? ['history'] : hasTimeWindow(capability) ? [] : ['current'],
    }))
  }
  /** 换对象/关闭立即清空并使旧请求失效；最多四路元数据发现，不跨用户缓存。 */
  async function load() {
    const token = ++generation, target = {...object.value}
    methods.value = []; selected.value = undefined; parameters.value = {}; failed.value = false
    loading.value = !!request.value && !!target.id && visible.value
    if (!loading.value) return
    try {
      const capabilities = await loadObjectSourceCapabilities(target.type,target.id)
      const found:SourceMethod[] = []
      for (let index=0; index<capabilities.length && token === generation; index+=4) {
        const batch = await Promise.allSettled(capabilities.slice(index,index+4).map(capability=>describe(capability,target)))
        if (token !== generation) return
        for (const result of batch) {
          if (result.status === 'fulfilled') found.push(...result.value)
          else failed.value = true
        }
      }
      if (token === generation) methods.value = found
    } catch { if (token === generation) failed.value = true }
    finally { if (token === generation) loading.value = false }
  }
  function select(method:SourceMethod,restore=false) {
    selected.value = method
    parameters.value = restore ? {...request.value?.mapping?.providerSource?.configuration.parameters as Record<string,unknown>} : {}
  }
  function selection():MetricSourceSelection | undefined {
    const method = selected.value
    if (!method?.capability || !canConfirm.value) return
    const allowed = method.command?.inputs?.map(input=>input.id) || method.capability.configurableParameters || []
    const values = Object.fromEntries(Object.entries(parameters.value).filter(([id])=>allowed.includes(id)))
    const config = reference(method.capability,method.valuePath || '$',values)
    const original = request.value?.mapping?.providerSource
    if (original?.provider === config.provider && original.sourceType === config.sourceType
      && original.configuration.valuePath === config.configuration.valuePath) config.configuration = {...original.configuration,...config.configuration}
    const member = request.value?.context.scope === 'children'
    const subject = request.value?.mapping?.providerSource?.subject
    return {mapping:{kind:'provider',thingType:subject ? request.value?.mapping?.thingType || request.value?.context.targetType : member ? request.value!.context.targetType : object.value.type,
      ...(!member ? {thingId:subject ? request.value?.mapping?.thingId : object.value.id} : {}),id:method.valuePath || '$',
      providerSource:{...config,...(subject ? {subject} : member ? {subject:{type:object.value.type,id:object.value.id}} : {})}},
      label:`${object.value.name} / ${method.name}`,declaration:{id:method.id,name:method.name,unit:method.unit,valueType:method.valueType,semantics:metricSourceSemantics(method.expands)}}
  }
  watch([()=>request.value,()=>object.value.type,()=>object.value.id,visible],()=>{void load()},{immediate:true})
  onScopeDispose(()=>{generation++})
  return {methods,loading,failed,selected,parameters,canConfirm,load,select,selection}
}
export type BusinessSourcesState = ReturnType<typeof useBusinessSources>
