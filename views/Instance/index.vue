<template>
    <j-page-container>
        <div>
            <pro-search
                :columns="query.columns"
                target="rule-engine-instance"
                @search="handleSearch"
            />
            <FullPage>
                <JProTable
                    :columns="columns"
                    :request="queryList"
                    ref="tableRef"
                    :defaultParams="{
                        sorts: [{ name: 'createTime', order: 'desc' }],
                    }"
                    :params="params"
                >
                    <template #headerTitle>
                        <j-space>
                            <j-permission-button
                                type="primary"
                                @click="add"
                                hasPermission="rule-engine/Instance:add"
                            >
                                <template #icon
                                    ><AIcon type="PlusOutlined"
                                /></template>
                                新增
                            </j-permission-button>
                        </j-space>
                    </template>
                    <template #card="slotProps">
                        <CardBox
                            :value="slotProps"
                            :actions="getActions(slotProps, 'card')"
                            v-bind="slotProps"
                            :status="slotProps.state?.value"
                            :statusText="slotProps.state?.text"
                            @click="openRuleEditor"
                            :statusNames="{
                                started: 'processing',
                                disable: 'error',
                            }"
                        >
                            <template #img>
                                <slot name="img">
                                    <img
                                        :src="getImage('/scene/trigger-type/scene.png')"
                                    />
                                </slot>
                            </template>
                            <template #content>
                                <j-ellipsis style="width: calc(100% - 100px); margin-bottom: 18px;">
                                    <span
                                        style="
                                            font-weight: 600;
                                            font-size: 16px;
                                        "
                                    >
                                        {{ slotProps.name }}
                                    </span>
                                </j-ellipsis>
                                <a-row>
                                    <a-col :span="12">
                                        <j-ellipsis>
                                            <div>
                                                {{ slotProps.description }}
                                            </div>
                                        </j-ellipsis>
                                    </a-col>
                                </a-row>
                            </template>
                            <template #actions="item">
                                <j-permission-button
                                    :disabled="item.disabled"
                                    :popConfirm="item.popConfirm"
                                    :tooltip="{
                                        ...item.tooltip,
                                    }"
                                    :hasPermission="
                                        'rule-engine/Instance:' + item.key
                                    "
                                    @click="item.onClick"
                                >
                                    <AIcon
                                        type="DeleteOutlined"
                                        v-if="item.key === 'delete'"
                                    />
                                    <template v-else>
                                        <AIcon :type="item.icon" />
                                        <span>{{ item?.text }}</span>
                                    </template>
                                </j-permission-button>
                            </template>
                        </CardBox>
                    </template>
                    <template #state="slotProps">
                        <JBadgeStatus
                            :text="
                                slotProps.state?.value === 'started'
                                    ? '正常'
                                    : '禁用'
                            "
                            :status="slotProps.state?.value"
                            :statusNames="{
                                started: 'processing',
                                disable: 'error',
                            }"
                        />
                    </template>
                    <template #action="slotProps">
                        <a-space :size="16">
                            <template
                                v-for="i in getActions(slotProps, 'table')"
                                :key="i.key"
                            >
                                <j-permission-button
                                    :disabled="i.disabled"
                                    :popConfirm="i.popConfirm"
                                    :tooltip="{
                                        ...i.tooltip,
                                    }"
                                    @click="i.onClick"
                                    type="link"
                                    style="padding: 0px"
                                    :hasPermission="
                                        'rule-engine/Instance:' + i.key
                                    "
                                    :danger="i.key === 'delete'"
                                >
                                    <template #icon
                                        ><AIcon :type="i.icon"
                                    /></template>
                                </j-permission-button>
                            </template>
                        </a-space>
                    </template>
                </JProTable>
            </FullPage>
            <!-- 新增、编辑 -->
            <Save
                :data="current"
                @success="refresh"
                v-if="visible"
                @close-save="closeSave"
            />
        </div>
    </j-page-container>
</template>

<script lang="ts" setup>
import {
    queryList,
    startRule,
    stopRule,
    deleteRule,
} from '../../api/instance';
import { getImage, onlyMessage } from '@jetlinks-web/utils';
import Save from './Save/index.vue';
import { useRouterParams } from '@jetlinks-web/hooks';
export const BASE_API_PATH = import.meta.env.VITE_APP_BASE_API
const params = ref<Record<string, any>>({});
let visible = ref(false);
const tableRef = ref<Record<string, any>>({});
const { params: routeParams } = useRouterParams();
const query = {
    columns: [
        {
            title: '名称',
            dataIndex: 'name',
            key: 'name',
            search: {
                type: 'string',
            },
        },
        {
            title: '状态',
            dataIndex: 'state',
            key: 'state',
            search: {
                type: 'select',
                options: [
                    {
                        label: '正常',
                        value: 'started',
                    },
                    {
                        label: '禁用',
                        value: 'disable',
                    },
                ],
            },
        },
        {
            title: '说明',
            key: 'description',
            dataIndex: 'description',
            search: {
                type: 'string',
            },
        },
    ],
};
const columns = [
    {
        title: '名称',
        dataIndex: 'name',
        key: 'name',
        ellipsis: true,
    },
    {
        title: '状态',
        dataIndex: 'state',
        key: 'state',
        scopedSlots: true,
    },
    {
        title: '说明',
        dataIndex: 'description',
        key: 'description',
        ellipsis: true,
    },
    {
        title: '操作',
        key: 'action',
        fixed: 'right',
        width: 150,
        scopedSlots: true,
    },
];
const current = ref();
const getActions = (
    data: Partial<Record<string, any>>,
    type?: 'card' | 'table',
): any[] => {
    if (!data) {
        return [];
    }
    const actions = [
        {
            key: 'update',
            text: '编辑',
            tooltip: {
                title: '编辑',
            },

            icon: 'EditOutlined',
            onClick: () => {
                current.value = data;
                visible.value = true;
            },
        },
        {
            key: 'view',
            text: '查看',
            tooltip: {
                title: '查看',
            },
            icon: 'EyeOutlined',
            onClick: () => {
                openRuleEditor(data);
            },
        },
        {
            key: 'action',
            text: data.state?.value !== 'disable' ? '禁用' : '启用',
            tooltip: {
                title: data.state?.value !== 'disable' ? '禁用' : '启用',
            },
            icon:
                data.state?.value !== 'disable'
                    ? 'StopOutlined'
                    : 'CheckCircleOutlined',
            popConfirm: {
                title: `确认${data.state.value !== 'disable' ? '禁用' : '启用'}?`,
                onConfirm: async () => {
                    let response = undefined;
                    if (data.state?.value !== 'started') {
                        response = await startRule(data.id);
                    } else {
                        response = await stopRule(data.id);
                    }
                    if (response && response.status === 200) {
                        onlyMessage('操作成功！');
                        tableRef.value?.reload();
                    } else {
                        onlyMessage('操作失败！', 'error');
                    }
                },
            },
        },
        {
            key: 'delete',
            text: '删除',
            disabled: data?.state?.value !== 'disable',
            tooltip: {
                title:
                    data?.state?.value !== 'disable'
                        ? '请先禁用再删除'
                        : '删除',
            },
            popConfirm: {
                title: '确认删除?',
                onConfirm: async () => {
                    const resp = await deleteRule(data.id);
                    if (resp.status === 200) {
                        onlyMessage('操作成功！');
                        tableRef.value?.reload();
                    } else {
                        onlyMessage('操作失败！', 'error');
                    }
                },
            },
            icon: 'DeleteOutlined',
        },
    ];
    if (type === 'card')
        return actions.filter((i: any) => i.key !== 'view');
    return actions;
};
const add = () => {
    (current.value = {
        name: '',
        description: '',
    }),
        (visible.value = true);
};
/**
 * 刷新数据
 */
const refresh = () => {
    tableRef.value?.reload();
};
const handleSearch = (e: any) => {
    params.value = e;
};
const openRuleEditor = (item: any) => {
    window.open(
        `/${BASE_API_PATH}/rule-editor/index.html#flow/${item.id}`,
    );
};
const closeSave = () => {
    visible.value = false;
};
onMounted(() => {
    if (history.state?.params) {
        add();
    }
});
</script>
<style scoped>
</style>