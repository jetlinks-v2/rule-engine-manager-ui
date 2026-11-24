import type { MetricParameter, MetricTemplate } from '../types'
import { parameterEnumField, templateMessages } from './text'
import { parameterElements } from '../parameterPresentation'
import { expressionParameters } from './expressionTokens'
import {ruleExpression,type TemplateRule} from './designer'

function messageFields(parameter:MetricParameter) {
  return [`parameter.${parameter.id}.name`, `parameter.${parameter.id}.description`, ...parameterElements(parameter).map(item => parameterEnumField(parameter.id, item.value))]
}

/** 只列实际执行表达式的显式引用，不扫描算法常量或猜测脚本的动态取值。 */
export function templateParameterReferences(template:MetricTemplate):Map<string, { id:string; label:string }[]> {
  const references = new Map<string, { id:string; label:string }[]>()
  for (const rule of template.definitions as TemplateRule[]) {
    if (!rule.id) continue
    const ids = new Set<string>()
    for (const expression of (['expression','applicabilityExpression','contextKeyExpression','enterExpression','exitExpression'] as const).map(field=>ruleExpression(rule,field))) {
      if (typeof expression === 'string') for (const id of expressionParameters(expression)) ids.add(id)
    }
    for (const id of ids) references.set(id, [...references.get(id) || [], { id:rule.id, label:rule.name || template.outputs.find(item => item.metricId === rule.id)?.label || rule.id }])
  }
  return references
}

export function templateParameterDefault(template: MetricTemplate, parameter: MetricParameter): unknown {
  return Object.prototype.hasOwnProperty.call(template.parameters, parameter.id) ? template.parameters[parameter.id] : parameter.expands?.defaultValue
}

/** 参数身份与对应默认值一起更新，保留未参与编辑的参数。 */
export function updateTemplateParameter(template: MetricTemplate, index: number, fields: Partial<MetricParameter>): MetricTemplate {
  const previousId = template.parameterDefinitions[index].id
  const nextId = fields.id ?? previousId
  const parameters = { ...template.parameters }
  if (nextId !== previousId && Object.prototype.hasOwnProperty.call(parameters, previousId)) {
    parameters[nextId] = parameters[previousId]
    delete parameters[previousId]
  }
  const messages = { ...templateMessages(template) }
  if (nextId !== previousId) {
    for (const field of messageFields(template.parameterDefinitions[index])) {
      if (messages[field]) { messages[field.replace(`parameter.${previousId}.`, `parameter.${nextId}.`)] = messages[field]; delete messages[field] }
    }
  }
  if (fields.valueType && fields.valueType.type !== template.parameterDefinitions[index].valueType?.type) {
    for (const item of parameterElements(template.parameterDefinitions[index])) delete messages[parameterEnumField(nextId, item.value)]
  }
  const options = JSON.stringify(messages) === JSON.stringify(templateMessages(template)) ? template.options : { ...template.options, i18nMessages:messages }
  return { ...template, parameters, options,
    parameterDefinitions: template.parameterDefinitions.map((item, i) => i === index ? { ...item, ...fields } : item) }
}

export function removeTemplateParameter(template: MetricTemplate, index: number): MetricTemplate {
  const parameters = { ...template.parameters }
  delete parameters[template.parameterDefinitions[index].id]
  const messages = { ...templateMessages(template) }
  for (const field of messageFields(template.parameterDefinitions[index])) delete messages[field]
  return { ...template, parameters, options:{ ...template.options, i18nMessages:messages },
    parameterDefinitions: template.parameterDefinitions.filter((_, i) => i !== index) }
}
