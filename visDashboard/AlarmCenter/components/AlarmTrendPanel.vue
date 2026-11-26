<template>
  <CloudEmpty v-if="!hasData" class="alarm-trend-empty" :description="t('alarmDashboard.noTrend')" />
  <Echarts v-else :option="option" :library="libraries" />
</template>
<script setup lang="ts">
import { theme } from 'ant-design-vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import { BarChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import Echarts from '@jetlinks-web-core/components/Echarts'
import { useAlarmTypography } from '../hooks/useAlarmTypography'
import type { AlarmTimeRange, AlarmTrendSeries } from '../dashboard.types'

const props = defineProps<{ series: AlarmTrendSeries[]; timeRange: AlarmTimeRange }>()
const { t } = useI18n()
const { token } = theme.useToken()
const chartTextStyle = useAlarmTypography()
const libraries = [BarChart, GridComponent, LegendComponent, TooltipComponent]
const hasData = computed(() => props.series.some(item => !item.failed && item.points.length))
const colors = { events: '#1677ff', iot: '#fa8c16', vision: '#13a8e8' }
const option = computed(() => {
  const series = props.series.filter(item => !item.failed)
  const timestamps = [...new Set(series.flatMap(item => item.points.map(point => point.timestamp)))].sort((a, b) => a - b)
  // 某一来源缺少时间桶时保留 null，不把未提供的采样值伪装成 0。
  return {
    textStyle: chartTextStyle.value,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, renderMode: 'html', appendTo: 'body',
      backgroundColor: token.value.colorBgSpotlight, borderWidth: 0, borderRadius: token.value.borderRadius,
      textStyle: { fontFamily: chartTextStyle.value.fontFamily, fontWeight: 400, color: token.value.colorTextLightSolid, fontSize: token.value.fontSize },
      extraCssText: 'max-width: min(360px, calc(100vw - 32px)); white-space: normal; overflow-wrap: anywhere;',
    },
    legend: { top: 0, right: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: chartTextStyle.value },
    grid: { top: 44, bottom: 24, left: 12, right: 12, containLabel: true },
    xAxis: {
      type: 'category',
      data: timestamps.map(timestamp => dayjs(timestamp).format(props.timeRange === 'today' || props.timeRange === 'yesterday' ? 'HH:mm' : 'MM-DD')),
      axisTick: { show: false }, axisLine: { lineStyle: { color: '#eceff3' } },
      axisLabel: { ...chartTextStyle.value, hideOverlap: true },
    },
    yAxis: { type: 'value', minInterval: 1, axisLabel: chartTextStyle.value, splitLine: { lineStyle: { color: '#eceff3' } } },
    series: series.map(item => {
      const counts = new Map(item.points.map(point => [point.timestamp, point.count]))
      return {
        name: t('alarmDashboard.source.' + item.source), type: 'bar', barMaxWidth: 12,
        itemStyle: { color: colors[item.source], borderRadius: [2, 2, 0, 0] },
        data: timestamps.map(timestamp => counts.get(timestamp) ?? null),
      }
    }),
  }
})
</script>
<style scoped>
.alarm-trend-empty { height: 100%; display: flex; align-items: center; justify-content: center; }
</style>

