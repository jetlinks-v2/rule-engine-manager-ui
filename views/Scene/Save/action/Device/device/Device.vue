<template>
    <pro-search
        :columns="columns"
        type="simple"
        @search="handleSearch"
        class="scene-search"
        target="scene-trigger-device-device"
    />
    <a-divider style="margin: 0" />
    <JProTable
        ref="actionRef"
        mode="CARD"
        :columns="columns"
        :params="params"
        :request="deviceQuery"
        :gridColumn="2"
        :bodyStyle="{
            paddingRight: 0,
            paddingLeft: 0,
        }"
    >
        <template #card="slotProps">
            <CardBox
                :value="slotProps"
                @click="handleClick"
                :active="value[0]?.value === slotProps.id"
                :status="slotProps.state?.value"
                :statusText="slotProps.state?.text"
                :statusNames="{
                    online: 'processing',
                    offline: 'error',
                    notActive: 'warning',
                }"
            >
                <template #img>
                    <slot name="img">
                        <img
                            :src="sceneImages.deviceCard"
                        />
                    </slot>
                </template>
                <template #content>
                    <div style="width: calc(100% - 100px)">
                        <j-ellipsis>
                            <span style="font-size: 16px; font-weight: 600">
                                {{ slotProps.name }}
                            </span>
                        </j-ellipsis>
                    </div>
                    <a-row style="margin-top: 20px">
                        <a-col :span="12">
                            <div class="card-item-content-text">设备类型</div>
                            <div>{{ slotProps.deviceType?.text }}</div>
                        </a-col>
                        <a-col :span="12">
                            <div class="card-item-content-text">产品名称</div>
                            <j-ellipsis style="width: 100%">
                                {{ slotProps.productName }}
                            </j-ellipsis>
                        </a-col>
                    </a-row>
                </template>
            </CardBox>
        </template>
    </JProTable>
</template>
  
  <script setup lang='ts' name='Product'>
import { query, detail } from '../../../../../../api/others';
import { sceneImages } from '../../../../../../assets/index';
import { PropType } from 'vue';

type Emit = {
    (e: 'update:value', data: any): void;
    (e: 'change', data: any): void;
};

const actionRef = ref();
const params = ref({
    terms: [],
});
const props = defineProps({
    value: {
        type: Array as PropType<any>,
        default: [],
    },
    detail: {
        type: Object,
        default: () => ({}),
    },
    productId: {
        type: String,
        default: '',
    },
});

const emit = defineEmits<Emit>();

const columns = [
    {
        title: 'ID',
        dataIndex: 'id',
        width: 300,
        search: {
            type: 'string',
        },
    },
    {
        title: '设备名称',
        dataIndex: 'name',
        search: {
            type: 'string',
            first: true,
        },
    },
    {
        title: '创建时间',
        dataIndex: 'createTime',
        key: 'createTime',
        scopedSlots: true,
        search: {
            type: 'date',
        },
    },
    {
        title: '状态',
        dataIndex: 'state',
        key: 'state',
        scopedSlots: true,
        search: {
            type: 'select',
            options: [
                { label: '禁用', value: 'notActive' },
                { label: '离线', value: 'offline' },
                { label: '在线', value: 'online' },
            ],
        },
    },
];

const handleSearch = (p: any) => {
    params.value = {
        ...p,
        terms: [
            ...p.terms,
            { terms: [{ column: 'productId', value: props?.productId }] },
        ],
    };
};

const deviceQuery = (p: any) => {
    const sorts: any = [];
    if (props.value[0]?.value) {
        sorts.push({
            name: 'id',
            value: props.value[0]?.value,
        });
    }
    sorts.push({ name: 'createTime', order: 'desc' });
    p.sorts = sorts;
    return query(p);
};

const handleClick = (_detail: any) => {
    if (props.value?.[0]?.value === _detail.id) {
        emit('update:value', undefined);
        emit('change', {});
    } else {
        emit('update:value', [{ value: _detail.id, name: _detail.name }]);
        emit('change', _detail);
    }
};

onMounted(() => {
    if(props.value?.[0]?.value){
        detail(props.value?.[0]?.value).then(resp => {
            emit('change', resp.result);
        })
    }
})

watchEffect(() => {
    params.value = {
        ...params.value,
        terms: params.value?.terms
            ? [
                  ...(params.value.terms || []),
                  { terms: [{ column: 'productId', value: props?.productId }] },
              ]
            : [{ terms: [{ column: 'productId', value: props?.productId }] }],
    };
});
</script>
  
  <style scoped lang='less'>
.search {
    margin-bottom: 0;
    padding: 0 0 24px 0;
}
</style>