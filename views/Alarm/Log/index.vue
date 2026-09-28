<template>
    <!-- 斜边页签充当面板顶栏：flush 让它与布局面板贴合。 -->
    <PageChrome flush>
        <SlantedTabs
            class="alarm-log-list__types"
            :activeKey="data.tab"
            :options="list"
            @change="onTabChange"
        />
    </PageChrome>
    <FullPage flex transparent-background class="alarm-log-list">
        <TableComponents :key="data.tab" :type="data.tab"></TableComponents>
    </FullPage>
</template>

<script lang="ts" setup>
import { useAlarmStore } from '@rule-engine-manager-ui/store/alarm';
import { storeToRefs } from 'pinia';
import TableComponents from './TabComponent/index.vue';
import { useI18n } from 'vue-i18n';
import { useAlarmConfigType } from '@rule-engine-manager-ui/hook/useAlarmConfigType';
import SlantedTabs from '@jetlinks-web-core/components/SlantedTabs';
import type { SlantedTabKey, SlantedTabOption } from '@jetlinks-web-core/components/SlantedTabs';

const alarmStore = useAlarmStore();
const { data } = storeToRefs(alarmStore);
const route = useRoute();
data.value.tab = (route.query.tab as string) || 'all';

const onTabChange = (key: SlantedTabKey) => {
    data.value.tab = String(key);
};

const { t: $t } = useI18n();

const { supports } = useAlarmConfigType();

// 页签文案由调用方国际化；数量能力当前未接入，省略 count。
const list = computed<SlantedTabOption[]>(() => {
    return [
        { key: 'all', label: $t('Log.index.165154-0') },
        ...supports.value.map((item) => ({
            key: item.value,
            label: item.label,
        })),
    ];
});
</script>
<style lang="less" scoped>
.alarm-log-list {
    min-width: 0;
    min-height: 0;
    /*
     * 作为布局面板的 flex 项：收缩到面板内容高度，
     * 页内滚动交给卡片列表自身，避免出现第二条滚动条。
     */
    flex: 0 1 auto;
    overflow: hidden;
}

.alarm-log-list__types {
    --slanted-tabs-background: transparent;
    z-index: 2;
}
</style>
