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

  if (firstName) return count > 1 ? t('IotSceneLinkage.scope.fixedSummaryMore', { name: firstName, count }) : t('IotSceneLinkage.scope.fixedSummary', { name: firstName })
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
