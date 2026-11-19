<template>
  <div class="collector-action-workspace collector-action-workspace__layout">
    <aside class="collector-action-workspace__tree">
      <a-result v-if="loadError" status="error"><template #extra><a-button @click="loadResources">{{ $t('IotSceneLinkage.action.retry') }}</a-button></template></a-result>
      <DeviceScopeTree v-else :title="$t('IotSceneLinkage.collector.channelTitle')" :nodes="channelNodes" :loading="loading"
        :selected-keys="[channelId ? 'channel:' + channelId : 'channel:all']" :show-counts="false" icon="ClusterOutlined" @select="selectChannel" />
    </aside>
    <section class="collector-action-workspace__collectors">
      <header class="collector-action-workspace__collector-header">
        <strong>{{ $t('IotSceneLinkage.collector.collectorList') }}</strong>
        <a-input-search v-model:value="collectorKeyword" :placeholder="$t('IotSceneLinkage.collector.searchCollectors')" allow-clear />
      </header>
      <a-spin :spinning="loading">
        <div class="collector-action-workspace__collector-list">
          <button v-for="collector in visibleCollectors" :key="collector.id" type="button" :aria-pressed="collectorId === collector.id"
            :class="{ 'is-selected': collectorId === collector.id }" @click="selectCollector([collector.id])">
            <AIcon type="DatabaseOutlined" />
            <span class="collector-action-workspace__collector-copy"><a-tooltip :title="collector.name"><strong>{{ collector.name }}</strong></a-tooltip>
              <small>{{ channelName(collector.channelId) }}</small></span>
            <span v-if="collector.pointNumber != null" class="collector-action-workspace__count">{{ $t('IotSceneLinkage.collector.pointCount', { count: collector.pointNumber }) }}</span>
            <AIcon v-if="collectorId === collector.id" class="collector-action-workspace__check" type="CheckCircleFilled" />
          </button>
          <CloudEmpty v-if="!loading && !visibleCollectors.length" :description="$t('IotSceneLinkage.collector.emptyCollectors')" />
        </div>
      </a-spin>
    </section>
    <aside class="collector-action-workspace__configuration">
      <header><strong>{{ $t('IotSceneLinkage.scope.configuration') }}</strong></header>
      <template v-if="collectorId">
        <a-spin :spinning="pointsLoading">
          <a-result v-if="pointsError" status="error"><template #extra><a-button @click="loadPoints">{{ $t('IotSceneLinkage.action.retry') }}</a-button></template></a-result>
          <slot v-else />
        </a-spin>
        <SceneConfigPreview v-if="!pointsLoading && !pointsError && $slots.preview"><slot name="preview" /></SceneConfigPreview>
      </template>
      <CloudEmpty v-else :description="$t('IotSceneLinkage.collector.select')" />
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, toRefs, type ShallowUnwrapRef } from 'vue'
import { useI18n } from 'vue-i18n'
import SceneConfigPreview from '../../../../SceneLinkage/editor/components/SceneConfigPreview.vue'
import DeviceScopeTree from '../../../../SceneLinkage/editor/components/DeviceScopeTree.vue'
import type { useCollectorActionResources } from './useCollectorActionResources'

/** 触发与动作共用通道、采集器选择；具体点位仅在右侧规则中配置。 */
const props = defineProps<{ resources: ShallowUnwrapRef<ReturnType<typeof useCollectorActionResources>> }>()
const { t } = useI18n()
const { tree, channels, visibleCollectors, collectorKeyword, collectorId, channelId, loading, pointsLoading, loadError, pointsError, selectChannel, selectCollector, loadResources, loadPoints } = toRefs(props.resources)
const channelNodes = computed(() => [{ key: 'channel:all', title: t('IotSceneLinkage.collector.allChannels'), icon: 'AppstoreOutlined' }, ...tree.value])
const channelName = (id?: string) => channels.value.find(channel => channel.id === id)?.name || ''
</script>

<style scoped>
.collector-action-workspace__layout { display: grid; grid-template-columns: 13.5rem minmax(0, 1fr) 27.5rem; min-height: 31rem; border: 1px solid var(--jet-theme-border-color-1, #eceff3); border-radius: 8px; }
.collector-action-workspace__tree, .collector-action-workspace__configuration { min-width: 0; padding: 16px; background: var(--ant-color-bg-container, #fff); }
.collector-action-workspace__tree { border-right: 1px solid var(--jet-theme-border-color-1, #eceff3); }
.collector-action-workspace__configuration { max-height: 36rem; overflow-y: auto; border-left: 1px solid var(--jet-theme-border-color-1, #eceff3); }
.collector-action-workspace__configuration > header { min-height: 32px; margin-bottom: 16px; display: flex; align-items: center; }
.collector-action-workspace__collectors { display: flex; min-width: 0; flex-direction: column; gap: 12px; padding: 16px; }
.collector-action-workspace__collector-header { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; }
.collector-action-workspace__collector-header :deep(.ant-input-search) { width: 280px; max-width: 100%; }
.collector-action-workspace__collector-list { max-height: 27rem; overflow: auto; }
.collector-action-workspace__collector-list > button { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 64px; padding: 12px; text-align: left; color: var(--jet-theme-text, #262626); background: #fff; border: 1px solid transparent; border-bottom-color: var(--jet-theme-border-color-1, #eceff3); border-radius: 4px; cursor: pointer; }
.collector-action-workspace__collector-copy { display: grid; flex: 1; gap: 4px; min-width: 0; }
.collector-action-workspace__collector-copy strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.collector-action-workspace__collector-copy small, .collector-action-workspace__count { color: var(--jet-theme-text-secondary, #595959); }
.collector-action-workspace__count { flex: none; font-size: 12px; }
.collector-action-workspace__collector-list > button:hover, .collector-action-workspace__collector-list > button.is-selected { background: var(--jet-theme-primary-soft, #e6f4ff); }
.collector-action-workspace__collector-list > button.is-selected { border-color: var(--jet-theme-primary, #1677ff); }
.collector-action-workspace__collector-list > button:focus-visible { outline: 2px solid var(--jet-theme-primary, #1677ff); outline-offset: -2px; }
.collector-action-workspace__check { color: var(--jet-theme-primary, #1677ff); }
@media (max-width: 900px) { .collector-action-workspace__layout { grid-template-columns: 12rem minmax(0, 1fr); }.collector-action-workspace__configuration { grid-column: 1 / -1; border-top: 1px solid var(--jet-theme-border-color-1, #eceff3); } }
</style>
