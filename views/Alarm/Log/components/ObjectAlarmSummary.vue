<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
defineProps<{ value: { alarmCount: number; oldestAlarmTime?: string | number | null } }>()
const { t } = useI18n()
</script>
<template>
  <dl class="object-alarm-summary">
    <div><dt>{{ t('ObjectPresentation.activeAlarms') }}</dt><dd>{{ value.alarmCount }}</dd></div>
    <div v-if="value.oldestAlarmTime != null"><dt>{{ t('ObjectPresentation.earliestActiveAlarm') }}</dt><dd>{{ dayjs(value.oldestAlarmTime).format('YYYY-MM-DD HH:mm:ss') }}</dd></div>
  </dl>
</template>
<style scoped>
.object-alarm-summary { display: flex; flex-wrap: wrap; gap: var(--space-2, 8px) var(--space-4, 16px); margin: 0; }
.object-alarm-summary > div { display: flex; align-items: baseline; gap: var(--space-2, 8px); }
.object-alarm-summary dt { font-size: var(--ant-font-size-sm, 12px); color: var(--ink-2); }.object-alarm-summary dd { margin: 0; font-variant-numeric: tabular-nums; }
</style>
