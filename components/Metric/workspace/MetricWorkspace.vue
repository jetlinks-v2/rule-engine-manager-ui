<template>
  <FullPage flex transparent-background :padding="0" class="metric-workspace">
    <a-alert v-if="resources.issues.length" type="error" show-icon :message="t('moduleAssemblyFailed')" />
    <a-skeleton v-if="discoveryLoading" active :paragraph="{ rows:6 }" />
    <a-alert v-else-if="discoveryError" type="error" show-icon :message="t('objectTypesFailed')" :description="discoveryError"><template #action><a-button size="small" @click="reloadDimensions">{{ t('retry') }}</a-button></template></a-alert>
    <a-alert v-if="unavailable" type="warning" show-icon :message="t('dimensionUnavailable')" />
    <ResponsiveSplitter v-if="!discoveryLoading && !discoveryError" ref="splitter" class="metric-workspace__columns" :default-size="240" :gutter="0" :min="200" :max="360" :end-min="420" collapse-on-drag :panel-title="t('selectObject')">
      <template #start="{ compact }"><MetricWorkspaceNavigation v-bind="navigationProps" @dimension="chooseDimension" @select="selectObject">
        <template v-if="!compact" #actions><PanelCollapseButton :collapsed="false" :aria-controls="splitter?.startId" @toggle="splitter?.toggle()" /></template>
      </MetricWorkspaceNavigation></template>
      <template #end="{ collapsed, toggle, startId, compact }">
        <main ref="results" class="metric-workspace__results" tabindex="-1">
          <MetricWorkspaceScope v-if="context && dimension" :key="JSON.stringify([scopeKey, dimension.moduleId, context.ownerType, context.ownerId])"
            :provider="dimension.provider" :context="context" :initial-reference="initialReference" :initial-template="initialTemplate" @apply-started="emit('applyStarted')" :detail-link-label="businessRoute ? t('openBusiness') : undefined" @open-object="openMetricObject" @open-detail-link="(reference:MetricReference) => businessRoute && emit('toBusiness', businessRoute, reference)">
            <template #object-heading>
              <div class="metric-workspace__object-heading">
                <PanelCollapseButton v-if="compact || collapsed" :collapsed="collapsed" :aria-controls="startId" :label="t('selectObject')" @toggle="toggle" />
                <AIcon :type="dimension.provider.icon || 'AppstoreOutlined'" class="metric-workspace__object-icon" />
                <h3 :title="context.label">{{ context.label }}</h3>
              </div>
            </template>
            <template #object-actions>
              <a-button v-if="businessRoute" type="text" size="small" :aria-label="t('openBusiness')" :title="t('openBusiness')" @click="emit('toBusiness', businessRoute, undefined)"><AIcon type="ExportOutlined" /></a-button>
            </template>
          </MetricWorkspaceScope>
          <a-empty v-else :description="resources.dimensions.length ? t('chooseMetricObject') : t('noDimensions')">
            <a-button v-if="collapsed && resources.dimensions.length" @click="toggle">{{ t('selectObject') }}</a-button>
          </a-empty>
        </main>
      </template>
    </ResponsiveSplitter>
  </FullPage>
</template>
<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RouteLocationRaw } from 'vue-router'
import { ResponsiveSplitter, PanelCollapseButton } from '@jetlinks-web-core/components'
import { metricMessages } from '../messages'
import type { MetricObjectSelection, MetricReference, MetricTemplateReference, MetricSelectionOrigin, MetricWorkspaceSelection } from '../types'
import { useMetricWorkspace } from './useMetricWorkspace'
import MetricWorkspaceScope from './MetricWorkspaceScope.vue'
import MetricWorkspaceNavigation from './MetricWorkspaceNavigation.vue'
const props = withDefaults(defineProps<{ scopeKey: string; selection?: MetricWorkspaceSelection; initialReference?: MetricReference; initialTemplate?:MetricTemplateReference; editable?: boolean }>(), { editable: false })
const emit = defineEmits<{ (event:'applyStarted'):void; (event: 'update:selection', value: MetricWorkspaceSelection | undefined): void; (event: 'toBusiness', route: RouteLocationRaw, reference: MetricReference | undefined): void }>()
const { t } = useI18n({ useScope: 'local', messages: metricMessages })
const splitter = ref<InstanceType<typeof ResponsiveSplitter>>()
const results = ref<HTMLElement>()
let memory: Storage | undefined
try { memory = typeof window === 'undefined' ? undefined : window.localStorage } catch { /* Restricted browsers may disable preference storage. */ }
const { resources, selection, dimension, confirmed, context, unavailable, discoveryLoading, discoveryError, reloadDimensions, chooseDimension, confirmObject } = useMetricWorkspace(toRef(props, 'scopeKey'), toRef(props, 'selection'), toRef(props, 'editable'), value => emit('update:selection', value), memory)
const businessRoute = computed(() => confirmed.value && dimension.value?.provider.toBusiness?.(confirmed.value))
const navigationProps = computed(() => ({ scopeKey:props.scopeKey, dimensions:resources.value.dimensions, dimension:dimension.value, selection:selection.value }))
function selectObject(object?: MetricObjectSelection, origin?: MetricSelectionOrigin) {
  confirmObject(object)
  if (object && origin !== 'validation') splitter.value?.close(results.value)
}
/** 按添加位置切换同一工作区，名称与读权限仍由目标 navigator 重新确认。 */
function openMetricObject(value:MetricWorkspaceSelection){
  if(!resources.value.dimensions.some(item=>item.provider.ownerType===value.ownerType))return
  chooseDimension(value.ownerType);selection.value={...value};confirmed.value=undefined;emit('update:selection',{...value})
}
</script>
<style scoped>
.metric-workspace { display:flex; flex:1 1 auto; flex-direction:column; min-width:0; min-height:0; overflow:hidden; box-sizing:border-box; border:1px solid var(--line); border-radius:inherit }
.metric-workspace__columns { flex:1; min-height:0 }
.metric-workspace__results { display:flex; flex-direction:column; height:100%; min-height:0; min-width:0; overflow:hidden }
.metric-workspace__results > :deep(.ant-empty) { padding-block:var(--space-8,32px) }
.metric-workspace__object-heading { display:flex; align-items:center; gap:8px; min-width:0; max-width:100% }
.metric-workspace__object-heading h3 { margin:0; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:var(--fs-16,16px); font-weight:600; color:var(--ink-1) }
.metric-workspace__object-heading :deep(.ant-btn), .metric-workspace__object-icon { flex:none; color:var(--ink-3) }
</style>
