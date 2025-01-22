<template>
    <j-page-container :tabList="list" :tabActiveKey="data.tab" @tabChange="onTabChange">
        <TableComponents :type="data.tab"></TableComponents>
    </j-page-container>
</template> 

<script lang="ts" setup>
import { useAlarmStore } from '../../../store/alarm';
import { storeToRefs } from 'pinia';
import  TableComponents  from './TabComponent/index.vue';
import { useI18n } from 'vue-i18n';
import { isNoCommunity } from '@/utils/utils';


const list  = ref()
const alarmStore = useAlarmStore();
const { data }  = storeToRefs(alarmStore);
const onTabChange = (key:string) =>{
    data.value.tab = key;
}
const { t: $t } = useI18n()

onMounted(()=>{
    list.value = isNoCommunity ?  [
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
        key: 'organization',
        tab: $t('Log.index.165154-3'),
    },
    {
        key: 'scene',
        tab: $t('Log.index.165154-4'),
    },
]  :  [
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
        key: 'scene',
        tab: $t('Log.index.165154-4'),
    },
];
}
)
</script>
<style lang="less" scoped>
</style>