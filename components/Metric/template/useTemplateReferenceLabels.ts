import { computed, ref, watch, onScopeDispose, type Ref } from 'vue'
import type { MetricConfig, MetricDimensionProvider } from '../types'

/** 名称仅归当前可见引用所有；按业务类型批量读取，旧请求不能回填另一模板或已卸载视图。 */
export function useTemplateReferenceLabels(references: Ref<MetricConfig[]>, dimensions: Ref<MetricDimensionProvider[]>) {
  const names = ref<Record<string, string>>({})
  const keys = computed(() => JSON.stringify(references.value.map(item => [item.ownerType, item.ownerId])))
  let generation = 0
  const key = (type: string, id: string) => JSON.stringify([type, id])
  watch([keys, dimensions], async ([, providers], previous) => {
    const token = ++generation
    const visible = new Set(references.value.map(item => key(item.ownerType, item.ownerId)))
    names.value = providers === previous?.[1] ? Object.fromEntries(Object.entries(names.value).filter(([id]) => visible.has(id))) : {}
    await Promise.all(providers.map(async provider => {
      if (!provider.resolveObjects) return
      const ids = [...new Set(references.value.filter(item => item.ownerType === provider.ownerType
        && !names.value[key(item.ownerType, item.ownerId)]).map(item => item.ownerId))]
      if (!ids.length) return
      try {
        // 每次最多读取一页名称；加载更多时也不把全部对象交给业务查询。
        for (let offset = 0; offset < ids.length && token === generation; offset += 32) {
          const requested = ids.slice(offset, offset + 32)
          const values = await provider.resolveObjects(requested)
          if (token !== generation) return
          for (const value of values) if (requested.includes(value.ownerId) && value.label) names.value[key(provider.ownerType, value.ownerId)] = value.label
        }
      } catch { /* 名称不可读时仍展示已授权的指标引用，不将标识伪装成名称。 */ }
    }))
  }, { immediate: true })
  onScopeDispose(() => { generation++ })
  return (config: MetricConfig) => names.value[key(config.ownerType, config.ownerId)] || config.ownerId
}
