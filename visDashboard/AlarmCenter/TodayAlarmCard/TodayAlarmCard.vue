<template>
  <CustomChartsCard
    type="todayAlarmCard"
    :info="info"
    :systemData="_data"
    :style="style"
    :isEdit="isEdit"
  />
</template>

<script setup lang="ts" name="TodayAlarmCard">
import CustomChartsCard from '../../shared/CustomChartsCard.vue'
import { dashboard } from '@rule-engine-manager-ui/api/dashboard'

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

const terms = ref<any>({})
let timer: any = null

const updateTerms = () => {
  terms.value = {
    echarts: [
      {
        dashboard: 'alarm',
        object: 'record',
        measurement: 'trend',
        dimension: 'agg',
        group: '15day',
        params: {
          time: '1d',
          format: 'yyyy-MM-dd',
          from: 'now-15d',
          to: 'now',
          limit: 15
        }
      }
    ],
    today: [
      {
        dashboard: 'alarm',
        object: 'record',
        measurement: 'trend',
        dimension: 'agg',
        group: 'today',
        params: {
          time: '1d',
          format: 'yyyy-MM-dd',
          from: 'now-1d'
        }
      }
    ],
    thisMonth: [
      {
        dashboard: 'alarm',
        object: 'record',
        measurement: 'trend',
        dimension: 'agg',
        group: 'thisMonth',
        params: {
          time: '1M',
          // targetType: 'device',
          format: 'yyyy-MM',
          limit: 1,
          from: 'now-1M'
        }
      }
    ]
  }
}

const _data = ref<any>({
  yData: [],
  xData: [],
  _param_1: '--',
  _param_2: '--'
})

const getData = () => {
  updateTerms()
  dashboard(terms.value.today).then((res: any) => {
    _data.value._param_1 = res?.result?.[0]?.data?.value || 0
  })
  dashboard(terms.value.echarts).then((res: any) => {
    _data.value.yData = res?.result?.map((item: any) => item.data.value).reverse()
    _data.value.xData = res?.result?.map((item: any) => item.data.timeString).reverse()
  })
  dashboard(terms.value.thisMonth).then((res: any) => {
    _data.value._param_2 = res?.result?.[0]?.data?.value || 0
  })
}

watch(
  () => props.info.componentProps?.todayAlarmCard,
  (newVal) => {
    if (props.isEdit || !newVal) return

    const interval = newVal.isAutoRefresh ? newVal.interval : 0
    getData()
    if (interval) {
      clearInterval(timer)
      timer = setInterval(() => {
        getData()
      }, interval * 1000)
    }
  },
  { immediate: true, deep: true }
)

onUnmounted(() => {
  clearInterval(timer)
})
</script>
