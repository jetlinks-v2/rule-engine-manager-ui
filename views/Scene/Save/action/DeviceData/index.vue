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
                <footer><a-button @click="onCancel">{{ $t('IotSceneLinkage.action.cancel') }}</a-button><a-button type="primary" :loading="productDetailLoading" @click="saveClick">{{ $t('IotSceneLinkage.action.next') }}</a-button></footer>
            </section>
            <DeviceActionScope
                v-else-if="isDetailedEditor" :scope="scopeDraft" :product-detail="productDetail" :name="name" :then-name="thenName"
                @save="saveResourceScope" @cancel="onCancel" @change-product="current = 0"
            >
                <template #configuration><strong>{{ $t('IotSceneLinkage.detail.deviceInfoTitle') }}</strong><p>{{ $t('IotSceneLinkage.detail.deviceInfoDescription') }}</p></template>
            </DeviceActionScope>
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
import Product from '../../Device/Product.vue';
import LegacyProduct from './Product.vue';
import DeviceActionScope from '../Device/DeviceActionScope.vue'
import Device from './device/index.vue';
import { useDeviceDataModal } from './useDeviceDataModal'
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
const { isDetailedEditor, current, DeviceModel, productDetail, productDetailLoading, scopeDraft, deviceRef, onCancel, save, stepChange, onProductChange, onDeviceSave, saveResourceScope, prev, saveClick } = useDeviceDataModal(props, emit)
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
