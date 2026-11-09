<template>
    <a-modal
        :title="$t('Device.index.9667820-0')"
        open
        :width="isResourceScope || isDetailedEditor ? 1240 : 860"
        :footer="isResourceScope || isDetailedEditor ? null : undefined"
        @cancel="onCancel"
        @ok="() => save()"
        :maskClosable="false"
    >
        <a-steps v-if="!isResourceScope && !isDetailedEditor" :current="current" @change="stepChange">
            <a-step>
                <template #title>{{ $t('Device.index.9667820-1') }}</template>
            </a-step>
            <a-step>
                <template #title>{{ $t('Device.index.9667820-2') }}</template>
            </a-step>
            <a-step>
                <template #title>{{ $t('Device.index.9667820-0') }}</template>
            </a-step>
        </a-steps>
        <a-divider v-if="!isResourceScope && !isDetailedEditor" style="margin-bottom: 10px" />
        <div class="steps-content">
            <section v-if="isDetailedEditor && current === 0" class="detailed-device-action-modal__product">
                <header>
                    <div>
                        <strong>{{ $t('Device.index.9667820-1') }}</strong>
                        <small>{{ $t('IotSceneLinkage.detail.productFirstHint') }}</small>
                    </div>
                </header>
                <Product
                    v-model:rowKey="DeviceModel.productId"
                    v-model:detail="productDetail"
                    @change="onProductChange"
                />
                <footer>
                    <a-button @click="onCancel">{{ $t('Device.index.9667820-3') }}</a-button>
                    <a-button type="primary" :loading="productDetailLoading" @click="saveClick">{{ $t('IotSceneLinkage.action.next') }}</a-button>
                </footer>
            </section>
            <Product
                v-else-if="current === 0"
                v-model:rowKey="DeviceModel.productId"
                v-model:detail="productDetail"
                @change="onProductChange"
            />
            <DetailedDeviceActionScope
                v-else-if="isResourceScope"
                :values="DeviceModel"
                :product-detail="productDetail"
                :name="name"
                :parallel="parallel"
                :branches-name="branchesName"
                :then-name="thenName"
                :column-map="options.columnMap"
                @change-product="current = 0"
                @cancel="onCancel"
                @save="onResourceScopeSave"
            />
            <Device
                v-else-if="current === 1"
                :name="name"
                :parallel="parallel"
                :branchesName="branchesName"
                :thenName="thenName"
                :values="DeviceModel"
                @save="onDeviceSave"
                :productDetail="productDetail"
                ref="deviceRef"
            />
            <Action
                v-else-if="current === 2"
                :name="name"
                :branchesName="branchesName"
                :thenName="thenName"
                :values="DeviceModel"
                :productDetail="productDetail"
                :columnMap="options.columnMap"
                ref="actionRef"
                @change="onActionsChange"
            />
        </div>
        <template v-if="!isResourceScope && !isDetailedEditor" #footer>
            <div class="steps-action">
                <a-button v-if="current === 0" @click="onCancel">{{ $t('Device.index.9667820-3') }}</a-button>
                <a-button v-else @click="prev">{{ $t('Device.index.9667820-4') }}</a-button>
                <a-button type="primary" v-if="current < 2" @click="saveClick"
                    >{{ $t('Device.index.9667820-5') }}</a-button
                >
                <a-button type="primary" v-else @click="saveClick"
                    >{{ $t('Device.index.9667820-6') }}</a-button
                >
            </div>
        </template>
    </a-modal>
</template>
<script lang="ts" setup name="ActionDeviceModal">
import { DeviceModelType, DeviceOptionType } from './typings';
import Product from '../../Device/Product.vue';
import Device from './device/index.vue';
import Action from './actions/index.vue';
import DetailedDeviceActionScope from './DetailedDeviceActionScope.vue';
import { onlyMessage } from '@jetlinks-web/utils';
import { useSceneStore } from '../../../../../store/scene';
import { storeToRefs } from 'pinia';
import { isActionChange } from '../../util';
import { useI18n } from 'vue-i18n'
import { getProduct } from '../../../../../api/scene-linkage'

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
const current = ref<number>(0);
const scopeEditorMode = ref<'resource' | 'advanced'>('resource')
const sceneEditorMode = inject<string>('scene-editor-mode', 'legacy')
const isDetailedEditor = computed(() => sceneEditorMode === 'detail')
const deviceRef = ref<any>();
const actionRef = ref<any>();
const productDetail = ref<any>({});
const productDetailLoading = ref(false)
let productDetailTask: Promise<void> | undefined
const activeProductId = ref('')
const DeviceModel = reactive<DeviceModelType>({
    productId: '',
    deviceId: '',
    selector: 'fixed',
    selectorValues: [],
    upperKey: '',
    source: 'fixed',
    message: {
        messageType: 'INVOKE_FUNCTION',
    },
});
const DeviceOptions = ref<DeviceOptionType>(props.options as DeviceOptionType);
const emit = defineEmits<Emit>();
const optionColumnCache = ref<string[]>(props.options?.otherColumn || [])
const isResourceScope = computed(() => current.value === 1 && scopeEditorMode.value === 'resource')
const onCancel = () => {
    emit('cancel');
};

const onSave = (_data: any, _columnMap: any = {}) => {
    const item: any = {
        selector: DeviceModel.selector,
        source: DeviceModel.source,
        selectorValues: DeviceModel.selectorValues,
        productId: DeviceModel.productId,
        upperKey: DeviceModel.upperKey,
        message: _data.message,
    };
    if (DeviceModel.selector === 'relation') {
        item.upperKey = 'scene.deviceId';
    }
    const _options: any = {
        // name: '-', //设备名称
        // type: '', //类型
        // properties: '', //属性功能
        // propertiesValue: '', //设置功能
        selector: DeviceModel.selector, //选择器标识
        triggerName: data.value.options?.trigger?.name || $t('Device.index.9667820-7'),
        ...DeviceOptions.value,
        otherColumns: item.message?.inputs?.filter((item: any) => item.value.source === 'upper')
        .map((item: any) => item.value.value)
        .reduce((pre: any[], cur: any) => {
          if(!pre.includes(cur)) {
            pre.push(cur)
          }
          return pre
        }, []) || [],
        columnMap: _columnMap,
    };
    const _type = _data.message.messageType;
    if (_type === 'INVOKE_FUNCTION') {
        _options.type = $t('Device.index.9667820-8');
      _options.otherColumns = Object.values(_columnMap)
    }
    if (_type === 'READ_PROPERTY') {
        _options.type = $t('Device.index.9667820-9');
    }
    if (_type === 'WRITE_PROPERTY') {
        _options.type = $t('Device.index.9667820-10');
        _options.propertiesValue =
            (typeof _options?.propertiesValue === 'object'
                ? JSON.stringify(_options?.propertiesValue)
                : _options?.propertiesValue)
      _options.otherColumns = optionColumnCache.value
    }
    emit('save', item, JSON.parse(JSON.stringify(_options)));
};
const onProductChange = (_val: any, bol = false) => {
    if (!_val?.id) return
    const productChanged = Boolean(activeProductId.value && activeProductId.value !== _val.id)
    if (!bol && productChanged) {
        DeviceModel.selectorValues = undefined;
        DeviceModel.deviceId = ''
        DeviceModel.selector = 'fixed'
        DeviceModel.upperKey = ''
        DeviceModel.source = 'fixed'
        scopeEditorMode.value = 'resource'
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
    activeProductId.value = _val.id
    productDetail.value = _val;
    DeviceOptions.value.productName = _val.name;
    productDetailLoading.value = true
    const selectedProductId = _val.id
    // 新版产品卡只承载列表摘要，范围与指令编辑仍需要完整物模型数据。
    productDetailTask = getProduct(selectedProductId)
        .then((response: any) => {
            if (DeviceModel.productId === selectedProductId) {
                productDetail.value = { ..._val, ...(response?.result || response || {}) }
                DeviceOptions.value.productName = productDetail.value.name || _val.name
            }
        })
        .finally(() => {
            if (DeviceModel.productId === selectedProductId) productDetailLoading.value = false
        })
};
const onDeviceSave = (_data: any, obj?: any) => {
    Object.assign(DeviceModel, { ..._data });
    DeviceOptions.value = { ...unref(DeviceOptions), ...obj };
};
/** 固定设备、空间、分组和标签在统一资源壳配置；历史变量及关系选择继续保留原数据。 */
const onResourceScopeSave = (payload: any) => {
    Object.assign(DeviceModel, {
        selector: payload.scope.selector,
        selectorValues: payload.scope.selectorValues,
        productId: payload.scope.productId || DeviceModel.productId,
        source: 'fixed',
        upperKey: '',
    });
    DeviceOptions.value = {
        ...unref(DeviceOptions),
        ...payload.actionOptions,
        name: payload.scope.selectorValues.map((item: { name?: string; value: unknown }) => item.name || item.value),
        productName: payload.scope.productName || productDetail.value.name,
    };
    optionColumnCache.value = payload.optionColumns || [];
    onSave(payload.action, payload.columnMap);
};
const onActionsChange = (options?: any, optionColumn: string[] = []) => {
    optionColumnCache.value = optionColumn
    const obj = {
        ...DeviceOptions.value,
        ...options,
    };
    DeviceOptions.value = obj;
};
const save = async (step?: number) => {
    let _step = step !== undefined ? step : current.value;
    if (_step === 0) {
        if (!DeviceModel.productId) {
            onlyMessage($t('Device.index.9667820-11'), 'error');
            return
        }
        await productDetailTask
        current.value = 1
    } else if (_step === 1) {
        if (deviceRef.value) {
            await deviceRef.value?.onFormSave();
            current.value = 2;
        } else if (DeviceModel.selectorValues?.length || DeviceModel.upperKey) {
            current.value = 2;
        } else {
            onlyMessage($t('Device.index.9667820-12'), 'error');
        }
    } else {
        if (actionRef.value) {
            const _data = await actionRef.value?.onFormSave();
            const _columnMap = actionRef.value?.getColumnMap()
            onSave(_data, _columnMap);
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

/** 编辑已有详细模式动作时补齐物模型数据，但不重置已选设备和指令。 */
async function hydrateSelectedProduct(productId: string) {
    productDetailLoading.value = true
    const selectedProductId = productId
    productDetailTask = getProduct(selectedProductId)
        .then((response: any) => {
            if (DeviceModel.productId !== selectedProductId) return
            productDetail.value = response?.result || response || {}
            DeviceOptions.value.productName = productDetail.value.name || DeviceOptions.value.productName
        })
        .finally(() => {
            if (DeviceModel.productId === selectedProductId) productDetailLoading.value = false
        })
    await productDetailTask
}

watch(
    () => props.value,
    (newValue) => {
        Object.assign(DeviceModel, newValue);
        activeProductId.value = newValue?.productId || ''
        // 详细模式编辑已有动作时直接展示已选产品下的设备列表并回显范围。
        current.value = isDetailedEditor.value && newValue?.productId ? 1 : 0
        scopeEditorMode.value = ['context', 'relation'].includes(newValue?.selector)
            ? 'advanced'
            : 'resource';
        if (isDetailedEditor.value && newValue?.productId) void hydrateSelectedProduct(newValue.productId)
    },
    { immediate: true },
);
</script>

<style lang="less" scoped>
.steps-content {
    width: 100%;
    max-height: 500px;
    overflow-y: auto;
    overflow-x: hidden;
}

.detailed-device-action-modal__product {
    display: grid;
    gap: var(--space-4, 16px);
    min-height: 0;

    > header > div {
        display: grid;
        gap: 4px;
    }

    strong {
        color: var(--ant-color-text);
    }

    small {
        color: var(--ant-color-text-tertiary);
        font-size: 12px;
    }

    > footer {
        display: flex;
        justify-content: flex-end;
        gap: var(--space-2, 8px);
        padding-top: var(--space-3, 12px);
        border-top: 1px solid var(--ant-color-border-secondary);
    }
}
</style>
