export type ThingModelValueType = {
  type?: string
  elements?: Array<{ text?: string; label?: string; name?: string; value?: unknown; id?: unknown }>
  trueText?: string
  falseText?: string
  trueValue?: unknown
  falseValue?: unknown
}

export type ThingModelKind = 'property' | 'event' | 'function'

export type ThingModelOption = {
  label: string
  value: string
  valueType?: ThingModelValueType
  kind?: ThingModelKind
  unit?: string
  inputCount?: number
  outputCount?: number
}

const numberTypes = new Set(['int', 'long', 'float', 'double', 'number'])
const unsupportedTypes = new Set(['object', 'array'])

export const getValueType = (item?: any): ThingModelValueType | undefined => {
  const valueType = item?.valueType || item?.dataType || item?.type
  return typeof valueType === 'object' ? valueType : valueType ? { type: String(valueType) } : undefined
}

export const getValueTypeName = (valueType?: ThingModelValueType) => String(valueType?.type || 'string').toLowerCase()

export const isNumberValueType = (valueType?: ThingModelValueType) => numberTypes.has(getValueTypeName(valueType))

export const isDateValueType = (valueType?: ThingModelValueType) => ['date', 'datetime'].includes(getValueTypeName(valueType))

export const isSupportedValueType = (valueType?: ThingModelValueType) => !unsupportedTypes.has(getValueTypeName(valueType))

const normalizeUnitName = (value: any): string | undefined => {
  if (!value) return undefined
  if (typeof value === 'object') return normalizeUnitName(value.name || value.text || value.label)
  return String(value).trim() || undefined
}

// unit 保存的是单位标识；场景下拉描述只展示后端返回的单位名称。
const getUnitName = (item?: any): string | undefined => {
  const valueType = item?.valueType || {}
  const name = valueType.unitName || valueType.unitText || valueType.unitLabel || item?.unitName || item?.unitText || item?.unitLabel
  if (name) return normalizeUnitName(name)
  const unit = valueType.unit || item?.unit
  if (!unit || typeof unit !== 'object') return undefined
  return normalizeUnitName(unit)
}

export const toThingModelOptions = (items: any[] = [], kind: ThingModelKind = 'property'): ThingModelOption[] => items
  // 事件的 valueType 通常是 object，但仍应作为事件输出参数的入口提供选择。
  .filter(item => kind === 'event' || isSupportedValueType(getValueType(item)))
  .map(item => ({
    label: item.name || item.id,
    value: item.id,
    valueType: getValueType(item),
    kind,
    unit: getUnitName(item),
    inputCount: (item.inputs || item.input?.properties || []).length,
    outputCount: (item.outputs || item.output?.properties || []).length,
  }))
  .filter(item => Boolean(item.value))

export const getTermTypes = (valueType?: ThingModelValueType) => {
  const type = getValueTypeName(valueType)
  if (numberTypes.has(type) || isDateValueType(valueType)) return ['gt', 'gte', 'eq', 'lte', 'lt']
  if (type === 'string') return ['eq', 'neq', 'like', 'nlike']
  return ['eq', 'neq']
}

export const getValueOptions = (
  valueType: ThingModelValueType | undefined,
  booleanLabels: { true: string; false: string },
) => {
  const type = getValueTypeName(valueType)
  if (type === 'enum') {
    return (valueType?.elements || []).map(item => ({
      label: item.text || item.label || item.name || String(item.value ?? item.id ?? ''),
      value: item.value ?? item.id,
    }))
  }
  if (type === 'boolean' || type === 'bool') {
    return [
      { label: valueType?.falseText || booleanLabels.false, value: valueType?.falseValue ?? false },
      { label: valueType?.trueText || booleanLabels.true, value: valueType?.trueValue ?? true },
    ]
  }
  return undefined
}
