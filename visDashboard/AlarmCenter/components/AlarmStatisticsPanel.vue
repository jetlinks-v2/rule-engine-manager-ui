<template>
  <CloudEmpty v-if="!visibleItems.length" class="alarm-ranking-empty" :description="t('alarmDashboard.noStatistics')" />
  <div v-else ref="chartContainer" class="alarm-ranking-scroll">
    <div class="alarm-ranking-chart">
      <Echarts :option="option" :library="libraries" />
    </div>
  </div>
</template>
<script setup lang="ts">
import { theme } from 'ant-design-vue'
import { computed, ref } from 'vue'
import { useElementSize } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { BarChart } from 'echarts/charts'
import { format as echartsFormat } from 'echarts/core'
import { GridComponent, TooltipComponent } from 'echarts/components'
import Echarts from '@jetlinks-web-core/components/Echarts'
import { useAlarmTypography } from '../hooks/useAlarmTypography'
import { alarmRankingLimit, type AlarmRankItem } from '../dashboard.types'
const props = defineProps<{ items: AlarmRankItem[]; vision: boolean; preview: boolean }>()
const { t, locale } = useI18n()
// 完整结果留给查看更多弹窗；历史配置中的数量不改变卡片前十规则。
const visibleItems = computed(() => props.items.slice(0, alarmRankingLimit))
const { token } = theme.useToken()
const chartTextStyle = useAlarmTypography()
const libraries = [BarChart, GridComponent, TooltipComponent]
const chartContainer = ref<HTMLDivElement>()
const { width: chartWidth } = useElementSize(chartContainer)
// 名称列跟随卡片宽度伸缩，同时为柱图和数量保留空间。
const labelWidth = computed(() => Math.round(Math.min(192, Math.max(80, (chartWidth.value || 400) * 0.24))))

/** 只补全被省略的轴标签；短名称直接阅读，柱子继续展示原有名称与数量。 */
function formatAxisLabelTooltip(params: { value: string; isTruncated: () => boolean }) {
  return params.isTruncated() ? echartsFormat.encodeHTML(params.value) : ''
}
const labels = computed(() => visibleItems.value.map(item => props.preview && item.name.startsWith('preview.')
  ? t('alarmDashboard.' + item.name) : item.name))
const option = computed(() => ({
  textStyle: chartTextStyle.value,
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, renderMode: 'html', appendTo: 'body',
    backgroundColor: token.value.colorBgSpotlight, borderWidth: 0, borderRadius: token.value.borderRadius,
    textStyle: { fontFamily: chartTextStyle.value.fontFamily, fontWeight: 400, color: token.value.colorTextLightSolid, fontSize: token.value.fontSize },
    extraCssText: 'max-width: min(360px, calc(100vw - 32px)); white-space: normal; overflow-wrap: anywhere;',
  },
  grid: { top: 8, bottom: 24, left: 8, right: 64, containLabel: true },
  xAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#eceff3' } }, axisLabel: chartTextStyle.value },
  yAxis: {
    type: 'category', inverse: true, data: labels.value,
    tooltip: { show: true, formatter: formatAxisLabelTooltip },
    axisLine: { show: false }, axisTick: { show: false },
    axisLabel: { ...chartTextStyle.value, width: labelWidth.value, overflow: 'truncate' },
  },
  series: [{
    name: t('alarmDashboard.count'), type: 'bar', barMaxWidth: 12,
    itemStyle: { color: props.vision ? '#13a8e8' : '#1677ff', borderRadius: [0, 2, 2, 0] },
    label: { ...chartTextStyle.value, show: true, position: 'right', color: token.value.colorText,
      formatter: (params: { value: number }) => params.value.toLocaleString(locale.value) },
    data: visibleItems.value.map(item => item.count),
  }],
}))
</script>
<style scoped>
.alarm-ranking-empty { display: flex; flex: 1; min-height: 0; align-items: center; justify-content: center; }
.alarm-ranking-scroll { flex: 1; height: 100%; min-height: 0; overflow: hidden; }
.alarm-ranking-chart { width: 100%; height: 100%; }
</style>

