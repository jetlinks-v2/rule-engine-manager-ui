<template>
  <component :is="embedded ? 'div' : 'a-modal'" v-bind="dialogProps" :class="{ 'device-scope-modal__embedded': embedded }" @cancel="!embedded && $emit('cancel')">
    <header v-if="detailed" class="device-scope-modal__toolbar">
      <div class="device-scope-modal__product-summary">
        <strong>{{ draft.productName || productFilter || $t('IotSceneLinkage.form.product') }}</strong>
        <small>{{ $t('IotSceneLinkage.detail.selectedProduct') }}</small>
      </div>
      <a-radio-group v-model:value="scopeMode" class="device-scope-modal__scope-mode" button-style="solid">
        <a-radio-button v-for="item in availableScopeModes" :key="item.value" :value="item.value"><AIcon :type="item.icon" />{{ item.label }}</a-radio-button>
      </a-radio-group>
      <slot name="toolbar-actions" />
    </header>
    <div :class="['device-scope-modal__layout', { 'device-scope-modal__layout--scope': scopeMode !== 'fixed' }]">
      <aside class="device-scope-modal__navigation">
        <slot v-if="scopeMode === 'tag'" name="scope-editor" :value="selectedScopeValues" :update="updateScopeValues" :invalid="scopeError" />
        <template v-else-if="scopeMode !== 'all'">
          <DeviceScopeTree
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
      <section v-if="scopeMode === 'fixed'" class="device-scope-modal__content">
        <div class="device-scope-modal__filters">
          <a-input-search v-model:value="keyword" :placeholder="$t('IotSceneLinkage.placeholder.searchDevice')" :loading="deviceLoading" @search="searchDevices" />
          <IotAlarmTargetSelect v-if="!lockProduct" v-model="productFilter" class="device-scope-modal__product-filter" :request="requestProducts" :placeholder="$t('IotSceneLinkage.placeholder.product')" @change="changeProductFilter" />
        </div>
        <div class="device-scope-modal__device-list-head">
          <span>{{ $t('IotSceneLinkage.form.device') }}</span><span>{{ $t('IotSceneLinkage.form.product') }}</span><span>{{ $t('IotSceneLinkage.device.status') }}</span>
        </div>
        <a-spin :spinning="deviceLoading" class="device-scope-modal__device-loading">
          <div v-if="deviceOptions.length" class="device-scope-modal__device-list">
            <button v-for="device in deviceOptions" :key="device.id" type="button" :class="['device-scope-modal__device-row', { 'is-selected': isDeviceSelected(device.id) }]" @click="selectDevice(device)">
              <span :title="device.name">{{ device.name }}</span><span :title="device.productName">{{ device.productName }}</span><j-badge-status :text="device.statusText" :status="device.status" />
            </button>
          </div>
          <CloudEmpty v-else-if="!deviceLoading" :description="$t('IotSceneLinkage.scope.empty')" />
        </a-spin>
        <a-pagination v-if="total > pageSize" class="device-scope-modal__pagination" size="small" :current="pageIndex + 1" :page-size="pageSize" :total="total" show-less-items @change="changePage" />
      </section>
      <aside class="device-scope-modal__selection">
        <template v-if="hasSelection || scopeMode !== 'fixed' || detailed">
          <div v-if="hasSelection && !detailed" class="device-scope-modal__selected-device"><strong>{{ selectionTitle }}</strong><span>{{ selectionDescription }}</span></div>
          <slot name="configuration" :selected-device="selectedDevice" :selected-devices="selectedDevices" :has-selection="hasSelection" :scope="scopeMode" />
          <div v-if="hasSelection" class="device-scope-modal__preview"><slot name="preview" :selected-device="selectedDevice" :selected-devices="selectedDevices" :scope="scopeMode" /></div>
        </template>
        <CloudEmpty v-else :description="selectionHint" />
      </aside>
    </div>
    <div class="device-scope-modal__footer"><a-button @click="$emit('cancel')">{{ $t('IotSceneLinkage.action.cancel') }}</a-button><a-button type="primary" :disabled="scopeMode === 'fixed' && !hasSelection" @click="save">{{ $t('IotSceneLinkage.action.confirm') }}</a-button></div>
  </component>
</template>
<script setup lang="ts">
import { type PropType } from 'vue'
import DeviceScopeTree from './DeviceScopeTree.vue'
import { useDeviceScopeModal } from '../detail/useDeviceScopeModal'
import type { DeviceScope, DeviceOption, ScopeMode } from '../deviceScopeTree'
export type { DeviceScope } from '../deviceScopeTree'
import IotAlarmTargetSelect from '../alarm/IotAlarmTargetSelect.vue'
const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  width: { type: Number, default: 1180 },
  embedded: { type: Boolean, default: false },
  detailed: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  lockProduct: { type: Boolean, default: false },
  scopeModes: { type: Array as PropType<ScopeMode[]>, default: () => ['fixed', 'all', 'space', 'device-group', 'org'] },
  productId: { type: String, default: '' },
  modelValue: { type: Object as PropType<DeviceScope>, required: true },
  validate: { type: Function as PropType<(device: DeviceOption, scope?: DeviceScope) => boolean | Promise<boolean>>, default: undefined },
})
const emit = defineEmits<{ (event: 'cancel'): void; (event: 'save', value: DeviceScope): void; (event: 'select-device', value: DeviceOption): void; (event: 'select-devices', value: DeviceOption[]): void }>()
const { dialogProps, scopeMode, draft, productFilter, availableScopeModes, scopeModeLabel, scopeModeHint,
  navigationNodes, scopeCounts, countsLoading, countsError, refreshCounts,
  treeError, reloadTrees, selectedSpaceId, scopeError, scopeLoading, selectedScopeValues, selectionHint, selectSpace, selectScopedValues,
  keyword, deviceLoading, searchDevices, requestProducts, changeProductFilter, deviceOptions, isDeviceSelected, selectDevice,
  total, pageSize, pageIndex, changePage, hasSelection, selectionTitle, selectionDescription, selectedDevice, selectedDevices, save,
} = useDeviceScopeModal(props, emit)
/** 自定义范围编辑器直接更新同一份选择草稿，确认时仍由资源壳统一提交。 */
function updateScopeValues(values: DeviceScope['selectorValues']) { selectedScopeValues.value = values }
</script>

<style scoped>
.device-scope-modal__toolbar { display: flex; gap: var(--space-3, 12px); align-items: center; min-height: 52px; padding: var(--space-3, 12px) var(--space-4, 16px); margin-bottom: var(--space-3, 12px); background: var(--ant-color-fill-quaternary); border: 1px solid var(--ant-color-border-secondary); border-radius: var(--radius-jet-sm, 8px); }.device-scope-modal__product-summary { display: grid; flex: 1; gap: 2px; min-width: 0; }.device-scope-modal__product-summary strong, .device-scope-modal__product-summary small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.device-scope-modal__product-summary small { color: var(--ant-color-text-tertiary); font-size: 12px; }.device-scope-modal__layout { display: grid; grid-template-columns: 16rem minmax(22rem, 1fr) 23rem; min-height: 34rem; border: 1px solid var(--ant-color-border-secondary); border-radius: var(--radius-jet-sm, 8px); }.device-scope-modal__layout--scope { grid-template-columns: minmax(20rem, 1fr) 23rem; }
.device-scope-modal__navigation, .device-scope-modal__selection { display: flex; flex-direction: column; gap: var(--space-2, 8px); padding: var(--space-3, 12px); background: var(--ant-color-fill-quaternary); }.device-scope-modal__navigation { border-right: 1px solid var(--ant-color-border-secondary); }.device-scope-modal__selection { border-left: 1px solid var(--ant-color-border-secondary); }
.device-scope-modal__embedded { display: block; }.device-scope-modal__embedded .device-scope-modal__layout { min-height: 31rem; }.device-scope-modal__scope-mode { display: flex; flex-wrap: wrap; gap: 4px; }.device-scope-modal__scope-mode :deep(.ant-radio-button-wrapper) { display: inline-flex; gap: 4px; align-items: center; justify-content: center; height: 30px; padding: 0 8px; font-size: 12px; border-radius: 4px; }.device-scope-modal__scope-mode :deep(.ant-radio-button-wrapper)::before { display: none; }
.device-scope-modal__scope-error { margin: 0; padding: 6px 8px 0; color: var(--ant-color-error); font-size: 12px; }.device-scope-modal__scope-overview { display: grid; place-content: center; gap: 8px; flex: 1; padding: 24px; color: var(--ant-color-text-secondary); text-align: center; font-size: 13px; }.device-scope-modal__scope-overview :deep(.anticon) { justify-self: center; color: var(--ant-color-primary); font-size: 20px; }.device-scope-modal__scope-overview strong { color: var(--ant-color-text); }.device-scope-modal__content { display: flex; flex-direction: column; min-width: 0; padding: var(--space-4, 16px); }.device-scope-modal__filters { display: grid; grid-template-columns: minmax(0, 1fr) 13rem; gap: var(--space-3, 12px); margin-bottom: 12px; }.device-scope-modal__device-list-head, .device-scope-modal__device-row { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) 5rem; gap: 12px; align-items: center; }.device-scope-modal__device-list-head { padding: 0 12px 8px; color: var(--ant-color-text-secondary); font-size: 12px; }.device-scope-modal__device-loading { min-height: 0; flex: 1; }.device-scope-modal__device-list { overflow: auto; border: 1px solid var(--ant-color-border-secondary); border-radius: 6px; }.device-scope-modal__device-row { width: 100%; min-height: 50px; padding: 0 12px; color: var(--ant-color-text); text-align: left; background: var(--ant-color-bg-container); border: 0; border-bottom: 1px solid var(--ant-color-border-secondary); cursor: pointer; }.device-scope-modal__device-row:last-child { border-bottom: 0; }.device-scope-modal__device-row:hover, .device-scope-modal__device-row.is-selected { background: var(--ant-color-primary-bg); }.device-scope-modal__device-row.is-selected { position: relative; z-index: 1; box-shadow: inset 0 0 0 1px var(--ant-color-primary); }.device-scope-modal__device-row > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.device-scope-modal__pagination { display: flex; justify-content: flex-end; margin-top: 12px; }.device-scope-modal__selected-device { display: grid; gap: 4px; padding-bottom: 12px; border-bottom: 1px solid var(--ant-color-border-secondary); }.device-scope-modal__selected-device span { color: var(--ant-color-text-secondary); font-size: 12px; }.device-scope-modal__preview { margin-top: auto; padding-top: 12px; color: var(--ant-color-text-secondary); border-top: 1px solid var(--ant-color-border-secondary); font-size: 12px; line-height: 20px; }.device-scope-modal__footer { display: flex; justify-content: flex-end; gap: 8px; padding-top: 16px; }
@media (max-width: 900px) { .device-scope-modal__toolbar { align-items: flex-start; flex-wrap: wrap; }.device-scope-modal__scope-mode { order: 3; width: 100%; }.device-scope-modal__layout { grid-template-columns: 11rem minmax(0, 1fr); }.device-scope-modal__selection { grid-column: 1 / -1; min-height: 12rem; border-top: 1px solid var(--ant-color-border-secondary); border-left: 0; }.device-scope-modal__filters { grid-template-columns: 1fr; } }
</style>
