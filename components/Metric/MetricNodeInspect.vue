<template>
  <a-popover :open="visible" :trigger="['hover','focus']" placement="bottom" :get-popup-container="popupContainer" :mouse-enter-delay=".2" :mouse-leave-delay=".15" :destroy-tooltip-on-hide="true" :overlay-style="expanded ? {visibility:'hidden',pointerEvents:'none'} : undefined" @open-change="setOpen">
    <button type="button" class="metric-node-inspect" :aria-label="t('executionInspectNode',{name:nodeLabel(detail.template,detail.node)})" :aria-expanded="visible" @keydown.esc.stop.prevent="close"><AIcon type="InfoCircleOutlined" /></button>
    <template #content>
      <section v-if="visible" class="metric-node-inspect__detail" @focusin="contentFocused=true" @focusout="leaveContent" @keydown.esc.stop.prevent="close">
        <div v-if="reads.length > 1" class="metric-node-inspect__reads" :aria-label="t('executionReadings')">
          <button v-for="read in reads" :key="readId(read)" type="button" :aria-pressed="selectedRead === read" @click="selectRead(read)"><span>{{ t('executionReadBy',{name:read.step.name || read.step.definitionId}) }}<b>{{ valueText(read.value,read.input.metricId) }}</b></span><small>{{ t('evidenceDataTime') }} {{ time(read.input.input?.inputTimeEnd) }}</small></button>
        </div>
        <MetricExecutionEvidence v-if="selectedRead" :value="selectedRead.step.value" :template="detail.template" :output="{metricId:selectedRead.step.definitionId}" :input-id="selectedRead.input.id" />
        <MetricExecutionEvidence v-else-if="detail.step" :value="detail.value || detail.step.value" :template="detail.template" :explanation="detail.step.explanation" :output="{metricId:detail.metricId}" @expanded-change="expanded=$event" />
        <small v-else>{{ t('executionDifferentReads') }}</small>
      </section>
    </template>
  </a-popover>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MetricExecutionEvidence from './MetricExecutionEvidence.vue'
import { nodeLabel,type TemplateNode } from './template/designer'
import type { MetricTemplate,MetricValue } from './types'
import type { MetricExecutionRead,MetricExecutionStep } from './execution'
import { semanticValueText,metricValueSchema,metricValueLabels,metricValueUnit } from './valueSemantics'
import { metricDurationText } from './presentation'
import { metricDateText as time } from './time'
import { metricMessages } from './messages'
const props=withDefaults(defineProps<{detail:{template:MetricTemplate;node:TemplateNode;metricId:string;step?:MetricExecutionStep;value?:MetricValue;reads?:MetricExecutionRead[]};open?:boolean}>(),{open:undefined})
const emit=defineEmits<{(event:'openChange',value:boolean):void;(event:'read',read:MetricExecutionRead):void}>()
const {t,locale}=useI18n({useScope:'local',messages:metricMessages})
const localOpen=ref(false),expanded=ref(false),contentFocused=ref(false),readKey=ref<string>()
const visible=computed(()=>props.open ?? localOpen.value)
// 脱离缩放画布，留在所属浮层内，避免 body 滚动改变说明面板的定位。
const popupContainer=(trigger?:HTMLElement)=>trigger?.closest<HTMLElement>('dialog,.ant-drawer-content,.ant-modal-content') || trigger?.ownerDocument.body || document.body
watch(visible,value=>{if(!value)contentFocused.value=false})
// 计算节点优先解释自己的执行步骤；下游的消费快照只用于没有生产步骤的来源。
const reads=computed(()=>props.detail.step && props.detail.node.kind !== 'input' ? [] : props.detail.reads || [])
const readId=(read:MetricExecutionRead)=>`${read.step.id}:${read.input.id}`
const selectedRead=computed(()=>reads.value.length === 1 ? reads.value[0] : reads.value.find(read=>readId(read) === readKey.value))
watch([()=>props.detail.template.id,()=>props.detail.template.version,()=>props.detail.node.kind,()=>props.detail.node.index],()=>{readKey.value=undefined})
// 放大仍由当前浮层持有内容；隐藏原浮层，避免遮挡Modal且不销毁被移动的公式。
// 展开内容会让浮层换向；操作焦点仍在内容中时，不能被重定位产生的鼠标离开关闭。
function setOpen(value:boolean) {if(!value && (expanded.value || contentFocused.value))return;localOpen.value=value;emit('openChange',value)}
function close() {contentFocused.value=false;setOpen(false)}
function leaveContent(event:FocusEvent) {
  contentFocused.value=(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)
  if(!contentFocused.value)setOpen(false)
}
function selectRead(read:MetricExecutionRead) {readKey.value=readId(read);emit('read',read)}
function valueText(value:MetricValue,id:string) {
  const template=props.detail.template,unit=value.unit || metricValueUnit(template,id)
  const text=semanticValueText(value.value,{labels:metricValueLabels(template,id),schema:metricValueSchema(template,id),unit,locale:String(locale.value)},t)
  return unit && value.value != null && metricDurationText(value.value,unit,t) === undefined ? `${text} ${unit}` : text
}
</script>
<style scoped>
.metric-node-inspect { display:grid; place-items:center; border:0; background:transparent; color:var(--ink-3); width:24px; height:24px; padding:0; cursor:help; border-radius:4px; font-size:13px }
.metric-node-inspect:hover,.metric-node-inspect:focus-visible { color:var(--accent); background:var(--accent-soft); outline:none }
.metric-node-inspect__detail { width:min(480px,calc(100vw - 64px)); max-height:min(480px,65vh); overflow:auto; display:grid; gap:12px; padding:2px; overscroll-behavior:contain }
.metric-node-inspect__detail small { color:var(--ink-3); font-size:12px }
.metric-node-inspect__reads { display:flex; gap:6px; flex-wrap:wrap }
.metric-node-inspect__reads button { flex:1 1 220px; display:grid; gap:4px; text-align:left; border:1px solid var(--line); background:var(--bg); border-radius:6px; padding:8px 10px; color:var(--ink-2); cursor:pointer }
.metric-node-inspect__reads button[aria-pressed=true] { border-color:var(--accent); background:var(--accent-soft) }
.metric-node-inspect__reads span { display:flex; justify-content:space-between; gap:12px; font-size:12px }
.metric-node-inspect__reads b { font-weight:500; color:var(--ink-1) }
</style>
