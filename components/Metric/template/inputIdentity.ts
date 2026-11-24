import { copy } from '../service'
import { ruleDependencies, type TemplateRule } from './designer'
import type { MetricTemplate } from '../types'
import type { ExpressionNode, StructuredExpression } from '@jetlinks-web-core/components/Expression/types'

const alias = (id:string) => id.replace(/[^a-zA-Z0-9_]/g, '_')

/** 参考标识与输入、计算及其表达式别名共同避重。 */
export function referenceInputId(template:MetricTemplate,index:number,suggested:string):string {
  const base = suggested.trim()
  if (!base) return template.inputDefinitions[index].id
  const used = new Set([...template.inputDefinitions.filter((_,i)=>i !== index),...template.definitions].map(item=>alias(String(item.id))))
  let next = base, suffix = 2
  while (used.has(alias(next))) next = `${base}${suffix++}`
  return inputIdentityIssue(template,index,next) ? template.inputDefinitions[index].id : next
}

/** 身份校验只保护命名冲突和无法安全改写的脚本；业务名称可独立修改。 */
export function inputIdentityIssue(template:MetricTemplate, index:number, next:string):string | undefined {
  const previous = template.inputDefinitions[index].id
  if (next === previous) return
  if (!next.trim()) return 'inputIdRequired'
  if ([...template.inputDefinitions.filter((_,i)=>i !== index), ...template.definitions].some(item=>item.id === next || alias(String(item.id)) === alias(next))) return 'inputIdDuplicate'
  for (const item of template.definitions as TemplateRule[]) {
    if (!ruleDependencies(item).includes(previous) || item.inputs?.some(input=>!input.source && input.metricId === previous)) continue
    // 显式别名保持不变；隐式脚本无法区分局部变量、字符串和动态访问，不做文本替换。
    if ([!item.expressionTree && item.expression,!item.applicabilityTree && item.applicabilityExpression,!item.contextKeyTree && item.contextKeyExpression,
      !item.temporalCondition?.enterTree && item.temporalCondition?.enterExpression,!item.temporalCondition?.exitTree && item.temporalCondition?.exitExpression].some(value=>typeof value === 'string' && value.trim())) return 'inputIdScript'
  }
}

function renameTree(tree:StructuredExpression | undefined, previous:string, next:string):void {
  if (!tree) return
  function visit(node:ExpressionNode) {
    if (node.type === 'reference') {
      if (node.id === alias(previous)) node.id = alias(next)
      else if (node.id === 'metricValues' && node.path[0] === previous) node.path[0] = next
    } else if (node.type === 'unary') visit(node.operand)
    else if (node.type === 'binary') { visit(node.left); visit(node.right) }
    else if (node.type === 'logical') node.operands.forEach(visit)
    else if (node.type === 'conditional') { visit(node.condition); visit(node.whenTrue); visit(node.whenFalse) }
    else if (node.type === 'call') node.arguments.forEach(visit)
  }
  visit(tree.root)
}

/** 只改模板内的显式身份与结构化引用，来源身份、函数参数和字面值保留。 */
export function renameTemplateInput(template:MetricTemplate, index:number, next:string):MetricTemplate {
  const issue = inputIdentityIssue(template,index,next)
  if (issue) throw new Error(issue)
  const previous = template.inputDefinitions[index].id
  if (previous === next) return template
  const value = copy(template)
  value.inputDefinitions[index].id = next
  if (value.options?.inputHints?.[previous]) {
    value.options.inputHints[next] = value.options.inputHints[previous]
    delete value.options.inputHints[previous]
  }
  for (const rule of value.definitions as TemplateRule[]) {
    const bound = rule.inputs?.some(input=>input.id === alias(previous) || !input.source && input.metricId === previous)
    if (!bound) for (const tree of [rule.expressionTree,rule.applicabilityTree,rule.contextKeyTree,rule.temporalCondition?.enterTree,rule.temporalCondition?.exitTree]) renameTree(tree,previous,next)
    if (rule.sourceMetric === previous) rule.sourceMetric = next
    if (rule.dependsOn) rule.dependsOn = rule.dependsOn.map(id=>id === previous ? next : id)
    for (const input of rule.inputs || []) if (!input.source && input.metricId === previous) input.metricId = next
  }
  for (const output of value.outputs) if (output.metricId === previous) output.metricId = next
  const messages = value.options?.i18nMessages as Record<string,unknown> | undefined
  if (messages) for (const key of Object.keys(messages)) if (key.startsWith(`input.${previous}.`)) { messages[`input.${next}.${key.slice(`input.${previous}.`.length)}`] = messages[key]; delete messages[key] }
  return value
}
