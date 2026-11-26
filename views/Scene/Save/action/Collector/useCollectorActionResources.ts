import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import { queryChannelNoPaging, queryCollectorTree, queryPointNoPagingV2 } from '../../../../../api/collector'
import { normalizeCollectorPoint, type CollectorPoint } from './collectorPoint'

export type CollectorResource = { id: string; name: string; channelId?: string; pointNumber?: number }
const rows = (response: any): any[] => {
  const result = response?.result ?? response
  return Array.isArray(result) ? result : result?.data || result?.records || []
}

/** 复用采集资源页的通道、采集器和点位查询；迟到的点位响应不能覆盖当前采集器。 */
export function useCollectorActionResources(initialCollectorId: string, initialChannelId: string, handlerType: Ref<string>) {
  const channels = ref<CollectorResource[]>([])
  const collectors = ref<CollectorResource[]>([])
  const points = ref<CollectorPoint[]>([])
  const collectorId = ref(initialCollectorId)
  const channelId = ref(initialChannelId)
  const pointId = ref('')
  const keyword = ref('')
  const loading = ref(false)
  const pointsLoading = ref(false)
  const loadError = ref(false)
  const pointsError = ref(false)
  let sequence = 0
  const currentCollector = computed(() => collectors.value.find(item => item.id === collectorId.value))
  const currentChannel = computed(() => channels.value.find(item => item.id === (currentCollector.value?.channelId || channelId.value)))
  const tree = computed(() => channels.value.map(channel => ({
    key: `channel:${channel.id}`, title: channel.name, icon: 'ClusterOutlined',
    children: collectors.value.filter(item => item.channelId === channel.id).map(item => ({ key: item.id, title: item.name, icon: 'DatabaseOutlined' })),
  })))
  const availablePoints = computed(() => points.value.filter(point => (point.accessModeMask & (handlerType.value === 'write' ? 2 : handlerType.value === 'sub' ? 4 : 1)) !== 0))
  const visiblePoints = computed(() => availablePoints.value.filter(point => [point.name, point.id].some(text => String(text || '').toLowerCase().includes(keyword.value.trim().toLowerCase()))))

  async function loadResources() {
    loading.value = true
    loadError.value = false
    try {
      const [channelResponse, collectorResponse] = await Promise.all([queryChannelNoPaging(), queryCollectorTree({ paging: false })])
      channels.value = rows(channelResponse)
      collectors.value = rows(collectorResponse)
      channelId.value = currentCollector.value?.channelId || channelId.value
    } catch { loadError.value = true }
    finally { loading.value = false }
  }
  async function loadPoints() {
    const current = ++sequence
    points.value = []
    pointsError.value = false
    if (!collectorId.value) { pointsLoading.value = false; return }
    pointsLoading.value = true
    try {
      const response = await queryPointNoPagingV2({ paging: false, terms: [{ column: 'collectorId', termType: 'eq', value: collectorId.value }] })
      if (current === sequence) points.value = rows(response).map(normalizeCollectorPoint)
    } catch { if (current === sequence) pointsError.value = true }
    finally { if (current === sequence) pointsLoading.value = false }
  }
  function selectCollector(keys: Array<string | number>) {
    const selected = collectors.value.find(item => item.id === String(keys[0]))
    if (!selected || selected.id === collectorId.value) return
    collectorId.value = selected.id
    channelId.value = selected.channelId || ''
    pointId.value = ''
    keyword.value = ''
  }
  watch(collectorId, loadPoints, { immediate: true })
  watch(handlerType, () => {
    if (pointId.value && !availablePoints.value.some(point => point.id === pointId.value)) pointId.value = ''
  })
  onScopeDispose(() => { ++sequence })
  void loadResources()
  return { tree, points, visiblePoints, collectorId, channelId, pointId, keyword, loading, pointsLoading, loadError, pointsError, currentCollector, currentChannel, selectCollector, loadResources, loadPoints }
}
