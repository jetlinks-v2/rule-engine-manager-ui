import { computed, reactive, ref, watch } from 'vue'
import { cloneDeep } from 'lodash-es'
import { useI18n } from 'vue-i18n'
import type { TriggerCollector } from '../../typings'
import type Type from './Type.vue'
import { useCollectorActionResources } from '../action/Collector/useCollectorActionResources'
import { handleTimerOptions } from '../components/Timer/util'

/** 触发弹窗只管理会话草稿；复用资源查询，确认后才按原生采集器协议提交。 */
export function useCollectorTriggerDraft(props: { value: TriggerCollector; options: Record<string, any> }, onSave: (value: TriggerCollector, options: Record<string, any>) => void) {
  const { t } = useI18n()
  const original = cloneDeep(props.value || {})
  const handlerType = ref(['read', 'write', 'sub'].includes(original.operator || '') ? original.operator! : 'read')
  const resources = useCollectorActionResources(original.pointSelectInfo?.collectorId || '', original.pointSelectInfo?.channelId || props.options.channelId || '', handlerType)
  const resourceView = reactive(resources)
  const { collectorId, channelId, points, pointsLoading, pointsError, currentCollector, currentChannel } = resources
  const selectedIds = ref<string[]>([])
  const typeRef = ref<InstanceType<typeof Type>>()
  // 资源切换重建右侧表单；原节点只在确认后回写，取消不会修改采集参数或时间。
  const configuration = computed(() => collectorId.value === original.pointSelectInfo?.collectorId
    ? { ...original, operator: ['read', 'write', 'sub'].includes(original.operator || '') ? original.operator : 'read' }
    : { operator: 'read', pointSelectInfo: { collectorId: collectorId.value, pointIds: [] } })

  watch(collectorId, () => { handlerType.value = configuration.value.operator || 'read' }, { flush: 'sync' })

  /** 沿用采集器触发的读、写、订阅协议，只替换资源选择的布局与显示信息。 */
  async function save() {
    try {
      const result = await typeRef.value?.vail() as { data: TriggerCollector & { readPoints?: string[]; writePoints?: Record<string, unknown> }; action?: string } | false
      if (!result) return
      const draft = result.data
      const ids = draft.operator === 'sub' ? points.value.map(point => point.id) : draft.readPoints || Object.keys(draft.writePoints || {})
      const collectorName = currentCollector.value?.name || props.options.collectorName || original.pointSelectInfo?.collectorName || ''
      const selection = { channelId: currentCollector.value?.channelId || channelId.value, collectorId: collectorId.value, collectorName, pointIds: ids }
      const data = {
        ...original, ...draft,
        pointSelectInfo: selection,
        ...(draft.operator !== 'sub' ? { collectorConfig: {
          ...original.collectorConfig, handlerType: draft.operator, source: 'fixed',
          pointSelectInfos: [selection], value: Object.values(draft.writePoints || {})[0] ?? '',
        } } : {}),
      }
      // 订阅无需定时，切换类型后不保留上一次读写的时间或点位字段。
      if (draft.operator === 'sub') { delete data.timer; delete data.collectorConfig }
      if (draft.operator !== 'read') delete data.readPoints
      if (draft.operator !== 'write') delete data.writePoints
      const labels = {
        ...props.options,
        name: collectorName, collectorName,
        channelId: selection.channelId,
        channelName: currentChannel.value?.name || props.options.channelName,
        pointName: draft.operator === 'sub' ? t('IotSceneLinkage.node.allPoints') : points.value.filter(point => ids.includes(point.id)).map(point => point.name).join('、'),
        action: result.action,
        when: undefined, time: undefined, extraTime: undefined,
        ...(data.timer ? handleTimerOptions(data.timer) : {}),
      }
      onSave(data, labels)
    } catch { /* 右侧表单负责显示具体字段的校验错误。 */ }
  }
  return { resourceView, collectorId, points, pointsLoading, pointsError, selectedIds, typeRef, configuration, handlerType, save }
}
