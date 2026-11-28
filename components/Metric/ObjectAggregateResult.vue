<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import MetricAggregateCard from './collection/MetricAggregateCard.vue'
import { aggregateCards } from './collection/aggregatePresentation'
import type { MetricAggregateResult } from './collection/types'
import { metricMessages } from './messages'

const props = defineProps<{ value: MetricAggregateResult }>()
const { t } = useI18n({ useScope: 'local', messages: metricMessages })
const cards = computed(() => aggregateCards(props.value.groups))
</script>
<template>
  <section class="object-metric-results">
    <a-empty v-if="!cards.length" :description="t(value.availability === 'unsupported' ? 'aggregateUnsupported' : 'aggregateEmpty')" />
    <MetricAggregateCard v-for="card in cards" :key="card.id" :groups="card.groups" :bounds="[value.from, value.to]" :interval="value.interval" visible hide-members />
  </section>
</template>
<style scoped>.object-metric-results { display:grid; gap:var(--space-4,16px); min-width:0; }</style>
