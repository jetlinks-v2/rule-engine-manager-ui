import { computed, ref, watch } from 'vue'
import {
  queryAiEventCameraBindingStatus,
  queryAiEventMediaDeviceChannels,
  queryAiEventMediaGateways,
  queryAiEventSpaceChannels,
  queryAiEventSpaceTree,
  type AiEventCameraBindingStatus,
  type AiEventMediaChannel,
  type AiEventMediaDevice,
  type AiEventSpace,
} from '../../../api/scene-linkage'
import { normalizeResult } from '../utils'

type MediaScope = 'region' | 'gateway'
type MediaTreeNode = { key: string; id: string; name?: string; children?: MediaTreeNode[] }
type VisionModelContext = { sceneId?: string; taskTarget?: string }

const RESOURCE_PAGE_SIZE = 18

/** Manages the camera-source tree, paged channel loading, and visual-event binding labels. */
export function useAiEventMediaTargetSelector(getVisionModelContext: () => VisionModelContext) {
  const loadingDevices = ref(false)
  const loadingChannels = ref(false)
  const deviceKeyword = ref('')
  const activeScope = ref<MediaScope>('region')
  const regionTree = ref<MediaTreeNode[]>([])
  const gatewayTree = ref<MediaTreeNode[]>([])
  const gatewayPageIndex = ref(-1)
  const gatewayTotal = ref(0)
  const loadingMoreGateways = ref(false)
  const selectedTreeKeys = ref<string[]>([])
  const activeSource = ref<MediaTreeNode>()
  const channelRows = ref<AiEventMediaChannel[]>([])
  const channelKeyword = ref('')
  const activeChannelKey = ref('')
  const channelPageIndex = ref(-1)
  const channelTotal = ref(0)
  const loadingMoreChannels = ref(false)
  let channelRequestVersion = 0

  const sourceTree = computed(() => activeScope.value === 'region' ? regionTree.value : gatewayTree.value)
  const visibleSourceTree = computed(() => {
    const keyword = deviceKeyword.value.trim().toLocaleLowerCase()
    return keyword ? filterTree(sourceTree.value, keyword) : sourceTree.value
  })
  const expandedTreeKeys = computed(() => deviceKeyword.value.trim() ? collectExpandableKeys(visibleSourceTree.value) : [])
  const hasMoreGateways = computed(() => gatewayTree.value.length < gatewayTotal.value)
  const hasMoreChannels = computed(() => channelRows.value.length < channelTotal.value)
  const visibleChannelRows = computed(() => {
    const keyword = channelKeyword.value.trim().toLocaleLowerCase()
    if (!keyword) return channelRows.value
    return channelRows.value.filter(channel => `${channel.name || ''} ${channel.channelId}`.toLocaleLowerCase().includes(keyword))
  })

  async function loadDevices() {
    if (loadingDevices.value) return
    loadingDevices.value = true
    try {
      if (activeScope.value === 'region') {
        regionTree.value = mapSpaceTree(normalizeResult<AiEventSpace>(await queryAiEventSpaceTree()).data)
      } else {
        await loadGatewayPage(true)
      }
    } finally {
      loadingDevices.value = false
    }
  }

  async function loadGatewayPage(reset = false) {
    if (!reset && (loadingDevices.value || loadingMoreGateways.value || !hasMoreGateways.value)) return
    if (!reset) loadingMoreGateways.value = true
    try {
      const pageIndex = reset ? 0 : gatewayPageIndex.value + 1
      const result = normalizeResult<AiEventMediaDevice>(await queryAiEventMediaGateways({
        pageIndex,
        pageSize: RESOURCE_PAGE_SIZE,
      }))
      const nextRows = result.data.map(gateway => ({
        id: gateway.id,
        name: gateway.name || gateway.id,
        key: `gateway:${gateway.id}`,
      }))
      gatewayTree.value = reset ? nextRows : appendDistinctTreeNodes(gatewayTree.value, nextRows)
      gatewayPageIndex.value = pageIndex
      gatewayTotal.value = result.total
    } finally {
      loadingMoreGateways.value = false
    }
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
    await loadDevices()
  }

  async function selectTreeNode(keys: string[], info: { node?: MediaTreeNode }) {
    const node = info.node
    if (!node?.id) return
    selectedTreeKeys.value = keys
    activeSource.value = node
    channelKeyword.value = ''
    await loadChannelPage(true)
  }

  /** Loads the selected region and its descendants, matching visual-alarm area browsing semantics. */
  async function loadChannelPage(reset = false) {
    const source = activeSource.value
    if (!source || (reset && loadingChannels.value) || (!reset && (loadingChannels.value || loadingMoreChannels.value || !hasMoreChannels.value))) return
    const sourceScope = activeScope.value
    const visionModelContext = getVisionModelContext()
    const requestVersion = ++channelRequestVersion
    const pageIndex = reset ? 0 : channelPageIndex.value + 1
    if (reset) loadingChannels.value = true
    else loadingMoreChannels.value = true
    try {
      const result = sourceScope === 'region'
        ? normalizeResult<AiEventMediaChannel>(await queryAiEventSpaceChannels(
          collectRegionIds(sourceTree.value, source.id),
          { pageIndex, pageSize: RESOURCE_PAGE_SIZE },
        ))
        : normalizeResult<AiEventMediaChannel>(await queryAiEventMediaDeviceChannels(source.id, { pageIndex, pageSize: RESOURCE_PAGE_SIZE }))
      const channels = await applyVisionModelConfiguration(result.data, visionModelContext)
      if (requestVersion !== channelRequestVersion || source !== activeSource.value || sourceScope !== activeScope.value) return
      channelRows.value = reset ? channels : appendDistinctChannels(channelRows.value, channels)
      channelPageIndex.value = pageIndex
      channelTotal.value = result.total
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
    if (!context.taskTarget || !channels.length) return channels.map(channel => ({ ...channel, modelConfigured: false }))
    try {
      const statuses = normalizeResult<AiEventCameraBindingStatus>(await queryAiEventCameraBindingStatus({
        cloudChannelEntityIds: channels.map(channel => channel.id),
        sceneId: context.sceneId,
        taskTarget: context.taskTarget,
      })).data
      const statusByChannelId = new Map(statuses.map(status => [status.cloudChannelEntityId, status]))
      return channels.map(channel => ({
        ...channel,
        modelConfigured: hasEnabledBinding(statusByChannelId.get(channel.id), context),
      }))
    } catch (error) {
      // A failed status lookup must not block selection; it is shown as not configured until the lookup succeeds.
      console.warn('[SceneLinkage] load visual event camera bindings failed:', error)
      return channels.map(channel => ({ ...channel, modelConfigured: false }))
    }
  }

  function loadMoreChannels() {
    void loadChannelPage()
  }

  function handleTreeScroll(event: Event) {
    if (activeScope.value !== 'gateway' || !hasMoreGateways.value || loadingMoreGateways.value) return
    const target = event.currentTarget as HTMLElement
    if (target.scrollTop + target.clientHeight >= target.scrollHeight - 48) void loadGatewayPage()
  }

  function selectChannel(channel: AiEventMediaChannel) {
    activeChannelKey.value = channelKey(channel)
  }

  function channelKey(channel: AiEventMediaChannel) {
    return `${channel.deviceId}:${channel.channelId}`
  }

  // Switching the selected visual scene or algorithm invalidates every current badge.
  watch(() => [getVisionModelContext().sceneId, getVisionModelContext().taskTarget], () => {
    channelRequestVersion += 1
    if (activeSource.value) void loadChannelPage(true)
  })

  watch(channelKeyword, () => {
    activeChannelKey.value = ''
  })

  return {
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
    loadingMoreGateways,
    loadingMoreChannels,
    hasMoreChannels,
    loadDevices,
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
    if (node.id === targetId) return node
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
  return `${channel.deviceId}:${channel.channelId}`
}
