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
                      <a-input placeholder="多个值以英文逗号隔开" v-model:value="myValue" @change="onSelect"/>
                    </a-tab-pane>
                </a-tabs>
            </div>
        </template>
    </a-dropdown>
</template>

<script lang="ts" setup name="ArrayParamsDropdown">
import type { ValueType } from './typings';
import { defaultSetting } from './typings';
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
    const _value = myValue.value.split(',')
    emit('update:value', _value);
    label.value = JSON.stringify(_value)
    emit('select', _value, myValue.value, label.value);
};

const visibleChange = (v: boolean) => {
    visible.value = v;
};

watch(()=>props.value,() => {
    if (props.value?.every(item => !item)) {
      myValue.value = undefined
      label.value = '[]'
    } else {
      myValue.value = props.value.toString()
      label.value = JSON.stringify(props.value)
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
