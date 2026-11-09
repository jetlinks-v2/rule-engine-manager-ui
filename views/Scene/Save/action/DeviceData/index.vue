<template>
    <a-modal
        :title="$t('Device.index.9667820-0')"
        open
        :width="isDetailedEditor ? 1180 : 860"
        :footer="isDetailedEditor ? null : undefined"
        @cancel="onCancel"
        @ok="save"
        :maskClosable="false"
    >
        <a-steps v-if="!isDetailedEditor" :current="current" @change="stepChange">
            <a-step>
                <template #title>{{ $t('Device.index.9667820-1') }}</template>
            </a-step>
            <a-step>
                <template #title>{{ $t('Device.index.9667820-2') }}</template>
            </a-step>
        </a-steps>
        <a-divider v-if="!isDetailedEditor" style="margin-bottom: 10px" />
        <div class="steps-content">
            <section v-if="isDetailedEditor && current === 0" class="detailed-device-data__product">
                <Product v-model:rowKey="DeviceModel.productId" v-model:detail="productDetail" @change="onProductChange" />
                <footer><a-button @click="onCancel">{{ $t('IotSceneLinkage.action.cancel') }}</a-button><a-button type="primary" @click="saveClick">{{ $t('IotSceneLinkage.action.next') }}</a-button></footer>
            </section>
            <DeviceScopeModal
                v-else-if="isDetailedEditor" embedded detailed multiple lock-product :open="true"
                :product-id="DeviceModel.productId" :model-value="scopeDraft"
                :scope-modes="['fixed', 'space', 'device-group']" @save="saveResourceScope" @cancel="onCancel"
            >
                <template #toolbar-actions><a-button type="link" @click="current = 0">{{ $t('IotSceneLinkage.action.changeProduct') }}</a-button></template>
                <template #configuration><strong>{{ $t('IotSceneLinkage.detail.deviceInfoTitle') }}</strong><p>{{ $t('IotSceneLinkage.detail.deviceInfoDescription') }}</p></template>
            </DeviceScopeModal>
            <LegacyProduct
                v-else-if="current === 0"
                v-model:rowKey="DeviceModel.productId"
                v-model:detail="productDetail"
                @change="onProductChange"
            />
            <Device
                v-else-if="current === 1"
                :name="name"
                :parallel="parallel"
                :branchesName="branchesName"
                :thenName="thenName"
                :values="DeviceModel"
                :productDetail="productDetail"
                ref="deviceRef"
                @save="onDeviceSave"
            />
        </div>
        <template v-if="!isDetailedEditor" #footer>
            <div class="steps-action">
              <template v-if="current === 0">
                <a-button @click="onCancel">{{ $t('Device.index.9667820-3') }}</a-button>
                <a-button type="primary" @click="saveClick">{{ $t('Device.index.9667820-5') }}</a-button>
              </template>
              <template v-else>
                <a-button @click="prev">{{ $t('Device.index.9667820-4') }}</a-button>
                <a-button type="primary" @click="saveClick">{{ $t('Device.index.9667820-6') }}</a-button >
              </template>
            </div>
        </template>
    </a-modal>
</template>

<script lang="ts" setup name="ActionDeviceModal">
import type {DeviceModelDataType, DeviceOptionType} from './typings';
import Product from '../../Device/Product.vue';
import LegacyProduct from './Product.vue';
import DeviceScopeModal, { type DeviceScope } from '../../../../SceneLinkage/editor/components/DeviceScopeModal.vue'
import { getProduct } from '../../../../../api/scene-linkage'
import Device from './device/index.vue';
import { onlyMessage } from '@jetlinks-web/utils';
import { detail } from '@rule-engine-manager-ui/api/instance';
import { useSceneStore } from '@rule-engine-manager-ui/store/scene';
import { storeToRefs } from 'pinia';
import { isActionChange } from '../../util';
import { handleMetadata } from './util'
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()
const sceneStore = useSceneStore();
const { data } = storeToRefs(sceneStore);

type Emit = {
    (e: 'cancel'): void;
    (e: 'save', data: any, options: Record<string, any>): void;
};

const props = defineProps({
    value: {
        type: Object,
        default: () => {},
    },
    name: {
        type: Number,
        default: 0,
    },
    thenName: {
        type: Number,
        default: 0,
    },
    branchesName: {
        type: Number,
        default: 0,
    },
    parallel: {
        type: Boolean,
    },
    options: {
      type: Object,
      default: () => ({})
    }
});

const isDetailedEditor = inject('scene-editor-mode', 'legacy') === 'detail'
const current = ref<number>(0);
const deviceRef = ref<any>();
const productDetail = ref<any>({});
const activeProductId = ref(String(props.value?.productId || ''));

const DeviceModel = reactive<DeviceModelDataType>({
    productId: '',
    deviceId: '',
    selector: {
      selector: 'fixed',
      selectorValues: [],
      upperKey: '',
      source: 'fixed',
    },
    message: {
        messageType: 'INVOKE_FUNCTION',
    },
});

const DeviceOptions = ref<DeviceOptionType>({ ...props.options });
const scopeDraft = computed<DeviceScope>(() => ({
    selector: DeviceModel.selector.selector as DeviceScope['selector'],
    selectorValues: DeviceModel.selector.selectorValues || [],
    productId: DeviceModel.productId,
    productName: productDetail.value.name || props.options.productName,
}))
/** 设备信息读取沿用嵌套 selector 配置，只替换详细模式的选择承载。 */
function saveResourceScope(scope: DeviceScope) {
    DeviceModel.selector = { ...DeviceModel.selector, selector: scope.selector, selectorValues: scope.selectorValues, source: 'fixed', upperKey: '' } as typeof DeviceModel.selector
    Object.assign(DeviceOptions.value, { name: scope.selectorValues.map(item => item.name || item.value), productName: scope.productName })
    void onSave()
}

const emit = defineEmits<Emit>();

const onCancel = () => {
    emit('cancel');
};

const onSave = async () => {
    let metadata = productDetail.value.metadata || '{}';
    // 产品卡列表只含摘要，新建动作保存前补全物模型，避免动态范围读不到产品字段。
    if (isDetailedEditor && !productDetail.value.metadata) {
      const response: any = await getProduct(DeviceModel.productId);
      metadata = (response?.result || response)?.metadata || metadata;
    }
    if (DeviceModel.selector.selector === 'fixed' && DeviceModel.selector.selectorValues?.length === 1) {
      const resp = await detail(DeviceModel.selector.selectorValues[0].value);
      if (resp.success) {
        metadata = resp.result?.metadata || metadata
      }
    }

    const item: any = {
        selector: DeviceModel.selector,
        productId: DeviceModel.productId,
        configs: ['state', 'onlineTime', 'offlineTime', 'deviceName', 'productName'],
        ...handleMetadata(typeof metadata === 'string' ? JSON.parse(metadata) : metadata),
    };
    if (DeviceModel.selector.selector === 'relation') {
        item.selector.upperKey = 'scene.deviceId';
    }
    const _options: any = {
        triggerName: data.value.options?.trigger?.name || $t('Device.index.9667820-7'),
        ...DeviceOptions.value,
        selector: DeviceModel.selector.selector, //选择器标识
        otherColumns: [],
    };
    emit('save', item, JSON.parse(JSON.stringify(_options)));
};

const onProductChange = (_val: any, bol: boolean) => {
    // 产品选择器先更新 v-model，独立保存旧 ID 才能识别更换产品并清空旧设备范围。
    if (!bol && activeProductId.value && activeProductId.value !== _val.id) {
      DeviceModel.selector = {
        selectorValues: undefined,
        selector: 'fixed',
        upperKey: '',
        source: 'fixed'
      }
        DeviceModel.deviceId = ''
        const flag = isActionChange(
            typeof _val.metadata === 'string' ? JSON.parse(_val.metadata || '{}') : _val.metadata || {},
            DeviceModel?.message,
        );
        if (!flag) {
            DeviceModel.message = {
                messageType: 'INVOKE_FUNCTION',
            };
        }
    }
    productDetail.value = _val;
    activeProductId.value = String(_val.id || '');
    DeviceOptions.value.productName = _val?.name;
};

const onDeviceSave = (_data: any, obj?: any) => {
    Object.assign(DeviceModel, { ..._data });
    DeviceOptions.value = { ...unref(DeviceOptions), ...obj };
};

const save = async (step?: number) => {
    let _step = step !== undefined ? step : current.value;
    if (_step === 0) {
        DeviceModel.productId
            ? (current.value = 1)
            : onlyMessage($t('Device.index.9667820-11'), 'error');
    } else {
        if (deviceRef.value) {
            const resp = await deviceRef.value?.onFormSave();
            if(resp){
              onSave();
            }
        } else if (DeviceModel.selector.selectorValues?.length) {
            onSave();
        } else {
            onlyMessage($t('Device.index.9667820-12'), 'error');
        }
    }
};

const stepChange = (step: number) => {
    if (step !== 0) {
        save(step - 1);
    } else {
        current.value = 0;
    }
};

const prev = () => {
    current.value -= 1;
};

const saveClick = () => save();

watch(
    () => props.value,
    (newValue) => {
        Object.assign(DeviceModel, newValue);
        activeProductId.value = String(newValue?.productId || '');
        if (isDetailedEditor && newValue?.productId) {
            current.value = 1
            void getProduct(newValue.productId).then((response: any) => {
                if (DeviceModel.productId === newValue.productId) productDetail.value = response?.result || response || {}
            })
        }
    },
    { immediate: true },
);
</script>

<style lang="less" scoped>
.steps-steps {
    width: 100%;
    margin-bottom: 17px;
    padding-bottom: 17px;
    border-bottom: 1px solid #f0f0f0;
}

.steps-content {
    width: 100%;
    max-height: 70vh;
    overflow-y: auto;
    overflow-x: hidden;
}
</style>

<style scoped>
.detailed-device-data__product { display: grid; gap: 16px; }
.detailed-device-data__product footer { display: flex; justify-content: flex-end; gap: 8px; }
</style>
