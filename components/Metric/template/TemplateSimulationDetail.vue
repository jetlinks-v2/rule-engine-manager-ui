<template>
  <section v-if="selected" class="simulation-detail" :aria-label="t('resultDetails')">
    <header><AIcon type="AimOutlined" /><strong>{{ nodeLabel(template, selected) }}</strong></header>
    <small v-if="time !== undefined">{{ t('semanticValueAt', { time:sampleDate(time).replace('T',' ') }) }}</small>
    <small v-if="snapshot?.previous">{{ t('trialPrevious') }} · {{ sampleDate(entry?.time) }}</small>
    <div v-if="snapshot && snapshot.alternatives.length > 1" class="simulation-detail__alternatives">
      <a-button v-for="(item, index) in snapshot.alternatives" :key="item.key" type="text" size="small" :aria-pressed="item.key === entry?.key" @click="emit('select-entry', item.key)">{{ reference(item.value?.metricId || '') || t('evaluationSequence', { index:index + 1 }) }} · {{ item.value ? valueText(item.value.value) : t('inspectProcess') }}</a-button>
    </div>
    <MetricValueView v-if="value" :value="value" :unit="unit" :meaning="meaning" />
    <p v-if="value?.state" class="simulation-detail__state"><small>{{ t('intervalCurrent') }}</small>{{ currentDuration }}</p>
    <div v-if="!value && entry?.sample" class="simulation-detail__input"><small>{{ t('trialInput') }}</small><b>{{ valueText(entry.sample.value) }} {{ entry.sample.unit }}</b><small>{{ t('semanticSampleAt', { time:sampleDate(entry.sample.eventTime).replace('T',' ') }) }}</small></div>
    <small v-if="!value && !entry?.sample">{{ t(snapshot?.state || 'awaitSimulation') }}</small>
    <small v-if="participatingCount !== undefined">{{ t('participatingSampleCount', { count:participatingCount }) }}</small>
    <small v-if="value && Number(value.windowEnd) > Number(value.windowStart)">{{ t('windowRange') }}：{{ sampleDate(Number(value.windowStart)) }} — {{ sampleDate(Number(value.windowEnd)) }}</small>
    <a-alert v-if="record?.hasError" type="error" :message="record.errorDetail || t('calculationFailed')" show-icon />
    <small v-else-if="record?.attributes.execution">{{ t('executionSelectNode') }}</small>
    <small v-else-if="value">{{ t('processUnavailable') }}</small>
    <MetricTrend v-if="hasTrend" :values="series" :unit="unit" />
  </section>
</template>
<script setup lang="ts">
import { computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import MetricValueView from '../MetricValue.vue'
import MetricTrend from '../MetricTrend.vue'
import { metricDurationText } from '../presentation'
import { metricMessages } from '../messages'
import { nodeLabel, type TemplateNode } from './designer'
import { sampleDate } from './simulation'
import { evaluationTime } from './simulationFlow'
import { simulationMeaning, type SimulationNodePreview } from './simulationPreview'
import { semanticValueText } from '../valueSemantics'
import { stateIntervalSummary } from '../stateIntervals'
import { metricCalculatorsKey } from '../calculatorContext'
import type { MetricTemplate, MetricValue } from '../types'
const props = defineProps<{ template:MetricTemplate; selected?:TemplateNode; snapshot?:SimulationNodePreview; results:MetricValue[]; time?:number }>()
const emit = defineEmits<{ (event:'select-entry', key:string):void }>()
const { t, locale } = useI18n({ useScope:'local', messages:metricMessages })
const calculators = inject(metricCalculatorsKey,undefined)
const entry = computed(() => props.snapshot?.entry)
const value = computed(() => entry.value?.value)
const record = computed(() => entry.value?.record)
const meaning = computed(() => props.selected ? simulationMeaning(props.template,props.selected,entry.value,calculators?.value) : undefined)
const unit = computed(() => meaning.value?.unit)
const valueText = (value:unknown) => semanticValueText(value,{ ...meaning.value, locale:String(locale.value) },t)
const currentDuration = computed(() => {
  const summary = stateIntervalSummary(value.value)
  return summary.duration === undefined ? t('intervalUnknownHint') : metricDurationText(summary.duration / 1000,'s',t)
})
const participatingCount = computed(() => { const count = value.value?.quality?.attributes?.actualCount; return typeof count === 'number' ? count : undefined })
const reference = (id:string) => props.template.inputDefinitions.find(input => input.id === id)?.name || props.template.definitions.find(item => item.id === id)?.name || id
// 趋势与图上游标使用同一截止点，不展示之后的结果。
const series = computed(() => props.results.filter(item => item.metricId === value.value?.metricId && props.time !== undefined && Number(evaluationTime(item)) <= props.time))
const hasTrend = computed(() => new Set(series.value.filter(item => typeof item.value === 'number').map(evaluationTime)).size > 1)
</script>
<style scoped>
.simulation-detail { display:grid; grid-template-columns:minmax(0,1fr); gap:8px; margin-top:16px; padding-top:14px; border-top:1px solid var(--line); min-width:0; font-size:12px; overflow-wrap:anywhere }
.simulation-detail header { display:flex; align-items:center; gap:6px; font-size:13px }
.simulation-detail strong,.simulation-detail b { font-weight:500 }
.simulation-detail small { display:block; color:var(--ink-3); font-size:11px }
.simulation-detail__process { display:grid; gap:8px }
.simulation-detail__process summary { color:var(--ink-3); cursor:pointer; font-size:11px }
.simulation-detail__state { display:flex; gap:8px; margin:0 }
.simulation-detail__input { display:flex; align-items:center; flex-wrap:wrap; gap:8px }
.simulation-detail__input > small { flex-basis:100% }
.simulation-detail code { white-space:pre-wrap; font-size:12px }
.simulation-detail__alternatives { display:flex; flex-wrap:wrap; gap:4px }
.simulation-detail__alternatives :deep(.ant-btn) { height:auto; white-space:normal; font-size:11px }
</style>
