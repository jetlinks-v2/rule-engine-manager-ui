export type SummaryPart = { text: string; title?: string; field?: boolean }
export type SummaryTranslate = (key: string, params?: Record<string, unknown>) => string

/** 只格式化可读值；保留 0 和 false，不把引用对象显示成 [object Object]。 */
export function summaryText(value: unknown): string {
  if (Array.isArray(value)) return value.map(summaryText).filter(Boolean).join('、')
  if (value === undefined || value === null) return ''
  if (typeof value === 'object') {
    const item = value as Record<string, unknown>
    return summaryText(item.fullName ?? item.label ?? item.text ?? item.name ?? item.value)
  }
  return String(value)
}
export const summaryPlainText = (value: unknown): SummaryPart => ({ text: summaryText(value) })
export const summaryField = (value: unknown, title?: string): SummaryPart => ({ text: summaryText(value), title, field: true })
export const validSummaryParts = (parts: SummaryPart[]) => parts.filter(part => part.text !== '')
export const summaryPartsText = (parts: SummaryPart[]) => parts.map(part => part.text).join('')

/** 由本地化模板决定语序；复合参数可复用已有片段，保留范围连接词及完整名称提示。 */
export function localizedSummaryParts(t: SummaryTranslate, key: string, values: Record<string, unknown>, replacements: Record<string, SummaryPart[]> = {}): SummaryPart[] {
  const names = Object.keys(values)
  const markers = Object.fromEntries(names.map((name, index) => [name, `__scene_field_${index}__`]))
  const fields = Object.fromEntries(names.map(name => [markers[name], replacements[name] || [summaryField(values[name])]]))
  return validSummaryParts(t(key, markers).split(/(__scene_field_\d+__)/g).flatMap(text =>
    Object.prototype.hasOwnProperty.call(fields, text) ? fields[text] : [summaryPlainText(text)]))
}
