import { computed, onScopeDispose, ref, watch } from 'vue'
import {
  queryAiEventCameraBindingStatus,
  queryAiEventChannels,
  queryAiEventSpaceChannels,
  queryAiEventSpaceTree,
  type AiEventCameraBindingStatus,
  type AiEventMediaChannel,
  type AiEventSpace,
} from '../../../api/scene-linkage'
import { normalizeResult } from '../utils'
import { queryAiSourceDevices, queryAiConfiguredSources, type AiSourceDevice, type AiConfiguredSource } from '../../../api/scene-ai-sources'
import { aiEventSourceKey, applyAiSourceConfiguration, loadAiMappingSources, loadAiMappingSpaces } from './aiEventSourceService'

type MediaScope = 'region' | 'channel'
type MediaTreeNode = { key: string; id: string; name?: string; kind?: 'device' | 'region' | 'group'; selectable?: boolean; children?: MediaTreeNode[] }
type VisionModelContext = { sceneId?: string; taskTarget?: string; allChannelsLabel?: string; devicesLabel?: string; regionsLabel?: string }

const RESOURCE_PAGE_SIZE = 18

/** Manages the camera-source tree, paged channel loading, and visual-event binding labels. */
export function useAiEventMediaTargetSelector(getVisionModelContext: () => VisionModelContext) {
  const loadingDevices = ref(false)
  const loadingChannels = ref(false)
  const deviceKeyword = ref('')
  const activeScope = ref<MediaScope>('region')
  const regionTree = ref<MediaTreeNode[]>([])
  const deviceTree = ref<MediaTreeNode[]>([])
  const devicePageIndex = ref(-1)
  const deviceTotal = ref(0)
  const loadingMoreDevices = ref(false)
  const selectedTreeKeys = ref<string[]>([])
  const activeSource = ref<MediaTreeNode>()
  const channelRows = ref<AiEventMediaChannel[]>([])
  const channelKeyword = ref('')
  const activeChannelKey = ref('')
  const channelPageIndex = ref(-1)
  const channelTotal = ref(0)
  const loadingMoreChannels = ref(false)
  const loadFailed = ref(false)
  const mappingSources = ref<AiEventMediaChannel[]>([])
  let mappingSpaces: Map<string, Set<string>> | undefined
  let deviceRequestVersion = 0
  let searchTimer: ReturnType<typeof setTimeout> | undefined
  let channelRequestVersion = 0

  const sourceTree = computed(() => activeScope.value === 'region'
    ? [{ id: '__all-channels__', key: '__all-channels__', name: getVisionModelContext().allChannelsLabel || '' },
      { id: '__devices__', key: '__devices__', name: getVisionModelContext().devicesLabel, kind: 'group', selectable: false, children: deviceTree.value },
      { id: '__regions__', key: '__regions__', name: getVisionModelContext().regionsLabel, kind: 'group', selectable: false, children: regionTree.value }] as MediaTreeNode[]
    : [])
  const visibleSourceTree = computed(() => {
    const keyword = deviceKeyword.value.trim().toLocaleLowerCase()
    return keyword ? filterTree(sourceTree.value, keyword) : sourceTree.value
  })
  const expandedTreeKeys = computed(() => collectExpandableKeys(visibleSourceTree.value))
  const hasMoreDevices = computed(() => deviceTree.value.length < deviceTotal.value)
  const hasMoreChannels = computed(() => channelRows.value.length < channelTotal.value)
  const visibleChannelRows = computed(() => {
    const keyword = channelKeyword.value.trim().toLocaleLowerCase()
    if (!keyword) return channelRows.value
    return channelRows.value.filter(channel => `${channel.name || ''} ${channel.channelId || ''}`.toLocaleLowerCase().includes(keyword))
  })

  async function loadDevices() {
    loadingDevices.value = true
    loadFailed.value = false
    mappingSpaces = undefined
    mappingSources.value = []
    // 部分来源失败仍保留其他成功结果，并提示列表可能不完整。
    const results = await Promise.allSettled([
      queryAiEventSpaceTree().then((result: unknown) => { regionTree.value = mapSpaceTree(normalizeResult<AiEventSpace>(result).data) }),
      loadAiMappingSources().then(sources => { mappingSources.value = sources }),
      loadDevicePage(true),
    ])
    results.forEach(result => {
      if (result.status === 'rejected') { loadFailed.value = true; console.warn('[SceneLinkage] load visual sources failed:', result.reason) }
    })
    loadingDevices.value = false
  }

  async function loadDevicePage(reset = false) {
    if (!reset && (loadingMoreDevices.value || !hasMoreDevices.value)) return
    const version = ++deviceRequestVersion
    loadingMoreDevices.value = true
    try {
      const pageIndex = reset ? 0 : devicePageIndex.value + 1
      const result = normalizeResult<AiSourceDevice>(await queryAiSourceDevices(pageIndex, deviceKeyword.value.trim()))
      if (version !== deviceRequestVersion) return
      const nextRows: MediaTreeNode[] = result.data.map(device => ({ id: device.id, name: device.name || device.id, key: `device:${device.id}`, kind: 'device' }))
      deviceTree.value = reset ? nextRows : appendDistinctTreeNodes(deviceTree.value, nextRows)
      devicePageIndex.value = pageIndex
      deviceTotal.value = result.total
    } catch (error) {
      if (version === deviceRequestVersion) loadFailed.value = true
      console.warn('[SceneLinkage] load visual source devices failed:', error)
    } finally {
      if (version === deviceRequestVersion) loadingMoreDevices.value = false
    }
  }

  async function scopedMappings(source: MediaTreeNode) {
    if (source.id === '__all-channels__') return mappingSources.value
    if (source.kind === 'device') return mappingSources.value.filter(mapping => mapping.deviceId === source.id)
    if (!mappingSpaces) mappingSpaces = await loadAiMappingSpaces(mappingSources.value)
    const spaceIds = new Set(collectRegionIds(regionTree.value, source.id))
    return mappingSources.value.filter(mapping => [...(mappingSpaces!.get(mapping.deviceId) || [])].some(id => spaceIds.has(id)))
  }

  async function changeScope(scope: MediaScope) {
    activeScope.value = scope
    selectedTreeKeys.value = []
    activeSource.value = undefined
    channelRows.value = []
    channelKeyword.value = ''
    channelPageIndex.value = -1
    channelTotal.value = 0
    channelRequestVersion += 1
    if (scope === 'channel') {
      activeSource.value = { id: '__all-channels__', key: '__all-channels__', name: '' }
      await loadChannelPage(true)
      return
    }
    await loadDevices()
  }

  async function selectTreeNode(keys: Array<string | number>, info: { node?: Record<string, unknown> }) {
    const node = findTreeNode(sourceTree.value, String(info.node?.key || keys[0]))
    if (!node || node.kind === 'group') return
    const source: MediaTreeNode = {
      id: node.id,
      key: typeof node.key === 'string' ? node.key : node.id,
      name: typeof node.name === 'string' ? node.name : node.id,
      kind: node.kind,
    }
    selectedTreeKeys.value = keys.map(String)
    activeSource.value = source
    channelKeyword.value = ''
    await loadChannelPage(true)
  }

  /** Initializes every dialog session from the complete channel list, matching visual-alarm browsing. */
  async function selectAllChannels() {
    const allChannels = sourceTree.value[0]
    if (!allChannels) return
    selectedTreeKeys.value = [allChannels.key]
    activeSource.value = allChannels
    channelKeyword.value = ''
    await loadChannelPage(true)
  }

  /** Loads the selected region and its descendants, matching visual-alarm area browsing semantics. */
  async function loadChannelPage(reset = false) {
    const source = activeSource.value
    if (!source || (!reset && (loadingChannels.value || loadingMoreChannels.value || !hasMoreChannels.value))) return
    const sourceScope = activeScope.value
    const visionModelContext = getVisionModelContext()
    const requestVersion = ++channelRequestVersion
    const pageIndex = reset ? 0 : channelPageIndex.value + 1
    if (reset) {
      // Do not leave the previous algorithm's enabled badges selectable while the new status query runs.
      channelRows.value = []
      channelPageIndex.value = -1
      channelTotal.value = 0
      loadingChannels.value = true
    }
    else loadingMoreChannels.value = true
    try {
      const [media, mapping] = await Promise.allSettled([
        source.kind === 'region'
          ? queryAiEventSpaceChannels(collectRegionIds(regionTree.value, source.id), { pageIndex, pageSize: RESOURCE_PAGE_SIZE })
          : queryAiEventChannels({ pageIndex, pageSize: RESOURCE_PAGE_SIZE,
            ...(source.kind === 'device' ? { terms: [{ column: 'deviceId', termType: 'eq', value: source.id }] } : {}),
          }),
        scopedMappings(source),
      ])
      if (requestVersion !== channelRequestVersion) return
      if (media.status === 'rejected' || mapping.status === 'rejected') loadFailed.value = true
      const result = media.status === 'fulfilled' ? normalizeResult<AiEventMediaChannel>(media.value) : { data: [], total: 0 }
      const mappings = mapping.status === 'fulfilled' ? mapping.value : []
      // 映射在首批插入，媒体通道继续独立分页；total 包含当前范围内的映射数。
      const sourceRows = reset ? [...mappings, ...result.data] : result.data
      const channels = await applyVisionModelConfiguration(sourceRows, visionModelContext)
      if (requestVersion !== channelRequestVersion || source !== activeSource.value || sourceScope !== activeScope.value) return
      channelRows.value = reset ? channels : appendDistinctChannels(channelRows.value, channels)
      channelPageIndex.value = pageIndex
      channelTotal.value = result.total + mappings.length
    } catch (error) {
      if (requestVersion === channelRequestVersion) loadFailed.value = true
      console.warn('[SceneLinkage] load visual sources failed:', error)
    } finally {
      if (requestVersion === channelRequestVersion) {
        loadingChannels.value = false
        loadingMoreChannels.value = false
      }
    }
  }

  /** Maps the enabled task bindings to the badges shown on each camera card. */
  async function applyVisionModelConfiguration(
    channels: AiEventMediaChannel[],
    context: VisionModelContext,
  ): Promise<AiEventMediaChannel[]> {
    if (!context.sceneId || !context.taskTarget || !channels.length) return applyAiSourceConfiguration(channels, [], new Set())
    const mediaIds = channels.filter(channel => !channel.mappingType).map(channel => channel.id)
    const [cloud, edge] = await Promise.allSettled([
      queryAiConfiguredSources(context.sceneId, context.taskTarget),
      mediaIds.length ? queryAiEventCameraBindingStatus({ cloudChannelEntityIds: mediaIds, sceneId: context.sceneId, taskTarget: context.taskTarget }) : Promise.resolve([]),
    ])
    // 云端与边端状态独立获取，一侧失败不能抹掉另一侧已确认的启用配置。
    if (cloud.status === 'rejected' || edge.status === 'rejected') loadFailed.value = true
    const sources = cloud.status === 'fulfilled' ? normalizeResult<AiConfiguredSource>(cloud.value).data : []
    const statuses = edge.status === 'fulfilled' ? normalizeResult<AiEventCameraBindingStatus>(edge.value).data : []
    const edgeIds = new Set(statuses.filter(status => hasEnabledBinding(status, context)).map(status => status.cloudChannelEntityId))
    return applyAiSourceConfiguration(channels, sources, edgeIds)
  }

  function loadMoreChannels() {
    void loadChannelPage()
  }

  function handleTreeScroll(event: Event) {
    if (!hasMoreDevices.value || loadingMoreDevices.value) return
    const target = event.currentTarget as HTMLElement
    if (target.scrollTop + target.clientHeight >= target.scrollHeight - 48) void loadDevicePage()
  }

  function selectChannel(channel: AiEventMediaChannel) {
    activeChannelKey.value = channelKey(channel)
  }

  function channelKey(channel: AiEventMediaChannel) {
    return aiEventSourceKey(channel)
  }

  // Switching the selected visual scene or algorithm invalidates every current badge.
  watch([() => getVisionModelContext().sceneId, () => getVisionModelContext().taskTarget], () => {
    channelRequestVersion += 1
    if (activeSource.value) void loadChannelPage(true)
  })

  watch(deviceKeyword, () => {
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => { void loadDevicePage(true) }, 250)
  })
  onScopeDispose(() => { channelRequestVersion += 1; deviceRequestVersion += 1; if (searchTimer) clearTimeout(searchTimer) })

  watch(channelKeyword, () => {
    activeChannelKey.value = ''
  })

  return {
    loadFailed,
    loadingDevices,
    loadingChannels,
    deviceKeyword,
    activeScope,
    visibleSourceTree,
    expandedTreeKeys,
    selectedTreeKeys,
    activeSource,
    channelRows,
    channelKeyword,
    activeChannelKey,
    visibleChannelRows,
    loadingMoreDevices,
    loadingMoreChannels,
    hasMoreChannels,
    loadDevices,
    selectAllChannels,
    changeScope,
    selectTreeNode,
    selectChannel,
    loadMoreChannels,
    handleTreeScroll,
    channelKey,
  }
}

function mapSpaceTree(spaces: AiEventSpace[]): MediaTreeNode[] {
  return spaces.map(space => ({
    id: space.id,
    name: space.name || space.id,
    key: `region:${space.id}`,
    kind: 'region',
    children: mapSpaceTree(space.children || []),
  }))
}

function collectRegionIds(nodes: MediaTreeNode[], targetId: string): string[] {
  const target = findTreeNode(nodes, targetId)
  return target ? [target.id, ...(target.children || []).flatMap(node => collectNodeIds(node))] : []
}

function collectNodeIds(node: MediaTreeNode): string[] {
  return [node.id, ...(node.children || []).flatMap(collectNodeIds)]
}

function findTreeNode(nodes: MediaTreeNode[], targetId: string): MediaTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === targetId || node.key === targetId) return node
    const child = findTreeNode(node.children || [], targetId)
    if (child) return child
  }
  return undefined
}

function hasEnabledBinding(status: AiEventCameraBindingStatus | undefined, context: VisionModelContext) {
  return Boolean(status?.info?.some(binding => {
    const state = binding.state
    return binding.sceneId === context.sceneId
      && binding.taskTarget === context.taskTarget
      && (typeof state === 'string' ? state : state?.value) === 'enabled'
  }))
}

function filterTree(nodes: MediaTreeNode[], keyword: string): MediaTreeNode[] {
  return nodes.flatMap(node => {
    const children = filterTree(node.children || [], keyword)
    return `${node.name || ''} ${node.id}`.toLocaleLowerCase().includes(keyword) || children.length
      ? [{ ...node, children }]
      : []
  })
}

function collectExpandableKeys(nodes: MediaTreeNode[]): string[] {
  return nodes.flatMap(node => node.children?.length
    ? [node.key, ...collectExpandableKeys(node.children)]
    : [])
}

function appendDistinctTreeNodes(current: MediaTreeNode[], next: MediaTreeNode[]): MediaTreeNode[] {
  const keys = new Set(current.map(node => node.key))
  return [...current, ...next.filter(node => !keys.has(node.key))]
}

function appendDistinctChannels(current: AiEventMediaChannel[], next: AiEventMediaChannel[]): AiEventMediaChannel[] {
  const keys = new Set(current.map(channelKey))
  return [...current, ...next.filter(channel => !keys.has(channelKey(channel)))]
}

function channelKey(channel: AiEventMediaChannel) {
  return aiEventSourceKey(channel)
}
