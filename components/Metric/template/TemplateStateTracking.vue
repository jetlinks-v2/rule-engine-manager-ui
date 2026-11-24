<template>
  <section class="state-tracking">
    <div v-if="!labelsOnly" class="state-tracking__sentence"><AIcon type="HistoryOutlined" /><span :title="t('intervalTrackSentence')">{{ t('stateRecording') }}</span><a-switch size="small" :checked="!!rule.stateTracking" :disabled="disabled" :aria-label="t('intervalTrackSentence')" @change="toggle(!!$event)" /></div>
    <div v-if="rule.stateTracking && !labelsOnly" class="state-tracking__details">
      <div class="state-tracking__limit"><span>{{ t('stateSampleNoDataFor') }}</span><TemplateDuration :model-value="rule.stateTracking.maxNoData" :disabled="disabled" @update:model-value="emit('patch', { stateTracking: { maxNoData: $event || 'PT20M' } })" /><span>{{ t('sentenceInterrupted') }}{{ t('sentenceEnd') }}</span></div>
    </div>
    <div class="state-tracking__sentence"><AIcon type="BgColorsOutlined" /><span>{{ t('stateDisplay') }}</span></div>
      <div class="state-tracking__labels">
        <div class="state-tracking__columns" aria-hidden="true"><span>{{ t(booleanResult ? 'output' : 'stateCode') }}</span><span>{{ t('stateName') }}</span></div>
        <div v-for="(item,index) in labels" :key="index" class="state-tracking__label">
          <a-popover v-if="!disabled" trigger="click" placement="leftTop" :overlay-style="{ maxWidth:'calc(100vw - 32px)' }"><template #content><div class="state-tracking__appearance"><IconValueEditor :model-value="item.icon" :preview-fallback="stateLabel(item.value,labels,String(locale))" :preview-size="28" @update:model-value="setLabel(index,{ ...item,icon:$event })" /></div></template><button type="button" class="state-tracking__icon" :aria-label="t('stateAppearanceFor',{ name:stateLabel(item.value,labels,String(locale)) })"><IconValueView :value="item.icon" :size="20" :fallback-text="stateLabel(item.value,labels,String(locale))" /></button></a-popover>
          <IconValueView v-else :value="item.icon" :size="20" :fallback-text="stateLabel(item.value,labels,String(locale))" />
          <span v-if="booleanResult">{{ t(item.value ? 'conditionTrue' : 'conditionFalse') }}</span><Editable v-else :value="typeof item.value === 'string' ? JSON.stringify(item.value) : String(item.value)" :component-props="{ disabled, bordered:false, 'aria-label':`${t('stateCode')}: ${String(item.value)}` }" @change="setCode(index, String($event))" /><span class="state-tracking__arrow">→</span>
          <I18nTextEditable :value="item.name" field="name" size="small" :label="t('stateName')" :i18n-messages="{ name:item.nameI18n || {} }" :disabled="disabled" @change="setLabel(index, { ...item, name:$event.value, nameI18n:$event.i18nMessages.name })" />
          <a-button v-if="!disabled && !booleanResult" type="text" size="small" :aria-label="t('removeState', { name:stateLabel(item.value, labels, String(locale)) })" @click="saveLabels(labels.filter((_, i) => i !== index))"><AIcon type="CloseOutlined" /></a-button>
        </div>
        <a-button v-if="!disabled && !booleanResult" class="state-tracking__add" type="text" size="small" @click="saveLabels([...labels, { value:`state${labels.length + 1}`, name:'' }])"><AIcon type="PlusOutlined" />{{ t('addState') }}</a-button>
      </div>
      <div v-if="rule.stateTracking && !labelsOnly" class="state-tracking__hints">
      <small>{{ t('stateTrackingHint') }}</small>
      <small>{{ t('stateChangeValidityHint') }}</small>
      </div>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Editable from '@jetlinks-web-core/components/Editable/index.vue'
import I18nTextEditable from '@jetlinks-web-core/components/I18n/I18nTextEditable.vue'
import TemplateDuration from './TemplateDuration.vue'
import { ruleDependencies, type TemplateRule } from './designer'
import type { MetricStateLabel } from '../types'
import { metricMessages } from '../messages'
import { stateLabel } from '../stateIntervals'
import IconValueEditor from '@jetlinks-web-core/components/IconValue/IconValueEditor.vue'
import IconValueView from '@jetlinks-web-core/components/IconValue/IconValueView.vue'
const props = defineProps<{ rule:TemplateRule; disabled?:boolean; booleanResult?:boolean; labelsOnly?:boolean }>()
const emit = defineEmits<{ (event:'patch', fields:Partial<TemplateRule>):void }>()
const { t, locale } = useI18n({ useScope:'local', messages:metricMessages })
const options = computed(() => (props.rule.options || {}) as Record<string, unknown>)
const labels = computed(() => {
  const declared = (options.value.stateLabels || []) as MetricStateLabel[]
  return props.booleanResult ? [true,false].map(value => declared.find(item => item.value === value)
    || { value,name:t(value ? 'conditionTrue' : 'conditionFalse') }) : declared
})
function toggle(enabled:boolean) {
  if (props.disabled) return
  emit('patch', { stateTracking:enabled ? { maxNoData:'PT20M' } : undefined,
    ...(enabled && !props.rule.inputs?.length ? { inputs:ruleDependencies(props.rule).map(id => ({ id, metricId:id })) } : {}) })
}
function saveLabels(values:MetricStateLabel[]) { if (!props.disabled) emit('patch', { options:{ ...options.value, stateLabels:values } }) }
function setLabel(index:number, value:MetricStateLabel) { saveLabels(labels.value.map((item,i) => i === index ? value : item)) }
function setCode(index:number, text:string) {
  let value:string | number | boolean = text
  try {
    const parsed:unknown = JSON.parse(text)
    if (typeof parsed === 'string' || typeof parsed === 'number' || typeof parsed === 'boolean') value = parsed
  } catch {
    // Bare identifiers are convenient string states; quoted numeric strings retain their type.
  }
  setLabel(index, { ...labels.value[index]!, value })
}
</script>
<style scoped>
.state-tracking { display:grid; gap:8px; padding:0; margin:0 0 16px; font-size:13px }
.state-tracking__sentence { display:flex; align-items:center; flex-wrap:wrap; gap:8px; min-height:32px; color:var(--ink-2); font-size:13px; font-weight:500 }
.state-tracking__sentence > .anticon { width:16px; color:var(--ink-3) }
.state-tracking__sentence :deep(.ant-switch) { margin-inline-start:auto }
.state-tracking__details { display:grid; gap:8px; min-width:0 }
.state-tracking__limit { color:var(--ink-2); line-height:28px }
.state-tracking__limit > span:last-child { white-space:nowrap }
.state-tracking__limit :deep(.template-duration) { width:112px; height:28px }
.state-tracking__limit :deep(.template-duration__unit) { width:64px }
.state-tracking__labels { display:grid; min-width:0 }
.state-tracking__columns,.state-tracking__label { display:grid; grid-template-columns:20px minmax(40px,.6fr) 12px minmax(0,1fr) 24px; align-items:center; column-gap:4px; min-width:0 }
.state-tracking__columns { min-height:22px; color:var(--ink-3); font-size:11px; border-bottom:1px solid var(--line) }
.state-tracking__columns > :first-child { grid-column:2 }
.state-tracking__columns > :last-child { grid-column:4 }
.state-tracking__label { min-height:32px; border-bottom:1px solid var(--line) }
.state-tracking__label > .editable-field { min-width:0 }
.state-tracking__arrow { color:var(--ink-3) }
.state-tracking :deep(.editable-field),.state-tracking :deep(.editable-field > .text) { height:28px; line-height:28px }
.state-tracking__label :deep(.ant-btn) { width:24px; height:24px; padding:0; color:var(--ink-3) }
.state-tracking__add { justify-self:start; height:28px; padding:0 2px; color:var(--ink-2); font-size:12px }
.state-tracking__icon { border:0; padding:0; background:transparent; cursor:pointer; flex:none }
.state-tracking__icon:focus-visible { outline:2px solid var(--accent); outline-offset:3px; border-radius:4px }
.state-tracking__appearance { width:280px; max-width:calc(100vw - 56px) }
.state-tracking__label :deep(.i18n-text-editable) { min-width:0 }
.state-tracking__hints { display:grid; gap:4px }
.state-tracking small { color:var(--ink-3); font-size:11px; line-height:18px }
</style>
