<template>
  <div
    class="alarm-card"
    :style="_style"
  >
    <Guide>
      <template #title>
        <a-space style="margin-right: 24px">
          <span>{{ _data.topTitle }}</span>
          <template v-if="selectOpt.length > 1">
            <template v-if="selectOpt.length === 2">
              <div class="type-list">
                <div
                  v-for="item in selectOpt"
                  :key="item.value"
                  class="type-item"
                  :class="{ active: queryCodition.targetType.includes(item.value) }"
                  @click="handleTypeChange(item.value)"
                >
                  {{ item.label }}
                </div>
              </div>
            </template>
            <a-select
              v-else
              v-model:value="queryCodition.targetType"
              :options="selectOpt"
              style="width: 120px"
              @change="selectChange"
            ></a-select>
          </template>
        </a-space>
      </template>
      <template #extra>
        <TimeSelect
          ref="timeSelectRef"
          key="flow-static"
          :quickBtn="_data.quickBtn"
          :type="_data.defaultType"
          :quickBtnList="QUICK_BTN_LIST"
          @change="initQueryTime"
        />
      </template>
    </Guide>
    <div class="alarmBox">
      <div class="alarmStatistics-chart">
        <v-chart
          class="chart"
          :option="alarmStatisticsOption"
          autoresize
        />
      </div>
      <div class="alarmRank">
        <h4>{{ $t('AlertStats.index.100002-0') }}</h4>
        <ul
          v-if="state.ranking.length"
          class="rankingList"
        >
          <li
            v-for="(item, i) in state.ranking"
            :key="item.targetId"
          >
            <img
              :src="dashBoardImg.rank[i]"
              alt=""
            />
            <span
              class="rankingItemTitle"
              :title="item.targetName"
            >
              {{ item.targetName }}
            </span>
            <span class="rankingItemValue">{{ item.count }}</span>
          </li>
        </ul>
        <div
          v-else
          class="empty-body"
        >
          <a-empty :image="Empty.PRESENTED_IMAGE_SIMPLE"></a-empty>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts" name="AlertStats">
import rank1 from '@visualization-dashboard-ui/assets/dashboard/ranking/1.png'
import rank2 from '@visualization-dashboard-ui/assets/dashboard/ranking/2.png'
import rank3 from '@visualization-dashboard-ui/assets/dashboard/ranking/3.png'
import rank4 from '@visualization-dashboard-ui/assets/dashboard/ranking/4.png'
import rank5 from '@visualization-dashboard-ui/assets/dashboard/ranking/5.png'
import rank6 from '@visualization-dashboard-ui/assets/dashboard/ranking/6.png'
import rank7 from '@visualization-dashboard-ui/assets/dashboard/ranking/7.png'
import rank8 from '@visualization-dashboard-ui/assets/dashboard/ranking/8.png'
import rank9 from '@visualization-dashboard-ui/assets/dashboard/ranking/9.png'
import { Empty } from 'ant-design-vue'
import TimeSelect from '@visualization-dashboard-ui/components/TimeSelect/index.vue'
import Guide from '@visualization-dashboard-ui/components/Guide/index.vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { TitleComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { LineChart } from 'echarts/charts'
import dayjs from 'dayjs'
import { isNoCommunity } from '@visualization-dashboard-ui/utils/commonUtils'
import { dashboard } from '@rule-engine-manager-ui/api/dashboard'
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()

use([CanvasRenderer, LineChart, TitleComponent, TooltipComponent, LegendComponent])

// 类型定义
interface RankingItem {
  targetId: string
  targetName: string
  count: number
}

interface SelectOption {
  label: string
  value: string
}

interface ComponentData {
  topTitle: string
  targetType: string[]
  selectOpt: SelectOption[]
  quickBtn: boolean
  defaultType: string
  hoverTip: boolean
  hoverTitle: string
  color: string
  isAutoRefresh: boolean
  interval: number
}

interface QueryCondition {
  startTime: number
  endTime: number
  targetType: string
}

const props = defineProps({
  info: {
    type: Object,
    default: () => ({})
  },
  style: {
    type: Object,
    default: () => ({})
  },
  isEdit: {
    type: Boolean,
    default: false
  }
})

// 常量定义
const QUICK_BTN_LIST = computed(() => [
  { label: $t('TimeSelect.index.100001-0'), value: 'hour' },
  { label: $t('TimeSelect.index.100001-1'), value: 'day' },
  { label: $t('TimeSelect.index.100001-2'), value: 'week' }
])

const TIME_FORMATS = {
  minute: 'HH:mm',
  hour: 'MM-dd HH:mm',
  day: 'MM-dd HH:mm:ss',
  month: 'yyyy-MM'
} as const

const TIME_UNITS = {
  HOUR: 60 * 60 * 1000,
  DAY: 60 * 60 * 1000 * 24,
  MONTH: 60 * 60 * 1000 * 24 * 30,
  YEAR: 60 * 60 * 1000 * 24 * 365
} as const

// 响应式数据
const timeSelectRef = ref<InstanceType<typeof TimeSelect> | null>(null)
let timer: any = null
const _data = ref<ComponentData>({
  topTitle: $t('AlertStats.index.100002-1'),
  targetType: ['device'],
  selectOpt: [],
  quickBtn: true,
  defaultType: 'week',
  hoverTip: true,
  hoverTitle: $t('AlertStats.index.100002-2'),
  color: '#ADC6FF',
  isAutoRefresh: true,
  interval: 5
})

const selectOpt = computed(() => {
  return isNoCommunity ? _data.value.selectOpt : _data.value.selectOpt.filter((item) => item.value !== 'organization')
})

const _style = computed(() => props.style)

const dashBoardImg = {
  rank: [rank1, rank2, rank3, rank4, rank5, rank6, rank7, rank8, rank9]
} as const

const state = reactive<{
  today: number
  thisMonth: number
  ranking: RankingItem[]
  fifteenOptions: Record<string, any>
}>({
  today: 0,
  thisMonth: 0,
  ranking: [],
  fifteenOptions: {}
})

const alarmStatisticsOption = ref<any>({})

const queryCodition = reactive<QueryCondition>({
  startTime: 0,
  endTime: 0,
  targetType: 'device'
})

// 工具函数
const getTimeConfig = (duration: number) => {
  const { HOUR, DAY, YEAR, MONTH } = TIME_UNITS

  if (duration <= HOUR + 10) {
    return {
      time: '1m',
      format: TIME_FORMATS.minute,
      limit: 60
    }
  } else if (duration > HOUR && duration <= DAY) {
    return {
      time: '1h',
      format: TIME_FORMATS.hour,
      limit: 24
    }
  } else if (duration > DAY && duration < YEAR) {
    return {
      time: '1d',
      format: TIME_FORMATS.day,
      limit: Math.abs(Math.ceil(duration / DAY)) + 1
    }
  } else {
    return {
      time: '1M',
      format: TIME_FORMATS.month,
      limit: Math.abs(Math.floor(duration / MONTH))
    }
  }
}

const formatTimeRange = (startTime: number, endTime: number) => ({
  from: dayjs(startTime).format('YYYY-MM-DD HH:mm:ss'),
  to: dayjs(endTime).format('YYYY-MM-DD HH:mm:ss')
})

const createChartOption = (xData: string[], sData: number[]) => {
  const maxY = Math.max(...sData)

  return {
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: xData
    },
    yAxis: {
      type: 'value'
    },
    tooltip: {
      trigger: 'axis',
      show: _data.value.hoverTip
    },
    grid: {
      top: '2%',
      bottom: '5%',
      left: maxY < 1000 ? 50 : maxY.toString().length * 10,
      right: '48px'
    },
    series: [
      {
        name: _data.value.hoverTitle,
        data: sData,
        type: 'line',
        smooth: true,
        color: _data.value.color,
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              {
                offset: 0,
                color: _data.value.color
              },
              {
                offset: 1,
                color: '#FFFFFF'
              }
            ],
            global: false
          }
        }
      }
    ]
  }
}

// 事件处理函数
const handleTypeChange = (value: string) => {
  queryCodition.targetType = value
  selectChange()
}

const initQueryTime = (data: any) => {
  queryCodition.startTime = data.start
  queryCodition.endTime = data.end
  selectChange()
}

const selectChange = () => {
  if (props.isEdit) return
  const duration = queryCodition.endTime - queryCodition.startTime
  const { time, format, limit } = getTimeConfig(duration)
  const timeRange = formatTimeRange(queryCodition.startTime, queryCodition.endTime)

  const baseParams = {
    targetType: queryCodition.targetType,
    assetType: queryCodition.targetType === 'collector' ? 'dataCollectCollector' : undefined,
    time,
    ...timeRange
  }

  // 告警趋势
  const chartData = {
    dashboard: 'alarm',
    object: 'record',
    measurement: 'trend',
    dimension: 'agg',
    group: 'alarmTrend',
    params: {
      ...baseParams,
      format,
      limit
    }
  }

  // 告警排名
  const order = {
    dashboard: 'alarm',
    object: 'record',
    measurement: 'rank',
    dimension: 'agg',
    group: 'alarmRank',
    params: {
      ...baseParams,
      limit: 9
    }
  }

  const interval = _data.value.isAutoRefresh ? _data.value.interval : 0
  if (interval) {
    clearInterval(timer)
    timer = setInterval(() => {
      dashboard([chartData, order]).then((resp: any) => {
        if (resp?.result) {
          processChartData(resp.result, time)
          processRankingData(resp.result)
        }
      })
    }, interval * 1000)
  }
  dashboard([chartData, order]).then((resp: any) => {
    if (resp?.result) {
      processChartData(resp.result, time)
      processRankingData(resp.result)
    }
  })
}

const processChartData = (resp: any[], timeUnit: string) => {
  const xData: string[] = []
  const sData: number[] = []

  const chartResponses = resp.filter((item) => item.group === 'alarmTrend')

  chartResponses.forEach((item) => {
    let timeString = item.data.timeString
    if (timeUnit === '1d') {
      timeString = timeString.split(' ')[0]
    }
    xData.push(timeString)
    sData.push(item.data.value)
  })

  if (sData.length > 0) {
    alarmStatisticsOption.value = createChartOption(xData.reverse(), sData.reverse())
  } else {
    console.warn('Chart data is empty')
  }
}

const processRankingData = (resp: any[]) => {
  const rankingResponses = resp.filter((item) => item.group === 'alarmRank' && item.data?.value?.count !== 0)

  state.ranking = rankingResponses
    .map((d) => d.data?.value)
    .filter((item): item is RankingItem => Boolean(item))
    .sort((a, b) => b.count - a.count)
}

watch(
  () => props.info.componentProps?.alertStats,
  (newVal) => {
    if (newVal) {
      Object.assign(_data.value, newVal)
      queryCodition.targetType = newVal.targetType?.[0] ?? 'device'

      if (!props.isEdit) {
        nextTick(() => {
          timeSelectRef.value?.handleBtnChange?.(newVal.defaultType || 'week')
        })
      }
    }
  },
  { immediate: true, deep: true }
)

onUnmounted(() => {
  clearInterval(timer)
})
</script>
<style scoped lang="less">
.alarm-card {
  width: 100%;
  height: 100%;
  overflow: auto;
  padding: 24px;
  :deep(.ant-select-selection-item) {
    color: #000;
    background-color: #fff !important;
  }
  :deep(.ant-select-arrow) {
    color: rgba(0, 0, 0, 0.25);
  }

  .type-list {
    display: flex;
    align-items: center;
    font-size: 14px;
    .type-item {
      width: 80px;
      padding: 4px 0;
      text-align: center;
      background-color: #fff;
      border: 1px solid #d9d9d9;
      cursor: pointer;
      &:first-child {
        border-radius: 4px 0 0 4px;
      }
      &:last-child {
        border-radius: 0 4px 4px 0;
        border-left: none;
      }
      &.active {
        background-color: #e6f7ff;
        color: #1890ff;
      }
    }
  }
}
.alarmBox {
  width: 100%;
  height: calc(100% - 45px);
  display: flex;
  .alarmStatistics-chart {
    width: 70%;
    height: 100%;
    min-height: 500px;
    overflow: hidden;
  }
  .alarmRank {
    position: relative;
    width: 30%;
    padding-left: 48px;
  }
}
.rankingList {
  margin: 25px 0 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    align-items: center;
    margin-top: 16px;
    zoom: 1;

    &::before,
    &::after {
      display: table;
      content: ' ';
    }

    &::after {
      clear: both;
      height: 0;
      font-size: 0;
      visibility: hidden;
    }

    span {
      //color: red;
      font-size: 14px;
      line-height: 22px;
    }

    .rankingItemNumber {
      display: inline-block;
      width: 20px;
      height: 20px;
      margin-top: 1.5px;
      margin-right: 16px;
      font-weight: 600;
      font-size: 12px;
      line-height: 20px;
      text-align: center;
      background-color: #edf0f3;
      border-radius: 20px;

      &.active {
        color: #fff;
        background-color: #314659;
      }
    }

    .rankingItemTitle {
      flex: 1;
      margin-right: 8px;
      padding-left: 8px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }
}
.empty-body {
  display: flex;
  flex-direction: column;
  align-content: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
</style>
