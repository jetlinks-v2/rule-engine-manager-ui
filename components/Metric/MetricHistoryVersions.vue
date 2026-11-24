<template>
  <MetricDisclosure :title="t('pastCalculations')" icon="HistoryOutlined" @toggle="open = ($event.target as HTMLDetailsElement).open">
    <a-skeleton v-if="listing && !versions.length" active :paragraph="{ rows: 2 }" />
    <template v-else>
      <div class="metric-history-versions__tools">
        <a-select v-model:value="selected" :placeholder="t('choosePastCalculation')" :options="choices" :aria-label="t('choosePastCalculation')" />
        <a-select v-if="selected" v-model:value="outputId" :options="outputs.map(item => ({ value: item.metricId, label: item.label || item.metricId }))" :aria-label="t('output')" />
        <a-button v-if="cursor" size="small" type="text" :loading="listing" @click="loadMore()">{{ t('loadMore') }}</a-button>
      </div>
      <a-empty v-if="!choices.length && !cursor && !error" :description="t('noPastCalculations')" :image="Empty.PRESENTED_IMAGE_SIMPLE" />
      <template v-if="version && output">
        <MetricHistoryView :reference="{...reference,outputId}" :output="output" :bounds="bounds" :state-output="states" :intervals="intervals" :labels="labels" :data-version="selected" :query-key="JSON.stringify([range,customRange])" @drilldown="customRange=$event">
        <template #tools><MetricTimeRange v-model:range="range" v-model:custom-range="customRange" /></template>
        <a-skeleton v-if="loading" active :paragraph="{ rows: 4 }" />
        <component :is="intervals ? MetricStateHistory : MetricTrend" v-else :key="selected + outputId" :values="values" :output="output" :unit="output.unit" :labels="labels" :bounds="bounds" :limited="values.length >= 200" :unavailable="!!error" />
        </MetricHistoryView>
      </template>
    </template>
    <a-alert v-if="error" type="error" show-icon :message="t('readFailed')" :description="error"><template #action><a-button size="small" @click="selected ? refresh() : loadMore(true)">{{ t('retry') }}</a-button></template></a-alert>
  </MetricDisclosure>
</template>
<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { Empty } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import MetricDisclosure from './MetricDisclosure.vue'
import MetricTimeRange from './MetricTimeRange.vue'
import MetricTrend from './MetricTrend.vue'
import MetricStateHistory from './MetricStateHistory.vue'
import MetricHistoryView from './history/MetricHistoryView.vue'
import { useMetricHistoryVersions } from './useMetricHistoryVersions'
import { stateLabels } from './stateIntervals'
import { metricOutputPresentation } from './outputPresentation'
import { metricDateText } from './time'
import { metricMessages } from './messages'
import type { MetricReference } from './types'
const props = defineProps<{ reference: MetricReference; dataVersion?: string }>()
const { t } = useI18n({ useScope: 'local', messages: metricMessages })
const open = ref(false)
const { versions, selected, version, outputId, outputs, output, intervals, values, loading, listing, error, cursor, range, customRange, bounds, loadMore, refresh } = useMetricHistoryVersions(toRef(props, 'reference'), open)
const choices = computed(() => versions.value.filter(item => item.configuration.dataVersion !== props.dataVersion).map(item => ({
  value: item.configuration.dataVersion, label: metricDateText(item.recordedAt) + ' · ' + item.template.name,
})))
const labels = computed(() => version.value ? stateLabels(version.value.template, outputId.value) : [])
const states = computed(() => ['state','boolean'].includes(metricOutputPresentation(output.value,{template:version.value?.template}).history))
</script>
<style scoped>
.metric-history-versions__tools { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:8px }
.metric-history-versions__tools :deep(.ant-select) { min-width:160px; max-width:100%; flex:1 }
</style>
