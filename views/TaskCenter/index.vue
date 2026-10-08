<template>
    <j-page-container>
        <pro-search
            :columns="searchColumns"
            target="task-center"
            @search="handleSearch"
        />
        <FullPage>
            <JProTable
                ref="tableRef"
                modeValue="CARD"
                :columns="columns"
                :request="queryTasks"
                :params="params"
                :defaultParams="defaultParams"
            >
                <template #headerLeftRender>
                    <a-button @click="refresh">
                        <template #icon><AIcon type="ReloadOutlined" /></template>
                        {{ $t('TaskCenter.index.refresh') }}
                    </a-button>
                </template>
                <template #card="task">
                    <CardBox
                        :value="task"
                        :actions="getActions()"
                        :status="task.executeState?.value"
                        :statusText="task.executeState?.text"
                        :statusNames="executeStatusNames"
                        @click="openLogs"
                    >
                        <template #img>
                            <div class="task-icon">
                                <AIcon type="ScheduleOutlined" />
                            </div>
                        </template>
                        <template #content>
                            <j-ellipsis class="task-name">
                                {{ task.name }}
                            </j-ellipsis>
                            <div class="task-description">
                                <j-ellipsis>{{ task.description || '--' }}</j-ellipsis>
                            </div>
                            <a-row :gutter="16" class="task-metrics">
                                <a-col :span="8">
                                    <span class="metric-label">{{ $t('TaskCenter.index.enabledState') }}</span>
                                    <j-ellipsis>{{ task.enabledState?.text || '--' }}</j-ellipsis>
                                </a-col>
                                <a-col :span="8">
                                    <span class="metric-label">{{ $t('TaskCenter.index.nodeCount') }}</span>
                                    <div>{{ task.nodeCount ?? 0 }}</div>
                                </a-col>
                                <a-col :span="8">
                                    <span class="metric-label">{{ $t('TaskCenter.index.runningCount') }}</span>
                                    <div>{{ task.runningNodeCount ?? 0 }}</div>
                                </a-col>
                            </a-row>
                            <a-row :gutter="16" class="task-metrics">
                                <a-col :span="8">
                                    <span class="metric-label">{{ $t('TaskCenter.index.abnormalCount') }}</span>
                                    <div :class="{ 'abnormal-count': task.abnormalNodeCount > 0 }">
                                        {{ task.abnormalNodeCount ?? 0 }}
                                    </div>
                                </a-col>
                                <a-col :span="16">
                                    <span class="metric-label">{{ $t('TaskCenter.index.lastStateTime') }}</span>
                                    <j-ellipsis>{{ formatTime(task.lastStateTime) }}</j-ellipsis>
                                </a-col>
                            </a-row>
                        </template>
                    </CardBox>
                </template>
            </JProTable>
        </FullPage>
        <LogDrawer
            v-if="currentTask"
            :task="currentTask"
            @close="currentTask = undefined"
        />
    </j-page-container>
</template>

<script setup lang="ts">
import dayjs from 'dayjs';
import { useI18n } from 'vue-i18n';
import { queryTasks, type TaskCenterTask } from '../../api/taskCenter';
import LogDrawer from './LogDrawer.vue';

const { t: $t } = useI18n();
const tableRef = ref<Record<string, any>>();
const params = ref<Record<string, unknown>>({});
const currentTask = ref<TaskCenterTask>();

const executeStatusNames: Record<string, string> = {
    notRunning: 'default',
    initializing: 'warning',
    running: 'processing',
    paused: 'warning',
    abnormal: 'error',
};

const defaultParams = {
    sorts: [{ name: 'modifyTime', order: 'desc' }],
};

const searchColumns = [
    {
        title: $t('TaskCenter.index.name'),
        dataIndex: 'name',
        key: 'name',
        search: { type: 'string' },
    },
    {
        title: $t('TaskCenter.index.enabledState'),
        dataIndex: 'state',
        key: 'state',
        search: {
            type: 'select',
            options: [
                { label: $t('TaskCenter.index.enabled'), value: 'started' },
                { label: $t('TaskCenter.index.disabled'), value: 'disable' },
            ],
        },
    },
];

const columns = [
    { title: $t('TaskCenter.index.name'), dataIndex: 'name', key: 'name' },
    { title: $t('TaskCenter.index.executeState'), dataIndex: 'executeState', key: 'executeState' },
    { title: $t('TaskCenter.index.enabledState'), dataIndex: 'enabledState', key: 'enabledState' },
    { title: $t('TaskCenter.index.nodeCount'), dataIndex: 'nodeCount', key: 'nodeCount' },
];

const getActions = () => [
    {
        key: 'logs',
        text: $t('TaskCenter.index.viewLogs'),
        icon: 'FileSearchOutlined',
        hasPermission: true,
        onClick: (task: TaskCenterTask) => openLogs(task),
    },
];

const handleSearch = (value: Record<string, unknown>) => {
    params.value = value;
};

const refresh = () => tableRef.value?.reload();
const openLogs = (task: TaskCenterTask) => {
    currentTask.value = task;
};
const formatTime = (value?: number) =>
    value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '--';
</script>

<style scoped lang="less">
.task-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    color: @primary-color;
    font-size: 30px;
    background: rgba(24, 144, 255, 0.08);
    border-radius: 8px;
}

.task-name {
    width: calc(100% - 110px);
    font-size: 16px;
    font-weight: 600;
}

.task-description {
    height: 22px;
    margin-top: 8px;
    color: rgba(0, 0, 0, 0.45);
}

.task-metrics {
    margin-top: 14px !important;
}

.metric-label {
    display: block;
    margin-bottom: 4px;
    color: rgba(0, 0, 0, 0.45);
    font-size: 12px;
}

.abnormal-count {
    color: @error-color;
    font-weight: 600;
}
</style>
