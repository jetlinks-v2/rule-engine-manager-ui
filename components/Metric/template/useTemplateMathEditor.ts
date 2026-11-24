import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ExpressionFunction,StructuredExpression } from '@jetlinks-web-core/components/Expression/types'
import type { ExpressionResultLabel } from '@jetlinks-web-core/components/Expression/editor'
import type { MathEditorProps } from '@jetlinks-web-core/components/Expression/useMathEditor'
import { expressionText } from '@jetlinks-web-core/components/Expression/display'
import { expressionToTree,formulaReferencePath,templateExpressionReferences,type FormulaReference } from './formula'
import { referenceKey } from '@jetlinks-web-core/components/Expression/document'

export interface TemplateMathEditorProps { modelValue:string; tree?:StructuredExpression; references:FormulaReference[]; disabled?:boolean; conditions?:boolean; functions?:ExpressionFunction[]; functionsError?:boolean; forceSource?:boolean; hideMode?:boolean; empty?:boolean; resultLabels?:ExpressionResultLabel[] }
export type FormulaChange={expression:string;expressionTree?:StructuredExpression;metricIds?:string[]}
/** 指标只适配历史源码和引用身份，MathLive 交互由公共编辑器负责。 */
export function useTemplateMathContext(props:TemplateMathEditorProps) {
  const {locale}=useI18n()
  return computed<MathEditorProps>(()=>({
    modelValue:props.tree,disabled:props.disabled,conditions:props.conditions,functionsError:props.functionsError,
    forceSource:props.forceSource,hideMode:props.hideMode,empty:props.empty,
    context:{references:templateExpressionReferences(props.references,String(locale.value)),functions:props.functions || [],resultLabels:props.resultLabels},
    source:{text:props.modelValue,parse:source=>expressionToTree(source,props.references),format:tree=>expressionText(tree,node=>props.references.find(item=>referenceKey(formulaReferencePath(item)) === referenceKey(node))?.expression)}
  }))
}
