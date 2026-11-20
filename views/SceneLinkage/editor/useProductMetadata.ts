import { ref } from 'vue'
import { getProduct } from '../../../api/scene-linkage'

type ProductMetadata = { properties: any[]; functions: any[]; events: any[] }
const emptyMetadata = (): ProductMetadata => ({ properties: [], functions: [], events: [] })

/** 清空旧产品能力，忽略过期响应；失败与空物模型分别展示，且允许重试。 */
export function useProductMetadata(productId: () => string | undefined, fetchProduct = getProduct) {
  const metadata = ref<ProductMetadata>(emptyMetadata())
  const product = ref<Record<string, any>>()
  const loading = ref(false)
  const failed = ref(false)
  let request = 0
  async function load() {
    const current = ++request
    const id = productId()
    product.value = undefined
    metadata.value = emptyMetadata()
    failed.value = false
    loading.value = Boolean(id)
    if (!id) return
    try {
      const response: any = await fetchProduct(id)
      if (response?.success === false) throw new Error('Product metadata request failed')
      const detail = response?.result ?? response
      const value = typeof detail?.metadata === 'string' ? JSON.parse(detail.metadata || '{}') : detail?.metadata || {}
      if (current !== request || id !== productId()) return
      product.value = detail
      metadata.value = {
        properties: Array.isArray(value.properties) ? value.properties : [],
        functions: Array.isArray(value.functions) ? value.functions : [],
        events: Array.isArray(value.events) ? value.events : [],
      }
    } catch {
      if (current === request && id === productId()) failed.value = true
    } finally {
      if (current === request) loading.value = false
    }
  }
  return { product, metadata, loading, failed, load }
}
