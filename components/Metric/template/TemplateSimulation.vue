<template>
  <section class="template-simulation">
    <details ref="samplesSection" class="template-simulation__samples" :open="samplesOpen" @toggle="samplesOpen = ($event.target as HTMLDetailsElement).open">
      <summary><AIcon type="ExperimentOutlined" />{{ t('simulationInput') }}<small>{{ trial.facts?.samples.length || '' }}</small><AIcon type="DownOutlined" /></summary>
      <div class="template-simulation__tools">
        <slot name="sampleTools" />
        <a-popover v-if="trial.facts" trigger="click" placement="bottom">
          <template #content>
            <a-input type="datetime-local" :value="sampleDate(typeof trial.facts.endAt === 'number' ? trial.facts.endAt : undefined)" :disabled="disabled" :aria-label="t('observeUntil')" step="1" @change="trial.changeEndAt($event.target.value)" />
            <a-button v-if="trial.facts.endAt !== undefined" type="link" size="small" :disabled="disabled" @click="trial.changeEndAt('')">{{ t('observeToLastSample') }}</a-button>
          </template>
          <a-button type="text" size="small" :disabled="disabled" :danger="trial.endAtInvalid"><AIcon type="ClockCircleOutlined" />{{ t('observeUntil') }}<template v-if="typeof trial.facts.endAt === 'number'"> · {{ sampleDate(trial.facts.endAt) }}</template></a-button>
        </a-popover>
        <a-button v-if="allowAdvanced !== false" type="text" size="small" :disabled="disabled || trial.loading || trial.sampleInvalid || trial.advanced && !trial.facts" :aria-pressed="trial.advanced" @click="trial.advanced = !trial.advanced">{{ t(trial.advanced ? 'returnToDiagram' : 'advancedSamples') }}</a-button>
      </div>
      <section v-if="trial.advanced" class="template-simulation__advanced">
        <div><slot name="advancedTools" /></div>
        <small v-if="!trial.facts">{{ t('sampleTextOnly') }}</small>
        <MonacoEditor :key="trial.format" v-model="trial.text" :language="trial.format" :read-only="disabled" theme="vs" :options="editorOptions" class="template-simulation__code" />
      </section>
      <TemplateSampleEditor v-show="!trial.advanced" v-if="trial.facts" ref="sampleEditor" class="template-simulation__timeline" :template="template" :facts="trial.facts" :times="trial.index.times" :selected-time="trial.time" :selected-input="sampleInput" :loading="disabled" @change="trial.updateFacts" @invalid="trial.setSampleInvalid" @select-time="trial.selectTime" @clear-input="sampleInput = undefined" />
      <small v-if="trial.sampleInvalid || trial.endAtInvalid" role="status">{{ t('completeSample') }}</small>
    </details>
    <a-alert v-if="trial.response?.status === 'failed' && trial.results.length" type="warning" :message="t('partialSimulation')" show-icon />
    <a-alert v-if="trial.response?.recordsTruncated" type="info" :message="t('recordsTruncated')" show-icon />
    <a-alert v-if="error" type="error" :message="error" show-icon />
    <details v-if="selected && selected.kind !== 'input'" class="template-simulation__result" open>
      <summary><AIcon type="FundProjectionScreenOutlined" />{{ t('simulationResult') }}<AIcon type="DownOutlined" /></summary>
      <TemplateSimulationDetail :template="template" :selected="selected" :snapshot="trial.preview.nodes[nodeKey(selected)]" :results="trial.results" :time="trial.time" @select-entry="trial.selectedEntry = $event" />
    </details>
  </section>
</template>
<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MonacoEditor from '@jetlinks-web-core/components/MonacoEditor/monacoEditor.vue'
import TemplateSampleEditor from './TemplateSampleEditor.vue'
import TemplateSimulationDetail from './TemplateSimulationDetail.vue'
import { nodeKey, type TemplateNode } from '@jetlinks-web-core/components/Metric/template/designer'
import { sampleDate } from '@jetlinks-web-core/components/Metric/template/simulation'
import type { TemplateSimulationState } from './useTemplateSimulation'
import { metricMessages } from '@jetlinks-web-core/components/Metric/messages'
import type { MetricTemplate } from '@jetlinks-web-core/components/Metric/types'
const props = withDefaults(defineProps<{ template:MetricTemplate; trial:TemplateSimulationState; selected?:TemplateNode; error?:string; disabled?:boolean; allowAdvanced?:boolean }>(), { allowAdvanced:true })
const { t } = useI18n({ useScope:'local', messages:metricMessages })
const samplesSection = ref<HTMLDetailsElement>()
const sampleEditor = ref<InstanceType<typeof TemplateSampleEditor>>()
const samplesOpen = ref(false)
const sampleInput = ref<string>()
// 只在定位输入或出现新错误时展开；校验恢复与试算刷新不能覆盖手动折叠状态。
watch([() => props.selected && nodeKey(props.selected), () => props.selected?.kind === 'input' ? props.template.inputDefinitions[props.selected.index]?.id : undefined], () => {
  sampleInput.value = props.selected?.kind === 'input' ? props.template.inputDefinitions[props.selected.index]?.id : undefined
  if (props.selected?.kind === 'input') samplesOpen.value = true
}, { immediate:true })
watch([() => props.trial.sampleInvalid, () => props.trial.endAtInvalid], ([sampleInvalid, endAtInvalid], previous) => {
  if (sampleInvalid && !previous?.[0] || endAtInvalid && !previous?.[1]) samplesOpen.value = true
}, { immediate:true })
/** 主动定位样本时统一更新展开状态，再滚动并交接新样本的编辑焦点。 */
async function focusSamples(editValue = false, inputId?:string) {
  sampleInput.value = inputId
  samplesOpen.value = true
  await nextTick()
  if (samplesSection.value) {
    const panel = samplesSection.value.closest?.<HTMLElement>('.template-designer__panel-content, .config-properties')
    if (panel) {
      panel.scrollTop += samplesSection.value.getBoundingClientRect().top - panel.getBoundingClientRect().top
      const timeline = samplesSection.value.querySelector<HTMLElement>('.template-simulation__timeline')
      const selected = timeline?.querySelector<HTMLElement>('.sample-editor__moment.selected')
      if (timeline && selected) timeline.scrollTop += selected.getBoundingClientRect().top - timeline.getBoundingClientRect().top
    }
    if (editValue && props.trial.facts) await sampleEditor.value?.editSample(props.trial.facts.samples.length - 1)
  }
}
defineExpose({ focusSamples })
const editorOptions = { minimap:{ enabled:false }, wordWrap:'on', automaticLayout:true }
</script>
<style scoped>
.template-simulation { display:grid; grid-template-columns:minmax(0,1fr); gap:12px; min-width:0; margin-top:16px; padding-top:12px; border-top:1px solid var(--line) }
.template-simulation summary { display:flex; align-items:center; gap:6px; min-height:28px; font-size:12px; color:var(--ink-3); cursor:pointer; list-style:none }
.template-simulation summary::-webkit-details-marker { display:none }
.template-simulation summary > :last-child { margin-left:auto; font-size:10px; transform:rotate(-90deg) }
.template-simulation details[open] > summary > :last-child { transform:none }
.template-simulation small { color:var(--ink-3); font-size:11px }
.template-simulation__tools { display:flex; align-items:center; justify-content:space-between; gap:6px; flex-wrap:wrap; margin:6px 0 }
.template-simulation__advanced { min-width:0; display:grid; gap:8px }
.template-simulation__code { height:280px }
.template-simulation__timeline { max-height:40vh; overflow:auto; scrollbar-gutter:stable }
.template-simulation__tools :deep(.ant-btn) { font-size:11px; padding-inline:0 }
</style>
