/** 快速、详细模式共享触发入口的顺序和文案，详细模式独有 Provider 接在这些入口之后。 */
export const SCENE_TRIGGER_CATEGORIES = {
  device: { label: 'IotSceneLinkage.triggerCategory.device', description: 'IotSceneLinkage.triggerCategoryDesc.device' },
  timer: { label: 'IotSceneLinkage.triggerCategory.timer', description: 'IotSceneLinkage.triggerCategoryDesc.timer' },
  'iot-alarm': { label: 'IotSceneLinkage.triggerCategory.iotAlarm', description: 'IotSceneLinkage.triggerCategoryDesc.iotAlarm' },
  'visual-alarm': { label: 'IotSceneLinkage.triggerCategory.visualAlarm', description: 'IotSceneLinkage.triggerCategoryDesc.visualAlarm' },
  'ai-event': { label: 'IotSceneLinkage.triggerCategory.aiEvent', description: 'IotSceneLinkage.triggerCategoryDesc.aiEvent' },
  manual: { label: 'IotSceneLinkage.triggerCategory.manual', description: 'IotSceneLinkage.triggerCategoryDesc.manual' },
} as const

export const SCENE_TRIGGER_CATEGORY_ORDER: string[] = Object.keys(SCENE_TRIGGER_CATEGORIES)
