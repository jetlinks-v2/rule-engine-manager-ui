<template>
  <div
    class="top-card"
    :style="_style"
  >
    <div class="top-card-content">
      <div class="content-left">
        <div class="content-left-title">
          <a-space size="small">
            <j-ellipsis>{{ config.topTitle }}</j-ellipsis>
            <a-tooltip
              v-if="config.tooltip"
              placement="top"
            >
              <template #title>
                <span>{{ config.tooltip }}</span>
              </template>
              <AIcon type="QuestionCircleOutlined" />
            </a-tooltip>
          </a-space>
        </div>
        <div
          class="content-left-value"
          :id="info.id + '__param_1'"
        >
          <j-ellipsis>{{ _data._param_1 ?? '--' }}</j-ellipsis>
        </div>
      </div>
      <div
        class="content-right"
        :id="info.id + '_yData'"
      >
        <v-chart
          class="chart"
          :option="option"
          autoresize
        />
        <div
          class="footer-xData"
          :id="info.id + '_xData'"
        ></div>
      </div>
    </div>
    <div
      v-if="isShowFooter"
      class="top-card-footer"
    >
      <j-ellipsis>
        <span>{{ config.bottomTitle }}</span>
      </j-ellipsis>
      <div
        class="footer-item-value"
        :id="info.id + '__param_2'"
      >
        <j-ellipsis>{{ _data._param_2 ?? '--' }}</j-ellipsis>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { LineChart } from 'echarts/charts'
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()

use([CanvasRenderer, LineChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent])

const props = defineProps({
  type: {
    type: String,
    default: 'customChartsCard'
  },
  systemData: {
    type: Object,
    default: () => ({})
  },
  isShowFooter: {
    type: Boolean,
    default: true
  },
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

let event: (() => void) | undefined

const _data = ref<any>({})

const config = ref<any>({
  topTitle: $t('CustomChartsCard.index.100015-0'),
  bottomTitle: $t('CustomChartsCard.index.100015-1'),
  tooltip: '',
  hoverTip: true,
  color: '#D3ADF7'
})

const defaultOption = {
  xAxis: {
    type: 'category',
    data: [],
    show: false
  },
  yAxis: {
    type: 'value',
    show: false
  },
  grid: {
    top: '5%',
    bottom: 0,
    left: 0,
    right: 0
  },
  tooltip: {
    trigger: 'axis',
    confine: false,
    appendToBody: true,
    show: true,
    axisPointer: {
      type: 'shadow'
    }
  },
  series: [
    {
      name: '',
      data: [],
      type: 'line',
      smooth: true,
      symbolSize: 0,
      showBackground: true,
      color: '#D3ADF7',
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
              color: '#D3ADF7'
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

const option = ref<any>(defaultOption)

const _style = computed(() => props.style)

const updateChartOption = () => {
  const chartConfig = props.info.componentProps?.[props.type]

  if (chartConfig) {
    config.value = { ...config.value, ...chartConfig }
    option.value = {
      xAxis: {
        type: 'category',
        data: _data.value.xData || [],
        show: false
      },
      yAxis: {
        type: 'value',
        show: false
      },
      grid: {
        top: '5%',
        bottom: 0,
        left: 0,
        right: 0
      },
      tooltip: {
        trigger: 'axis',
        show: config.value.hoverTip,
        confine: false,
        appendToBody: true,
        axisPointer: {
          type: 'shadow'
        }
      },
      series: [
        {
          name: config.value.hoverTitle,
          data: _data.value.yData || [],
          type: 'line',
          smooth: true,
          symbolSize: 0,
          showBackground: true,
          color: config.value.color,
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
                  color: config.value.color
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
}

watch(
  () => props.systemData,
  (newVal) => {
    _data.value = newVal
    updateChartOption()
  },
  { deep: true }
)

watch(
  () => props.info.componentProps?.[props.type],
  () => {
    updateChartOption()
  },
  { immediate: true, deep: true }
)

onMounted(() => {
  if (props.info.dataSourceProps) {
    const { sourceId, id } = props.info.dataSourceProps
    event = (window as any).$viewDataEventBus.subscribe(sourceId, (val: any) => {
      _data.value = val[id]
      updateChartOption()
    })
  }
})

onUnmounted(() => {
  event?.()
  option.value = null
})
</script>

<style lang="less" scoped>
.top-card {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  padding: 24px 24px 12px 24px;
  box-sizing: border-box;

  .top-card-content {
    display: flex;
    flex-direction: row;
    flex-grow: 1;
    justify-content: space-between;
    align-items: stretch;
    min-height: 0;

    .content-left {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-width: 0;
      flex: 1;

      &-title {
        font-size: 14px;
        line-height: 1.4;
        margin-bottom: 8px;
      }

      &-value {
        font-weight: 700;
        font-size: 26px;
        line-height: 1.2;
        flex: 1;
        display: flex;
        align-items: center;
      }
    }

    .content-right {
      width: 50%;
      height: 100%;
      min-height: 80px;
      margin-left: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;

      .chart {
        width: 100%;
        height: 100%;
      }

      .footer-xData {
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        height: 0;
        margin: 0;
        padding: 0;
      }
    }
  }

  .top-card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 16px;
    margin-top: 16px;
    border-top: 1px solid #f0f0f0;
    flex-shrink: 0;

    .footer-item {
      display: flex;
      gap: 6px;
    }

    .footer-item-value {
      font-weight: 700;
      font-size: 16px;
    }
  }
}
</style>
