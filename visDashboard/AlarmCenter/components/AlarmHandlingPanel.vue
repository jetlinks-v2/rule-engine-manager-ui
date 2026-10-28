<template>
  <div class="alarm-handling-panel" :class="{ 'is-single': source }">
    <a-spin :spinning="loading && !isEdit">
      <div class="alarm-handling-panel__grid">
        <div v-for="source in sources" :key="source.key" class="alarm-handling-panel__source">
          <AlarmHandlingCard :title="source.title" :data="source.data" :range="range" :standalone="Boolean(props.source)" :vision="source.key === 'vision'" @retry="$emit('retry')" />
        </div>
      </div>
    </a-spin>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AlarmHandlingData, AlarmHandlingSource, AlarmQueryRange } from '../dashboard.types'
import AlarmHandlingCard from './AlarmHandlingCard.vue'
const props = defineProps<{ value?: AlarmHandlingData; range?: AlarmQueryRange; source?: AlarmHandlingSource; isEdit: boolean; loading: boolean }>()
defineEmits<{ retry: [] }>()
const { t } = useI18n()
const unavailable = { total: null, active: null, handled: null, rate: null, points: [], failed: true }
const sources = computed(() => [
  { key: 'iot', title: t('alarmDashboard.source.iot'), data: props.value?.iot ?? unavailable },
  { key: 'vision', title: t('alarmDashboard.source.vision'), data: props.value?.vision ?? unavailable },
].filter(source => !props.source || source.key === props.source))
</script>
<style scoped>
.alarm-handling-panel { container: alarm-handling / inline-size; display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; }
/* 将画布剩余高度传入图表，卡片拉高后不再把多余空间分到上下两侧。 */
.alarm-handling-panel :deep(.ant-spin-nested-loading),
.alarm-handling-panel :deep(.ant-spin-container) { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.alarm-handling-panel__grid { display: grid; flex: 1; min-height: 0; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0; min-width: 0; }
.alarm-handling-panel__source { display: flex; flex-direction: column; min-width: 0; min-height: 0; padding-right: 20px; }
.alarm-handling-panel__source + .alarm-handling-panel__source { padding: 0 0 0 20px; border-left: 1px solid var(--jet-theme-border-color-1, #eceff3); }
.alarm-handling-panel.is-single .alarm-handling-panel__grid { grid-template-columns: minmax(0, 1fr); }
.alarm-handling-panel.is-single .alarm-handling-panel__source { padding: 0; border: 0; }
@container alarm-handling (max-width: 480px) {
  .alarm-handling-panel__grid { grid-template-columns: minmax(0, 1fr); gap: 16px; }
  .alarm-handling-panel__source { padding-right: 0; }
  .alarm-handling-panel__source + .alarm-handling-panel__source { border-left: 0; border-top: 1px solid var(--jet-theme-border-color-1, #eceff3); padding: 16px 0 0; }
}
</style>
