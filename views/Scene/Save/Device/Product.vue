<template>
  <IotAddDeviceProductStep
    class="scene-device-product-picker"
    compact-meta
    :category-tree="categoryTree"
    :category-loading="categoryLoading"
    :total-product-count="totalProductCount"
    :unclassified-product-count="unclassifiedProductCount"
    :selected-category-id="selectedCategoryId"
    :products="products"
    :selected-product-key="rowKey"
    :filter-terms="filterTerms"
    :total="total"
    :page-index="pageIndex"
    :page-size="pageSize"
    :loading="loading"
    :message="message"
    @select-product="selectProduct"
    @select-category="selectCategory"
    @select-unclassified="selectUnclassified"
    @query-change="loadProducts(true, $event)"
  />
</template>

<script setup lang="ts" name="SceneDeviceProduct">
import { ref, watch, type PropType } from 'vue'
import type { ConditionFilterTerm } from '@jetlinks-web-core/components/ConditionFilter'
import {
  queryDeviceProductById_api,
  queryDeviceProductCategoryTree_api,
  queryDeviceProductPage_api,
  type DeviceQueryTerm,
  type IotDeviceProductTemplate,
} from '@device-manager-ui/api/device'
import IotAddDeviceProductStep from '@device-manager-ui/views/device/list/components/IotAddDeviceProductStep.vue'
import type { ProductCategoryTreeNode } from '@device-manager-ui/views/device/Product/components/ProductCategoryTree.vue'
import { collectProductCategoryScopeIds } from '@device-manager-ui/utils/deviceCreationSources'

type ProductQuery = { terms?: DeviceQueryTerm[]; pageIndex?: number }

const UNCLASSIFIED_CATEGORY_ID = '__product-unclassified__'

const props = defineProps({
  rowKey: { type: String, default: '' },
  detail: { type: Object as PropType<IotDeviceProductTemplate | Record<string, never>>, default: () => ({}) },
})

const emit = defineEmits<{
  (event: 'update:rowKey', value: string): void
  (event: 'update:detail', value: IotDeviceProductTemplate): void
  (event: 'change', value: IotDeviceProductTemplate): void
}>()

const categoryTree = ref<ProductCategoryTreeNode[]>([])
const categoryLoading = ref(false)
const totalProductCount = ref(0)
const unclassifiedProductCount = ref(0)
const selectedCategoryId = ref<string>()
const products = ref<IotDeviceProductTemplate[]>([])
const filterTerms = ref<ConditionFilterTerm[]>([])
const total = ref(0)
const pageIndex = ref(0)
const pageSize = ref(6)
const loading = ref(false)
const message = ref('')
let requestSequence = 0

function normalizeCategoryTree(nodes: Record<string, any>[] = []): ProductCategoryTreeNode[] {
  return nodes.map(node => ({
    ...node,
    id: String(node.id),
    name: String(node.name || ''),
    children: normalizeCategoryTree(node.children || node._children || []),
  }))
}

/** 分类统计和产品列表按打开周期分别加载，确保数量与可选范围来自同一运行时。 */
async function loadCategories() {
  if (categoryLoading.value) return
  categoryLoading.value = true
  try {
    const statistics = await queryDeviceProductCategoryTree_api()
    categoryTree.value = normalizeCategoryTree(statistics.categories)
    totalProductCount.value = statistics.total
    unclassifiedProductCount.value = statistics.unclassified
  } finally {
    categoryLoading.value = false
  }
}

/** 条件筛选、分类和分页共同组成查询键；序号防止旧请求覆盖当前结果。 */
async function loadProducts(force = false, query: ProductQuery = {}) {
  if (loading.value && !force) return
  const sequence = ++requestSequence
  loading.value = true
  message.value = ''
  if (query.terms !== undefined) filterTerms.value = query.terms as ConditionFilterTerm[]
  if (query.pageIndex !== undefined) pageIndex.value = query.pageIndex
  try {
    const page = await queryDeviceProductPage_api({
      pageIndex: pageIndex.value,
      pageSize: pageSize.value,
      terms: filterTerms.value as DeviceQueryTerm[],
      classifiedIds: selectedCategoryId.value && selectedCategoryId.value !== UNCLASSIFIED_CATEGORY_ID
        ? collectProductCategoryScopeIds(categoryTree.value, selectedCategoryId.value)
        : undefined,
      unclassified: selectedCategoryId.value === UNCLASSIFIED_CATEGORY_ID,
    })
    if (sequence !== requestSequence) return
    products.value = page.data
    total.value = page.total
    pageIndex.value = page.pageIndex
    pageSize.value = page.pageSize
    const selected = page.data.find(item => item.id === props.rowKey)
    if (selected) emitDetail(selected)
  } catch (error) {
    if (sequence !== requestSequence) return
    products.value = []
    total.value = 0
    message.value = error instanceof Error ? error.message : ''
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

function selectCategory(id?: string) {
  selectedCategoryId.value = id
  pageIndex.value = 0
  void loadProducts(true)
}

function selectUnclassified() {
  selectedCategoryId.value = UNCLASSIFIED_CATEGORY_ID
  pageIndex.value = 0
  void loadProducts(true)
}

function emitDetail(product: IotDeviceProductTemplate) {
  emit('update:detail', product)
  emit('change', product)
}

function selectProduct(id: string) {
  const product = products.value.find(item => item.id === id)
  if (!product) return
  emit('update:rowKey', id)
  emitDetail(product)
}

watch(() => props.rowKey, async id => {
  if (!id || products.value.some(item => item.id === id)) return
  const product = await queryDeviceProductById_api(id)
  if (product && props.rowKey === id) emitDetail(product)
}, { immediate: true })

void Promise.all([loadCategories(), loadProducts()])
</script>

<style scoped>
/* 仅调整场景产品选择：两行说明与自然高度网格，分类列表独立滚动。 */
.scene-device-product-picker { min-height: 0; }
.scene-device-product-picker :deep(.add-device-product-picker__categories) { height: min(27rem, calc(100dvh - 22rem)); }
.scene-device-product-picker :deep(.add-device-library__grid) { min-height: 0; grid-auto-rows: minmax(10.5rem, auto); align-items: stretch; }
.scene-device-product-picker :deep(.card-summary__description) { min-height: 3em; line-height: 1.5; -webkit-line-clamp: 2; }
</style>
