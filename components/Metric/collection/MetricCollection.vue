<template>
  <section class="metric-collection">
    <div v-if="selection" class="metric-collection__breadcrumb"><a-button type="text" size="small" @click="emit('clearSelection')"><AIcon type="ArrowLeftOutlined" />{{ t('backOverview') }}</a-button><strong>{{ t('currentResults') }}</strong><span>{{ selectedMetricName || scope.label }}</span></div>
    <p v-if="selection" class="metric-collection__hint">{{ t('currentResultsHint') }}</p>
    <header class="metric-collection__tools">
      <MetricCollectionPicker :groups="result?.groups || []" :value="selectedGroups" @change="selectGroups" />
      <div class="metric-collection__actions">
      <a-dropdown v-if="!selection && activeGroup && activeGroup.operations.length > 1" :trigger="['click']"><a-button type="text" size="small"><AIcon :type="readOperationPresentation(operation).icon" />{{ t(operation) }} <AIcon type="DownOutlined" /></a-button><template #overlay><a-menu :selected-keys="[operation]" @click="selectOperation($event.key as ReadOperation)"><a-menu-item v-for="item in activeGroup.operations" :key="item"><SelectOption :label="t(item)" :icon="readOperationPresentation(item).icon" :description="t(readOperationPresentation(item).description)" /></a-menu-item></a-menu></template></a-dropdown>
      <a-button v-if="scope.tree && !selection" type="text" size="small" :class="{ 'is-active':descendants }" :aria-pressed="descendants" @click="changeDepth(!descendants)"><AIcon type="BranchesOutlined" />{{ t(descendants ? 'descendants' : 'direct') }}</a-button>
      <a-tooltip :title="t('refresh')"><a-button type="text" size="small" :loading="loading" :aria-label="t('refresh')" @click="refresh"><AIcon type="ReloadOutlined" /></a-button></a-tooltip>
      </div>
    </header>
    <a-alert v-if="error" type="error" show-icon :message="t('failed')" :description="error"><template #action><a-button @click="refresh">{{ t('retry') }}</a-button></template></a-alert>
    <div v-if="result" class="metric-collection__scope">
      <strong>{{ t('scope', { count:result.visibleMembers }) }}</strong>
      <template v-if="result.coverage"><span>{{ t('configured', { count:result.coverage.configuredMembers }) }}</span><span v-if="result.coverage.unconfiguredMembers">{{ t('unconfigured', { count:result.coverage.unconfiguredMembers }) }}</span></template>
      <a-tooltip :title="[t('readOnly'),fallback ? t('unsupported') : ''].filter(Boolean).join(' · ')"><time>{{ t('refreshed', { time:new Date(result.readTime).toLocaleTimeString(String(locale)) }) }}</time></a-tooltip>
    </div>
    <div v-if="result?.summary" class="metric-collection__summary">
      <template v-if="operation === 'distribution'">
        <div v-for="(count, key) in result.summary.distribution" :key="key" class="metric-collection__state">
          <IconValueView v-if="appearance(String(key)).icon" :value="appearance(String(key)).icon" :size="16" indicator :fallback-text="stateName(String(key))" />
          <span>{{ stateName(String(key)) }}</span><b>{{ count }}</b><i :style="{ width:`${100 * count / Math.max(1,result.summary.valid)}%`, background:appearance(String(key)).color }" />
        </div>
      </template>
      <div v-else class="metric-collection__number"><span>{{ t(operation) }} · {{ activeGroup?.output.label || activeGroup?.output.metricId }}</span><strong>{{ formatMetricValue(result.summary.value,activeGroup?.displaySettings,activeGroup?.output) }}<small>{{ activeGroup?.output.unit }}</small></strong></div>
      <small>{{ t('valid', { valid:result.summary.valid, total:result.summary.valid + result.summary.missing }) }} · {{ t('missing', { count:result.summary.missing }) }}</small>
    </div>
    <a-spin :spinning="loading">
      <a-empty v-if="!loading && !result?.data.length && !error" :description="t('empty')" />
      <div v-else class="metric-collection__members">
        <section v-for="member in memberRows" :key="member.key" class="metric-collection__member">
          <header><AIcon :type="scope.icon" /><strong>{{ member.target.name || member.target.id }}</strong><small v-if="member.target.path">{{ member.target.path }}</small></header>
          <div v-if="!member.outputs.length" class="metric-collection__placeholder"><AIcon type="AppstoreAddOutlined" /><span>{{ t('notConfigured') }}</span></div>
          <div v-else class="metric-collection__values"><button v-for="record in member.outputs" :key="record.key" type="button" class="metric-collection__value" @click="selected=record">
            <span><AIcon :type="metricOutputPresentation(record.output,{labels:groupFor(record)?.stateLabels}).icon" />{{ record.output.label || record.output.metricId }}<AIcon type="RightOutlined" /></span>
            <MetricValueView :value="record.value" :output="record.output" :unit="record.output.unit" :disabled="record.configState === 'disabled'" :settings="groupFor(record)?.displaySettings" :labels="groupFor(record)?.stateLabels" inline hide-quality />
            <time v-if="record.value?.evaluationTime!=null" class="metric-collection__record-time">{{ t('recordedAt',{time:new Date(record.value.evaluationTime).toLocaleString(String(locale))}) }}</time>
          </button></div>
        </section>
      </div>
    </a-spin>
    <footer v-if="result?.total" class="metric-collection__footer"><a-pagination :current="page" :total="result.total" :page-size="20" :show-size-changer="false" @change="changePage" /></footer>
    <JlDrawerShell :open="!!selected" :title="selected?.configName || detail.template.value?.name" :sub="selected?.target.name" :width="860" @update:open="!$event && (selected = undefined)">
      <a-alert v-if="detail.error.value" type="error" :message="detail.error.value" />
      <a-spin :spinning="detail.loading.value"><MetricResult v-if="selected && detail.template.value" :key="selected.key" :reference="{ configId:selected.configId, outputId:detail.outputId.value, targetType:selected.target.type, targetId:selected.target.id }" :context="{ ownerType:selected.ownerType, ownerId:selected.ownerId, targetType:selected.target.type, targetId:selected.target.id, editable:false }" :output="detail.output.value" :template="detail.template.value" @select-output="detail.selectOutput" /></a-spin>
    </JlDrawerShell>
  </section>
</template>
<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import SelectOption from '@jetlinks-web-core/components/SelectOption/index.vue'
import IconValueView from '@jetlinks-web-core/components/IconValue/IconValueView.vue'
import JlDrawerShell from '@jetlinks-web-core/components/JlDrawerShell/index.vue'
import MetricValueView from '../MetricValue.vue'
import MetricResult from '../MetricResult.vue'
import { formatMetricValue } from '../extensions/presentationSettings'
import MetricCollectionPicker from './MetricCollectionPicker.vue'
import { stateAppearance, stateLabel } from '../stateIntervals'
import { metricOutputPresentation } from '../outputPresentation'
import { useMetricCollection } from './useMetricCollection'
import { useMetricCollectionDetail } from './useMetricCollectionDetail'
import { collectionMessages } from './messages'
import { readOperationPresentation } from './aggregationPolicy'
import type { MetricContext } from '../types'
import type { MetricCollectionRow, MetricCollectionSelection, MetricReadScopeOption, ReadOperation } from './types'
const props = defineProps<{ context:MetricContext; scope:MetricReadScopeOption; selection?:MetricCollectionSelection }>()
const emit = defineEmits<{(event:'clearSelection'):void}>()
const { t, locale } = useI18n({ useScope:'local', messages:collectionMessages })
const { result, loading, error, selectedGroups, operation, page, descendants, fallback, activeGroup, selected, refresh, selectGroups, selectOperation, changePage, changeDepth } = useMetricCollection(toRef(props,'context'), toRef(props,'scope'), undefined, toRef(props,'selection'))
const detail = useMetricCollectionDetail(selected)
const selectedMetricName=computed(()=>props.selection?.templateId ? result.value?.groups.find(group=>group.templateId===props.selection?.templateId)?.templateName : undefined)
const memberRows=computed(()=>{
  const members=new Map<string,{key:string;target:MetricCollectionRow['target'];outputs:MetricCollectionRow[]}>()
  for(const row of result.value?.data || []) {
    const key=JSON.stringify([row.target.type,row.target.id])
    if(!members.has(key))members.set(key,{key,target:row.target,outputs:[]})
    if(row.kind!=='unconfigured')members.get(key)!.outputs.push(row)
  }
  return [...members.values()]
})
const groupFor = (row:MetricCollectionRow) => result.value?.groups.find(item => item.id === row.group)
const rawState = (key:string) => activeGroup.value?.stateLabels?.find(item => String(item.value) === key)?.value ?? key
const appearance = (key:string) => stateAppearance(rawState(key), activeGroup.value?.stateLabels)
const stateName = (key:string) => stateLabel(rawState(key), activeGroup.value?.stateLabels || [], String(locale.value))
</script>
<style scoped>
.metric-collection { min-width:0; padding:var(--space-4,16px) }
.metric-collection__breadcrumb{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;font-size:14px}
.metric-collection__breadcrumb>span{font-size:12px;color:var(--ink-3)}
.metric-collection__hint{margin:4px 0 16px;color:var(--ink-3);font-size:12px}
.metric-collection__breadcrumb .ant-btn{padding-left:0;color:var(--ink-3)}
.metric-collection__member{border-bottom:1px solid var(--line);padding:16px 0}
.metric-collection__member>header{display:flex;align-items:center;gap:8px;font-size:14px;margin-bottom:12px}
.metric-collection__member>header small{font-size:11px;color:var(--ink-3);font-weight:400}
.metric-collection__values{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:8px 16px}
.metric-collection__value{display:flex;flex-direction:column;align-items:stretch;gap:8px;min-width:0;padding:8px 0;border:0;background:none;text-align:left;font:inherit;cursor:pointer}
.metric-collection__value>span{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-2)}
.metric-collection__value>span>.anticon:last-child{margin-left:auto;opacity:0}
.metric-collection__value:hover>span>.anticon:last-child,.metric-collection__value:focus-visible>span>.anticon:last-child{opacity:1}
.metric-collection__value :deep(.metric-value--inline){justify-content:flex-start}
.metric-collection__record-time{font-size:11px;color:var(--ink-3)}
.metric-collection__tools { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px 20px }
.metric-collection__actions { display:flex; align-items:center; flex-wrap:wrap; gap:4px; margin-left:auto }
.metric-collection__actions :deep(.ant-btn) { color:var(--ink-2) }
.metric-collection__actions :deep(.is-active) { color:var(--accent) }
.metric-collection__scope { display:flex; flex-wrap:wrap; gap:6px 12px; color:var(--ink-3); font-size:11px; padding:8px 0 12px; margin-bottom:12px; border-bottom:1px solid var(--line) }
.metric-collection__scope time { margin-left:auto }
.metric-collection__scope strong { font-weight:500; color:var(--ink-2) }
.metric-collection__summary { display:flex; flex-wrap:wrap; gap:16px; align-items:center; padding:0 0 16px; margin-bottom:16px; border-bottom:1px solid var(--line) }
.metric-collection__summary>small { color:var(--ink-3); margin-left:auto }
.metric-collection__state { position:relative; display:flex; align-items:center; gap:8px; min-width:100px; padding-bottom:12px }
.metric-collection__state i { position:absolute; bottom:0; left:0; height:3px; border-radius:2px }
.metric-collection__number { display:flex; align-items:center; gap:20px }
.metric-collection__number strong { font-size:28px; font-variant-numeric:tabular-nums }
.metric-collection__number small { font-size:12px; color:var(--ink-3); margin-left:6px }
.metric-collection__placeholder { display:flex; align-items:center; gap:8px; min-height:96px; color:var(--ink-3); font-size:12px }
.metric-collection__footer { display:flex; align-items:center; justify-content:flex-end; gap:16px; padding-top:16px }
</style>
