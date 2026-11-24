<template>
  <div class="metric-panel">
    <header v-if="!hideIdentity" class="metric-panel__head">
      <div v-if="!hideIdentity" class="metric-panel__identity"><slot name="object-heading"><span class="metric-panel__object-icon"><AIcon type="DashboardOutlined" /></span><h3 :title="context.label">{{ context.label || t('title') }}</h3></slot><slot name="object-actions" /></div>
    </header>
    <div v-if="configurations.length || suppressEmpty" class="metric-panel__tools">
      <div v-if="!hideAdd" class="metric-panel__section-title">{{ t('currentResults') }} <small>{{ t('metricCount', { count: configurations.length }) }}</small></div>
      <div class="metric-panel__time">
        <MetricTimeRange v-model:range="trends.range.value" v-model:custom-range="trends.customRange.value" />
        <a-dropdown v-if="configurations.length" :trigger="['click']">
          <a-button type="text" size="small" :title="t('realtime')"><AIcon :type="refreshInterval ? 'ClockCircleOutlined' : 'ThunderboltOutlined'" />{{ refreshInterval ? t('updateSeconds', { seconds: refreshInterval / 1000 }) : t('liveUpdates') }}<AIcon type="DownOutlined" /></a-button>
          <template #overlay><a-menu :selected-keys="[String(refreshInterval)]" @click="changeRefreshInterval"><a-menu-item v-for="interval in [0, 1000, 5000, 15000]" :key="String(interval)"><SelectOption :icon="interval ? 'ClockCircleOutlined' : 'ThunderboltOutlined'" :label="interval ? t('updateSeconds', { seconds: interval / 1000 }) : t('liveUpdates')" :description="interval ? t('updateSecondsHint', { seconds: interval / 1000 }) : t('liveUpdatesHint')" /></a-menu-item></a-menu></template>
        </a-dropdown>
        <a-button type="text" size="small" :aria-label="t('refresh')" :title="t('refresh')" :loading="loading" @click="refreshAll"><AIcon type="ReloadOutlined" /></a-button>
        <a-button v-if="context.editable && !hideAdd" type="primary" size="small" @click="openEditor()"><AIcon type="PlusOutlined" /> {{ t('add') }}</a-button>
      </div>
    </div>
    <a-alert v-if="error" type="error" show-icon :message="t('readFailed')" :description="error">
      <template #action><a-button size="small" @click="refreshAll">{{ t('retry') }}</a-button></template>
    </a-alert>
    <a-alert v-if="actionError" type="error" show-icon :message="t('deleteFailed')" :description="actionError" />
    <a-skeleton v-if="loading && !configurations.length" active :paragraph="{rows:4}" />
    <template v-else>
      <template v-if="!configurations.length && !error && !suppressEmpty"><slot name="empty">
        <a-empty class="metric-panel__empty" :image="hideAdd ? Empty.PRESENTED_IMAGE_SIMPLE : undefined" :description="t('noMetrics')">
          <a-button v-if="context.editable && !hideAdd" type="primary" @click="openEditor()">{{ t('add') }}</a-button>
        </a-empty>
      </slot></template>
      <div v-else class="metric-panel__grid">
        <MetricCardShell v-for="card in cardGroups" :key="card.reference.configId" :title="configName(card.config)" :icon="metricConfigurationIcon(templates[card.reference.configId], card.config)" class="metric-panel__group" :class="{ 'is-selected': reference?.configId === card.reference.configId, 'is-stopped': card.config.state === 'disabled', 'is-boolean': typeof outputs[card.reference.configId]?.[card.reference.outputId]?.value === 'boolean' || card.output.valueType === 'boolean' }">
        <template #actions>
          <TemplateFormulaDisplay v-if="cardFormulas[card.reference.configId] && !scopeDefinition(card.config)" :template="templates[card.reference.configId]" :rule="cardFormulas[card.reference.configId].rule" :expression="cardFormulas[card.reference.configId].expression" summary>
            <template #trigger><a-button type="text" size="small" class="metric-panel__formula" :aria-label="t('formula')" :title="t('formula')">ƒx</a-button></template>
          </TemplateFormulaDisplay>
          <span v-if="!canManage(card.config) && card.config.scope === 'children'" class="metric-panel__inherited" :title="t('scopeManaged')"><AIcon type="LinkOutlined" />{{ t('inherited') }}</span>
          <a-button v-if="canManage(card.config)" type="text" size="small" class="metric-panel__edit" :aria-label="t('edit')" :title="t('edit')" @click="openEditor(card.config)"><AIcon type="EditOutlined" /></a-button>
          <MetricConfigActions v-if="canManage(card.config) && (!hideAdd || managing)" class="metric-panel__actions" :configuration="card.config" :busy="busyId === card.config.id" @edit="openEditor(card.config)" @toggle="toggleConfig(card.config)" @remove="confirmRemove(card.config)" />
        </template>
        <MetricScopeSummary v-if="scopeDefinition(card.config)" :ref="element => setScopeElement(card.reference.configId, element)" :state="scopeOverview.state(card.config)" @refresh="scopeOverview.refresh" @inspect="emit('inspectScope', { memberType:card.config.targetType || context.inheritance?.targetType || '', templateId:card.config.templateId, group:$event })" />
        <div v-else-if="!templates[card.reference.configId]" class="metric-panel__card metric-panel__placeholder" aria-busy="true"><a-skeleton active :title="false" :paragraph="{ rows: 3 }" /></div>
        <button v-else type="button"
          :ref="element => setPrimaryElement(card.reference, element)"
          class="metric-panel__card" :class="{ 'is-selected': reference?.configId === card.reference.configId && reference?.outputId === card.reference.outputId, 'is-stopped': card.config.state === 'disabled' }"
          :aria-label="configName(card.config)"
          :disabled="inaccessibleIds.includes(card.reference.configId) || !!error || !!latestErrors[card.reference.configId]"
          :aria-pressed="reference?.configId === card.reference.configId && reference?.outputId === card.reference.outputId"
          aria-haspopup="dialog" @click="select(card.reference.configId, card.reference.outputId)">
          <div v-if="inaccessibleIds.includes(card.reference.configId) || error || latestErrors[card.reference.configId]" class="metric-panel__unavailable">
            <strong>—</strong><a-tag>{{ t(error || latestErrors[card.reference.configId] ? 'readFailed' : 'noAccess') }}</a-tag>
            <small v-if="latestErrors[card.reference.configId]">{{ latestErrors[card.reference.configId] }}</small>
          </div>
          <MetricCardContent v-else :context="context" :configuration="card.config" :template="templates[card.reference.configId]" :output="card.output" :value="outputs[card.reference.configId]?.[card.reference.outputId]" :runtime="runtimes[card.reference.configId]" />
        </button>
        <div v-if="templates[card.reference.configId] && !scopeDefinition(card.config)" class="metric-panel__secondary-outputs" :class="{ 'is-link': card.config.state === 'disabled' || !card.secondary.length }">
          <button v-for="secondary in card.config.state === 'disabled' ? [] : card.secondary" :key="secondary.reference.outputId" type="button" class="metric-panel__secondary" :class="{ 'is-score':secondary.output.metricKind === 'score' || secondary.output.options?.readAggregation?.semantic === 'score' }"
            :ref="element => setCardElement(secondary.reference, element)"
            :disabled="inaccessibleIds.includes(card.reference.configId) || !!error || !!latestErrors[card.reference.configId]"
            :aria-pressed="reference?.configId === secondary.reference.configId && reference?.outputId === secondary.reference.outputId"
            aria-haspopup="dialog" @click="select(secondary.reference.configId, secondary.reference.outputId)">
            <span :title="metricOutputName(secondary.output, templates[card.reference.configId]) || t('unnamedOutput')">{{ metricOutputName(secondary.output, templates[card.reference.configId]) || t('unnamedOutput') }}</span>
            <span v-if="inaccessibleIds.includes(card.reference.configId) || error || latestErrors[card.reference.configId]">— <a-tag>{{ t(error || latestErrors[card.reference.configId] ? 'readFailed' : 'noAccess') }}</a-tag></span>
            <MetricValueView v-else :value="outputs[card.reference.configId]?.[secondary.reference.outputId]" :template="templates[card.reference.configId]" :output="secondary.output" :unit="secondary.output.unit" :settings="card.settings" :disabled="card.config.state === 'disabled'" hide-quality inline />
          </button>
          <button v-if="card.config.state === 'disabled' || !card.secondary.length" type="button" class="metric-panel__details" :disabled="inaccessibleIds.includes(card.reference.configId) || !!error || !!latestErrors[card.reference.configId]" @click="select(card.reference.configId, card.reference.outputId)">{{ t(tracksStateIntervals(templates[card.reference.configId], card.reference.outputId) ? 'viewRecords' : 'viewTrend') }}<AIcon type="RightOutlined" /></button>
        </div>
        </MetricCardShell>
        <a-alert v-for="config in configurations.filter(item => item.id && itemErrors[item.id])" :key="config.id" class="metric-panel__failure"
          type="error" show-icon :message="configName(config)" :description="t('missingTemplate') + ': ' + itemErrors[config.id!]">
          <template v-if="canManage(config)" #action><a-space><a-button size="small" :aria-label="t('edit')" :title="t('edit')" @click="openEditor(config)"><AIcon type="EditOutlined" /></a-button><a-button danger size="small" :loading="busyId === config.id" @click="confirmRemove(config)">{{ t('deleteMetric') }}</a-button></a-space></template>
        </a-alert>
      </div>
    </template>
    <slot :references="visibleReferences" />
    <JlDrawerShell :open="editorOpen || !!reference" :title="editorOpen ? (editing ? t('edit') : t('add')) : selected && configName(selected) || t('unnamedOutput')"
      :sub="editorOpen ? undefined : selected && configName(selected)" :width="860" :fullscreen="editorOpen" :hide-head="editorOpen" :class="{ 'metric-panel__editor-shell':editorOpen, 'metric-panel__detail-shell':!editorOpen }" :icon="editorOpen ? 'SettingOutlined' : 'LineChartOutlined'" @update:open="!$event && requestDismiss()" @after-open-change="restoreCardFocus">
      <template #head><div class="metric-panel__drawer-title"><b>{{ editorOpen ? (editing ? t('edit') : t('add')) : selected && configName(selected) || t('unnamedOutput') }}</b><a-button v-if="!editorOpen && selected && canManage(selected)" type="text" size="small" :aria-label="t('edit')" :title="t('edit')" @click="openEditor(selected)"><AIcon type="EditOutlined" /></a-button></div><p v-if="!editorOpen" class="metric-panel__drawer-subtitle">{{ context.label }}</p></template>
      <template v-if="!editorOpen && reference" #head-extra>
        <a-space>
          <a-button v-if="selected && canManage(selected) && selected.state === 'enabled' && runtimes[selectedId]?.state === 'failed'" size="small" :loading="busyId === selected.id" @click="setEnabled(selected, true)">{{ t('retryLoad') }}</a-button>
          <a-button v-if="detailLinkLabel" type="text" size="small" @click="openDetailLink">{{ detailLinkLabel }}</a-button>
          <MetricConfigActions v-if="selected && canManage(selected)" :configuration="selected" :busy="busyId === selected.id" @edit="openEditor(selected)" @toggle="toggleConfig(selected)" @remove="confirmRemove(selected)" />
        </a-space>
      </template>
      <MetricConfigEditor v-if="editorOpen" ref="configEditor" :context="context" :configuration="editing" :initial-template="!editing ? applyingTemplate : undefined" :pick-source="pickSource" @saved="saved" @cancel="closeDrawer" />
      <template v-else-if="reference">
        <a-alert v-if="error || latestErrors[selectedId]" type="warning" show-icon :message="t('readFailed')" :description="error || latestErrors[selectedId]"><template #action><a-button size="small" @click="refreshAll">{{ t('retry') }}</a-button></template></a-alert>
        <MetricResult :key="metricResultKey(selected, reference.outputId)" :reference="reference" :latest="selectedLatest" :output="selectedOutput" :context="context" :template="templates[selectedId]" @select-output="select(reference.configId, $event)" @edit-source="editSource" />
      </template>
    </JlDrawerShell>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, provide, ref, toRef, watch, type ComponentPublicInstance } from 'vue'
import { useI18n } from 'vue-i18n'
import { Empty, Modal } from 'ant-design-vue'
import JlDrawerShell from '@jetlinks-web-core/components/JlDrawerShell/index.vue'
import SelectOption from '@jetlinks-web-core/components/SelectOption/index.vue'
import MetricConfigEditor from './MetricConfigEditor.vue'
import MetricResult from './MetricResult.vue'
import MetricTimeRange from './MetricTimeRange.vue'
import MetricConfigActions from './MetricConfigActions.vue'
import MetricCardContent from './extensions/MetricCardContent.vue'
import MetricCardShell from './MetricCardShell.vue'
import TemplateFormulaDisplay from './template/formula/TemplateFormulaDisplay.vue'
import { ruleExpression, type TemplateRule } from './template/designer'
import MetricScopeSummary from './collection/MetricScopeSummary.vue'
import { useMetricScopeOverview } from './collection/useMetricScopeOverview'
import MetricValueView from './MetricValue.vue'
import { useMetricPanel } from './useMetricPanel'
import { metricHistoryKey, useMetricTrends } from './useMetricTrends'
import { tracksStateIntervals } from './stateIntervals'
import { metricConfigurationIcon } from './extensions/presentationSettings'
import { metricCalculatorsKey, metricAggregationsKey } from './calculatorContext'
import { metricSourcePickerKey } from './useMetricSourceTemplate'
import { useMetricCalculators, useMetricAggregations } from './useMetricCalculators'
import { metricResultKey, metricDataTarget } from './service'
import { metricOutputName } from './presentation'
import { localizedTemplate } from './template/text'
import { metricMessages } from './messages'
import type { MetricAlarmReference, MetricTemplateReference, MetricConfig, MetricContext, MetricReference, MetricSourcePicker } from './types'
const props = defineProps<{ context: MetricContext; pickSource?: MetricSourcePicker; initialReference?: MetricReference; initialTemplate?:MetricTemplateReference; detailLinkLabel?: string; hideIdentity?: boolean; hideAdd?:boolean; suppressEmpty?:boolean; managing?:boolean }>()
const emit = defineEmits<{ (event:'applyStarted'):void; (event:'refresh'):void; (event: 'openDetailLink', reference: MetricAlarmReference): void; (event:'inspectScope', selection:{memberType:string;templateId:string;group?:string}):void }>()
const configEditor = ref<InstanceType<typeof MetricConfigEditor>>()
async function requestDismiss() { if (!editorOpen.value || await configEditor.value?.canLeave()) dismissDrawer() }
const { t, locale } = useI18n({ useScope: 'local', messages: metricMessages })
provide(metricCalculatorsKey, useMetricCalculators(locale))
provide(metricAggregationsKey, useMetricAggregations(locale))
provide(metricSourcePickerKey, toRef(props,'pickSource'))
const { configurations, templates: rawTemplates, outputs, runtimes, selectedLatest, itemErrors, inaccessibleIds, latestErrors, actionError, loading, error, busyId, selectedId, selected,
  selectedOutput, reference, cardGroups, select, editorOpen, editing, openEditor, closeDrawer, dismissDrawer, takeFocusReference, saved, refresh, setEnabled, remove, canManage, refreshInterval, receiveResult } = useMetricPanel(toRef(props, 'context'), undefined, toRef(props, 'initialReference'))
const templates = computed(() => Object.fromEntries(Object.entries(rawTemplates.value).map(([id, template]) => [id, localizedTemplate(template, String(locale.value))])))
// 公式仅在独立标题入口展示，主结果按钮保持单一点击目标；投影仍由模板共用组件负责。
const cardFormulas = computed(() => Object.fromEntries(cardGroups.value.flatMap(card => {
  const rule = templates.value[card.reference.configId]?.definitions.find(rule => rule.id === card.output.metricId) as TemplateRule | undefined
  const expression = rule && ruleExpression(rule)
  return rule && (expression || rule.expressionTree) ? [[card.reference.configId, { rule, expression: expression || '' }]] : []
})))
const applyingTemplate = ref<MetricTemplateReference>()
watch(()=>props.initialTemplate,value=>{
  if (!value || !props.context.editable) return
  applyingTemplate.value = {...value}; openEditor(); emit('applyStarted')
},{immediate:true})
watch(editorOpen,open=>{if (!open) applyingTemplate.value=undefined})
const trendTargets = computed(() => error.value ? [] : configurations.value.flatMap(config => {
  const id = config.id, template = id ? rawTemplates.value[id] : undefined
  if (!id || !template || scopeDefinition(config)) return []
  const outputs = template.outputs.map(output => output.metricId)
  const intervalOutputs = outputs.filter(output => tracksStateIntervals(template, output))
  const target = metricDataTarget(config, props.context)
  return [{ id, key: metricResultKey(config, '') + JSON.stringify([outputs, intervalOutputs, target]), outputs, intervalOutputs, ...target }]
}))
function scopeDefinition(config: MetricConfig) { return config.scope === 'children' && config.ownerType === props.context.ownerType && config.ownerId === props.context.ownerId }
const scopeConfigs = computed(() => configurations.value.filter(scopeDefinition))
const visibleReferences=computed(()=>cardGroups.value.flatMap(card=>scopeDefinition(card.config) ? [] : [card.reference,...card.secondary.map(item=>item.reference)]
  .map(reference=>({...reference,...metricDataTarget(card.config,props.context)}))))
const scopeOverview = useMetricScopeOverview(toRef(props, 'context'), scopeConfigs)
function setScopeElement(id:string, element:Element | ComponentPublicInstance | null) {
  const root=element && ('$el' in element ? element.$el : element)
  scopeOverview.observe(id,root instanceof Element ? root : null)
}
async function editSource(inputId:string) {
  if (!selected.value || !canManage(selected.value)) return
  openEditor(selected.value)
  await nextTick()
  configEditor.value?.locate(inputId)
}
const trends = useMetricTrends(trendTargets, reference, undefined, undefined, { interval: refreshInterval, onFrame: receiveResult })
provide(metricHistoryKey, { ...trends, configurations, refreshLatest: refresh })
async function refreshAll() { await refresh(); trends.refresh(); void scopeOverview.refresh(); emit('refresh') }
function changeRefreshInterval({ key }: { key: string | number }) { refreshInterval.value = Number(key) }
const cardElements = new Map<string, HTMLButtonElement>()
function setPrimaryElement(reference: MetricReference, element: Element | ComponentPublicInstance | null) {
  setCardElement(reference, element)
  trends.observe(reference.configId, element instanceof HTMLButtonElement ? element : null)
}
function setCardElement(reference: MetricReference, element: Element | ComponentPublicInstance | null) {
  const key = JSON.stringify([reference.configId, reference.outputId])
  if (element instanceof HTMLButtonElement) cardElements.set(key, element)
  else cardElements.delete(key)
}
/** Shell 将该事件透传到 Ant Drawer；退场结束后回焦，保留概览原滚动位置。 */
function restoreCardFocus(open: boolean) {
  if (open) return
  const target = takeFocusReference()
  const primary = cardGroups.value.find(card => card.reference.configId === target?.configId)
  const element = target && (cardElements.get(JSON.stringify([target.configId, target.outputId]))
    || primary && cardElements.get(JSON.stringify([primary.reference.configId, primary.reference.outputId])))
  if (element?.isConnected && !element.disabled) element.focus({ preventScroll: true })
}
const configName = (config: MetricConfig) => config.name || templates.value[config.id || '']?.name || t('unnamedConfiguration')
function confirmDisable(config: MetricConfig) {
  Modal.confirm({ title: t('confirmDisable'), content: config.scope !== 'children' ? t('disableInheritanceHint') : undefined, okText: t('disable'), cancelText: t('cancel'), onOk: () => setEnabled(config, false) })
}
function toggleConfig(config: MetricConfig) { if (config.state === 'enabled') confirmDisable(config); else void setEnabled(config, true) }
function confirmRemove(config: MetricConfig) {
  Modal.confirm({ title: t('confirmDeleteMetric'), content: config.scope !== 'children' ? t('deleteInheritanceHint') : undefined, okText: t('deleteMetric'), cancelText: t('cancel'), okButtonProps: { danger: true }, onOk: async () => { if (!await remove(config)) throw new Error(t('deleteFailed')) } })
}
function openDetailLink() {
  if (props.detailLinkLabel && reference.value) emit('openDetailLink', { ...reference.value, ownerType: props.context.ownerType, ownerId: props.context.ownerId })
}
defineExpose({create:()=>openEditor(),async canLeave(){if(editorOpen.value && !await configEditor.value?.canLeave())return false;dismissDrawer();return true}})
</script>
<style scoped>
.metric-panel { display:grid; gap:var(--space-4,16px); min-width:0; container:metric-panel / inline-size }
.metric-panel__empty{margin:var(--space-8,32px) 0}
.metric-panel__editor-shell :deep(.drawer-body) { display:flex; flex-direction:column; overflow:hidden; padding:0 }
.metric-panel__detail-shell :deep(.drawer-head) { padding:8px 12px; gap:10px }
.metric-panel__detail-shell :deep(.head-icon) { width:32px; height:32px; border-radius:8px }
.metric-panel__detail-shell :deep(.drawer-body) { padding:10px 12px; gap:8px }
.metric-panel__head { display:flex; align-items:center; justify-content:space-between; gap:var(--space-3,12px) }
.metric-panel__head h3 { font-size:var(--fs-16,16px); margin:0 }
.metric-panel__identity { display:flex; align-items:center; gap:12px; min-width:0 }
.metric-panel__identity h3 { font-size:var(--fs-20,20px); min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
.metric-panel__identity :deep(.ant-btn) { flex:none; color:var(--ink-3) }
.metric-panel__object-icon { display:grid; place-items:center; width:40px; height:40px; border-radius:var(--r-3,8px); color:var(--accent); background:var(--accent-soft); font-size:22px }
.metric-panel__tools,.metric-panel__time { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap }
.metric-panel__section-title { font-weight:600; font-size:var(--fs-14,14px) }
.metric-panel__section-title small { color:var(--ink-2); font-size:var(--fs-12,12px); font-weight:400; margin-left:8px }
.metric-panel__grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:var(--space-3,12px) }
.metric-panel__group { min-width:0 }
.metric-panel__placeholder { min-height:150px }
.metric-panel__group:hover,.metric-panel__group.is-selected { border-color:var(--accent) }
.metric-panel__group.is-stopped { background:var(--bg-sunken) }
.metric-panel__inherited { margin-left:auto; display:inline-flex; align-items:center; gap:4px; font-size:11px; color:var(--ink-3); white-space:nowrap }
.metric-panel__edit { color:var(--ink-2); flex-shrink:0 }
.metric-panel__formula { color:var(--ink-2); font:italic 14px Georgia,serif; flex:none }
.metric-panel__actions { margin-left:auto; flex-shrink:0 }
.metric-panel__drawer-title { display:flex; align-items:center; gap:6px; line-height:22px }
.metric-panel__drawer-subtitle { margin:0; font-size:12px; line-height:18px; color:var(--ink-3) }
.metric-panel__card { display:flex; flex:1; flex-direction:column; align-items:stretch; text-align:left; gap:var(--space-1,4px); width:100%; min-width:0; padding:8px var(--space-4,16px) var(--space-3,12px); border:0; background:transparent; color:var(--ink-1); font:inherit; cursor:pointer }
.metric-panel__card:focus-visible { outline:2px solid var(--accent); outline-offset:2px }
.metric-panel__card:disabled { cursor:default }
.metric-panel__card:disabled:hover { border-color:var(--line) }
.metric-panel__card.is-stopped { background:var(--bg-sunken); color:var(--ink-2) }
.metric-panel__secondary-outputs { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr)); align-content:start; flex:none; gap:12px 20px; padding:12px var(--space-4,16px); border-top:1px solid var(--line) }
.metric-panel__secondary-outputs.is-link { padding-block:6px }
.metric-panel__details { grid-column:1/-1; display:flex; justify-content:space-between; align-items:center; border:0; background:transparent; padding:0; color:var(--ink-3); font:inherit; font-size:var(--fs-12,12px); cursor:pointer }
.metric-panel__details:hover { color:var(--accent) }
.metric-panel__details:focus-visible { outline:2px solid var(--accent); outline-offset:2px }
.metric-panel__details:disabled { cursor:default }
.metric-panel__secondary { display:flex; flex-direction:column; align-items:flex-start; justify-content:flex-start; gap:4px; min-width:0; padding:0; border:0; background:transparent; color:var(--ink-2); text-align:left; font:inherit; font-size:var(--fs-12,12px); cursor:pointer }
.metric-panel__secondary > span { min-width:0; max-width:100%; overflow-wrap:anywhere; color:var(--ink-3); line-height:1.5 }
.metric-panel__secondary :deep(.metric-value) { min-width:0; max-width:100% }
.metric-panel__secondary :deep(.metric-value__main strong) { white-space:normal; overflow-wrap:anywhere }
.metric-panel__secondary :deep(.metric-value--inline) { justify-content:flex-start; gap:4px 8px; line-height:1.5 }
.metric-panel__secondary :deep(.metric-value__main) { align-items:center; gap:6px; min-height:22px }
.metric-panel__secondary :deep(.metric-value__inline-issue) { flex-basis:100%; line-height:1.5 }
.metric-panel__secondary.is-score :deep(.metric-value__main strong) { color:var(--ink-1); font-size:18px; line-height:20px }
.metric-panel__secondary:focus-visible { outline:2px solid var(--accent); outline-offset:2px }
.metric-panel__secondary:hover,.metric-panel__secondary[aria-pressed=true] { color:var(--accent) }
.metric-panel__secondary:disabled { cursor:default }
.metric-panel__unavailable { display:flex; flex-direction:column; align-items:flex-start; gap:var(--space-2,8px) }
.metric-panel__unavailable strong { font-size:var(--fs-24,24px) }
.metric-panel__failure { grid-column:1/-1 }
@container metric-panel (min-width:1300px) { .metric-panel__grid { grid-template-columns:repeat(3,minmax(0,1fr)) } }
@container metric-panel (max-width:640px) { .metric-panel__grid { grid-template-columns:minmax(0,1fr) } }
</style>
