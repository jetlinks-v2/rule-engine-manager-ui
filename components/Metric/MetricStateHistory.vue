<template>
  <MetricHistoryTimeline v-if="!compact" :entries="entries" :labels="labels" :bounds="bounds" intervals :limited="limited" :can-inspect-source="canInspectSource" :unavailable="unavailable" :integrated="integrated" :reset-selection="resetSelection" @select="(entry:HistoryEntry|undefined,pinned:boolean)=>emit('select',entry,pinned)" @source="emit('source')"><template #tools><slot name="tools" /></template></MetricHistoryTimeline>
  <section v-else class="interval-history is-compact" :aria-label="t('intervalHistory')">
    <header><AIcon type="HistoryOutlined" /><span>{{ t('intervalRecords') }}</span><AIcon type="RightOutlined" /></header>
    <p v-if="!records.length" class="interval-history__empty">{{ t('intervalNoHistory') }}</p>
    <div v-else class="interval-history__timeline" role="img" :aria-label="t('intervalTimelineHint')" :title="t('intervalTimelineHint')">
      <span v-for="segment in segments" :key="segment.interval.id" class="interval-history__segment" :style="{ left:`${segment.left}%`, width:`${segment.width}%`, background:stateAppearance(segment.interval.value,labels).color }" :title="`${stateLabel(segment.interval.value, labels || [], String(locale))} · ${description(segment.interval, segment.cutoff)}`" />
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { metricMessages } from './messages'
import MetricHistoryTimeline from './history/MetricHistoryTimeline.vue'
import { historyIntervals } from './history/projection'
import type { HistoryEntry } from './history/projection'
import { formatIntervalDuration, intervalDuration, stateAppearance, stateIntervalHistory, stateIntervalSegments, stateLabel } from './stateIntervals'
import type { MetricStateInterval, MetricStateLabel, MetricValue } from './types'
const props = defineProps<{ values: MetricValue[]; labels?: MetricStateLabel[]; current?: MetricValue; bounds?: [number, number]; compact?: boolean; limited?:boolean; canInspectSource?:boolean; unavailable?:boolean;integrated?:boolean;resetSelection?:number }>()
const emit = defineEmits<{ (event:'source'):void;(event:'select',entry:HistoryEntry|undefined,pinned:boolean):void }>()
const { t, locale } = useI18n({ useScope: 'local', messages: metricMessages })
const records = computed(() => stateIntervalHistory(props.values, props.current, props.bounds))
const segments = computed(() => stateIntervalSegments(props.values, props.current, props.bounds))
const entries = computed(() => historyIntervals(props.values, props.current, props.bounds))
const duration = (millis: number) => formatIntervalDuration(millis, t)
const time = (millis: number) => new Date(millis).toLocaleString(String(locale.value), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const endLabel = (interval: MetricStateInterval, cutoff: number) => interval.endTime == null && cutoff < interval.validUntil ? t('intervalOngoing') : `${time(interval.endTime ?? interval.validUntil)} ${t(interval.endKnown ? 'intervalEnded' : 'intervalInterrupted')}`
const description = (interval: MetricStateInterval, cutoff: number) => `${time(interval.startTime)} → ${endLabel(interval, cutoff)} · ${!interval.startKnown || interval.endTime != null && !interval.endKnown ? t('intervalAtLeast') : ''}${duration(intervalDuration(interval, cutoff))}`
</script>
<style scoped>
.interval-history { min-width:0; color:var(--ink-2); font-size:var(--fs-12,12px) }
.interval-history header { display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:12px }
.interval-history header small { margin-left:auto }
.interval-history__empty { text-align:center; padding:18px 0; margin:0 }
.is-compact header { margin-bottom:6px; font-size:11px }
.is-compact header>.anticon:last-child { margin-left:auto; font-size:10px }
.interval-history__timeline { position:relative; height:8px; border-radius:4px; overflow:hidden; background:repeating-linear-gradient(135deg,var(--bg-2) 0px,var(--bg-2) 3px,var(--line) 3px,var(--line) 4px) }
.interval-history__segment { position:absolute; top:0; bottom:0; background:var(--accent,#1677ff); min-width:1px; box-shadow:inset 1px 0 var(--panel-background) }
.is-compact .interval-history__empty { padding:0 }
</style>
