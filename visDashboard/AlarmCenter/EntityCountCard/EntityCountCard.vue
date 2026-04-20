<template>
  <CountSummaryCard
    :metric="metric"
    :loading="loading"
    :empty="empty"
    :error="error"
    :style="style"
    show-label
  />
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import CountSummaryCard from '../components/CountSummaryCard.vue'
import { useCountSummaryCard } from '../hooks/useCountSummaryCard'
import type { CountSummaryCardInfo, CountSummaryCardStyle } from '../shared'
import { entityCountCardConfig } from './config'

defineOptions({
  name: 'EntityCountCard'
})

const props = defineProps({
  info: {
    type: Object as PropType<CountSummaryCardInfo>,
    default: () => ({})
  },
  style: {
    type: [Object, String] as PropType<CountSummaryCardStyle>,
    default: () => ({})
  },
  isEdit: {
    type: Boolean,
    default: false
  }
})

const { metric, loading, empty, error } = useCountSummaryCard(
  props,
  'entityCountCard',
  entityCountCardConfig.componentProps.entityCountCard
)
</script>
