<template>
  <CloudEmpty v-if="!items.length" :description="t('alarmDashboard.noStatistics')" />
  <div v-else class="alarm-ranking-scroll">
    <div class="alarm-ranking-chart" :style="{ height: Math.max(260, items.length * 32 + 36) + 'px' }">
      <Echarts :option="option" :library="libraries" />
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import Echarts from '@jetlinks-web-core/components/Echarts'
import type { AlarmRankItem } from '../dashboard.types'
const props = defineProps<{ items: AlarmRankItem[]; vision: boolean; preview: boolean }>()
const { t } = useI18n()
const libraries = [BarChart, GridComponent, TooltipComponent]
const labels = computed(() => props.items.map(item => props.preview && item.name.startsWith('preview.')
  ? t('alarmDashboard.' + item.name) : item.name))
const option = computed(() => ({
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, renderMode: 'richText' },
  grid: { top: 8, bottom: 24, left: 8, right: 28, containLabel: true },
  xAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#eceff3' } }, axisLabel: { color: '#86909c' } },
  yAxis: {
    type: 'category', inverse: true, data: labels.value,
    axisLine: { show: false }, axisTick: { show: false },
    axisLabel: { color: '#4e5969', width: 100, overflow: 'truncate' },
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

