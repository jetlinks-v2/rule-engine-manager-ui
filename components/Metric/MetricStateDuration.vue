<template>
  <div class="state-duration" :class="{ 'is-compact': compact, 'is-detail': detail }">
    <div class="state-duration__head"><slot v-if="detail" name="label" /><span v-else>{{ t('intervalCurrent') }}</span><span class="state-duration__status"><IconValueView v-if="!disabled && summary.interval && appearance.icon" :value="appearance.icon" :size="16" indicator :fallback-text="stateLabel(summary.interval.value,labels || [],String(locale))" /><i v-else-if="!disabled && summary.interval" :style="{ background:appearance.color }" /><strong>{{ !disabled && summary.interval ? stateLabel(summary.interval.value, labels || [], String(locale)) : t(disabled ? 'disabled' : `intervalState_${summary.state}`) }}</strong></span></div>
    <div class="state-duration__value"><small v-if="detail">{{ t('intervalElapsed') }}</small><small v-if="!disabled && summary.duration !== undefined && summary.interval && !summary.interval.startKnown">{{ t('intervalAtLeast') }}</small><strong>{{ disabled || summary.duration === undefined ? '—' : duration(summary.duration) }}</strong></div>
    <p v-if="summary.interval && !disabled"><template v-if="summary.interval.startKnown">{{ time(summary.interval.startTime) }} {{ t('intervalStarted') }}</template><a-tooltip v-else :title="t('intervalObservedHint')"><span>{{ t('intervalObserved', {time:time(summary.interval.startTime)}) }}</span></a-tooltip><template v-if="summary.interval.endTime != null"> · {{ time(summary.interval.endTime) }} {{ t(summary.interval.endKnown ? 'intervalEnded' : 'intervalInterrupted') }}</template><template v-if="detail && summary.cutoff"> · {{ t('readAt') }} {{ time(summary.cutoff) }}</template></p>
    <p v-else-if="summary.state === 'unknown'">{{ t('intervalUnknownHint') }}<template v-if="value?.inputTimeEnd"> · {{ time(value.inputTimeEnd) }}</template></p>
    <p v-else>{{ t('intervalWaitingHint') }}</p>
    <small v-if="summary.last && !detail" class="state-duration__last">{{ t('intervalLast') }} · {{ stateLabel(summary.last.value, labels || [], String(locale)) }} {{ !summary.last.startKnown || !summary.last.endKnown ? t('intervalAtLeast') : '' }}{{ duration(intervalDuration(summary.last, summary.cutoff)) }}<span v-if="!summary.last.endKnown"> · {{ t('intervalInterrupted') }}</span></small>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useIntervalFn } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { metricMessages } from './messages'
import { formatIntervalDuration, intervalDuration, stateAppearance, stateIntervalSummary, stateLabel } from './stateIntervals'
import IconValueView from '@jetlinks-web-core/components/IconValue/IconValueView.vue'
import type { MetricStateLabel, MetricValue } from './types'
const props = defineProps<{ value?: MetricValue; labels?: MetricStateLabel[]; disabled?: boolean; compact?: boolean; detail?: boolean; live?: boolean }>()
const { t, locale } = useI18n({ useScope: 'local', messages: metricMessages })
const elapsed = ref(0)
let received = performance.now()
const clock = useIntervalFn(() => { elapsed.value = performance.now() - received }, 1000, { immediate:false })
const summary = computed(() => stateIntervalSummary(props.value, props.live ? elapsed.value : 0))
watch([() => props.value, () => props.live, () => props.disabled], () => {
  received = performance.now()
  elapsed.value = 0
  if (props.live && !props.disabled && summary.value.state === 'known' && summary.value.interval?.endTime == null) clock.resume()
  else clock.pause()
}, { immediate:true })
watch(() => summary.value.state, state => { if (state !== 'known') clock.pause() })
const appearance = computed(() => stateAppearance(summary.value.interval?.value,props.labels))
const duration = (millis: number) => formatIntervalDuration(millis, t)
const time = (millis: number) => new Date(millis).toLocaleString(String(locale.value), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
</script>
<style scoped>
.state-duration { min-width:0; width:100% }
.state-duration__head { display:flex; align-items:center; justify-content:space-between; gap:8px; color:var(--ink-2); font-size:var(--fs-12,12px) }
.state-duration__head :deep(.ant-tag) { margin:0 }
.state-duration__status { display:inline-flex; align-items:center; gap:6px }
.state-duration__status i { width:8px; height:8px; border-radius:50%; flex:none }
.state-duration__status strong { font-weight:500; color:var(--ink-1) }
.state-duration__value { display:flex; align-items:baseline; flex-wrap:wrap; gap:6px; min-height:44px; padding-top:4px }
.state-duration__value strong { color:var(--ink-1); font-size:var(--fs-28,28px); font-weight:600; line-height:1.4; font-variant-numeric:tabular-nums }
.state-duration__value small,.state-duration p,.state-duration__last { color:var(--ink-2); font-size:var(--fs-12,12px) }
.state-duration p { margin:4px 0; line-height:1.7; overflow-wrap:anywhere }
.state-duration__last { display:block; margin-top:4px }
.is-compact .state-duration__value strong { font-size:var(--fs-24,24px) }
.is-compact { min-height:106px }
.is-detail { display:grid; grid-template-columns:auto auto; justify-content:start; gap:4px 24px; align-items:center }
.is-detail .state-duration__status { font-size:var(--fs-24,24px) }
.is-detail .state-duration__head { justify-content:flex-start; flex-wrap:wrap; gap:8px 20px }
.is-detail .state-duration__value { min-height:0; padding:0 }
.is-detail .state-duration__value strong { font-size:var(--fs-24,24px) }
.is-detail p { grid-column:1 / -1; color:var(--ink-3); margin:0 }
@media(max-width:480px) { .is-detail { grid-template-columns:1fr } .is-detail p { grid-column:auto } }
</style>
