<template>
    <a-modal
        :title="$t('Delay.index.9667826-0')"
        open
        :width="400"
        @cancel="onCancel"
        :footer="null"
        :maskClosable="false"
    >
        <header class="scene-delay__header"><strong>{{ $t('IotSceneLinkage.detail.delayDuration') }}</strong><small>{{ $t('IotSceneLinkage.detail.delayDurationHint') }}</small></header>
        <a-form layout="vertical"><a-form-item :label="$t('IotSceneLinkage.detail.delayDuration')"><a-input-number style="max-width: 220px" :placeholder="$t('Delay.index.9667826-1')" v-model:value="_value" :precision="0" :min="0" :max="65535"><template #addonAfter><a-select style="min-width: 60px" :options="unitOptions" v-model:value="unit" /></template></a-input-number></a-form-item></a-form>
        <section class="scene-delay__preview"><span>{{ $t('IotSceneLinkage.detail.currentDelay') }}</span><b>{{ delaySummary }}</b></section>
        <footer class="scene-delay__footer"><a-button @click="onCancel">{{ $t('IotSceneLinkage.action.cancel') }}</a-button><a-button type="primary" @click="onOk">{{ $t('IotSceneLinkage.action.confirm') }}</a-button></footer>
    </a-modal>
</template>

<script lang="ts" setup>
import { onlyMessage } from '@jetlinks-web/utils';
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()
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
    seconds: $t('Delay.index.9667826-2'),
    minutes: $t('Delay.index.9667826-3'),
    hours: $t('Delay.index.9667826-4'),
};
const unitOptions = [
    { label: $t('Delay.index.9667826-2'), value: 'seconds' },
    { label: $t('Delay.index.9667826-3'), value: 'minutes' },
    { label: $t('Delay.index.9667826-4'), value: 'hours' },
];

const emit = defineEmits(['cancel', 'save']);

const _value = ref<number>(props.value.time);
const unit = ref<'seconds' | 'minutes' | 'hours'>(
    props.value?.unit || 'seconds',
);
const delaySummary = computed(() => _value.value
    ? $t('Delay.index.9667826-5', [_value.value, timeUnitEnum[unit.value]])
    : $t('IotSceneLinkage.detail.noDelay'))

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
                name: $t('Delay.index.9667826-5', [_value.value, timeUnitEnum[unit.value]]),
            },
        );
    } else {
        onlyMessage($t('Delay.index.9667826-1'), 'error');
    }
};
</script>
<style scoped>
.scene-delay__header { display: grid; gap: 4px; margin-bottom: var(--space-4, 16px); }.scene-delay__header small { color: var(--ant-color-text-tertiary); font-size: 12px; }
.scene-delay__preview { display: grid; gap: 4px; padding: var(--space-3, 12px); background: var(--ant-color-fill-quaternary); border-radius: var(--radius-jet-sm, 8px); }.scene-delay__preview span { color: var(--ant-color-text-secondary); font-size: 12px; }.scene-delay__preview b { font-weight: 500; }
.scene-delay__footer { display: flex; justify-content: flex-end; gap: var(--space-2, 8px); padding-top: var(--space-4, 16px); margin-top: var(--space-4, 16px); border-top: 1px solid var(--ant-color-border-secondary); }
</style>
