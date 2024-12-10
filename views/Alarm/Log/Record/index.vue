<template>
    <j-page-container>
        <pro-search
            :columns="columns"
            target="bind-channel"
            @search="handleSearch"
        />
        <FullPage>
            <JProTable
                mode="TABLE"
                :columns="columns"
                :defaultParams="{
                    sorts: [{ name: 'createTime', order: 'desc' }],
                    terms,
                }"
                :request="queryHandleHistory"
                :params="params"
            >
                <template #headerLeftRender>
                    <h3>{{ $t('Record.index.165150-0') }}</h3>
                </template>
                <template #handleTime="slotsProps">
                    <span>
                        {{
                            dayjs(slotsProps.handleTime).format(
                                'YYYY-MM-DD HH:mm:ss',
                            )
                        }}
                    </span>
                </template>
                <template #handleType="slotProps">
                    <span>{{ slotProps.handleType?.text }}</span>
                </template>
                <template #alarmDuration="slotProps">
                    <j-ellipsis><Duration :data="slotProps" /></j-ellipsis>
                </template>
                <template #alarmTime="slotProps">
                    <span>
                        {{
                            dayjs(slotProps.alarmTime).format(
                                'YYYY-MM-DD HH:mm:ss',
                            )
                        }}
                    </span>
                </template>
            </JProTable>
        </FullPage>
    </j-page-container>
</template>

<script lang="ts" setup>
import { queryHandleHistory } from '../../../../api/log';
import dayjs from 'dayjs';
import { useRoute } from 'vue-router';
import Duration from '../components/Duration.vue';
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()
const route = useRoute();
const id = route.query?.id;
const terms = [
    {
        column: 'alarmRecordId',
        termType: 'eq',
        value: id,
        type: 'and',
    },
];
const columns = [
    {
        title: $t('Record.index.165150-1'),
        dataIndex: 'handleTime',
        key: 'handleTime',
        scopedSlots: true,
        width: 180,
        search: {
            type: 'date',
        },
    },
    {
        dataIndex: 'handleType',
        title: $t('Record.index.165150-2'),
        key: 'handleType',
        scopedSlots: true,
        width: 120,
        search: {
            type: 'select',
            options: [
                {
                    label: $t('Record.index.165150-3'),
                    value: 'system',
                },
                {
                    label: $t('Record.index.165150-4'),
                    value: 'user',
                },
            ],
        },
    },
    {
        title: $t('Record.index.165150-5'),
        dataIndex: 'alarmTime',
        key: 'alarmTime',
        scopedSlots: true,
        search: {
            type: 'date',
        },
        width: 180,
    },
    {
        title: $t('Record.index.165150-6'),
        dataIndex: 'alarmDuration',
        key: 'alarmDuration',
        scopedSlots: true,
        width: 180,
    },
    {
        title: $t('Record.index.165150-7'),
        dataIndex: 'description',
        key: 'description',
        ellipsis: true,
        search: {
            type: 'string',
        },
    },
];
const params = ref();
const emit = defineEmits(['closeLog']);
/**
 * 关闭弹窗
 */

const handleSearch = (e: any) => {
    params.value = e;
};
const calculateDuration = (startTime, endTime) => {
    const diffInSeconds = endTime.diff(startTime, 'second');
    let result;

    if (diffInSeconds < 60) {
        result = `${diffInSeconds.toFixed(1)} s`;
    } else if (diffInSeconds < 3600) {
        result = `${(diffInSeconds / 60).toFixed(1)} min`;
    } else {
        result = `${(diffInSeconds / 3600).toFixed(1)} h`;
    }
    return result;
};
</script>
<style lang="less" scoped></style>
