import type { MetricCalculatorDescriptor } from '../types'

export function calculatorIcon(item?: MetricCalculatorDescriptor): string {
  if (!item) return 'CalculatorOutlined'
  return item.icon
    || (Object.keys(item.configuration.inputTypes || {}).length ? 'CalculatorOutlined' : 'CodeOutlined')
}

export function calculatorOption(item: MetricCalculatorDescriptor, t: (key:string, values?:Record<string, unknown>) => string) {
  const description = item.description || (!Object.keys(item.configuration.inputTypes || {}).length ? t('algorithmYamlOptionHint') : '')
  const version = item.configuration.providerVersion
  return { label:item.name || item.id, icon:calculatorIcon(item), formula:item.documentation?.formula, symbols:item.documentation?.symbols, description:[description, version ? t('algorithmVersion', { version }) : ''].filter(Boolean).join(' · ') }
}
