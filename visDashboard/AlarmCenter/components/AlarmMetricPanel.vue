<template>
  <div class="alarm-metric">
    <div class="alarm-metric-main">
      <div class="alarm-metric-heading">
        <span>{{ title }}</span>
        <div class="alarm-metric-value">{{ format(data?.today) }} <small>{{ t('alarmDashboard.unit') }}</small></div>
      </div>
      <AIcon :type="icon" class="alarm-metric-icon" />
    </div>
    <div class="alarm-metric-footer">
      <template v-if="event">
        <a-badge color="cyan" />
        <span>{{ t('alarmDashboard.filterRate') }}</span>
        <strong>{{ data?.filterRate == null ? '--' : data.filterRate + '%' }}</strong>
      </template>
      <template v-else>
        <span v-for="key in statuses" :key="key" class="alarm-metric-status">
          <a-badge :status="statusColors[key]" />
          <span>{{ t('alarmDashboard.' + key) }}</span>
          <strong>{{ format(data?.[key]) }}</strong>
        </span>
      </template>
    </div>
    <div v-if="data?.failed.length" class="alarm-metric-error" role="alert">
      <span>{{ t('alarmDashboard.partialFailed') }}</span>
      <a-button type="link" size="small" @click="$emit('retry')">{{ t('alarmDashboard.retry') }}</a-button>
    </div>
  </div>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { AlarmMetricData } from '../dashboard.types'
defineProps<{ title: string; icon: string; event: boolean; data?: AlarmMetricData }>()
defineEmits<{ retry: [] }>()
const { t, locale } = useI18n()
const statuses = ['total', 'active', 'handled'] as const
const statusColors = { total: 'default', active: 'error', handled: 'success' } as const
const format = (value?: number | null) => value == null ? '--' : value.toLocaleString(locale.value)
</script>
<style scoped>
.alarm-metric { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: auto; gap: 8px; }
.alarm-metric-main { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex: 1; }
.alarm-metric-heading { color: var(--ink-3, #86909c); font-size: 14px; min-width: 0; }
.alarm-metric-value { color: var(--ink-1, #1d2129); font-size: 28px; line-height: 1.35; font-weight: 500; overflow-wrap: anywhere; }
small { font-size: 12px; font-weight: 400; color: var(--ink-3, #86909c); }
.alarm-metric-icon { flex: none; font-size: 28px; color: var(--ant-color-primary, #1677ff); background: var(--ant-color-primary-bg, #e6f4ff); border-radius: var(--r-3, 8px); padding: 10px; }
.alarm-metric-footer { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; padding-top: 8px; border-top: 1px solid var(--jet-theme-border-color-1, #eceff3); font-size: 12px; }
.alarm-metric-status { display: inline-flex; align-items: center; gap: 5px; }
strong { font-weight: 500; }
.alarm-metric-error { font-size: 12px; color: var(--ant-color-error, #ff4d4f); }
</style>

