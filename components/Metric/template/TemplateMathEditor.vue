<template>
  <MathExpressionEditor v-bind="shared" @change="change" @invalid="$emit('invalid',$event)" @retry-functions="$emit('retryFunctions')" @reference-hover="hover">
    <template #tools><slot name="tools" /></template>
    <template #view-tools><slot name="view-tools" /></template>
  </MathExpressionEditor>
</template>
<script setup lang="ts">
import { inject } from 'vue'
import MathExpressionEditor from '@jetlinks-web-core/components/Expression/MathExpressionEditor.vue'
import type { MathEditorChange } from '@jetlinks-web-core/components/Expression/useMathEditor'
import type { ExpressionReference } from '@jetlinks-web-core/components/Expression/editor'
import { referenceKey } from '@jetlinks-web-core/components/Expression/document'
import { expressionReferences } from '@jetlinks-web-core/components/Expression/display'
import { useTemplateMathContext,type FormulaChange } from './useTemplateMathEditor'
import type { StructuredExpression,ExpressionFunction } from '@jetlinks-web-core/components/Expression/types'
import type { ExpressionResultLabel } from '@jetlinks-web-core/components/Expression/editor'
import type { FormulaReference } from './formula'
import { formulaReferencePath } from './formula'
import { templateReferenceKey } from './templateReference'
const props=defineProps<{modelValue:string;tree?:StructuredExpression;references:FormulaReference[];disabled?:boolean;conditions?:boolean;functions?:ExpressionFunction[];functionsError?:boolean;forceSource?:boolean;hideMode?:boolean;empty?:boolean;resultLabels?:ExpressionResultLabel[]}>()
const emit=defineEmits<{(event:'change',value:FormulaChange):void;(event:'invalid',value:boolean):void;(event:'retryFunctions'):void}>()
const shared=useTemplateMathContext(props)
const referenceContext=inject(templateReferenceKey,undefined)
function hover(reference?:ExpressionReference) {referenceContext?.preview(props.references.find(item=>reference && referenceKey(formulaReferencePath(item)) === referenceKey(reference))?.metricId)}
function change(value:MathEditorChange) {
  const metricIds=value.expressionTree ? [...new Set(expressionReferences(value.expressionTree.root).flatMap(node=>{const item=props.references.find(ref=>referenceKey(formulaReferencePath(ref)) === referenceKey(node));return item?.metricId ? [item.metricId] : []}))] : undefined
  emit('change',{...value,expression:value.expression || '',...(metricIds ? {metricIds} : {})})
}
</script>
