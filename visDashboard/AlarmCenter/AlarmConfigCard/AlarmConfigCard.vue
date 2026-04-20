<template>
  <CustomImageCard
    type="alarmConfigCard"
    :info="info"
    :systemData="_data"
    :style="style"
    :isEdit="isEdit"
    :isShowFooter="isShowFooter"
  />
</template>

<script setup lang="ts" name="AlarmConfigCard">
import CustomImageCard from '../../shared/CustomImageCard.vue'
import type { Subscription } from 'rxjs'
import { getAlarmConfigCount as getAlarmConfig } from '@rule-engine-manager-ui/api/dashboard'

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

const subscriptions = ref<Set<Subscription>>(new Set())
const terms = {
  all: {},
  normal: { terms: [{ column: 'state', value: 'enabled' }] },
  disabled: { terms: [{ column: 'state', value: 'disabled' }] }
}
let timer: any = null

const _data = ref<any>({
  _param_1: '--',
  _param_2: '--',
  _param_3: '--'
})

const isShowFooter = computed(() => {
  return props.info.componentProps?.alarmConfigCard?.type === 'all'
})

const getData = async (type: any) => {
  const res = await getAlarmConfig(terms[type as keyof typeof terms])
  _data.value._param_1 = res.result || 0
  if (type === 'all') {
    getAlarmConfig(terms.normal).then((res: any) => {
      _data.value._param_2 = res?.result || 0
    })
    getAlarmConfig(terms.disabled).then((res: any) => {
      _data.value._param_3 = res?.result || 0
    })
  }
}

const cleanupSubscriptions = () => {
  subscriptions.value.forEach((subscription) => {
    if (!subscription.closed) {
      subscription.unsubscribe()
    }
  })
  subscriptions.value.clear()
}

watch(
  () => props.info.componentProps?.alarmConfigCard,
  (newVal) => {
    if (props.isEdit || !newVal) return

    const interval = newVal.isAutoRefresh ? newVal.interval : 0
    const type = newVal.type as any

    getData(type)
    if (interval) {
      clearInterval(timer)
      timer = setInterval(() => {
        getData(type)
      }, interval * 1000)
    }
  },
  { immediate: true, deep: true }
)

onUnmounted(() => {
  clearInterval(timer)
})
</script>
