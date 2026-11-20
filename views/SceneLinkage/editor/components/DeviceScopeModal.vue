<template>
  <component :is="embedded ? 'div' : 'a-modal'" v-bind="{ ...dialogProps, title: undefined }" :class="{ 'device-scope-modal__embedded': embedded }" @cancel="!embedded && $emit('cancel')">
    <template v-if="!embedded" #title><div class="device-scope-modal__dialog-title"><span>{{ title || $t('IotSceneLinkage.title.selectDevices') }}</span><slot v-if="!detailed" name="toolbar-actions" /></div></template>
    <div :class="['device-scope-modal__layout', { 'device-scope-modal__layout--scope': scopeMode !== 'fixed', 'device-scope-modal__layout--detailed': detailed, 'device-scope-modal__layout--bottom': configurationPlacement === 'bottom' }]">
      <header v-if="detailed" class="device-scope-modal__toolbar">
        <a-radio-group v-model:value="scopeMode" class="device-scope-modal__scope-mode" button-style="solid" :aria-label="$t('IotSceneLinkage.form.deviceScope')">
          <a-radio-button v-for="item in availableScopeModes" :key="item.value" :value="item.value" :disabled="disabledScopeModes.includes(item.value)">{{ item.label }}</a-radio-button>
        </a-radio-group>
        <DocumentHelp code="rule-engine/Scene" help-key="scene.deviceScope" />
        <div v-if="$slots['toolbar-actions']" class="device-scope-modal__toolbar-actions"><slot name="toolbar-actions" /></div>
      </header>
      <header v-if="detailed && configurationPlacement === 'side'" class="device-scope-modal__configuration-title"><strong>{{ $t('IotSceneLinkage.scope.configuration') }}</strong><slot name="configuration-help" /></header>
      <aside class="device-scope-modal__navigation">
        <slot v-if="['tag', 'context', 'relation'].includes(scopeMode)" name="scope-editor" :mode="scopeMode" :value="selectedScopeValues" :update="updateScopeValues" :invalid="scopeError" />
        <template v-else-if="scopeMode !== 'all'">
          <DeviceScopeTree
            :key="scopeMode"
            :title="scopeMode === 'fixed' ? $t('IotSceneLinkage.editor.areas') : scopeModeLabel"
            :hint="scopeMode === 'fixed' ? '' : scopeModeHint"
            :nodes="navigationNodes" :counts="scopeCounts" :loading="scopeLoading"
            :tree-error="treeError" :counts-loading="countsLoading" :counts-error="countsError" :invalid="scopeError"
            :checkable="scopeMode !== 'fixed'" :selected-keys="[selectedSpaceId]"
            :checked-keys="selectedScopeValues.map(item => item.value)"
            :icon="scopeMode === 'device-group' ? 'ClusterOutlined' : scopeMode === 'org' ? 'ApartmentOutlined' : 'EnvironmentOutlined'"
            @select="selectSpace" @check="selectScopedValues($event, navigationNodes)" @retry="refreshCounts" @retry-tree="reloadTrees"
          />
          <p v-if="scopeError" class="device-scope-modal__scope-error">{{ selectionHint }}</p>
        </template>
        <div v-else class="device-scope-modal__scope-overview"><AIcon type="AppstoreOutlined" /><strong>{{ scopeModeLabel }}</strong><span>{{ scopeModeHint }}</span></div>
      </aside>
      <section v-show="scopeMode === 'fixed'" class="device-scope-modal__content">
        <header class="device-scope-modal__column-title"><strong>{{ $t('IotSceneLinkage.form.device') }}</strong></header>
        <div class="device-scope-modal__filters">
          <ConditionFilter v-model="filterTerms" :fields="filterFields" @change="handleFilterSearch" />
        </div>
        <a-table
          class="device-scope-modal__device-table"
          row-key="id" size="small" table-layout="fixed"
          :columns="deviceColumns" :data-source="deviceOptions" :loading="deviceLoading"
          :pagination="false" :row-selection="deviceRowSelection" :custom-row="deviceRow"

        >
          <template #bodyCell="{ column, record }">
            <j-badge-status v-if="column.key === 'status'" :text="record.statusText" :status="record.status" />
            <a-tooltip v-else-if="column.key === 'name' || column.key === 'productName'" :title="record[column.key]"><span class="device-scope-modal__cell-label">{{ record[column.key] }}</span></a-tooltip>
          </template>
          <template #emptyText><CloudEmpty :description="$t('IotSceneLinkage.scope.empty')" /></template>
        </a-table>
        <a-pagination class="device-scope-modal__pagination" size="small" :current="pageIndex + 1" :page-size="pageSize" :total="total" show-less-items @change="changePage" />
      </section>
      <aside v-if="configurationPlacement === 'side'" class="device-scope-modal__selection">
        <header v-if="!detailed" class="device-scope-modal__column-title"><strong>{{ $t('IotSceneLinkage.scope.configuration') }}</strong><slot name="configuration-help" /></header>
        <div class="device-scope-modal__configuration">
          <div v-if="configurationReady" v-show="hasSelection" class="device-scope-modal__configuration-content">
            <slot name="configuration" :selected-device="selectedDevice" :selected-devices="selectedDevices" :has-selection="hasSelection" :scope="scopeMode" />
            <SceneConfigPreview v-if="$slots.preview" class="device-scope-modal__preview"><slot name="preview" :selected-device="selectedDevice" :selected-devices="selectedDevices" :scope="scopeMode" :selection-scope="selectionScope" /></SceneConfigPreview>
          </div>
          <CloudEmpty v-if="!hasSelection" :description="selectionHint" />
        </div>
      </aside>
    </div>
    <SceneConfigPreview v-if="configurationPlacement === 'bottom' && hasSelection && $slots.preview" class="device-scope-modal__bottom-preview"><slot name="preview" :selected-device="selectedDevice" :selected-devices="selectedDevices" :scope="scopeMode" :selection-scope="selectionScope" /></SceneConfigPreview>
    <div class="device-scope-modal__footer"><a-button @click="$emit('cancel')">{{ $t('IotSceneLinkage.action.cancel') }}</a-button><a-tooltip :title="scopeMode === 'fixed' && !hasSelection ? selectionHint : undefined"><span><a-button type="primary" :disabled="scopeMode === 'fixed' && !hasSelection" @click="save">{{ $t('IotSceneLinkage.action.confirm') }}</a-button></span></a-tooltip></div>
  </component>
</template>
<script setup lang="ts">
import DocumentHelp from '@jetlinks-web-core/components/DocumentHelp'
import { computed, ref, watch, type PropType } from 'vue'
import DeviceScopeTree from './DeviceScopeTree.vue'
import SceneConfigPreview from './SceneConfigPreview.vue'
import { useDeviceScopeModal } from '../detail/useDeviceScopeModal'
import type { DeviceScope, DeviceOption, ScopeMode } from '../deviceScopeTree'
export type { DeviceScope } from '../deviceScopeTree'
import ConditionFilter from '@jetlinks-web-core/components/ConditionFilter'
const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  width: { type: Number, default: 1180 },
  embedded: { type: Boolean, default: false },
  detailed: { type: Boolean, default: false },
  configurationPlacement: { type: String as PropType<'side' | 'bottom'>, default: 'side' },
  multiple: { type: Boolean, default: false },
  lockProduct: { type: Boolean, default: false },
  scopeModes: { type: Array as PropType<ScopeMode[]>, default: () => ['fixed', 'all', 'space', 'device-group', 'org'] },
  disabledScopeModes: { type: Array as PropType<ScopeMode[]>, default: () => [] },
  productId: { type: String, default: '' },
  modelValue: { type: Object as PropType<DeviceScope>, required: true },
  validate: { type: Function as PropType<(device: DeviceOption, scope?: DeviceScope) => boolean | Promise<boolean>>, default: undefined },
})
const emit = defineEmits<{ (event: 'cancel'): void; (event: 'save', value: DeviceScope): void; (event: 'select-device', value: DeviceOption): void; (event: 'select-devices', value: DeviceOption[]): void }>()
const { dialogProps, scopeMode, draft, availableScopeModes, scopeModeLabel, scopeModeHint,
  navigationNodes, scopeCounts, countsLoading, countsError, refreshCounts,
  treeError, reloadTrees, selectedSpaceId, scopeError, scopeLoading, selectedScopeValues, selectionHint, selectSpace, selectScopedValues,
  filterTerms, filterFields, handleFilterSearch, deviceLoading, deviceOptions, deviceColumns, deviceRowSelection, deviceRow,
  total, pageSize, pageIndex, changePage, hasSelection, selectedDevice, selectedDevices, save,
} = useDeviceScopeModal(props, emit)
// 已开始编辑的规则保留在弹窗草稿中，取消勾选或切换范围只隐藏配置。
const configurationReady = ref(hasSelection.value)
watch(hasSelection, selected => { if (selected) configurationReady.value = true })
const selectionScope = computed<DeviceScope>(() => ({
  ...props.modelValue, selector: scopeMode.value, productId: draft.productId, productName: draft.productName,
  selectorValues: scopeMode.value === 'fixed' ? selectedDevices.value.map(device => ({ value: device.id, name: device.name })) : selectedScopeValues.value,
}))
/** 自定义范围编辑器直接更新同一份选择草稿，确认时仍由资源壳统一提交。 */
function updateScopeValues(values: DeviceScope['selectorValues']) { selectedScopeValues.value = values }
</script>

<style scoped>
/* 独立与嵌入式资源弹窗共用视口预算，确认操作不随资源列表滚出屏幕。 */
:global(.device-scope-modal .ant-modal),
:global(.ant-modal:has(.device-scope-modal__embedded)) {
  top: 24px;
  padding-bottom: 24px;
}
:global(.device-scope-modal .ant-modal-content),
:global(.ant-modal:has(.device-scope-modal__embedded) .ant-modal-content) {
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - 48px);
}
:global(.device-scope-modal .ant-modal-header),
:global(.ant-modal:has(.device-scope-modal__embedded) .ant-modal-header) {
  flex: none;
}
:global(.device-scope-modal .ant-modal-body),
:global(.ant-modal:has(.device-scope-modal__embedded) .ant-modal-body) {
  display: flex;
  flex-direction: column;
  height: min(40rem, calc(100dvh - 9rem));
  min-height: 0;
  overflow: hidden;
}
:global(.ant-modal:has(.device-scope-modal__embedded) .steps-content),
:global(.ant-modal:has(.device-scope-modal__embedded) .detailed-device-trigger-modal__scope),
:global(.ant-modal:has(.device-scope-modal__embedded) .detailed-device-action-scope) {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  max-height: none;
  overflow: hidden;
}
:global(.ant-modal:has(.device-scope-modal__embedded) .device-scope-modal__embedded > .device-scope-modal__layout) {
  min-height: 0;
}
.device-scope-modal__embedded {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}
.device-scope-modal__dialog-title { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-right: 32px; }
.device-scope-modal__toolbar { grid-area: ranges; display: flex; align-items: center; min-width: 0; padding: 12px 16px; border-bottom: 1px solid var(--jet-theme-border-color-1, #eceff3); }
.device-scope-modal__toolbar-actions { display: flex; flex: none; margin-left: auto; padding-left: 12px; }
.device-scope-modal__configuration-title { grid-area: config; display: flex; gap: 8px; align-items: center; min-width: 0; padding: 12px 16px; border-bottom: 1px solid var(--jet-theme-border-color-1, #eceff3); border-left: 1px solid var(--jet-theme-border-color-1, #eceff3); font-size: 14px; }
.device-scope-modal__scope-mode { display: flex; flex-wrap: wrap; gap: 4px; }
.device-scope-modal__scope-mode :deep(.ant-radio-button-wrapper) {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 8px;
  border-radius: 4px;
  font-size: 14px;
}
.device-scope-modal__scope-mode :deep(.ant-radio-button-wrapper)::before { display: none; }
.device-scope-modal__layout {
  display: grid;
  flex: 1;
  grid-template-columns: 15.5rem minmax(0, 1fr) 21rem;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--jet-theme-border-color-1, #eceff3);
  border-radius: var(--radius-jet-sm, 8px);
}
.device-scope-modal__layout--scope { grid-template-columns: minmax(20rem, 1fr) 21rem; }
.device-scope-modal__layout--detailed { grid-template-areas: 'ranges ranges config' 'navigation devices selection'; grid-template-rows: auto minmax(0, 1fr); }
.device-scope-modal__layout.device-scope-modal__layout--detailed.device-scope-modal__layout--scope:not(.device-scope-modal__layout--bottom) { grid-template-columns: 1fr; grid-template-areas: 'ranges config' 'navigation selection'; }
.device-scope-modal__layout--detailed > .device-scope-modal__navigation { grid-area: navigation; }
.device-scope-modal__layout--detailed > .device-scope-modal__content { grid-area: devices; }
.device-scope-modal__layout--detailed > .device-scope-modal__selection { grid-area: selection; }
.device-scope-modal__navigation,
.device-scope-modal__content,
.device-scope-modal__selection {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
  min-width: 0;
  min-height: 0;
  padding: var(--space-4, 16px);
}
.device-scope-modal__navigation { background: var(--jet-theme-bg-container, #fff); overflow: hidden; border-right: 1px solid var(--jet-theme-border-color-1, #eceff3); }
.device-scope-modal__selection { border-left: 1px solid var(--jet-theme-border-color-1, #eceff3); }
.device-scope-modal__column-title { display: flex; align-items: center; gap: 8px; flex: none; min-height: 22px; }
.device-scope-modal__column-title strong { color: var(--jet-theme-text, #1d2129); font-size: 14px; font-weight: 600; line-height: 22px; }
.device-scope-modal__filters { flex: none; min-height: 32px; }
.device-scope-modal__device-table { flex: 1; min-height: 0; overflow: auto; }
.device-scope-modal__device-table :deep(.ant-table-thead > tr > th) { position: sticky; top: 0; z-index: 1; }
.device-scope-modal__device-table :deep(.ant-table-row) { cursor: pointer; }
.device-scope-modal__device-table :deep(.ant-table-cell) { text-align: left; }
.device-scope-modal__cell-label { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.device-scope-modal__device-table :deep(.ant-table-selection-column) { text-align: center; }
.device-scope-modal__pagination { display: flex; flex: none; justify-content: flex-end; }
.device-scope-modal__configuration { display: flex; flex: 1; flex-direction: column; gap: var(--space-3, 12px); min-height: 0; overflow: auto; }
/* 嵌套指令表单的栅格负边距不能撑出配置栏，同时保留列间距和两侧输入框对齐。 */
.device-scope-modal__configuration :deep(.ant-row) { margin-inline: 0 !important; }
.device-scope-modal__configuration :deep(.ant-row > .ant-col:first-child) { padding-left: 0 !important; }
.device-scope-modal__configuration :deep(.ant-row > .ant-col:last-child) { padding-right: 0 !important; }
.device-scope-modal__configuration > :deep(.cloud-empty) { margin: auto; }
.device-scope-modal__configuration-content { display: flex; flex: 1; flex-direction: column; gap: 12px; min-width: 0; min-height: 0; }
.device-scope-modal__preview { flex: none; margin-top: auto; }
.device-scope-modal__scope-error { flex: none; margin: 0; color: var(--jet-theme-error, #ff4d4f); font-size: 12px; }
.device-scope-modal__scope-overview { display: grid; place-content: center; gap: 8px; flex: 1; padding: 24px; color: var(--jet-theme-text-secondary, #595959); text-align: center; font-size: 14px; }
.device-scope-modal__scope-overview :deep(.anticon) { justify-self: center; color: var(--jet-theme-primary, #1677ff); font-size: 20px; }
.device-scope-modal__scope-overview strong { color: var(--jet-theme-text, #1d2129); }
.device-scope-modal__footer { display: flex; flex: none; justify-content: flex-end; gap: 8px; padding-top: 16px; }
.device-scope-modal__layout.device-scope-modal__layout--bottom { grid-template-columns: 15.5rem minmax(0, 1fr); grid-template-areas: 'ranges ranges' 'navigation devices'; grid-template-rows: auto minmax(0, 1fr); }
.device-scope-modal__layout.device-scope-modal__layout--bottom.device-scope-modal__layout--scope { grid-template-columns: minmax(0, 1fr); grid-template-areas: 'ranges' 'navigation'; }
.device-scope-modal__bottom-preview { flex: none; max-height: 9rem; margin-top: 16px; overflow-x: hidden; overflow-y: auto; }
.device-scope-modal__layout--detailed:not(.device-scope-modal__layout--bottom) { grid-template-columns: 13.5rem minmax(0, 1fr) 27.5rem; }
.device-scope-modal__layout--detailed.device-scope-modal__layout--scope:not(.device-scope-modal__layout--bottom) { grid-template-columns: minmax(20rem, 1fr) 27.5rem; }
.device-scope-modal__layout--detailed .device-scope-modal__preview { margin-top: 4px; }
@media (max-width: 900px) {
  .device-scope-modal__layout.device-scope-modal__layout--detailed:not(.device-scope-modal__layout--bottom) { grid-template-columns: 11rem minmax(0, 1fr); grid-template-areas: 'ranges ranges' 'navigation devices' 'config config' 'selection selection'; grid-template-rows: auto minmax(8rem, 1fr) auto minmax(8rem, 1fr); }
  .device-scope-modal__layout.device-scope-modal__layout--detailed.device-scope-modal__layout--scope:not(.device-scope-modal__layout--bottom) { grid-template-columns: 1fr; grid-template-areas: 'ranges' 'navigation' 'config' 'selection'; }
  .device-scope-modal__configuration-title { border-top: 1px solid var(--jet-theme-border-color-1, #eceff3); border-left: 0; }
  .device-scope-modal__scope-mode { order: 3; width: 100%; }
  .device-scope-modal__layout { grid-template-columns: 11rem minmax(0, 1fr); grid-template-rows: minmax(8rem, 1fr) minmax(8rem, 1fr); }
  .device-scope-modal__layout--scope { grid-template-columns: 1fr; }
  .device-scope-modal__selection { grid-column: 1 / -1; border-top: 1px solid var(--jet-theme-border-color-1, #eceff3); border-left: 0; }
}
</style>
