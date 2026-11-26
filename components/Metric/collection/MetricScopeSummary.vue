<template>
  <div class="scope-summary">
    <div v-if="state?.error" class="scope-summary__empty"><AIcon type="ExclamationCircleOutlined" /><span>{{ t('overviewFailed') }}</span><a-button size="small" type="link" @click="emit('refresh')">{{ t('retry') }}</a-button></div>
    <span v-else-if="!state?.data" class="scope-summary__empty">{{ t('overviewLoading') }}</span>
    <template v-else>
      <div class="scope-summary__coverage"><a-tooltip :title="t('effectiveHint')"><strong>{{ t('effective',{count:coverage!.enabledMembers,total:state.members}) }}</strong></a-tooltip><span>{{ t('inheritedCount',{count:coverage!.inheritedMembers}) }} · {{ t('directCount',{count:coverage!.directMembers}) }}</span></div>
      <template v-if="state.data.outputs.length === 1 && output">
        <div v-if="output.summary?.operation === 'distribution'" class="scope-summary__distribution">
          <span v-for="[key,count] in Object.entries(output.summary.distribution).slice(0,3)" :key="key"><IconValueView v-if="appearance(key).icon" :value="appearance(key).icon" :size="12" indicator /><i v-else :style="{background:appearance(key).color}" />{{ stateName(key) }}<b>{{ count }}</b></span>
          <small v-if="Object.keys(output.summary.distribution).length > 3">{{ t('moreStates') }}</small>
        </div>
        <div v-else-if="output.summary?.value != null" class="scope-summary__number"><small>{{ t(output.summary.operation) }}</small><strong>{{ reading }}</strong><small v-if="!duration">{{ output.group.output.unit }}</small></div>
        <span v-else-if="output.incompatiblePeriod" class="scope-summary__warning">{{ t('incompatible') }}</span>
        <span v-else-if="!output.validResults && output.expectedResults" class="scope-summary__warning">{{ t('noValue') }}</span>
        <div class="scope-summary__quality"><span>{{ t('valid',{valid:output.validResults,total:output.expectedResults}) }}</span><span v-if="output.readFailures">{{ t('readFailures',{count:output.readFailures}) }}</span></div>
      </template>
      <span v-else-if="state.data.outputs.length > 1" class="scope-summary__warning">{{ t('separateGroups',{count:state.data.outputs.length}) }}</span>
      <footer><span><template v-if="coverage!.disabledMembers">{{ t('disabledCount',{count:coverage!.disabledMembers}) }}</template><template v-if="coverage!.unconfiguredMembers"> {{ t('unconfigured',{count:coverage!.unconfiguredMembers}) }}</template><time v-if="state.readTime">{{ t('refreshed',{time:new Date(state.readTime).toLocaleTimeString(String(locale),{hour:'2-digit',minute:'2-digit'})}) }}</time></span><a-button type="link" size="small" @click="emit('inspect',output?.group.id)">{{ t('viewMembers') }}<AIcon type="RightOutlined" /></a-button></footer>
    </template>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import IconValueView from '@jetlinks-web-core/components/IconValue/IconValueView.vue'
import { stateAppearance, stateLabel } from '../stateIntervals'
import { metricDurationText } from '../presentation'
import { formatMetricValue } from '../extensions/presentationSettings'
import { metricMessages } from '../messages'
import { collectionMessages } from './messages'
import type { MetricScopeOverviewState } from './useMetricScopeOverview'
const props=defineProps<{state?:MetricScopeOverviewState}>()
const emit=defineEmits<{(event:'inspect',group?:string):void;(event:'refresh'):void}>()
const {t,locale}=useI18n({useScope:'local',messages:{zh:{...metricMessages.zh,...collectionMessages.zh},en:{...metricMessages.en,...collectionMessages.en}}})
const coverage=computed(()=>props.state?.data?.coverage)
const output=computed(()=>props.state?.data?.outputs.length===1 ? props.state.data.outputs[0] : undefined)
const labels=computed(()=>output.value?.group.stateLabels || [])
const raw=(key:string)=>labels.value.find(item=>String(item.value)===key)?.value ?? key
const stateName=(key:string)=>stateLabel(raw(key),labels.value,String(locale.value))
const appearance=(key:string)=>stateAppearance(raw(key),labels.value)
const duration=computed(()=>metricDurationText(output.value?.summary?.value,output.value?.group.output.unit,t))
const reading=computed(()=>duration.value ?? formatMetricValue(output.value?.summary?.value,output.value?.group.displaySettings,output.value?.group.output))
</script>
<style scoped>
.scope-summary { display:flex; flex:1; flex-direction:column; gap:12px; min-width:0; padding:12px var(--space-4,16px); min-height:154px }
.scope-summary__coverage { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px }
.scope-summary__coverage strong { color:var(--ink-1); font-weight:500 }
.scope-summary__coverage>span,.scope-summary__quality,footer,small { font-size:var(--fs-12,12px); color:var(--ink-3) }
.scope-summary__distribution { display:flex; align-items:center; flex-wrap:wrap; gap:8px 16px; min-height:34px }
.scope-summary__distribution>span { display:inline-flex; align-items:center; gap:6px }
.scope-summary__distribution b { font-weight:600; font-variant-numeric:tabular-nums }
.scope-summary__distribution i { width:6px; height:6px; border-radius:50% }
.scope-summary__number { display:flex; align-items:baseline; gap:8px; min-height:34px }
.scope-summary__number strong { font-size:var(--fs-24,24px); color:var(--ink-1); font-weight:600 }
.scope-summary__quality { display:flex; gap:12px; flex-wrap:wrap }
.scope-summary__warning { color:var(--ink-2); font-size:var(--fs-12,12px) }
.scope-summary__empty { display:flex; align-items:center; gap:8px; color:var(--ink-3); font-size:var(--fs-12,12px) }
footer { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:4px; margin-top:auto }
footer>span { display:flex; flex-wrap:wrap; gap:8px }
footer :deep(.ant-btn) { padding-inline:0 }
</style>
