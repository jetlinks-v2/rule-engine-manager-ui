<template>
  <a-card class="alarm-handling-card" :class="{ 'is-active': expanded, 'is-disabled': disabled, 'is-standalone': standalone }" :bordered="false"
    :body-style="{ padding: standalone ? '0' : '12px' }" role="button" :tabindex="disabled ? -1 : 0" :aria-label="title"
    :aria-disabled="disabled" :aria-expanded="expanded"
    @keydown.enter.prevent="!disabled && $emit('activate')" @keydown.space.prevent="!disabled && $emit('activate')">
    <div v-if="!standalone" class="alarm-handling-card__head">
      <span class="alarm-handling-card__icon" :class="vision ? 'is-vision' : 'is-iot'"><AIcon :type="vision ? 'WarningOutlined' : 'AlertOutlined'" /></span>
      <span class="alarm-handling-card__title">{{ title }}</span>
    </div>
    <a-alert v-if="data.failed" class="alarm-handling-card__error" type="error" show-icon :message="t('alarmDashboard.loadError')">
      <template #action><a-button type="link" size="small" @click.stop="$emit('retry')">{{ t('alarmDashboard.retry') }}</a-button></template>
    </a-alert>
    <div v-else class="alarm-handling-card__metrics">
      <div class="alarm-handling-card__pending">
        <span class="alarm-handling-card__label">{{ t('alarmDashboard.handling.active') }}</span>
        <strong class="alarm-handling-card__value">{{ format(data.active) }}</strong>
        <span class="alarm-handling-card__action"><span>{{ t('alarmDashboard.handling.viewPending') }}</span><AIcon type="RightOutlined" /></span>
      </div>
      <div>
        <span class="alarm-handling-card__label">{{ t('alarmDashboard.handling.total') }}</span>
        <b class="alarm-handling-card__value">{{ format(data.total) }}</b>
      </div>
      <div>
        <span class="alarm-handling-card__label">{{ t('alarmDashboard.handling.handled') }}</span>
        <b class="alarm-handling-card__value">{{ format(data.handled) }}</b>
      </div>
      <div class="alarm-handling-card__rate">
        <span class="alarm-handling-card__label">{{ t('alarmDashboard.handling.rate') }}</span>
        <b class="alarm-handling-card__value">{{ formatRate(data.rate) }}</b>
        <div v-if="data.total !== null && data.total > 0" class="alarm-handling-card__progress" role="img" :aria-label="t('alarmDashboard.handling.rate') + ' ' + formatRate(data.rate)">
          <span class="is-handled" :style="{ width: (data.rate ?? 0) + '%' }" />
          <span class="is-pending" :style="{ width: (100 - (data.rate ?? 0)) + '%' }" />
        </div>
      </div>
    </div>
  </a-card>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { AlarmHandlingStats } from '../dashboard.types'
defineProps<{ title: string; data: AlarmHandlingStats; vision?: boolean; standalone?: boolean; expanded?: boolean; disabled?: boolean }>()
defineEmits<{ activate: []; retry: [] }>()
const { t } = useI18n()
// 成功零总量沿用 rate=null 契约，在卡片展示为用户约定的 0%；失败分支不渲染这些数字。
const formatRate = (value: number | null) => value === null || value === 0 ? '0%' : value.toFixed(1) + '%'
const format = (value: number | null) => value === null ? t('alarmDashboard.handling.noData') : value.toLocaleString()
</script>
<style scoped>
.alarm-handling-card { min-width: 0; height: 100%; background: transparent; border: 0; border-radius: 6px; box-shadow: none; color: inherit; cursor: pointer; container: alarm-handling-card / inline-size; }
.alarm-handling-card:hover:not(.is-disabled), .alarm-handling-card.is-active { background: var(--ant-color-primary-bg, #eaf3ff); }
.alarm-handling-card.is-standalone:hover:not(.is-disabled), .alarm-handling-card.is-standalone.is-active { background: transparent; }
.alarm-handling-card:focus-visible { outline: 2px solid var(--ant-color-primary, #1677ff); outline-offset: 2px; }
.alarm-handling-card.is-disabled { cursor: default; }
.alarm-handling-card__head { display: flex; align-items: center; gap: 8px; min-width: 0; margin-bottom: 16px; }
.alarm-handling-card__icon { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; flex: none; }
.alarm-handling-card__icon.is-iot { color: var(--ant-color-primary, #1677ff); background: var(--ant-color-primary-bg, #eaf3ff); }
.alarm-handling-card__icon.is-vision { color: #13a8e8; background: #eaf8fe; }
.alarm-handling-card__title { font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
.alarm-handling-card__metrics { display: grid; grid-template-columns: minmax(0, 1.4fr) repeat(3, minmax(0, 1fr)); gap: 20px; width: 100%; }
.alarm-handling-card__metrics > div { min-width: 0; }
.alarm-handling-card__pending { padding-right: 20px; border-right: 1px solid var(--jet-theme-border-color-1, #eceff3); }
.alarm-handling-card__label { display: block; font-size: 13px; line-height: 20px; color: var(--ink-3, #86909c); }
.alarm-handling-card__value { display: block; margin-top: 6px; font-size: clamp(24px, 2.8cqi, 30px); line-height: 40px; font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap; }
.alarm-handling-card__pending .alarm-handling-card__value { font-size: clamp(30px, 3.4cqi, 36px); font-weight: 600; }
.alarm-handling-card__action { display: inline-flex; align-items: center; gap: 4px; margin-top: 6px; font-size: 12px; line-height: 18px; color: var(--ant-color-primary, #1677ff); }
.alarm-handling-card__action :deep(.anticon) { font-size: 10px; }
.alarm-handling-card:hover:not(.is-disabled) .alarm-handling-card__action, .alarm-handling-card.is-active .alarm-handling-card__action { color: var(--ant-color-primary-hover, #4096ff); }
.alarm-handling-card__progress { display: flex; width: 100%; max-width: 112px; height: 4px; margin-top: 13px; overflow: hidden; border-radius: 3px; background: var(--ant-color-fill-tertiary, #eef1f5); }
.alarm-handling-card__progress span { height: 100%; }
.alarm-handling-card__progress .is-handled { background: var(--ant-color-success, #20a87c); }
.alarm-handling-card__progress .is-pending { background: var(--ant-color-fill-tertiary, #eef1f5); }
@container alarm-handling-card (max-width: 420px) {
  .alarm-handling-card__metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px 24px; }
  .alarm-handling-card__pending { padding-right: 0; border-right: 0; }
  .alarm-handling-card__value { font-size: clamp(20px, 7cqi, 26px); line-height: 32px; margin-top: 4px; }
  .alarm-handling-card__pending .alarm-handling-card__value { font-size: clamp(24px, 8cqi, 30px); }
  .alarm-handling-card__label { font-size: 12px; line-height: 18px; }
  .alarm-handling-card__action { margin-top: 4px; }
  .alarm-handling-card__progress { margin-top: 8px; }
}
</style>
