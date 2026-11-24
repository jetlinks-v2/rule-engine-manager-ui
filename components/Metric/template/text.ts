import { i18nText } from '@jetlinks-web-core/components/I18n/text'
import type { I18nMessages } from '@jetlinks-web-core/components/I18n/types'
import type { MetricParameter, MetricTemplate } from '../types'

/** 枚举翻译按稳定编码关联，重排选项不会交换显示文字。 */
export function parameterEnumField(id:string, value:string) { return `parameter.${id}.enum.${encodeURIComponent(value)}` }
export function localizedParameter(parameter:MetricParameter, messages:I18nMessages, locale:string):MetricParameter {
  const text = (field:string, value?:string) => i18nText(value, messages[field], locale)
  return { ...parameter, name:text(`parameter.${parameter.id}.name`, parameter.name), description:text(`parameter.${parameter.id}.description`, parameter.description),
    valueType:valueTypeText(parameter.valueType,`parameter.${parameter.id}`,text) }
}

type Text = (field:string,value?:string,translations?:Record<string,string>) => string
const record = (value:unknown):value is Record<string,unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
/** 文本路径按字段标识和枚举编码关联；类型、编码、颜色及未知扩展原样保留。 */
function valueTypeText<T extends Record<string,unknown> | undefined>(schema:T,path:string,text:Text):T {
  if (!schema) return schema
  const result = {...schema}
  if (Array.isArray(schema.elements)) result.elements = schema.elements.map(item => record(item) ? {...item,
    text:text(`${path}.enum.${encodeURIComponent(String(item.value))}`,String(item.text ?? item.label ?? item.value),item.textI18n as Record<string,string> | undefined)} : item)
  if (Array.isArray(schema.properties)) result.properties = schema.properties.map(item => {
    if (!record(item)) return item
    const field = `${path}.field.${encodeURIComponent(String(item.id))}`
    return {...item,name:text(`${field}.name`,typeof item.name === 'string' ? item.name : undefined,item.nameI18n as Record<string,string> | undefined),
      ...(typeof item.description === 'string' ? {description:text(`${field}.description`,item.description)} : {}),
      ...(record(item.valueType) ? {valueType:valueTypeText(item.valueType,field,text)} : {})}
  })
  if (record(schema.elementType)) result.elementType = valueTypeText(schema.elementType,`${path}.element`,text)
  return result as T
}

export function templateMessages(template: MetricTemplate): I18nMessages {
  return (template.options?.i18nMessages || {}) as I18nMessages
}

/** 仅生成展示视图；表单、公式及保存继续使用原始模板，语言切换不改写草稿。 */
export function localizedTemplate(template: MetricTemplate, locale: string): MetricTemplate {
  const messages = templateMessages(template)
  const text:Text = (field, value, translations) => i18nText(value, {...translations,...messages[field]}, locale)
  return templateTextView(template,text)
}

/** 内置示例与后台模板共用文本投影，生成可持久化的多语言声明。 */
export function metricTemplateTextEntries(template:MetricTemplate):Record<string,string> {
  const entries:Record<string,string> = {}
  templateTextView(template,(field,value) => {if (value) entries[field] = value;return value || ''})
  return entries
}

function templateTextView(template:MetricTemplate,text:Text):MetricTemplate {
  return { ...template, name: text('name', template.name),
    options: { ...template.options, description: text('description', String(template.options?.description || '')), notes: text('notes', String(template.options?.notes || '')) },
    inputDefinitions: template.inputDefinitions.map(item => ({ ...item, name: text(`input.${item.id}.name`, item.name),valueType:valueTypeText(item.valueType,`input.${item.id}`,text) })),
    parameterDefinitions: template.parameterDefinitions.map(item => ({...item,name:text(`parameter.${item.id}.name`,item.name),description:text(`parameter.${item.id}.description`,item.description),valueType:valueTypeText(item.valueType,`parameter.${item.id}`,text)})),
    definitions: template.definitions.map(item => {
      const path = `rule.${item.id}`
      const options = record(item.options) ? item.options : undefined
      const calculator = record(item.calculator) ? item.calculator : undefined
      return { ...item, name: text(`${path}.name`, typeof item.name === 'string' ? item.name : undefined),
        ...(record(item.resultType) ? {resultType:valueTypeText(item.resultType,`${path}.result`,text)} : {}),
        ...(options && Array.isArray(options.stateLabels) ? {options:{...options,stateLabels:options.stateLabels.map(label => record(label) ? {...label,name:text(`${path}.state.${encodeURIComponent(String(label.value))}.name`,typeof label.name === 'string' ? label.name : undefined)} : label)}} : {}),
        ...(calculator ? {calculator:{...calculator,...(record(calculator.outputType) ? {outputType:valueTypeText(calculator.outputType,`${path}.output`,text)} : {}),
          ...(record(calculator.inputTypes) ? {inputTypes:Object.fromEntries(Object.entries(calculator.inputTypes).map(([id,schema]) => [id,record(schema) ? valueTypeText(schema,`${path}.input.${id}`,text) : schema]))} : {})}} : {}) }
    }),
    outputs: template.outputs.map(item => ({ ...item, label: text(`output.${item.metricId}.label`, item.label) })) }
}
