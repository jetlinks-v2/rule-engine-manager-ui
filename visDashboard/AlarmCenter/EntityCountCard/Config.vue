<template>
  <CountSummaryConfig
    :configData="configData"
    show-label-config
    type="entityCountCard"
  />
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import CountSummaryConfig from '../components/CountSummaryConfig.vue'
import type { CountSummaryCardInfo } from '../shared'

defineOptions({
  name: 'EntityCountCardConfig'
})

defineProps({
  configData: {
    type: Object as PropType<CountSummaryCardInfo>,
    default: () => ({})
  }
})
</script>
