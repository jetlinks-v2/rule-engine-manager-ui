<template>
  <section class="template-publication">
    <header class="template-publication__release">
      <div class="template-publication__status">
        <div><AIcon :type="entity?.released ? 'CheckCircleOutlined' : 'EditOutlined'" /><strong>{{ t(entity?.released ? 'published' : 'draft') }}<template v-if="entity?.released"> r{{ entity.revision || 1 }}</template></strong><a-tag v-if="pending && entity?.released" color="processing">{{ t('pendingChanges') }}</a-tag></div>
        <small>{{ t('revisionPublishBrief') }} <a-tooltip :title="t('revisionPublishHint')"><AIcon type="InfoCircleOutlined" /></a-tooltip></small>
      </div>
      <div class="template-publication__release-actions">
        <a-popover :title="t('outputs')" trigger="click"><template #content><div class="template-publication__outputs"><a-tag v-for="item in template.outputs" :key="item.metricId">{{ item.label || item.metricId }}</a-tag></div></template><a-button type="text" size="small"><AIcon type="ExportOutlined" />{{ t('publicationOutputs', { count:template.outputs.length }) }}</a-button></a-popover>
        <a-button v-if="editable && (!entity?.released || pending)" type="primary" :loading="saving" :disabled="updates.applying.value" @click="emit('release')"><AIcon type="CloudUploadOutlined" />{{ t(entity?.released ? 'publishUpdate' : 'release') }}</a-button>
      </div>
    </header>
    <template v-if="entity?.released">
      <div class="template-publication__tools">
        <h4><AIcon type="LinkOutlined" />{{ t('templateUses') }}<span class="template-publication__count">{{ updates.references.value.length }}{{ updates.hasMore.value ? '+' : '' }}</span></h4>
        <a-tooltip :title="t('revisionApplyHint')"><AIcon type="InfoCircleOutlined" class="template-publication__help" /></a-tooltip>
        <a-button type="text" size="small" :loading="updates.loading.value" :disabled="updates.applying.value" @click="updates.load"><AIcon type="ReloadOutlined" />{{ t('refresh') }}</a-button>
      </div>
      <a-alert v-if="updates.error.value" type="error" show-icon :message="updates.error.value" />
      <div v-if="updates.targetRevision.value !== entity.revision" class="template-publication__target">
        <AIcon type="HistoryOutlined" />{{ t('publicationTarget', { revision:updates.targetRevision.value }) }}
        <a-button type="link" size="small" :disabled="updates.applying.value" @click="chooseRevision(entity.revision || 1)">{{ t('publicationLatest') }}</a-button>
      </div>
      <div v-if="editable && updates.selectedIds.value.length" class="template-publication__selection" role="status">
        <span>{{ t('publicationSelected', { count:updates.selectedIds.value.length }) }}</span>
        <a-button size="small" :loading="updates.applying.value" :disabled="saving" @click="updates.apply(false)">{{ t('applySelected') }}</a-button>
        <a-popconfirm :title="t('applyAllConfirm')" :ok-text="t('applyAll')" :cancel-text="t('cancel')" @confirm="updates.apply(true)"><a-button type="text" size="small" :disabled="updates.applying.value || saving">{{ t('applyAll') }}</a-button></a-popconfirm>
        <a-button type="text" size="small" :disabled="updates.applying.value" @click="updates.selectedIds.value = []">{{ t('publicationClear') }}</a-button>
      </div>
      <small v-if="updates.summary.value.saved || updates.summary.value.failed" role="status">{{ t('applySummary', updates.summary.value) }}</small>
      <a-spin :spinning="updates.loading.value">
        <a-empty v-if="updates.referencesLoaded.value && !updates.references.value.length && !updates.loading.value" :description="t('noTemplateUses')" />
        <div v-if="editable && selectable.length" class="template-publication__select-all"><a-checkbox :checked="allSelected" :indeterminate="!allSelected && selectable.some(item => updates.selectedIds.value.includes(item.id!))" :disabled="updates.applying.value" @update:checked="selectVisible">{{ t('publicationSelectVisible') }}</a-checkbox></div>
        <article v-for="config in updates.references.value" :key="config.id" class="template-publication__reference">
          <a-checkbox v-if="editable" :checked="updates.selectedIds.value.includes(config.id!)" :disabled="updates.applying.value || !canApply(config)" :aria-label="referenceName(config)" @update:checked="select(config.id!, $event)" />
          <div class="template-publication__identity" :title="config.id">
            <strong>{{ referenceName(config) }}</strong>
            <small><AIcon :type="dimension(config)?.icon || 'DatabaseOutlined'" /><span>{{ ownerName(config) }}</span><span class="template-publication__kind">{{ dimensionLabel(config) }}</span></small>
          </div>
          <div class="template-publication__version"><span>r{{ config.templateRevision || 1 }}</span><small :class="{ 'is-current':isApplied(config) }"><AIcon :type="isApplied(config) ? 'CheckCircleOutlined' : 'SyncOutlined'" />{{ t(isApplied(config) ? 'publicationApplied' : updates.targetRevision.value === entity.revision ? 'updateAvailable' : 'publicationDifferent') }}</small></div>
          <a-button v-if="editable" type="link" size="small" :disabled="updates.applying.value || saving || !canApply(config)" @click="updates.apply(false, [config.id!])">{{ t(updates.outcomes.value[config.id!]?.error ? 'retry' : updates.targetRevision.value === entity.revision ? 'publicationUpdate' : 'publicationApplyRevision') }}</a-button>
          <small v-if="updates.outcomes.value[config.id!]?.error" role="alert" class="template-publication__feedback template-publication__failure">{{ updates.outcomes.value[config.id!].error }}</small>
          <small v-else-if="updates.outcomes.value[config.id!]?.state" class="template-publication__feedback">{{ t('applyState_' + updates.outcomes.value[config.id!].state) }}</small>
        </article>
      </a-spin>
      <a-button v-if="updates.hasMore.value" type="text" :loading="updates.loading.value" :disabled="updates.applying.value" @click="updates.loadMore">{{ t('loadMore') }}</a-button>
      <footer class="template-publication__footer">
        <MetricDisclosure :title="t('revisionHistory')" icon="HistoryOutlined">
          <div v-for="revision in updates.revisions.value" :key="revision.revision" class="template-publication__history"><b>r{{ revision.revision }}</b><time>{{ time(revision.publishedAt) }}</time><a-tag v-if="revision.revision === entity.revision">{{ t('currentRevision') }}</a-tag><a-button v-if="editable" type="link" size="small" :disabled="updates.applying.value || saving || revision.revision === updates.targetRevision.value" @click="chooseRevision(revision.revision)">{{ t('publicationChooseRevision') }}</a-button></div>
          <a-button v-if="updates.hasMoreRevisions.value" type="text" :loading="updates.loadingRevisions.value" :disabled="updates.applying.value" @click="updates.loadRevisions">{{ t('loadMore') }}</a-button>
        </MetricDisclosure>
        <slot />
      </footer>
    </template>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { metricMessages } from '../messages'
import { metricDateText as time } from '../time'
import { useMetricResources } from '../extensions/useMetricResources'
import MetricDisclosure from '../MetricDisclosure.vue'
import { useTemplateReferenceLabels } from './useTemplateReferenceLabels'
import type { MetricConfig, MetricTemplate, MetricTemplateEntity } from '../types'
import type { useTemplateUpdates } from './useTemplateUpdates'
const props = defineProps<{ template: MetricTemplate; entity?: MetricTemplateEntity; editable: boolean; pending: boolean; saving: boolean; updates: ReturnType<typeof useTemplateUpdates> }>()
const emit = defineEmits<{ (event: 'release'): void }>()
const { t } = useI18n({ useScope: 'local', messages: metricMessages })
const resources = useMetricResources()
const dimensions = computed(() => resources.value.dimensions.map(item => item.provider))
const ownerName = useTemplateReferenceLabels(computed(() => props.updates.references.value), dimensions)
const dimension = (config: MetricConfig) => dimensions.value.find(item => item.ownerType === config.ownerType)
const dimensionLabel = (config: MetricConfig) => { const label = dimension(config)?.label; return typeof label === 'function' ? label() : label || config.ownerType }
const referenceName = (config: MetricConfig) => config.name || props.template.name || props.template.id
const isApplied = (config: MetricConfig) => (config.templateRevision || 1) === props.updates.targetRevision.value
// 保存可能已经成功但装载失败；同修订仍允许使用最新 CAS 重试。
const canApply = (config: MetricConfig) => !isApplied(config) || !!props.updates.outcomes.value[config.id!]?.error
const selectable = computed(() => props.updates.references.value.filter(item => item.id && canApply(item)))
const allSelected = computed(() => selectable.value.length > 0 && selectable.value.every(item => props.updates.selectedIds.value.includes(item.id!)))
function select(id: string, checked: boolean) { props.updates.selectedIds.value = checked ? [...props.updates.selectedIds.value, id] : props.updates.selectedIds.value.filter(value => value !== id) }
function selectVisible(checked: boolean) { props.updates.selectedIds.value = checked ? selectable.value.map(item => item.id!) : [] }
function chooseRevision(revision: number) { props.updates.targetRevision.value = revision; props.updates.selectedIds.value = [] }
</script>
<style scoped>
.template-publication { display:grid; gap:12px; max-width:1120px; margin:0 auto; padding:2px 0; width:100%; font-size:13px }
.template-publication__release { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; padding-bottom:16px; border-bottom:1px solid var(--line) }
.template-publication__status > div,.template-publication__release-actions,.template-publication__tools,.template-publication__tools h4 { display:flex; align-items:center; gap:8px }
.template-publication__status strong { font-size:14px; font-weight:600; color:var(--ink-1) }
.template-publication__status > div > .anticon { color:var(--accent); font-size:14px }
.template-publication__status small { display:block; color:var(--ink-3); font-size:12px; margin-top:4px }
.template-publication__status :deep(.ant-tag) { margin:0 }
.template-publication__outputs { display:flex; flex-wrap:wrap; gap:6px; max-width:420px }
.template-publication__outputs :deep(.ant-tag) { margin:0 }
.template-publication__tools h4 { flex:1; margin:0; font-size:13px; font-weight:600 }
.template-publication__tools h4 > .anticon { color:var(--accent) }
.template-publication__count { padding:0 6px; border-radius:10px; background:var(--bg-sunken); color:var(--ink-3); font-size:12px; font-weight:400 }
.template-publication__help { color:var(--ink-3) }
.template-publication__selection,.template-publication__target { display:flex; align-items:center; flex-wrap:wrap; gap:8px; padding:6px 10px; background:var(--bg-sunken); border-radius:var(--r-2,6px); font-size:12px }
.template-publication__select-all { padding-bottom:8px; color:var(--ink-3); font-size:12px }
.template-publication__reference { display:grid; grid-template-columns:auto minmax(0,1fr) 116px auto; align-items:center; gap:6px 12px; min-height:56px; padding:8px 0; border-bottom:1px solid var(--line) }
.template-publication__reference > .template-publication__identity:first-child { grid-column:span 2 }
.template-publication__identity { min-width:0 }
.template-publication__identity strong { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; font-weight:500; color:var(--ink-1) }
.template-publication__identity small { display:flex; align-items:center; gap:5px; min-width:0; font-size:12px; color:var(--ink-3) }
.template-publication__identity small > span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.template-publication__kind { flex:none; font-size:11px; color:var(--ink-3) }
.template-publication__version { display:flex; align-items:center; justify-content:flex-start; gap:10px; font-size:12px; color:var(--ink-2); font-variant-numeric:tabular-nums }
.template-publication__version small { display:inline-flex; align-items:center; gap:4px; white-space:nowrap; color:var(--ink-3); font-size:12px }
.template-publication__version .is-current > .anticon { color:var(--color-success) }
.template-publication__feedback { grid-column:2/-1; font-size:12px; color:var(--ink-3); overflow-wrap:anywhere }
.template-publication__failure { color:var(--danger) }
.template-publication__footer { display:flex; align-items:flex-start; gap:12px; padding-top:2px }
.template-publication__footer > .metric-disclosure { flex:1; border-top:0 }
.template-publication__history { display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:5px 0; color:var(--ink-3); font-size:12px }
.template-publication__history b { color:var(--ink-2); font-weight:500 }
.template-publication__history :deep(.ant-tag) { margin:0 }
@media(max-width:600px) {
  .template-publication__reference { grid-template-columns:auto minmax(0,1fr) auto; gap:5px 8px }
  .template-publication__version { grid-column:2; grid-row:2 }
  .template-publication__reference > .ant-btn { grid-column:3; grid-row:1/3 }
  .template-publication__feedback { grid-column:2/-1 }
}
</style>
