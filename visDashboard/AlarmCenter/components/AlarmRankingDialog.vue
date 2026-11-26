<template>
  <a-modal :open="open" :title="title" :width="800" :footer="null" destroy-on-close @update:open="$emit('update:open', $event)">
    <div class="alarm-ranking-dialog-toolbar">
      <p class="alarm-ranking-dialog-caption">{{ t('alarmDashboard.dimension.' + dimension) }} · {{ t('alarmDashboard.range.today') }}</p>
      <a-input-search v-if="!error" v-model:value="keyword" class="alarm-ranking-dialog-search" allow-clear
        :placeholder="searchPlaceholder" :aria-label="searchPlaceholder" />
    </div>
    <div v-if="error" class="alarm-ranking-dialog-error" role="alert">
      <CloudEmpty :description="t('alarmDashboard.loadError')" :image-style="{ height: '48px' }" />
    </div>
    <a-table v-else row-key="rank" size="small" table-layout="fixed" :columns="columns" :data-source="rows" :loading="loading"
      :pagination="pagination" :scroll="{ y: 'min(60vh, 520px)' }">
      <template #emptyText><CloudEmpty :description="emptyDescription" /></template>
    </a-table>
  </a-modal>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { AlarmDimension, AlarmRankItem } from '../dashboard.types'
import { useAlarmRanking } from '../hooks/useAlarmRanking'
const props = defineProps<{
  open: boolean; title: string; items: AlarmRankItem[]; dimension: AlarmDimension;
  preview: boolean; loading: boolean; error: boolean
}>()
defineEmits<{ 'update:open': [value: boolean] }>()
const { t } = useI18n()
const { keyword, rows, columns, pagination, searchPlaceholder, emptyDescription } = useAlarmRanking(props)
</script>
<style scoped>
.alarm-ranking-dialog-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.alarm-ranking-dialog-search { width: 280px; max-width: 100%; }
.alarm-ranking-dialog-caption { margin: 0; color: var(--ink-3, #86909c); font-size: 12px; }
.alarm-ranking-dialog-error { display: grid; justify-items: center; gap: 8px; }
</style>
