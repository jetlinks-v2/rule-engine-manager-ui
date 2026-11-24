import { computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { expressionLabel, ruleExpression, type TemplateRule } from '../designer'
import { expressionToTree, formulaReferencePath, ruleFormulaReferences } from '../formula'
import type { MetricCalculatorDescriptor, MetricTemplate } from '../../types'
import { metricCalculatorsKey } from '../../calculatorContext'
import { useExpressionFunctions } from '@jetlinks-web-core/components/Expression/useExpressionFunctions'
import { metricExpressionFunctions } from '../../expressionApi'
import { templateExpressionReferences } from '../formula'
import { metricValueLabels } from '../../valueSemantics'

/** 反显与编辑使用同一引用目录；不能完整投影的旧脚本保持原有文本。 */
export function useFormulaDisplay(props: { template: MetricTemplate; rule: TemplateRule; expression: string; calculators?: MetricCalculatorDescriptor[]; semanticOnly?: boolean }) {
  const shared = inject(metricCalculatorsKey, undefined)
  const {locale}=useI18n()
  const { functions } = useExpressionFunctions(metricExpressionFunctions)
  const references = computed(() => ruleFormulaReferences(props.template, props.rule, props.calculators || shared?.value,String(locale.value)))
  const tree = computed(() => (!props.expression || props.expression === ruleExpression(props.rule)) && props.rule.expressionTree || expressionToTree(props.expression,references.value))
  const context = computed(() => ({ references:templateExpressionReferences(references.value,String(locale.value)), functions:functions.value,
    resultLabels:(!props.expression || props.expression === ruleExpression(props.rule)) ? metricValueLabels(props.template,props.rule.id || '').map(item=>({value:item.value,label:item.name})) : undefined }))
  const label = computed(() => expressionLabel(props.template, props.expression,
    new Map(references.value.filter(item => item.group === 'data').map(item => [item.expression, item.label]))))
  return { label, tree, context }
}
