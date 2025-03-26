<template>
    <a-dropdown
        class="scene-select-value"
        trigger="click"
        v-model:visible="visible"
        :overlayStyle="{
            maxWidth: '300px',
        }"
        @visibleChange="visibleChange"
    >
        <div @click.prevent="visible = true">
            <slot :label="label">
                <div class="dropdown-button value">
                    <AIcon v-if="!!icon" :type="icon" />
                    <j-ellipsis style="max-width: 220px">
                        {{ label }}
                    </j-ellipsis>
                </div>
            </slot>
        </div>
        <template #overlay>
            <div class="scene-select-content">
                <a-tabs @change="tabsChange" v-model:activeKey="mySource">
                    <a-tab-pane
                        v-for="item in tabsOptions"
                        :tab="item.label"
                        :key="item.key"
                    >
                      <j-value-item :placeholder="$t('actions.WriteProperty.9667836-3')" v-model:modelValue="myValue" itemType="object" @change="onSelect"/>
                    </a-tab-pane>
                </a-tabs>
            </div>
        </template>
    </a-dropdown>
</template>

<script lang="ts" setup name="ArrayParamsDropdown">
import type { ValueType } from './typings';
import { defaultSetting } from './typings';
import { useI18n } from 'vue-i18n'
import {onlyMessage} from "@jetlinks-web/utils";
import { isNil } from "lodash-es";

const { t: $t } = useI18n()
type Emit = {
    (e: 'update:value', data: Array<ValueType>): void;
    (e: 'update:source', data: string): void;
    (
        e: 'select',
        data: any,
        label?: string,
        labelObj?: Record<number, any>,
        option?: any,
    ): void;
    (e: 'tabChange', data: any): void;
};

const props = defineProps({
    ...defaultSetting,
});

const emit = defineEmits<Emit>();
const myValue = ref<string>();
const mySource = ref<string>(props.source);
const label = ref<any>('[]');
const visible = ref(false);
const tabsChange = (e: string) => {
    mySource.value = e;
    emit('update:source', mySource.value);
};

const onSelect = () => {
    if(myValue.value) {
        try {
            const _value = JSON.parse(myValue.value);

            if (!Array.isArray(_value)) {
              throw new Error('must array')
            }
            emit('update:value', _value);
            label.value = JSON.stringify(_value)
            emit('select', _value, myValue.value, label.value);
        } catch (e) {
            onlyMessage('请输入正确格式的数据', 'error')
        }
    } else {
        emit('update:value', undefined);
        emit('select', '', undefined, undefined);
    }
};

const visibleChange = (v: boolean) => {
    visible.value = v;
};

watch(()=>props.value,(val) => {
    if (!val) {
      myValue.value = undefined
      label.value = '[]'
    } else {
      if (Array.isArray(val)) {
        myValue.value = JSON.stringify(val)
        label.value = val.every(item => isNil(item)) ? '[]' : JSON.stringify(val)
      } else {
        myValue.value = JSON.stringify(val)
        label.value = JSON.stringify(val)
      }
    }
}, { immediate: true })
</script>

<style scoped lang="less">
@import '../DropdownButton/index.less';
.manual-time-picker {
    position: absolute;
    top: -2px;
    left: 0;
    border: none;
    visibility: hidden;
    :deep(.ant-picker-input) {
        display: none;
    }
}
</style>
