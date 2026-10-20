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
  <RemoteComponent
    v-if="previewVisible"
    remote-name="jetlinks-media-ui"
    component-name="VideoChannelPlaybackDialog"
    :component-props="{ open: previewVisible, target: previewTarget }"
    :component-events="{ 'update:open': value => previewVisible = value }"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
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
const previewTarget = ref<{ deviceId: string; channelId: string; name?: string } | null>(null)

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
  previewTarget.value = { deviceId: channel.deviceId, channelId: channel.channelId, name: channel.name }
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
</style>
