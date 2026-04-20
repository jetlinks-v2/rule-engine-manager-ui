<template>
  <CountSummaryConfig
    :configData="configData"
    type="alarmCountCard"
  />
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import CountSummaryConfig from '../components/CountSummaryConfig.vue'
import type { CountSummaryCardInfo } from '../shared'

defineOptions({
  name: 'AlarmCountCardConfig'
})

defineProps({
  configData: {
    type: Object as PropType<CountSummaryCardInfo>,
    default: () => ({})
  }
})
</script>
