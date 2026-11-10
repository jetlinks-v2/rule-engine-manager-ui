import { computed, reactive, ref, watch, onScopeDispose } from 'vue'
import { useI18n } from 'vue-i18n'
import { queryDevicesPage, queryProducts } from '../../../../api/scene-linkage'
import { queryDeviceGroupDetailList_api, queryProjectSpaceAreaSettings_api } from '../../../../api/scene-resources'
import { getTreeData_api } from '../../../../api/others'
import type { IotAlarmTargetSelectOption, IotAlarmTargetSelectQuery } from '../alarm/IotAlarmTargetSelect.vue'
import { batchDeviceNodeSummary_api } from '@device-manager-ui/api/deviceGroup'
import { ALL_DEVICES_COUNT_KEY, buildScopeCountRequests, type SpaceNode, type DeviceScope, type DeviceOption, type ScopeMode, type DeviceScopeModalProps, type DeviceScopeEvents, UNBOUND_SPACE_KEY } from '../deviceScopeTree'

/** 设备范围弹窗的选择草稿、查询和统计；展示树不承担请求。 */
export function useDeviceScopeModal(props: DeviceScopeModalProps, emit: DeviceScopeEvents) {
  const { t } = useI18n()
  const pageSize = 20
  const keyword = ref('')
  const productFilter = ref<string>()
  const pageIndex = ref(0)
  const total = ref(0)
  const deviceLoading = ref(false)
  const scopeLoading = ref(false)
  const treeError = ref(false)
  const selectedSpaceId = ref('')
  const spaceTreeData = ref<SpaceNode[]>([])
  const groupTreeData = ref<SpaceNode[]>([])
  const orgTreeData = ref<SpaceNode[]>([])
  const spaceDescendants = new Map<string, string[]>()
  const deviceOptions = ref<DeviceOption[]>([])
  const selectedDevices = ref<DeviceOption[]>([])
  const selectedScopeValues = ref<DeviceScope['selectorValues']>([])
  const scopeMode = ref<ScopeMode>('fixed')
  const scopeError = ref(false)
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
    { value: 'tag' as const, icon: 'TagsOutlined', label: t('device.util.9667827-4') },
    { value: 'context' as const, icon: 'BranchesOutlined', label: t('device.util.9667827-6') },
    { value: 'relation' as const, icon: 'LinkOutlined', label: t('device.util.9667827-2') },
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
    if (scopeMode.value === 'tag') return t('device.util.9667827-5')
    if (scopeMode.value === 'all') return t('IotSceneLinkage.scope.allProductDevices')
    if (scopeMode.value === 'space') return t('IotSceneLinkage.scope.areaGroupHint')
    if (scopeMode.value === 'device-group') return t('IotSceneLinkage.scope.deviceGroupHint')
    return t('IotSceneLinkage.scope.organizationHint')
  })

  watch(() => props.open, async open => {
    if (!open) { clearSearchTimer(); return }
    keyword.value = ''; pageIndex.value = 0; selectedSpaceId.value = ''; scopeError.value = false
    productFilter.value = props.modelValue.productId || props.productId || undefined
    scopeMode.value = props.detailed && props.modelValue.selector !== 'fixed' ? props.modelValue.selector : 'fixed'
    if (!props.scopeModes.includes(scopeMode.value)) scopeMode.value = 'fixed'
    Object.assign(draft, { deviceId: props.modelValue.selector === 'fixed' ? String(props.modelValue.selectorValues[0]?.value || '') : '', deviceName: props.modelValue.selectorValues[0]?.name || '', productId: props.modelValue.productId || props.productId || '', productName: props.modelValue.productName || '' })
    selectedDevices.value = props.modelValue.selector === 'fixed' ? props.modelValue.selectorValues.map(item => ({ id: String(item.value), name: item.name || String(item.value), productId: draft.productId, productName: draft.productName, online: false, statusText: '', status: 'default' })) : []
    // 变量范围的运行配置只保存 upperKey；编辑时临时映射为资源壳的单选草稿。
    selectedScopeValues.value = props.modelValue.selector === 'context'
      ? props.modelValue.upperKey ? [{ value: props.modelValue.upperKey, name: props.modelValue.options?.names?.[0] }] : []
      : props.modelValue.selector === 'fixed' ? [] : [...props.modelValue.selectorValues]
    await reloadTrees()
    if (scopeMode.value === 'fixed') await loadDevices()
  }, { immediate: true })
  watch(scopeMode, mode => {
    if (!props.open) return
    selectedSpaceId.value = ''
    selectedScopeValues.value = []
    scopeError.value = false
    if (mode === 'fixed') void searchDevices()
  }, { flush: 'sync' })
  watch(selectedScopeValues, values => {
    if (values.length) scopeError.value = false
  }, { deep: true })
  watch([
    () => props.modelValue.productId,
    () => props.modelValue.productName,
    () => props.productId,
  ], ([modelProductId, modelProductName, productId]) => {
    if (!props.open) return
    productFilter.value = modelProductId || productId || productFilter.value
    draft.productId = modelProductId || productId || draft.productId
    if (modelProductName) draft.productName = modelProductName
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
      if (selectedSpaceId.value === UNBOUND_SPACE_KEY) terms.push({ column: 'id', termType: 'space-bind$any$not', value: '__any_space_binding__' })
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
    const normalizedStatus = String(status).toLowerCase()
    const statusTone = online ? 'success' : ['offline', '离线'].includes(normalizedStatus) ? 'error' : 'default'
    return { id: String(device.id), name: device.name || device.id, productId: String(device.productId || device.product?.id || ''), productName: device.productName || device.product?.name || device.productId || '-', spaceName: device.area || device.spaceName || device.others?.spaceName, online, statusText: status || (online ? t('IotSceneLinkage.deviceState.online') : t('IotSceneLinkage.deviceState.offline')), status: statusTone }
  }
  const deviceColumns = computed(() => [
    { title: t('IotSceneLinkage.form.device'), dataIndex: 'name', key: 'name', ellipsis: true },
    { title: t('IotSceneLinkage.form.product'), dataIndex: 'productName', key: 'productName', ellipsis: true },
    { title: t('IotSceneLinkage.device.status'), key: 'status', width: 90 },
  ])
  // 与设备列表使用同一套 Table 勾选列；跨页选择以已有草稿和当前页记录共同解析。
  const deviceRowSelection = computed(() => ({
    type: props.multiple ? 'checkbox' as const : 'radio' as const,
    selectedRowKeys: selectedDevices.value.map(item => item.id),
    preserveSelectedRowKeys: true,
    columnWidth: 40,
    onChange: (keys: Array<string | number>) => updateDeviceSelection(keys.map(String)),
  }))

  /** 行点击与勾选共用同一入口，点击勾选列时交给 Table，避免一次点击切换两次。 */
  function deviceRow(device: DeviceOption) {
    return { onClick: (event: MouseEvent) => {
      if ((event.target as Element).closest('.ant-table-selection-column')) return
      const keys = selectedDevices.value.map(item => item.id)
      const toggledKeys = keys.includes(device.id) ? keys.filter(id => id !== device.id) : [...keys, device.id]
      updateDeviceSelection(props.multiple ? toggledKeys : [device.id])
    } }
  }

  /** 只更新选择草稿及原有选择事件，确定后仍按原生 selectorValues 保存。 */
  function updateDeviceSelection(keys: string[]) {
    const records = new Map([...selectedDevices.value, ...deviceOptions.value].map(item => [item.id, item]))
    selectedDevices.value = keys.map(key => records.get(key)).filter((item): item is DeviceOption => Boolean(item))
    const first = selectedDevices.value[0]
    Object.assign(draft, { deviceId: first?.id || '', deviceName: first?.name || '', productId: first?.productId || draft.productId, productName: first?.productName || draft.productName })
    if (first) emit('select-device', first)
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
      spaceDescendants.clear()
      const collect = (node: SpaceNode): string[] => { const ids = [node.key, ...(node.children || []).flatMap(collect)]; spaceDescendants.set(node.key, ids); return ids }
      roots.forEach(collect); spaceTreeData.value = roots
    } finally { scopeLoading.value = false }
  }
  async function reloadTrees() {
    treeError.value = false
    const results = await Promise.allSettled([loadSpaceTree(), loadScopeTrees()])
    treeError.value = results.some(result => result.status === 'rejected')
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
  function selectSpace(keys: Array<string | number>) { selectedSpaceId.value = String(keys[0] || ''); void searchDevices() }
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
    if (!hasSelection.value || props.disabledScopeModes?.includes(scopeMode.value)) {
      scopeError.value = true
      return
    }
    scopeError.value = false
    const selector = scopeMode.value
    const values = selector === 'fixed'
      ? selectedDevices.value.map(item => ({ value: item.id, name: item.name }))
      : selector === 'all'
        ? []
        : selectedScopeValues.value
    if (props.validate && !(await props.validate(selectedDevice.value as DeviceOption, { selector, selectorValues: values }))) return
    emit('save', {
      selector,
      selectorValues: values,
      options: { view: selector === 'fixed' ? 'space' : selector, names: values.map(item => item.name || item.value) },
      productId: draft.productId || productFilter.value,
      productName: draft.productName,
    })
  }
  const scopeCounts = ref<Record<string, number>>({})
  const countsLoading = ref(false)
  const countsError = ref(false)
  let countSequence = 0
  const navigationNodes = computed<SpaceNode[]>(() => scopeMode.value === 'all' ? [{ key: '', title: t('IotSceneLinkage.editor.allDevices') }] : scopeMode.value === 'fixed' ? [
    { key: '', title: t('IotSceneLinkage.editor.allDevices'), icon: 'AppstoreOutlined' },
    { key: UNBOUND_SPACE_KEY, title: t('IotSceneLinkage.scope.unboundSpace'), icon: 'DisconnectOutlined' },
    ...spaceTreeData.value,
  ] : scopeMode.value === 'space' ? spaceTreeData.value : scopeTreeData.value)
  /** 数量只统计当前产品下的可见设备，复用设备列表批量接口，不逐节点发起请求。 */
  async function refreshCounts() {
    const sequence = ++countSequence
    scopeCounts.value = {}; countsError.value = false
    if (!props.open || ['tag', 'context', 'relation'].includes(scopeMode.value)) { countsLoading.value = false; return }
    countsLoading.value = true
    const requests = buildScopeCountRequests(scopeMode.value, navigationNodes.value)
    const baseTerms = productFilter.value ? [{ column: 'productId', termType: 'eq', value: productFilter.value }] : []
    try {
      const rows = await batchDeviceNodeSummary_api(requests, baseTerms)
      if (sequence === countSequence) scopeCounts.value = Object.fromEntries(rows.map(row => [row.id === ALL_DEVICES_COUNT_KEY ? '' : row.id, row.deviceCount]))
    } catch {
      if (sequence === countSequence) countsError.value = true
    } finally {
      if (sequence === countSequence) countsLoading.value = false
    }
  }
  watch([() => props.open, productFilter, scopeMode, navigationNodes], () => { void refreshCounts() }, { immediate: true })
  onScopeDispose(() => { clearSearchTimer(); ++requestSequence; ++countSequence })
  return { modalTitle, dialogProps, scopeMode, draft, productFilter, availableScopeModes, scopeModeLabel, scopeModeHint,
    navigationNodes, scopeCounts, countsLoading, countsError, refreshCounts,
    treeError, reloadTrees, selectedSpaceId, scopeError, scopeLoading, selectedScopeValues, selectionHint, selectSpace, selectScopedValues,
    keyword, deviceLoading, searchDevices, requestProducts, changeProductFilter, deviceOptions, deviceColumns, deviceRowSelection, deviceRow,
    total, pageSize, pageIndex, changePage, hasSelection, selectionTitle, selectionDescription, selectedDevice, selectedDevices, save }

}
