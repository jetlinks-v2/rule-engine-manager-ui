<template>
    <a-input-group compact>
        <a-select
            :options="[
                { label: '手动输入', value: 'fixed' },
                { label: '内置参数', value: 'upper' },
            ]"
            style="width: 120px"
            :value="value?.source"
            @change="sourceChange"
        />
        <template v-if="source === 'upper'">
            <a-tree-select
                v-model:value="upperKey"
                :treeData="builtInList"
                placeholder="请选择参数"
                style="width: calc(100% - 120px)"
                :fieldNames="{ label: 'name', value: 'id' }"
                @change="(val, label, extra) => itemOnChange(undefined, val, label, extra)"
            >
                <template #title="{ fullName, description }">
                    <a-space>
                        {{ fullName }}
                        <span style="color: grey; margin-left: 5px">{{
                            description
                        }}</span>
                    </a-space>
                </template>
            </a-tree-select>
        </template>
        <template v-else>
            <a-date-picker
                :value="value.value"
                allowClear
                valueFormat='YYYY-MM-DD HH:mm:ss'
                format="YYYY-MM-DD HH:mm:ss"
                style="width: calc(100% - 120px)"
                v-if="item.type === 'date'"
                @change="(_, dateString) => itemOnChange(dateString)"
            />
            <a-input-number
                :value="value.value"
                allowClear
                style="width: calc(100% - 120px)"
                v-else-if="item.type === 'number'"
                :placeholder="`请输入${item.name}`"
                @change="itemOnChange"
            />
            <a-input
                :value="value.value"
                allowClear
                style="width: calc(100% - 120px)"
                v-else
                :placeholder="`请输入${item.name}`"
                @change="(e) => itemOnChange(e.target.value)"
            />
        </template>
    </a-input-group>
</template>

<script lang="ts" setup name='NotifyBuildIn'>
import { queryBuiltInParams } from '../../../../../../api/scene';
import { useSceneStore } from '../../../../../../store/scene';
import { storeToRefs } from 'pinia';

const sceneStore = useSceneStore();
const { data } = storeToRefs(sceneStore);

const props = defineProps({
    value: {
        type: Object,
        default: () => {
            return {
                source: 'fixed',
                value: undefined,
                upperKey: undefined,
            };
        },
    },
    item: {
        type: Object,
        default: () => {},
    },
    name: {
        type: Number,
        default: 0,
    },
});

const emit = defineEmits(['update:value', 'change']);

const source = computed(() => {
    return props.value?.source || 'fixed';
});

const builtInList = ref<any[]>([]);
const upperKey = ref(props.value?.upperKey);

const sourceChange = (val: any) => {
    emit('update:value', {
        ...props.value,
        source: val,
        value: undefined,
    });
};

const itemOnChange = (val: any, _upperKey?: string, label?: any, extra?: any) => {
    const item = extra?.triggerNode?.props
    let othersColumns = ''
    if (item && item.metadata) {
      othersColumns = item.column
    }

    emit('update:value', {
        ...props.value,
        value: val,
        upperKey: _upperKey,
    });

    emit('change', {
        sendTo: label?.[0] || val,
    }, othersColumns);
};

const treeDataFilter = (arr: any[], type: string) => {
    if (Array.isArray(arr) && arr.length) {
        const list: any[] = [];
        arr.map((item: any) => {
            if (item.children) {
                const children = treeDataFilter(item.children, type);
                if (children.length) {
                    list.push({
                        ...item,
                        title: item.name,
                        value: item.id,
                        disabled: true,
                        children,
                    });
                }
            } else {
                if (
                    item.type === type ||
                    (type === 'double' &&
                        ['int', 'float', 'double', 'long'].includes(item.type))
                ) {
                    list.push(item);
                }
            }
        });
        return list;
    } else {
        return [];
    }
};

watch(
    () => source.value,
    (newVal) => {
        const v = newVal;
        if (v === 'upper') {
            const params =
                props.name - 1 >= 0 ? { action: props.name - 1 } : undefined;
            queryBuiltInParams(unref(data), params).then((resp) => {
                if (resp.status === 200) {
                    const arr = treeDataFilter(
                        resp.result as any[],
                        props.item.expands?.businessType || props.item?.type,
                    );
                    builtInList.value = arr;
                }
            });
        }
    },
    { deep: true, immediate: true },
);

watch(
    () => props.value.upperKey,
    (newVal) => {
        upperKey.value = newVal;
    },
    { immediate: true },
);
</script>

<style lang="less" scoped>
</style>