<template>
  <DeviceScopeModal embedded detailed multiple lock-product :open="true"
    :product-id="productDetail.id || scope.productId" :model-value="scope"
    :scope-modes="['fixed', 'space', 'device-group', 'tag', 'context', 'relation']"
    :disabled-scope-modes="disabledModes" :validate="validateScope"
    @cancel="$emit('cancel')" @save="saveScope" @select-devices="$emit('select-devices', $event)">
    <template #scope-editor="{ mode, value, update, invalid }">
      <div :class="['device-action-scope__editor', { 'is-invalid': invalid || (mode === 'tag' && tagInvalid) }]">
        <template v-if="mode === 'context'">
          <strong>{{ $t('device.index.9667835-5') }}</strong>
          <a-tree-select :value="value[0]?.value" :tree-data="variables" :loading="loading" style="width: 100%"
            :field-names="{ label: 'name', value: 'id' }" tree-default-expand-all show-search tree-node-filter-prop="name"
            :placeholder="$t('device.index.9667835-7')"
            @select="(key, node) => update([{ value: key, name: node.fullName || node.description || node.name }])">
            <template #title="{ name, children }"><span :class="{ 'device-action-scope__group': children?.length }">{{ name }}</span></template>
          </a-tree-select>
        </template>
        <template v-else-if="mode === 'relation'">
          <strong>{{ $t('device.index.9667835-2') }}</strong>
          <RelationSelect :value="value" @change="(values, option) => update(values.map(item => ({ ...item, name: option.label })))" />
        </template>
        <Tag v-else :value="value" :tag-data="tags" @update:value="update" @change="changeTags" />
        <p v-if="invalid || (mode === 'tag' && tagInvalid)">{{ $t(mode === 'context' ? 'device.index.9667835-6' : mode === 'relation' ? 'device.index.9667835-3' : 'device.index.9667835-4') }}</p>
      </div>
    </template>
    <template #toolbar-actions><a-button type="link" @click="$emit('change-product')">{{ $t('IotSceneLinkage.action.changeProduct') }}</a-button></template>
    <template #configuration="configuration"><slot name="configuration" v-bind="configuration" /></template>
    <template #preview><slot name="preview" /></template>
  </DeviceScopeModal>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import DeviceScopeModal, { type DeviceScope } from '../../../../SceneLinkage/editor/components/DeviceScopeModal.vue'
import type { DeviceOption } from '../../../../SceneLinkage/editor/deviceScopeTree'
import Tag from './device/Tag.vue'
import RelationSelect from './device/RelationSelect.vue'
import { useDeviceActionScope } from './useDeviceActionScope'
const props = defineProps<{
  scope: DeviceScope
  productDetail: { id?: string; metadata?: string | { tags?: unknown[] } }
  name: number
  thenName: number
  validate?: (device: DeviceOption, scope?: DeviceScope) => boolean | Promise<boolean>
}>()
const emit = defineEmits<{
  (event: 'save', scope: DeviceScope): void
  (event: 'cancel'): void
  (event: 'change-product'): void
  (event: 'select-devices', devices: DeviceOption[]): void
}>()
const { variables, loading, disabledModes } = useDeviceActionScope(props)
const tagInvalid = ref(false)
const tagName = ref(props.scope.options?.tagName || '')
/** 标签名称仅用于回显，运行配置仍保留 selectorValues 中的原生条件。 */
function changeTags(_value: unknown, values: Array<{ name?: string; value?: unknown }>) {
  tagName.value = values.map(item => `${item.name || ''}=${item.value ?? ''}`).join('、')
  tagInvalid.value = false
}
function saveScope(scope: DeviceScope) {
  const selector = scope.selector
  // 资源壳只编辑范围草稿；在动作边界转换为旧版运行配置，避免把来源规则写进通用资源组件。
  emit('save', {
    ...scope,
    selectorValues: selector === 'context' ? [] : scope.selectorValues,
    source: ['context', 'relation'].includes(selector) ? 'upper' : 'fixed',
    upperKey: selector === 'context' ? String(scope.selectorValues[0]?.value || '') : selector === 'relation' ? 'scene.deviceId' : '',
    options: { ...scope.options, tagName: selector === 'tag' ? tagName.value : undefined },
  })
}
const tags = computed(() => {
  const metadata = props.productDetail.metadata
  return (typeof metadata === 'string' ? JSON.parse(metadata || '{}') : metadata || {}).tags || []
})
/** 标签使用原生嵌套条件；两种动作共享范围校验，右侧业务参数由各自表单校验。 */
async function validateScope(device: DeviceOption, scope?: DeviceScope) {
  const terms = scope?.selector === 'tag' ? scope.selectorValues[0]?.value : undefined
  tagInvalid.value = scope?.selector === 'tag' && (!Array.isArray(terms) || !terms.length || terms.some(term => !term.column || term.value === undefined || term.value === null || term.value === ''))
  if (tagInvalid.value) return false
  return props.validate ? props.validate(device, scope) : true
}
</script>
<style scoped>
.device-action-scope__editor { display: grid; gap: 12px; padding: 12px; border: 1px solid transparent; border-radius: 6px; }
.device-action-scope__editor.is-invalid { border-color: var(--ant-color-error); }
.device-action-scope__group { color: var(--ant-color-text); font-weight: 500; }
.device-action-scope__editor p { color: var(--ant-color-error); margin: 0; }
</style>
