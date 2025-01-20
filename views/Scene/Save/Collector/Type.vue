<template>
    <div class="type">
        <a-form ref="typeForm" :model="formModel" layout="vertical" :colon="false">
            <a-form-item required label="触发类型">
                <TopCard
                    :label-bottom="true"
                    :options="topOptions"
                    v-model:value="formModel.operator"
                />
            </a-form-item>
            <template v-if="showTimer">
                <Timer ref="timerRef" v-model:value="formModel.timer"/>
            </template>
            <ReadPoints
                v-if="showReadProperty"
                v-model:value="formModel.readPoints"
                v-model:action="optionCache.action"
                :properties="readPoints"
            />
            <WriteProperty
                ref="writeRef"
                v-if="showWriteProperty"
                v-model:value="formModel.writePoints"
                v-model:action="optionCache.action"
                :properties="writePoints"
            />
        </a-form>
    </div>
</template>

<script setup lang="ts">
import {TopCard, Timer} from "../components";
import type {TriggerDeviceOptions} from "../../typings";
import type {PropType} from "vue";
import ReadPoints from "./ReadPoints.vue";
import WriteProperty from "../Device/WriteProperty.vue";
import {cloneDeep, omit} from "lodash-es";
import {sceneImages} from "@ruleEngine/assets";

const props = defineProps({
    operator: {
        type: Object as PropType<TriggerDeviceOptions>,
        default: () => ({}),
    },
    pointList: {
        type: Array as PropType<Record<string, any>[]>,
        default: () => ([]),
    },
    collectorConfig: {
        type: Object as PropType<Record<string, any>>,
        default: () => ({}),
    }
});

const formModel = reactive({
    operator: props.operator || 'read',
    timer: {},
    readPoints: props.collectorConfig?.pointSelectInfo?.pointIds || [],
    writePoints: props.collectorConfig?.pointSelectInfo?.pointIds[0] ?  {
       [props.collectorConfig?.pointSelectInfo?.pointIds[0]]: props.collectorConfig?.collectorConfig?.value
    } : {},
    value: '',
});

Object.assign(formModel, props.collectorConfig);

const optionCache = reactive({
    action: "",
});

const readPoints = computed(() => {
    return props.pointList.filter((item) => {
        return item.accessModes.find((v) => v.value === "read");
    }).map((item) => {
        return {
            ...item,
            label: item.name,
            value: item.id,
        };
    })
});
const writePoints = computed(() => {
    return props.pointList.filter((item) => {
        return item.accessModes.find((v) => v.value === "write");
    }).map((item) => {
        return {
            ...item,
            label: item.name,
            value: item.id,
        };
    })
});

const typeForm = ref();
const timerRef = ref();
const writeRef = ref();

const topOptions = [
    {
        label: "读取点位",
        value: "read",
        img: sceneImages.readProperty,
        disabled: false
    },
    {
        label: "修改点位",
        value: "write",
        img: sceneImages.writeProperty,
        disabled: false
    },
    {
        label: "点位上报",
        value: "sub",
        img: sceneImages.reportProperty,
        disabled: false
    },
];

const showReadProperty = computed(() => {
    return formModel.operator === 'read';
});

const showWriteProperty = computed(() => {
    return formModel.operator === 'write';
});

const showTimer = computed(() => {
    return ['read', 'write'].includes(formModel.operator);
});

defineExpose({
    vail: () => {
        return new Promise(async (resolve, reject) => {
            const cloneModel = cloneDeep(formModel);
            const filterKey: string[] = [];
            const typeData = await typeForm.value?.validateFields();

            if (!typeData) return resolve(false);

            if (!showReadProperty.value) {
                filterKey.push("readPoints");
            }

            if (showTimer.value) {
                const timerData = await timerRef.value?.validateFields();
                if (!timerData) return resolve(false);
            } else {
                filterKey.push("timer");
            }

            if (showWriteProperty.value) {
                const writeData = await writeRef.value?.validateFields();
                cloneModel.value = writeData[Object.keys(writeData)[0]];
                if (!writeData) return resolve(false);
            } else {
                filterKey.push("writePoints");
            }
            resolve({
                data: omit(cloneModel, filterKey),
                action: optionCache.action,
            });
        });
    },
});
</script>

<style scoped lang="less">
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
