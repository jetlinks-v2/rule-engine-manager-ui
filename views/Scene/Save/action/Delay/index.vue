<template>
    <a-modal
        :title="$t('IotSceneLinkage.action.delay')"
        open
        :width="480"
        @cancel="onCancel"
        :footer="null"
        :maskClosable="false"
    >
        <a-form layout="vertical"><DelayDurationField v-model:time="_value" v-model:unit="unit" :submitted="submitted" /></a-form>
        <SceneConfigPreview><SceneActionSummary :action="{ executor: 'delay', delay: { time: _value, unit } }" /></SceneConfigPreview>
        <footer class="scene-delay__footer"><a-button @click="onCancel">{{ $t('IotSceneLinkage.action.cancel') }}</a-button><a-button type="primary" @click="onOk">{{ $t('IotSceneLinkage.action.confirm') }}</a-button></footer>
    </a-modal>
</template>

<script lang="ts" setup>
import SceneConfigPreview from '../../../../SceneLinkage/editor/components/SceneConfigPreview.vue'
import DelayDurationField from '../../../../SceneLinkage/editor/components/DelayDurationField.vue'
import SceneActionSummary from '../../../../SceneLinkage/editor/components/SceneActionSummary.vue'
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()
const props = defineProps({
    value: {
        type: Object,
        default: () => {
            return {
                time: 1,
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


const emit = defineEmits(['cancel', 'save']);

const _value = ref<number | null>(props.value?.time ?? 1);
const submitted = ref(false);
const unit = ref<'seconds' | 'minutes' | 'hours'>(
    props.value?.unit || 'seconds',
);
watch(
    () => props.value,
    (newVal) => {
        _value.value = newVal?.time ?? 1;
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
    submitted.value = true;
    if (_value.value != null && Number.isInteger(_value.value) && _value.value >= 1 && _value.value <= 65535) {
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
    }
};
</script>
<style scoped>
.scene-delay__footer { display: flex; justify-content: flex-end; gap: var(--space-2, 8px); padding-top: var(--space-4, 16px); margin-top: var(--space-4, 16px); border-top: 1px solid var(--ant-color-border-secondary); }
</style>
