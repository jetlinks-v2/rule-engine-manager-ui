<template>
  <div class="trial-clock">
    <span><AIcon type="ClockCircleOutlined" />{{ t('flowTime') }}<time v-if="trial.time !== undefined"> · {{ sampleDate(trial.time).replace('T',' ') }}</time></span>
    <a-button type="text" size="small" :disabled="trial.position <= 0" :aria-label="t('trialPreviousTime')" :title="t('trialPreviousTime')" @click="trial.selectTime(trial.index.times[trial.position - 1])"><AIcon type="LeftOutlined" /></a-button>
    <a-button type="text" size="small" :disabled="trial.position >= trial.index.times.length - 1" :aria-label="t('trialNextTime')" :title="t('trialNextTime')" @click="trial.selectTime(trial.index.times[trial.position + 1])"><AIcon type="RightOutlined" /></a-button>
  </div>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { metricMessages } from '../messages'
import { sampleDate } from './simulation'
import type { TemplateSimulationState } from './useTemplateSimulation'
defineProps<{ trial:TemplateSimulationState }>()
const { t } = useI18n({ useScope:'local', messages:metricMessages })
</script>
<style scoped>
.trial-clock { display:flex; align-items:center; min-width:0; gap:4px; color:var(--ink-3); font-size:11px }
.trial-clock > span { display:flex; align-items:center; gap:4px; flex:1; min-width:0 }
.trial-clock time { overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.trial-clock :deep(.ant-btn) { padding:0 4px; height:24px; color:var(--ink-3) }
</style>
