<template>
    <a-select
        placeholder="请选择关系"
        :options="relationList"
        show-search
        :value="value ? value[0]?.value?.relation : undefined"
        @change="onRelationChange"
    />
</template>

<script lang="ts" setup>
import { getRelationUsers } from '../../../../../../api/others';
const props = defineProps({
    value: {
        type: Array,
        default: () => [{value: {}}]
    },
});

const emit = defineEmits(['update:value', 'change']);
const relationList = ref<any[]>([]);

onMounted(() => {
    queryRelationList()
})

const queryRelationList = () => {
    getRelationUsers({
        paging: false,
        sorts: [{ name: 'createTime', order: 'desc' }],
        terms: [{ termType: 'eq', column: 'objectTypeName', value: '设备' }],
    }).then((resp) => {
        if (resp.status === 200) {
            relationList.value = (resp.result as any[]).map((item) => {
                return {
                    label: item.name,
                    value: item.relation,
                };
            });
        }
    });
};

const onRelationChange = (val: any, options: any) => {
    const _values = [
        {
            value: {
                objectType: 'user',
                relation: val,
            },
        },
    ];
    emit('update:value', _values);
    emit('change', _values, options);
};
</script>