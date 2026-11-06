<template>
  <a-card class="alarm-handling-card" :bordered="false" :body-style="{ padding: standalone ? '0' : '12px' }">
    <div v-if="!standalone" class="alarm-handling-card__head">
      <span class="alarm-handling-card__icon" :class="vision ? 'is-vision' : 'is-iot'"><AIcon :type="vision ? 'WarningOutlined' : 'AlertOutlined'" /></span>
      <span class="alarm-handling-card__title">{{ title }}</span>
    </div>
    <div v-if="data.failed" class="alarm-handling-card__chart alarm-handling-card__empty" role="alert">
      <CloudEmpty :description="t('alarmDashboard.loadError')" :image-style="{ height: '48px' }" />
    </div>
    <div v-else class="alarm-handling-card__chart" role="img" :aria-label="summary">
      <Echarts :option="option" :library="libraries" />
    </div>
  </a-card>
</template>
<script setup lang="ts">
import { theme } from 'ant-design-vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { BarChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import dayjs from 'dayjs'
import Echarts from '@jetlinks-web-core/components/Echarts'
import { useAlarmTypography } from '../hooks/useAlarmTypography'
import type { AlarmHandlingStats, AlarmQueryRange } from '../dashboard.types'

const props = defineProps<{ title: string; data: AlarmHandlingStats; range?: AlarmQueryRange; vision?: boolean; standalone?: boolean }>()
const { t, locale } = useI18n()
const { token } = theme.useToken()
const chartTextStyle = useAlarmTypography()
const libraries = [BarChart, GridComponent, LegendComponent, TitleComponent, TooltipComponent]
const format = (value: number | null) => value === null ? t('alarmDashboard.handling.noData') : value.toLocaleString(locale.value)
const segments = computed(() => [
  { key: 'handled' as const, label: t('alarmDashboard.handling.handled'), value: props.data.handled, color: token.value.colorSuccess },
  { key: 'active' as const, label: t('alarmDashboard.handling.active'), value: props.data.active, color: token.value.colorWarning },
])
const summary = computed(() => [
  t('alarmDashboard.handling.total') + ' ' + format(props.data.total),
  ...segments.value.map(segment => segment.label + ' ' + format(segment.value)),
].join(', '))
const option = computed(() => ({
  animation: false,
  textStyle: chartTextStyle.value,
  title: {
    text: t('alarmDashboard.handling.total') + '  ' + format(props.data.total),
    left: 0, top: 0, padding: 0,
    textStyle: chartTextStyle.value,
  },
  tooltip: {
    trigger: 'axis', axisPointer: { type: 'shadow' }, renderMode: 'html', appendTo: 'body',
    backgroundColor: token.value.colorBgSpotlight, borderWidth: 0, borderRadius: token.value.borderRadius,
    textStyle: { fontFamily: chartTextStyle.value.fontFamily, fontWeight: 400, color: token.value.colorTextLightSolid, fontSize: token.value.fontSize },
    valueFormatter: (value: number) => format(value),
  },
  legend: {
    top: 0, right: 0, padding: 0, selectedMode: false, icon: 'circle', itemWidth: 8, itemHeight: 8, itemGap: 16,
    textStyle: chartTextStyle.value,
    data: segments.value.map(segment => segment.label),
    formatter: (name: string) => name + '  ' + format(segments.value.find(segment => segment.label === name)?.value ?? null),
  },
  grid: { top: 44, bottom: 24, left: 8, right: 12, containLabel: true },
  // 窄卡将图例放到总量下一行，恢复宽度后回到右上同一行。
  media: [
    { query: { maxWidth: 520 }, option: {
      legend: { top: 24, itemGap: 12 }, grid: { top: 68 },
    } },
    { option: { legend: { top: 0, itemGap: 16 }, grid: { top: 44 } } },
  ],
  xAxis: {
    type: 'category', data: props.data.points.map(point => dayjs(point.timestamp).format('YYYY-MM-DD HH:mm')),
    axisLabel: {
      ...chartTextStyle.value, hideOverlap: true,
      formatter: (value: string) => dayjs(value).format(props.range?.interval === '1d' ? 'MM-DD' : 'HH:mm'),
    },
    axisTick: { show: false }, axisLine: { lineStyle: { color: token.value.colorBorderSecondary } },
  },
  yAxis: {
    type: 'value', min: 0, minInterval: 1, splitNumber: 3,
    axisLabel: { ...chartTextStyle.value,
      formatter: (value: number) => !props.data.total && value > 0 ? ''
        : value.toLocaleString(locale.value, { notation: 'compact', maximumFractionDigits: 1 }) },
    splitLine: { show: Boolean(props.data.total), lineStyle: { color: token.value.colorBorderSecondary, type: 'dashed' } },
  },
  series: segments.value.map(segment => ({
    name: segment.label, type: 'bar', stack: 'handling', barWidth: '55%', barMaxWidth: 24,
    itemStyle: { color: segment.color },
    // 多时间桶保留精简图形，精确数量通过同轴提示读取，避免标签互相遮挡。
    label: { show: false },
    data: props.data.points.map(point => point[segment.key]),
  })),
}))
</script>
<style scoped>
.alarm-handling-card { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; height: 100%; background: transparent; border: 0; border-radius: 6px; box-shadow: none; color: inherit; container: alarm-handling-card / inline-size; }
.alarm-handling-card :deep(.ant-card-body) { height: 100%; display: flex; flex-direction: column; flex: 1; min-height: 0; }
.alarm-handling-card__head { display: flex; align-items: center; gap: 8px; min-width: 0; margin-bottom: 12px; }
.alarm-handling-card__icon { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; flex: none; }
.alarm-handling-card__icon.is-iot { color: var(--ant-color-primary, #1677ff); background: var(--ant-color-primary-bg, #eaf3ff); }
.alarm-handling-card__icon.is-vision { color: #13a8e8; background: #eaf8fe; }
.alarm-handling-card__title { font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
.alarm-handling-card__chart { width: 100%; flex: 1; min-height: 176px; min-width: 0; }
.alarm-handling-card__empty { display: flex; align-items: center; justify-content: center; }
@container alarm-handling-card (max-width: 420px) {
  .alarm-handling-card__chart { min-height: 152px; }
}
</style>
