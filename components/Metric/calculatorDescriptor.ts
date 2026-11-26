import type { MetricCalculatorDescriptor, MetricCalculatorSpec } from './types'

/** 参数可通过 inputType 声明可选输入；实际别名仍保存在执行配置中。 */
export function calculatorInputParameters(descriptor?: MetricCalculatorDescriptor) {
  return (descriptor?.parameterDefinitions || []).filter(parameter => parameter.expands?.inputType)
}
export function calculatorInputsMatch(spec: MetricCalculatorSpec, descriptor: MetricCalculatorDescriptor) {
  const required = Object.keys(descriptor.configuration.inputTypes || {})
  const optional = calculatorInputParameters(descriptor).map(parameter => spec.parameters?.[parameter.id]).filter(value => typeof value === 'string')
  return required.every(alias => Object.hasOwn(spec.inputTypes || {}, alias))
    && optional.every(alias => Object.hasOwn(spec.inputTypes || {}, alias))
    && Object.keys(spec.inputTypes || {}).every(alias => required.includes(alias) || optional.includes(alias))
}

/** 同一操作可以有不同输入角色；遇到多个声明时按实际角色匹配，不能借用另一变体的编辑字段。 */
export function findCalculator(spec: MetricCalculatorSpec | undefined, items: MetricCalculatorDescriptor[]) {
  const candidates = items.filter(item => item.configuration.provider === spec?.provider
    && item.configuration.providerVersion === spec?.providerVersion
    && item.configuration.parameters?.operation === spec?.parameters?.operation)
  if (candidates.length < 2) return candidates[0]
  const matching = candidates.filter(item => calculatorInputsMatch(spec || {}, item))
  return matching.length === 1 ? matching[0] : undefined
}
