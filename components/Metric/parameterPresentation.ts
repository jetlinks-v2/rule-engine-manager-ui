import type { MetricParameter } from './types'

export const numericParameterTypes = ['int', 'long', 'float', 'double']
export const parameterTypeKeys: Record<string, string> = {
  double:'parameterNumber', float:'parameterNumber', int:'parameterInteger', long:'parameterLong', string:'parameterText',
  boolean:'parameterBoolean', enum:'parameterEnum', object:'parameterObject', array:'parameterArray',
}
/** 输入与输出共用类型名称、图标和说明；声明结构仍由各自编辑器负责。 */
export function metricTypeOptions(t:(key:string)=>string) {
  const icons:Record<string,string> = { double:'NumberOutlined',float:'NumberOutlined',int:'NumberOutlined',long:'NumberOutlined',string:'FontSizeOutlined',boolean:'PoweroffOutlined',enum:'UnorderedListOutlined',object:'CodeOutlined',array:'BarsOutlined',date:'CalendarOutlined' }
  return [...Object.entries(parameterTypeKeys).map(([value,key])=>({value,label:t(value === 'float' ? 'inputFloatType' : key),icon:icons[value],description:t(value === 'float' ? 'inputFloatHint' : `${key}Hint`)})),{value:'date',label:t('inputDateType'),icon:icons.date,description:t('inputDateHint')}]
}
export function numericParameter(parameter: MetricParameter) { return numericParameterTypes.includes(parameter.valueType?.type || '') }
export function parameterNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
export function parameterPrecision(parameter: MetricParameter): number | undefined {
  return ['int', 'long'].includes(parameter.valueType?.type || '') ? 0 : parameterNumber(parameter.valueType?.scale)
}
export function parameterElements(parameter: MetricParameter): { value: string; text?: string; label?: string }[] {
  return Array.isArray(parameter.valueType?.elements) ? parameter.valueType.elements : []
}
export function parameterValueText(parameter: MetricParameter, value: unknown, t: (key: string) => string): string {
  if (value == null || value === '') return t('notConfigured')
  if (parameter.valueType?.type === 'boolean' && typeof value === 'boolean') return t(value ? 'parameterOn' : 'parameterOff')
  if (parameter.valueType?.type === 'enum') {
    const label = (item:unknown) => parameterElements(parameter).find(element => element.value === item)?.text ?? String(item)
    return Array.isArray(value) ? value.map(label).join(t('sentenceList')) : label(value)
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}
/** 参数可填范围来自物模型，不从业务阈值或默认值推断。 */
export function parameterConstraints(parameter: MetricParameter, t: (key: string, values?: Record<string, unknown>) => string): string {
  const type = parameter.valueType?.type || 'string'
  if (numericParameter(parameter)) {
    const min = parameterNumber(parameter.valueType?.min), max = parameterNumber(parameter.valueType?.max)
    const unit = typeof parameter.valueType?.unit === 'string' ? parameter.valueType.unit : ''
    const bounds = min !== undefined && max !== undefined ? t('parameterBetween', { min, max, unit })
      : min !== undefined ? t('parameterAtLeast', { min, unit }) : max !== undefined ? t('parameterAtMost', { max, unit }) : ''
    const scale = parameterPrecision(parameter)
    const format = scale === 0 ? t('parameterInteger') : scale !== undefined ? t('parameterDecimalPlaces', { scale }) : t('parameterNumber')
    return [bounds, format].filter(Boolean).join(t('sentenceComma'))
  }
  if (type === 'enum') return t('parameterChoices', { choices:parameterElements(parameter).map(item => item.text ?? item.label ?? item.value).join(t('sentenceList')) })
  if (type === 'date') return t('inputDateType')
  return t(parameterTypeKeys[type] || 'parameterText')
}
/** 仅完整且有效的双边界画刻度；超界旧值不伪装成合法位置。 */
export function parameterRange(parameter: MetricParameter, value: unknown) {
  if (!numericParameter(parameter)) return
  const min = parameterNumber(parameter.valueType?.min), max = parameterNumber(parameter.valueType?.max)
  if (min === undefined || max === undefined || min >= max) return
  const number = parameterNumber(value)
  const position = number !== undefined && number >= min && number <= max ? (number - min) / (max - min) * 100 : undefined
  return { min, max, position }
}
