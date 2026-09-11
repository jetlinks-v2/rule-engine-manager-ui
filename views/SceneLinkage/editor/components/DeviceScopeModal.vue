<template>
  <a-modal :open="open" :title="title" :width="680" :footer="null" :mask-closable="false" @cancel="$emit('cancel')">
    <a-form layout="vertical">
      <a-input-search v-if="scopeView === 'custom'" v-model:value="keyword" class="device-scope-modal__search" :placeholder="$t('IotSceneLinkage.placeholder.searchDevice')" :loading="deviceLoading" @search="searchDevices" />
      <div class="device-scope-modal__toolbar">
        <a-button-group class="device-scope-modal__tabs">
          <a-button :type="scopeView === 'space' ? 'primary' : 'default'" @click="selectScopeView('space')">{{ $t('IotSceneLinkage.editor.areas') }}</a-button>
          <a-button :type="scopeView === 'device-group' ? 'primary' : 'default'" @click="selectScopeView('device-group')">{{ $t('IotSceneLinkage.editor.groups') }}</a-button>
          <a-button :type="scopeView === 'custom' ? 'primary' : 'default'" @click="selectScopeView('custom')">{{ $t('IotSceneLinkage.editor.customDevices') }}</a-button>
          <a-button :type="scopeView === 'all' ? 'primary' : 'default'" @click="selectScopeView('all')">{{ $t('IotSceneLinkage.editor.allDevices') }}</a-button>
        </a-button-group>
      </div>
      <p v-if="scopeDescription" class="device-scope-modal__description">{{ scopeDescription }}</p>
      <template v-if="searched">
        <a-spin :spinning="deviceLoading">
          <a-checkbox-group v-if="fixedDeviceOptions.length" :value="fixedDeviceIds" class="device-scope-modal__device-list" @change="changeFixedDevices">
            <a-checkbox v-for="device in fixedDeviceOptions" :key="device.value" :value="device.value"><IotAlarmTargetOption :option="device" type="device" single-line :show-description="false" /></a-checkbox>
          </a-checkbox-group>
          <a-empty v-else-if="!deviceLoading" :description="$t('IotSceneLinkage.scope.empty')" />
          <a-pagination v-if="fixedTotal > pageSize" class="device-scope-modal__pagination" size="small" :current="pageIndex + 1" :page-size="pageSize" :total="fixedTotal" show-less-items @change="changePage" />
        </a-spin>
      </template>
      <a-tree v-else-if="visibleScopeTreeData.length" class="device-scope-modal__tree" checkable block-node :check-strictly="true" :tree-data="visibleScopeTreeData" :checked-keys="checkedKeys" :expanded-keys="expandedKeys" :loading="scopeLoading" @check="onScopeCheck" @expand="onScopeExpand">
        <template #title="node"><span class="device-scope-modal__node"><b>{{ node.title }}</b></span></template>
      </a-tree>
      <a-empty v-else-if="draft.selector === 'all'" :description="$t('IotSceneLinkage.scope.allHint')" />
      <a-empty v-else :description="emptyDescription" />
    </a-form>
    <div class="device-scope-modal__footer">
      <a-space>
        <span>{{ selectedText }}</span>
        <a-button type="link" :disabled="!canSelectCurrentView" @click="selectAll">{{ $t('IotSceneLinkage.action.selectAll') }}</a-button>
        <a-button type="link" :disabled="!draft.selectorValues.length" @click="clearSelection">{{ $t('IotSceneLinkage.action.clear') }}</a-button>
      </a-space>
      <a-space><a-button @click="$emit('cancel')">{{ $t('IotSceneLinkage.action.cancel') }}</a-button><a-button type="primary" @click="save">{{ $t('IotSceneLinkage.action.confirm') }}</a-button></a-space>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { getProduct, queryDevicesPage } from '../../../../api/scene-linkage'
import { queryDeviceGroupDetailList_api, queryProjectSpaceAreaSettings_api } from '../../../../api/scene-resources'
import IotAlarmTargetOption from '../alarm/IotAlarmTargetOption.vue'

export type DeviceScope = {
  selector: 'fixed' | 'space' | 'device-group' | 'all'
  selectorValues: Array<{ value: string; name?: string }>
  options?: { view?: 'space' | 'device-group' | 'custom' | 'all' }
}

const props = defineProps({
  open: { type: Boolean, default: false },
  productId: { type: String, default: '' },
  modelValue: { type: Object as PropType<DeviceScope>, required: true },
})
const emit = defineEmits<{
  (event: 'cancel'): void
  (event: 'save', value: DeviceScope): void
}>()

const { t } = useI18n()
const pageSize = 20
const productName = ref('')
const keyword = ref('')
const pageIndex = ref(0)
const searched = ref(false)
const deviceLoading = ref(false)
const scopeLoading = ref(false)
const fixedTotal = ref(0)
const fixedDeviceOptions = ref<Array<{ label: string; value: string; data: Record<string, any> }>>([])
const scopeView = ref<'space' | 'device-group' | 'custom' | 'all'>()
const expandedKeys = ref<string[]>([])
const scopeTreeData = ref<any[]>([])
const scopeNodeMap = new Map<string, any>()
let deviceSearchTimer: ReturnType<typeof setTimeout> | undefined
let deviceSearchRequestSeq = 0
const draft = reactive<DeviceScope>({ selector: 'fixed', selectorValues: [] })
const dynamicScope = computed(() => ['space', 'device-group'].includes(draft.selector))
const title = computed(() => t('IotSceneLinkage.title.selectDevicesWithProduct', { productName: productName.value || props.productId || '-' }))
const visibleScopeTreeData = computed(() => ['space', 'device-group'].includes(scopeView.value || '') ? scopeTreeData.value.find(item => item.key === `root:${scopeView.value === 'space' ? 'space' : 'group'}`)?.children || [] : [])
const checkedKeys = computed(() => dynamicScope.value ? { checked: getDynamicCheckedKeys(), halfChecked: getDynamicHalfCheckedKeys() } : [])
const fixedDeviceIds = computed(() => draft.selectorValues.map(item => item.value))
const canSelectCurrentView = computed(() => searched.value ? fixedDeviceOptions.value.length > 0 : false)
const scopeDescription = computed(() => {
  if (scopeView.value === 'space') return t('IotSceneLinkage.scope.areaGroupHint')
  if (scopeView.value === 'device-group') return t('IotSceneLinkage.scope.deviceGroupHint')
  if (scopeView.value === 'custom') return t('IotSceneLinkage.scope.customDevicesHint')
  return ''
})
const selectedText = computed(() => {
  if (draft.selector === 'all') return t('IotSceneLinkage.scope.selectedAll')
  if (draft.selector === 'space') return t('IotSceneLinkage.scope.selectedAreaGroups', { count: draft.selectorValues.length })
  if (draft.selector === 'device-group') return t('IotSceneLinkage.scope.selectedDeviceGroups', { count: draft.selectorValues.length })
  return t('IotSceneLinkage.scope.selectedDevices', { count: draft.selectorValues.length })
})
const emptyDescription = computed(() => {
  if (scopeView.value === 'space') return t('IotSceneLinkage.scope.emptyAreaGroups')
  if (scopeView.value === 'device-group') return t('IotSceneLinkage.scope.emptyDeviceGroups')
  return t('IotSceneLinkage.scope.searchHint')
})

watch(() => props.open, async open => {
  if (!open) {
    clearDeviceSearchTimer()
    return
  }
  draft.selector = props.modelValue.selector
  draft.selectorValues = props.modelValue.selectorValues.map(item => ({ value: String(item.value), name: item.name }))
  scopeView.value = getInitialScopeView()
  keyword.value = ''
  searched.value = false
  fixedDeviceOptions.value = []
  await Promise.all([loadProductName(), loadScopeTree()])
  if (scopeView.value === 'space' || scopeView.value === 'device-group') {
    expandScopeTree(scopeView.value)
  } else if (scopeView.value === 'custom') {
    await searchDevices()
  }
})

watch(keyword, () => {
  if (!props.open || scopeView.value !== 'custom' || !searched.value) return
  debounceSearchDevices()
})

async function loadProductName() {
  if (!props.productId) return
  const response: any = await getProduct(props.productId)
  const product = response?.result ?? response
  productName.value = product?.name || props.productId
}

async function selectScopeView(type: 'space' | 'device-group' | 'custom' | 'all') {
  scopeView.value = type
  if (type === 'all') {
    draft.selector = 'all'
    draft.selectorValues = []
    searched.value = false
    return
  }
  if (type === 'custom') {
    draft.selector = 'fixed'
    draft.selectorValues = []
    await searchDevices()
    return
  }
  searched.value = false
  fixedDeviceOptions.value = []
  fixedTotal.value = 0
  if (draft.selector !== type) {
    draft.selector = type
    draft.selectorValues = []
  }
  if (!scopeTreeData.value.length) await loadScopeTree()
  expandScopeTree(type)
}

function onScopeCheck(keys: any, event?: any) {
  if (scopeView.value !== 'space' && scopeView.value !== 'device-group') return
  if (draft.selector !== scopeView.value) {
    draft.selector = scopeView.value
    draft.selectorValues = []
  }
  const checked = Array.isArray(keys) ? keys : keys.checked || []
  draft.selectorValues = checked
    .map((key: string) => scopeNodeMap.get(key))
    .filter((node: any) => node?.scopeType === draft.selector)
    .map((node: any) => ({ value: node.scopeId, name: node.title }))
}

function onScopeExpand(keys: string[]) {
  expandedKeys.value = keys
}

function expandScopeTree(type: 'space' | 'device-group') {
  const nodes = getScopeNodes(scopeTreeData.value.find(item => item.key === `root:${type === 'space' ? 'space' : 'group'}`)?.children || [])
    .filter(node => node.scopeType === type)
  expandedKeys.value = nodes.map(node => node.key)
}

function changeFixedDevices(values: Array<string | number>) {
  const currentPageIds = new Set(fixedDeviceOptions.value.map(item => item.value))
  const retainedIds = fixedDeviceIds.value.filter(id => !currentPageIds.has(id))
  const selectedIds = values.map(value => String(value))
  draft.selectorValues = [...new Set([...retainedIds, ...selectedIds])].map(value => ({ value, name: fixedDeviceOptions.value.find(item => item.value === value)?.label || draft.selectorValues.find(item => item.value === value)?.name }))
}

function selectAll() {
  if (!searched.value) {
    return
  }
  const values = new Set([...fixedDeviceIds.value, ...fixedDeviceOptions.value.map(item => item.value)])
  draft.selectorValues = [...values].map(value => ({ value, name: fixedDeviceOptions.value.find(item => item.value === value)?.label || draft.selectorValues.find(item => item.value === value)?.name }))
}

function clearSelection() {
  if (draft.selector === 'all') {
    draft.selector = 'fixed'
    scopeView.value = 'custom'
  }
  draft.selectorValues = []
}

async function searchDevices() {
  clearDeviceSearchTimer()
  pageIndex.value = 0
  scopeView.value = 'custom'
  searched.value = true
  if (draft.selector !== 'fixed') {
    draft.selector = 'fixed'
    draft.selectorValues = []
  }
  await loadDevices()
}

async function changePage(page: number) {
  pageIndex.value = page - 1
  await loadDevices()
}

async function loadDevices() {
  if (!props.productId) return
  deviceLoading.value = true
  const requestSeq = ++deviceSearchRequestSeq
  try {
    const searchKeyword = keyword.value.trim()
    const response: any = await queryDevicesPage({
      pageIndex: pageIndex.value,
      pageSize,
      terms: [
        { column: 'productId', termType: 'eq', value: props.productId },
        ...(searchKeyword ? [{
          terms: [
            { column: 'name', termType: 'like', value: `%${searchKeyword}%` },
            { column: 'id', termType: 'like', value: `%${searchKeyword}%`, type: 'or' },
          ],
        }] : []),
      ],
    })
    if (requestSeq !== deviceSearchRequestSeq) return
    const result = response?.result ?? response
    const rows = result?.data || result?.records || []
    fixedTotal.value = Number(result?.total ?? result?.totalElements ?? rows.length)
    fixedDeviceOptions.value = rows.map((device: any) => ({
      label: device.name || device.id,
      value: String(device.id),
      data: device,
    }))
    searched.value = true
  } finally {
    if (requestSeq === deviceSearchRequestSeq) {
      deviceLoading.value = false
    }
  }
}

function debounceSearchDevices() {
  clearDeviceSearchTimer()
  deviceSearchTimer = setTimeout(() => {
    deviceSearchTimer = undefined
    void searchDevices()
  }, 300)
}

function clearDeviceSearchTimer() {
  if (!deviceSearchTimer) return
  clearTimeout(deviceSearchTimer)
  deviceSearchTimer = undefined
}

async function loadScopeTree() {
  scopeLoading.value = true
  try {
    const [areas, groups] = await Promise.all([queryProjectSpaceAreaSettings_api(''), queryDeviceGroupDetailList_api()])
    scopeNodeMap.clear()
    const areaNodes = (areas?.areas || []).map((area: any) => {
      const node = { key: `space:${area.id}`, title: area.name, scopeType: 'space', scopeId: String(area.id), isLeaf: false, children: [] as any[] }
      scopeNodeMap.set(node.key, node)
      return node
    })
    const treeMap = new Map(areaNodes.map((node: any) => [node.key, node]))
    const areaRoots: any[] = []
    areaNodes.forEach((node: any) => {
      const area = (areas?.areas || []).find((item: any) => String(item.id) === node.scopeId)
      const parent = area?.parentId ? treeMap.get(`space:${area.parentId}`) : undefined
      if (parent) parent.children.push(node); else areaRoots.push(node)
    })
    const groupNodes = groups.map((group: any) => {
      const node = { key: `device-group:${group.id}`, title: group.name, scopeType: 'device-group', scopeId: String(group.id), isLeaf: true, children: [] as any[] }
      scopeNodeMap.set(node.key, node)
      return node
    })
    scopeTreeData.value = [{ key: 'root:space', children: areaRoots }, { key: 'root:group', children: groupNodes }].filter(item => item.children.length)
    expandedKeys.value = []
  } finally {
    scopeLoading.value = false
  }
}

function save() {
  emit('save', { selector: draft.selector, selectorValues: draft.selectorValues.map(item => ({ value: String(item.value), name: item.name })), options: { view: scopeView.value || 'space' } })
}

function getInitialScopeView(): 'space' | 'device-group' | 'custom' | 'all' {
  if (props.modelValue.selector === 'space' || props.modelValue.selector === 'device-group' || props.modelValue.selector === 'all') return props.modelValue.selector
  return props.modelValue.selectorValues.length ? 'custom' : 'space'
}

function getDynamicCheckedKeys(): string[] {
  // 区域和设备分组保存用户显式勾选的维度节点，不做父子级联展开。
  return draft.selectorValues.map(item => `${draft.selector}:${item.value}`)
}

function getDynamicHalfCheckedKeys(): string[] {
  return []
}

function getScopeNodes(nodes: any[]): any[] {
  return nodes.flatMap(node => [node, ...getScopeNodes(node.children || [])])
}
</script>

<style scoped>
.device-scope-modal__mode { display: inline-flex; gap: 8px; align-items: center; }
.device-scope-modal__toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.device-scope-modal__tabs { display: inline-flex; }
.device-scope-modal__tabs :deep(.ant-btn) { min-width: 112px; }
.device-scope-modal__description { margin: -2px 0 12px; color: var(--ant-color-text-secondary); font-size: 12px; line-height: 20px; }
.device-scope-modal__search { display: block; width: 100%; margin-bottom: 12px; }
.device-scope-modal__device-list { display: grid; max-height: 360px; overflow: auto; padding: 4px 12px; border: 1px solid var(--ant-color-border-secondary); border-radius: 6px; background: var(--ant-color-bg-container); }
.device-scope-modal__device-list :deep(.ant-checkbox-wrapper) { display: flex; gap: 10px; align-items: center; min-height: 48px; margin-inline-start: 0; border-bottom: 1px solid var(--ant-color-border-secondary); }
.device-scope-modal__device-list :deep(.ant-checkbox-wrapper:last-child) { border-bottom: 0; }
.device-scope-modal__device-list :deep(.ant-checkbox + span) { flex: 1; min-width: 0; }
.device-scope-modal__pagination { display: flex; justify-content: flex-end; margin-top: 12px; }
.device-scope-modal__tree { max-height: 480px; overflow: auto; padding: 8px; border: 1px solid var(--ant-color-border-secondary); border-radius: 6px; }
.device-scope-modal__node { display: flex; gap: 12px; align-items: center; min-width: 0; }
.device-scope-modal__tree :deep(.ant-tree-title) { display: block; min-width: 0; width: 100%; }
.device-scope-modal__tree :deep(.ant-tree-node-content-wrapper) { flex: 1; min-width: 0; }
.device-scope-modal__footer { display: flex; justify-content: space-between; align-items: center; padding-top: 16px; }
</style>
