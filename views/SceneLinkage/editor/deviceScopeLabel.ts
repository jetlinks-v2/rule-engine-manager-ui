import { localizedSummaryParts, summaryField, summaryPlainText, type SummaryPart } from './summaryParts'

export type SceneDeviceScopeSelector = 'fixed' | 'space' | 'device-group' | 'all'

export interface SceneDeviceScopeValue {
  selector?: SceneDeviceScopeSelector
  selectorValues?: Array<{ value: string; name?: string }>
  options?: { names?: string[] }
}

type Translate = (key: string, params?: Record<string, unknown>) => string

const dynamicSelectors = new Set<SceneDeviceScopeSelector>(['space', 'device-group'])

const scopeNames = (scope: SceneDeviceScopeValue) => {
  const names = scope.selectorValues?.map((item, index) => item.name || scope.options?.names?.[index] || item.value).filter(Boolean) || []
  return [...new Set(names)]
}

export const toTriggerScopeValue = (source: {
  allDevices?: boolean
  dynamicScope?: boolean
  dynamicScopeType?: 'space' | 'device-group'
  groupIds?: string[]
  deviceIds?: string[]
  scopeOptions?: { names?: string[] }
}): SceneDeviceScopeValue => {
  const selector: SceneDeviceScopeSelector = source.allDevices
    ? 'all'
    : source.dynamicScope
      ? source.dynamicScopeType || 'device-group'
      : 'fixed'
  const values = dynamicSelectors.has(selector)
    ? source.groupIds || []
    : source.deviceIds || []
  return {
    selector,
    selectorValues: values.map((value, index) => ({ value, name: source.scopeOptions?.names?.[index] })),
    options: source.scopeOptions,
  }
}

export const formatDeviceScopeText = (
  t: Translate,
  scope: SceneDeviceScopeValue,
  options: { emptyText?: string } = {},
) => {
  const selector = scope.selector || 'fixed'
  if (selector === 'all') return t('IotSceneLinkage.scope.all')

  const names = scopeNames(scope)
  const count = scope.selectorValues?.length || names.length
  if (!count) return options.emptyText || ''

  const firstName = names[0]
  if (selector === 'space') {
    if (firstName) return count > 1 ? t('IotSceneLinkage.scope.areaGroupMore', { name: firstName, count }) : t('IotSceneLinkage.scope.areaGroup', { name: firstName })
    return t('IotSceneLinkage.scope.areaGroupCount', { count })
  }

  if (selector === 'device-group') {
    if (firstName) return count > 1 ? t('IotSceneLinkage.scope.deviceGroupMore', { name: firstName, count }) : t('IotSceneLinkage.scope.deviceGroup', { name: firstName })
    return t('IotSceneLinkage.scope.deviceGroupCount', { count })
  }

  return t('IotSceneLinkage.scope.fixedCount', { count })
}

export const formatDeviceScopeTitle = (
  t: Translate,
  scope: SceneDeviceScopeValue,
  options: { emptyText?: string } = {},
) => {
  const selector = scope.selector || 'fixed'
  if (selector === 'all') return t('IotSceneLinkage.scope.all')

  const names = scopeNames(scope)
  if (!names.length) return formatDeviceScopeText(t, scope, options)

  const joinedNames = names.join(t('IotSceneLinkage.scope.nameSeparator'))
  if (selector === 'space') return t('IotSceneLinkage.scope.areaGroupFull', { names: joinedNames })
  if (selector === 'device-group') return t('IotSceneLinkage.scope.deviceGroupFull', { names: joinedNames })
  return t('IotSceneLinkage.scope.fixedSummaryFull', { names: joinedNames })
}

export const formatProductScopeText = (t: Translate, product: string, scopeText: string) => (
  product && scopeText ? t('IotSceneLinkage.summary.productWithScope', { product, scope: scopeText }) : product
)

/** 概览最多显示前三个名称及 30 个字符，完整选择仅留在提示中，不裁剪运行配置。 */
export function scopeNamesSummary(names: string[]): SummaryPart {
  const unique = [...new Set(names.filter(Boolean))]
  const full = unique.join('、')
  const visible = Array.from(unique.slice(0, 3).join('、'))
  const text = visible.slice(0, 30).join('') + (unique.length > 3 || visible.length > 30 ? '…' : '')
  return summaryField(text, full)
}

/** 范围名称和产品分别标注，连接词保持普通文字；不使用旧 options.name 的范围汇总文案。 */
export function deviceScopeSummaryParts(t: Translate, scope: Omit<SceneDeviceScopeValue, 'selector'> & { selector?: string }, product: string, fallback: string | string[] = ''): SummaryPart[] {
  const fixed = !scope.selector || scope.selector === 'fixed'
  const values = scope.selectorValues || []
  const savedNames = values.map((item, index) => item.name || scope.options?.names?.[index])
  const fallbackNames = (Array.isArray(fallback) ? fallback : [fallback]).filter(Boolean)
  // 旧固定设备只保存展示名称时优先使用缓存，避免回显退化为设备 ID。
  const names = savedNames.some(Boolean) ? savedNames.map((name, index) => name || values[index].value)
    : scope.options?.names?.length ? scope.options.names : fixed && fallbackNames.length ? fallbackNames : values.map(item => item.value)
  if (fixed) return [scopeNamesSummary(names.length ? names : [product || t('IotSceneLinkage.detail.previewUnconfigured')])]
  const productName = product || t('IotSceneLinkage.detail.previewUnconfigured')
  if (scope.selector === 'all') return localizedSummaryParts(t, 'IotSceneLinkage.node.allProductTarget', { product: productName })
  return localizedSummaryParts(t, 'IotSceneLinkage.node.scopedProductTarget', { scope: '', product: productName }, { scope: [names.length ? scopeNamesSummary(names) : summaryPlainText(t('IotSceneLinkage.detail.previewUnconfigured'))] })
}
