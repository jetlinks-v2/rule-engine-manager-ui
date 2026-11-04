<template>
  <a-modal :open="open" :title="modalTitle" :width="width" :footer="null" :mask-closable="false" wrap-class-name="device-scope-modal" @cancel="$emit('cancel')">
    <div class="device-scope-modal__layout">
      <aside class="device-scope-modal__navigation">
        <a-button :type="selectedSpaceId ? 'text' : 'primary'" block @click="selectAllDevices"><AIcon type="AppstoreOutlined" />{{ $t('IotSceneLinkage.editor.allDevices') }}</a-button>
        <a-button :type="selectedSpaceId === UNBOUND_SPACE_KEY ? 'primary' : 'text'" block @click="selectUnboundDevices"><AIcon type="DisconnectOutlined" />{{ $t('IotSceneLinkage.scope.unboundSpace') }}</a-button>
        <div class="device-scope-modal__space-title"><AIcon type="EnvironmentOutlined" />{{ $t('IotSceneLinkage.editor.areas') }}</div>
        <a-tree class="device-scope-modal__tree" block-node :tree-data="spaceTreeData" :selected-keys="selectedSpaceId && selectedSpaceId !== UNBOUND_SPACE_KEY ? [selectedSpaceId] : []" :expanded-keys="expandedKeys" :loading="scopeLoading" @select="selectSpace" @expand="onSpaceExpand">
          <template #title="node"><span class="device-scope-modal__node">{{ node.title }}</span></template>
        </a-tree>
      </aside>

      <section class="device-scope-modal__content">
        <div class="device-scope-modal__filters">
          <a-input-search v-model:value="keyword" :placeholder="$t('IotSceneLinkage.placeholder.searchDevice')" :loading="deviceLoading" @search="searchDevices" />
          <IotAlarmTargetSelect v-model="productFilter" class="device-scope-modal__product-filter" :request="requestProducts" :placeholder="$t('IotSceneLinkage.placeholder.product')" @change="changeProductFilter" />
        </div>
        <div class="device-scope-modal__device-list-head">
          <span>{{ $t('IotSceneLinkage.form.device') }}</span><span>{{ $t('IotSceneLinkage.form.product') }}</span><span>{{ $t('IotSceneLinkage.device.status') }}</span>
        </div>
        <a-spin :spinning="deviceLoading" class="device-scope-modal__device-loading">
          <div v-if="deviceOptions.length" class="device-scope-modal__device-list">
            <button v-for="device in deviceOptions" :key="device.id" type="button" :class="['device-scope-modal__device-row', { 'is-selected': draft.deviceId === device.id }]" @click="selectDevice(device)">
              <span :title="device.name">{{ device.name }}</span><span :title="device.productName">{{ device.productName }}</span><span :class="['device-scope-modal__status', device.online ? 'is-online' : 'is-offline']"><i class="device-scope-modal__status-dot" />{{ device.statusText }}</span>
            </button>
          </div>
          <CloudEmpty v-else-if="!deviceLoading" :description="$t('IotSceneLinkage.scope.empty')" />
        </a-spin>
        <a-pagination v-if="total > pageSize" class="device-scope-modal__pagination" size="small" :current="pageIndex + 1" :page-size="pageSize" :total="total" show-less-items @change="changePage" />
      </section>

      <aside class="device-scope-modal__selection">
        <template v-if="selectedDevice">
          <div class="device-scope-modal__selected-device"><strong>{{ selectedDevice.name }}</strong><span>{{ selectedDevice.spaceName || $t('IotSceneLinkage.scope.unboundSpace') }} · {{ selectedDevice.productName }}</span></div>
          <slot name="configuration" :selected-device="selectedDevice" :has-selection="true" />
          <div class="device-scope-modal__preview"><slot name="preview" :selected-device="selectedDevice" /></div>
        </template>
        <CloudEmpty v-else :description="$t('IotSceneLinkage.scope.selectDeviceHint')" />
      </aside>
    </div>
    <div class="device-scope-modal__footer"><a-button @click="$emit('cancel')">{{ $t('IotSceneLinkage.action.cancel') }}</a-button><a-button type="primary" :disabled="!selectedDevice" @click="save">{{ $t('IotSceneLinkage.action.confirm') }}</a-button></div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { queryDevicesPage, queryProducts } from '../../../../api/scene-linkage'
import { queryProjectSpaceAreaSettings_api } from '../../../../api/scene-resources'
import IotAlarmTargetSelect, { type IotAlarmTargetSelectOption, type IotAlarmTargetSelectQuery } from '../alarm/IotAlarmTargetSelect.vue'

export type DeviceScope = {
  selector: 'fixed' | 'space' | 'device-group' | 'all'
  selectorValues: Array<{ value: string; name?: string }>
  options?: { view?: 'space' | 'device-group' | 'custom' | 'all'; names?: string[] }
  productId?: string
  productName?: string
}

type DeviceOption = { id: string; name: string; productId: string; productName: string; spaceName?: string; online: boolean; statusText: string }
type SpaceNode = { key: string; title: string; children?: SpaceNode[] }
const UNBOUND_SPACE_KEY = '__scene-unbound-space__'
const props = defineProps({ open: { type: Boolean, default: false }, title: { type: String, default: '' }, width: { type: Number, default: 1180 }, productId: { type: String, default: '' }, modelValue: { type: Object as PropType<DeviceScope>, required: true } })
const emit = defineEmits<{ (event: 'cancel'): void; (event: 'save', value: DeviceScope): void; (event: 'select-device', value: DeviceOption): void }>()
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
const spaceDescendants = new Map<string, string[]>()
const allSpaceIds = ref<string[]>([])
const deviceOptions = ref<DeviceOption[]>([])
const selectedDevice = ref<DeviceOption>()
const draft = reactive({ deviceId: '', deviceName: '', productId: '', productName: '' })
let requestSequence = 0
let searchTimer: ReturnType<typeof setTimeout> | undefined
const modalTitle = computed(() => props.title || t('IotSceneLinkage.title.selectDevices'))

watch(() => props.open, async open => {
  if (!open) { clearSearchTimer(); return }
  keyword.value = ''; pageIndex.value = 0; selectedSpaceId.value = ''
  productFilter.value = props.modelValue.productId || props.productId || undefined
  Object.assign(draft, { deviceId: props.modelValue.selector === 'fixed' ? String(props.modelValue.selectorValues[0]?.value || '') : '', deviceName: props.modelValue.selectorValues[0]?.name || '', productId: props.modelValue.productId || props.productId || '', productName: props.modelValue.productName || '' })
  selectedDevice.value = undefined
  await loadSpaceTree()
  await loadDevices()
}, { immediate: true })

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
    const selected = deviceOptions.value.find(item => item.id === draft.deviceId)
    if (selected) selectedDevice.value = selected
  } finally { if (sequence === requestSequence) deviceLoading.value = false }
}

function toDeviceOption(device: any): DeviceOption {
  const status = device.state?.text || device.state?.value || device.state || device.status?.text || device.status || ''
  const online = ['online', 'enabled', '正常', '在线'].includes(String(status).toLowerCase()) || device.online === true
  return { id: String(device.id), name: device.name || device.id, productId: String(device.productId || device.product?.id || ''), productName: device.productName || device.product?.name || device.productId || '-', spaceName: device.area || device.spaceName || device.others?.spaceName, online, statusText: status || (online ? t('IotSceneLinkage.deviceState.online') : t('IotSceneLinkage.deviceState.offline')) }
}
function selectDevice(device: DeviceOption) { selectedDevice.value = device; Object.assign(draft, { deviceId: device.id, deviceName: device.name, productId: device.productId, productName: device.productName }); emit('select-device', device) }

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

function selectAllDevices() { selectedSpaceId.value = ''; void searchDevices() }
function selectUnboundDevices() { selectedSpaceId.value = UNBOUND_SPACE_KEY; void searchDevices() }
function selectSpace(keys: Array<string | number>) { selectedSpaceId.value = String(keys[0] || ''); void searchDevices() }
function onSpaceExpand(keys: Array<string | number>) { expandedKeys.value = keys.map(String) }
function changeProductFilter(_value?: string, option?: IotAlarmTargetSelectOption) { productFilter.value = option?.value; void searchDevices() }
function searchDevices() { clearSearchTimer(); pageIndex.value = 0; return loadDevices() }
function changePage(page: number) { pageIndex.value = page - 1; return loadDevices() }
function clearSearchTimer() { if (searchTimer) clearTimeout(searchTimer); searchTimer = undefined }

async function requestProducts(query: IotAlarmTargetSelectQuery) {
  const value = query.keyword.trim(); const terms = value ? [{ column: 'name', termType: 'like', value: `%${value}%`, type: 'or' }, { column: 'id', termType: 'like', value: `%${value}%`, type: 'or' }] : []
  const response: any = await queryProducts({ pageIndex: query.pageIndex, pageSize: query.pageSize, sorts: [{ name: 'createTime', order: 'desc' }], terms })
  const result = response?.result ?? response; const data = result?.data || result?.records || []
  return { data: data.map((item: any) => ({ label: item.name || item.id, value: String(item.id), data: item })), total: Number(result?.total ?? result?.totalElements ?? data.length) }
}
function save() {
  if (!selectedDevice.value) return
  emit('save', { selector: 'fixed', selectorValues: [{ value: selectedDevice.value.id, name: selectedDevice.value.name }], options: { view: 'space', names: [selectedDevice.value.name] }, productId: selectedDevice.value.productId, productName: selectedDevice.value.productName })
}
</script>

<style scoped>
.device-scope-modal__layout { display: grid; grid-template-columns: 13rem minmax(25rem, 1fr) 18rem; min-height: 34rem; border: 1px solid var(--ant-color-border-secondary); border-radius: var(--radius-jet-sm, 8px); }
.device-scope-modal__navigation, .device-scope-modal__selection { display: flex; flex-direction: column; gap: var(--space-2, 8px); padding: var(--space-3, 12px); background: var(--ant-color-fill-quaternary); }.device-scope-modal__navigation { border-right: 1px solid var(--ant-color-border-secondary); }.device-scope-modal__selection { border-left: 1px solid var(--ant-color-border-secondary); }
.device-scope-modal__navigation :deep(.ant-btn) { display: flex; gap: var(--space-2, 8px); align-items: center; justify-content: flex-start; }.device-scope-modal__space-title { display: flex; gap: var(--space-2, 8px); align-items: center; padding: 8px; color: var(--ant-color-text-secondary); font-size: 12px; font-weight: 600; }.device-scope-modal__tree { flex: 1; min-height: 0; overflow: auto; }.device-scope-modal__node { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.device-scope-modal__content { display: flex; flex-direction: column; min-width: 0; padding: var(--space-4, 16px); }.device-scope-modal__filters { display: grid; grid-template-columns: minmax(0, 1fr) 13rem; gap: var(--space-3, 12px); margin-bottom: 12px; }.device-scope-modal__device-list-head, .device-scope-modal__device-row { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) 5rem; gap: 12px; align-items: center; }.device-scope-modal__device-list-head { padding: 0 12px 8px; color: var(--ant-color-text-secondary); font-size: 12px; }.device-scope-modal__device-loading { min-height: 0; flex: 1; }.device-scope-modal__device-list { overflow: auto; border: 1px solid var(--ant-color-border-secondary); border-radius: 6px; }.device-scope-modal__device-row { width: 100%; min-height: 50px; padding: 0 12px; color: var(--ant-color-text); text-align: left; background: var(--ant-color-bg-container); border: 0; border-bottom: 1px solid var(--ant-color-border-secondary); cursor: pointer; }.device-scope-modal__device-row:last-child { border-bottom: 0; }.device-scope-modal__device-row:hover, .device-scope-modal__device-row.is-selected { background: var(--ant-color-primary-bg); }.device-scope-modal__device-row.is-selected { box-shadow: inset 0 0 0 1px var(--ant-color-primary); }.device-scope-modal__device-row > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.device-scope-modal__status { display: inline-flex; align-items: center; font-size: .75rem; }.device-scope-modal__status-dot { width: 6px; height: 6px; margin-right: 6px; border-radius: 50%; background: currentColor; }.device-scope-modal__status.is-online { color: var(--ant-color-success); }.device-scope-modal__status.is-offline { color: var(--ant-color-text-tertiary); }.device-scope-modal__pagination { display: flex; justify-content: flex-end; margin-top: 12px; }.device-scope-modal__selected-device { display: grid; gap: 4px; padding-bottom: 12px; border-bottom: 1px solid var(--ant-color-border-secondary); }.device-scope-modal__selected-device span { color: var(--ant-color-text-secondary); font-size: 12px; }.device-scope-modal__preview { margin-top: auto; padding-top: 12px; color: var(--ant-color-text-secondary); border-top: 1px solid var(--ant-color-border-secondary); font-size: 12px; line-height: 20px; }.device-scope-modal__footer { display: flex; justify-content: flex-end; gap: 8px; padding-top: 16px; }
@media (max-width: 900px) { .device-scope-modal__layout { grid-template-columns: 11rem minmax(0, 1fr); }.device-scope-modal__selection { grid-column: 1 / -1; min-height: 12rem; border-top: 1px solid var(--ant-color-border-secondary); border-left: 0; }.device-scope-modal__filters { grid-template-columns: 1fr; } }
</style>
