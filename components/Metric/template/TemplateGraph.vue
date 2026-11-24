<template>
  <div class="template-graph-shell" :class="{ 'is-replay':!!overlay, 'is-overview':!!overlay && scale < .65 }" :style="{ '--metric-node-width': `${layout.nodeWidth}px`, '--metric-node-height': `${layout.nodeHeight}px`, '--metric-graph-scale':scale }">
  <div class="template-graph__toolbar">
    <div class="template-graph__time"><slot name="clock"><small v-if="simulationPreview?.time !== undefined" role="status"><AIcon type="ClockCircleOutlined" />{{ t('flowTime') }} · {{ sampleDate(simulationPreview?.time).replace('T',' ') }}</small></slot></div>
    <nav :aria-label="t('canvasTools')">
      <div v-if="$slots.tools" class="template-graph__actions"><slot name="tools" /></div>
      <div class="template-graph__zoom">
      <a-button type="text" size="small" :disabled="scale <= minimumScale" :title="t('canvasZoomOut')" :aria-label="t('canvasZoomOut')" @click="zoom(scale / 1.2)"><AIcon type="MinusOutlined" /></a-button>
      <a-button type="text" size="small" class="template-graph__percent" :title="t('canvasReset')" @click="zoom(1)">{{ percent }}</a-button>
      <a-button type="text" size="small" :disabled="scale >= 2" :title="t('canvasZoomIn')" :aria-label="t('canvasZoomIn')" @click="zoom(scale * 1.2)"><AIcon type="PlusOutlined" /></a-button>
      <a-button type="text" size="small" :title="t('canvasFit')" :aria-label="t('canvasFit')" @click="fit()"><AIcon type="CompressOutlined" /></a-button>
      <a-tooltip :title="t(overlay ? 'canvasReadOnlyShortcuts' : 'canvasShortcuts')"><a-button type="text" size="small" :aria-label="t(overlay ? 'canvasReadOnlyShortcuts' : 'canvasShortcuts')"><AIcon type="QuestionCircleOutlined" /></a-button></a-tooltip>
      </div>
    </nav>
  </div>
  <div ref="viewport" class="template-graph" :style="contentStyle" :class="{ 'is-grabbable':space, 'is-dragging':dragging }" tabindex="0" :aria-label="t('relations')" aria-keyshortcuts="Delete Backspace Escape + - 0 1" @click.capture="captureClick" @click="clickBackground" @keydown="keydown" @focusout="focusout" @pointerdown.capture="down" @pointermove="pan" @pointerup="end" @pointercancel="cancel" @lostpointercapture="end">
    <a-empty v-if="!graph.nodes.length" :description="t('emptyDesign')" />
    <div v-else class="template-graph__extent" :style="{ width: `${graph.width * scale}px`, height: `${graph.height * scale}px` }">
    <div class="template-graph__canvas" :style="{ width: `${graph.width}px`, height: `${graph.height}px`, transform:`scale(${scale})` }">
      <div v-for="level in graph.levels" :key="level.level" class="template-graph__heading" :style="{ top: `${level.y}px` }">
        <span>{{ t(level.kind === 'input' ? 'inputs' : level.kind === 'output' ? 'outputs' : level.kind === 'mixed' ? 'graphCalculationAndOutput' : 'calculation') }}</span>
      </div>
      <div v-for="group in groups" :key="group.key" class="template-graph__time-group" :style="{ left: `${group.x}px`, top: `${group.y}px`, width: `${group.width}px` }"><span><AIcon type="ClockCircleOutlined" /> {{ group.label }}</span></div>
      <svg class="template-graph__connections" :viewBox="`0 0 ${graph.width} ${graph.height}`" aria-hidden="true">
        <defs>
          <marker :id="arrowId" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1,1 L7,4 L1,7" /></marker>
          <marker :id="`${arrowId}-selected`" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="template-graph__selected-arrow" d="M1,1 L7,4 L1,7" /></marker>
        </defs>
        <path v-for="edge in graph.edges" :key="edge.key" class="template-graph__edge" :class="{ active: !overlay && (edge.source === active || edge.target === active), linked: relatedEdges.has(edge.key), referenced: edge.source === previewKey || edge.target === previewKey, 'is-muted': overlay && (overlay.edges ? !overlay.edges.has(edge.key) : overlay.nodes[edge.source] === 'inactive' || overlay.nodes[edge.target] === 'inactive'), 'is-unfocused': overlay && selected && !relatedEdges.has(edge.key) }" :d="edge.path" :marker-end="`url(#${arrowId}${relatedEdges.has(edge.key) ? '-selected' : ''})`" />
        <path v-for="edge in selectedEdges" :key="`flow-${edge.key}`" class="template-graph__flow" :d="edge.path" />
      </svg>
      <div v-for="node in graph.nodes" :key="node.key" class="template-graph__item" :class="{ 'menu-open': openNode === node.key, 'is-selected': selected && nodeKey(selected) === node.key }" :style="{ left: `${node.x}px`, top: `${node.y}px` }"
        @focusin="focused = node.key" @focusout="focused = undefined">
      <button type="button" :data-node="node.key"
        class="template-graph__node" :class="[node.kind, { selected: selected && nodeKey(selected) === node.key, referenced: node.key === previewKey, 'is-muted': overlay?.nodes[node.key] === 'inactive', 'is-incomplete':overlay?.nodes[node.key] === 'incomplete', 'is-unfocused':overlay && selected && !relatedNodes.has(node.key) }]"
        :aria-label="`${t(node.kind === 'input' ? 'inputs' : node.kind === 'rule' ? 'calculation' : 'outputs')} · ${node.label || t('unnamedOutput')} · ${summaries[node.key].text} · ${simulationPreview ? previewValue(node) + ' · ' + previewState(node.key) : summaries[node.key].detail}`"
        :aria-pressed="!!selected && nodeKey(selected) === node.key"
        :title="simulationPreview && node.kind !== 'input' ? `${previewValue(node)} ${previewUnit(node)} · ${previewState(node.key)}` : undefined"
        @click="emit('select', node, $event.currentTarget as HTMLButtonElement)">
        <span class="template-graph__name"><b :title="node.label || t('unnamedOutput')">{{ node.label || t('unnamedOutput') }}</b><span class="template-graph__semantics">
          <a-tooltip v-for="hint in summaries[node.key].hints" :key="hint.icon" :title="hint.label" :trigger="['hover','focus']"><span tabindex="0" role="img" :aria-label="hint.label"><AIcon :type="hint.icon" /></span></a-tooltip>
        </span></span>
        <slot name="node-summary" :node="node" :summary="summaries[node.key]">
        <span class="template-graph__meaning">
          <TemplateFormulaDisplay v-if="summaries[node.key].expression" :template="template" :rule="template.definitions[node.index] as TemplateRule" :expression="summaries[node.key].expression!" :calculators="calculators" compact summary thumbnail />
          <span v-else class="template-graph__declaration">
            <span :title="summaries[node.key].typeText || summaries[node.key].text">{{ summaries[node.key].typeText || summaries[node.key].text }}</span>
            <a-popover v-if="summaries[node.key].choices?.length" :trigger="['hover','focus']" placement="bottomLeft">
              <template #content><div class="template-graph__choice-list" role="list" :aria-label="t('semanticStateOptions')"><span v-for="(choice,index) in summaries[node.key].choices" :key="index" role="listitem"><IconValueView v-if="choice.icon" :value="choice.icon" :size="14" indicator /><span>{{ choice.name }}</span><code>{{ String(choice.value) }}</code></span></div></template>
              <span class="template-graph__choices" tabindex="0" :aria-label="`${t('semanticStateOptions')} · ${summaries[node.key].preview}`">
                <span v-for="(choice,index) in summaries[node.key].choices!.slice(0,2)" :key="index" class="template-graph__choice"><IconValueView v-if="choice.icon" :value="choice.icon" :size="12" indicator /><span>{{ choice.name }}</span></span>
                <span v-if="summaries[node.key].choices!.length > 2" class="template-graph__choice-count">+{{ summaries[node.key].choices!.length - 2 }}</span>
              </span>
            </a-popover>
            <small v-else-if="summaries[node.key].preview || summaries[node.key].description" :title="summaries[node.key].preview || summaries[node.key].description">{{ summaries[node.key].preview || summaries[node.key].description }}</small>
          </span>
        </span>
        </slot>
      </button>
      <div v-if="$slots['node-action']" class="template-graph__node-action"><slot name="node-action" :node="node" /></div>
      <div v-if="simulationPreview" class="template-graph__trial" :style="{ pointerEvents:node.kind === 'input' ? 'auto' : 'none' }">
        <slot v-if="node.kind === 'input'" name="input-sample" :node="node"><span>{{ previewValue(node) }}</span></slot>
        <template v-else><span class="template-graph__reading"><b>{{ previewValue(node) }}</b><small>{{ previewUnit(node) }}</small></span><small class="template-graph__state">{{ previewState(node.key) }}</small><small v-if="(simulationPreview.nodes[node.key]?.alternatives.length || 0) > 1">+{{ simulationPreview.nodes[node.key].alternatives.length - 1 }}</small></template>
      </div>
      <a-dropdown v-if="actionsForNode(node).length > 1" :open="openNode === node.key" :trigger="['click']" @open-change="openNode = $event ? node.key : undefined">
        <button type="button" class="template-graph__node-add" :data-add-from="node.key" :aria-label="t('addAfterNode', { name:node.label || t('unnamedOutput') })" :title="t('addAfterNode', { name:node.label || t('unnamedOutput') })" @click="rememberAddTrigger" @keydown.esc="closeAddition"><AIcon type="PlusOutlined" /></button>
        <template #overlay><a-menu @click="addFromNode(node, $event)" @keydown.esc="closeAddition"><a-menu-item v-for="action in actionsForNode(node)" :key="action.kind" :disabled="action.disabled" :title="action.disabled ? t('publishedOutputLocked') : undefined"><AIcon :type="action.icon" />{{ t(action.label) }}<small v-if="action.disabled" class="template-graph__add-hint">{{ t('publishedOutputLocked') }}</small></a-menu-item></a-menu></template>
      </a-dropdown>
      <button v-else-if="actionsForNode(node).length === 1" type="button" class="template-graph__node-add" :data-add-from="node.key" :aria-label="t('addAfterNode', { name:node.label || t('unnamedOutput') })" :title="t(actionsForNode(node)[0].label)" @click="addSingle(node, $event)"><AIcon type="PlusOutlined" /></button>
      </div>
    </div>
    </div>
  </div>
  <small v-if="overflow" class="template-graph__scroll-hint"><AIcon type="SwapOutlined" />{{ t('scrollRelations') }}</small>
  </div>
</template>
<script setup lang="ts">
import { computed, inject, ref, useId, watch } from 'vue'
import { useElementSize } from '@vueuse/core'
import { useCanvasViewport } from '@jetlinks-web-core/hooks/useCanvasViewport'
import { useI18n } from 'vue-i18n'
import { metricMessages } from '../messages'
import { nodeKey, relatedGraphEdges, templateGraph, templateGraphLayout, type TemplateNode, type TemplateRule } from './designer'
import { graphNodeSummary, graphTimeGroups } from './graphPresentation'
import TemplateFormulaDisplay from './formula/TemplateFormulaDisplay.vue'
import IconValueView from '@jetlinks-web-core/components/IconValue/IconValueView.vue'
import { metricDurationText } from '../presentation'
import { sampleDate } from './simulation'
import { simulationMeaning, type SimulationPreview } from './simulationPreview'
import { semanticValueText } from '../valueSemantics'
import type { MetricCalculatorDescriptor, MetricTemplate } from '../types'
import { metricCalculatorsKey, metricAggregationsKey } from '../calculatorContext'
const props = withDefaults(defineProps<{ template: MetricTemplate; selected?: TemplateNode; preview?: TemplateNode; calculators?: MetricCalculatorDescriptor[]; addKinds?: TemplateNode['kind'][]; outputLocked?:boolean; simulationPreview?:SimulationPreview; overlay?:{nodes:Record<string,string>;edges?:ReadonlySet<string>;focus?:string}; visibleNodes?:ReadonlySet<string>; fitContent?:boolean }>(), { addKinds: () => [] })
const emit = defineEmits<{ (event: 'select', node: TemplateNode, trigger: HTMLButtonElement): void; (event: 'add', kind: TemplateNode['kind'], trigger: HTMLButtonElement, source?: TemplateNode): void; (event: 'background'): void; (event:'request-remove'):void }>()
const { t, locale } = useI18n({ useScope: 'local', messages: metricMessages })
const arrowId = `metric-arrow-${useId()}`
const replay = computed(() => !!props.overlay)
const layout = computed(() => replay.value ? {...templateGraphLayout,nodeHeight:84,levelHeight:112,headingHeight:24} : templateGraphLayout)
const graph = computed(() => templateGraph(props.template,layout.value,props.visibleNodes))
const sharedCalculators = inject(metricCalculatorsKey, undefined)
const aggregations = inject(metricAggregationsKey,undefined)
const groups = computed(() => graphTimeGroups(props.template, graph.value, t))
const summaries = computed(() => Object.fromEntries(graph.value.nodes.map(node => {
  const summary = graphNodeSummary(props.template, node, t, props.calculators || sharedCalculators?.value, locale.value,aggregations?.value)
  const candidates = [
    {icon:'FilterOutlined',label:summary.condition ? `${t('applicability')}：${summary.condition}` : undefined},
    {icon:summary.icon,label:summary.method},
    {icon:summary.detailIcon || summary.icon,label:node.kind === 'input' ? summary.text : summary.detail},
  ].filter(item=>item.label)
  // One symbol may describe both the calculation and its trigger; keep both meanings in one tooltip.
  const grouped=new Map<string,Set<string>>()
  for(const hint of candidates) {
    if(!grouped.has(hint.icon))grouped.set(hint.icon,new Set())
    grouped.get(hint.icon)!.add(hint.label!)
  }
  const hints=Array.from(grouped,([icon,labels])=>({icon,label:[...labels].join('\n')}))
  return [node.key,{...summary,hints}]
})))
const focused = ref<string>()
const openNode = ref<string>()
let addTrigger: HTMLButtonElement | undefined
const nextActions = computed(() => [
  { kind: 'rule' as const, icon: 'FunctionOutlined', label: 'addNextCalculation', disabled:false },
  { kind: 'output' as const, icon: 'ExportOutlined', label: 'addOutput', disabled:!props.addKinds.includes('output') },
].filter(action => props.addKinds.includes(action.kind) || action.kind === 'output' && props.outputLocked && props.addKinds.includes('rule')))
function actionsForNode(node:TemplateNode) { return node.kind === 'output' ? [] : node.kind === 'input' ? nextActions.value.filter(action=>action.kind === 'rule') : nextActions.value }
watch(nextActions, () => { openNode.value = undefined })
// 滚动经过节点不切换连线；选中、键盘焦点和显式引用预览保留各自反馈。
const active = computed(() => openNode.value || focused.value || (props.selected && nodeKey(props.selected)))
const relatedEdges = computed(() => relatedGraphEdges(props.overlay?.edges ? graph.value.edges.filter(edge=>props.overlay!.edges!.has(edge.key)) : graph.value.edges, props.overlay?.focus || (props.selected && nodeKey(props.selected))))
const relatedNodes = computed(()=>new Set([...(props.selected ? [nodeKey(props.selected)] : []),...graph.value.edges.filter(edge=>relatedEdges.value.has(edge.key)).flatMap(edge=>[edge.source,edge.target])]))
const selectedEdges = computed(() => props.overlay ? [] : graph.value.edges.filter(edge => relatedEdges.value.has(edge.key)))
const previewKey = computed(() => props.preview && nodeKey(props.preview))
const viewport = ref<HTMLElement>()
const minimumScale = props.overlay ? .05 : .2
const readableScale = .85
const { scale,percent,space,dragging,zoom,fit,keydown,down,move:pan,end,cancel,click:captureClick,focusout } = useCanvasViewport(viewport,graph,{ clear:() => emit('background'),remove:() => emit('request-remove'),blocked:() => !!openNode.value },{minimumScale})
// 滚动条显隐不改变外框尺寸，不能触发自动适应并覆盖用户主动缩放。
const { width,height } = useElementSize(viewport,undefined,{box:'border-box'})
// 按可读比例估高，不依赖当前缩放，避免 fit 与容器高度相互反馈。
const contentStyle = computed(() => props.fitContent ? {
  height:`${Math.max(150,Math.min(400,graph.value.height * Math.min(1,Math.max(readableScale,((width.value || graph.value.width) - 32) / graph.value.width)) + 24))}px`,
  maxHeight:'48vh',flex:'none',
} : undefined)
// 自动适应保留可读比例，超宽时滚动；记录刷新或选中变化不移动视口。
const geometry = computed(()=>JSON.stringify([graph.value.width,graph.value.height,graph.value.nodes.map(node=>[node.key,node.x,node.y])]))
watch([width,height,geometry],([w,h,next],[beforeW,beforeH,beforeGeometry]) => {
  if (props.overlay && w > 0 && h > 0 && (w !== beforeW || h !== beforeH || next !== beforeGeometry)) void fit(readableScale)
},{flush:'post'})
const overflow = computed(() => width.value > 0 && graph.value.width * scale.value > width.value)
function previewValue(node:TemplateNode) {
  const entry = props.simulationPreview?.nodes[nodeKey(node)]?.entry
  if (entry?.value?.status === 'invalid' || entry?.value?.quality?.valid === false) return '—'
  const value = entry?.value ? entry.value.value : entry?.sample?.value
  const meaning = simulationMeaning(props.template,node,entry,props.calculators || sharedCalculators?.value)
  return semanticValueText(value,{ ...meaning, locale:String(locale.value) },t)
}
function previewUnit(node:TemplateNode) {
  const entry = props.simulationPreview?.nodes[nodeKey(node)]?.entry
  const unit = simulationMeaning(props.template,node,entry,props.calculators || sharedCalculators?.value).unit
  return metricDurationText(entry?.value?.value, unit, t) === undefined ? unit || '' : ''
}
function previewState(key:string) {
  const snapshot = props.simulationPreview?.nodes[key]
  return snapshot?.previous ? `${t('trialPrevious')} · ${sampleDate(snapshot.entry?.time).slice(11)}` : t(snapshot?.state || 'awaitSimulation')
}
function rememberAddTrigger(event: Event) { addTrigger = event.currentTarget as HTMLButtonElement }
function closeAddition(event:KeyboardEvent) {
  if (!openNode.value) return
  event.preventDefault(); event.stopPropagation()
  openNode.value = undefined
  addTrigger?.focus({preventScroll:true})
}
/** 只响应图内空白；节点、添加入口和菜单不改变属性面板上下文。 */
function clickBackground(event: MouseEvent) {
  if (!(event.target as Element).closest('button, [role="menu"], .template-graph__item')) { viewport.value?.focus({ preventScroll:true }); emit('background') }
}
/** 一个合法动作直接执行，多个动作由菜单选择；两条路径复用相同来源与能力判断。 */
function addSingle(node:TemplateNode,event:MouseEvent) {
  const actions = actionsForNode(node)
  if (actions.length === 1) addFromNode(node,{ key:actions[0].kind },event.currentTarget as HTMLButtonElement)
}
function addFromNode(node: TemplateNode, { key }: { key: string | number }, trigger = addTrigger) {
  const kind = key as TemplateNode['kind']
  if (trigger && actionsForNode(node).some(action=>action.kind === kind && !action.disabled)) {
    openNode.value = undefined
    emit('add', kind, trigger, { kind:node.kind, index:node.index })
  }
}
/** 显式定位只滚动图的内部视口，不移动页面和右侧属性。 */
function locate(node: TemplateNode) {
  const target = viewport.value?.querySelector<HTMLButtonElement>(`[data-node="${nodeKey(node)}"]`)
  if (!target || !viewport.value) return
  const area = viewport.value.getBoundingClientRect()
  const bounds = target.getBoundingClientRect()
  viewport.value.scrollBy({ left:bounds.left - area.left - (area.width - bounds.width) / 2, top:bounds.top - area.top - (area.height - bounds.height) / 2, behavior:'smooth' })
  target.focus({ preventScroll:true })
}
defineExpose({ locate })
</script>
<style scoped>
.template-graph__node.is-muted { opacity:.6; filter:grayscale(1) }
.template-graph__edge.is-muted { opacity:.2 }
.template-graph__node.is-incomplete { border-style:dashed }
.template-graph__node.is-unfocused { opacity:.45 }
.template-graph__edge.is-unfocused { opacity:.18 }
.is-replay .template-graph__edge.linked { stroke-opacity:.85; stroke-width:1.8 }
.template-graph { min-width:0; min-height:0; width:100%; flex:1; overflow:auto; outline:none; overscroll-behavior:contain }
.template-graph:focus-visible { outline:1px solid var(--accent); outline-offset:-1px }
.template-graph.is-grabbable,.template-graph.is-grabbable :deep(*) { cursor:grab !important; user-select:none }
.template-graph.is-dragging,.template-graph.is-dragging :deep(*) { cursor:grabbing !important }
.template-graph__toolbar { display:flex; align-items:center; justify-content:space-between; gap:8px; min-height:32px; flex:none; flex-wrap:wrap }
.template-graph__toolbar nav { display:flex; align-items:center; justify-content:flex-end; flex-wrap:wrap; gap:4px 8px; margin-left:auto }
.template-graph__actions,.template-graph__zoom { display:flex; align-items:center }
.template-graph__actions { gap:2px; padding-right:8px; border-right:1px solid var(--line) }
.template-graph__toolbar :deep(.ant-btn) { display:inline-flex; align-items:center; justify-content:center; height:28px; min-width:28px; padding-inline:6px; color:var(--ink-3); font-size:12px; line-height:20px }
.template-graph__percent { min-width:44px; font-variant-numeric:tabular-nums }
.template-graph-shell { display:flex; flex:1; flex-direction:column; min-width:0; min-height:0 }
.template-graph__time { display:block; min-width:0; font-size:11px; color:var(--ink-3) }
.template-graph__scroll-hint { display:flex; align-items:center; justify-content:flex-end; gap:6px; padding-top:6px; color:var(--ink-3); font-size:var(--fs-12,12px) }
.template-graph__extent { position:relative; margin:0 auto }
.template-graph__canvas { position:absolute; left:0; top:0; transform-origin:0 0 }
.template-graph__connections { position:absolute; inset:0; width:100%; height:100%; pointer-events:none }
.template-graph__edge,.template-graph__connections marker path { fill:none; stroke:var(--ink-4); stroke-width:1.3 }
.template-graph__edge.active { stroke:var(--accent); stroke-width:2 }
.template-graph__edge.linked { stroke:var(--accent); stroke-width:1.3; stroke-opacity:.28 }
.template-graph__connections marker .template-graph__selected-arrow { stroke:var(--accent); stroke-opacity:.6 }
.template-graph__edge.referenced { stroke:var(--accent); stroke-width:2; stroke-opacity:1; stroke-dasharray:5 4 }
.template-graph__flow { fill:none; stroke:var(--accent); stroke-width:1.8; stroke-linecap:round; stroke-dasharray:4 20; animation:metric-dependency-flow 1.6s linear infinite }
@keyframes metric-dependency-flow { to { stroke-dashoffset:-24 } }
@media(prefers-reduced-motion:reduce) { .template-graph__flow { display:none } .template-graph__edge.linked { stroke-opacity:.8 } }
.template-graph__heading { position:absolute; left:0; right:0; display:flex; align-items:center; gap:var(--space-3,12px); color:var(--ink-3); font-size:var(--fs-12,12px); pointer-events:none }
.template-graph__heading::after { content:''; flex:1; border-top:1px solid var(--line) }
.template-graph__time-group { position:absolute; height:calc(var(--metric-node-height) + 26px); border:1px dashed var(--line); border-radius:var(--r-2,6px); pointer-events:none }
.template-graph__time-group>span { position:absolute; top:-9px; left:8px; padding:0 4px; background:var(--bg-sunken); color:var(--ink-3); font-size:var(--fs-12,12px); line-height:18px }
.template-graph__item { position:absolute; width:var(--metric-node-width); height:var(--metric-node-height) }
.template-graph__node { width:100%; height:100%; display:flex; flex-direction:column; gap:2px; border:1px solid var(--line); border-radius:var(--r-2,6px); background:var(--panel-background); color:var(--ink-2); padding:8px 12px 38px; cursor:pointer; text-align:left; box-sizing:border-box }
.is-replay .template-graph__node { padding:8px 12px }
.template-graph__node-action { position:absolute; right:8px; top:29px }
.is-replay .template-graph__node small { color:var(--ink-2) }
.is-replay .template-graph__toolbar { gap:6px }
.template-graph__node-add { position:absolute; z-index:1; top:100%; left:calc(50% - 16px); display:grid; place-items:center; box-sizing:border-box; width:32px; height:32px; padding:0; border:1px solid var(--line); border-radius:50%; background:var(--panel-background); color:var(--ink-3); cursor:pointer; opacity:0; pointer-events:none }
.template-graph__item.is-selected .template-graph__node-add,.template-graph__item:hover .template-graph__node-add,.template-graph__item:focus-within .template-graph__node-add,.template-graph__item.menu-open .template-graph__node-add { opacity:1; pointer-events:auto }
.template-graph__node-add:hover,.template-graph__node-add:focus-visible { color:var(--accent); border-color:var(--accent); outline:2px solid var(--accent-soft) }
.template-graph__add-hint { display:block; padding-left:22px; color:var(--ink-3); font-size:12px; font-weight:400 }
@media(hover:none) { .template-graph__node-add { opacity:1; pointer-events:auto } }
.template-graph__name { display:flex; flex:none; align-items:center; gap:var(--space-2,8px); min-width:0; width:100%; height:20px }
.template-graph__name b { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:500; font-size:var(--fs-13,13px) }
.template-graph__semantics { display:flex; flex:none; align-items:center; gap:6px; color:var(--ink-3); font-size:12px }
.template-graph__semantics > span { display:inline-flex; align-items:center; justify-content:center; min-width:16px; height:20px }
.template-graph__meaning { display:flex; flex:1; align-items:center; width:100%; min-height:0; min-width:0; overflow:hidden; font-size:var(--fs-12,12px) }
.template-graph__declaration { display:flex; flex-direction:column; gap:2px; min-width:0; width:100%; line-height:16px }
.template-graph__declaration>span:not(.template-graph__choices) { overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.template-graph__choices { display:flex; align-items:center; gap:4px; min-width:0; max-width:100%; height:22px; overflow:hidden; border-radius:3px }
.template-graph__choices:focus-visible { outline:2px solid var(--accent); outline-offset:-2px }
.template-graph__choice { display:inline-flex; align-items:center; gap:3px; min-width:0; padding:1px 5px; border:1px solid var(--line); border-radius:4px; line-height:16px; color:var(--ink-2); background:var(--panel-background) }
.template-graph__choice > span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.template-graph__choice :deep(.icon-value-view) { flex:none }
.template-graph__choice-count { flex:none; color:var(--ink-3); font-size:11px; font-variant-numeric:tabular-nums }
.template-graph__choice-list { display:grid; gap:8px; max-width:min(320px,calc(100vw - 56px)); max-height:280px; overflow:auto; color:var(--ink-2); font-size:12px }
.template-graph__choice-list > span { display:flex; align-items:center; gap:8px }
.template-graph__choice-list > span > span { flex:1; min-width:0; overflow-wrap:anywhere }
.template-graph__choice-list :deep(.icon-value-view),.template-graph__choice-list code { flex:none }
.template-graph__choice-list code { margin-left:auto; color:var(--ink-3); font-size:11px; overflow-wrap:anywhere }
.template-graph__node .template-graph__declaration small { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; white-space:normal; overflow-wrap:anywhere; line-height:16px; min-height:0 }
.template-graph__trial { position:absolute; left:1px; right:1px; bottom:1px; display:flex; align-items:center; gap:5px; height:32px; padding:0 10px; border-top:1px solid var(--line); font-variant-numeric:tabular-nums; color:var(--ink-2) }
.template-graph__reading { display:flex; align-items:baseline; gap:4px; flex:1; min-width:0 }
.template-graph__trial b { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:14px; font-weight:500 }
.template-graph__reading small { flex:none; white-space:nowrap }
.template-graph__trial small { color:var(--ink-3); font-size:10px }
.template-graph__state { margin-left:auto; flex:0 1 auto; max-width:44%; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.template-graph__node small { display:block; width:100%; min-height:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--ink-3); font-size:var(--fs-12,12px); line-height:14px }
.template-graph__node.rule { background:var(--accent-soft) }
.template-graph__node.output { border-width:2px }
.template-graph__node:hover,.template-graph__node.selected,.template-graph__node:focus-visible { border-color:var(--accent); outline:2px solid var(--accent-soft) }
.template-graph__node.referenced { outline:2px dashed var(--accent); outline-offset:4px }
/* 全局视角优先读名称和取值，省略重复状态文字；放大后恢复完整节点。 */
.is-overview .template-graph__name { height:auto; min-height:20px; line-height:1.2 }
.is-overview .template-graph__name b { font-size:clamp(13px,calc(11px / var(--metric-graph-scale)),32px) }
.is-overview .template-graph__semantics,.is-overview .template-graph__node small { display:none }
.is-overview .template-graph__node :deep(.metric-process__reading) { font-size:clamp(15px,calc(12px / var(--metric-graph-scale)),36px); line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
.is-overview .template-graph__heading { font-size:clamp(12px,calc(10px / var(--metric-graph-scale)),28px) }
</style>
