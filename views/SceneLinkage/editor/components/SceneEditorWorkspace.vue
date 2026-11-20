<template>
  <div ref="workspace" class="scene-workspace">
    <PageChrome><div class="scene-workspace__toolbar">
      <PageBack :label="$t('IotSceneLinkage.action.backToSceneList')" @back="$emit('back')" />
      <div class="scene-workspace__tools">
        <a-radio-group v-if="showModeSwitch" :value="mode" button-style="solid" :disabled="saving" @change="$emit('switch-mode', $event)">
          <a-radio-button value="quick">{{ $t('IotSceneLinkage.editor.quickMode') }}</a-radio-button>
          <a-radio-button value="detail">{{ $t('IotSceneLinkage.editor.detailMode') }}</a-radio-button>
        </a-radio-group>

      </div>
    </div></PageChrome>

    <div ref="body" :class="['scene-workspace__body', { 'has-preview': railVisible, 'is-wide': wide }]">
      <div class="scene-workspace__editor">
        <div class="scene-workspace__metadata">
          <div class="scene-workspace__name"><slot name="name" /></div>
          <div class="scene-workspace__description">
            <label :for="`${mode}-scene-description`">{{ $t('IotSceneLinkage.form.description') }}</label>
            <a-textarea :id="`${mode}-scene-description`" :value="description" :auto-size="{ minRows: 1, maxRows: 4 }" :maxlength="descriptionMaxLength" :placeholder="$t('IotSceneLinkage.placeholder.description')" @update:value="$emit('update:description', $event)" />
          </div>
        </div>
        <slot />
      </div>
      <aside ref="railAnchor" class="scene-workspace__rail" :aria-label="$t('IotSceneLinkage.title.rulePreview')">
        <div ref="railTarget" class="scene-workspace__rail-content" :style="wide ? { transform: `translateY(${previewOffset}px)` } : undefined">
          <a-button ref="previewToggle" class="scene-workspace__preview-toggle" :aria-expanded="previewOpen" :aria-controls="`${mode}-scene-rule-preview`" :aria-label="$t(previewOpen ? 'IotSceneLinkage.editor.hidePreview' : 'IotSceneLinkage.editor.showPreview')" :title="$t(previewOpen ? 'IotSceneLinkage.editor.hidePreview' : 'IotSceneLinkage.editor.showPreview')" @click="togglePreview"><span>{{ $t(previewOpen ? 'IotSceneLinkage.editor.collapsePreview' : 'IotSceneLinkage.editor.expandPreview') }}</span><AIcon :type="previewOpen ? 'RightOutlined' : 'LeftOutlined'" /></a-button>
        </div>
      </aside>
    </div>
    <JlDrawerShell :open="drawerOpen && !wide" :width="440" :force-render="true" hide-head class="scene-workspace__preview-drawer" @update:open="setDrawerOpen">
      <div ref="drawerTarget" />
    </JlDrawerShell>
    <!-- 同一个预览实例在侧栏与抽屉之间移动，避免重复请求和摘要回写。 -->
    <Teleport v-if="previewTarget" :to="previewTarget">
      <div v-show="previewOpen" ref="previewCard" class="scene-workspace__preview">
      <RulePreviewCard :id="`${mode}-scene-rule-preview`" :style="{ maxHeight: `${wide ? previewMaxHeight : Math.max(0, viewportHeight - 24)}px` }">
        <template v-if="!wide" #extra><a-button type="text" size="small" :aria-label="$t('IotSceneLinkage.editor.hidePreview')" @click="closePreview"><AIcon type="CloseOutlined" /></a-button></template>
        <slot name="preview" />
      </RulePreviewCard>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useElementBounding, useElementSize, useWindowSize } from '@vueuse/core'
import { PageBack, PageChrome } from '@jetlinks-web-core/components'
import RulePreviewCard from './RulePreviewCard.vue'
import JlDrawerShell from '@jetlinks-web-core/components/JlDrawerShell/index.vue'

defineProps<{ mode: 'quick' | 'detail'; showModeSwitch?: boolean; saving?: boolean; description?: string; descriptionMaxLength?: number }>()
defineEmits<{ back: []; 'switch-mode': [event: unknown]; 'update:description': [value: string] }>()
const workspace = ref<HTMLElement>()
const body = ref<HTMLElement>()
const railAnchor = ref<HTMLElement>()
const railTarget = ref<HTMLElement>()
const drawerTarget = ref<HTMLElement>()
const previewCard = ref<HTMLElement>()
const previewToggle = ref<{ $el: HTMLButtonElement }>()
const { width } = useElementSize(workspace)
const { top: railTop } = useElementBounding(railAnchor)
const { bottom: bodyBottom } = useElementBounding(body)
const { height: previewHeight } = useElementBounding(previewCard)
const panel = computed(() => workspace.value?.closest<HTMLElement>('.content-panel'))
const { top: panelTop } = useElementBounding(panel)
const { height: viewportHeight } = useWindowSize()
// 面板可能随内容增高并交由整页滚动；以未移动的侧栏为锚点，兼容两种滚动方式。
// 预览只在编辑区内跟随，顶部避开导航，底部保留间距。
const previewTop = computed(() => Math.max(64, panelTop.value + 16))
const previewMaxHeight = computed(() => Math.max(0, viewportHeight.value - Math.max(previewTop.value, railTop.value) - 16))
const previewOffset = computed(() => Math.max(0, Math.min(previewTop.value - railTop.value, bodyBottom.value - railTop.value - previewHeight.value)))
const wide = computed(() => width.value >= 1200)
const collapsed = ref(false)
const drawerOpen = ref(false)
const railVisible = computed(() => wide.value && !collapsed.value)
const previewOpen = computed(() => railVisible.value || (!wide.value && drawerOpen.value))
const previewTarget = computed(() => !wide.value && drawerOpen.value && drawerTarget.value ? drawerTarget.value : railTarget.value)
watch(wide, () => { drawerOpen.value = false })
function openPreview() { if (wide.value) collapsed.value = false; else drawerOpen.value = true }
function setDrawerOpen(open: boolean) {
  drawerOpen.value = open
  if (!open) nextTick(() => previewToggle.value?.$el?.focus())
}
function closePreview() { if (wide.value) collapsed.value = true; else setDrawerOpen(false) }
function togglePreview() { if (previewOpen.value) closePreview(); else openPreview() }
</script>

<style scoped>
.scene-workspace { container: scene-workspace / inline-size; min-width: 0; width: 100%; }
.scene-workspace__toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; min-height: 32px; padding-right: 16px; }
.scene-workspace__preview-toggle { position: absolute; top: 0; right: 0; z-index: 10; display: flex; align-items: center; justify-content: center; gap: 4px; width: 72px; height: 32px; padding: 0 8px; border-radius: 0 6px 0 6px; color: var(--jet-theme-text-secondary, #595959); background: var(--jet-theme-bg-container, #fff); }
.scene-workspace__preview-toggle > span:not(.anticon) { white-space: nowrap; }
.scene-workspace__name { min-width: 0; }
.scene-workspace__tools { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-left: auto; }
.scene-workspace__metadata { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 24px; align-items: start; }
.scene-workspace__description { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 12px; align-items: start; }
.scene-workspace__description > label { padding-top: 5px; text-align: right; color: var(--jet-theme-text, #1d2129); }
.scene-workspace__description :deep(textarea) { min-height: 32px; }
.scene-workspace__body { position: relative; display: grid; padding-right: 80px; grid-template-columns: minmax(0, 1fr); align-items: start; gap: 24px; }
.scene-workspace__body.is-wide { padding-right: 0; grid-template-columns: minmax(0, 1fr) 72px; }
.scene-workspace__body.has-preview { grid-template-columns: minmax(0, 1fr) clamp(360px, 28cqw, 440px); }
.scene-workspace__editor { display: grid; align-content: start; gap: 24px; min-width: 0; }
.scene-workspace__rail { position: absolute; top: 0; right: 0; width: 72px; min-width: 0; }
.scene-workspace__body.is-wide > .scene-workspace__rail { position: relative; grid-column: 2; width: auto; }
/* 按钮和预览共享位移；外层锚点保持静止，避免测量反馈和按钮过渡造成延迟跟随。 */
.scene-workspace__rail-content { position: relative; min-width: 0; }
.scene-workspace__preview { min-width: 0; }
.scene-workspace__name :deep(.ant-form-item) { margin-bottom: 0; }
.scene-workspace__name :deep(.ant-form-item-row) { display: flex; flex-flow: row nowrap; align-items: flex-start; gap: 12px; }
.scene-workspace__name :deep(.ant-form-item-label) { flex: 0 0 84px; width: 84px; padding: 5px 0 0; text-align: right; }
.scene-workspace__name :deep(.ant-form-item-control) { flex: 1; min-width: 0; }
@container scene-workspace (max-width: 760px) {
  .scene-workspace__metadata { grid-template-columns: minmax(0, 1fr); gap: 12px; }
}
</style>
