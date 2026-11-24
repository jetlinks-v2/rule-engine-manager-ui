import type { MetricCalculatorSpec, MetricTemplate } from '../types'
import type { TemplateWindow } from './window'
import { expressionTokens } from './expressionTokens'
import { expressionText } from '@jetlinks-web-core/components/Expression/display'
import type { StructuredExpression } from '@jetlinks-web-core/components/Expression/types'

export type TemplateNodeKind = 'input' | 'rule' | 'output'
export interface TemplateNode { kind: TemplateNodeKind; index: number }
export interface TemplateRule extends Record<string, unknown> {
  id?: string
  name?: string
  dependsOn?: string[]
  sourceMetric?: string
  inputs?: { id?: string; metricId?: string; [key: string]: unknown }[]
  expression?: string
  expressionTree?:StructuredExpression
  applicabilityExpression?: string
  applicabilityTree?:StructuredExpression
  contextKeyExpression?:string
  contextKeyTree?:StructuredExpression
  maxInputSkew?: string
  type?: string
  aggregation?: string
  timeAggregation?: string
  window?: TemplateWindow
  qualityPolicy?: Record<string, unknown> & { expectedCount?: number }
  calculator?: MetricCalculatorSpec
  stateTracking?: { maxNoData: string }
  temporalCondition?: { enterExpression?: string; exitExpression?: string; enterTree?:StructuredExpression;exitTree?:StructuredExpression; dwell?: string; recovery?: string; maxNoData?: string; [key: string]: unknown }
}
export type RuleExpressionField='expression'|'applicabilityExpression'|'contextKeyExpression'|'enterExpression'|'exitExpression'
export function ruleExpression(rule:TemplateRule,field:RuleExpressionField='expression'):string {
  const tree=field === 'enterExpression' ? rule.temporalCondition?.enterTree : field === 'exitExpression' ? rule.temporalCondition?.exitTree
    : field === 'applicabilityExpression' ? rule.applicabilityTree : field === 'contextKeyExpression' ? rule.contextKeyTree : rule.expressionTree
  return tree ? expressionText(tree) : (field === 'enterExpression' || field === 'exitExpression' ? rule.temporalCondition?.[field] : rule[field]) || ''
}
export const nodeKey = (node: TemplateNode) => `${node.kind}-${node.index}`
export function nodeList(template: MetricTemplate): TemplateNode[] {
  return (['input', 'rule', 'output'] as const).flatMap(kind => {
    const items = kind === 'input' ? template.inputDefinitions : kind === 'rule' ? template.definitions : template.outputs
    return items.map((_, index) => ({ kind, index }))
  })
}
export function nodeLabel(template: MetricTemplate, node: TemplateNode): string {
  if (node.kind === 'input') { const item = template.inputDefinitions[node.index]; return item.name || item.id }
  if (node.kind === 'output') { const item = template.outputs[node.index]; return item.label || item.metricId }
  const rule = template.definitions[node.index] as TemplateRule
  return template.outputs.find(item => item.metricId === rule.id)?.label || rule.name || rule.id || ''
}
export function ruleDependencies(rule: TemplateRule): string[] {
  return [...new Set([...(rule.sourceMetric ? [rule.sourceMetric] : []), ...(rule.dependsOn || []), ...(rule.inputs || []).filter(item => !item.source).map(item => item.metricId).filter((id): id is string => !!id)])]
}

/** 窗口族的公开结果仍由同一个计算节点产生。 */
export function ruleMetricIds(rule:TemplateRule):string[] {
  const family = rule.windowFamily as {ranges?:{outputs?:{id:string}[]}[]} | undefined
  return [...(rule.id ? [rule.id] : []),...(family?.ranges || []).flatMap(range=>(range.outputs || []).map(output=>output.id))]
}

export const templateGraphLayout = { nodeWidth: 208, nodeHeight: 120, gap: 24, levelHeight: 176, headingHeight: 40 } as const

/** 分别追溯上游和下游，避免沿共享输入绕入无关分支；循环草稿也能终止。 */
export function relatedGraphEdges(edges: readonly { key:string; source:string; target:string }[], selected?: string): Set<string> {
  if (!selected) return new Set()
  const incoming = new Map<string, string[]>(), outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    if (!incoming.has(edge.target)) incoming.set(edge.target, [])
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, [])
    incoming.get(edge.target)!.push(edge.source)
    outgoing.get(edge.source)!.push(edge.target)
  }
  const related = new Set([selected])
  for (const direction of [incoming, outgoing]) {
    const visited = new Set<string>(), pending = [selected]
    while (pending.length) {
      const key = pending.pop()!
      if (visited.has(key)) continue
      visited.add(key); related.add(key)
      pending.push(...(direction.get(key) || []))
    }
  }
  return new Set(edges.filter(edge => related.has(edge.source) && related.has(edge.target)).map(edge => edge.key))
}

/** 上下布局只读取声明引用；层表示依赖深度，不能解释为经过的时间。 */
export function templateGraph(template: MetricTemplate, layout:{nodeWidth:number;nodeHeight:number;gap:number;levelHeight:number;headingHeight:number} = templateGraphLayout, visible?:ReadonlySet<string>) {
  const { nodeWidth, nodeHeight, gap, levelHeight, headingHeight } = layout
  const inputColumns = new Map(template.inputDefinitions.map(item => [item.id, 0]))
  const metricIdsByRule = template.definitions.map(rule=>ruleMetricIds(rule as TemplateRule))
  const ruleIds = new Set(metricIdsByRule.flat())
  const dependenciesByRule = template.definitions.map(rule => ruleDependencies(rule as TemplateRule))
  const pending = new Set(template.definitions.map((_, index) => index))
  const columns = new Map<number, number>()
  while (pending.size) {
    let progressed = false
    for (const index of pending) {
      const dependencies = dependenciesByRule[index]
      if (dependencies.some(id => !inputColumns.has(id) && ruleIds.has(id))) continue
      const column = Math.max(0, ...dependencies.map(id => inputColumns.get(id) || 0)) + 1
      columns.set(index, column)
      for (const id of metricIdsByRule[index]) inputColumns.set(id,column)
      pending.delete(index); progressed = true
    }
    if (!progressed) { for (const index of pending) columns.set(index, 1); break }
  }
  const lastColumn = Math.max(1, ...columns.values()) + 1
  const counts = new Map<number, number>()
  // 可见性只作用于布局，节点索引始终指向原模板，不能裁剪模板数组。
  const nodes = nodeList(template).filter(node => !visible || visible.has(nodeKey(node))).map(node => {
    const level = node.kind === 'input' ? 0 : node.kind === 'output' ? (inputColumns.get(template.outputs[node.index].metricId) ?? lastColumn - 1) + 1 : columns.get(node.index) || 1
    const slot = counts.get(level) || 0
    counts.set(level, slot + 1)
    return { ...node, key: nodeKey(node), label: nodeLabel(template, node), level, slot, x: 0, y: 0 }
  })
  const width = Math.max(1, ...counts.values()) * (nodeWidth + gap) + 8
  for (const node of nodes) node.x = (width - ((counts.get(node.level) || 1) * (nodeWidth + gap) - gap)) / 2 + node.slot * (nodeWidth + gap)
  nodes.sort((a, b) => a.level - b.level || a.slot - b.slot)
  const levels = [...counts.keys()].sort((a, b) => a - b).map((level, index) => {
    const peers = nodes.filter(node => node.level === level)
    const kinds = new Set(peers.map(node => node.kind))
    for (const node of peers) node.y = index * levelHeight + headingHeight
    return { level, y: index * levelHeight, kind: kinds.size === 1 ? [...kinds][0] : 'mixed' as const }
  })
  const sources = new Map<string, typeof nodes[number]>()
  for (const node of nodes) {
    const ids = node.kind === 'input' ? [template.inputDefinitions[node.index].id] : node.kind === 'rule' ? metricIdsByRule[node.index] : []
    for (const id of ids) sources.set(id,node)
  }
  const edges = nodes.flatMap(target => {
    const ids = target.kind === 'rule' ? ruleDependencies(template.definitions[target.index] as TemplateRule)
      : target.kind === 'output' ? [template.outputs[target.index].metricId] : []
    return ids.flatMap(id => {
      const candidate = sources.get(id)
      const source = candidate?.key === target.key ? nodes.find(node => node.kind === 'input' && template.inputDefinitions[node.index].id === id) : candidate
      if (!source) return []
      const x = source.x + nodeWidth / 2; const y = source.y + nodeHeight; const endX = target.x + nodeWidth / 2; const endY = target.y
      const middle = (y + endY) / 2
      return [{ key: `${source.key}:${target.key}`, source: source.key, target: target.key, path: `M${x},${y} C${x},${middle} ${endX},${middle} ${endX},${endY}` }]
    })
  })
  return { nodes, edges, levels, width, height: Math.max(1, levels.length) * levelHeight }
}

/** 仅替换已声明变量的显示名，保留原表达式，不另建计算语言。 */
export function expressionLabel(template: MetricTemplate, expression?: string, names?: ReadonlyMap<string, string>): string {
  const labels = new Map(template.inputDefinitions.map(item => [item.id.replace(/[^a-zA-Z0-9_]/g, '_'), item.name || item.id]))
  for (const rule of template.definitions as TemplateRule[]) if (rule.id && rule.name) labels.set(rule.id, rule.name)
  for (const output of template.outputs) labels.set(output.metricId, output.label || output.metricId)
  for (const [id, label] of names || []) labels.set(id.replace(/[^a-zA-Z0-9_]/g, '_'), label)
  const paths = [...(names?.keys() || [])].filter(key => /[.\[]/.test(key)).sort((a,b) => b.length - a.length)
    .map(key => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const tokens = paths.length ? new RegExp(`(?:#?(?:${paths.join('|')})(?![\\w$]))|${expressionTokens.source}`, 'g') : expressionTokens
  // 字符串字面量保持原样；只替换独立引用，不把对象的属性名当成输入别名。
  return (expression || '').replace(tokens,
    (token, legacy: string, property: string, key: string, offset: number, source: string) => {
      if (token.startsWith("'") || token.startsWith('"') || source[offset - 1] === '.') return token
      if (names?.has(token.replace(/^#/, ''))) return names.get(token.replace(/^#/, ''))!
      const parameter = legacy ?? property ?? key?.replaceAll("''", "'")
      if (parameter !== undefined) return names?.get(`params.${parameter}`) || template.parameterDefinitions.find(item => item.id === parameter)?.name || token
      return labels.get(token.replace(/^#/, '')) || token
    })
}

export function nextNodeId(template: MetricTemplate, prefix: string): string {
  const ids = new Set([...template.inputDefinitions.map(item => item.id), ...template.definitions.map(item => item.id)])
  let sequence = 1
  while (ids.has(`${prefix}${sequence}`)) sequence++
  return `${prefix}${sequence}`
}
