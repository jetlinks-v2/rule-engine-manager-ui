<template>
    <div class="type" :class="{ 'type--compact': compact }">
        <a-form ref="typeForm" :model="formModel" layout="vertical" :colon="false">
            <a-form-item required :label="$t('Device.AddModal.3725211-3')">
                <a-select v-if="compact" v-model:value="formModel.operator" :options="triggerOptions" popup-class-name="scene-editor__resource-dropdown scene-editor__device-trigger-dropdown" :dropdown-match-select-width="false">
                  <template #option="option"><div class="scene-editor__device-trigger-option"><span><AIcon :type="optionValue(option).icon" /></span><div><b>{{ optionValue(option).label }}</b><small>{{ optionValue(option).description }}</small></div></div></template>
                </a-select>
                <TopCard v-else
                    :label-bottom="true"
                    :options="topOptions"
                    v-model:value="formModel.operator"
                />
            </a-form-item>
            <a-form-item v-if="compact && showReadProperty" name="readPoints" :label="$t('IotSceneLinkage.collector.points')" :rules="[{ required: true, message: $t('Collector.actions.index-6100078-2') }]">
              <ThingModelSelect v-model="formModel.readPoints" multiple :options="readPoints" />
            </a-form-item>
            <ReadPoints
                v-else-if="showReadProperty"
                v-model:value="formModel.readPoints"
                v-model:action="optionCache.action"
                :properties="readPoints"
            />
            <WritePoint
                ref="writeRef"
                :compact="compact"
                v-if="showWriteProperty"
                v-model:value="formModel.writePoints"
                v-model:action="optionCache.action"
                :properties="writePoints"
            />
            <template v-if="showTimer">
                <Timer ref="timerRef" v-model:value="formModel.timer"/>
            </template>
        </a-form>
    </div>
</template>

<script setup lang="ts">
import TopCard from "../components/TopCard.vue";
import Timer from "../components/Timer/index.vue";
import ThingModelSelect from "../../../SceneLinkage/editor/components/ThingModelSelect.vue";
import type {TriggerDeviceOptions} from "../../typings";
import type {PropType} from "vue";
import ReadPoints from "./ReadPoints.vue";
import WritePoint from "./WritePoint.vue";
import {cloneDeep, omit} from "lodash-es";
import {sceneImages} from "@rule-engine-manager-ui/assets";
import { useI18n } from 'vue-i18n'

const emit = defineEmits<{ 'type-change': [type: string]; 'points-change': [ids: string[]] }>()
const props = defineProps({
    compact: { type: Boolean, default: false },
    operator: {
        type: [Object, String] as PropType<TriggerDeviceOptions | string>,
        default: 'read',
    },
    pointList: {
        type: Array as PropType<Record<string, any>[]>,
        default: () => ([]),
    },
    collectorConfig: {
        type: Object as PropType<Record<string, any>>,
        default: () => ({}),
    },
    collectorId: {
        type: String,
        default: '',
    }
});

const { t: $t } = useI18n()

const formModel = reactive({
    operator: typeof props.operator === 'string' && ['read', 'write', 'sub'].includes(props.operator) ? props.operator : 'read',
    timer: {},
    readPoints: props.collectorId !== props.collectorConfig?.pointSelectInfo?.collectorId ? [] : props.collectorConfig?.pointSelectInfo?.pointIds || [],
    writePoints: props.collectorId !== props.collectorConfig?.pointSelectInfo?.collectorId ? {} : props.collectorConfig?.pointSelectInfo?.pointIds[0] ?  {
       [props.collectorConfig?.pointSelectInfo?.pointIds[0]]: props.collectorConfig?.collectorConfig?.value
    } : {},
    value: undefined as unknown,
});

Object.assign(formModel, props.collectorConfig);

const optionCache = reactive({
    action: "",
});

const readPoints = computed(() => {
    /**
     * 读：1（001）
     * 写：2（010）
     * 订阅：4（100）
     * 可使用按位与计算来校验是否包含对应枚举
     * 例如，判断是否包含读：accessModes & 1 !== 0，判断是否包含写：accessModes & (1 << 1) !== 0
     */
    return props.pointList.filter((item) => {
        return (item.accessModeMask & 1) !== 0;
    }).map((item) => {
        return {
            ...item,
            label: item.name,
            value: item.id,
            valueType: item.dataType,
        };
    })
});
const writePoints = computed(() => {
  /**
   * 读：1（001）
   * 写：2（010）
   * 订阅：4（100）
   * 可使用按位与计算来校验是否包含对应枚举
   * 例如，判断是否包含读：accessModes & 1 !== 0，判断是否包含写：accessModes & (1 << 1) !== 0
   */
    return props.pointList.filter((item) => {
        return item.accessModeMask & (1 << 1);
    }).map((item) => {
        return {
            ...item,
            label: item.name,
            value: item.id,
            valueType: item.dataType,
        };
    })
});

const typeForm = ref();
const timerRef = ref();
const writeRef = ref();

const topOptions = [
    {
        label: $t('Collector.actions.index-6100078-0'),
        value: "read",
        img: sceneImages.readProperty,
        disabled: false
    },
    {
        label: $t('Collector.actions.index-6100078-17'),
        value: "write",
        img: sceneImages.writeProperty,
        disabled: false
    },
    {
        label: $t('Collector.actions.index-6100078-9'),
        value: "sub",
        img: sceneImages.reportProperty,
        disabled: false
    },
];

const triggerOptions = computed(() => topOptions.map((item, index) => ({
    ...item, icon: ['SearchOutlined', 'EditOutlined', 'NotificationOutlined'][index],
    description: $t(['IotSceneLinkage.collector.readDescription', 'IotSceneLinkage.collector.writeDescription', 'IotSceneLinkage.collector.subscribeDescription'][index]),
})))
const optionValue = (option: any) => option?.data?.value ? option.data : option

const showReadProperty = computed(() => {
    return formModel.operator === 'read';
});

const showWriteProperty = computed(() => {
    return formModel.operator === 'write';
});

const showTimer = computed(() => {
    return ['read', 'write'].includes(formModel.operator);
});

watch(() => formModel.operator, () => {
    formModel.writePoints = {};
    formModel.readPoints = [];
    emit('type-change', formModel.operator);
})
// 中间点位列表与右侧读写表单双向同步；订阅仍沿用原版订阅采集器全部点位的语义。
watch(() => [formModel.operator, formModel.readPoints, formModel.writePoints] as const, () => {
    emit('points-change', formModel.operator === 'write' ? Object.keys(formModel.writePoints) : formModel.readPoints);
}, { deep: true, immediate: true })
function selectPoint(id: string) {
    if (formModel.operator === 'read') {
        formModel.readPoints = formModel.readPoints.includes(id) ? formModel.readPoints.filter(value => value !== id) : [...formModel.readPoints, id];
    } else if (formModel.operator === 'write' && !Object.hasOwn(formModel.writePoints, id)) {
        formModel.writePoints = { [id]: undefined };
    }
}

defineExpose({
    selectPoint,
    vail: async () => {
        const typeData = await typeForm.value?.validateFields();
        if (!typeData) return false;
        if (showTimer.value && !await timerRef.value?.validateFields()) return false;
        const cloneModel = cloneDeep(formModel);
        const filterKey: string[] = [];
        if (!showReadProperty.value) filterKey.push('readPoints');
        if (!showTimer.value) filterKey.push('timer');
        if (showWriteProperty.value) {
            const writeData = await writeRef.value?.validateFields();
            if (!writeData?.data) return false;
            cloneModel.writePoints = writeData.data;
            cloneModel.value = Object.values(writeData.data)[0];
        } else filterKey.push('writePoints');
        return { data: omit(cloneModel, filterKey), action: optionCache.action };
    },
});
</script>

<style scoped lang="less">
.type--compact { margin-top: 0 !important; }
.type {
    margin-top: 24px;

    .alert {
        height: 40px;
        padding-left: 10px;
        color: rgba(0, 0, 0, 0.55);
        line-height: 40px;
        background-color: #f6f6f6;
    }
}
</style>
