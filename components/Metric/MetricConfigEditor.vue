<template>
  <div class="metric-config-editor">
    <header class="config-head">
      <div class="config-head__title"><AIcon :type="metricConfigurationIcon(selectedTemplate, draft)" /><InputEditable v-if="selectedTemplate" :value="draft.name || selectedTemplate.name" :disabled="saving || !context.editable" @change="draft.name = $event" /><b v-else>{{ t('selectTemplate') }}</b><a-tag v-if="dirty">{{ t('unsavedChanges') }}</a-tag><a-button class="config-head__close" type="text" :aria-label="t('cancel')" :disabled="saving" @click="cancel"><AIcon type="CloseOutlined" /></a-button></div>
      <div class="config-head__context"><span><AIcon type="EnvironmentOutlined" />{{ context.label || context.ownerId }}</span><button v-if="selectedTemplate && !selecting" type="button" :disabled="saving" @click="selecting = true">{{ selectedTemplate.name }} · v{{ selectedTemplate.version }}<AIcon type="SwapOutlined" /></button><a-button v-if="selecting && selectedTemplate" type="text" size="small" @click="selecting = false">{{ t('returnToDiagram') }}</a-button></div>
      <div v-if="context.inheritance && !selecting" class="config-head__scope" role="group" :aria-label="t('appliesTo')"><button type="button" :aria-pressed="draft.scope === 'children'" :disabled="saving" @click="changeScope('children')"><AIcon type="ClusterOutlined" />{{ context.inheritance.label }}</button><button type="button" :aria-pressed="draft.scope !== 'children'" :disabled="saving" @click="changeScope('single')"><AIcon type="PieChartOutlined" />{{ t('singleTarget') }}</button></div>
    </header>
    <a-alert v-if="error || errorKind" type="error" show-icon :message="errorHeading" :description="error || undefined"><template v-if="errorKind === 'load'" #action><a-button type="link" size="small" @click="load">{{ t('retry') }}</a-button></template></a-alert>
    <div v-if="errorKind === 'save' && draft.id" class="config-conflict"><a-button type="link" size="small" :loading="snapshotLoading" @click="readSaved">{{ t('reload') }}</a-button></div>
    <a-alert v-if="savedSnapshot" type="warning" show-icon :message="t('savedConfiguration')"><template #description><div>{{ savedSnapshot.name || selectedTemplate?.name }} · {{ savedSnapshot.templateVersion }}</div><a-popconfirm :title="t('replaceEdits')" @confirm="useSaved"><a-button size="small">{{ t('useSaved') }}</a-button></a-popconfirm></template></a-alert>
    <a-spin v-if="loading" class="config-loading" :spinning="true" />
    <MetricConfigCatalog v-else-if="selecting || !selectedTemplate" :templates="templates" :categories="categories" @select="selectTemplate" />
    <template v-else>
      <div class="config-tools"><span>{{ t('sourcesAndCalculation') }}</span><a-button v-if="parameters.length" type="text" size="small" @click="showParameters">{{ t('parameters') }} · {{ parameters.length }}</a-button><a-button type="text" size="small" :aria-pressed="storageVisible" @click="showStorage"><AIcon type="HistoryOutlined" />{{ t('historyRecording') }}</a-button><a-tooltip :title="!configTrial.supported.value ? t('configTrialUnsupported') : t('configTrialHint')"><a-button type="text" size="small" :aria-pressed="configTrial.active.value" :disabled="!configTrial.supported.value || saving" @click="toggleTrial"><AIcon type="ExperimentOutlined" />{{ t('simulate') }}</a-button></a-tooltip><a-button type="text" size="small" :aria-label="t(propertiesVisible ? 'configCollapse' : 'configExpand')" @click="toggleProperties"><AIcon :type="propertiesVisible ? 'MenuFoldOutlined' : 'MenuUnfoldOutlined'" /></a-button></div>
      <div ref="workspace" class="config-workspace" :style="{ '--properties-width': `${panelWidth}px` }" :class="{ 'panel-open':panelOpen, 'show-properties':showProperties }">
        <main class="config-diagram" @click.self="background">
          <nav class="config-view" :aria-label="t('sourcesAndCalculation')"><button v-for="mode in ['bindings','graph'] as const" :key="mode" type="button" :aria-pressed="viewMode === mode" @click="viewMode = mode">{{ t(mode === 'bindings' ? 'bindingList' : 'bindingGraph') }}</button></nav>
          <section v-show="viewMode === 'bindings'" class="config-bindings" :aria-label="t('bindingList')" @click.self="background">
            <div class="config-bindings__heading"><span>{{ t('bindingExpected') }}</span><span>{{ t('bindingActual') }}</span></div>
            <div v-for="(input,index) in selectedTemplate.inputDefinitions" :key="input.id" class="config-bindings__row" :class="{ selected:selected?.kind === 'input' && selected.index === index }">
              <button type="button" @click="selectNode({kind:'input',index})"><b>{{ input.name || input.id }}</b><small>{{ t(input.valueType?.type === 'date' ? 'inputDateType' : parameterTypeKeys[String(input.valueType?.type)] || 'parameterText') }}<template v-if="input.unit"> · {{ input.unit }}</template></small></button>
              <button type="button" :disabled="!pickSource || saving || !context.editable" @click="bindInput(input,index)"><AIcon :type="unresolvedInputs.some(item=>item.id === input.id) ? 'LinkOutlined' : 'CheckCircleOutlined'" /><span class="config-bindings__source-text">{{ sourceText(input.id) }}</span><AIcon type="RightOutlined" /></button>
              <details v-if="Array.isArray(input.valueType?.properties)" class="config-bindings__fields"><summary>{{ t('bindingFields') }} · {{ input.valueType.properties.length }}</summary><span v-for="field in input.valueType.properties" :key="field.id">{{ field.name || field.id }}</span></details>
            </div>
          </section>
          <TemplateGraph v-show="viewMode === 'graph'" ref="graph" :template="selectedTemplate" :selected="selected" :simulation-preview="configTrial.active.value ? trial.preview : undefined" @select="selectNode" @background="background">
            <template #clock><TemplateSimulationClock v-if="configTrial.active.value" :trial="trial" /><span v-else class="config-diagram__hint">{{ t('configSelectNode') }}</span></template>
            <template #node-summary="{ node, summary }"><template v-if="node.kind === 'input'"><span class="config-diagram__source" :class="{ missing:!draft.inputMappings[selectedTemplate.inputDefinitions[node.index].id] || sourceDescriptions[selectedTemplate.inputDefinitions[node.index].id]?.error }">{{ sourceText(selectedTemplate.inputDefinitions[node.index].id) }}</span><small>{{ summary.text }}<template v-if="selectedTemplate.inputDefinitions[node.index].unit"> · {{ selectedTemplate.inputDefinitions[node.index].unit }}</template></small></template><template v-else><span class="config-diagram__meaning"><TemplateFormulaDisplay v-if="summary.expression" :template="selectedTemplate" :rule="selectedTemplate.definitions[node.index] as TemplateRule" :expression="summary.expression" compact summary /><span v-else>{{ summary.text }}</span></span><small>{{ summary.detail }}</small></template></template>
            <template #input-sample="{ node }"><TemplateSimulationInput :template="selectedTemplate" :input="selectedTemplate.inputDefinitions[node.index]" :snapshot="trial.preview.nodes[nodeKey(node)]" :trial="trial" :disabled="saving || !context.editable" @details="showSamples(node, $event)" /></template>
          </TemplateGraph>
        </main>
        <PanelResizeHandle v-if="panelOpen" class="config-resize" v-model="panelWidth" :container="workspace" :limits="{ initial:320 }" :aria-label="t('resizeProperties')" />
        <aside v-if="panelOpen" class="config-properties" :class="{'is-choosing-source':choosing,'is-storage':storageVisible && !choosing}">
          <a-button v-if="!choosing" class="config-properties__back" type="text" size="small" @click="hideProperties"><AIcon type="ArrowLeftOutlined" />{{ t('returnToDiagram') }}</a-button>
          <component :is="pickSource.editor" v-if="choosing && pickSource?.editor" :key="choosing" />
          <MetricOutputStorageFields v-else-if="storageVisible" v-model="draft.outputStorage" :template="selectedTemplate" :constraints="editor.storageConstraints.value" :loading="editor.storageLoading.value" :error="editor.storageError.value" :disabled="saving || !context.editable" @retry="editor.loadStorageConstraints(true)" />
          <template v-else>
            <a-button v-if="selected" class="config-properties__subject-link" type="text" size="small" @click="background"><AIcon type="SettingOutlined" />{{ t('configSubject') }}</a-button>
            <MetricConfigNode v-if="selected" :template="selectedTemplate" :configuration="draft" :node="selected" :source-label="selectedInput ? sourceText(selectedInput.id) : undefined" :description="selectedInput && sourceDescriptions[selectedInput.id]" :picker="pickSource" :disabled="saving || !context.editable" :storage-constraints="editor.storageConstraints.value" :storage-loading="editor.storageLoading.value" :storage-error="editor.storageError.value" @storage="draft.outputStorage = $event" @retry-storage="editor.loadStorageConstraints(true)" @choose="chooseInline" @locate="locate" />
            <div v-else class="config-properties__subject">
              <b>{{ t('configSubject') }}</b>
              <p>{{ selectedTemplate.options?.description || selectedTemplate.name }}</p>
              <section class="config-properties__display" :aria-label="t('cardDisplay')">
                <h4><AIcon type="LayoutOutlined" />{{ t('cardDisplay') }}</h4>
                <MetricDisplayFields :model-value="normalizePresentation(draft.presentation)" :template="selectedTemplate" :defaults="normalizePresentation(selectedTemplate.options?.presentation?.settings)" :provider="presentationProvider" :disabled="saving || !context.editable" @update:model-value="draft.presentation = $event" @failed="extensionFailed = true" />
              </section>
              <span>{{ t('produces') }}</span>
              <button v-for="(output,index) in selectedTemplate.outputs" :key="output.metricId" type="button" @click="selectNode({ kind:'output', index })"><AIcon type="ExportOutlined" />{{ metricOutputName(output, selectedTemplate) }}<small>{{ output.unit }}</small></button>
            </div>
            <a-alert v-if="sourcesLoading" type="info" :message="t('configResolvingSources')" />
            <a-button v-else-if="selectedInput && sourceDescriptions[selectedInput.id]?.error" type="link" size="small" @click="refreshSources">{{ t('retry') }}</a-button>
            <MetricExtension v-if="presentationProvider?.configFields && !selected" :content="presentationProvider.configFields" :content-props="{ context, template:selectedTemplate, draft:readonly(draft), pickSource }" @change="changeConfigFields" @failed="extensionFailed = true"><template #fallback><a-alert type="error" show-icon :message="t('presentationFailed')" /></template></MetricExtension>
            <section v-if="visibleParameters.length" class="config-properties__parameters"><h4><AIcon type="SlidersOutlined" />{{ t('parameters') }}</h4><MetricParameters :definitions="visibleParameters" :values="draft.parameters" :defaults="selectedTemplate.parameters" :disabled="saving || !context.editable" @change="changeParameter" @reset="resetParameter" /></section>
            <a-button v-if="configTrial.active.value && selectedInput && pickSource?.readCurrent && sourceDescriptions[selectedInput.id]?.capabilities?.includes('current')" size="small" :loading="configTrial.readingSample.value" :disabled="saving || !context.editable" @click="readCurrentSample"><AIcon type="DownloadOutlined" />{{ t('readCurrentSample') }}</a-button>
            <a-alert v-if="configTrial.sampleReadError.value" type="warning" show-icon :message="t(configTrial.sampleReadError.value)" />
            <TemplateSimulation v-if="configTrial.active.value" ref="simulationPanel" :template="selectedTemplate" :selected="selected" :trial="trial" :error="configTrial.error.value" :disabled="saving || !context.editable" :allow-advanced="false" />
            <a-alert v-if="presentationMissing" type="warning" show-icon :message="t('presentationMissing')" />
          </template>
        </aside>
      </div>
    </template>
    <StickyActionBar class="config-footer">
      <template #hint>
        <span v-if="selectedTemplate && !selecting" class="config-footer__status">
          <button v-if="unresolvedInputs.length" type="button" @click="selectMissing">{{ t('configMissingSources', { count:unresolvedInputs.length }) }}</button>
          <span v-else>{{ t('configBoundCount', { count:selectedTemplate.inputDefinitions.length }) }}</span>
        </span>
      </template>
      <a-button :disabled="saving" @click="cancel">{{ t('cancel') }}</a-button>
      <template v-if="selectedTemplate && !selecting">
        <a-button v-if="configTrial.active.value" :disabled="trial.invalid || unresolvedInputs.length > 0 || sourcesLoading || !context.editable" :loading="trial.loading" @click="configTrial.run">
          <AIcon type="PlayCircleOutlined" />{{ t('configRunTrial') }}
        </a-button>
        <a-button :loading="saving" :disabled="!context.editable || presentationMissing || extensionFailed" @click="submit(false)">{{ t(draft.id && draft.state === 'enabled' ? 'saveDisable' : 'save') }}</a-button>
        <a-button type="primary" :loading="saving" :disabled="!context.editable || presentationMissing || extensionFailed" @click="submit(true)">{{ t('saveEnable') }}</a-button>
      </template>
    </StickyActionBar>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, readonly, ref, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMediaQuery } from '@vueuse/core'
import { sourceScheduleMissing } from './sourcePolicy'
import { parameterTypeKeys } from './parameterPresentation'
import { Modal } from 'ant-design-vue'
import InputEditable from '@jetlinks-web-core/components/Editable/InputEditable.vue'
import StickyActionBar from '@jetlinks-web-core/components/StickyActionBar/index.vue'
import MetricConfigCatalog from './MetricConfigCatalog.vue'
import MetricConfigNode from './MetricConfigNode.vue'
import MetricOutputStorageFields from './MetricOutputStorageFields.vue'
import PanelResizeHandle from '@jetlinks-web-core/components/PanelResizeHandle/index.vue'
import MetricParameters from './MetricParameters.vue'
import MetricExtension from './extensions/MetricExtension.vue'
import MetricDisplayFields from './extensions/MetricDisplayFields.vue'
import TemplateGraph from './template/TemplateGraph.vue'
import TemplateFormulaDisplay from './template/formula/TemplateFormulaDisplay.vue'
import TemplateSimulation from './template/TemplateSimulation.vue'
import TemplateSimulationInput from './template/TemplateSimulationInput.vue'
import TemplateSimulationClock from './template/TemplateSimulationClock.vue'
import { nodeKey, nodeList, type TemplateNode, type TemplateRule } from './template/designer'
import { templateParameterReferences } from './template/parameters'
import { localizedTemplate } from './template/text'
import { useMetricEditor } from './useMetricEditor'
import { useMetricConfigTrial } from './useMetricConfigTrial'
import { metricOutputName } from './presentation'
import { metricMessages } from './messages'
import { applyMetricConfigFields, metricConfigurationIcon, normalizePresentation } from './extensions/presentationSettings'
import type { MetricConfig, MetricConfigFieldsPatch, MetricContext, MetricSourcePicker, MetricTemplateInput, MetricTemplateReference } from './types'
const props = defineProps<{ context:MetricContext; configuration?:MetricConfig; initialTemplate?:MetricTemplateReference; pickSource?:MetricSourcePicker }>()
const emit = defineEmits<{ (event:'saved', configuration:MetricConfig):void; (event:'cancel'):void }>()
const { t, locale } = useI18n({ useScope:'local', messages:metricMessages })
const editor = useMetricEditor(toRef(props,'context'), toRef(props,'configuration'), toRef(props,'pickSource'))
const { draft, dirty, templates:rawTemplates, categories, selectedTemplate:rawTemplate, parameters:rawParameters, loading, saving, choosing, error, errorKind, sourceLabels, sourceDescriptions, sourcesLoading, refreshSources, cancelChoice, savedSnapshot, snapshotLoading, extensionFailed, load, choose, save, readSaved, useSaved, setScope } = editor
const { provider:presentationProvider, missing:presentationMissing } = editor.presentation
const selectedTemplate = computed(() => rawTemplate.value && localizedTemplate(rawTemplate.value, String(locale.value)))
const templates = computed(() => rawTemplates.value.map(item => ({ ...item, template:localizedTemplate(item.template,String(locale.value)) })))
const parameters = computed(() => rawParameters.value.map(item => selectedTemplate.value?.parameterDefinitions.find(value => value.id === item.id) || item))
const selected = ref<TemplateNode>(), panelOpen = ref(true), showProperties = ref(false), selecting = ref(!props.configuration)
const storageVisible = ref(false)
watch([storageVisible,() => selected.value?.kind,() => draft.value.id],([visible,kind]) => {
  if (visible || kind === 'output') void editor.loadStorageConstraints()
})
const narrow = useMediaQuery('(max-width:800px)')
const propertiesVisible = computed(() => panelOpen.value && (!narrow.value || showProperties.value))
const graph = ref<InstanceType<typeof TemplateGraph>>()
const viewMode = ref<'bindings'|'graph'>('bindings')
const simulationPanel = ref<InstanceType<typeof TemplateSimulation>>()
const workspace = ref<HTMLElement>(), panelWidth = ref(320)
const selectedInput = computed(() => selected.value?.kind === 'input' ? selectedTemplate.value?.inputDefinitions[selected.value.index] : undefined)
const unresolvedInputs = computed(() => selectedTemplate.value?.inputDefinitions.filter(input => !draft.value.inputMappings[input.id]
  || sourceDescriptions.value[input.id]?.error || sourceScheduleMissing(selectedTemplate.value!, input, draft.value.inputMappings[input.id])) || [])
const parameterReferences = computed(() => selectedTemplate.value ? templateParameterReferences(selectedTemplate.value) : new Map())
const visibleParameters = computed(() => !selected.value ? parameters.value : selected.value.kind === 'rule' ? parameters.value.filter(parameter => parameterReferences.value.get(parameter.id)?.some((item:{id:string}) => item.id === selectedTemplate.value?.definitions[selected.value!.index].id)) : [])
const configTrial = useMetricConfigTrial(rawTemplate, draft, computed(() => !!props.context.editable), undefined,
  () => !saving.value && !selecting.value && !sourcesLoading.value && unresolvedInputs.value.length === 0)
const { trial } = configTrial
let initialTemplateApplied = false
watch([() => props.initialTemplate,rawTemplates],([reference,available])=>{
  if (initialTemplateApplied || props.configuration || !reference || !props.context.editable) return
  const entity = available.find(item=>item.template.id === reference.id && item.template.version === reference.version)
  if (!entity) return
  initialTemplateApplied = true
  editor.templateSelection.value = JSON.stringify([reference.id,reference.version]); selecting.value = false
},{immediate:true})
function readCurrentSample() {
  const input = selectedInput.value, reader = props.pickSource?.readCurrent
  if (!input || !reader || !sourceDescriptions.value[input.id]?.capabilities?.includes('current')) return
  const mapping = draft.value.inputMappings[input.id]
  if (mapping) void configTrial.readSample(input.id,()=>reader(props.context,mapping))
}
const errorHeading = computed(() => t(errorKind.value === 'presentation' ? 'presentationFailed' : errorKind.value === 'activation' ? 'activationFailed' : errorKind.value === 'binding' ? 'missingBindings' : errorKind.value === 'save' ? 'saveFailed' : 'readFailed'))
watch(locale, refreshSources)
watch(() => props.configuration, () => { selected.value = undefined; selecting.value = !props.configuration })
function sourceText(id:string) { return sourceDescriptions.value[id]?.error || sourceLabels.value[id] || (sourcesLoading.value ? t('configResolvingSources') : draft.value.inputMappings[id] ? t('configBound') : t('chooseSource')) }
function selectNode(node:TemplateNode) { cancelChoice(); storageVisible.value = false; selected.value = node; panelOpen.value = true; showProperties.value = true }
async function showSamples(node:TemplateNode, editValue = false) { panelOpen.value = true; showProperties.value = true; await nextTick(); await simulationPanel.value?.focusSamples(editValue, selectedTemplate.value?.inputDefinitions[node.index]?.id) }
function background() { cancelChoice(); storageVisible.value = false; selected.value = undefined; panelOpen.value = true; showProperties.value = true }
function showStorage() { background(); storageVisible.value = true }
function hideProperties() { panelOpen.value = false; showProperties.value = false }
function toggleProperties() { if (propertiesVisible.value) hideProperties(); else { panelOpen.value = true; showProperties.value = true } }
function toggleTrial() {
  configTrial.active.value = !configTrial.active.value
  if (configTrial.active.value) { cancelChoice(); viewMode.value = 'graph'; panelOpen.value = true; showProperties.value = true }
}
function showParameters() { background() }
const pendingLocation = ref<string>()
function locate(id:string) {
  const template = selectedTemplate.value
  if (!template) { pendingLocation.value=id; return }
  const node = nodeList(template).find(item => item.kind === 'input' ? template.inputDefinitions[item.index].id === id : item.kind === 'rule' && template.definitions[item.index].id === id)
  if (node) { viewMode.value = 'graph'; selectNode(node); void nextTick(() => graph.value?.locate(node)) }
}
watch(selectedTemplate,async template=>{ if (template && pendingLocation.value) { const id=pendingLocation.value;pendingLocation.value=undefined;await nextTick();locate(id) } })
function selectMissing() { const input = unresolvedInputs.value[0]; if (input) locate(input.id) }
function chooseInline(input:MetricTemplateInput) { if (props.context.editable && !saving.value) void choose(input,true) }
function bindInput(input:MetricTemplateInput,index:number) { selectNode({kind:'input',index}); chooseInline(input) }
function changeConfigFields(patch:MetricConfigFieldsPatch) { if (props.context.editable && selectedTemplate.value) draft.value = applyMetricConfigFields(draft.value, selectedTemplate.value, patch) }
function changeParameter(id:string,value:unknown) { if (!saving.value && props.context.editable) draft.value.parameters[id] = value }
function resetParameter(id:string) { if (!saving.value && props.context.editable) delete draft.value.parameters[id] }
function confirmDiscard() { return !dirty.value ? Promise.resolve(true) : new Promise<boolean>(resolve => Modal.confirm({ title:t('discardEdits'), okText:t('continue'), cancelText:t('cancel'), onOk:() => resolve(true), onCancel:() => resolve(false) })) }
async function canLeave() { if (saving.value) return false; return confirmDiscard() }
async function cancel() { if (await canLeave()) emit('cancel') }
async function selectTemplate(key:string) { if (key !== editor.templateSelection.value && await confirmDiscard()) { editor.templateSelection.value = key; selected.value = undefined } selecting.value = false }
async function changeScope(value:'single'|'children') { if ((draft.value.scope || 'single') === value || saving.value) return; if (!Object.keys(draft.value.inputMappings).length || await confirmDiscard()) { setScope(value); selected.value = undefined } }
async function submit(activate:boolean) { const saved = await save(activate); if (saved) emit('saved',saved); else if (errorKind.value === 'binding') selectMissing() }
defineExpose({ canLeave, locate })
</script>
<style scoped>
.metric-config-editor { display:flex; flex-direction:column; height:100%; flex:1; min-height:0; min-width:0; overflow:hidden }
.config-head { flex:none; padding:16px 20px 12px; border-bottom:1px solid var(--line) }
.config-head__title,.config-head__context,.config-head__scope { display:flex; align-items:center; flex-wrap:wrap; gap:8px; min-height:28px; min-width:0 }
.config-head__title { font-size:17px; color:var(--ink-1) }
.config-head__title>:first-child { color:var(--accent) }
.config-head__close { margin-left:auto; flex:none; color:var(--ink-3) }
.config-head__title :deep(.input-editable) { max-width:100% }
.config-head__context { font-size:11px; color:var(--ink-3) }
.config-head__context>span { display:flex; align-items:center; gap:5px }
.config-head__context button,.config-head__scope button { display:inline-flex; align-items:center; gap:6px; padding:3px 6px; border:0; border-radius:4px; background:transparent; color:var(--ink-3); cursor:pointer; font-size:11px; max-width:100%; overflow-wrap:anywhere }
.config-head__scope { margin-top:4px }
.config-head__scope button[aria-pressed=true] { background:var(--accent-soft); color:var(--accent) }
.config-tools { flex:none; display:flex; flex-wrap:wrap; align-items:center; gap:6px; padding:6px 12px; font-size:12px; border-bottom:1px solid var(--line) }
.config-tools>span { flex:1; color:var(--ink-3) }
.config-tools :deep(.ant-btn) { color:var(--ink-3); font-size:12px }
.config-tools :deep([aria-pressed=true]) { color:var(--accent); background:var(--accent-soft) }
.config-workspace { display:grid; grid-template-columns:minmax(0,1fr); flex:1; min-height:0; min-width:0 }
.config-workspace.panel-open { grid-template-columns:minmax(0,1fr) var(--properties-width,320px) }
.config-diagram { display:flex; flex-direction:column; gap:8px; min-width:0; min-height:0; overflow:hidden; padding:12px 16px; background:var(--bg-sunken) }
.config-view { display:flex; flex:none; gap:16px; font-size:12px }
.config-view button { border:0; background:transparent; padding:4px 0; cursor:pointer; color:var(--ink-3) }
.config-view button[aria-pressed=true] { color:var(--accent); box-shadow:0 1px var(--accent) }
.config-bindings { overflow:auto; min-height:0; background:var(--panel-background); border:1px solid var(--line); border-radius:var(--r-2,6px) }
.config-bindings__heading,.config-bindings__row { display:grid; grid-template-columns:minmax(120px,1fr) minmax(0,1.5fr); gap:8px; padding:8px 12px; font-size:12px; border-bottom:1px solid var(--line) }
.config-bindings__heading { color:var(--ink-3) }
.config-bindings__row:last-child { border:0 }
.config-bindings__row.selected { background:var(--accent-soft) }
.config-bindings__row>button { display:flex; gap:6px; align-items:center; border:0; background:transparent; padding:0; text-align:left; cursor:pointer; min-width:0; color:var(--ink-2) }
.config-bindings__row>button:first-child { display:grid; gap:2px }
.config-bindings__row b { font-weight:500 }
.config-bindings__row small { color:var(--ink-3); font-size:11px }
.config-bindings__source-text { flex:1; min-width:0; overflow-wrap:anywhere; line-height:1.5 }
.config-bindings__row>button>.anticon { flex:none }
.config-bindings__row>button:disabled { cursor:default }
.config-bindings__fields { grid-column:1/-1; color:var(--ink-3); font-size:11px }
.config-bindings__fields summary { cursor:pointer }
.config-bindings__fields>span { display:inline-block; margin:4px 10px 0 0 }
.config-view button:focus-visible,.config-bindings__row>button:focus-visible { outline:2px solid var(--accent) }
.config-diagram__hint { color:var(--ink-3); font-size:11px }
.config-diagram__source,.config-diagram__meaning { display:flex; align-items:center; min-height:30px; height:30px; max-width:100%; font-size:12px; color:var(--ink-2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.config-diagram__source.missing { color:var(--accent) }
.config-properties { grid-column:2; grid-row:1; min-height:0; min-width:0; overflow:auto; overscroll-behavior:contain; padding:16px; border-left:1px solid var(--line); background:var(--panel-background); scrollbar-gutter:stable }
.config-properties.is-choosing-source { overflow:hidden }
.config-properties.is-storage { display:flex; flex-direction:column; overflow:hidden }
.config-properties.is-storage>.metric-storage-fields { flex:1 }
.show-properties .config-properties.is-storage { display:flex }
.config-properties__back { display:none }
.config-properties__subject-link { margin-bottom:12px; padding:0; color:var(--ink-3) }
.config-properties__subject { display:grid; gap:12px; font-size:12px }
.config-properties__subject p { color:var(--ink-3); margin:0; line-height:1.8 }
.config-properties__subject>button { display:flex; align-items:center; gap:6px; border:0; border-radius:4px; background:var(--bg-sunken); padding:8px; color:var(--ink-2); text-align:left; cursor:pointer }
.config-properties__subject>button small { margin-left:auto; color:var(--ink-3) }
.config-properties__display { border-top:1px solid var(--line); border-bottom:1px solid var(--line); padding-top:12px; min-width:0 }
.config-properties__display h4 { display:flex; align-items:center; gap:6px; margin:0; font-size:12px; font-weight:500 }
.config-properties__parameters { border-top:1px solid var(--line); margin-top:16px; padding-top:12px }
.config-properties__parameters h4 { display:flex; align-items:center; gap:6px; margin:0 0 12px; font-size:12px; font-weight:500 }
.config-footer { flex:none; margin-top:auto }
.config-footer :deep(.sab-actions) { flex-wrap:wrap; justify-content:flex-end; max-width:100% }
.config-footer__status { margin-inline-end:auto; color:var(--ink-3); font-size:11px }
.config-footer__status button { border:0; background:transparent; color:var(--accent); padding:0; cursor:pointer }
.config-loading { flex:1; display:grid; place-items:center }
.metric-config-editor>.config-catalog { flex:1; min-height:0; padding:16px 20px }
.metric-config-editor>.ant-alert { flex:none; margin:8px 12px }
@media(max-width:800px) { .config-workspace.panel-open { grid-template-columns:minmax(0,1fr) } .config-resize { display:none } .config-properties { display:none; border-left:0; grid-column:1 } .show-properties .config-diagram { display:none } .show-properties .config-properties { display:block } .config-properties__back { display:inline-flex; margin-bottom:12px; padding:0; color:var(--ink-3) } .config-head { padding:12px } .config-footer { flex-wrap:wrap } .config-footer :deep(.sab-hint) { flex-basis:100% } .config-footer :deep(.sab-actions) { margin-left:auto } }
</style>
