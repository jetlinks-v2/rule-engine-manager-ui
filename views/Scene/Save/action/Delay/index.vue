<template>
    <a-modal
        title="延迟执行"
        visible
        :width="400"
        @cancel="onCancel"
        @ok="onOk"
        :maskClosable="false"
    >
        <a-input-number
            style="max-width: 220px"
            placeholder="请输入时间"
            v-model:value="_value"
            :precision="3"
            :min="0.001"
            :max="65535"
        >
            <template #addonAfter>
                <a-select
                    :options="[
                        { label: '秒', value: 'seconds' },
                        { label: '分', value: 'minutes' },
                        { label: '小时', value: 'hours' },
                    ]"
                    v-model:value="unit"
                />
            </template>
        </a-input-number>
    </a-modal>
</template>

<script lang="ts" setup>
import { onlyMessage } from '@jetlinks-web/utils';

const props = defineProps({
    value: {
        type: Object,
        default: () => {
            return {
                time: 0,
                unit: 'seconds',
            };
        },
    },
});

const timeUnitEnum = {
    seconds: '秒',
    minutes: '分',
    hours: '小时',
};

const emit = defineEmits(['cancel', 'save']);

const _value = ref<number>(props.value.time);
const unit = ref<'seconds' | 'minutes' | 'hours'>(
    props.value?.unit || 'seconds',
);

watch(
    () => props.value,
    (newVal) => {
        _value.value = newVal?.time || 0;
        unit.value = newVal?.unit || 'seconds';
    },
    {
        immediate: true,
        deep: true,
    },
);

const onCancel = () => {
    emit('cancel');
};
const onOk = () => {
    if (unref(_value)) {
        emit(
            'save',
            {
                time: _value.value,
                unit: unit.value,
            },
            {
                name: `${_value.value} ${
                    timeUnitEnum[unit.value]
                }后，执行后续动作`,
            },
        );
    } else {
        onlyMessage('请输入时间', 'error');
    }
};
</script>