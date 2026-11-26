<template>
  <div v-if="!header" class="metric-chart-tools">
    <div class="metric-chart-tools__query"><slot /></div>
    <div class="metric-chart-tools__actions">
      <template v-if="controls">
      <a-tooltip :title="t(controls.brushing.value ? 'historyBrushCancel' : 'historyBrush')"><a-button type="text" size="small" :class="{ 'is-active':controls.brushing.value }" :aria-pressed="controls.brushing.value" :aria-label="t('historyBrush')" @click="controls.brush"><AIcon type="SelectOutlined" /></a-button></a-tooltip>
      <a-tooltip :title="t('historyResetFocus')"><a-button type="text" size="small" :aria-label="t('historyResetFocus')" @click="controls.reset"><AIcon type="UndoOutlined" /></a-button></a-tooltip>
      <a-tooltip :title="t('historyOverview')"><a-button type="text" size="small" :class="{ 'is-active':controls.overview.value }" :aria-pressed="controls.overview.value" :aria-label="t('historyOverview')" @click="controls.overview.value=!controls.overview.value"><AIcon type="SlidersOutlined" /></a-button></a-tooltip>
      </template>
      <a-tooltip :title="[hint,controls ? t('historyNativeZoomHint') : ''].filter(Boolean).join(' ')" :trigger="['hover','focus','click']"><a-button type="text" size="small" :aria-label="t('historyAbout')"><AIcon type="QuestionCircleOutlined" /><span v-if="limited" class="metric-chart-tools__limit">{{ t('historyLimited') }}</span></a-button></a-tooltip>
    </div>
  </div>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, inject, watchEffect } from 'vue'
import type { TimeZoomControls } from '@jetlinks-web-core/hooks/Echarts/useTimeZoom'
import { metricMessages } from '../messages'
import { metricChartToolsKey } from './chartTools'
const props=defineProps<{ controls?:TimeZoomControls; hint?:string; limited?:boolean; inline?:boolean }>()
const header=props.inline ? undefined : inject(metricChartToolsKey,undefined)
const state=computed(()=>({controls:props.controls,hint:props.hint,limited:props.limited}))
if (header) {
  watchEffect(onCleanup=>{
    const value=state.value
    header.value=value
    onCleanup(()=>{if(header.value===value)header.value=undefined})
  })
}
const { t }=useI18n({useScope:'local',messages:metricMessages})
</script>
<style scoped>
.metric-chart-tools { display:flex; align-items:center; justify-content:space-between; gap:4px 12px; flex-wrap:wrap; min-height:28px; margin-bottom:4px }
.metric-chart-tools__query,.metric-chart-tools__actions { display:flex; align-items:center; gap:4px; flex-wrap:wrap }
.metric-chart-tools__actions { margin-left:auto; flex-wrap:nowrap; flex-shrink:0 }
.metric-chart-tools :deep(.ant-btn) { display:inline-flex; align-items:center; justify-content:center; height:28px; min-width:28px; padding-inline:6px; font-size:12px; line-height:20px; color:var(--ink-3) }
.metric-chart-tools__actions :deep(.is-active) { color:var(--accent); background:var(--accent-soft) }
.metric-chart-tools__limit { font-size:12px; color:var(--ink-3) }
</style>
