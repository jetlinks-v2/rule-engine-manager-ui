import { i18nText } from '@jetlinks-web-core/components/I18n/text'
import { metricDurationText, metricValueText } from './presentation'
import { stateLabels } from './stateIntervals'
import { metricDateText } from './time'
import type { MetricCalculatorDescriptor, MetricSourceDescription, MetricStateLabel, MetricTemplate } from './types'
import type { TemplateRule } from './template/designer'
import { resolveMetricResultType } from './template/resultTypes'
import { findCalculator } from './calculatorDescriptor'

export type ValueSchema = Record<string, unknown>
export type ValueTranslate = (key:string, values?:Record<string, unknown>) => string
export interface ValueField { id:string; name:string; value:unknown; schema?:ValueSchema; unit?:string }
const record = (value:unknown):ValueSchema | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ValueSchema : undefined

/** 来源的日期语义可补齐旧数值声明；仅用于只读显示，不改模板或参与计算的原值。 */
export function metricSourceTemplate(template:MetricTemplate, sources:Record<string,MetricSourceDescription>):MetricTemplate {
  return { ...template, inputDefinitions:template.inputDefinitions.map(input => {
    const source = sources[input.id]
    if (!source?.valueType || source.error) return input
    const type = input.valueType?.type
    const date = source.valueType.type === 'date' && (!type || ['byte','short','int','long','float','double','number'].includes(String(type)))
    const enumeration = source.valueType.type === 'enum' && type !== 'enum'
    return { ...input, unit:input.unit || source.unit, valueType:{ ...source.valueType, ...input.valueType, ...(date ? { type:'date' } : {}), ...(enumeration ? source.valueType : {}) } }
  }) }
}

/** 保留自定义名称；旧模板以字段ID占位的名称由当前语言目录补齐。 */
function mergeSchema(value?:ValueSchema, fallback?:ValueSchema):ValueSchema | undefined {
  if (!value) return fallback
  if (!fallback) return value
  const properties = Array.isArray(value.properties) ? value.properties : undefined
  const defaults = Array.isArray(fallback?.properties) ? fallback.properties : []
  // 老模板可只声明部分字段；目录补齐其他字段的含义，实际投影仍以返回值为准。
  const combined = properties && [...properties, ...defaults.filter(item => !properties.some(property => record(property)?.id === record(item)?.id))]
  return { ...fallback, ...value, ...(combined ? { properties:combined.map(item => {
    const property = record(item) || {}
    const base = defaults.map(record).find(item => item?.id === property.id)
    const name = typeof property.name === 'string' ? property.name.trim() : ''
    return { ...base, ...property, name:name && name !== property.id ? property.name : base?.name || property.name,
      valueType:mergeSchema(record(property.valueType), record(base?.valueType)) }
  }) } : {}) }
}

export function metricValueSchema(template:MetricTemplate, id:string, calculators:MetricCalculatorDescriptor[] = []):ValueSchema | undefined {
  const rule = template.definitions.find(rule => rule.id === id) as TemplateRule | undefined
  const spec = rule?.calculator
  const descriptor = findCalculator(spec, calculators)
  return mergeSchema(resolveMetricResultType(template,id,calculators).schema, descriptor?.configuration.outputType)
}

export function schemaValueLabels(schema?:ValueSchema):MetricStateLabel[] {
  if (schema?.type !== 'enum' || !Array.isArray(schema.elements)) return []
  return schema.elements.flatMap(value => {
    const item = record(value)
    if (!item || !['string','number','boolean'].includes(typeof item.value)) return []
    return [{ value:item.value as MetricStateLabel['value'], name:String(item.text ?? item.label ?? item.value),
      ...(record(item.textI18n) ? { nameI18n:Object.fromEntries(Object.entries(item.textI18n as ValueSchema).filter((entry):entry is [string,string]=>typeof entry[1] === 'string')) } : {}),
      ...(typeof item.icon === 'string' ? { icon:item.icon } : {}) }]
  })
}

/** 只传播无转换的直接状态映射；冲突映射不推断含义，也不改变输入类型或合法性。 */
export function metricValueLabels(template:MetricTemplate | undefined, id:string):MetricStateLabel[] {
  if (!template) return []
  const declared = validStateLabels(stateLabels(template, id))
  if (declared.length) return declared
  const input = template.inputDefinitions.find(item => item.id === id)
  if (!input) return []
  const own = schemaValueLabels(input.valueType)
  if (own.length) return own
  const candidates = (template.definitions as TemplateRule[]).flatMap(rule => {
    if (!rule.stateTracking || !rule.id) return []
    const binding = rule.inputs?.find(item => !item.source && item.metricId === id)
    if (!binding && !rule.dependsOn?.includes(id)) return []
    const alias = (binding?.id || id).replace(/[^a-zA-Z0-9_]/g, '_')
    const direct = rule.expressionTree ? rule.expressionTree.root.type === 'reference' && rule.expressionTree.root.id === alias && !rule.expressionTree.root.path.length
      : rule.expression?.trim().replace(/^#/, '') === alias
    return direct ? [validStateLabels(stateLabels(template, rule.id))] : []
  }).filter(items => items.length)
  const first = candidates[0] || []
  return candidates.every(items => items.length === first.length && first.every(item => items.some(other =>
    other.value === item.value && other.name === item.name && JSON.stringify(other.nameI18n) === JSON.stringify(item.nameI18n)))) ? first : []
}

function validStateLabels(value:unknown):MetricStateLabel[] {
  return Array.isArray(value) ? value.filter((item):item is MetricStateLabel => !!record(item)
    && ['string','number','boolean'].includes(typeof item.value) && typeof item.name === 'string') : []
}

export function semanticValueText(value:unknown, options:{ labels?:MetricStateLabel[]; locale?:string; unit?:string; schema?:ValueSchema }, t:ValueTranslate):string {
  if (value == null) return t('semanticNoValue')
  if (options.schema?.type === 'date') return metricDateText(value,typeof options.schema.format === 'string' ? options.schema.format : undefined)
  if (options.labels?.length) {
    const item = options.labels.find(item => item.value === value)
    return item ? i18nText(item.name, item.nameI18n, options.locale || 'zh') : t('semanticUndefinedState', { value:metricValueText(value) })
  }
  if (Array.isArray(value)) return t('semanticArray', { count:value.length })
  if (typeof value === 'object') return t('semanticObject', { count:Object.keys(value).length })
  return metricDurationText(value, options.unit, t) ?? (typeof value === 'boolean' ? t(value ? 'conditionTrue' : 'conditionFalse') : metricValueText(value))
}

/** 对象结果只投影实际存在字段；声明顺序优先，未知字段保留真实名称。 */
export function metricValueFields(value:unknown, schema?:ValueSchema):ValueField[] {
  const data = record(value)
  if (!data) return []
  const properties = Array.isArray(schema?.properties) ? schema.properties.map(record).filter((item):item is ValueSchema => !!item) : []
  const ids = [...new Set([...properties.map(item => String(item.id)), ...Object.keys(data)])]
  return ids.filter(id => Object.hasOwn(data, id)).map(id => {
    const property = properties.find(item => item.id === id)
    const type = record(property?.valueType)
    const unit = property?.unit ?? type?.unit
    return { id, name:String(property?.name || id), value:data[id], schema:type, unit:typeof unit === 'string' ? unit : undefined }
  })
}

export function metricValueUnit(template:MetricTemplate, id:string, calculators:MetricCalculatorDescriptor[] = []):string | undefined {
  const output = template.outputs.find(item => item.metricId === id)
  const input = template.inputDefinitions.find(item => item.id === id)
  const rule = template.definitions.find(item => item.id === id) as TemplateRule | undefined
  const unit = output?.unit || input?.unit || rule?.calculator?.outputUnit || metricValueSchema(template,id,calculators)?.unit
  return typeof unit === 'string' ? unit : undefined
}
