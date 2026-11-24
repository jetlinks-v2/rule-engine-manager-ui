import type { MetricTemplate } from '../types'

/** 下拉只投影已有来源信息，不改变引用编码或计算依赖。 */
export function referenceChoice(template: MetricTemplate, item: { id:string; label:string }, t: (key:string) => string) {
  const input = template.inputDefinitions.find(input => input.id === item.id)
  return { value:item.id, label:item.label, icon:input ? 'DatabaseOutlined' : 'FunctionOutlined',
    description:`${t(input ? 'inputReferenceHint' : 'calculationReferenceHint')} · ${item.id}` }
}
