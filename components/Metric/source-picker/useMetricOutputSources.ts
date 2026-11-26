import { computed, onScopeDispose, ref, watch } from 'vue'
import { loadMetricOutputs, readMetricLatest, type MetricOutputSource } from '../../../api/metricSources'
import type { MetricSourceRequest, MetricValue } from '../types'
import type { Ref, ShallowRef } from 'vue'

/** 候选始终属于当前选择及授权生命周期；迟到请求不能回填另一个对象。 */
export function useMetricOutputSources(request:ShallowRef<MetricSourceRequest | undefined>, deviceId:Ref<string>, active:Ref<boolean>, sourceObject?:Ref<{type:string;id:string}>) {
  const items = ref<(MetricOutputSource & {latest?:MetricValue})[]>([]), loading = ref(false), error = ref(false)
  let generation = 0
  const object = computed(() => {
    const context = request.value?.context
    return sourceObject?.value || (deviceId.value ? { type:'device', id:deviceId.value } : context ? { type:context.ownerType, id:context.ownerId } : undefined)
  })
  async function load() {
    const token = ++generation
    items.value = []; error.value = false; loading.value = false
    if (!active.value || !request.value || !object.value?.id || request.value.context.scope === 'children' || request.value.purpose === 'declaration') return
    loading.value = true
    try {
      const values = (await loadMetricOutputs(object.value.type, object.value.id)).filter(item=>item.config.id!==request.value?.configId)
      if(token!==generation)return
      if(request.value?.purpose==='reference'){
        const ids=[...new Set(values.map(item=>item.config.id!))],latest=new Map<string,import('../types').MetricLatest>()
        for(let offset=0;offset<ids.length;offset+=128){
          const batch=await readMetricLatest(ids.slice(offset,offset+128),{targetType:object.value.type,targetId:object.value.id})
          if(token!==generation)return
          for(const value of batch)latest.set(value.configId,value)
        }
        items.value=values.filter(item=>latest.has(item.config.id!) && !latest.get(item.config.id!)!.inaccessible)
          .map(item=>({...item,latest:latest.get(item.config.id!)?.outputs[item.output.metricId]}))
      }else items.value=values
    } catch { if (token === generation) error.value = true }
    finally { if (token === generation) loading.value = false }
  }
  watch([request, object, active], load, { immediate:true })
  onScopeDispose(() => { generation++ })
  return { items, loading, error, load, object }
}
