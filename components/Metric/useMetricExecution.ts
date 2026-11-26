import { computed, watch, type Ref } from 'vue'
import { useDiagnosticQuery } from '@jetlinks-web-core/hooks/useDiagnosticQuery'
import { metricApi } from './api'
import { metricResultReference } from './presentation'
import type { MetricReadApi, MetricExecutionSnapshot, MetricExecutionView, MetricReference, MetricValue } from './types'

/** 详情按精确结果身份读取；跟随最新或固定历史由调用方选择，切换后取消旧请求。 */
export function useMetricExecution(reference:Ref<MetricReference>, current:Ref<MetricValue | undefined>, active:Ref<boolean>, api:Pick<MetricReadApi,'execution'> = metricApi, followLatest?:Ref<boolean>) {
  const query = useDiagnosticQuery<{scope:string;value:MetricValue;snapshot?:MetricExecutionSnapshot;following:boolean}>()
  const scope = computed(()=>JSON.stringify([reference.value.configId,reference.value.outputId,reference.value.targetType,reference.value.targetId]))
  const key = computed(()=>active.value && metricResultReference(current.value)
    ? JSON.stringify([scope.value,metricResultReference(current.value),!!followLatest?.value]) : '')
  function accepted() {
    const data=query.data.value
    return active.value && key.value && data?.scope === scope.value && data.following === !!followLatest?.value
      && (followLatest?.value || metricResultReference(data.value) === metricResultReference(current.value)) ? data : undefined
  }
  function refresh() {
    if (!key.value || !api.execution) { query.clear(); return }
    const ref = reference.value, value = current.value!, identity = metricResultReference(value)
    const requestScope=scope.value, following=!!followLatest?.value
    const previous=accepted()
    const knownSnapshot=metricResultReference(previous?.value) === identity ? previous?.snapshot : undefined
    const identityQuery = value.resultId ? {resultId:value.resultId} : {executionId:value.executionId!}
    return query.run(async signal=>{
      const snapshot = await api.execution!(ref.configId,ref.outputId,{...identityQuery,targetType:ref.targetType,targetId:ref.targetId},signal)
      // 同一结果的已知事实不因服务端最近记录过期而消失；不将其借给另一轮计算。
      return {scope:requestScope,value,following,snapshot:metricResultReference(snapshot) === identity ? snapshot : snapshot == null ? knownSnapshot : undefined}
    },true,
      {retainData:!!accepted(),isEmpty:result=>!result.snapshot?.steps.length})
  }
  watch(key,refresh,{immediate:true})
  return computed<MetricExecutionView>(()=>{
    const data=accepted()
    // 同一结果的 readView 等展示元数据可刷新；跨轮次则等待对应过程后一起切换。
    const value=data && metricResultReference(data.value) !== metricResultReference(current.value) ? data.value : current.value
    return {snapshot:data?.snapshot,value,loading:query.state.value.status === 'loading',
      error:query.state.value.status === 'error' ? query.state.value.message || ' ' : undefined,refresh}
  })
}
