<template>
    <div class="collector-action-workspace collector-action-workspace__layout">
      <aside class="collector-action-workspace__tree">
        <a-result v-if="loadError" status="error"><template #extra><a-button @click="loadResources">{{ $t('IotSceneLinkage.action.retry') }}</a-button></template></a-result>
        <DeviceScopeTree v-else :title="$t('IotSceneLinkage.collector.channels')" :nodes="tree" :loading="loading" :selected-keys="collectorId ? [collectorId] : []" :show-counts="false" icon="DatabaseOutlined" @select="selectCollector" />
      </aside>
      <section class="collector-action-workspace__points">
        <strong>{{ $t('IotSceneLinkage.collector.points') }}</strong>
        <a-input-search v-model:value="keyword" :placeholder="$t('IotSceneLinkage.collector.searchPoints')" allow-clear />
        <a-spin :spinning="pointsLoading">
          <a-result v-if="pointsError" status="error"><template #extra><a-button @click="loadPoints">{{ $t('IotSceneLinkage.action.retry') }}</a-button></template></a-result>
          <div v-else class="collector-action-workspace__point-list">
            <button v-for="point in visiblePoints" :key="point.id" type="button" :class="{ 'is-selected': selectedIds.includes(point.id) }" @click="$emit('select-point', point.id)">
              <span class="collector-action-workspace__point-title"><b>{{ point.name }}</b><small>{{ point.dataType?.type }}</small></span>
              <span class="collector-action-workspace__point-meta">
                <span>{{ $t('IotSceneLinkage.collector.address') }}：{{ point.address ?? '--' }}</span>
                <span>{{ $t('IotSceneLinkage.collector.interval') }}：{{ point.interval != null ? `${point.interval}ms` : '--' }}</span>
              </span>
              <span v-if="point.accessModes?.length" class="collector-action-workspace__point-modes">
                <a-tag v-for="mode in point.accessModes" :key="typeof mode === 'string' ? mode : mode.value">{{ typeof mode === 'string' ? $t(`IotSceneLinkage.collector.mode.${mode}`) : mode.text || $t(`IotSceneLinkage.collector.mode.${mode.value}`) }}</a-tag>
              </span>
              <small v-if="point.description" class="collector-action-workspace__point-description">{{ point.description }}</small>
            </button>
            <CloudEmpty v-if="!pointsLoading && !visiblePoints.length" :description="collectorId ? $t('IotSceneLinkage.collector.emptyPoints') : $t('IotSceneLinkage.collector.select')" />
          </div>
        </a-spin>
      </section>
      <aside class="collector-action-workspace__configuration">
        <template v-if="collectorId">
          <header><strong>{{ currentCollector?.name || options.name }}</strong><small>{{ currentChannel?.name || options.productName }}</small></header>
          <slot />
        </template>
        <CloudEmpty v-else :description="$t('IotSceneLinkage.collector.select')" />
      </aside>
    </div>
</template>

<script setup lang="ts">
import { toRefs, type ShallowUnwrapRef } from 'vue'
import DeviceScopeTree from '../../../../SceneLinkage/editor/components/DeviceScopeTree.vue'
import type { useCollectorActionResources } from './useCollectorActionResources'

/** 通道树、点位列表和配置区域共用布局；触发与动作分别管理自己的表单草稿。 */
const props = defineProps<{ resources: ShallowUnwrapRef<ReturnType<typeof useCollectorActionResources>>; selectedIds: string[]; options: Record<string, any> }>()
defineEmits<{ 'select-point': [id: string] }>()
const { tree, visiblePoints, collectorId, keyword, loading, pointsLoading, loadError, pointsError, currentCollector, currentChannel, selectCollector, loadResources, loadPoints } = toRefs(props.resources)
</script>

<style scoped>
.collector-action-workspace__layout { display: grid; grid-template-columns: 16rem minmax(22rem, 1fr) 23rem; min-height: 31rem; border: 1px solid var(--jet-theme-border-color-1, #eceff3); border-radius: 8px; }
.collector-action-workspace__tree, .collector-action-workspace__configuration { min-width: 0; padding: 12px; background: #fafbfc; }
.collector-action-workspace__tree { border-right: 1px solid var(--jet-theme-border-color-1, #eceff3); }
.collector-action-workspace__configuration { max-height: 36rem; overflow-y: auto; border-left: 1px solid var(--jet-theme-border-color-1, #eceff3); }
.collector-action-workspace__configuration header { display: grid; gap: 4px; margin-bottom: 16px; }
.collector-action-workspace__points { display: flex; min-width: 0; flex-direction: column; gap: 12px; padding: 16px; }
.collector-action-workspace__point-list { max-height: 27rem; overflow: auto; }
.collector-action-workspace__point-list button { display: grid; gap: 6px; width: 100%; min-height: 56px; padding: 8px 12px; text-align: left; background: #fff; border: 0; border-bottom: 1px solid var(--jet-theme-border-color-1, #eceff3); cursor: pointer; }
.collector-action-workspace__point-title { display: flex; justify-content: space-between; align-items: baseline; min-width: 0; gap: 12px; }
.collector-action-workspace__point-title b { overflow-wrap: anywhere; }
.collector-action-workspace__point-meta { display: flex; flex-wrap: wrap; gap: 4px 16px; color: var(--jet-theme-text-secondary, #4e5969); font-size: 12px; overflow-wrap: anywhere; }
.collector-action-workspace__point-modes { display: flex; flex-wrap: wrap; gap: 4px; }
.collector-action-workspace__point-modes :deep(.ant-tag) { margin: 0; }
.collector-action-workspace__point-description { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.collector-action-workspace__point-list button:hover, .collector-action-workspace__point-list button.is-selected { background: var(--jet-theme-primary-soft, #e6f4ff); }
.collector-action-workspace__point-list button.is-selected { box-shadow: inset 0 0 0 1px var(--jet-theme-primary, #1677ff); }
.collector-action-workspace small { color: var(--jet-theme-text-secondary, #4e5969); overflow-wrap: anywhere; }
@media (max-width: 900px) { .collector-action-workspace__layout { grid-template-columns: 12rem minmax(0, 1fr); }.collector-action-workspace__configuration { grid-column: 1 / -1; border-top: 1px solid var(--jet-theme-border-color-1, #eceff3); } }
</style>
