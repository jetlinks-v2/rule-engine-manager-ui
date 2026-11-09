<template>
  <div class="alarm-metric">
    <div class="alarm-metric-main">
      <div class="alarm-metric-heading">
        <h3 class="alarm-metric-title">{{ title }}</h3>
        <div class="alarm-metric-value" :title="data?.failed.includes('today') ? t('alarmDashboard.partialFailed') : undefined">{{ format('today') }} <small>{{ t('alarmDashboard.unit') }}</small></div>
      </div>
      <slot name="hint"><AIcon :type="icon" class="alarm-metric-icon" /></slot>
    </div>
    <div class="alarm-metric-footer">
      <template v-if="event">
        <a-badge color="cyan" />
        <span>{{ t('alarmDashboard.filterRate') }}</span>
        <strong :title="data?.failed.includes('filterRate') ? t('alarmDashboard.partialFailed') : undefined">{{ format('filterRate', true) }}</strong>
      </template>
      <template v-else>
        <span v-for="key in statuses" :key="key" class="alarm-metric-status">
          <a-badge :status="statusColors[key]" />
          <span>{{ t('alarmDashboard.' + key) }}</span>
          <strong :title="data?.failed.includes(key) ? t('alarmDashboard.partialFailed') : undefined">{{ format(key) }}</strong>
        </span>
      </template>
    </div>
  </div>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { AlarmMetricData } from '../dashboard.types'
const props = defineProps<{ title: string; icon: string; event: boolean; data?: AlarmMetricData }>()
const { t, locale } = useI18n()
const statuses = ['total', 'active', 'handled'] as const
const statusColors = { total: 'default', active: 'error', handled: 'success' } as const
const format = (key: 'today' | 'filterRate' | typeof statuses[number], percent = false) => props.data?.failed.includes(key)
  ? '—' : (props.data?.[key] ?? 0).toLocaleString(locale.value) + (percent ? '%' : '')
</script>
<style scoped>
.alarm-metric { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: auto; gap: 4px; }
.alarm-metric-main { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex: 1; }
.alarm-metric-heading { color: var(--jet-theme-text-secondary, #64748b); min-width: 0; }
.alarm-metric-title { margin: 0; color: var(--jet-theme-text-secondary, #64748b); font-size: 13px; font-weight: 500; line-height: 20px; }
.alarm-metric-value { display: flex; align-items: baseline; gap: 6px; margin-top: 4px; color: var(--jet-theme-text, #17243b); font-size: 24px; line-height: 28px; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
small { font-size: 12px; font-weight: 400; line-height: 20px; color: var(--jet-theme-text-secondary, #86909c); }
.alarm-metric-icon { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 42px; width: 42px; height: 42px; font-size: 20px; color: var(--jet-theme-primary, #1677ff); background: var(--jet-theme-primary-bg, #edf5ff); border-radius: 10px; }
.alarm-metric-footer { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; padding-top: 10px; border-top: 1px solid #f0f2f5; font-size: 12px; line-height: 18px; color: var(--jet-theme-text-secondary, #86909c); }
.alarm-metric-status { display: inline-flex; align-items: center; gap: 5px; }
strong { color: var(--jet-theme-text, #334155); font-weight: 500; font-variant-numeric: tabular-nums; }
</style>

