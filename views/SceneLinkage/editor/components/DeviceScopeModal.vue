<template>
  <component :is="embedded ? 'div' : 'a-modal'" v-bind="dialogProps" :class="{ 'device-scope-modal__embedded': embedded }" @cancel="!embedded && $emit('cancel')">
    <header v-if="detailed" class="device-scope-modal__toolbar">
      <div class="device-scope-modal__product-summary">
        <strong>{{ draft.productName || productFilter || $t('IotSceneLinkage.form.product') }}</strong>
        <small>{{ $t('IotSceneLinkage.detail.selectedProduct') }}</small>
      </div>
      <a-radio-group v-model:value="scopeMode" class="device-scope-modal__scope-mode" button-style="solid">
        <a-radio-button v-for="item in availableScopeModes" :key="item.value" :value="item.value"><AIcon :type="item.icon" />{{ item.label }}</a-radio-button>
      </a-radio-group>
      <slot name="toolbar-actions" />
    </header>
    <div class="device-scope-modal__layout">
      <aside class="device-scope-modal__navigation">
        <template v-if="scopeMode === 'fixed'">
          <a-button :type="selectedSpaceId ? 'text' : 'primary'" block @click="selectAllDevices"><AIcon type="AppstoreOutlined" />{{ $t('IotSceneLinkage.editor.allDevices') }}</a-button>
          <a-button :type="selectedSpaceId === UNBOUND_SPACE_KEY ? 'primary' : 'text'" block @click="selectUnboundDevices"><AIcon type="DisconnectOutlined" />{{ $t('IotSceneLinkage.scope.unboundSpace') }}</a-button>
          <div class="device-scope-modal__space-title"><AIcon type="EnvironmentOutlined" />{{ $t('IotSceneLinkage.editor.areas') }}</div>
          <a-tree class="device-scope-modal__tree" block-node :tree-data="spaceTreeData" :selected-keys="selectedSpaceId && selectedSpaceId !== UNBOUND_SPACE_KEY ? [selectedSpaceId] : []" :expanded-keys="expandedKeys" :loading="scopeLoading" @select="selectSpace" @expand="onSpaceExpand"><template #title="node"><span class="device-scope-modal__node">{{ node.title }}</span></template></a-tree>
        </template>
        <template v-else-if="scopeMode === 'space'">
          <div class="device-scope-modal__space-title"><AIcon type="EnvironmentOutlined" />{{ $t('IotSceneLinkage.editor.areas') }}</div>
          <a-tree class="device-scope-modal__tree" block-node checkable :tree-data="spaceTreeData" :checked-keys="selectedScopeValues.map(item => item.value)" :loading="scopeLoading" @check="selectScopedValues($event, spaceTreeData)" />
        </template>
        <template v-else>
          <div class="device-scope-modal__space-title"><AIcon :type="scopeMode === 'device-group' ? 'ClusterOutlined' : 'ApartmentOutlined'" />{{ scopeModeLabel }}</div>
          <a-tree class="device-scope-modal__tree" block-node checkable :tree-data="scopeTreeData" :checked-keys="selectedScopeValues.map(item => item.value)" :loading="scopeLoading" @check="selectScopedValues($event, scopeTreeData)" />
        </template>
      </aside>
      <section class="device-scope-modal__content">
        <div class="device-scope-modal__filters" v-if="scopeMode === 'fixed'">
          <a-input-search v-model:value="keyword" :placeholder="$t('IotSceneLinkage.placeholder.searchDevice')" :loading="deviceLoading" @search="searchDevices" />
          <IotAlarmTargetSelect v-if="!lockProduct" v-model="productFilter" class="device-scope-modal__product-filter" :request="requestProducts" :placeholder="$t('IotSceneLinkage.placeholder.product')" @change="changeProductFilter" />
        </div>
        <div v-if="scopeMode === 'fixed'" class="device-scope-modal__device-list-head">
          <span>{{ $t('IotSceneLinkage.form.device') }}</span><span>{{ $t('IotSceneLinkage.form.product') }}</span><span>{{ $t('IotSceneLinkage.device.status') }}</span>
        </div>
        <a-spin v-if="scopeMode === 'fixed'" :spinning="deviceLoading" class="device-scope-modal__device-loading">
          <div v-if="deviceOptions.length" class="device-scope-modal__device-list">
            <button v-for="device in deviceOptions" :key="device.id" type="button" :class="['device-scope-modal__device-row', { 'is-selected': isDeviceSelected(device.id) }]" @click="selectDevice(device)">
              <span :title="device.name">{{ device.name }}</span><span :title="device.productName">{{ device.productName }}</span><span :class="['device-scope-modal__status', device.online ? 'is-online' : 'is-offline']"><i class="device-scope-modal__status-dot" />{{ device.statusText }}</span>
            </button>
          </div>
          <CloudEmpty v-else-if="!deviceLoading" :description="$t('IotSceneLinkage.scope.empty')" />
        </a-spin>
        <a-pagination v-if="scopeMode === 'fixed' && total > pageSize" class="device-scope-modal__pagination" size="small" :current="pageIndex + 1" :page-size="pageSize" :total="total" show-less-items @change="changePage" />
        <div v-else class="device-scope-modal__scope-description"><AIcon type="InfoCircleOutlined" /><span>{{ scopeModeHint }}</span></div>
      </section>
      <aside class="device-scope-modal__selection">
        <template v-if="hasSelection">
          <div class="device-scope-modal__selected-device"><strong>{{ selectionTitle }}</strong><span>{{ selectionDescription }}</span></div>
          <slot name="configuration" :selected-device="selectedDevice" :selected-devices="selectedDevices" :has-selection="hasSelection" :scope="scopeMode" />
          <div class="device-scope-modal__preview"><slot name="preview" :selected-device="selectedDevice" :selected-devices="selectedDevices" :scope="scopeMode" /></div>
        </template>
        <CloudEmpty v-else :description="selectionHint" />
      </aside>
    </div>
    <div class="device-scope-modal__footer"><a-button @click="$emit('cancel')">{{ $t('IotSceneLinkage.action.cancel') }}</a-button><a-button type="primary" :disabled="!hasSelection" @click="save">{{ $t('IotSceneLinkage.action.confirm') }}</a-button></div>
  </component>
</template>
<script setup lang="ts">
import { computed, reactive, ref, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { queryDevicesPage, queryProducts } from '../../../../api/scene-linkage'
import { queryDeviceGroupDetailList_api, queryProjectSpaceAreaSettings_api } from '../../../../api/scene-resources'
import { getTreeData_api } from '../../../../api/others'
import IotAlarmTargetSelect, { type IotAlarmTargetSelectOption, type IotAlarmTargetSelectQuery } from '../alarm/IotAlarmTargetSelect.vue'
export type DeviceScope = {
  selector: 'fixed' | 'space' | 'device-group' | 'org' | 'all'
  selectorValues: Array<{ value: string; name?: string }>
  options?: { view?: 'space' | 'device-group' | 'org' | 'custom' | 'all'; names?: string[] }
  productId?: string
  productName?: string
}
type DeviceOption = { id: string; name: string; productId: string; productName: string; spaceName?: string; online: boolean; statusText: string }
type SpaceNode = { key: string; title: string; children?: SpaceNode[] }
type ScopeMode = DeviceScope['selector']
const UNBOUND_SPACE_KEY = '__scene-unbound-space__'
const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  width: { type: Number, default: 1180 },
  embedded: { type: Boolean, default: false },
  detailed: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  lockProduct: { type: Boolean, default: false },
  scopeModes: { type: Array as PropType<ScopeMode[]>, default: () => ['fixed', 'all', 'space', 'device-group', 'org'] },
  productId: { type: String, default: '' },
  modelValue: { type: Object as PropType<DeviceScope>, required: true },
  validate: { type: Function as PropType<(device: DeviceOption) => boolean | Promise<boolean>>, default: undefined },
})
const emit = defineEmits<{ (event: 'cancel'): void; (event: 'save', value: DeviceScope): void; (event: 'select-device', value: DeviceOption): void; (event: 'select-devices', value: DeviceOption[]): void }>()
const { t } = useI18n()
const pageSize = 20
const keyword = ref('')
const productFilter = ref<string>()
const pageIndex = ref(0)
const total = ref(0)
const deviceLoading = ref(false)
const scopeLoading = ref(false)
const selectedSpaceId = ref('')
const expandedKeys = ref<string[]>([])
const spaceTreeData = ref<SpaceNode[]>([])
const groupTreeData = ref<SpaceNode[]>([])
const orgTreeData = ref<SpaceNode[]>([])
const spaceDescendants = new Map<string, string[]>()
const allSpaceIds = ref<string[]>([])
const deviceOptions = ref<DeviceOption[]>([])
const selectedDevices = ref<DeviceOption[]>([])
const selectedScopeValues = ref<Array<{ value: string; name?: string }>>([])
const scopeMode = ref<ScopeMode>('fixed')
const draft = reactive({ deviceId: '', deviceName: '', productId: '', productName: '' })
let requestSequence = 0
let searchTimer: ReturnType<typeof setTimeout> | undefined
const modalTitle = computed(() => props.title || t('IotSceneLinkage.title.selectDevices'))
const dialogProps = computed(() => props.embedded ? {} : ({ open: props.open, title: modalTitle.value, width: props.width, footer: null, maskClosable: false, wrapClassName: 'device-scope-modal' }))
const selectedDevice = computed(() => selectedDevices.value[0])
const scopeTreeData = computed(() => scopeMode.value === 'device-group' ? groupTreeData.value : orgTreeData.value)
const availableScopeModes = computed(() => ([
  { value: 'fixed' as const, icon: 'SelectOutlined', label: t('IotSceneLinkage.editor.customDevices') },
  { value: 'all' as const, icon: 'AppstoreOutlined', label: t('IotSceneLinkage.editor.allDevices') },
  { value: 'space' as const, icon: 'EnvironmentOutlined', label: t('IotSceneLinkage.editor.areas') },
  { value: 'device-group' as const, icon: 'ClusterOutlined', label: t('IotSceneLinkage.editor.groups') },
  { value: 'org' as const, icon: 'ApartmentOutlined', label: t('IotSceneLinkage.editor.organizations') },
]).filter(item => props.scopeModes.includes(item.value)))
const scopeModeLabel = computed(() => availableScopeModes.value.find(item => item.value === scopeMode.value)?.label || '')
const hasSelection = computed(() => scopeMode.value === 'all' || (scopeMode.value === 'fixed' ? selectedDevices.value.length > 0 : selectedScopeValues.value.length > 0))
const selectionHint = computed(() => scopeMode.value === 'fixed' ? t('IotSceneLinkage.scope.selectDeviceHint') : t('IotSceneLinkage.scope.selectScopeHint'))
const selectionTitle = computed(() => {
  if (scopeMode.value === 'all') return t('IotSceneLinkage.editor.allDevices')
  if (scopeMode.value === 'fixed') return props.multiple ? t('IotSceneLinkage.scope.selectedDevices', { count: selectedDevices.value.length }) : selectedDevice.value?.name || ''
  return scopeModeLabel.value
})
const selectionDescription = computed(() => {
  if (scopeMode.value === 'all') return draft.productName || t('IotSceneLinkage.scope.allProductDevices')
  if (scopeMode.value === 'fixed') return props.multiple ? selectedDevices.value.map(item => item.name).join('、') : `${selectedDevice.value?.spaceName || t('IotSceneLinkage.scope.unboundSpace')} · ${selectedDevice.value?.productName || ''}`
  return selectedScopeValues.value.map(item => item.name || item.value).join('、')
})
const scopeModeHint = computed(() => {
  if (scopeMode.value === 'all') return t('IotSceneLinkage.scope.allProductDevices')
  if (scopeMode.value === 'space') return t('IotSceneLinkage.scope.areaGroupHint')
  if (scopeMode.value === 'device-group') return t('IotSceneLinkage.scope.deviceGroupHint')
  return t('IotSceneLinkage.scope.organizationHint')
})

watch(() => props.open, async open => {
  if (!open) { clearSearchTimer(); return }
  keyword.value = ''; pageIndex.value = 0; selectedSpaceId.value = ''
  productFilter.value = props.modelValue.productId || props.productId || undefined
  scopeMode.value = props.detailed && props.modelValue.selector !== 'fixed' ? props.modelValue.selector : 'fixed'
  if (!props.scopeModes.includes(scopeMode.value)) scopeMode.value = 'fixed'
  Object.assign(draft, { deviceId: props.modelValue.selector === 'fixed' ? String(props.modelValue.selectorValues[0]?.value || '') : '', deviceName: props.modelValue.selectorValues[0]?.name || '', productId: props.modelValue.productId || props.productId || '', productName: props.modelValue.productName || '' })
  selectedDevices.value = props.modelValue.selector === 'fixed' ? props.modelValue.selectorValues.map(item => ({ id: String(item.value), name: item.name || String(item.value), productId: draft.productId, productName: draft.productName, online: false, statusText: '' })) : []
  selectedScopeValues.value = props.modelValue.selector === 'fixed' ? [] : [...props.modelValue.selectorValues]
  await Promise.all([loadSpaceTree(), loadScopeTrees()])
  if (scopeMode.value === 'fixed') await loadDevices()
}, { immediate: true })
watch(scopeMode, mode => {
  if (!props.open) return
  selectedSpaceId.value = ''
  if (mode === 'fixed') void searchDevices()
})
watch(keyword, () => {
  if (!props.open) return
  clearSearchTimer()
  searchTimer = setTimeout(() => { searchTimer = undefined; void searchDevices() }, 300)
})
/** 搜索条件变化时以序号隔离旧响应，避免快速切换空间后列表回跳。 */
async function loadDevices() {
  const sequence = ++requestSequence
  deviceLoading.value = true
  try {
    const terms: any[] = []
    if (productFilter.value) terms.push({ column: 'productId', termType: 'eq', value: productFilter.value })
    const spaceIds = selectedSpaceId.value && selectedSpaceId.value !== UNBOUND_SPACE_KEY ? spaceDescendants.get(selectedSpaceId.value) || [selectedSpaceId.value] : []
    if (selectedSpaceId.value === UNBOUND_SPACE_KEY && allSpaceIds.value.length) terms.push({ column: 'id', termType: 'space-bind$not$device', value: allSpaceIds.value })
    else if (spaceIds.length) terms.push({ column: 'id', termType: 'space-bind$device', value: spaceIds })
    const searchText = keyword.value.trim()
    if (searchText) terms.push({ terms: [{ column: 'name', termType: 'like', value: `%${searchText}%` }, { column: 'id', termType: 'like', value: `%${searchText}%`, type: 'or' }] })
    const response: any = await queryDevicesPage({ pageIndex: pageIndex.value, pageSize, sorts: [{ name: 'createTime', order: 'desc' }], terms })
    if (sequence !== requestSequence) return
    const result = response?.result ?? response
    const rows = result?.data || result?.records || []
    total.value = Number(result?.total ?? result?.totalElements ?? rows.length)
    deviceOptions.value = rows.map(toDeviceOption)
    selectedDevices.value = selectedDevices.value.map(selected => deviceOptions.value.find(item => item.id === selected.id) || selected)
  } finally { if (sequence === requestSequence) deviceLoading.value = false }
}
function toDeviceOption(device: any): DeviceOption {
  const status = device.state?.text || device.state?.value || device.state || device.status?.text || device.status || ''
  const online = ['online', 'enabled', '正常', '在线'].includes(String(status).toLowerCase()) || device.online === true
  return { id: String(device.id), name: device.name || device.id, productId: String(device.productId || device.product?.id || ''), productName: device.productName || device.product?.name || device.productId || '-', spaceName: device.area || device.spaceName || device.others?.spaceName, online, statusText: status || (online ? t('IotSceneLinkage.deviceState.online') : t('IotSceneLinkage.deviceState.offline')) }
}
function isDeviceSelected(id: string) { return selectedDevices.value.some(item => item.id === id) }

/** 详细模式仅在固定设备范围允许多选；动态范围保留 selector + selectorValues，不能展开为设备 ID。 */
function selectDevice(device: DeviceOption) {
  const selected = selectedDevices.value.findIndex(item => item.id === device.id)
  if (props.multiple) {
    selectedDevices.value = selected >= 0
      ? selectedDevices.value.filter(item => item.id !== device.id)
      : [...selectedDevices.value, device]
  } else {
    selectedDevices.value = [device]
  }
  Object.assign(draft, { deviceId: selectedDevices.value[0]?.id || '', deviceName: selectedDevices.value[0]?.name || '', productId: device.productId, productName: device.productName })
  emit('select-device', device)
  emit('select-devices', selectedDevices.value)
}
async function loadSpaceTree() {
  scopeLoading.value = true
  try {
    const response: any = await queryProjectSpaceAreaSettings_api('')
    const areas = response?.areas || response?.result?.areas || []
    const nodes = new Map<string, SpaceNode>(); const parentIds = new Map<string, string>()
    areas.forEach((area: any) => { const id = String(area.id); nodes.set(id, { key: id, title: area.name || id, children: [] }); parentIds.set(id, String(area.parentId || '')) })
    const roots: SpaceNode[] = []
    nodes.forEach((node, id) => { const parent = nodes.get(parentIds.get(id) || ''); if (parent) (parent.children ||= []).push(node); else roots.push(node) })
    allSpaceIds.value = [...nodes.keys()]; spaceDescendants.clear()
    const collect = (node: SpaceNode): string[] => { const ids = [node.key, ...(node.children || []).flatMap(collect)]; spaceDescendants.set(node.key, ids); return ids }
    roots.forEach(collect); spaceTreeData.value = roots; expandedKeys.value = roots.map(item => item.key)
  } finally { scopeLoading.value = false }
}
async function loadScopeTrees() {
  if (!props.detailed) return
  scopeLoading.value = true
  try {
    const [groups, orgResponse] = await Promise.all([
      queryDeviceGroupDetailList_api(),
      getTreeData_api({ paging: false }),
    ])
    groupTreeData.value = toTreeNodes(groups)
    orgTreeData.value = toTreeNodes(orgResponse?.result || orgResponse || [])
  } finally {
    scopeLoading.value = false
  }
}

function toTreeNodes(items: Array<Record<string, any>>): SpaceNode[] {
  const nodes = new Map<string, SpaceNode>()
  const parentIds = new Map<string, string>()
  const collect = (records: Array<Record<string, any>>, parentId = '') => records.forEach(item => {
    const id = String(item.id || item.value || '')
    if (!id) return
    nodes.set(id, { key: id, title: String(item.name || item.title || item.text || id), children: [] })
    parentIds.set(id, String(item.parentId || parentId || ''))
    if (Array.isArray(item.children)) collect(item.children, id)
  })
  collect(items)
  const roots: SpaceNode[] = []
  nodes.forEach((node, id) => {
    const parent = nodes.get(parentIds.get(id) || '')
    if (parent) (parent.children ||= []).push(node)
    else roots.push(node)
  })
  return roots
}
function selectAllDevices() { selectedSpaceId.value = ''; void searchDevices() }
function selectUnboundDevices() { selectedSpaceId.value = UNBOUND_SPACE_KEY; void searchDevices() }
function selectSpace(keys: Array<string | number>) { selectedSpaceId.value = String(keys[0] || ''); void searchDevices() }
function onSpaceExpand(keys: Array<string | number>) { expandedKeys.value = keys.map(String) }
function changeProductFilter(_value?: string, option?: IotAlarmTargetSelectOption) { productFilter.value = option?.value; void searchDevices() }
function searchDevices() { clearSearchTimer(); pageIndex.value = 0; return loadDevices() }
function changePage(page: number) { pageIndex.value = page - 1; return loadDevices() }
function clearSearchTimer() { if (searchTimer) clearTimeout(searchTimer); searchTimer = undefined }

function selectScopedValues(keys: any, nodes: SpaceNode[]) {
  const values = Array.isArray(keys) ? keys : keys.checked || []
  const names = new Map<string, string>()
  const collect = (items: SpaceNode[]) => items.forEach(item => { names.set(item.key, item.title); if (item.children) collect(item.children) })
  collect(nodes)
  selectedScopeValues.value = values.map((value: string | number) => ({ value: String(value), name: names.get(String(value)) || String(value) }))
}
async function requestProducts(query: IotAlarmTargetSelectQuery) {
  const value = query.keyword.trim(); const terms = value ? [{ column: 'name', termType: 'like', value: `%${value}%`, type: 'or' }, { column: 'id', termType: 'like', value: `%${value}%`, type: 'or' }] : []
  const response: any = await queryProducts({ pageIndex: query.pageIndex, pageSize: query.pageSize, sorts: [{ name: 'createTime', order: 'desc' }], terms })
  const result = response?.result ?? response; const data = result?.data || result?.records || []
  return { data: data.map((item: any) => ({ label: item.name || item.id, value: String(item.id), data: item })), total: Number(result?.total ?? result?.totalElements ?? data.length) }
}
/** The shell owns resource selection only; the right-side business editor validates its own fields before commit. */
async function save() {
  if (!hasSelection.value) return
  if (props.validate && !(await props.validate(selectedDevice.value as DeviceOption))) return
  const selector = scopeMode.value
  const values = selector === 'fixed'
    ? selectedDevices.value.map(item => ({ value: item.id, name: item.name }))
    : selector === 'all'
      ? []
      : selectedScopeValues.value
  emit('save', {
    selector,
    selectorValues: values,
    options: { view: selector === 'fixed' ? 'space' : selector, names: values.map(item => item.name || item.value) },
    productId: draft.productId || productFilter.value,
    productName: draft.productName,
  })
}
</script>

<style scoped>
.device-scope-modal__toolbar { display: flex; gap: var(--space-3, 12px); align-items: center; min-height: 52px; padding: var(--space-3, 12px) var(--space-4, 16px); margin-bottom: var(--space-3, 12px); background: var(--ant-color-fill-quaternary); border: 1px solid var(--ant-color-border-secondary); border-radius: var(--radius-jet-sm, 8px); }.device-scope-modal__product-summary { display: grid; flex: 1; gap: 2px; min-width: 0; }.device-scope-modal__product-summary strong, .device-scope-modal__product-summary small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.device-scope-modal__product-summary small { color: var(--ant-color-text-tertiary); font-size: 12px; }.device-scope-modal__layout { display: grid; grid-template-columns: 13rem minmax(25rem, 1fr) 23rem; min-height: 34rem; border: 1px solid var(--ant-color-border-secondary); border-radius: var(--radius-jet-sm, 8px); }
.device-scope-modal__navigation, .device-scope-modal__selection { display: flex; flex-direction: column; gap: var(--space-2, 8px); padding: var(--space-3, 12px); background: var(--ant-color-fill-quaternary); }.device-scope-modal__navigation { border-right: 1px solid var(--ant-color-border-secondary); }.device-scope-modal__selection { border-left: 1px solid var(--ant-color-border-secondary); }
.device-scope-modal__embedded { display: block; }.device-scope-modal__embedded .device-scope-modal__layout { min-height: 31rem; }.device-scope-modal__scope-mode { display: flex; flex-wrap: wrap; gap: 4px; }.device-scope-modal__scope-mode :deep(.ant-radio-button-wrapper) { display: inline-flex; gap: 4px; align-items: center; justify-content: center; height: 30px; padding: 0 8px; font-size: 12px; border-radius: 4px; }.device-scope-modal__scope-mode :deep(.ant-radio-button-wrapper)::before { display: none; }
.device-scope-modal__navigation :deep(.ant-btn) { display: flex; gap: var(--space-2, 8px); align-items: center; justify-content: flex-start; }.device-scope-modal__space-title { display: flex; gap: var(--space-2, 8px); align-items: center; padding: 8px; color: var(--ant-color-text-secondary); font-size: 12px; font-weight: 600; }.device-scope-modal__tree { flex: 1; min-height: 0; overflow: auto; }.device-scope-modal__node { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.device-scope-modal__content { display: flex; flex-direction: column; min-width: 0; padding: var(--space-4, 16px); }.device-scope-modal__filters { display: grid; grid-template-columns: minmax(0, 1fr) 13rem; gap: var(--space-3, 12px); margin-bottom: 12px; }.device-scope-modal__device-list-head, .device-scope-modal__device-row { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) 5rem; gap: 12px; align-items: center; }.device-scope-modal__device-list-head { padding: 0 12px 8px; color: var(--ant-color-text-secondary); font-size: 12px; }.device-scope-modal__device-loading { min-height: 0; flex: 1; }.device-scope-modal__device-list { overflow: auto; border: 1px solid var(--ant-color-border-secondary); border-radius: 6px; }.device-scope-modal__device-row { width: 100%; min-height: 50px; padding: 0 12px; color: var(--ant-color-text); text-align: left; background: var(--ant-color-bg-container); border: 0; border-bottom: 1px solid var(--ant-color-border-secondary); cursor: pointer; }.device-scope-modal__device-row:last-child { border-bottom: 0; }.device-scope-modal__device-row:hover, .device-scope-modal__device-row.is-selected { background: var(--ant-color-primary-bg); }.device-scope-modal__device-row.is-selected { box-shadow: inset 0 0 0 1px var(--ant-color-primary); }.device-scope-modal__device-row > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.device-scope-modal__status { display: inline-flex; align-items: center; font-size: .75rem; }.device-scope-modal__status-dot { width: 6px; height: 6px; margin-right: 6px; border-radius: 50%; background: currentColor; }.device-scope-modal__status.is-online { color: var(--ant-color-success); }.device-scope-modal__status.is-offline { color: var(--ant-color-text-tertiary); }.device-scope-modal__pagination { display: flex; justify-content: flex-end; margin-top: 12px; }.device-scope-modal__scope-description { display: grid; place-content: center; gap: 8px; flex: 1; min-height: 0; padding: 24px; color: var(--ant-color-text-secondary); text-align: center; font-size: 13px; }.device-scope-modal__scope-description :deep(.anticon) { justify-self: center; color: var(--ant-color-primary); font-size: 20px; }.device-scope-modal__selected-device { display: grid; gap: 4px; padding-bottom: 12px; border-bottom: 1px solid var(--ant-color-border-secondary); }.device-scope-modal__selected-device span { color: var(--ant-color-text-secondary); font-size: 12px; }.device-scope-modal__preview { margin-top: auto; padding-top: 12px; color: var(--ant-color-text-secondary); border-top: 1px solid var(--ant-color-border-secondary); font-size: 12px; line-height: 20px; }.device-scope-modal__footer { display: flex; justify-content: flex-end; gap: 8px; padding-top: 16px; }
@media (max-width: 900px) { .device-scope-modal__toolbar { align-items: flex-start; flex-wrap: wrap; }.device-scope-modal__scope-mode { order: 3; width: 100%; }.device-scope-modal__layout { grid-template-columns: 11rem minmax(0, 1fr); }.device-scope-modal__selection { grid-column: 1 / -1; min-height: 12rem; border-top: 1px solid var(--ant-color-border-secondary); border-left: 0; }.device-scope-modal__filters { grid-template-columns: 1fr; } }
</style>
