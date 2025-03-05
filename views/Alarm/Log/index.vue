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
import {useAlarmConfigType} from "@ruleEngine/hook/useAlarmConfigType";


const alarmStore = useAlarmStore();
const { data }  = storeToRefs(alarmStore);
const onTabChange = (key:string) =>{
    data.value.tab = key;
}
const { t: $t } = useI18n()

const { supports } = useAlarmConfigType();

const list = computed(() => {
  return [{key: 'all', tab: $t('Log.index.165154-0')}, ...supports.value.map(item => {
    return {
      key: item.value,
      tab: item.label
    }
  })]
})
</script>
<style lang="less" scoped>
</style>
