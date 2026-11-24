<template>
  <div class="window-editor">
    <TemplateWindowDescription :rule="rule" :catalog="catalog" editable>
      <template #source><slot name="source" /></template>
      <template #range>
        <Editable class="window-editor__range" type="select" :value="mode" :component-props="{ disabled, bordered:false, defaultOpen:true, 'aria-label':t('windowRange'), options:modes, dropdownMatchSelectWidth:false }" @change="changeMode($event as TemplateWindow['mode'])">{{ t(mode === 'none' ? 'sentenceLatestWindow' : mode === 'time' ? 'sentenceTimeWindow' : 'sentenceCountWindow') }}</Editable>
        <TemplateDuration v-if="mode === 'time'" :model-value="window?.size" :min="1" :disabled="disabled" @update:model-value="patchWindow({ size:$event })" />
        <Editable v-else-if="mode === 'latestN'" class="window-editor__count" type="number" :value="Number(window?.size) || undefined" :component-props="{ min:1, precision:0, disabled, bordered:false, controls:false, 'aria-label':t('sampleCount') }" @change="patchWindow({ size:$event == null ? undefined : String($event) })" />
        <span v-if="mode === 'latestN'">{{ t('sentenceReadings') }}</span>
      </template>
      <template #rangeHelp>
        <a-tooltip :trigger="['hover','focus']" :mouse-enter-delay="0.1">
          <template #title><div>{{ modes.find(item=>item.value === mode)?.description }}</div><div v-if="mode === 'time'">{{ timeModes.find(item=>item.value === (window?.timeMode || 'processing'))?.description }}</div></template>
          <span class="window-editor__help" tabindex="0" role="img" :aria-label="t('windowRange')"><AIcon type="InfoCircleOutlined" /></span>
        </a-tooltip>
      </template>
      <template #statistic>
        <Editable class="window-editor__statistic" type="select" :value="statistic" :component-props="{ disabled:disabled || !catalog.length, bordered:false, defaultOpen:true, 'aria-label':t('statistic'), placeholder:statistic, options:statistics, dropdownMatchSelectWidth:false }" @change="setAggregation($event as string)">
          <template #option="option"><SelectOption :label="option.label" :icon="option.icon" :description="option.description"><template v-if="option.formula" #description><CalculatorFormula :formula="option.formula" :description="option.description" :symbols="option.symbols" /></template></SelectOption></template>
        </Editable>
      </template>
      <template #parameter="{parameter,value}">
        <TemplateDuration v-if="parameter.expands?.editor === 'duration'" :model-value="value as string | undefined" :min="1" :disabled="disabled" @update:model-value="patchWindow({ [parameter.id]:$event })" />
        <MetricParameterValue v-else inline :parameter="parameter" :model-value="value" :disabled="disabled" @update:model-value="patchWindow({ [parameter.id]:$event })" />
      </template>
      <template v-if="!descriptor || descriptor.timeModes.length > 1" #timeBasis>
        <Editable class="window-editor__choice" type="select" :value="window?.timeMode || 'processing'" :component-props="{ disabled, bordered:false, defaultOpen:true, 'aria-label':t('timeBasis'), options:timeModes }" @change="patchWindow({ timeMode:$event as TemplateWindow['timeMode'] })" />
      </template>
      <template #expectedCount="{placeholder}"><Editable class="window-editor__amount" type="number" :value="rule.qualityPolicy?.expectedCount ?? window?.expectedCount" :component-props="{ disabled, placeholder, min:1, precision:0, controls:false, bordered:false, 'aria-label':t('expectedCount') }" @change="setExpectedCount($event as number | null)" /></template>
      <template #coverageHelp><a-tooltip :title="t('coverageHint')" :trigger="['hover','focus']" :mouse-enter-delay="0.1"><span class="window-editor__help" tabindex="0" role="img" :aria-label="t('expectedCount')"><AIcon type="InfoCircleOutlined" /></span></a-tooltip></template>
      <template #capacity="{placeholder}"><Editable class="window-editor__amount" type="number" :value="window?.maxEntries" :component-props="{ disabled, placeholder, min:1, precision:0, controls:false, bordered:false, 'aria-label':t('windowCapacity') }" @change="patchWindow({ maxEntries:($event ?? undefined) as number | undefined })" /></template>
    </TemplateWindowDescription>
    <TemplateAlgorithmGuide v-if="mode !== 'none'" :key="descriptor?.id" :descriptor="descriptor" />
  </div>
</template>
<script setup lang="ts">
import { computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateDuration from './TemplateDuration.vue'
import TemplateWindowDescription from './TemplateWindowDescription.vue'
import Editable from '@jetlinks-web-core/components/Editable/index.vue'
import SelectOption from '@jetlinks-web-core/components/SelectOption/index.vue'
import CalculatorFormula from './CalculatorFormula.vue'
import TemplateAlgorithmGuide from './TemplateAlgorithmGuide.vue'
import MetricParameterValue from '../MetricParameterValue.vue'
import { metricAggregationsKey } from '../calculatorContext'
import { aggregationOptions } from './aggregationPresentation'
import { windowFields, type TemplateWindow } from './window'
import type { MetricAggregationDescriptor } from '../types'
import type { TemplateRule } from './designer'
import { windowMessages } from './windowPresentation'
const props = defineProps<{ rule: TemplateRule; disabled?: boolean }>()
const emit = defineEmits<{ (event: 'patch', value: Partial<TemplateRule>): void }>()
const { t } = useI18n({ useScope:'local', messages:windowMessages })
const window = computed(() => props.rule.window)
const mode = computed(() => window.value?.mode || 'none')
const inherited = inject(metricAggregationsKey,undefined)
const catalog = computed(() => inherited?.value || [])
const statistic = computed(() => props.rule.timeAggregation || props.rule.aggregation || 'avg')
const descriptor = computed(() => catalog.value.find(item=>item.id === statistic.value))
const modes = computed(() => [
  { value:'time', label:t('window_time'), icon:'ClockCircleOutlined', description:t('rollingWindowHint') },
  { value:'latestN', label:t('window_latestN'), icon:'BarsOutlined', disabled:!!descriptor.value && !descriptor.value.windowModes.includes('latestN'), description:t('countWindowHint') },
  { value:'none', label:t('window_none'), icon:'ThunderboltOutlined', description:t('latestWindowHint') },
])
const statistics = computed(() => aggregationOptions(catalog.value,mode.value,t('statisticWindowUnsupported')))
const timeModes = computed(() => ['event', 'processing', 'hybrid'].map(value => ({ value, label:t(`time_${value}`), icon:'ClockCircleOutlined', disabled:!!descriptor.value && !descriptor.value.timeModes.includes(value), description:t(`time${value[0].toUpperCase()}${value.slice(1)}Hint`) })))
function patchWindow(fields: Partial<TemplateWindow>) { if (!props.disabled) emit('patch', { window: { ...window.value, ...fields } }) }
function setAggregation(value: string) {
  if (props.disabled || !statistics.value.some(item => item.value === value && !item.disabled)) return
  const item = catalog.value.find(item=>item.id === value)!
  const nextWindow = statisticWindow(item)
  if (!item.timeModes.includes(nextWindow.timeMode || 'processing')) nextWindow.timeMode = item.timeModes[0] as TemplateWindow['timeMode']
  emit('patch',{ aggregation:item.aggregation ?? undefined, timeAggregation:item.timeAggregation ?? undefined, window:nextWindow })
}
function statisticWindow(item?:MetricAggregationDescriptor):TemplateWindow {
  const next = { ...window.value }
  for (const field of catalog.value.flatMap(item=>item.parameterDefinitions)) delete next[field.id]
  Object.assign(next,item?.windowDefaults)
  for (const field of item?.parameterDefinitions || []) if (window.value?.[field.id] != null) next[field.id] = window.value[field.id]
  return next
}
function setExpectedCount(value: number | null) {
  if (!props.disabled) emit('patch', { qualityPolicy: { ...props.rule.qualityPolicy, expectedCount: value ?? undefined }, window: { ...window.value, expectedCount: undefined } })
}
function changeMode(value: TemplateWindow['mode']) {
  if (props.disabled || value !== 'none' && descriptor.value && !descriptor.value.windowModes.includes(value || 'none')) return
  emit('patch', { type:value === 'none' ? 'raw' : 'feature', aggregation:value === 'none' || props.rule.timeAggregation ? undefined : props.rule.aggregation || 'avg', timeAggregation:value === 'none' ? undefined : props.rule.timeAggregation, window:windowFields(value === 'none' ? statisticWindow() : window.value,value) })
}
</script>
<style scoped>
.window-editor { display:grid; gap:8px }
.window-editor__range,.window-editor__statistic { min-width:40px; max-width:100%; color:var(--accent) }
.window-editor__choice { width:auto; max-width:180px; color:var(--accent) }
.window-editor__amount { min-width:40px; color:var(--accent) }
.window-editor__count { min-width:20px; color:var(--accent) }
.window-editor__help { display:inline-flex; align-items:center; color:var(--ink-3); margin-inline:4px; font-size:12px; cursor:help; line-height:20px }
.window-editor__help:focus-visible { outline:1px solid var(--accent); outline-offset:2px }
</style>
