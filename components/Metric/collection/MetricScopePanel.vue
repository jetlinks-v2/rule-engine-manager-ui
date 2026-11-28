<template>
  <div class="metric-scope-panel" :class="{ 'metric-scope-panel--fill': fill }">
    <header class="metric-scope-panel__head">
      <div class="metric-scope-panel__identity">
        <slot name="object-heading"><strong>{{ context.label }}</strong></slot><slot name="object-actions" />
        <a-dropdown v-if="summaryScopes.length" :trigger="['click']">
          <a-button type="text" size="small" class="metric-scope-panel__view-switch"><AIcon :type="mode==='metrics' ? 'DashboardOutlined' : 'BarChartOutlined'" />{{ t(mode==='metrics' ? 'metric' : 'overview') }}<AIcon type="DownOutlined" /></a-button>
          <template #overlay><a-menu class="metric-scope-panel__view-menu" :selected-keys="[mode==='metrics' ? 'metrics' : 'overview']" @click="setMode(String($event.key))">
            <a-menu-item key="metrics"><SelectOption :label="t('metric')" icon="DashboardOutlined" /></a-menu-item>
            <a-menu-item key="overview"><SelectOption :label="t('overview')" icon="BarChartOutlined" /></a-menu-item>
          </a-menu></template>
        </a-dropdown>
      </div>
      <a-tooltip v-if="mode==='metrics' && context.readScopes?.some(scope=>scope.tree)" :title="t('linkedDescendantsHint')"><a-checkbox v-model:checked="bindings.includeDescendants.value" class="metric-scope-panel__range">{{ t('linkedDescendants') }}</a-checkbox></a-tooltip>
      <div v-if="context.editable && mode==='metrics'" class="metric-scope-panel__actions">
        <a-dropdown v-model:open="addOpen" :trigger="['click']" placement="bottomRight">
          <a-button type="primary" :loading="bindings.busy.value"><AIcon type="PlusOutlined" />{{ t('addMetric') }}</a-button>
          <template #overlay><a-menu class="metric-scope-panel__add" @click="addMetric(String($event.key))">
            <a-menu-item v-for="choice in addChoices" :key="choice.kind"><SelectOption :label="t(choice.label)" :icon="choice.icon" :description="t(choice.hint)" /></a-menu-item>
          </a-menu></template>
        </a-dropdown>
      </div>
    </header>
    <div class="metric-scope-panel__body">
    <MetricPanel :class="{ 'is-fill': fill }" v-show="mode==='metrics'" ref="panel" :context="context" :pick-source="pickSource" :initial-reference="initialReference" :initial-template="initialTemplate" :detail-link-label="detailLinkLabel" hide-identity hide-add :suppress-empty="hasLinkedContent" @apply-started="$emit('applyStarted')" @refresh="bindings.refresh()" @inspect-scope="inspectScope" @open-detail-link="$emit('openDetailLink',$event)">
      <template #card-actions="{configuration,template}">
        <a-menu-item v-if="configuration.ownerType!==context.ownerType || configuration.ownerId!==context.ownerId" key="source" @click="$emit('openObject',{ownerType:configuration.ownerType,ownerId:configuration.ownerId})"><AIcon type="ExportOutlined" />{{ t('openSource') }}</a-menu-item>
        <MetricBindingActions :links="configurationBindings(configuration)" :template="template" :context="context" :busy="bindings.busy.value" @remove="bindings.remove" @manage-location="$emit('openObject',$event)" />
      </template>
      <template #empty>
        <section class="metric-scope-panel__welcome">
          <h3>{{ t('welcomeTitle') }}</h3><p>{{ t('welcomeHint') }}</p>
          <div v-if="context.editable" class="metric-scope-panel__starts">
            <button v-for="choice in addChoices" :key="choice.kind" type="button" class="metric-scope-panel__start" :disabled="bindings.busy.value" @click="addMetric(choice.kind)">
              <SelectOption :label="t(choice.label)" :icon="choice.icon" :description="t(choice.description)" /><AIcon type="ArrowRightOutlined" aria-hidden="true" />
            </button>
          </div>
        </section>
      </template>
      <template #default="{references}"><MetricObjectBindings :context="context" :state="bindings" :exclude="references" @manage-location="$emit('openObject',$event)" /></template>
    </MetricPanel>
    <a-skeleton v-if="mode==='overview' && !summaryReady" active :paragraph="{rows:5}" />
    <KeepAlive :max="1"><MetricAggregateOverview :class="{ 'is-fill': fill }" v-if="mode==='overview' && summaryReady && activeScope" :key="JSON.stringify([context.preferenceScope,context.ownerType,context.ownerId])" :context="context" :scope="activeScope" :scopes="summaryScopes" @scope="scopeKey=$event" @members="openMembers" @metrics="mode='metrics'" /></KeepAlive>
    <MetricCollection :class="{ 'is-fill': fill }" v-if="mode==='members' && activeScope" :key="context.ownerType+':'+context.ownerId+':'+activeScope.memberType" :context="context" :scope="activeScope" :selection="selection" @clear-selection="mode='overview';selection=undefined" />
    </div>
  </div>
</template>
<script setup lang="ts">
import {computed,provide,ref,toRef,watch} from 'vue'
import {useI18n} from 'vue-i18n'
import MetricPanel from '../MetricPanel.vue'
import MetricCollection from './MetricCollection.vue'
import MetricAggregateOverview from './MetricAggregateOverview.vue'
import MetricObjectBindings from '../bindings/MetricObjectBindings.vue'
import MetricBindingActions from '../bindings/MetricBindingActions.vue'
import {bindingLocation} from '../bindings/useMetricBindingResults'
import SelectOption from '@jetlinks-web-core/components/SelectOption/index.vue'
import {useMetricBindings} from '../bindings/useMetricBindings'
import {collectionMessages} from './messages'
import {collectMetricResources} from '../extensions/registry'
import {aggregateScopeKey} from './aggregatePresentation'
import {metricSourcePickerKey} from '../useMetricSourceTemplate'
import type {MetricAlarmReference,MetricTemplateReference,MetricContext,MetricConfig,MetricReference,MetricSourcePicker,MetricWorkspaceSelection} from '../types'
import type {MetricAggregateScope,MetricCollectionSelection} from './types'
const props=defineProps<{fill?:boolean;context:MetricContext;pickSource?:MetricSourcePicker;initialReference?:MetricReference;initialTemplate?:MetricTemplateReference;detailLinkLabel?:string}>()
provide(metricSourcePickerKey,toRef(props,'pickSource'))
defineEmits<{(event:'applyStarted'):void;(event:'openDetailLink',reference:MetricAlarmReference):void;(event:'openObject',value:MetricWorkspaceSelection):void}>()
const {t}=useI18n({useScope:'local',messages:collectionMessages})
const mode=ref('metrics'),addOpen=ref(false),scopeKey=ref(''),selection=ref<MetricCollectionSelection>()
const panel=ref<InstanceType<typeof MetricPanel>>()
const bindings=useMetricBindings(toRef(props,'context'),toRef(props,'pickSource'))
function configurationBindings(config:MetricConfig){
  const inherited=config.scope==='children'
  return (bindings.page.data.value?.items || []).filter(link=>{
    const ref=link.reference,at=bindingLocation(link)
    return ref && ref.configId===config.id && ref.targetType===(inherited ? props.context.ownerType : config.targetType)
      && ref.targetId===(inherited ? props.context.ownerId : config.targetId)
      && (props.context.editable || at?.type!==props.context.ownerType || at?.id!==props.context.ownerId)
  })
}
const summaryReady=computed(()=>!!bindings.page.data.value || bindings.page.state.value.status!=='loading')
const addChoices=computed(()=>[
  {kind:'new',icon:'FunctionOutlined',label:'newMetric',hint:'newMetricHint',description:'newMetricDescription'},
  ...(props.pickSource ? [{kind:'existing',icon:'LinkOutlined',label:'existingMetric',hint:'existingMetricHint',description:'existingMetricDescription'}] : []),
])
const hasLinkedContent=computed(()=>bindings.page.state.value.status!=='ready' || !!bindings.page.data.value?.items.length || !!bindings.page.data.value?.nextCursor)
// 只从已授权的关联和对象声明生成范围，不根据宿主类型推断成员或创建额外关系。
const summaryScopes=computed<MetricAggregateScope[]>(()=>{
  const dimensions=collectMetricResources().dimensions
  return [
    ...bindings.types.value.map(memberType=>{
      const provider=dimensions.find(item=>item.provider.ownerType===memberType)?.provider
      const label=typeof provider?.label==='function' ? provider.label() : provider?.label
      return {kind:'linked' as const,memberType,label:label ? t('addedTypeMetrics',{type:label}) : t('addedMetrics'),icon:provider?.icon || 'LinkOutlined'}
    }),
    ...(props.context.readScopes || []).map(scope=>({...scope,kind:'members' as const})),
  ]
})
const activeScope=computed(()=>summaryScopes.value.find(item=>aggregateScopeKey(item)===scopeKey.value) || summaryScopes.value[0])
async function setMode(value:string){if(mode.value===value)return;if(await panel.value?.canLeave()){if(value==='overview' && summaryReady.value && activeScope.value)scopeKey.value=aggregateScopeKey(activeScope.value);mode.value=value;selection.value=undefined}}
async function addMetric(kind:string){
  addOpen.value=false
  if(!await panel.value?.canLeave())return
  mode.value='metrics'
  if(kind==='new')panel.value?.create()
  else await bindings.add(t('selectConcrete'))
}
function inspectScope(value:MetricCollectionSelection & {memberType:string}){
  const scope=summaryScopes.value.find(scope=>scope.kind==='members' && scope.memberType===value.memberType)
  if(!scope)return
  selection.value={templateId:value.templateId,group:value.group};scopeKey.value=aggregateScopeKey(scope);mode.value='members'
}
function openMembers(value:MetricCollectionSelection){selection.value=value;mode.value='members'}
watch([()=>props.context.preferenceScope,()=>props.context.ownerType,()=>props.context.ownerId],()=>{
  selection.value=undefined;addOpen.value=false;mode.value='metrics'
  scopeKey.value=''
},{immediate:true})
// 能力热变更后只保留仍可读的范围，避免旧成员明细继续停留在已移除的入口。
watch(summaryScopes,scopes=>{
  if(!scopes.length){scopeKey.value='';selection.value=undefined;mode.value='metrics';return}
  if(!scopeKey.value){if(mode.value==='overview' && summaryReady.value && scopes[0])scopeKey.value=aggregateScopeKey(scopes[0]);return}
  if(scopes.some(scope=>aggregateScopeKey(scope)===scopeKey.value))return
  scopeKey.value=scopes[0] ? aggregateScopeKey(scopes[0]) : '';selection.value=undefined
  if(mode.value!=='metrics')mode.value=scopes.length ? 'overview' : 'metrics'
})
watch([()=>props.initialReference,()=>props.initialTemplate],values=>{if(values.some(Boolean))mode.value='metrics'})
</script>
<style scoped>
.metric-scope-panel__body{display:flex;flex-direction:column;gap:var(--space-4,16px);min-height:0}
.metric-scope-panel.metric-scope-panel--fill{flex:1;height:100%;min-height:0;overflow:hidden;gap:0}
.metric-scope-panel--fill>.metric-scope-panel__head{flex:none;box-sizing:border-box;min-height:57px;padding:12px 16px;border-bottom:1px solid var(--line)}
.metric-scope-panel--fill>.metric-scope-panel__body{flex:1;overflow:hidden;gap:0}

.metric-scope-panel{display:flex;flex-direction:column;gap:var(--space-4,16px);min-width:0}.metric-scope-panel__head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:var(--space-3,12px)}
.metric-scope-panel__identity,.metric-scope-panel__actions{display:flex;align-items:center;gap:8px;min-width:0;max-width:100%}.metric-scope-panel__identity{flex:1 1 180px}.metric-scope-panel__actions{margin-left:auto;flex-wrap:wrap;justify-content:flex-end}
.metric-scope-panel__view-switch{flex:none;color:var(--ink-2)}
.metric-scope-panel__range{flex:none;margin:0;color:var(--ink-2);font-size:var(--fs-12,12px)}
.metric-scope-panel :deep(.aggregate-overview),.metric-scope-panel :deep(.metric-collection){padding:0}
.metric-scope-panel__add{max-width:min(360px,calc(100vw - 32px))}
.metric-scope-panel__welcome{width:100%;max-width:680px;margin-inline:auto;padding-block:var(--space-8,32px)}
.metric-scope-panel__welcome h3{margin:0;text-align:center;font-size:var(--fs-16,16px);font-weight:600;color:var(--ink-1)}
.metric-scope-panel__welcome p{max-width:480px;margin:8px auto 24px;text-align:center;font-size:13px;line-height:1.7;color:var(--ink-3)}
.metric-scope-panel__starts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:var(--space-4,16px)}
.metric-scope-panel__start{display:flex;align-items:center;gap:12px;min-width:0;padding:20px 16px;border:1px solid var(--line);border-radius:var(--radius-lg,8px);background:var(--bg-base);text-align:left;font:inherit;cursor:pointer}
.metric-scope-panel__start:hover{border-color:var(--accent)}.metric-scope-panel__start:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.metric-scope-panel__start:disabled{opacity:.5;cursor:wait}
.metric-scope-panel__start>.anticon{flex:none;margin-left:auto;color:var(--ink-3)}
.metric-scope-panel__start :deep(.select-option){flex:1;min-width:0;max-width:none;padding:0;gap:12px}
.metric-scope-panel__start :deep(.select-option__icon){font-size:24px;color:var(--accent);margin-top:1px}
.metric-scope-panel__start :deep(.select-option__text){gap:6px;font-size:14px;font-weight:500}
</style>
