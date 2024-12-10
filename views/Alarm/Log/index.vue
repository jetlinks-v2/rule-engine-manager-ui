<template>
    <j-page-container :tabList="true ? list : noList" :tabActiveKey="data.tab" @tabChange="onTabChange">
        <TableComponents :type="data.tab"></TableComponents>
    </j-page-container>
</template>

<script lang="ts" setup>
import { useAlarmStore } from '../../../store/alarm';
import { storeToRefs } from 'pinia';
import  TableComponents  from './TabComponent/index.vue';
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()
const list = [
    {
        key: 'all',
        tab: $t('Log.index.165154-0'),
    },
    {
        key: 'product',
        tab: $t('Log.index.165154-1'),
    },
    {
        key: 'device',
        tab: $t('Log.index.165154-2'),
    },
    {
        key: 'org',
        tab: $t('Log.index.165154-3'),
    },
    {
        key: 'other',
        tab: $t('Log.index.165154-4'),
    },
];
const noList = [
    {
        key: 'all',
        tab: $t('Log.index.165154-0'),
    },
    {
        key: 'product',
        tab: $t('Log.index.165154-1'),
    },
    {
        key: 'device',
        tab: $t('Log.index.165154-2'),
    },
    {
        key: 'other',
        tab: $t('Log.index.165154-4'),
    },
];
const alarmStore = useAlarmStore();
const { data }  = storeToRefs(alarmStore);
const onTabChange = (key:string) =>{
    data.value.tab = key;
}
</script>
<style lang="less" scoped>
</style>