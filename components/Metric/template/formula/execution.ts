import { parseDisplayExpression, type FormulaNode, type FormulaReference } from '../formula'
import { displayReferences } from './semantic'
import {ruleExpression,type TemplateRule} from '../designer'
import type { MetricCalculatorDescriptor, MetricSnapshotValue, MetricTemplate, MetricValue } from '../../types'
import type { ValueTranslate } from '../../valueSemantics'

/** 只代入本步冻结叶子；不执行表达式、不选择分支，也不把窗口最后样本当作聚合输入。 */
export interface ExecutionFormula { text:string; branches?:{condition?:string;value:string}[] }
export function executionFormula(template:MetricTemplate,rule:TemplateRule,value:MetricValue,calculators:MetricCalculatorDescriptor[],t:ValueTranslate):ExecutionFormula | undefined {
  const expression=ruleExpression(rule)
  if (!expression || rule.aggregation || rule.timeAggregation || rule.windowFamily || rule.calculator || rule.temporalCondition) return undefined
  const references = displayReferences(template,rule,calculators,t)
  const tree = parseDisplayExpression(expression,references)
  if (!tree) return undefined
  const leaves = value.evidence?.execution?.values || []
  const pointer = (path:string[])=>path.map(key=>`/${key.replaceAll('~','~0').replaceAll('/','~1')}`).join('')
  function recorded(ref:FormulaReference):MetricSnapshotValue | undefined {
    if (ref.group === 'parameter') return leaves.find(item=>item.kind === 'parameter' && item.id === ref.key.slice('parameter:'.length) && !item.path)
    const alias = ref.key.startsWith('source:') ? ref.key.slice('source:'.length)
      : rule.inputs?.find(input=>!input.source && input.metricId === ref.metricId)?.id || ref.metricId
    const path = ref.referenceId === 'metricValues' ? pointer((ref.path || []).slice(1)) : ref.semantic === 'stateDuration' ? '/state/duration' : `/value${pointer(ref.path || [])}`
    return leaves.find(item=>item.kind === 'input' && item.id === alias && item.path === path)
  }
  function scalar(ref:FormulaReference):string {
    const leaf = recorded(ref)
    if (!leaf && ref.group === 'data' && !ref.path?.length && !ref.semantic) {
      const alias = ref.key.startsWith('source:') ? ref.key.slice('source:'.length) : rule.inputs?.find(input=>!input.source && input.metricId === ref.metricId)?.id || ref.metricId
      const fields = leaves.filter(item=>item.kind === 'input' && item.id === alias && item.path.startsWith('/value/'))
      if (fields.length) return t('executionRecordedObject',{name:ref.label,count:fields.length})
    }
    if (!leaf || !['available','defaulted'].includes(leaf.state) || ['unavailable','omitted'].includes(leaf.type)) return t('executionMissingValue',{name:ref.label})
    if (leaf.type === 'null') return 'null'
    if (leaf.type === 'string') return JSON.stringify(leaf.value ?? '')
    if (leaf.type === 'boolean') return leaf.value === 'true' ? 'true' : 'false'
    // 保留后端十进制文本，不能经Number损失大整数精度或按显示精度截断。
    return leaf.value ?? t('executionMissingValue',{name:ref.label})
  }
  function text(node:FormulaNode):string {
    switch (node.kind) {
      case 'number': return node.value
      case 'literal': return JSON.stringify(node.value)
      case 'reference': return scalar(node.reference)
      case 'unary': return `${node.operator}(${text(node.value)})`
      case 'binary': return `(${text(node.left)} ${{'*':'×','/':'÷'}[node.operator] || node.operator} ${text(node.right)})`
      case 'function': return `${node.name}(${node.args.map(text).join(', ')})`
      case 'conditional': return `${text(node.condition)} ? ${text(node.yes)} : ${text(node.no)}`
    }
  }
  if (tree.kind !== 'conditional') return {text:text(tree)}
  const branches:NonNullable<ExecutionFormula['branches']> = []
  let branch = tree
  while (branch.kind === 'conditional') {
    branches.push({condition:text(branch.condition),value:text(branch.yes)})
    if (branch.no.kind !== 'conditional') { branches.push({value:text(branch.no)}); break }
    branch = branch.no
  }
  return {text:text(tree),branches}
}
