<template>
  <TemplateMathEditor v-if="tree" hide-mode class="template-formula" :model-value="modelValue" :tree="tree" :empty="empty"
    :references="references" :functions="functions" :functions-error="functionsError" :result-labels="resultLabels"
    :disabled="disabled" :conditions="true" @change="change" @invalid="emit('invalid',$event)" @retry-functions="refreshFunctions" />
  <a-alert v-else type="warning" show-icon :message="t('formulaVisualUnavailable')" />
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { metricMessages } from '../messages'
import type { ExpressionNode, StructuredExpression } from '@jetlinks-web-core/components/Expression/types'
import type { ExpressionResultLabel } from '@jetlinks-web-core/components/Expression/editor'
import { useExpressionFunctions } from '@jetlinks-web-core/components/Expression/useExpressionFunctions'
import { metricExpressionFunctions } from '../expressionApi'
import TemplateMathEditor from './TemplateMathEditor.vue'
import { expressionToTree, type FormulaReference } from './formula'
import type { FormulaChange } from './useTemplateMathEditor'
const props=defineProps<{modelValue:string;tree?:StructuredExpression;references:FormulaReference[];resultLabels?:ExpressionResultLabel[];disabled?:boolean;conditions?:boolean}>()
const emit=defineEmits<{(event:'change',value:FormulaChange):void;(event:'invalid',value:boolean):void}>()
const {functions,error:functionsError,refresh:refreshFunctions}=useExpressionFunctions(metricExpressionFunctions)
const {t}=useI18n({useScope:'local',messages:metricMessages})
const empty=computed(()=>!props.tree && !props.modelValue.trim())
const emptyRoot:ExpressionNode={type:'literal',valueType:'null',value:null}
// 历史源码只作公式投影；查看不改写模板，实际编辑才提交结构树及依赖。
const tree=computed(()=>props.tree || expressionToTree(props.modelValue,props.references) || (empty.value ? {version:1 as const,root:emptyRoot} : undefined))
function change(value:FormulaChange) {if(!props.disabled)emit('change',value)}
</script>
<style scoped>
.template-formula { min-width:0 }
</style>
