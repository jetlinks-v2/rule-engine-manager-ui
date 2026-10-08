<template>
    <a-drawer
        :open="true"
        :width="1000"
        :title="$t('TaskCenter.LogDrawer.title', [task.name])"
        :destroyOnClose="true"
        @close="emit('close')"
    >
        <JProTable
            modeValue="TABLE"
            :columns="columns"
            :request="requestLogs"
            :defaultParams="defaultParams"
            :scroll="{ x: 920 }"
        >
            <template #logTime="row">
                {{ formatTime(row.timestamp || row.createTime) }}
            </template>
            <template #level="row">
                <a-tag :color="levelColors[row.level?.toLowerCase()]">
                    {{ row.level || '--' }}
                </a-tag>
            </template>
            <template #nodeId="row">
                <j-ellipsis>{{ row.nodeId || '--' }}</j-ellipsis>
            </template>
            <template #message="row">
                <j-ellipsis :tooltip="true">{{ row.message || '--' }}</j-ellipsis>
            </template>
            <template #context="row">
                <j-ellipsis :tooltip="true">{{ formatContext(row.context) }}</j-ellipsis>
            </template>
        </JProTable>
    </a-drawer>
</template>

<script setup lang="ts">
import dayjs from 'dayjs';
import { useI18n } from 'vue-i18n';
import {
    queryTaskLogs,
    type TaskCenterTask,
} from '../../api/taskCenter';

const props = defineProps<{
    task: TaskCenterTask;
}>();
const emit = defineEmits<{
    (event: 'close'): void;
}>();
const { t: $t } = useI18n();

const levelColors: Record<string, string> = {
    error: 'error',
    warn: 'warning',
    warning: 'warning',
    info: 'processing',
    debug: 'success',
};

const defaultParams = {
    sorts: [{ name: 'timestamp', order: 'desc' }],
};

const columns = [
    {
        title: $t('TaskCenter.LogDrawer.time'),
        dataIndex: 'logTime',
        key: 'logTime',
        width: 180,
        scopedSlots: true,
    },
    {
        title: $t('TaskCenter.LogDrawer.level'),
        dataIndex: 'level',
        key: 'level',
        width: 100,
        scopedSlots: true,
    },
    {
        title: $t('TaskCenter.LogDrawer.nodeId'),
        dataIndex: 'nodeId',
        key: 'nodeId',
        width: 180,
        scopedSlots: true,
    },
    {
        title: $t('TaskCenter.LogDrawer.message'),
        dataIndex: 'message',
        key: 'message',
        width: 280,
        scopedSlots: true,
    },
    {
        title: $t('TaskCenter.LogDrawer.context'),
        dataIndex: 'context',
        key: 'context',
        width: 260,
        scopedSlots: true,
    },
];

const requestLogs = (params: Record<string, unknown>) =>
    queryTaskLogs(props.task.id, params);

// 兼容历史日志使用 createTime、新日志使用 timestamp 的情况。
const formatTime = (value?: number) =>
    value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '--';

const formatContext = (context: unknown) => {
    if (context === undefined || context === null || context === '') {
        return '--';
    }
    return typeof context === 'string' ? context : JSON.stringify(context);
};
</script>
