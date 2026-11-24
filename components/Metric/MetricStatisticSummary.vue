<template>
  <p v-if="meaning" class="metric-statistic-summary" :title="caption">
    <AIcon v-if="descriptor?.icon" :type="descriptor.icon" /><span>{{ caption }}</span>
  </p>
</template>
<script setup lang="ts">
import { computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MetricTemplateOutput } from './types'
import { metricAggregationsKey } from './calculatorContext'
import { statisticDuration, statisticMessages } from './statisticPresentation'
const props=defineProps<{output?:MetricTemplateOutput}>()
const {t}=useI18n({useScope:'local',messages:statisticMessages})
const catalog=inject(metricAggregationsKey,computed(()=>[]))
const meaning=computed(()=>props.output?.resultSemantics)
const descriptor=computed(()=>catalog.value.find(item=>item.id===meaning.value?.statistic.procedure))
const caption=computed(()=>{
  const value=meaning.value
  if (!value) return ''
  const name=descriptor.value?.name || t(`statistic_${value.statistic.characteristic}`)
  const duration=value.window.mode==='time' ? statisticDuration(value.window.size,t) : undefined
  const scope=duration ? t('statisticRecent',{duration}) : value.window.mode==='latestN' && value.window.size
    ? t('statisticPoints',{count:value.window.size}) : undefined
  return [name,scope].filter(Boolean).join(' · ')
})
</script>
<style scoped>
.metric-statistic-summary { display:flex; align-items:center; gap:5px; min-width:0; margin:0; color:var(--ink-3); font-size:var(--fs-12,12px); line-height:20px }
.metric-statistic-summary .anticon { flex:none }
.metric-statistic-summary span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
</style>
