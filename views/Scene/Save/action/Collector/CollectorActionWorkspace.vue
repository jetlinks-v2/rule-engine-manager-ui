<template>
  <section class="collector-action-workspace">
    <CollectorResourceWorkspace :resources="resourceView" :options="options" :selected-ids="pointId ? [pointId] : []" @select-point="pointId = $event">
      <Action :key="collectorId" ref="actionRef" compact :values="actionValues" :selected-point-id="pointId" :point-list="points" :name="name" :then-name="thenName" :branches-name="branchesName" :column-map="options.columnMap" @change="changeOptions" @type-change="handlerType = $event" @point-change="pointId = $event" />
    </CollectorResourceWorkspace>
    <footer><a-button @click="$emit('cancel')">{{ $t('IotSceneLinkage.action.cancel') }}</a-button><a-button type="primary" :disabled="!collectorId" @click="save">{{ $t('IotSceneLinkage.action.confirm') }}</a-button></footer>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { cloneDeep } from 'lodash-es'
import { useI18n } from 'vue-i18n'
import CollectorResourceWorkspace from './CollectorResourceWorkspace.vue'
import Action from './actions/index.vue'
import { useCollectorActionResources } from './useCollectorActionResources'

const props = defineProps<{ value: Record<string, any>; options: Record<string, any>; name: number; thenName: number; branchesName: number }>()
const emit = defineEmits<{ cancel: []; save: [value: Record<string, any>, options: Record<string, any>] }>()
const { t } = useI18n()
const original = cloneDeep(props.value || {})
const handlerType = ref(original.handlerType || 'read')
const resources = useCollectorActionResources(original.pointSelectInfos?.[0]?.collectorId || '', original.pointSelectInfos?.[0]?.channelId || props.options.channelId || '', handlerType)
const resourceView = reactive(resources)
const { points, collectorId, channelId, pointId, currentCollector, currentChannel } = resources
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
.collector-action-workspace { display: grid; gap: var(--space-4, 16px); }
.collector-action-workspace footer { display: flex; justify-content: flex-end; gap: var(--space-2, 8px); }
</style>
