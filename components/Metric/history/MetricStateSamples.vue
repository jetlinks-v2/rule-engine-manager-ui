<template>
  <div ref="element" class="state-samples">
    <div class="state-samples__head">{{ t('stateSamples', { count:samples.length }) }}</div>
    <MetricStateMatrix v-if="dense && axis" compact :buckets="buckets" :bounds="axis" :labels="labels" />
    <div v-else class="state-samples__lanes">
      <div v-for="group in groups" :key="group.key" class="state-samples__row">
        <span class="state-samples__label" :title="label(group.entries[0])">{{ label(group.entries[0]) }}</span>
        <a-tooltip :open="!!inspected && historyGroup(inspected) === group.key" :title="inspected && historyGroup(inspected) === group.key ? `${label(inspected)} · ${time(inspected.time)}` : undefined">
          <div class="state-samples__plot" role="img" tabindex="0" :aria-label="`${label(group.entries[0])} · ${t('stateSampleHint')}`" @pointermove="inspect($event,group.entries)" @pointerleave="selectedKey = undefined" @focus="selectedKey = group.entries.at(-1)?.key" @blur="selectedKey = undefined" @keydown="navigate($event,group.entries)">
            <span v-for="entry in group.entries" :key="entry.key" class="state-samples__point" :style="{ left:`clamp(4px, ${samplePosition(entry)}%, calc(100% - 4px))`, color:stateAppearance(entry.state, labels).color }" :class="{ 'is-unknown':entry.state === null, 'is-false':entry.state === false, 'is-inspected':entry.key === inspected?.key }" />
          </div>
        </a-tooltip>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useElementSize } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { metricMessages } from '../messages'
import { recordedStateLabel, stateAppearance } from '../stateIntervals'
import type { MetricStateLabel } from '../types'
import type { HistoryEntry } from './projection'
import { historyBounds, historyGroup, historyStateBuckets, STATE_SAMPLE_LIMIT } from './projection'
import MetricStateMatrix from './MetricStateMatrix.vue'
const props = defineProps<{ entries:HistoryEntry[]; labels?:MetricStateLabel[]; bounds?:[number,number] }>()
const { t, locale } = useI18n({ useScope:'local', messages:metricMessages })
// A point is a recorded sample, not inferred uptime. Bound the DOM independently of history query size.
const samples = computed(() => props.entries.filter((entry):entry is Extract<HistoryEntry,{ kind:'record' }> => entry.kind === 'record').slice(-STATE_SAMPLE_LIMIT))
type Sample = Extract<HistoryEntry,{ kind:'record' }>
const groups = computed(() => {
  const groups = new Map<string,{ key:string;entries:Sample[] }>()
  for (const entry of samples.value) {
    const key = historyGroup(entry), group = groups.get(key)
    if (group) group.entries.push(entry)
    else groups.set(key,{key,entries:[entry]})
  }
  return [...groups.values()]
})
const axis = computed(() => historyBounds(samples.value,props.bounds))
const element=ref<HTMLElement>(),{width}=useElementSize(element)
const bucketCount=computed(()=>Math.max(4,Math.floor(width.value/12) || 24))
const dense=computed(()=>samples.value.length>bucketCount.value)
const buckets=computed(()=>axis.value ? historyStateBuckets(samples.value,axis.value,bucketCount.value) : [])
const selectedKey = ref<string>()
const inspected = computed(() => samples.value.find(entry => entry.key === selectedKey.value))
const samplePosition = (entry:HistoryEntry) => axis.value ? (entry.time-axis.value[0]) / (axis.value[1]-axis.value[0]) * 100 : 50
const label = (entry:Extract<HistoryEntry,{ kind:'record' }>) => recordedStateLabel(entry.state,props.labels || [],String(locale.value),t)
const time = (value:number) => new Date(value).toLocaleString(String(locale.value),{ month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit' })
function inspect(event:PointerEvent,entries:Sample[]) {
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  if (!bounds.width || !axis.value || !entries.length) { selectedKey.value=undefined;return }
  const time = axis.value[0]+Math.max(0,Math.min(1,(event.clientX-bounds.left)/bounds.width))*(axis.value[1]-axis.value[0])
  // 悬停寻找最近的真实采样；不等间隔的记录不能按数组下标平分时间。
  selectedKey.value = entries.reduce((nearest,entry) => Math.abs(entry.time-time) < Math.abs(nearest.time-time) ? entry : nearest).key
}
function navigate(event:KeyboardEvent,entries:Sample[]) {
  if (!['ArrowLeft','ArrowRight','Home','End','Escape'].includes(event.key)) return
  event.preventDefault()
  event.stopPropagation()
  if (event.key === 'Escape') { selectedKey.value = undefined; return }
  const current = entries.findIndex(entry => entry.key === selectedKey.value)
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1
    : Math.max(0,Math.min(entries.length - 1,(current < 0 ? entries.length - 1 : current) + (event.key === 'ArrowLeft' ? -1 : 1)))
  selectedKey.value = entries[index]?.key
}
</script>
<style scoped>
.state-samples { min-width:0 }
.state-samples__head { min-height:20px; color:var(--ink-3); font-size:11px }
.state-samples__lanes { max-height:72px; overflow:auto; scrollbar-width:thin }
.state-samples__row { display:flex; align-items:center; gap:8px; min-height:22px }
.state-samples__label { flex:0 0 64px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--ink-3); font-size:11px }
.state-samples__plot { position:relative; flex:1; min-width:0; height:22px; border-radius:var(--r-1,4px) }
.state-samples__plot::before { content:''; position:absolute; top:50%; width:100%; border-top:1px dotted var(--line) }
.state-samples__plot:focus-visible { outline:2px solid var(--accent); outline-offset:-1px }
.state-samples__point { position:absolute; top:8px; width:6px; height:6px; border:1px solid currentColor; border-radius:50%; background:currentColor; box-sizing:border-box; transform:translateX(-50%); opacity:.85 }
.state-samples .is-false { background:var(--bg) }
.state-samples .is-unknown { background:var(--bg); border-radius:1px; transform:translateX(-50%) rotate(45deg) }
.state-samples__point.is-inspected { width:8px; height:8px; top:7px; opacity:1; box-shadow:0 0 0 3px var(--bg-2); z-index:1 }
</style>
