<template>
  <CloudEmpty v-if="!items.length" :description="t('alarmDashboard.noStatistics')" />
  <div v-else ref="chartContainer" class="alarm-ranking-scroll">
    <div class="alarm-ranking-chart" :style="{ height: Math.max(260, items.length * 32 + 36) + 'px' }">
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
import type { AlarmRankItem } from '../dashboard.types'
const props = defineProps<{ items: AlarmRankItem[]; vision: boolean; preview: boolean }>()
const { t } = useI18n()
const { token } = theme.useToken()
const libraries = [BarChart, GridComponent, TooltipComponent]
const chartContainer = ref<HTMLDivElement>()
const { width: chartWidth } = useElementSize(chartContainer)
// 名称列跟随卡片宽度伸缩，同时为柱图和数量保留空间。
const labelWidth = computed(() => Math.round(Math.min(192, Math.max(80, (chartWidth.value || 400) * 0.24))))

/** 只补全被省略的轴标签；短名称直接阅读，柱子继续展示原有名称与数量。 */
function formatAxisLabelTooltip(params: { value: string; isTruncated: () => boolean }) {
  return params.isTruncated() ? echartsFormat.encodeHTML(params.value) : ''
}
const labels = computed(() => props.items.map(item => props.preview && item.name.startsWith('preview.')
  ? t('alarmDashboard.' + item.name) : item.name))
const option = computed(() => ({
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, renderMode: 'html', appendTo: 'body',
    backgroundColor: token.value.colorBgSpotlight, borderWidth: 0, borderRadius: token.value.borderRadius,
    textStyle: { color: token.value.colorTextLightSolid, fontSize: token.value.fontSize },
    extraCssText: 'max-width: min(360px, calc(100vw - 32px)); white-space: normal; overflow-wrap: anywhere;',
  },
  grid: { top: 8, bottom: 24, left: 8, right: 28, containLabel: true },
  xAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#eceff3' } }, axisLabel: { color: '#86909c' } },
  yAxis: {
    type: 'category', inverse: true, data: labels.value,
    tooltip: { show: true, formatter: formatAxisLabelTooltip },
    axisLine: { show: false }, axisTick: { show: false },
    axisLabel: { color: '#4e5969', width: labelWidth.value, overflow: 'truncate' },
  },
  series: [{
    name: t('alarmDashboard.count'), type: 'bar', barMaxWidth: 12,
    itemStyle: { color: props.vision ? '#13a8e8' : '#1677ff', borderRadius: [0, 2, 2, 0] },
    data: props.items.map(item => item.count),
  }],
}))
</script>
<style scoped>
.alarm-ranking-scroll { height: 100%; min-height: 0; overflow: auto; scrollbar-width: thin; }
.alarm-ranking-chart { width: 100%; min-height: 100%; }
</style>

