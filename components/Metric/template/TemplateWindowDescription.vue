<template>
  <div class="window-description" :class="{'is-editable':editable}">
    <div class="window-description__sentence">
      <div class="window-description__data">
        {{ t('windowDataLead') }} <slot name="source">{{ source || t('windowStatisticsInputs') }}</slot>{{ t('windowSourceEnd') }}
        <span class="window-description__scope">
          <slot name="range">{{ mode === 'none' ? t('sentenceLatestWindow') : mode === 'time' ? `${t('sentenceTimeWindow')} ${simulationDuration(rule.window?.size,t)}` : `${t('sentenceCountWindow')} ${rule.window?.size || '—'} ${t('sentenceReadings')}` }}</slot>
          <span v-if="mode !== 'none'">{{ t(mode === 'time' ? 'windowTimeDataEnd' : 'windowCountDataEnd') }}</span>
          <slot name="rangeHelp" />
        </span>
      </div>
      <div v-if="mode !== 'none'" class="window-description__calculation">
        {{ t('windowCalculate') }}
        <span class="window-description__statistic">
          <slot name="statistic"><span :title="descriptor ? descriptor.description : t('windowStatisticUnavailable')"><AIcon :type="descriptor?.icon || 'BarChartOutlined'" /> {{ descriptor?.name || t('statistic') }}</span></slot>
          <span v-if="!descriptor?.parameterDefinitions.length">{{ t('windowSentenceEnd') }}</span>
        </span>
        <span v-for="(parameter,index) in descriptor?.parameterDefinitions || []" :key="parameter.id" class="window-description__parameter">
          <span>(</span><span>{{ parameter.name || parameter.id }}</span>
          <slot name="parameter" :parameter="parameter" :value="parameterValue(parameter.id)">{{ parameter.expands?.editor === 'duration' ? simulationDuration(String(parameterValue(parameter.id) ?? ''),t) : metricValueText(parameterValue(parameter.id)) }}</slot>
          <span>)</span>
          <a-tooltip v-if="parameter.description" :title="parameter.description" :trigger="['hover','focus']" :mouse-enter-delay="0.1"><span class="window-description__help" tabindex="0" role="img" :aria-label="parameter.name || parameter.id"><AIcon type="InfoCircleOutlined" /></span></a-tooltip>
          <span v-if="index === descriptor!.parameterDefinitions.length - 1">{{ t('windowSentenceEnd') }}</span>
        </span>
      </div>
    </div>
    <component :is="editable ? 'details' : 'div'" v-if="mode !== 'none' && settings" class="window-description__settings">
      <summary v-if="editable"><AIcon type="SettingOutlined" />{{ t('windowSettings') }}<AIcon class="window-description__chevron" type="DownOutlined" /></summary>
      <p>{{ t('windowTimeLead') }} <slot name="timeBasis">{{ t(`time_${rule.window?.timeMode || 'processing'}`) }}</slot> {{ t('windowTimeEnd') }}</p>
      <p v-if="expectedCount != null">{{ t('windowExpectedLead') }} <slot name="expectedCount">{{ expectedCount }}</slot> {{ t('windowExpectedEnd') }}<slot name="coverageHelp" /></p>
      <p v-else-if="editable"><slot name="expectedCount" :placeholder="t('windowExpectedUnset')" /><slot name="coverageHelp" /></p>
      <template v-if="mode === 'time'">
        <p v-if="rule.window?.maxEntries != null">{{ t('windowCapacityLead') }} <slot name="capacity">{{ rule.window.maxEntries }}</slot> {{ t('windowCapacityEnd') }}</p>
        <p v-else-if="editable"><slot name="capacity" :placeholder="t('windowCapacityUnset')" /></p>
      </template>
    </component>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TemplateRule } from './designer'
import type { MetricAggregationDescriptor } from '../types'
import { simulationDuration } from './simulationFlow'
import { metricValueText } from '../presentation'
import { windowMessages } from './windowPresentation'
const props=withDefaults(defineProps<{rule:TemplateRule;catalog?:MetricAggregationDescriptor[];source?:string;editable?:boolean;settings?:boolean}>(),{settings:true})
const {t}=useI18n({useScope:'local',messages:windowMessages})
const mode=computed(()=>props.rule.window?.mode || 'none')
const descriptor=computed(()=>props.catalog?.find(item=>item.id===(props.rule.timeAggregation || props.rule.aggregation || 'avg')))
const expectedCount=computed(()=>props.rule.qualityPolicy?.expectedCount ?? props.rule.window?.expectedCount)
const parameterValue=(id:string)=>props.rule.window?.[id] ?? descriptor.value?.windowDefaults[id]
</script>
<style scoped>
.window-description { min-width:0; font-size:13px; line-height:1.9; overflow-wrap:anywhere }
.window-description__data,.window-description__calculation { display:inline; min-width:0 }
.window-description__statistic,.window-description__parameter { display:inline-flex; align-items:center; vertical-align:middle; max-width:100% }
.window-description__statistic .anticon { color:var(--accent) }
.window-description__parameter { gap:0 2px; margin-inline-start:4px }
.window-description__help { display:inline-flex; align-items:center; color:var(--ink-3); margin-inline:4px; font-size:12px; cursor:help; line-height:20px }
.window-description__help:focus-visible { outline:1px solid var(--accent); outline-offset:2px }
.window-description__settings { color:var(--ink-3); font-size:12px; line-height:1.9 }
.window-description__settings p { margin:6px 0 }
.window-description__settings > summary { display:flex; align-items:center; gap:6px; min-height:32px; cursor:pointer; list-style:none }
.window-description__settings > summary::-webkit-details-marker { display:none }
.window-description__settings > summary:hover,.window-description__settings > summary:focus-visible { color:var(--accent) }
.window-description__chevron { margin-left:auto; font-size:10px; transition:transform .15s }
.window-description__settings[open] .window-description__chevron { transform:rotate(180deg) }
.is-editable .window-description__sentence { display:grid; gap:2px; line-height:32px }
.is-editable .window-description__data,.is-editable .window-description__calculation { display:block }
.is-editable .window-description__scope { display:inline-flex; align-items:center; flex-wrap:wrap; vertical-align:middle; max-width:100%; gap:0 2px }
.is-editable .window-description__scope > span { white-space:nowrap }
.is-editable .window-description__settings { margin-top:8px; font-size:13px; line-height:32px; color:var(--ink-2) }
.is-editable .window-description__settings > summary { font-size:12px; color:var(--ink-3) }
.is-editable :deep(.template-duration) { width:auto }
.is-editable :deep(.template-duration__amount) { width:auto; min-width:20px; flex:0 1 auto }
.is-editable :deep(.template-duration__unit) { width:auto; min-width:max-content }
.is-editable :deep(.editable-field > .text) { padding-inline:4px }
</style>
