<template>
  <div class="metric-time-range" :class="{'is-compact':compact}" :aria-label="t('trendRange')">
    <span class="metric-time-range__label"><AIcon type="ClockCircleOutlined" /> {{ t('trendRange') }}</span>
    <div class="metric-time-range__choices">
      <button v-for="item in options" :key="item.value" type="button" :title="t(item.label)" :aria-label="t(item.label)" :aria-pressed="!customRange && range === item.value" @click="choose(item.value)"><span class="metric-time-range__full">{{ t(item.label) }}</span><span v-if="compact" class="metric-time-range__short" aria-hidden="true">{{ t(item.label+'Compact') }}</span></button>
      <a-popover v-model:open="open" trigger="click" placement="bottomRight">
        <template #content><a-range-picker :value="dates" show-time :placeholder="[t('rangeStart'), t('rangeEnd')]" @change="setDates" /></template>
        <button type="button" :aria-pressed="!!customRange" :title="customLabel || t('custom')" :aria-label="t('custom')"><AIcon type="CalendarOutlined" /></button>
      </a-popover>
    </div>
    <small v-if="customLabel" :title="customLabel">{{ customLabel }}</small>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import dayjs, { type Dayjs } from 'dayjs'
import { metricMessages } from './messages'
const props = defineProps<{ range: number; customRange?: [number, number]; compact?:boolean }>()
const emit = defineEmits<{ (event: 'update:range', value: number): void; (event: 'update:customRange', value: [number, number] | undefined): void }>()
const { t, locale } = useI18n({ useScope: 'local', messages: metricMessages })
const options = [{ value: 3600000, label: 'hour' }, { value: 86400000, label: 'day' }]
const open = ref(false)
const dates = computed<[Dayjs, Dayjs] | undefined>(() => props.customRange ? [dayjs(props.customRange[0]), dayjs(props.customRange[1])] : undefined)
const customLabel = computed(() => props.customRange?.map(value => new Date(value).toLocaleString(String(locale.value))).join(' — '))
function choose(value: number) { emit('update:customRange', undefined); emit('update:range', value) }
function setDates(value: [string, string] | [Dayjs, Dayjs] | null) { emit('update:customRange', value ? [dayjs(value[0]).valueOf(), dayjs(value[1]).valueOf()] : undefined); open.value = false }
</script>
<style scoped>
.metric-time-range { display:flex; align-items:center; flex-wrap:wrap; justify-content:flex-end; gap:var(--space-2,8px); min-width:0 }
.metric-time-range__label,.metric-time-range small { display:inline-flex; align-items:center; gap:4px; color:var(--ink-2); font-size:var(--fs-12,12px); line-height:20px }
.metric-time-range small { max-width:22rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.metric-time-range__choices { display:flex; align-items:center; gap:2px; height:28px; padding:2px; box-sizing:border-box; background:var(--bg-sunken); border-radius:var(--r-2,6px) }
.metric-time-range button { display:inline-flex; align-items:center; justify-content:center; height:24px; min-width:24px; border:0; background:transparent; color:var(--ink-2); border-radius:4px; padding:2px 8px; font:inherit; font-size:var(--fs-12,12px); line-height:20px; cursor:pointer; white-space:nowrap }
.metric-time-range button[aria-pressed=true] { color:var(--accent); background:var(--panel-background) }
.metric-time-range button:focus-visible { outline:2px solid var(--accent); outline-offset:2px }
.metric-time-range__short { display:none }
@media(max-width:600px) { .metric-time-range__label { display:none } }
@media(max-width:600px) { .metric-time-range.is-compact .metric-time-range__full { display:none }.metric-time-range.is-compact .metric-time-range__short { display:inline } }
</style>
