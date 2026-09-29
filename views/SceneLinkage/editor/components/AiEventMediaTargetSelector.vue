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
  <a-modal
    v-model:open="previewVisible"
    :title="$t('IotSceneLinkage.title.aiEventCameraPreview')"
    :footer="null"
    :width="720"
    destroy-on-close
    @after-close="previewUrl = ''"
  >
    <section class="ai-event-media-target-selector__preview">
      <LivePlayer
        v-if="previewUrl"
        :key="previewUrl"
        class="ai-event-media-target-selector__preview-player"
        :url="previewUrl"
        protocol="mp4"
        live
        autoplay
        muted
        :timeout="10"
      />
      <a-empty v-else :description="$t('IotSceneLinkage.aiEvent.previewUnavailable')" />
    </section>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { buildPreferredMediaPath, withEdgeMediaToken } from '@jetlinks-web-core/utils'
import LivePlayer from '@jetlinks-web-core/components/Player/index.vue'
import AiEventMediaChannelGrid from './AiEventMediaChannelGrid.vue'
import { type AiEventMediaChannel } from '../../../../api/scene-linkage'
import { type SceneAiEventMediaTarget } from '../../utils'
import { useAiEventMediaTargetSelector } from '../useAiEventMediaTargetSelector'

const props = defineProps({
  modelValue: { type: Array as PropType<SceneAiEventMediaTarget[]>, default: () => [] },
  sceneId: { type: String, default: undefined },
  taskTarget: { type: String, default: undefined },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits<{ (event: 'update:modelValue', value: SceneAiEventMediaTarget[]): void }>()

const visible = ref(false)
const selectedTargets = ref<SceneAiEventMediaTarget[]>([])
const previewVisible = ref(false)
const previewUrl = ref('')

const { t } = useI18n()
const {
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
  changeScope: changeMediaScope,
  selectTreeNode,
  selectChannel,
  loadMoreChannels,
  handleTreeScroll,
} = useAiEventMediaTargetSelector(() => ({
  sceneId: props.sceneId,
  taskTarget: props.taskTarget,
}))

const scopeOptions = computed(() => ([
  { value: 'region', label: t('IotSceneLinkage.aiEvent.cameraScopeRegion') },
  { value: 'gateway', label: t('IotSceneLinkage.aiEvent.cameraScopeGateway') },
]))
const selectedTargetKeys = computed(() => selectedTargets.value.map(target => `${target.deviceId}:${target.channelId}`))

async function changeScope(scope: string | number) {
  if (scope !== 'region' && scope !== 'gateway') return
  await changeMediaScope(scope)
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

</script>

<style scoped>
.ai-event-media-target-selector {
	flex: 0 0 var(--scene-linkage-resource-select-width, 18rem);
	width: var(--scene-linkage-resource-select-width, 18rem);
	min-width: var(--scene-linkage-resource-select-width, 18rem);
	max-width: var(--scene-linkage-resource-select-width, 18rem);
	text-align: left;
}
.ai-event-media-target-selector__content { display: flex; gap: 16px; height: min(25rem, calc(100vh - 20rem)); min-height: 20rem; }
.ai-event-media-target-selector__tree { width: 14rem; flex: none; border-right: 1px solid var(--border-color-split, #f0f0f0); padding-right: 16px; }
.ai-event-media-target-selector__tree-list { height: calc(min(25rem, 100vh - 20rem) - 4rem); margin-top: 12px; overflow: auto; }
.ai-event-media-target-selector__tree-loading { display: grid; place-items: center; min-height: 2rem; }
.ai-event-media-target-selector__channels { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.ai-event-media-target-selector__channel-header { display: flex; justify-content: space-between; width: 100%; margin-bottom: 12px; }
.ai-event-media-target-selector__channel-header :deep(.ant-input-search) { width: 10rem; }
.ai-event-media-target-selector__preview { display: grid; height: min(32rem, calc(100dvh - 12rem)); min-height: 22rem; overflow: hidden; border-radius: var(--r-2, .5rem); background: #000; }
.ai-event-media-target-selector__preview-player { width: 100%; height: 100%; min-height: 0; }
.ai-event-media-target-selector__preview :deep(.ant-empty) { display: grid; place-content: center; color: rgb(255 255 255 / 72%); }
</style>
