<template>
  <section class="detailed-device-action-scope">
    <header>
      <div><strong>{{ $t('IotSceneLinkage.detail.deviceActionScope') }}</strong><small>{{ $t('IotSceneLinkage.detail.deviceActionScopeHint') }}</small></div>
      <a-button type="link" @click="$emit('advanced')">{{ $t('IotSceneLinkage.detail.useAdvancedDeviceScope') }}</a-button>
    </header>
    <DeviceScopeModal
      embedded
      detailed
      multiple
      lock-product
      :open="true"
      :product-id="productDetail.id || values.productId"
      :model-value="scopeDraft"
      :validate="validateScope"
      @cancel="$emit('cancel')"
      @select-devices="syncSelectedDevices"
      @save="saveScope"
    >
      <template #configuration>
        <Action
          ref="actionRef"
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
import { reactive, ref, watch } from 'vue'
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
  (event: 'advanced'): void
  (event: 'change-product'): void
  (event: 'cancel'): void
}>()

const actionRef = ref<{ onFormSave: () => Promise<any>; getColumnMap: () => Record<string, string> }>()
const scopeDraft = reactive<DeviceScope>({ selector: 'fixed', selectorValues: [] })
const actionValues = reactive<Record<string, any>>({})
const actionOptions = ref<Record<string, any>>({})
const optionColumns = ref<string[]>([])
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
  actionOptions.value = options || {}
  optionColumns.value = columns
}

/** 资源壳只校验范围；指令与参数的完整性仍由原版动作组件负责。 */
async function validateScope() {
  try {
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
