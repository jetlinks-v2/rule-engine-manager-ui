<template>
  <section class="collector-action-workspace">
    <div class="collector-action-workspace__layout">
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
            <button v-for="point in visiblePoints" :key="point.id" type="button" :class="{ 'is-selected': pointId === point.id }" @click="pointId = point.id">
              <span><b>{{ point.name }}</b><small>{{ point.id }}</small></span><span>{{ point.dataType?.type }}</span>
            </button>
            <CloudEmpty v-if="!pointsLoading && !visiblePoints.length" :description="collectorId ? $t('IotSceneLinkage.collector.emptyPoints') : $t('IotSceneLinkage.collector.select')" />
          </div>
        </a-spin>
      </section>
      <aside class="collector-action-workspace__configuration">
        <template v-if="collectorId">
          <header><strong>{{ currentCollector?.name || options.name }}</strong><small>{{ currentChannel?.name || options.productName }}</small></header>
          <Action :key="collectorId" ref="actionRef" compact :values="actionValues" :selected-point-id="pointId" :point-list="points" :name="name" :then-name="thenName" :branches-name="branchesName" :column-map="options.columnMap" @change="changeOptions" @type-change="handlerType = $event" @point-change="pointId = $event" />
        </template>
        <CloudEmpty v-else :description="$t('IotSceneLinkage.collector.select')" />
      </aside>
    </div>
    <footer><a-button @click="$emit('cancel')">{{ $t('IotSceneLinkage.action.cancel') }}</a-button><a-button type="primary" :disabled="!collectorId" @click="save">{{ $t('IotSceneLinkage.action.confirm') }}</a-button></footer>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { cloneDeep } from 'lodash-es'
import { useI18n } from 'vue-i18n'
import DeviceScopeTree from '../../../../SceneLinkage/editor/components/DeviceScopeTree.vue'
import Action from './actions/index.vue'
import { useCollectorActionResources } from './useCollectorActionResources'

const props = defineProps<{ value: Record<string, any>; options: Record<string, any>; name: number; thenName: number; branchesName: number }>()
const emit = defineEmits<{ cancel: []; save: [value: Record<string, any>, options: Record<string, any>] }>()
const { t } = useI18n()
const original = cloneDeep(props.value || {})
const handlerType = ref(original.handlerType || 'read')
const resources = useCollectorActionResources(original.pointSelectInfos?.[0]?.collectorId || '', original.pointSelectInfos?.[0]?.channelId || props.options.channelId || '', handlerType)
const { tree, points, visiblePoints, collectorId, channelId, pointId, keyword, loading, pointsLoading, loadError, pointsError, currentCollector, currentChannel, selectCollector, loadResources, loadPoints } = resources
pointId.value = original.pointSelectInfos?.[0]?.pointIds?.[0] || ''
const actionRef = ref<InstanceType<typeof Action>>()
const actionOptions = ref<Record<string, any>>({})
const actionValues = computed(() => collectorId.value === original.pointSelectInfos?.[0]?.collectorId ? original : { handlerType: 'read', pointSelectInfos: [{ collectorId: collectorId.value, pointIds: [] }] })
// 切换采集器会重建右侧表单，中间点位权限筛选也必须同步到它的初始动作类型。
watch(collectorId, () => {
  handlerType.value = actionValues.value.handlerType || 'read'
  actionOptions.value = {}
}, { flush: 'sync' })
function changeOptions(value: Record<string, any>) { actionOptions.value = { ...actionOptions.value, ...value } }

/** 资源选择只替换首个点位选择器，写入值、变量来源及其他扩展字段保持原有协议。 */
async function save() {
  try {
    const result = await actionRef.value?.onFormSave() as any
    if (!result) return
    const message = result.message
    const ids = message.messageType === 'write' ? Object.keys(message.properties || {}) : [message.properties]
    const writeValue = message.messageType === 'write' ? message.properties[ids[0]] : undefined
    const configuration = {
      ...original,
      handlerType: message.messageType,
      pointSelectInfos: [{ ...original.pointSelectInfos?.[0], collectorId: collectorId.value, pointIds: ids }, ...(original.pointSelectInfos || []).slice(1)],
      source: writeValue?.source,
      value: writeValue?.value,
    }
    emit('save', configuration, {
      ...props.options, ...actionOptions.value,
      name: currentCollector.value?.name || props.options.name,
      productName: currentChannel.value?.name || props.options.productName,
      // 覆盖旧名称缓存，切换采集器后节点和预览不能继续显示上一个资源。
      channelName: currentChannel.value?.name || props.options.channelName || props.options.productName,
      collectorName: currentCollector.value?.name || props.options.name,
      channelId: currentCollector.value?.channelId || channelId.value,
      type: t(message.messageType === 'write' ? 'IotSceneLinkage.action.writeProperty' : 'IotSceneLinkage.action.readProperty'),
      pointName: points.value.filter(point => ids.includes(point.id)).map(point => point.name).join('、'),
      columnMap: actionRef.value?.getColumnMap() || {},
      otherColumns: [],
    })
  } catch { /* 原有动作表单负责显示具体字段的校验错误。 */ }
}
</script>

<style scoped>
.collector-action-workspace { display: grid; gap: 16px; }
.collector-action-workspace__layout { display: grid; grid-template-columns: 16rem minmax(22rem, 1fr) 23rem; min-height: 31rem; border: 1px solid var(--jet-theme-border-color-1, #eceff3); border-radius: 8px; }
.collector-action-workspace__tree, .collector-action-workspace__configuration { min-width: 0; padding: 12px; background: #fafbfc; }
.collector-action-workspace__tree { border-right: 1px solid var(--jet-theme-border-color-1, #eceff3); }
.collector-action-workspace__configuration { border-left: 1px solid var(--jet-theme-border-color-1, #eceff3); }
.collector-action-workspace__configuration header { display: grid; gap: 4px; margin-bottom: 16px; }
.collector-action-workspace__points { display: flex; min-width: 0; flex-direction: column; gap: 12px; padding: 16px; }
.collector-action-workspace__point-list { max-height: 27rem; overflow: auto; }
.collector-action-workspace__point-list button { display: flex; justify-content: space-between; align-items: center; width: 100%; min-height: 56px; padding: 8px 12px; text-align: left; background: #fff; border: 0; border-bottom: 1px solid var(--jet-theme-border-color-1, #eceff3); cursor: pointer; }
.collector-action-workspace__point-list button > span:first-child { display: grid; min-width: 0; gap: 4px; }
.collector-action-workspace__point-list button:hover, .collector-action-workspace__point-list button.is-selected { background: var(--jet-theme-primary-soft, #e6f4ff); }
.collector-action-workspace__point-list button.is-selected { box-shadow: inset 0 0 0 1px var(--jet-theme-primary, #1677ff); }
.collector-action-workspace small { color: var(--jet-theme-text-secondary, #4e5969); overflow-wrap: anywhere; }
.collector-action-workspace footer { display: flex; justify-content: flex-end; gap: 8px; }
@media (max-width: 900px) { .collector-action-workspace__layout { grid-template-columns: 12rem minmax(0, 1fr); }.collector-action-workspace__configuration { grid-column: 1 / -1; border-top: 1px solid var(--jet-theme-border-color-1, #eceff3); } }
</style>
