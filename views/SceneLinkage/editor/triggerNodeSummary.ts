import { deviceScopeSummaryParts } from './deviceScopeLabel'
import { summaryPartsText } from './summaryParts'
import type { SceneMultiTriggerForm } from '../utils'

type Translate = (key: string, params?: Record<string, unknown>) => string
type Scope = { selector?: string; selectorValues?: Array<{ value: string; name?: string }>; options?: { names?: string[] } }
const deviceKinds = new Set(['property', 'event', 'online', 'offline', 'state'])

/** 节点标题表达触发器类别，具体设备状态和判断表达式放在卡片正文。 */
export function triggerNodeTitle(kind: string, t: Translate) {
  if (deviceKinds.has(kind)) return t('IotSceneLinkage.node.deviceTrigger')
  if (['repeat', 'date', 'interval'].includes(kind)) return t('IotSceneLinkage.triggerType.timer')
  return t(`IotSceneLinkage.trigger.${kind}`)
}

/** 固定设备直接展示名称；范围选择继续标明产品及范围，不向固定设备附加数量文案。 */
export function deviceTriggerTarget(form: Omit<SceneMultiTriggerForm, 'clientId'>, t: Translate, scope?: Scope, fallbackName?: string | string[]) {
  return summaryPartsText(deviceTriggerTargetParts(form, t, scope, fallbackName))
}

/** 快速、详细节点共用范围字段片段，固定设备名称超长时只截断显示。 */
export function deviceTriggerTargetParts(form: Omit<SceneMultiTriggerForm, 'clientId'>, t: Translate, scope?: Scope, fallbackName?: string | string[]) {
  const selector = scope?.selector || (form.allDevices ? 'all' : form.dynamicScope ? form.dynamicScopeType : 'fixed')
  const values = scope?.selectorValues || (form.dynamicScope ? form.groupIds : form.deviceIds).map((value, index) => ({ value, name: form.scopeOptions.names?.[index] }))
  return deviceScopeSummaryParts(t, { selector, selectorValues: values, options: scope?.options || form.scopeOptions }, form.productName || '', Array.isArray(fallbackName) ? fallbackName.join('、') : fallbackName)
}

/** 两种编辑模式共用设备触发摘要；仅返回文本，不回写配置或转换运行时结构。 */
export function deviceTriggerNodeSummary(form: Omit<SceneMultiTriggerForm, 'clientId'>, t: Translate, scope?: Scope, fallbackName?: string | string[]) {
  const target = deviceTriggerTarget(form, t, scope, fallbackName)
  const hasValue = (value: unknown) => value !== undefined && value !== null && value !== ''
  const join = (...values: unknown[]) => values.filter(value => value !== undefined && value !== null && value !== '').join(' ')
  if (form.triggerKind === 'online' || form.triggerKind === 'offline') return join(target, t(`IotSceneLinkage.deviceState.${form.triggerKind}`))
  if (form.triggerKind === 'state') return join(target, t(`IotSceneLinkage.stateCondition.${form.deviceState}`))
  if (form.triggerKind === 'property') return join(target, form.propertyName || form.propertyId, !hasValue(form.termValue) ? undefined : t(`IotSceneLinkage.term.${form.termType || 'eq'}`), form.termValue)
  if (form.triggerKind === 'event') return join(target, form.eventName || form.eventId, form.eventOutputName || form.eventOutputId, !hasValue(form.eventTermValue) ? undefined : t(`IotSceneLinkage.term.${form.eventTermType || 'eq'}`), form.eventTermValue)
  return target
}
