<template>
  <a-button class="ai-event-media-target-selector" :disabled="disabled" @click="visible = true">
    <span v-if="modelValue.length">{{ $t('IotSceneLinkage.aiEvent.cameraCount', { count: modelValue.length }) }}</span>
    <span v-else>{{ $t('IotSceneLinkage.placeholder.aiCameraScope') }}</span>
  </a-button>
  <a-modal
    v-model:open="visible"
    :title="$t('IotSceneLinkage.title.selectAiEventCameras')"
    :width="920"
    :body-style="{ maxHeight: 'min(calc(100vh - 10rem), 34rem)', overflow: 'hidden' }"
    :ok-text="$t('IotSceneLinkage.action.confirm')"
    :cancel-text="$t('IotSceneLinkage.action.cancel')"
    @ok="confirmSelection"
  >
    <div class="ai-event-media-target-selector__content">
      <section class="ai-event-media-target-selector__tree">
        <a-segmented v-model:value="activeScope" :options="scopeOptions" block @change="changeScope" />
        <a-input-search
          v-model:value="deviceKeyword"
          :placeholder="$t('IotSceneLinkage.placeholder.searchAiEventCamera')"
          allow-clear
        />
        <a-spin :spinning="loadingDevices">
          <div class="ai-event-media-target-selector__tree-list" @scroll="handleTreeScroll">
            <a-tree
              :tree-data="visibleSourceTree"
              :field-names="{ key: 'key', title: 'name' }"
              :selected-keys="selectedTreeKeys"
              :expanded-keys="deviceKeyword.trim() ? expandedTreeKeys : undefined"
              auto-expand-parent
              @select="selectTreeNode"
            />
            <div v-if="loadingMoreGateways" class="ai-event-media-target-selector__tree-loading"><a-spin size="small" /></div>
          </div>
        </a-spin>
      </section>
      <section class="ai-event-media-target-selector__channels">
        <template v-if="activeSource">
          <a-space class="ai-event-media-target-selector__channel-header">
            <strong>{{ activeSource.name }}</strong>
            <a-input-search
              v-model:value="channelKeyword"
              size="small"
              allow-clear
              :placeholder="$t('IotSceneLinkage.placeholder.searchAiEventChannel')"
            />
          </a-space>
          <AiEventMediaChannelGrid
            :channels="visibleChannelRows"
            :loading="loadingChannels"
            :loading-more="loadingMoreChannels"
            :has-more="hasMoreChannels"
            :selected-keys="selectedTargetKeys"
            :active-key="activeChannelKey"
            @toggle="toggleChannel"
            @select="selectChannel"
            @preview="previewChannel"
            @load-more="loadMoreChannels"
          />
        </template>
        <a-empty v-else :description="$t('IotSceneLinkage.aiEvent.selectCameraSource')" />
      </section>
    </div>
  </a-modal>
  <a-modal v-model:open="previewVisible" :title="$t('IotSceneLinkage.title.aiEventCameraPreview')" :footer="null" :width="720">
    <LivePlayer v-if="previewUrl" :url="previewUrl" :live="true" autoplay />
    <a-empty v-else :description="$t('IotSceneLinkage.aiEvent.previewUnavailable')" />
  </a-modal>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { buildPreferredMediaPath, withEdgeMediaToken } from '@jetlinks-web-core/utils'
import LivePlayer from '@jetlinks-web-core/components/Player/index.vue'
import AiEventMediaChannelGrid from './AiEventMediaChannelGrid.vue'
import {
  queryAiEventMediaDeviceChannels,
  queryAiEventMediaGateways,
  queryAiEventSpaceChannels,
  queryAiEventSpaceTree,
  type AiEventMediaChannel,
  type AiEventMediaDevice,
  type AiEventSpace,
} from '../../../../api/scene-linkage'
import { normalizeResult, type SceneAiEventMediaTarget } from '../../utils'

type MediaTreeNode = { key: string; id: string; name?: string; children?: MediaTreeNode[] }
const props = defineProps({
  modelValue: { type: Array as PropType<SceneAiEventMediaTarget[]>, default: () => [] },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits<{ (event: 'update:modelValue', value: SceneAiEventMediaTarget[]): void }>()
const { t } = useI18n()

const visible = ref(false)
const loadingDevices = ref(false)
const loadingChannels = ref(false)
const deviceKeyword = ref('')
const activeScope = ref<'region' | 'gateway'>('region')
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
const selectedTargets = ref<SceneAiEventMediaTarget[]>([])
const previewVisible = ref(false)
const previewUrl = ref('')
const channelPageIndex = ref(-1)
const channelTotal = ref(0)
const loadingMoreChannels = ref(false)
const RESOURCE_PAGE_SIZE = 18

const scopeOptions = computed(() => ([
  { value: 'region', label: t('IotSceneLinkage.aiEvent.cameraScopeRegion') },
  { value: 'gateway', label: t('IotSceneLinkage.aiEvent.cameraScopeGateway') },
]))
const sourceTree = computed(() => activeScope.value === 'region' ? regionTree.value : gatewayTree.value)
const visibleSourceTree = computed(() => {
  const keyword = deviceKeyword.value.trim().toLocaleLowerCase()
  return keyword
    ? filterTree(sourceTree.value, keyword)
    : sourceTree.value
})
const expandedTreeKeys = computed(() => deviceKeyword.value.trim() ? collectExpandableKeys(visibleSourceTree.value) : [])
const selectedTargetKeys = computed(() => selectedTargets.value.map(target => `${target.deviceId}:${target.channelId}`))
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

async function changeScope(scope: string | number) {
  if (scope !== 'region' && scope !== 'gateway') return
  selectedTreeKeys.value = []
  activeSource.value = undefined
  channelRows.value = []
  channelKeyword.value = ''
  channelPageIndex.value = -1
  channelTotal.value = 0
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

async function loadChannelPage(reset = false) {
  const source = activeSource.value
  if (!source || (reset && loadingChannels.value) || (!reset && (loadingChannels.value || loadingMoreChannels.value || !hasMoreChannels.value))) return
  const sourceScope = activeScope.value
  const pageIndex = reset ? 0 : channelPageIndex.value + 1
  if (reset) {
    loadingChannels.value = true
  } else {
    loadingMoreChannels.value = true
  }
  try {
    const result = sourceScope === 'region'
      ? normalizeResult<AiEventMediaChannel>(await queryAiEventSpaceChannels(source.id, { pageIndex, pageSize: RESOURCE_PAGE_SIZE }))
      : normalizeResult<AiEventMediaChannel>(await queryAiEventMediaDeviceChannels(source.id, { pageIndex, pageSize: RESOURCE_PAGE_SIZE }))
    if (source !== activeSource.value || sourceScope !== activeScope.value) return
    channelRows.value = reset ? result.data : appendDistinctChannels(channelRows.value, result.data)
    channelPageIndex.value = pageIndex
    channelTotal.value = result.total
  } finally {
    loadingChannels.value = false
    loadingMoreChannels.value = false
  }
}

function changeCurrentDeviceSelection(rows: AiEventMediaChannel[]) {
  if (!activeSource.value) return
  const currentChannelKeys = new Set(channelRows.value.map(channel => `${channel.deviceId}:${channel.channelId}`))
  const others = selectedTargets.value.filter(target => !currentChannelKeys.has(`${target.deviceId}:${target.channelId}`))
  selectedTargets.value = [...others, ...rows.map(channel => ({
    deviceId: channel.deviceId,
    channelId: channel.channelId,
    name: `${activeSource.value?.name || channel.deviceId}/${channel.name || channel.channelId}`,
  }))]
}

function toggleChannel(channel: AiEventMediaChannel) {
  const key = `${channel.deviceId}:${channel.channelId}`
  const rows = channelRows.value.filter(item => selectedTargetKeys.value.includes(`${item.deviceId}:${item.channelId}`))
  const nextRows = rows.some(item => `${item.deviceId}:${item.channelId}` === key)
    ? rows.filter(item => `${item.deviceId}:${item.channelId}` !== key)
    : [...rows, channel]
  changeCurrentDeviceSelection(nextRows)
}

function selectChannel(channel: AiEventMediaChannel) {
  activeChannelKey.value = `${channel.deviceId}:${channel.channelId}`
}

function loadMoreChannels() {
  void loadChannelPage()
}

function handleTreeScroll(event: Event) {
  if (activeScope.value !== 'gateway' || !hasMoreGateways.value || loadingMoreGateways.value) return
  const target = event.currentTarget as HTMLElement
  if (target.scrollTop + target.clientHeight >= target.scrollHeight - 48) {
    void loadGatewayPage()
  }
}

function confirmSelection() {
  emit('update:modelValue', selectedTargets.value)
  visible.value = false
}

function previewChannel(channel: AiEventMediaChannel) {
  // 订阅型边端通道须通过网关代理到 edge-master，路径与视觉告警编辑器的实时预览保持一致。
  previewUrl.value = withEdgeMediaToken(
    buildPreferredMediaPath(channel.deviceId, `/edge/master/media/${encodeURIComponent(channel.channelId)}/live.mp4`),
  )
  previewVisible.value = true
}

onMounted(() => {
  selectedTargets.value = props.modelValue.map(target => ({ ...target }))
})

function resetSelection() {
  selectedTargets.value = props.modelValue.map(target => ({ ...target }))
}

watch(() => props.modelValue, resetSelection, { deep: true })

// 取消时不提交草稿；重新打开时始终以已保存范围重新回显勾选状态。
watch(visible, open => {
  if (!open) return
  resetSelection()
  void loadDevices()
})

watch(channelKeyword, () => {
  activeChannelKey.value = ''
})

function mapSpaceTree(spaces: AiEventSpace[]): MediaTreeNode[] {
  return spaces.map(space => ({
    id: space.id,
    name: space.name || space.id,
    key: `region:${space.id}`,
    children: mapSpaceTree(space.children || []),
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
  const keys = new Set(current.map(channel => `${channel.deviceId}:${channel.channelId}`))
  return [...current, ...next.filter(channel => !keys.has(`${channel.deviceId}:${channel.channelId}`))]
}
</script>

<style scoped>
.ai-event-media-target-selector { flex: 0 0 12rem; width: 12rem; min-width: 10rem; max-width: 12rem; text-align: left; }
.ai-event-media-target-selector__content { display: flex; gap: 16px; height: min(25rem, calc(100vh - 20rem)); min-height: 20rem; }
.ai-event-media-target-selector__tree { width: 14rem; flex: none; border-right: 1px solid var(--border-color-split, #f0f0f0); padding-right: 16px; }
.ai-event-media-target-selector__tree-list { height: calc(min(25rem, 100vh - 20rem) - 4rem); margin-top: 12px; overflow: auto; }
.ai-event-media-target-selector__tree-loading { display: grid; place-items: center; min-height: 2rem; }
.ai-event-media-target-selector__channels { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.ai-event-media-target-selector__channel-header { display: flex; justify-content: space-between; width: 100%; margin-bottom: 12px; }
.ai-event-media-target-selector__channel-header :deep(.ant-input-search) { width: 10rem; }
</style>
