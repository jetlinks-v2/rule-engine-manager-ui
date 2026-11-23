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
                    <strong>{{ $t('Device.index.9667820-1') }}</strong>
                    <small>{{ $t('IotSceneLinkage.detail.actionProductFirstHint') }}</small>
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
                :options="DeviceOptions"
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
<script lang="ts" setup>
import Product from '../../Device/Product.vue';
import Device from './device/index.vue';
import Action from './actions/index.vue';
import DetailedDeviceActionScope from './DetailedDeviceActionScope.vue';
import { useDeviceActionModal } from './useDeviceActionModal'

defineOptions({ name: 'ActionDeviceModal' })
type Emit = {
    (e: 'cancel'): void;
    (e: 'save', data: any, options: Record<string, any>): void;
};
const props = defineProps({
    value: {
        type: Object,
        default: () => ({}),
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
const emit = defineEmits<Emit>();
const { isResourceScope, isDetailedEditor, current, DeviceModel, DeviceOptions, productDetail, productDetailLoading, deviceRef, actionRef, onCancel, save, stepChange, onProductChange, onDeviceSave, onActionsChange, onResourceScopeSave, prev, saveClick } = useDeviceActionModal(props, emit)
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

    > header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: var(--space-3, 12px);
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
