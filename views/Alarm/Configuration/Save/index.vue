<template>
    <j-page-container>
        <a-card>
            <a-tabs :activeKey="activeKey" @change="changeTabs">
                <a-tab-pane key="1" tab="基础配置">
                    <Base v-if="activeKey === '1'" @change="typeChange" />
                </a-tab-pane>
                <a-tab-pane key="2" tab="关联场景联动">
                    <Scene></Scene>
                </a-tab-pane>
                <a-tab-pane key="3" tab="告警记录">
                    <Log v-if="activeKey === '3'" :type="type" />
                </a-tab-pane>
            </a-tabs>
        </a-card>
    </j-page-container>
</template>

<script lang="ts" setup>
import Base from './Base/index.vue';
import Scene from './Scene/index.vue';
import Log from './Log/indev.vue';
import { useRoute } from 'vue-router';
import { onlyMessage } from '@jetlinks-web/utils';
const route = useRoute();
const changeTabs = (e: any) => {
    if (route.query?.id) {
        activeKey.value = e;
    } else {
        onlyMessage('请先保存基础配置', 'error');
    }
};
const activeKey = ref('1');
const type = ref('detail')

const typeChange = (_type: string) => {
  type.value = _type
}
</script>
<style lang="less" scoped>
</style>