<template>
  <details class="read-policy" :open="!!issue">
    <summary><AIcon type="ClusterOutlined" /> {{ t('policy') }}<small>{{ policy ? t(policy.defaultOperation) : t('legacy') }}</small></summary>
    <div class="read-policy__mode"><span>{{ t('policyMode') }}</span><a-switch :checked="!!policy" :disabled="disabled || !policy && !supported.length" :checked-children="t('custom')" :un-checked-children="t('automatic')" :aria-label="t('policyMode')" @change="toggle($event as boolean)" /></div>
    <p>{{ t('policyHint') }}</p>
    <p v-if="issue || !policy && !supported.length" :class="{ 'read-policy__issue':!!issue }" :role="issue ? 'alert' : undefined">{{ t(issue || (output.valueType ? 'unsupportedType' : 'typeRequired')) }}</p>
    <template v-if="policy">
      <TemplateClause icon="TagOutlined" :title="t('semantic')"><Editable type="select" :value="policy.semantic" :component-props="{ options:semantics, disabled, bordered:false, dropdownMatchSelectWidth:false }" @change="changeSemantic($event as ReadSemantic)" /></TemplateClause>
      <a-checkbox v-if="policy.semantic === 'quantity'" :checked="policy.exclusiveContributions" :disabled="disabled" @change="changeExclusive($event.target.checked)">{{ t('exclusive') }}</a-checkbox>
      <small v-if="policy.semantic === 'quantity'">{{ t('exclusiveHint') }}</small>
      <div class="read-policy__operations"><button v-for="item in compatible" :key="item" type="button" :disabled="disabled || item === 'collection'" :class="{ active:policy.operations.includes(item) }" :aria-pressed="policy.operations.includes(item)" @click="toggleOperation(item)"><AIcon :type="policy.operations.includes(item) ? 'CheckOutlined' : 'PlusOutlined'" />{{ t(item) }}</button></div>
      <TemplateClause :icon="readOperationPresentation(policy.defaultOperation).icon" :title="t('defaultOperation')"><Editable type="select" :value="policy.defaultOperation" :component-props="{ options:policy.operations.map(value => ({ value, label:t(value), icon:readOperationPresentation(value).icon, description:t(readOperationPresentation(value).description) })), disabled, bordered:false, dropdownMatchSelectWidth:false }" @change="patch({ defaultOperation:$event as ReadOperation })" /></TemplateClause>
      <TemplateClause icon="BarChartOutlined" :title="t('defaultView')"><Editable type="select" :value="policy.defaultView" :component-props="{ options:['list','bars'].map(value => ({ value, label:t(value), icon:value === 'list' ? 'UnorderedListOutlined' : 'BarChartOutlined', description:t('readOnly') })), disabled, bordered:false }" @change="patch({ defaultView:$event as 'list' | 'bars' })" /></TemplateClause>
    </template>
  </details>
</template>
<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Editable from '@jetlinks-web-core/components/Editable/index.vue'
import TemplateClause from '../template/TemplateClause.vue'
import { collectionMessages } from './messages'
import { compatibleReadOperations, readPolicy, readOperationPresentation, suggestedReadSemantic, supportedReadSemantics, updateReadPolicy } from './aggregationPolicy'
import type { MetricTemplateOutput } from '../types'
import type { MetricReadAggregation, ReadOperation, ReadSemantic } from './types'
const props = defineProps<{ output:MetricTemplateOutput; disabled?:boolean }>()
const emit = defineEmits<{ (event:'patch', value:Record<string,unknown>):void; (event:'invalid', value:boolean):void }>()
const { t } = useI18n({ useScope:'local', messages:collectionMessages })
const policy = computed(() => props.output.options?.readAggregation)
const supported = computed(()=>supportedReadSemantics(props.output.valueType))
const issue = computed(()=>!props.disabled && policy.value && !supported.value.includes(policy.value.semantic) ? !props.output.valueType ? 'typeRequired' : 'typeIncompatible' : undefined)
watch(issue,value=>emit('invalid',!!value),{immediate:true})
const compatible = computed(() => policy.value ? compatibleReadOperations(policy.value.semantic, policy.value.exclusiveContributions) : [])
const semantics = computed(() => supported.value.map(value => ({ value, label:t(value), icon:value === 'state' ? 'TagOutlined' : 'CalculatorOutlined', description:t('policyHint') })))
function setPolicy(value?:MetricReadAggregation) { if (!props.disabled) emit('patch',updateReadPolicy(props.output,value)) }
/** 开启自定义只生成兼容类型的读取声明，不修改输出类型或其它用途。 */
function toggle(enabled:boolean) {
  if (enabled && !supported.value.length) return
  const suggested = suggestedReadSemantic(props.output)
  setPolicy(enabled ? readPolicy(supported.value.includes(suggested) ? suggested : supported.value[0]) : undefined)
}
function patch(fields:Partial<MetricReadAggregation>) { if (policy.value) setPolicy({ ...policy.value, ...fields }) }
function changeSemantic(value:ReadSemantic) { setPolicy(readPolicy(value)) }
function changeExclusive(value:boolean) {
  if (!policy.value) return
  const operations = policy.value.operations.filter(item => compatibleReadOperations(policy.value!.semantic,value).includes(item))
  patch({ exclusiveContributions:value, operations, defaultOperation:operations.includes(policy.value.defaultOperation) ? policy.value.defaultOperation : 'collection' })
}
function toggleOperation(value:ReadOperation) {
  if (!policy.value) return
  const operations = policy.value.operations.includes(value) ? policy.value.operations.filter(item => item !== value) : [...policy.value.operations,value]
  patch({ operations, defaultOperation:operations.includes(policy.value.defaultOperation) ? policy.value.defaultOperation : 'collection' })
}
</script>
<style scoped>
.read-policy { margin:8px 0; border-block:1px solid var(--line); padding:8px 0; font-size:13px }
.read-policy summary { cursor:pointer; display:flex; align-items:center; gap:8px; min-height:32px }
.read-policy summary > .anticon { width:16px; flex:none; color:var(--ink-3) }
.read-policy summary small { margin-left:auto; min-width:0; color:var(--ink-3); font-size:12px; text-align:right }
.read-policy p,.read-policy>small { display:block; margin:4px 0; color:var(--ink-3); font-size:12px; line-height:1.6 }
.read-policy .read-policy__issue { color:var(--ant-error-color,#ff4d4f) }
.read-policy__mode { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:32px; margin-top:4px }
.read-policy__operations { display:flex; flex-wrap:wrap; gap:6px; margin-top:12px }
.read-policy__operations button { display:flex; align-items:center; gap:4px; background:var(--surface-1,#fafafa); border:1px solid var(--border,#f0f0f0); border-radius:4px; padding:4px 8px; cursor:pointer; color:var(--ink-2) }
.read-policy__operations button.active { background:var(--accent-soft,#e6f4ff); border-color:var(--accent,#1677ff); color:var(--accent,#1677ff) }
</style>
