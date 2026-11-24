import { onScopeDispose, shallowRef, watch, type Ref } from 'vue'
import { metricApi } from './api'
import type { MetricReadApi } from './types'

/** 面板共用当前语言的算法元数据，刷新数值不重复加载；过期语言响应不覆盖新语言。 */
export function useMetricCalculators(locale: Readonly<Ref<string>>, api: MetricReadApi = metricApi) {
  return useLocalizedCatalog(locale,()=>api.calculators())
}

export function useMetricAggregations(locale: Readonly<Ref<string>>, api: MetricReadApi = metricApi) {
  return useLocalizedCatalog(locale,()=>api.aggregations())
}

function useLocalizedCatalog<T>(locale:Readonly<Ref<string>>,load:()=>Promise<T[]>) {
  const catalog = shallowRef<T[]>([])
  let generation = 0
  watch(() => locale.value, async () => {
    const token = ++generation
    catalog.value = []
    try {
      const values = await load()
      if (token === generation) catalog.value = values
    } catch {
      // 元数据不可读时仍按模板声明显示；不阻断业务结果，也不猜测算法字段含义。
      if (token === generation) catalog.value = []
    }
  }, { immediate:true })
  onScopeDispose(() => { generation++ })
  return catalog
}
