<template>
  <section class="detailed-device-action-scope">
    <header>
      <div><strong>{{ $t('IotSceneLinkage.detail.deviceActionScope') }}</strong><small>{{ $t('IotSceneLinkage.detail.deviceActionScopeHint') }}</small></div>

    </header>
    <DeviceScopeModal
      embedded
      detailed
      multiple
      lock-product
      :open="true"
      :scope-modes="['fixed', 'space', 'device-group', 'tag']"
      :product-id="productDetail.id || values.productId"
      :model-value="scopeDraft"
      :validate="validateScope"
      @cancel="$emit('cancel')"
      @select-devices="syncSelectedDevices"
      @save="saveScope"
    >
      <template #scope-editor="{ value, update, invalid }">
        <div :class="['detailed-device-action-scope__tags', { 'is-invalid': invalid || tagInvalid }]">
          <Tag :value="value" :tag-data="tags" @update:value="update" @change="changeTags" />
          <p v-if="invalid || tagInvalid">{{ $t('device.index.9667835-4') }}</p>
        </div>
      </template>
      <template #configuration>
        <Action
          ref="actionRef"
          compact
          :name="name"
          :branches-name="branchesName"
          :then-name="thenName"
          :values="actionValues"
          :product-detail="productDetail"
          :column-map="columnMap"
          @change="changeAction"
        />
      </template>
      <template #toolbar-actions>
        <a-button type="link" @click="$emit('change-product')">{{ $t('IotSceneLinkage.action.changeProduct') }}</a-button>
      </template>
      <template #preview><span>{{ $t('IotSceneLinkage.detail.deviceActionPreview') }}</span></template>
    </DeviceScopeModal>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import Tag from './device/Tag.vue'
import DeviceScopeModal, { type DeviceScope } from '../../../../SceneLinkage/editor/components/DeviceScopeModal.vue'
import Action from './actions/index.vue'

const props = defineProps({
  values: { type: Object, default: () => ({}) },
  productDetail: { type: Object, default: () => ({}) },
  name: { type: Number, default: 0 },
  thenName: { type: Number, default: 0 },
  branchesName: { type: Number, default: 0 },
  columnMap: { type: Object, default: () => ({}) },
})
const emit = defineEmits<{
  (event: 'save', value: { scope: DeviceScope; action: any; actionOptions: Record<string, any>; optionColumns: string[]; columnMap: Record<string, string> }): void
  (event: 'change-product'): void
  (event: 'cancel'): void
}>()

const actionRef = ref<{ onFormSave: () => Promise<any>; getColumnMap: () => Record<string, string> }>()
const scopeDraft = reactive<DeviceScope>({ selector: 'fixed', selectorValues: [] })
const actionValues = reactive<Record<string, any>>({})
const actionOptions = ref<Record<string, any>>({})
const optionColumns = ref<string[]>([])
const tagInvalid = ref(false)
const tags = computed(() => {
  const metadata = props.productDetail.metadata
  return (typeof metadata === 'string' ? JSON.parse(metadata || '{}') : metadata || {}).tags || []
})
const pendingAction = ref<any>()
const pendingColumnMap = ref<Record<string, string>>({})

function syncValues() {
  Object.assign(scopeDraft, {
    selector: props.values.selector || 'fixed',
    selectorValues: props.values.selectorValues || [],
    productId: props.values.productId || props.productDetail.id,
    productName: props.productDetail.name,
    options: props.values.options || {},
  })
  Object.assign(actionValues, props.values)
}

function syncSelectedDevices(devices: Array<{ id: string; name: string }>) {
  scopeDraft.selector = 'fixed'
  scopeDraft.selectorValues = devices.map(device => ({ value: device.id, name: device.name }))
  actionValues.selector = 'fixed'
  actionValues.selectorValues = scopeDraft.selectorValues
}

function changeAction(options?: Record<string, any>, columns: string[] = []) {
  actionOptions.value = { ...actionOptions.value, ...options }
  optionColumns.value = columns
}

/** 标签仍保留原版 selectorValues 的嵌套条件结构，只复用其编辑器。 */
function changeTags(_value: unknown, values: Array<{ name?: string; value?: unknown }>) {
  actionOptions.value.tagName = values.map(item => `${item.name || ''}=${item.value ?? ''}`).join('、')
  tagInvalid.value = false
}

/** 资源壳只校验范围；指令与参数的完整性仍由原版动作组件负责。 */
async function validateScope(_device?: unknown, scope?: DeviceScope) {
  try {
    const terms = scope?.selector === 'tag' ? scope.selectorValues[0]?.value : undefined
    tagInvalid.value = scope?.selector === 'tag' && (!Array.isArray(terms) || !terms.length || terms.some(term => !term.column || term.value === undefined || term.value === null || term.value === ''))
    if (tagInvalid.value) return false
    pendingAction.value = await actionRef.value?.onFormSave()
    pendingColumnMap.value = actionRef.value?.getColumnMap() || {}
    return Boolean(pendingAction.value)
  } catch {
    return false
  }
}

function saveScope(scope: DeviceScope) {
  if (!pendingAction.value) return
  emit('save', {
    scope,
    action: pendingAction.value,
    actionOptions: actionOptions.value,
    optionColumns: optionColumns.value,
    columnMap: pendingColumnMap.value,
  })
}

watch(() => props.values, syncValues, { immediate: true, deep: true })
</script>

<style scoped>
.detailed-device-action-scope { display: grid; gap: var(--space-3, 12px); }
.detailed-device-action-scope > header { display: flex; justify-content: space-between; gap: var(--space-3, 12px); align-items: center; }.detailed-device-action-scope > header > div { display: grid; gap: 4px; }.detailed-device-action-scope strong { color: var(--ant-color-text); }.detailed-device-action-scope small { color: var(--ant-color-text-tertiary); font-size: 12px; }
.detailed-device-action-scope :deep(.device-scope-modal__selection) { min-width: 20rem; }.detailed-device-action-scope :deep(.device-scope-modal__layout) { min-height: 32rem; }
</style>

<style scoped>
.detailed-device-action-scope__tags { padding: 12px; border: 1px solid transparent; border-radius: 6px; }
.detailed-device-action-scope__tags.is-invalid { border-color: var(--jet-theme-error, #ff4d4f); }
.detailed-device-action-scope__tags p { color: var(--jet-theme-error, #ff4d4f); }
</style>
