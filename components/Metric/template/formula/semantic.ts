import { parseDisplayExpression, ruleFormulaReferences, type FormulaNode, type FormulaReference } from '../formula'
import { metricValueLabels, type ValueTranslate } from '../../valueSemantics'
import { i18nText } from '@jetlinks-web-core/components/I18n/text'
import type { MetricCalculatorDescriptor, MetricTemplate } from '../../types'
import type { TemplateRule } from '../designer'

/** 白名单事实访问与普通引用共用词法解析，不接受动态键或任意方法调用。 */
export function displayReferences(template:MetricTemplate, rule:TemplateRule, calculators:MetricCalculatorDescriptor[], t:ValueTranslate, locale='zh'):FormulaReference[] {
  const declared = ruleFormulaReferences(template, rule, calculators, locale)
  const refs = declared.map(item=>item.semantic === 'stateDuration' ? {...item,label:t('semanticStateDuration',{name:declared.find(ref=>ref.key === item.metricId)?.label || item.label})} : item)
  return [...refs, ...refs.filter(item => item.group === 'data' && /^[a-zA-Z_][\w]*$/.test(item.expression)
    && template.definitions.some(rule => rule.id === item.metricId && rule.stateTracking)).flatMap(item => ["'", '"'].map(quote => ({
      ...item, key:`${item.key}:duration:${quote}`, semantic:'stateDuration' as const,
      expression:`metricValues[${quote}${item.expression}${quote}].getState().getDuration()`, label:t('semanticStateDuration', { name:item.label }),
    }))) ]
}

export interface ExpressionStory { label:string; condition?:string; yes?:string; no?:string }
const operators:Record<string,string> = { '==':'=', '!=':'≠', '>=':'≥', '<=':'≤', '*':'×', '/':'÷', '&&':'∧', '||':'∨' }

export function expressionStory(template:MetricTemplate, rule:TemplateRule, expression:string, calculators:MetricCalculatorDescriptor[], locale:string, t:ValueTranslate):ExpressionStory | undefined {
  const refs = displayReferences(template, rule, calculators, t, locale)
  const tree = parseDisplayExpression(expression, refs)
  if (!tree) return undefined
  let semantic = false
  function text(node:FormulaNode):string {
    switch (node.kind) {
      case 'number': return node.value
      case 'reference': if (node.reference.semantic) semantic = true; return node.reference.label
      case 'literal': semantic = true; return node.value === null ? t('semanticNoValue') : typeof node.value === 'boolean' ? t(node.value ? 'conditionTrue' : 'conditionFalse') : `“${node.value}”`
      case 'unary': return `${node.operator === '!' ? '¬' : node.operator}(${text(node.value)})`
      case 'function': return `${node.name}(${node.args.map(text).join(', ')})`
      case 'conditional': semantic = true; return t('semanticBranch', { condition:text(node.condition), yes:text(node.yes), no:text(node.no) })
      case 'binary': {
        // 编码仅在明确的同类型状态声明中翻译；字符串"1"不能当数值1。
        const pair = node.left.kind === 'reference' ? [node.left,node.right] as const : node.right.kind === 'reference' ? [node.right,node.left] as const : undefined
        if (pair && ['==','!='].includes(node.operator) && !pair[0].reference.semantic) {
          const [ref,value] = pair
          const scalar = value.kind === 'number' ? Number(value.value) : value.kind === 'literal' ? value.value
            : value.kind === 'unary' && ['+','-'].includes(value.operator) && value.value.kind === 'number'
              ? Number(value.value.value) * (value.operator === '-' ? -1 : 1) : undefined
          const item = ref.reference.metricId && /^[#\w]+$/.test(ref.reference.expression)
            ? metricValueLabels(template,ref.reference.metricId).find(item => item.value === scalar) : undefined
          if (item) { semantic = true; return t(node.operator === '==' ? 'semanticEquals' : 'semanticNotEquals', { name:ref.reference.label, value:i18nText(item.name,item.nameI18n,locale) }) }
        }
        return `(${text(node.left)} ${operators[node.operator] || node.operator} ${text(node.right)})`
      }
    }
  }
  const label = text(tree)
  if (!semantic) return undefined
  return tree.kind === 'conditional' ? { label, condition:text(tree.condition), yes:text(tree.yes), no:text(tree.no) } : { label }
}
