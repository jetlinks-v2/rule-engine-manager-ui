<template>
  <main ref="host" class="alarm-dashboard">
    <div v-if="loading" class="alarm-dashboard-loading"><a-spin /></div>
    <a-result v-else-if="errors.length" status="error" :title="t('alarmDashboard.catalogError')">
      <template #extra><a-button @click="reload">{{ t('alarmDashboard.retry') }}</a-button></template>
    </a-result>
    <DashBoardCanvas
      v-else :key="storageKey" :model-value="dashboard" :catalog="catalog"
      :editable="false" :layout-editable="true" :storage-key="storageKey"
      :legacy-storage-keys="legacyStorageKeys" :preview-mode="false"
    />
  </main>
</template>
<script setup lang="ts" name="AlarmCenterDashboard">
import { ref } from 'vue'
import { useElementSize } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { DashBoardCanvas } from '@jetlinks-web-core/components/DashBoardCanvas'
import { useHomeAgentCapabilityProvider } from '@jetlinks-web-core/layout/components/AiChat/useHomeAgentCapabilityProvider'
import { alarmDashboardHomeAgentProvider } from './homeAgentProvider'
import { useAlarmDashboard } from './useAlarmDashboard'

useHomeAgentCapabilityProvider(alarmDashboardHomeAgentProvider)
const { t } = useI18n()
const host = ref<HTMLElement>()
const { width } = useElementSize(host)
const { catalog, dashboard, storageKey, legacyStorageKeys, loading, errors, reload } = useAlarmDashboard(width)
</script>
<style scoped>
.alarm-dashboard { width: 100%; min-height: 0; flex: 0 0 auto; box-sizing: border-box; }
.alarm-dashboard-loading { min-height: 30rem; display: grid; place-items: center; }
/* 与资源中心一致，由外层页面承担纵向滚动，负边距只在横向裁切。 */
.alarm-dashboard :deep(.dashboard-card-layout) { height: auto; overflow: visible; }
/* 保证页面的自然高度规则优先于画布内部嵌套选择器，不受样式加载顺序影响。 */
main.alarm-dashboard :deep(.dashboard-card-layout > .dashboard-card-content) {
  height: auto;
  overflow: visible;
  scrollbar-gutter: auto;
}
.alarm-dashboard :deep(.dashboard-grid) { min-height: 0; overflow-x: clip; overflow-y: visible; }
</style>
