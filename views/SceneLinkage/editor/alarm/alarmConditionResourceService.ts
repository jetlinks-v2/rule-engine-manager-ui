import { queryProducts, queryAiAlarmSceneTree, queryDeviceAlarmPreprocesses, queryDevicesPage, type AiSceneTreeOption } from '../../../../api/scene-linkage'
import { normalizeResult, type SceneAlarmTriggerConfig } from '../../utils'
import type { SummaryTranslate } from '../summaryParts'
import { loadVisualAlarmTaskPage } from '../aiVisualAlarmTaskService'
import { iotAlarmSummary, type IotAlarmPreprocess } from './utils'

export type AlarmSourceKind = 'iot-device' | 'visual-ai'
export type AlarmRule = {
  id: string
  name: string
  level?: number
  unavailable?: boolean
  lines: string[]
  details: Array<{ label: string; value: string }>
  value: SceneAlarmTriggerConfig
}

/** 物联告警沿用预处理器 ID 作为 alarmConfigId，避免改变运行时规则契约。 */
export async function loadIotAlarmRules(state: SceneAlarmTriggerConfig['state'], t: SummaryTranslate): Promise<AlarmRule[]> {
  const result = normalizeResult<IotAlarmPreprocess>(await queryDeviceAlarmPreprocesses({
    pageIndex: 0,
    pageSize: 200,
    terms: [],
    sorts: [{ name: 'createTime', order: 'desc' }],
  }))
  const productIds = [...new Set(result.data.map(item => String(item.templateId || item.alarm?.templateId || '')).filter(Boolean))]
  const deviceIds = [...new Set(result.data.map(item => String(item.alarm?.thingId || '')).filter(id => id && id !== '@all'))]
  // 产品与设备名称按去重后的 ID 批量补全，请求数不随告警条数增长。
  const [products, devices] = await Promise.all([
    productIds.length ? queryProducts({ pageIndex: 0, pageSize: productIds.length, includes: ['id', 'name'], terms: [{ column: 'id', termType: 'in', value: productIds }] }) : [],
    deviceIds.length ? queryDevicesPage({ pageIndex: 0, pageSize: deviceIds.length, includes: ['id', 'name'], terms: [{ column: 'id', termType: 'in', value: deviceIds }] }) : [],
  ]).then(responses => responses.map(response => normalizeResult<{ id: string; name?: string }>(response).data))
  const productNames = Object.fromEntries(products.map(item => [String(item.id), item.name || item.id]))
  const deviceNames = Object.fromEntries(devices.map(item => [String(item.id), item.name || item.id]))

  return result.data.flatMap(item => {
    const alarm = item.alarm || {}
    const id = String(alarm.id || '')
    const { name, level, condition: alarmCondition } = iotAlarmSummary(item)
    if (!id || !name) return []
    const productId = String(item.templateId || alarm.templateId || '')
    const deviceId = String(alarm.thingId || '')
    const productName = productNames[productId] || productId
    const deviceName = deviceId && deviceId !== '@all'
      ? deviceNames[deviceId] || deviceId
      : t('IotSceneLinkage.scope.all')
    return [{
      id,
      name,
      level,
      lines: [
        t('IotSceneLinkage.alarmCondition.productLine', { value: productName }),
        t('IotSceneLinkage.alarmCondition.deviceLine', { value: deviceName }),
        alarmCondition ? t('IotSceneLinkage.alarmCondition.triggerLine', { value: alarmCondition }) : '',
      ].filter(Boolean),
      details: [
        { label: t('IotSceneLinkage.form.product'), value: productName },
        { label: t('IotSceneLinkage.form.device'), value: deviceName },
        { label: t('IotSceneLinkage.alarmCondition.triggerCondition'), value: alarmCondition || '-' },
      ],
      value: {
        sourceKind: 'iot-device',
        targetType: 'device',
        modes: [],
        state: state || 'warning',
        alarmConfigId: id,
        options: { productId, productName, deviceId: deviceId === '@all' ? undefined : deviceId, deviceName, alarmConfigName: name },
      },
    }]
  })
}

/** 任务直接分页查询，场景树只补展示名称；不再按场景逐个请求旧聚合任务。 */
export async function loadVisualAlarmRules(pageIndex: number, state: SceneAlarmTriggerConfig['state'], t: SummaryTranslate, visualScenes: AiSceneTreeOption[] = [], selectedId?: string) {
  if (pageIndex === 0) {
    visualScenes = normalizeResult<AiSceneTreeOption>(await queryAiAlarmSceneTree({ paging: false })).data
  }
  const scenes = new Map(visualScenes.map(scene => [scene.id, scene]))
  const tasks = await loadVisualAlarmTaskPage(pageIndex, {}, pageIndex === 0 ? selectedId : undefined)
  const rules: AlarmRule[] = tasks.data.flatMap(task => {
    const target = task.taskTargets?.[0]
    const scene = scenes.get(task.sceneId)
    const sceneName = scene?.name || task.sceneId
    const targetName = scene?.children?.find(item => item.value === target?.value)?.text || target?.value || '-'
    const videoCount = task.sourceCount ?? 0
    return [{
      id: String(task.id),
      name: task.name || task.id,
      level: task.alarmLevel,
      lines: [
        t('IotSceneLinkage.alarmCondition.sceneLine', { value: sceneName }),
        t('IotSceneLinkage.alarmCondition.algorithmLine', { value: targetName }),
        t('IotSceneLinkage.alarmCondition.cameraLine', { count: videoCount }),
      ],
      details: [
        { label: t('IotSceneLinkage.alarmCondition.scene'), value: sceneName },
        { label: t('IotSceneLinkage.alarmCondition.algorithm'), value: targetName },
        { label: t('IotSceneLinkage.alarmCondition.camera'), value: t('IotSceneLinkage.aiEvent.option.videoCount', { count: videoCount }) },
      ],
      value: {
        sourceKind: 'visual-ai',
        targetType: 'aiTaskMediaTarget',
        modes: [],
        state: state || 'warning',
        alarmConfigId: String(task.id),
        options: {
          sceneId: task.sceneId,
          sceneName,
          taskTarget: target?.value,
          taskTargetName: targetName,
          alarmConfigName: task.name || task.id,
        },
      },
    }]
  })
  return { rules, scenes: visualScenes, hasMore: tasks.hasMore, selectedTaskIssue: tasks.selectedTaskIssue }
}
