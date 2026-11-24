<template>
  <section class="metric-bindings">
    <a-alert v-if="error" type="error" show-icon :message="t(state.pendingAdd.value ? 'addFailed' : 'failed')" :description="error"><template #action><template v-if="state.pendingAdd.value"><a-button :loading="state.busy.value" @click="state.retryAdd">{{ t('retryAdd') }}</a-button><a-button :disabled="state.busy.value" @click="state.cancelAdd">{{ t('cancel') }}</a-button></template><a-button v-else @click="refresh">{{ t('retry') }}</a-button></template></a-alert>
    <a-skeleton v-if="state.page.state.value.status==='loading' && !state.page.data.value || results.query.state.value.status==='loading' && !results.query.data.value" active :paragraph="{rows:3}" />
    <div v-else class="metric-bindings__grid"><MetricBindingCard v-for="card in visibleCards" :key="card.key" :ref="element=>observe(card,element)" :card="card" :context="context" :history="trends.entries.value[bindingHistoryKey(card.links[0])]" :busy="state.busy.value" :managing="managing" @inspect="selected=$event" @remove="state.remove" @manage-location="$emit('manageLocation',$event)" /></div>
    <a-button v-if="state.page.data.value?.nextCursor" :loading="state.page.state.value.status==='loading'" @click="state.refresh(state.page.data.value!.nextCursor)">{{ t('more') }}</a-button>
    <JlDrawerShell :open="!!selected" :title="selectedCard?.title || t('detail')" :width="860" @update:open="!$event && (selected=undefined)"><MetricResult v-if="selected" :key="JSON.stringify(selected)" :reference="{configId:selected.configId,outputId:selected.outputId,targetType:selected.targetType,targetId:selected.targetId}" :latest="selectedLatest" :output="selectedCard?.output" :template="selectedCard?.template" :context="selectedCard && bindingSourceContext(selectedCard)" /></JlDrawerShell>
  </section>
</template>
<script setup lang="ts">
import {computed,inject,provide,ref,watch,type ComponentPublicInstance} from 'vue'
import {useI18n} from 'vue-i18n'
import JlDrawerShell from '@jetlinks-web-core/components/JlDrawerShell/index.vue'
import MetricResult from '../MetricResult.vue'
import MetricBindingCard from './MetricBindingCard.vue'
import {bindingMessages} from './messages'
import {bindingHistoryKey,bindingSourceContext,useMetricBindingResults,type MetricBindingCard as BindingCard} from './useMetricBindingResults'
import {metricHistoryKey,useMetricTrends,type MetricHistoryScope,type MetricTrendTarget} from '../useMetricTrends'
import { metricResultKey } from '../service'
import {tracksStateIntervals} from '../stateIntervals'
import type {useMetricBindings} from './useMetricBindings'
import type {MetricContext,MetricLatest,MetricObjectBinding,MetricReference,MetricWorkspaceSelection} from '../types'
const props=defineProps<{context:MetricContext;state:ReturnType<typeof useMetricBindings>;managing?:boolean;exclude?:MetricReference[]}>()
defineEmits<{(event:'manageLocation',value:MetricWorkspaceSelection):void}>()
const {t,locale}=useI18n({useScope:'local',messages:bindingMessages})
const results=useMetricBindingResults(computed(()=>props.state.page.data.value?.items || []),computed(()=>String(locale.value)))
const parentHistory=inject(metricHistoryKey,undefined)
// 外部来源不能借用宿主对象按configId索引的快照；详情按原对象授权读取。
// 查看结果时去重；管理时仍须能移除重复添加的关系，不能把隐藏卡片当作事实不存在。
const visibleCards=computed(()=>{const excluded=new Set(props.exclude?.map(ref=>JSON.stringify([ref.configId,ref.outputId,ref.targetType,ref.targetId])));return results.cards.value.filter(card=>props.managing || !excluded.has(card.key))})
const selected=ref<MetricObjectBinding>()
const selectedCard=computed(()=>selected.value && visibleCards.value.find(card=>card.key===JSON.stringify([selected.value!.configId,selected.value!.outputId,selected.value!.targetType,selected.value!.targetId])))
const selectedLatest=computed<MetricLatest | undefined>(()=>selected.value && selectedCard.value && !selectedCard.value.unavailable ? {
  configId:selected.value.configId,outputs:selectedCard.value.value ? {[selected.value.outputId]:selectedCard.value.value} : {},runtime:selectedCard.value.runtime
} : undefined)
const trendTargets=computed(()=>{
  const targets=new Map<string,MetricTrendTarget>()
  for(const card of visibleCards.value){
    if(!card.config || !card.template || !card.output || card.failed)continue
    const reference=card.links[0].reference!,id=bindingHistoryKey(card.links[0])
    let target=targets.get(id)
    if(!target){target={id,configId:reference.configId,key:metricResultKey(card.config,''),outputs:[],intervalOutputs:[],targetType:reference.targetType,targetId:reference.targetId};targets.set(id,target)}
    target.outputs.push(reference.outputId)
    if(tracksStateIntervals(card.template,reference.outputId))target.intervalOutputs!.push(reference.outputId)
  }
  return [...targets.values()].map(target=>({...target,key:JSON.stringify([target.key,target.outputs,target.intervalOutputs])}))
})
const selectedHistoryId=computed(()=>selected.value && JSON.stringify([selected.value.configId,selected.value.targetType,selected.value.targetId]))
const selectedTrend=computed(()=>selected.value && selectedHistoryId.value ? {configId:selectedHistoryId.value,outputId:selected.value.outputId} : undefined)
const trends=useMetricTrends(trendTargets,selectedTrend,undefined,parentHistory,{interval:ref(1000),onFrame:results.receiveResult})
provide(metricHistoryKey, {...trends,
  entries:computed(()=>selected.value && selectedHistoryId.value && trends.entries.value[selectedHistoryId.value] ? {[selected.value.configId]:trends.entries.value[selectedHistoryId.value]} : {}),
  refresh:()=>trends.refresh(selectedHistoryId.value),
  configurations:computed(()=>selectedCard.value?.config ? [selectedCard.value.config] : []),refreshLatest:async()=>{trends.refresh(selectedHistoryId.value)}
})
function observe(card:BindingCard,element:Element | ComponentPublicInstance | null){
  const root=element && ('$el' in element ? element.$el : element)
  trends.observe(bindingHistoryKey(card.links[0]),root instanceof Element ? root : null,card.key)
}
const error=computed(()=>props.state.mutationError.value || (props.state.page.state.value.status==='error' ? props.state.page.state.value.message : ''))
function refresh(){void props.state.refresh()}
watch(()=>[props.context.ownerType,props.context.ownerId],()=>{selected.value=undefined})
watch(selectedCard,card=>{if(selected.value && (!card || card.unavailable || card.failed))selected.value=undefined})
defineExpose({refresh})
</script>
<style scoped>
.metric-bindings{display:grid;gap:12px;min-width:0}
.metric-bindings__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
@container metric-panel (max-width:580px){.metric-bindings__grid{grid-template-columns:minmax(0,1fr)}}
</style>
