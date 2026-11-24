<template>
  <MetricCardShell :title="card.title || t(card.unavailable ? 'unavailable' : card.failed ? 'failed' : 'title')" :icon="metricConfigurationIcon(card.template,card.config)">
    <template #actions><template v-if="managing"><a-popconfirm v-for="link in removable" :key="link.id" :title="t('removeConfirm')" @confirm="$emit('remove',link.id)"><a-button type="text" size="small" :disabled="busy" :aria-label="t('remove')" :title="t('remove')"><AIcon type="DeleteOutlined" /></a-button></a-popconfirm></template></template>
    <button type="button" class="binding-card__body" :disabled="card.failed || card.unavailable || !card.output" @click="card.links[0].reference && $emit('inspect',card.links[0].reference)">
      <span v-if="card.failed || card.unavailable" class="binding-card__unavailable">—<small>{{ t(card.unavailable ? 'unavailable' : 'failed') }}</small></span>
      <MetricCardContent v-else-if="card.config && card.template && card.output" :context="sourceContext" :configuration="card.config" :template="card.template" :output="card.output" :value="card.value" :runtime="card.runtime" :history="history" />
      <a-skeleton v-else active :title="false" :paragraph="{rows:3}" />
      <span v-if="!card.unavailable && !card.failed" class="binding-card__source">{{ t('from',{name:card.source || t('sourceObject')}) }}<AIcon type="RightOutlined" /></span>
    </button>
    <footer v-if="inherited.length || card.links.some(link=>link.pending)" class="binding-card__locations"><span v-for="link in inherited" :key="link.id">{{ t('addedBy',{name:card.locations[link.id] || t('childObject')}) }}<a-button v-if="managing" type="link" size="small" @click="openLocation(link)">{{ t('openLocation') }}</a-button></span><span v-if="card.links.some(link=>link.pending)"><AIcon type="SyncOutlined" /> {{ t('pending') }}</span></footer>
  </MetricCardShell>
</template>
<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import MetricCardShell from '../MetricCardShell.vue'
import MetricCardContent from '../extensions/MetricCardContent.vue'
import {metricConfigurationIcon} from '../extensions/presentationSettings'
import type {MetricHistoryState} from '../useMetricTrends'
import {bindingMessages} from './messages'
import {bindingLocation,bindingSourceContext,type MetricBindingCard} from './useMetricBindingResults'
import type {MetricContext,MetricObjectBinding,MetricObjectBindingView,MetricWorkspaceSelection} from '../types'
const props=defineProps<{card:MetricBindingCard;context:MetricContext;managing?:boolean;busy?:boolean;history?:MetricHistoryState}>()
const emit=defineEmits<{(event:'inspect',reference:MetricObjectBinding):void;(event:'remove',id:string):void;(event:'manageLocation',value:MetricWorkspaceSelection):void}>()
const {t}=useI18n({useScope:'local',messages:bindingMessages})
const isLocal=(link:MetricObjectBindingView)=>{const location=bindingLocation(link);return location?.type===props.context.ownerType && location.id===props.context.ownerId}
const removable=computed(()=>props.context.editable ? props.card.links.filter(isLocal) : [])
const inherited=computed(()=>props.card.links.filter(link=>bindingLocation(link) && !isLocal(link)))
const sourceContext=computed(()=>bindingSourceContext(props.card))
function openLocation(link:MetricObjectBindingView){const location=bindingLocation(link);if(location)emit('manageLocation',{ownerType:location.type,ownerId:location.id})}
</script>
<style scoped>
.binding-card__body{display:flex;flex:1;flex-direction:column;gap:8px;min-width:0;width:100%;padding:8px 16px 12px;border:0;background:transparent;text-align:left;font:inherit;color:var(--ink-1);cursor:pointer}
.binding-card__body:disabled{cursor:default}.binding-card__body:focus-visible{outline:2px solid var(--accent);outline-offset:-3px}
.binding-card__source{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--ink-3);font-size:12px}
.binding-card__unavailable{display:grid;gap:6px;font-size:24px}.binding-card__unavailable small{font-size:12px;color:var(--ink-3)}
.binding-card__locations{display:flex;flex-wrap:wrap;gap:4px 12px;padding:8px 16px;border-top:1px solid var(--line);font-size:12px;color:var(--ink-3)}
</style>
