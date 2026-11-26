import { localizedSummaryParts, summaryField, summaryPlainText, summaryText, validSummaryParts, type SummaryPart, type SummaryTranslate } from '../summaryParts'

type PreviewRecord = Record<string, unknown>
export type PreviewColumn = {
  fullName?: string; name?: string; label?: string; dataType?: string
  termTypes?: Array<{ id?: string; name?: string }>
  options?: unknown; others?: unknown; metrics?: unknown[]
}
export type PreviewColumns = Record<string, string | PreviewColumn>
type ConditionContext = { columns?: PreviewColumns; options?: unknown }
const record = (value: unknown): PreviewRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as PreviewRecord : {}
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const firstText = (...values: unknown[]) => values.map(summaryText).find(Boolean) || ''

/** 手动值保留 0/false；枚举和布尔值优先使用编辑器已有名称，不重新维护状态映射。 */
function valueLabel(value: unknown, column: PreviewColumn): string {
  const option = list(column.options).map(record).find(item => String(item.id ?? item.value) === String(value))
  if (option) return firstText(option.name, option.text, option.label, value)
  const bool = record(record(column.options || column.others).bool)
  if (Object.keys(bool).length) {
    if (String(value) === String(bool.trueValue)) return firstText(bool.trueText, value)
    if (String(value) === String(bool.falseValue)) return firstText(bool.falseText, value)
  }
  return summaryText(value)
}

/** 叶子字段与参数沿用通知摘要的字段标签；无法解析的引用只给可读提示，不暴露内部路径。 */
function termParts(term: PreviewRecord, display: unknown, t: SummaryTranslate, columns: PreviewColumns): SummaryPart[] {
  const options = record(term.options)
  const cached = Array.isArray(display) ? display : list(term.options)
  const columnInfo = columns[String(term.column)]
  const column = typeof columnInfo === 'string' ? { name: columnInfo } : columnInfo || {}
  const name = firstText(column.fullName, column.name, column.label, options.fullName, options.name, options.label, cached[0]) || t('IotSceneLinkage.node.unresolvedParameter')
  const termType = String(term.termType || '')
  const operatorKey = `IotSceneLinkage.term.${termType}`
  const translated = t(operatorKey)
  const operator = firstText(column.termTypes?.find(item => item.id === termType)?.name, translated === operatorKey ? '' : translated, cached[1] === termType ? '' : cached[1]) || t('IotSceneLinkage.node.conditionMatch')
  const parts = [summaryField(name), summaryPlainText(` ${operator} `)]
  if (['isnull', 'notnull'].includes(termType)) return parts
  if (termType === 'complex_exists') return [...parts, summaryField(t('IotSceneLinkage.node.arrayCondition'))]

  const raw = record(term.value)
  const source = raw.source
  const cachedValue = record(cached[2])
  const savedLabel = Object.keys(cachedValue).length ? Object.values(cachedValue).map(summaryText).filter(Boolean).join('、') : summaryText(cached[2])
  const reference = source && !['fixed', 'manual'].includes(String(source))
  if (reference) {
    const metric = list(column.metrics).map(record).find(item => String(item.id) === String(raw.metric))
    const referenceInfo = columns[String(record(raw.value).column ?? raw.value)]
    const referenceName = typeof referenceInfo === 'string' ? referenceInfo : firstText(referenceInfo?.fullName, referenceInfo?.name, referenceInfo?.label)
    const label = firstText(raw.fullName, raw.label, record(raw.value).fullName, record(raw.value).name, referenceName, metric?.name, record(raw.metric).name, record(raw.metric).label, savedLabel) || t('IotSceneLinkage.node.variableValue')
    return [...parts, summaryField(label)]
  }
  const value = 'source' in raw || 'value' in raw ? raw.value : term.value
  const values = Array.isArray(value) ? value : [value]
  // 列表和范围逐项使用缓存名称，范围端点保留分隔符，避免被误读为离散取值。
  if (savedLabel && !Array.isArray(value)) return [...parts, summaryField(savedLabel)]
  const separator = ['btw', 'nbtw'].includes(termType) ? ' ～ ' : '、'
  const savedValues = Object.values(cachedValue).flatMap(item => Array.isArray(item) ? item : [item])
  return validSummaryParts([...parts, ...values.flatMap((item, index) => [
    ...(index ? [summaryPlainText(separator)] : []),
    summaryField(firstText(savedValues[index], valueLabel(item, column)) || t(item === '' ? 'IotSceneLinkage.node.emptyString' : 'IotSceneLinkage.detail.previewUnconfigured')),
  ])])
}

/** type 连接前一个同级节点；括号保留嵌套分组，不能用父分组的 type 改写组内关系。 */
export function detailedConditionSummaryParts(conditions: unknown, t: SummaryTranslate, context: ConditionContext = {}): SummaryPart[] {
  const renderSequence = (items: unknown, displayItems: unknown): SummaryPart[] => {
    const rendered = list(items).map((item, index) => {
      const term = record(item)
      const display = list(displayItems)[index]
      if (term.column) return { type: term.type, parts: termParts(term, display, t, context.columns || {}) }
      const parts = renderSequence(term.terms, record(display).terms)
      return { type: term.type, parts: parts.length ? [summaryPlainText('（'), ...parts, summaryPlainText('）')] : [] }
    }).filter(item => item.parts.length)
    return rendered.flatMap((item, index) => [
      ...(index ? [summaryPlainText(` ${t(item.type === 'or' ? 'IotSceneLinkage.rule.or' : 'IotSceneLinkage.rule.and')} `)] : []),
      ...item.parts,
    ])
  }
  return renderSequence(conditions, record(context.options).terms || context.options)
}

/** 详细防抖按原生配置描述阈值、输出时机与周期，不能套用快速模式的最小间隔文案。 */
export function detailedDebounceSummaryParts(value: unknown, t: SummaryTranslate): SummaryPart[] {
  const limit = record(value)
  if (!limit.enabled) return []
  return localizedSummaryParts(t, 'IotSceneLinkage.node.detailedDebounce', {
    time: limit.time ?? t('IotSceneLinkage.detail.previewUnconfigured'),
    mode: t(limit.continuous ? 'ShakeLimit.index.9093426-15' : 'ShakeLimit.index.9093426-16'),
    threshold: limit.threshold ?? t('IotSceneLinkage.detail.previewUnconfigured'),
    timing: t(limit.alarmFirst ? 'ShakeLimit.index.9093426-13' : 'ShakeLimit.index.9093426-14'),
    output: t(limit.outputFirst ? 'ShakeLimit.index.9093426-17' : 'ShakeLimit.index.9093426-18'),
    cycle: t(limit.rolling ? 'ShakeLimit.index.9093426-19' : 'ShakeLimit.index.9093426-20'),
  })
}
