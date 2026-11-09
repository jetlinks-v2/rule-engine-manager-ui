<template>
  <a-modal
    :title="$t('Device.AddModal.3725211-0')"
    open
    :width="1240"
    :footer="null"
    @cancel='cancel'
    :maskClosable="false"
  >
    <section v-if="!selectingScope" class="detailed-device-trigger-modal__product">
      <header><strong>{{ $t('Device.AddModal.3725211-1') }}</strong><small>{{ $t('IotSceneLinkage.detail.productFirstHint') }}</small></header>
      <div class="detailed-device-trigger-modal__product-content">
        <Product
          v-model:rowKey='addModel.productId'
          v-model:detail='addModel.productDetail'
          @change='productChange'
        />
      </div>
      <footer><a-button @click="cancel">{{ $t('Device.AddModal.3725211-4') }}</a-button><a-button type="primary" :loading="productDetailLoading" @click="openScope">{{ $t('IotSceneLinkage.action.next') }}</a-button></footer>
    </section>
    <section v-else class="detailed-device-trigger-modal__scope">
      <DeviceScopeModal
        embedded
        detailed
        multiple
        lock-product
        :open="selectingScope"
        :product-id="addModel.productId"
        :model-value="scopeValue"
        :validate="validateScope"
        @cancel="cancel"
        @select-devices="handleSelectedDevices"
        @save="saveScope"
      >
        <template #toolbar-actions><a-button type="link" @click="selectingScope = false">{{ $t('IotSceneLinkage.action.changeProduct') }}</a-button></template>
        <template #configuration>
          <Type ref="typeRef" :metadata="addModel.metadata" :operator="addModel.operator" :options="optionsCache" />
        </template>
        <template #preview><span>{{ $t('IotSceneLinkage.detail.deviceTriggerPreview') }}</span></template>
      </DeviceScopeModal>
    </section>
  </a-modal>
</template>

<script setup lang='ts' name='AddModel'>
import type { PropType } from 'vue'
import type { metadataType , TriggerDevice, TriggerDeviceOptions, SelectorValuesItem } from '../../typings'
import { onlyMessage } from '@jetlinks-web/utils'
import { detail as deviceDetail } from '../../../../api/others'
import { getProduct } from '../../../../api/scene-linkage'
import Product from './Product.vue'
import Type from './Type.vue'
import DeviceScopeModal, { type DeviceScope } from '../../../SceneLinkage/editor/components/DeviceScopeModal.vue'
import { handleTimerOptions } from '../components/Timer/util'
import { Form } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()
type Emit = {
  (e: 'cancel'): void
  (e: 'change', data: TriggerDevice): void
  (e: 'save', data: TriggerDevice, options: Record<string, any>): void
}


interface AddModelType extends Omit<TriggerDevice, 'selectorValues'> {
  deviceKeys: SelectorValuesItem[]
  orgId: SelectorValuesItem[]
  productDetail: any
  selectorValues: SelectorValuesItem[]
  metadata: metadataType,
  operator: TriggerDeviceOptions
}
const formItemContext = Form.useInjectFormItemContext();

const emit = defineEmits<Emit>()
const typeRef = ref()

const props = defineProps({
  value: {
    type: Object as PropType<TriggerDevice>,
    default: () => ({
      productId: '',
      selector: 'fixed',
      selectorValues: [],
    })
  },
  options: {
    type: Object as PropType<Record<string, any>>,
    default: () => ({})
  }
})

const addModel = reactive<AddModelType>({
  productId: props.value.productId || '',
  selector: props.value.selector || 'fixed',
  selectorValues: props.value.selectorValues || [],
  deviceKeys: props.value.selectorValues || [],
  orgId: props.value.selectorValues || [],
  productDetail: {},
  metadata: {},
  operator: props.value.operation || {
    operator: 'online'
  }
})

const optionsCache = ref(props.options)
// 编辑已有设备触发器时直接回到设备列表；只有新建或主动更换产品才进入产品选择。
const selectingScope = ref(Boolean(props.value.productId))
const productDetailLoading = ref(false)
let productDetailTask: Promise<void> | undefined
const scopeValidation = ref<any>()
const scopeValue = computed<DeviceScope>(() => ({
  selector: addModel.selector as DeviceScope['selector'],
  selectorValues: addModel.selectorValues.map(item => ({ value: String(item.value), name: item.name })),
  productId: addModel.productId,
  productName: addModel.productDetail?.name,
}))

const handleOptions = (data: TriggerDeviceOptions) => {
  const typeIconMap: Record<string, string> = {
    writeProperty: 'icon-bianji1',
    invokeFunction: 'icon-widgets',
    reportEvent: 'icon-shijian',
    readProperty: 'icon-Group',
  };

  const _options: any = {
    name: '', // 名称
    extraName: '', // 拓展参数
    onlyName: false,
    type: '', // 触发类型
    typeIcon: typeIconMap[data.operator],
    productName: '',
    selectorIcon: '',
    time: undefined,
    when: undefined,
    extraTime: undefined,
    action: optionsCache.value?.action,
  };

  if (addModel.selector === 'fixed') {
    let isLimit = false;
    let indexOf = 0;
    const nameStr = addModel.selectorValues!.reduce((_prev, next, index) => {
      if (_prev.length <= 30) {
        indexOf = index;
        return index === 0 ? next.name : _prev + '、' + next.name;
      } else {
        isLimit = true;
      }
      return _prev;
    }, '');
    // _options.name = TriggerDeviceModel.selectorValues?.map((item) => item.name).join('、');
    _options.name = nameStr;
    if (isLimit && addModel.selectorValues!.length > indexOf) {
      _options.extraName = $t('Device.AddModal.3725211-8', [addModel.selectorValues!.length]);
    }
    _options.selectorIcon = 'icon-shebei1';
  } else if (addModel.selector === 'org') {
    _options.name = addModel.selectorValues?.[0].name + $t('Device.AddModal.3725211-9');
    _options.productName = addModel.productDetail.name; // 产品名称
    _options.selectorIcon = 'icon-zuzhi';
  } else {
    _options.name = $t('Device.AddModal.3725211-10') + addModel.productDetail.name;
  }

  if (data.timer) {
    const _timer = data.timer;
    const { time, extraTime, when } = handleTimerOptions(_timer)
    _options.when = when;
    _options.time = time;
    _options.extraTime = extraTime;
  }

  if (data.operator === 'online') {
    _options.type = $t('Device.AddModal.3725211-11');
    _options.action = '';
    _options.typeIcon = 'icon-a-Group4713';
  }

  if (data.operator === 'offline') {
    _options.type = $t('Device.AddModal.3725211-12');
    _options.action = '';
    _options.typeIcon = 'icon-a-Group4892';
  }

  if (data.operator === 'reportProperty') {
    _options.type = $t('Device.AddModal.3725211-13');
    _options.action = '';
    _options.typeIcon = 'icon-file-upload-outline';
  }
  return _options;
}

const cancel = () => {
  emit("cancel")
}

const handleMetadata = (metadata?: string) => {
  try {
    addModel.metadata = JSON.parse(metadata || "{}")
  } catch (e) {
    console.warn('handleMetadata: ' + e)
  }
}

/** 复用设备管理的产品卡片展示字段，同时补查规则编辑需要的完整物模型。 */
const productChange = (product: { id: string }) => {
  addModel.productDetail = product
  addModel.deviceKeys = []
  addModel.orgId = []
  addModel.selector = 'fixed'
  addModel.operator = {
    operator: 'online'
  }
  addModel.selectorValues = []
  productDetailLoading.value = true
  productDetailTask = (async () => {
    try {
      const response: any = await getProduct(product.id)
      // 切换卡片时忽略旧请求，避免把上一产品的物模型带入当前范围选择。
      if (addModel.productId !== product.id) return
      addModel.productDetail = { ...product, ...(response?.result || response || {}) }
    } catch {
      // 产品卡片字段仍可完成范围选择；仅物模型配置会在后续校验中提示补齐。
    } finally {
      if (addModel.productId === product.id) {
        handleMetadata(addModel.productDetail?.metadata)
        productDetailLoading.value = false
      }
    }
  })()
  return productDetailTask
}

async function openScope() {
  if (!addModel.productId) {
    onlyMessage($t('Device.AddModal.3725211-14'), 'error')
    return
  }
  await productDetailTask
  handleMetadata(addModel.productDetail?.metadata)
  selectingScope.value = true
}

async function handleSelectedDevices(devices: Array<{ id: string }>) {
  if (devices.length !== 1) {
    handleMetadata(addModel.productDetail?.metadata)
    return
  }
  handleMetadata(await getDeviceDetailByMetadata(devices[0].id))
}

/** 保存前由右侧触发规则表单校验；范围本身由 DeviceScopeModal 校验并原样保存。 */
async function validateScope() {
  const result = await typeRef.value?.vail()
  if (!result) return false
  scopeValidation.value = result
  return true
}

function saveScope(scope: DeviceScope) {
  const typeData = scopeValidation.value
  if (!typeData) return
  Object.assign(addModel, { selector: scope.selector, selectorValues: scope.selectorValues.map(item => ({ value: item.value, name: item.name || item.value })) })
  optionsCache.value.action = typeData.action
  const operation = typeData.data
  const options = handleOptions(operation)
  emit('save', {
    operation,
    selector: scope.selector,
    selectorValues: addModel.selectorValues,
    productId: scope.productId || addModel.productId,
    source: 'fixed',
  } as TriggerDevice, options)
  formItemContext.onFieldChange()
}

const getDeviceDetailByMetadata = async (deviceId: string) => {
  const resp = await deviceDetail(deviceId)
  return resp.result?.metadata
}

async function hydrateSelectedProduct() {
  if (!addModel.productId) return
  const productId = addModel.productId
  productDetailLoading.value = true
  try {
    const response: any = await getProduct(productId)
    if (addModel.productId !== productId) return
    addModel.productDetail = { ...addModel.productDetail, ...(response?.result || response || {}) }
    handleMetadata(addModel.productDetail?.metadata)
  } finally {
    if (addModel.productId === productId) productDetailLoading.value = false
  }
}

const initQuery = async () => {
  await hydrateSelectedProduct()
  if (props.value.selector === 'fixed' && props.value.selectorValues?.length) {
    handleMetadata(await getDeviceDetailByMetadata(props.value.selectorValues[0].value))
  }
}

nextTick(() => {
  initQuery()
})

</script>

<style scoped>
.detailed-device-trigger-modal__product, .detailed-device-trigger-modal__scope { display: grid; gap: var(--space-4, 16px); min-height: 0; }.detailed-device-trigger-modal__product > header, .detailed-device-trigger-modal__scope-header { display: flex; justify-content: space-between; gap: var(--space-3, 12px); align-items: center; }.detailed-device-trigger-modal__product > header > *, .detailed-device-trigger-modal__scope-header > div { display: grid; gap: 4px; }.detailed-device-trigger-modal__product header strong, .detailed-device-trigger-modal__scope-header strong { color: var(--ant-color-text); }.detailed-device-trigger-modal__product header small, .detailed-device-trigger-modal__scope-header small { color: var(--ant-color-text-tertiary); font-size: 12px; }.detailed-device-trigger-modal__product-content { min-height: 0; overflow: auto; }.detailed-device-trigger-modal__product > footer { display: flex; justify-content: flex-end; gap: var(--space-2, 8px); padding-top: var(--space-3, 12px); border-top: 1px solid var(--ant-color-border-secondary); }.detailed-device-trigger-modal__scope :deep(.device-scope-modal__selection) { min-width: 19rem; }.detailed-device-trigger-modal__scope :deep(.type) { margin-top: 0; }
</style>
