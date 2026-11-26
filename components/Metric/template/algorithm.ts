import type { MetricCalculatorDescriptor, MetricCalculatorSpec, MetricParameter, MetricTemplate } from '../types'
import type { TemplateRule } from './designer'
import { ruleDataReferences } from './formula'
import { copy } from '../service'
import { metricSourceMatchesType } from '../sourceSchema'
import { encodeConfiguration } from './configurationText'
import { calculatorInputParameters, calculatorInputsMatch } from '../calculatorDescriptor'
import { resolveMetricResultType } from './resultTypes'
export { findCalculator } from '../calculatorDescriptor'
export { calculatorInputParameters } from '../calculatorDescriptor'

export const calculatorKey = (item: MetricCalculatorDescriptor) => JSON.stringify([item.configuration.provider, item.configuration.providerVersion, item.id])
export function interactiveCalculator(spec: MetricCalculatorSpec | undefined, descriptor?: MetricCalculatorDescriptor) {
  return !!spec && !!descriptor && !!Object.keys(descriptor.configuration.inputTypes || {}).length && calculatorInputsMatch(spec, descriptor)
}
export function algorithmSources(template: MetricTemplate, rule: TemplateRule) {
  return ruleDataReferences(template, rule).map(item => {
    const input = template.inputDefinitions.find(input => input.id === item.id)
    return { ...item, valueType: resolveMetricResultType(template,item.id).schema, lookback: input?.source?.lookback }
  })
}
/** 来源候选和算法切换共用角色类型；空元素类型表示由来源声明实际类型。 */
export function algorithmSourceMatches(spec:MetricCalculatorSpec, alias:string, actual:Record<string,unknown> | undefined, descriptor?:MetricCalculatorDescriptor):boolean {
  if (!actual?.type) return false
  const parameter = calculatorInputParameters(descriptor).find(parameter => (spec.parameters?.[parameter.id] || parameter.id) === alias)
  const required = parameter?.expands?.inputType as Record<string,unknown> | undefined || descriptor?.configuration.inputTypes?.[alias] || spec.inputTypes?.[alias]
  // 数组角色声明观测序列；来源类型始终描述一次观测，不能再拆掉来源自身的数组。
  const expected = required?.type === 'array' ? required.elementType as Record<string,unknown> | undefined : required
  return !!descriptor?.parameterDefinitions.some(parameter => parameter.expands?.typeFromInput === alias)
    || metricSourceMatchesType(expected,actual)
}
/** 优先保留同名输入；只迁移类型对应唯一的角色，不按位置猜测多输入的用途。 */
export function chooseAlgorithm(rule: TemplateRule, item: MetricCalculatorDescriptor, sources: {id:string;valueType?:Record<string,unknown>}[] = []): Partial<TemplateRule> {
  const calculator = copy(item.configuration)
  // 同一可选输入角色跨算法保留，不要求调用方约定特定别名。
  for (const parameter of calculatorInputParameters(item)) {
    const alias = rule.calculator?.parameters?.[parameter.id]
    const inputType = typeof alias === 'string' ? rule.calculator?.inputTypes?.[alias] : undefined
    if (inputType && typeof alias === 'string' && !calculator.inputTypes?.[alias]) {
      calculator.inputTypes = { ...calculator.inputTypes, [alias]:copy(inputType) }
      calculator.parameters = { ...calculator.parameters, [parameter.id]:alias }
    }
  }
  type Binding = NonNullable<TemplateRule['inputs']>[number]
  const references = rule.sourceMetric ? [rule.sourceMetric] : [...new Set(rule.dependsOn || [])]
  const declared = rule.calculator?.inputTypes
  const controls = declared ? (rule.inputs || []).filter(input => !Object.hasOwn(declared,input.id || '')) : []
  const bindings = (rule.inputs || []).filter(input => (input.metricId || input.source) && !controls.includes(input))
  const previous:Binding[] = bindings.length ? bindings : references
    .filter(metricId => !controls.some(input => input.metricId === metricId))
    .map(metricId => ({id:metricId,metricId}))
  const aliases = Object.keys(calculator.inputTypes || {})
  const sourceType = (input:Binding) => {
    const actual = sources.find(source => source.id === input.metricId)?.valueType
    const previous = rule.calculator?.inputTypes?.[input.id || '']
    return actual || (previous?.type === 'array' ? previous.elementType as Record<string,unknown> | undefined : previous)
  }
  const compatible = (input:Binding, alias:string) => {
    const actual = sourceType(input)
    return !actual?.type || algorithmSourceMatches(calculator,alias,actual,item)
  }
  const assigned = new Map<string,Binding>()
  for (const alias of aliases) {
    const input = previous.find(input => input.id === alias && (input.metricId || input.source))
    if (input && compatible(input,alias)) assigned.set(alias,input)
  }
  const remaining = aliases.filter(alias => !assigned.has(alias))
  const used = new Set(assigned.values())
  const unused = previous.filter(input => (input.metricId || input.source) && !used.has(input))
  // 只迁移双方唯一对应的角色；这些匹配相互独立，无需循环消解歧义。
  for (const alias of remaining) {
    const candidates = unused.filter(input => compatible(input,alias))
    if (candidates.length === 1 && remaining.filter(role => compatible(candidates[0],role)).length === 1) {
      assigned.set(alias,candidates[0])
    }
  }
  const inputs = [...assigned].map(([id,input]) => {
    setAlgorithmInputType(calculator,id,sourceType(input),item)
    return {...copy(input),id}
  })
  return { calculator, inputs:[...inputs,...copy(controls)], sourceMetric: undefined }
}
/** 关联来源只修改当前别名，不重写其他节点的历史取数范围。 */
export function bindAlgorithmInput(rule: TemplateRule, alias: string, metricId: string, valueType?: Record<string, unknown>, descriptor?: MetricCalculatorDescriptor): Partial<TemplateRule> {
  const calculator = copy(rule.calculator || {})
  const previous = rule.inputs?.find(input => input.id === alias)
  const inputs = (rule.inputs || []).filter(input => input.id !== alias)
  if (metricId) inputs.push({ ...previous, id: alias, metricId, source: undefined })
  const parameter = calculatorInputParameters(descriptor).find(parameter => (calculator.parameters?.[parameter.id] || parameter.id) === alias)
  if (parameter) {
    calculator.parameters = { ...calculator.parameters }
    calculator.inputTypes = { ...calculator.inputTypes }
    if (metricId) {
      calculator.parameters[parameter.id] = alias
      calculator.inputTypes[alias] ||= copy(parameter.expands!.inputType as Record<string,unknown>)
    } else {
      delete calculator.parameters[parameter.id]
      delete calculator.inputTypes[alias]
    }
  }
  setAlgorithmInputType(calculator,alias,valueType,descriptor)
  return { calculator, inputs }
}
/** 显式绑定和算法切换共用类型投影及依赖输入类型的参数处理。 */
function setAlgorithmInputType(calculator:MetricCalculatorSpec, alias:string, valueType?:Record<string,unknown>, descriptor?:MetricCalculatorDescriptor) {
  if (valueType && calculator.inputTypes?.[alias]) {
    const expected = calculator.inputTypes[alias]
    calculator.inputTypes[alias] = expected.type === 'array'
      ? { ...expected, elementType: copy(valueType) } : copy(valueType)
    // 输入类型改变后，不能把旧数字悄悄显示为一个布尔开关值。要求用户明确选定新的状态含义。
    if (valueType.type === 'boolean') {
      calculator.parameters = { ...calculator.parameters }
      for (const parameter of descriptor?.parameterDefinitions || []) {
        if (parameter.expands?.typeFromInput === alias && typeof calculator.parameters[parameter.id] !== 'boolean') delete calculator.parameters[parameter.id]
      }
    }
  }
}
export function algorithmParameter(parameter: MetricParameter, spec: MetricCalculatorSpec): MetricParameter {
  const alias = parameter.expands?.typeFromInput
  const input = typeof alias === 'string' ? spec.inputTypes?.[alias] : undefined
  const valueType = input?.type === 'array' ? input.elementType : input
  return valueType && typeof valueType === 'object' && !Array.isArray(valueType)
    ? { ...parameter, valueType: valueType as MetricParameter['valueType'] } : parameter
}
export function visibleAlgorithmParameters(descriptor: MetricCalculatorDescriptor | undefined, spec: MetricCalculatorSpec, advanced: boolean) {
  return (descriptor?.parameterDefinitions || []).filter(parameter => {
    if (parameter.expands?.inputType) return false
    if (!!parameter.expands?.advanced !== advanced) return false
    const condition = parameter.expands?.visibleWhen
    return !condition || typeof condition !== 'object' || Object.entries(condition).every(([key, value]) => spec.parameters?.[key] === value)
  }).map(parameter => algorithmParameter(parameter, spec))
}
/** 编辑与图例共用默认值来源；依赖输入类型的状态值必须由用户明确填写。 */
export function algorithmParameterValue(parameter: MetricParameter, spec: MetricCalculatorSpec, descriptor?: MetricCalculatorDescriptor): unknown {
  const inherited = parameter.expands?.typeFromInput ? undefined : descriptor?.configuration.parameters?.[parameter.id] ?? parameter.expands?.defaultValue
  return Object.hasOwn(spec.parameters || {},parameter.id) ? spec.parameters![parameter.id] : inherited
}
/** 输出沿用实际类型；已有声明没有展示名称时只借用描述名称，不修改执行类型。 */
export function algorithmOutputFields(spec: MetricCalculatorSpec, descriptor?: MetricCalculatorDescriptor) {
  const properties = spec.outputType?.properties
  if (!Array.isArray(properties)) return []
  const defaults = descriptor?.configuration.outputType?.properties
  return properties.map((property: MetricParameter) => ({ ...property,
    name: property.name || (Array.isArray(defaults) ? defaults.find(item => item.id === property.id)?.name : undefined) || property.id }))
}

export interface AlgorithmSuggestion { label: string; detail?: string; insertText: string }
/** 轻量 YAML 键/值建议。只分析光标之前的缩进，不维护第二套算法语义校验器。 */
export function algorithmSuggestions(prefix: string, spec: MetricCalculatorSpec, descriptor: MetricCalculatorDescriptor | undefined, descriptors: MetricCalculatorDescriptor[]): AlgorithmSuggestion[] {
  const lines = prefix.split('\n')
  const current = lines.pop() || ''
  const stack: { key: string; indent: number }[] = []
  const indent = current.search(/\S|$/)
  for (const line of lines) {
    const match = line.match(/^( *)([\w-]+):\s*(?:#.*)?$/)
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    const level = line.search(/\S/)
    while (stack.length && stack.at(-1)!.indent >= level) stack.pop()
    if (match) stack.push({ key: match[2], indent: match[1].length })
  }
  while (stack.length && stack.at(-1)!.indent >= indent) stack.pop()
  const path = stack.map(item => item.key).join('.')
  const entry = current.trimStart().match(/^([\w-]+):\s*([^#]*)$/)
  const values = (items: { value: unknown; text?: string }[]) => items
    .filter((item,index) => items.findIndex(other => Object.is(other.value,item.value)) === index)
    .map(item => ({ label: String(item.value), detail: item.text,
    insertText: encodeConfiguration(item.value, 'yaml').trim() }))
  if (entry) {
    if (!path && entry[1] === 'provider') return values([...new Set(descriptors.map(item => item.configuration.provider).filter(Boolean))].map(value => ({ value })))
    if (!path && entry[1] === 'providerVersion') return values([...new Set(descriptors.filter(item => item.configuration.provider === spec.provider).map(item => item.configuration.providerVersion))].map(value => ({ value })))
    if (path === 'parameters') {
      const parameter = descriptor?.parameterDefinitions.find(item => item.id === entry[1])
      const elements = parameter?.valueType?.elements
      if (Array.isArray(elements)) return values(elements)
      if (parameter?.expands?.editor === 'duration') return values(['PT1M', 'PT5M', 'PT1H'].map(value => ({ value })))
      if (entry[1] === 'operation') return values(descriptors.filter(item => item.configuration.provider === spec.provider && item.configuration.providerVersion === spec.providerVersion)
        .flatMap(item => item.configuration.parameters?.operation ? [{ value: item.configuration.parameters.operation, text: item.name }] : []))
    }
    return []
  }
  const keys = path === 'parameters'
    ? [...new Set([...Object.keys(spec.parameters || {}), ...(descriptor?.parameterDefinitions || []).map(item => item.id)])]
    : !path ? ['provider', 'providerVersion', 'modelVersion', 'inputTypes', 'outputType', 'outputUnit', 'parameters', 'predictionHorizon'] : []
  return keys.map(key => {
    const parameter = descriptor?.parameterDefinitions.find(item => item.id === key)
    const value = path === 'parameters' ? spec.parameters?.[key] ?? descriptor?.configuration.parameters?.[key] : spec[key]
    const encoded = value === undefined ? '' : encodeConfiguration(value, 'yaml').trimEnd()
    const serialized = encoded.includes('\n') ? `\n${encoded.split('\n').map(line => ' '.repeat(indent + 2) + line).join('\n')}` : ` ${encoded}`
    return { label: key, detail: parameter?.name, insertText: `${key}:${serialized}` }
  })
}
