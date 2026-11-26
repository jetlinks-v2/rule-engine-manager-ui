<template>
  <a-button v-if="!controlled" class="ai-event-media-target-selector" @click="visible = true">
    <span v-if="modelValue.mediaTargets?.length">{{ $t('IotSceneLinkage.aiEvent.cameraCount', { count: modelValue.mediaTargets.length }) }}</span>
    <span v-else>{{ $t('IotSceneLinkage.placeholder.aiCameraScope') }}</span>
  </a-button>
  <a-modal :open="visible" :title="modalTitle" :width="1180"
    :body-style="{ maxHeight: 'min(calc(100vh - 10rem), 38rem)', overflow: 'hidden' }"
    :ok-text="$t('IotSceneLinkage.action.confirm')" :cancel-text="$t('IotSceneLinkage.action.cancel')"
    :confirm-loading="loadingChannels" :ok-button-props="{ disabled: !isReady }" @cancel="cancelSelection" @ok="confirmSelection">
    <div class="ai-event-media-target-selector__content">
      <section class="ai-event-media-target-selector__tree">
        <header><strong>{{ $t('IotSceneLinkage.aiEvent.cameraScopeRegion') }}</strong></header>
        <a-input-search v-model:value="deviceKeyword" :placeholder="$t('IotSceneLinkage.placeholder.searchAiEventCamera')" allow-clear />
        <a-spin :spinning="loadingDevices"><div class="ai-event-media-target-selector__tree-list" @scroll="handleTreeScroll"><a-tree
          :tree-data="visibleSourceTree" :field-names="{ key: 'key', title: 'name' }" :selected-keys="selectedTreeKeys"
          :expanded-keys="deviceKeyword.trim() ? expandedTreeKeys : undefined" auto-expand-parent @select="selectTreeNode" /></div></a-spin>
      </section>
      <section class="ai-event-media-target-selector__channels">
        <header class="ai-event-media-target-selector__section-header"><div><strong>{{ $t('IotSceneLinkage.aiEvent.selectVideoChannel') }}</strong><small>{{ $t('IotSceneLinkage.aiEvent.selectVideoChannelHint') }}</small></div><a-input-search v-model:value="channelKeyword" size="small" allow-clear :placeholder="$t('IotSceneLinkage.placeholder.searchAiEventChannel')" /></header>
        <AiEventMediaChannelGrid v-if="activeSource" :channels="visibleChannelRows" :loading="loadingChannels" :loading-more="loadingMoreChannels" :has-more="hasMoreChannels" :selected-keys="selectedTargetKeys" :active-key="activeChannelKey" @toggle="selectCamera" @select="selectCamera" @preview="previewChannel" @load-more="loadMoreChannels" />
        <CloudEmpty v-else :description="$t('IotSceneLinkage.aiEvent.selectCameraSource')" />
      </section>
      <section class="ai-event-media-target-selector__configuration">
        <header class="ai-event-media-target-selector__section-header"><div><strong>{{ $t('IotSceneLinkage.aiEvent.recognizeWhat') }}</strong><small v-if="draft.mediaTargets?.length">{{ selectedCameraName }}</small></div></header>
        <template v-if="scenes.length">
          <a-form layout="vertical" class="ai-event-media-target-selector__form">
            <a-form-item :label="$t('IotSceneLinkage.aiEvent.algorithm')">
              <div class="ai-event-media-target-selector__scene-packages">
                <section v-for="scene in scenes" :key="scene.id" class="ai-event-media-target-selector__scene-package" :class="{ 'is-expanded': isSceneExpanded(scene.id) }">
                  <button class="ai-event-media-target-selector__scene-package-title" type="button" @click="toggleScene(scene.id)">
                    <span><AIcon type="AppstoreOutlined" /><strong>{{ scene.name || scene.id }}</strong></span>
                    <span><small>{{ scene.children?.length || 0 }}</small><AIcon type="DownOutlined" /></span>
                  </button>
                  <div v-if="isSceneExpanded(scene.id)" class="ai-event-media-target-selector__scene-algorithms">
                    <button v-for="target in scene.children || []" :key="target.value" class="ai-event-media-target-selector__algorithm" :class="{ 'is-selected': isSelectedTarget(scene.id, target.value) }" type="button" @click="changeTarget(scene.id, target.value)">
                      <span class="ai-event-media-target-selector__algorithm-icon"><AIcon type="AimOutlined" /></span>
                      <span><strong>{{ target.text || target.value }}</strong><small v-if="target.description">{{ target.description }}</small></span>
                      <AIcon v-if="isSelectedTarget(scene.id, target.value)" type="CheckCircleFilled" />
                    </button>
                  </div>
                </section>
              </div>
            </a-form-item>
            <a-form-item :label="$t('IotSceneLinkage.aiEvent.triggerMethod')">
              <a-radio-group class="ai-event-media-target-selector__rules" :value="recognitionRuleType" :disabled="!draft.taskTarget" @change="changeRecognitionRule">
                <a-radio value="immediate">{{ $t('IotSceneLinkage.aiEvent.rule.immediate') }}</a-radio>
                <a-radio value="hits">{{ $t('IotSceneLinkage.aiEvent.rule.hits') }}</a-radio>
                <a-radio value="missed">{{ $t('IotSceneLinkage.aiEvent.rule.missed') }}</a-radio>
              </a-radio-group>
              <div v-if="draft.recognitionRule" class="ai-event-media-target-selector__condition">
                <template v-if="draft.recognitionRule.type === 'hits'">
                  <span>{{ $t('IotSceneLinkage.aiEvent.rule.within') }}</span>
                  <a-select :value="draft.recognitionRule.time" :options="timeOptions" @change="changeRecognitionRuleTime" />
                  <span>{{ $t('IotSceneLinkage.aiEvent.rule.detected') }}</span>
                  <a-input-number :value="draft.recognitionRule.threshold" :min="1" :max="99" @change="changeRecognitionRuleThreshold" />
                  <span>{{ $t('IotSceneLinkage.aiEvent.rule.times') }}</span>
                </template>
                <template v-else>
                  <span>{{ $t('IotSceneLinkage.aiEvent.rule.continuously') }}</span>
                  <a-select :value="draft.recognitionRule.time" :options="timeOptions" @change="changeRecognitionRuleTime" />
                  <span>{{ $t('IotSceneLinkage.aiEvent.rule.notDetected') }}</span>
                </template>
              </div>
            </a-form-item>
          </a-form>
          <footer class="ai-event-media-target-selector__preview"><b>{{ $t('IotSceneLinkage.alarmCondition.triggerRule') }}</b><span>{{ previewText }}</span></footer>
        </template>
        <a-spin v-else :spinning="loadingScenes"><CloudEmpty :description="$t('IotSceneLinkage.aiEvent.noAlgorithm')" /></a-spin>
      </section>
    </div>
  </a-modal>
  <RemoteComponent v-if="previewVisible" remote-name="jetlinks-media-ui" component-name="VideoChannelPlaybackDialog" :component-props="{ open: previewVisible, target: previewTarget }" :component-events="{ 'update:open': (value: boolean) => previewVisible = value }" />
</template>

<script setup lang="ts">
import { computed, ref, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AiEventMediaChannel } from '../../../../api/scene-linkage'
import type { SceneAiEventRecognitionRule, SceneAiEventTriggerConfig } from '../../utils'
import { useAiEventMediaTargetSelector } from '../useAiEventMediaTargetSelector'
import { useAiEventResources } from '../useAiEventResources'
import AiEventMediaChannelGrid from './AiEventMediaChannelGrid.vue'

const props = defineProps({
  modelValue: { type: Object as PropType<SceneAiEventTriggerConfig>, required: true },
  open: { type: Boolean as PropType<boolean | undefined>, default: undefined },
  title: String,
})
const emit = defineEmits<{
  (event: 'update:modelValue', value: SceneAiEventTriggerConfig): void
  (event: 'confirm', value: SceneAiEventTriggerConfig): void
  (event: 'cancel'): void
}>()
const { t } = useI18n()
const visible = ref(false)
const draft = ref<SceneAiEventTriggerConfig>(clone(props.modelValue))
const previewVisible = ref(false)
const previewTarget = ref<{ deviceId: string; channelId: string; name?: string } | null>(null)
const expandedSceneIds = ref(new Set<string>())
const { scenes, loadingScenes, taskTargets, loadSceneTree } = useAiEventResources()
const { loadingDevices, loadingChannels, deviceKeyword, visibleSourceTree, expandedTreeKeys, selectedTreeKeys, activeSource, channelKeyword, activeChannelKey, visibleChannelRows, loadingMoreChannels, hasMoreChannels, loadDevices, selectAllChannels, selectTreeNode, selectChannel, loadMoreChannels, handleTreeScroll } = useAiEventMediaTargetSelector(() => ({ sceneId: draft.value.sceneId, taskTarget: draft.value.taskTarget, allChannelsLabel: t('IotSceneLinkage.aiEvent.allChannels') }))

const selectedTargetKeys = computed(() => draft.value.mediaTargets?.map(target => `${target.deviceId}:${target.channelId}`) || [])
const selectedCameraName = computed(() => draft.value.mediaTargets?.[0]?.name || '')
const isReady = computed(() => Boolean(draft.value.mediaTargets?.length && draft.value.sceneId && draft.value.taskTarget))
const controlled = computed(() => props.open !== undefined)
const modalTitle = computed(() => props.title || (controlled.value ? t('IotSceneLinkage.title.aiEventTrigger') : t('IotSceneLinkage.title.selectAiEventCameras')))
const recognitionRuleType = computed(() => draft.value.recognitionRule?.type || 'immediate')
const timeOptions = computed(() => [10, 30, 60, 300, 600, 1800].map(value => ({ value, label: value >= 60 && value % 60 === 0
  ? t('IotSceneLinkage.debounce.minutes', { value: value / 60 })
  : t('IotSceneLinkage.debounce.seconds', { value }) })))
const previewText = computed(() => [selectedCameraName.value, draft.value.sceneName, draft.value.taskTargetName, recognitionRuleText.value].filter(Boolean).join(' · '))
const recognitionRuleText = computed(() => {
  const rule = draft.value.recognitionRule
  if (!rule) return ''
  const time = timeOptions.value.find(item => item.value === rule.time)?.label || rule.time
  return rule.type === 'hits'
    ? t('IotSceneLinkage.aiEvent.rule.hitsPreview', { time, count: rule.threshold })
    : t('IotSceneLinkage.aiEvent.rule.missedPreview', { time })
})

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
function defaultRecognitionRule(type: SceneAiEventRecognitionRule['type'] = 'hits'): SceneAiEventRecognitionRule {
  return type === 'hits' ? { type, time: 60, threshold: 1 } : { type, time: 60 }
}

/** Quick configuration permits only one channel and only after the selected algorithm is enabled there. */
function selectCamera(channel: AiEventMediaChannel) {
  if (channel.modelConfigured !== true) return
  selectChannel(channel)
  draft.value = { ...draft.value, mediaTargets: [{ deviceId: channel.deviceId, channelId: channel.channelId, entityId: channel.id, name: `${activeSource.value?.name || channel.deviceId}/${channel.name || channel.channelId}` }] }
}
function isSceneExpanded(sceneId: string) { return expandedSceneIds.value.has(sceneId) }
function toggleScene(sceneId: string) { const next = new Set(expandedSceneIds.value); next.has(sceneId) ? next.delete(sceneId) : next.add(sceneId); expandedSceneIds.value = next }
function isSelectedTarget(sceneId: string, taskTarget: string) { return draft.value.sceneId === sceneId && draft.value.taskTarget === taskTarget }
function changeTarget(sceneId: string, taskTarget: string) {
  const scene = scenes.value.find(item => item.id === sceneId)
  const target = taskTargets.value(sceneId).find(item => item.value === taskTarget)
  // A camera enabled for the previous algorithm might be unavailable for this one, so require a fresh channel choice.
  draft.value = { ...draft.value, mediaTargets: [], sceneId, sceneName: scene?.name || sceneId, taskTarget, taskTargetName: target?.text || taskTarget, condition: undefined }
}
function changeRecognitionRule(event: { target?: { value?: unknown } }) {
  const type = event.target?.value
  if (type !== 'immediate' && type !== 'hits' && type !== 'missed') return
  draft.value = { ...draft.value, condition: undefined, recognitionRule: type === 'immediate' ? undefined : defaultRecognitionRule(type) }
}
function changeRecognitionRuleTime(time: unknown) { if (draft.value.recognitionRule) draft.value = { ...draft.value, recognitionRule: { ...draft.value.recognitionRule, time: Number(time) } } }
function changeRecognitionRuleThreshold(threshold: unknown) { if (draft.value.recognitionRule?.type === 'hits') draft.value = { ...draft.value, recognitionRule: { ...draft.value.recognitionRule, threshold: Math.max(1, Number(threshold) || 1) } } }

/** Preserves a valid edited algorithm; new or stale drafts start from the first available scene package. */
function selectInitialAlgorithm() {
  const selectedTarget = taskTargets.value(draft.value.sceneId).find(item => item.value === draft.value.taskTarget)
  if (selectedTarget && draft.value.sceneId) {
    expandedSceneIds.value = new Set([draft.value.sceneId])
    return
  }
  const scene = scenes.value.find(item => item.children?.length)
  const target = scene?.children?.[0]
  expandedSceneIds.value = new Set(scene ? [scene.id] : [])
  if (!scene || !target) return
  draft.value = {
    ...draft.value,
    sceneId: scene.id,
    sceneName: scene.name || scene.id,
    taskTarget: target.value,
    taskTargetName: target.text || target.value,
    condition: undefined,
  }
}

/** Each open reloads independent scene and channel sources, then matches channel bindings to the chosen algorithm. */
async function initializeSelection() {
  draft.value = clone(props.modelValue)
  await Promise.all([loadDevices(), loadSceneTree()])
  selectInitialAlgorithm()
  await selectAllChannels()
}

function confirmSelection() {
  if (!isReady.value) return
  const value = clone(draft.value)
  if (!controlled.value) emit('update:modelValue', value)
  visible.value = false
  emit('confirm', value)
}
function cancelSelection() { visible.value = false; emit('cancel') }
function previewChannel(channel: AiEventMediaChannel) { previewTarget.value = { deviceId: channel.deviceId, channelId: channel.channelId, name: channel.name }; previewVisible.value = true }

// 弹窗打开后使用独立草稿；取消关闭时不向父级规则表单写入中间选择。
watch(() => props.modelValue, value => { if (!visible.value) draft.value = clone(value) }, { deep: true })
watch(() => props.open, open => { if (controlled.value) visible.value = Boolean(open) }, { immediate: true })
watch(visible, open => { if (open) void initializeSelection() })
</script>

<style scoped>
.ai-event-media-target-selector { flex: 0 0 var(--scene-linkage-resource-select-width, 18rem); width: var(--scene-linkage-resource-select-width, 18rem); min-width: var(--scene-linkage-resource-select-width, 18rem); text-align: left; }
.ai-event-media-target-selector__content { display: grid; grid-template-columns: 13rem minmax(0, 1.15fr) minmax(17rem, .85fr); min-height: 28rem; }.ai-event-media-target-selector__tree, .ai-event-media-target-selector__channels, .ai-event-media-target-selector__configuration { display: flex; flex-direction: column; min-width: 0; padding: 16px; border-right: 1px solid var(--jet-theme-border-secondary); }.ai-event-media-target-selector__configuration { border-right: 0; }.ai-event-media-target-selector__tree > header { margin-bottom: 12px; }.ai-event-media-target-selector__tree-list { flex: 1; min-height: 0; margin-top: 12px; overflow: auto; }
.ai-event-media-target-selector__section-header { display: flex; justify-content: space-between; gap: 12px; min-height: 38px; margin-bottom: 12px; }.ai-event-media-target-selector__section-header > div { display: grid; gap: 2px; }.ai-event-media-target-selector__section-header small { color: var(--ant-color-text-tertiary); font-size: 12px; }.ai-event-media-target-selector__section-header :deep(.ant-input-search) { width: 9rem; }.ai-event-media-target-selector__form { flex: 1; min-height: 0; overflow: auto; }.ai-event-media-target-selector__form :deep(.ant-form-item) { margin-bottom: 14px; }.ai-event-media-target-selector__scene-packages { display: grid; gap: 8px; }.ai-event-media-target-selector__scene-package { overflow: hidden; border: 1px solid var(--jet-theme-border-secondary); border-radius: 6px; }.ai-event-media-target-selector__scene-package-title { display: flex; justify-content: space-between; align-items: center; width: 100%; min-height: 36px; padding: 0 10px; border: 0; color: var(--ant-color-text); background: var(--ant-color-fill-quaternary); cursor: pointer; text-align: left; }.ai-event-media-target-selector__scene-package-title > span { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }.ai-event-media-target-selector__scene-package-title small { color: var(--ant-color-text-tertiary); }.ai-event-media-target-selector__scene-package-title :deep(.anticon-down) { transition: transform .15s ease; }.ai-event-media-target-selector__scene-package.is-expanded .ai-event-media-target-selector__scene-package-title :deep(.anticon-down) { transform: rotate(180deg); }.ai-event-media-target-selector__scene-algorithms { display: grid; gap: 4px; padding: 6px; }.ai-event-media-target-selector__algorithm { display: flex; gap: 8px; align-items: center; width: 100%; padding: 7px 8px; border: 1px solid transparent; border-radius: 5px; color: var(--ant-color-text); background: transparent; cursor: pointer; text-align: left; }.ai-event-media-target-selector__algorithm:hover { background: var(--ant-color-fill-quaternary); }.ai-event-media-target-selector__algorithm.is-selected { border-color: var(--ant-color-primary-border); color: var(--ant-color-primary); background: var(--ant-color-primary-bg); }.ai-event-media-target-selector__algorithm > span:nth-child(2) { display: grid; flex: 1; gap: 2px; min-width: 0; }.ai-event-media-target-selector__algorithm strong, .ai-event-media-target-selector__algorithm small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.ai-event-media-target-selector__algorithm small { color: var(--ant-color-text-tertiary); font-size: 12px; }.ai-event-media-target-selector__algorithm-icon { display: grid; flex: none; width: 22px; height: 22px; place-items: center; border-radius: 4px; color: var(--ant-color-primary); background: var(--ant-color-primary-bg); }.ai-event-media-target-selector__rules { display: grid; gap: 8px; }.ai-event-media-target-selector__rules :deep(.ant-radio-wrapper) { display: flex; align-items: center; min-height: 36px; margin-inline-end: 0; padding: 0 10px; border: 1px solid var(--jet-theme-border-secondary); border-radius: 6px; }.ai-event-media-target-selector__rules :deep(.ant-radio-wrapper-checked) { color: var(--ant-color-primary); border-color: var(--ant-color-primary); background: var(--ant-color-primary-bg); }.ai-event-media-target-selector__condition { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 8px; color: var(--ant-color-text-secondary); font-size: 12px; }.ai-event-media-target-selector__condition :deep(.ant-select) { width: 7.5rem; }.ai-event-media-target-selector__condition :deep(.ant-input-number) { width: 4.5rem; }
.ai-event-media-target-selector__preview { display: flex; gap: 8px; align-items: flex-start; padding: 10px 12px; color: var(--ant-color-text-secondary); background: var(--ant-color-primary-bg); border: 1px dashed var(--ant-color-primary-border); border-radius: 8px; font-size: 12px; }.ai-event-media-target-selector__preview b { flex: none; color: var(--ant-color-primary); }.ai-event-media-target-selector__preview span { overflow-wrap: anywhere; }
@media (max-width: 980px) { .ai-event-media-target-selector__content { grid-template-columns: 12rem minmax(0, 1fr); }.ai-event-media-target-selector__configuration { grid-column: span 2; border-top: 1px solid var(--jet-theme-border-secondary); }.ai-event-media-target-selector__channels { border-right: 0; } }
</style>
