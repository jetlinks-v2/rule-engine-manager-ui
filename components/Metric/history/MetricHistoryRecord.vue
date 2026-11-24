<template>
  <section class="history-record" :aria-label="t('historySelected')" @keydown.esc="emit('clear')">
    <p v-if="missing" class="history-record__missing" role="status">{{ t('historySelectionMissing') }}<a-button type="link" size="small" @click="emit('clear')">{{ t('historyUnpin') }}</a-button></p>
    <template v-else-if="entry">
      <header><span class="history-record__identity" aria-live="polite" aria-atomic="true"><IconValueView v-if="icon" :value="icon" :size="14" indicator :fallback-text="label" /><b>{{ label }}</b><time>{{ time(entry.time) }}</time><template v-if="entry.kind === 'interval'"><span>— {{ endText }}</span><span>{{ uncertain ? t('intervalAtLeast') : '' }}{{ formatIntervalDuration(intervalDuration(entry.interval, entry.cutoff), t) }}</span></template></span><nav :aria-label="t('historyNavigation')"><a-button type="text" size="small" :disabled="position <= 0" :aria-label="t('historyPrevious')" @click="emit('move', -1)"><AIcon type="LeftOutlined" /></a-button><small>{{ position + 1 }} / {{ count }}</small><a-button type="text" size="small" :disabled="position < 0 || position >= count - 1" :aria-label="t('historyNext')" @click="emit('move', 1)"><AIcon type="RightOutlined" /></a-button><a-button type="text" size="small" :aria-label="t('historyUnpin')" :title="t('historyUnpin')" @click="emit('clear')"><AIcon type="CloseOutlined" /></a-button></nav></header>
      <small v-if="outsideView" class="history-record__notice">{{ t('historyOutsideView') }}</small>
      <details class="history-record__details" :key="entry.key"><summary>{{ t('historyRecordDetails') }}</summary>
      <div v-if="entry.kind === 'record'" class="history-record__facts">
        <span v-if="validTime(entry.value.eventTime)">{{ t('sourceTime') }} <time>{{ time(entry.value.eventTime) }}</time></span>
        <span v-if="validTime(entry.value.inputTimeStart) && validTime(entry.value.inputTimeEnd)">{{ t('inputRange') }} <time>{{ time(entry.value.inputTimeStart) }} — {{ time(entry.value.inputTimeEnd) }}</time></span>
        <span>{{ t('historyQuality') }} <b>{{ t(metricState(entry.value).key) }}</b></span>
        <span v-if="entry.value.quality?.coverage != null">{{ t('coverage') }} <b>{{ percentage(entry.value.quality.coverage) }}</b></span>
      </div>
      <div v-else class="history-record__facts"><span>{{ t(entry.interval.startKnown ? 'intervalStarted' : 'intervalObserved') }} <time>{{ time(entry.time) }}</time></span><span>{{ t('historyEnd') }} <b>{{ endText }}</b></span><span>{{ t('historyDuration') }} <b>{{ uncertain ? t('intervalAtLeast') : '' }}{{ formatIntervalDuration(intervalDuration(entry.interval, entry.cutoff), t) }}</b></span></div>
      <details class="history-record__raw"><summary>{{ t('semanticRawValue') }}</summary><pre>{{ JSON.stringify(entry.kind === 'record' ? entry.value : entry.interval, null, 2) }}</pre></details>
      </details>
    </template>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { HistoryEntry } from './projection'
import { metricState } from '../presentation'
import { formatIntervalDuration, intervalDuration } from '../stateIntervals'
import { metricMessages } from '../messages'
import IconValueView from '@jetlinks-web-core/components/IconValue/IconValueView.vue'
const props = defineProps<{ entry?:HistoryEntry; label:string; icon?:string; outsideView?:boolean; missing:boolean; count:number; position:number }>()
const emit = defineEmits<{ (event:'move', delta:number):void; (event:'clear'):void }>()
const { t, locale } = useI18n({ useScope:'local', messages:metricMessages })
const time = (value:number) => new Date(value).toLocaleString(String(locale.value), { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' })
const validTime = (value?:number):value is number => value !== undefined && Number.isFinite(value) && value > 0
const percentage = (value:number) => new Intl.NumberFormat(String(locale.value), { style:'percent', maximumFractionDigits:1 }).format(value)
const uncertain = computed(() => props.entry?.kind === 'interval' && (!props.entry.interval.startKnown
  || !props.entry.interval.endKnown && (props.entry.interval.endTime != null || props.entry.cutoff >= props.entry.interval.validUntil)))
const endText = computed(() => {
  if (props.entry?.kind !== 'interval') return ''
  const { interval, cutoff } = props.entry
  return interval.endTime == null && cutoff < interval.validUntil ? `${t('intervalOngoing')} · ${t('readAt')} ${time(cutoff)}`
    : `${time(Math.min(interval.endTime ?? interval.validUntil, interval.validUntil))} · ${t(interval.endKnown ? 'intervalEnded' : 'intervalInterrupted')}`
})
</script>
<style scoped>
.history-record { border-top:1px solid var(--line); padding-top:10px; font-size:12px }
.history-record__identity b { color:var(--ink-1); font-weight:500 }
.history-record__details { color:var(--ink-3); margin-top:6px }
.history-record__details>summary { cursor:pointer; width:fit-content; font-size:11px }
.history-record__notice { display:block; margin-top:6px }
.history-record header,.history-record nav,.history-record__identity { display:flex; align-items:center; gap:8px }
.history-record__identity { flex-wrap:wrap; min-width:0 }
.history-record__identity time { font-weight:500; color:var(--ink-1); font-variant-numeric:tabular-nums }
.history-record nav { margin-left:auto; gap:2px; white-space:nowrap }
.history-record nav small { min-width:44px; text-align:center }
.history-record__facts { display:flex; align-items:baseline; flex-wrap:wrap; gap:6px 20px; padding:10px 0; min-height:38px; color:var(--ink-3); line-height:1.8 }
.history-record__facts b,.history-record__facts time { color:var(--ink-2); font-weight:400; margin-left:4px; font-variant-numeric:tabular-nums }
.history-record small { color:var(--ink-3); font-size:11px }
.history-record :deep(.ant-btn) { font-size:11px; padding-inline:4px }
.history-record :deep(.ant-tag) { margin:0; font-size:11px; white-space:normal; overflow-wrap:anywhere }
.history-record__missing { margin:4px 0; color:var(--ink-3); line-height:1.8 }
.history-record__raw { margin-top:10px; color:var(--ink-3); font-size:11px }
.history-record__raw summary { cursor:pointer }
.history-record__raw pre { max-height:260px; overflow:auto; margin:8px 0; white-space:pre-wrap; overflow-wrap:anywhere; color:var(--ink-2) }
@media(max-width:600px) { .history-record header { flex-wrap:wrap; gap:4px 8px } }
</style>
