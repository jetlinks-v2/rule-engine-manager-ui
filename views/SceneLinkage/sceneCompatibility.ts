import { AI_EVENT_RESULT_COLUMNS } from './utils'
export { hasUnsupportedLegacyAlarmAction } from './sceneRule'

export interface SceneCompatibilityResult {
  supported: boolean
  reason?: string
}

type SceneRecord = Record<string, any>

const SUPPORTED_TRIGGERS = new Set(['manual', 'timer', 'device', 'alarm', 'ai-event', 'multi'])
const SUPPORTED_DEVICE_OPERATORS = new Set(['reportProperty', 'reportEvent', 'online', 'offline', 'state'])
const SUPPORTED_ACTIONS = new Set(['delay', 'device', 'sceneNotify', 'device-data', 'alarm-record-query'])
const TEMPLATE_OMIT_KEYS = new Set([
  'id',
  'branchId',
  'actionId',
  'createTime',
  'creatorId',
  'creatorName',
  'modifierId',
  'modifyTime',
  'modifierName',
])

const isRecord = (value: unknown): value is SceneRecord => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const asArray = (value: unknown): SceneRecord[] => Array.isArray(value)
  ? value.filter(isRecord)
  : []

const unsupported = (reason: string): SceneCompatibilityResult => ({ supported: false, reason })

const isTimeTerm = (term: SceneRecord) => {
  if (term.column === '_now' && term.termType === 'btw') return true
  const children = asArray(term.terms)
  return children.length > 0 && children.every(isTimeTerm)
}

const isSupportedTerm = (term: SceneRecord) => {
  const column = String(term.column || '')
  return column.startsWith('properties.')
    || column.startsWith('event.data.')
    // 视觉事件编辑器使用这些字段保存检测结果条件，需与 utils.ts 的转换逻辑保持一致。
    || AI_EVENT_RESULT_COLUMNS.includes(column as typeof AI_EVENT_RESULT_COLUMNS[number])
    || column === 'deviceState'
    || column === 'bizId'
    || isTimeTerm(term)
}

/**
 * Quick configuration now has one explicit device target per device trigger, condition, or action.
 * Historical range and multi-device selectors remain displayable, but cannot be saved through this editor.
 */
const hasSingleFixedDeviceSelector = (selector: unknown, selectorValues: unknown) => {
  const values = Array.isArray(selectorValues) ? selectorValues.filter(isRecord) : []
  return selector === 'fixed' && values.length === 1 && Boolean(values[0].value)
}

function validateTrigger(trigger: SceneRecord): SceneCompatibilityResult {
  const type = String(trigger.type || '')
  if (!SUPPORTED_TRIGGERS.has(type)) return unsupported('IotSceneLinkage.message.unsupportedTrigger')

  if (type === 'device' && !SUPPORTED_DEVICE_OPERATORS.has(String(trigger.device?.operation?.operator || ''))) {
    return unsupported('IotSceneLinkage.message.unsupportedTrigger')
  }
  if (type === 'device' && !hasSingleFixedDeviceSelector(trigger.device?.selector, trigger.device?.selectorValues)) {
    return unsupported('IotSceneLinkage.message.legacyConfigurationUnsupported')
  }

  if (type === 'multi') {
    const triggers = asArray(trigger.multi?.triggers)
    if (!triggers.length || triggers.some(item => !isRecord(item.trigger)
      || !validateTrigger(item.trigger).supported
      || asArray(item.terms).some(term => !isSupportedTerm(term)))) {
      return unsupported('IotSceneLinkage.message.unsupportedTrigger')
    }
  }
  return { supported: true }
}

function validateActions(branch: SceneRecord): SceneCompatibilityResult {
  const groups = asArray(branch.then)
  if (groups.length !== 1 || groups[0].parallel === true) return unsupported('IotSceneLinkage.message.unsupportedBranch')

  const actions = asArray(groups[0].actions)
  if (actions.some(action => !SUPPORTED_ACTIONS.has(String(action.executor || '')))) {
    return unsupported('IotSceneLinkage.message.unsupportedAction')
  }
  const invalidConditionAction = actions.some(action => {
    const terms = asArray(action.terms)
    if (action.executor === 'device-data') return terms.length !== 1 || !isRecord(action.configuration) || !hasSingleFixedDeviceSelector(action.configuration.selector?.selector, action.configuration.selector?.selectorValues) || !Array.isArray(action.configuration.properties) || action.configuration.properties.length !== 1 || Boolean(terms[0].terms?.length)
    if (action.executor === 'alarm-record-query') return terms.length !== 1 || Boolean(terms[0].terms?.length)
    if (action.executor === 'device') return !isRecord(action.device) || !hasSingleFixedDeviceSelector(action.device.selector, action.device.selectorValues)
    return terms.some(term => !isTimeTerm(term))
  })
  if (invalidConditionAction) {
    return unsupported('IotSceneLinkage.message.unsupportedCondition')
  }
  return { supported: true }
}

/**
 * 判断已有场景能否由当前 SaaS 风格编辑器无损表达。
 *
 * 私有化新环境不承诺兼容旧标品的全部规则形态；检测到未知结构时必须阻止保存，
 * 由管理员重新配置，而不是让表单转换静默丢弃规则语义。
 */
export function getSceneCompatibility(scene: unknown): SceneCompatibilityResult {
  if (!isRecord(scene) || !isRecord(scene.trigger)) return unsupported('IotSceneLinkage.message.unsupportedRule')

  const triggerResult = validateTrigger(scene.trigger)
  if (!triggerResult.supported) return triggerResult

  const branches = asArray(scene.branches)
  if (branches.length !== 1) return unsupported('IotSceneLinkage.message.unsupportedBranch')
  if (asArray(branches[0].when).some(term => !isSupportedTerm(term))) {
    return unsupported('IotSceneLinkage.message.unsupportedCondition')
  }
  return validateActions(branches[0])
}

/**
 * 将场景深拷贝为可复用模板，移除实例、审计及场景运行时统计字段。
 */
export function toSceneTemplate(scene: unknown): unknown {
  if (Array.isArray(scene)) return scene.map(toSceneTemplate)
  const template = stripTemplateInstanceFields(scene)
  if (isRecord(template)) {
    // 只裁剪场景顶层统计，保留嵌套物模型参数或扩展配置中的同名业务字段。
    delete template.executionCount
    delete template.lastExecutionTime
  }
  return template
}

/** 递归复制模板中的规则配置，保留既有实例和审计字段的裁剪规则。 */
function stripTemplateInstanceFields(scene: unknown): unknown {
  if (Array.isArray(scene)) return scene.map(stripTemplateInstanceFields)
  if (!isRecord(scene)) return scene
  return Object.entries(scene).reduce<SceneRecord>((result, [key, value]) => {
    if (!TEMPLATE_OMIT_KEYS.has(key)) result[key] = Array.isArray(value)
      ? value.map(item => isRecord(item) || Array.isArray(item) ? stripTemplateInstanceFields(item) : item)
      : isRecord(value) ? stripTemplateInstanceFields(value) : value
    return result
  }, {})
}

/**
 * 校验导入文件的最小场景结构和当前编辑器支持边界；通过后才允许发送创建请求。
 */
export function parseSceneTemplate(value: unknown): SceneCompatibilityResult & { data?: SceneRecord } {
  const template = toSceneTemplate(value)
  if (!isRecord(template) || !template.name || !isRecord(template.trigger) || !Array.isArray(template.branches)) {
    return { ...unsupported('IotSceneLinkage.message.invalidTemplate'), data: undefined }
  }
  const compatibility = getSceneCompatibility(template)
  return compatibility.supported ? { supported: true, data: template } : compatibility
}
