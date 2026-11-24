<template>
  <div v-if="tableFields.length" class="metric-value-table" role="table" :aria-label="parameter.name || parameter.id">
    <div class="metric-value-table__row metric-value-table__head" role="row" :style="tableStyle">
      <span v-for="field in tableFields" :key="field.id" role="columnheader">{{ field.name || field.id }}</span><span v-if="!disabled" role="columnheader" :aria-label="t('remove')" />
    </div>
    <div v-for="(row,index) in arrayValue" :key="index" class="metric-value-table__row" role="row" :style="tableStyle">
      <div v-for="field in tableFields" :key="field.id" role="cell"><MetricParameterValue :parameter="field" :model-value="row && typeof row === 'object' ? (row as Record<string,unknown>)[field.id] : undefined" :disabled="disabled" @update:model-value="changeRow(index,field.id,$event)" /></div>
      <div v-if="!disabled" role="cell"><a-button type="text" size="small" :disabled="arrayValue.length <= minItems" :aria-label="t('remove')" @click="change(arrayValue.filter((_,i)=>i!==index))"><AIcon type="MinusOutlined" /></a-button></div>
    </div>
    <a-button v-if="!disabled" type="dashed" size="small" block :disabled="arrayValue.length >= maxItems" @click="change([...arrayValue,{}])"><AIcon type="PlusOutlined" />{{ t('valueAddRow') }}</a-button>
  </div>
  <Editable v-else-if="inline && simple" class="metric-parameter-value" :value="editableValue" :type="editorType"
    :component-props="{ ...editorProps, disabled, bordered:false, placeholder:t('notConfigured'), 'aria-label':parameter.name || parameter.id, 'aria-invalid':$attrs['aria-invalid'] }" @change="changeInline">{{ display }}</Editable>
  <details v-else-if="inline" class="metric-parameter-value metric-parameter-value--structured">
    <summary>{{ display }}</summary>
    <pre v-if="disabled">{{ display }}</pre>
    <MetricParameterValue v-else :parameter="parameter" :model-value="modelValue" @update:model-value="change" />
  </details>
  <div v-else-if="type === 'object' || type === 'array'" class="metric-structured-value">
    <a-button v-if="modelValue == null" size="small" :disabled="disabled" @click="change(type === 'object' ? {} : [])">{{ t(type === 'object' ? 'valueCreateObject' : 'valueCreateArray') }}</a-button>
    <template v-else-if="type === 'object'">
      <div v-for="field in fields" :key="field.id" class="metric-structured-value__row">
        <span :title="field.id">{{ field.name || field.id }}</span>
        <MetricParameterValue :parameter="field" :model-value="objectValue[field.id]" :disabled="disabled" @update:model-value="changeField(field.id,$event)" />
        <a-dropdown v-if="!disabled" :trigger="['click']"><a-button type="text" size="small" :aria-label="`${field.name || field.id} · ${t('moreSettings')}`"><AIcon type="EllipsisOutlined" /></a-button><template #overlay><a-menu><a-menu-item @click="changeField(field.id,null)">{{ t('valueSetNull') }}</a-menu-item><a-menu-item @click="changeField(field.id,undefined)">{{ t('valueUnset') }}</a-menu-item></a-menu></template></a-dropdown>
      </div>
      <small v-if="!fields.length">{{ t('valueDeclareFields') }}</small>
    </template>
    <template v-else>
      <div v-for="(item,index) in arrayValue" :key="index" class="metric-structured-value__row">
        <span>{{ index + 1 }}</span><MetricParameterValue :parameter="element" :model-value="item" :disabled="disabled" @update:model-value="changeElement(index,$event)" />
        <a-button v-if="!disabled" type="text" size="small" :aria-label="t('remove')" @click="change(arrayValue.filter((_,i)=>i!==index))"><AIcon type="MinusOutlined" /></a-button>
      </div>
      <a-button size="small" :disabled="disabled" @click="change([...arrayValue,null])"><AIcon type="PlusOutlined" />{{ t('valueAddElement') }}</a-button>
    </template>
  </div>
  <a-date-picker v-else-if="type === 'date'" :value="dateValue" show-time :disabled="disabled" :aria-label="parameter.name || parameter.id" style="width:100%" @change="change($event?.valueOf())" />
  <a-switch v-else-if="parameter.valueType?.type === 'boolean'" :checked="modelValue === true" :disabled="disabled"
    @update:checked="change" />
  <a-input-number v-else-if="numeric" :value="modelValue as number | string | undefined" :precision="precision"
    :min="parameterNumber(parameter.valueType?.min)" :max="parameterNumber(parameter.valueType?.max)" :disabled="disabled"
    :formatter="formatNumber" :aria-label="parameter.name || parameter.id" style="width:100%"
    @update:value="change" />
  <a-select v-else-if="type === 'enum'" :value="editableValue as string | string[] | undefined" :options="editorProps.options" :mode="parameter.valueType?.multi ? 'multiple' : undefined" :disabled="disabled" :aria-label="parameter.name || parameter.id" style="width:100%" @change="changeInline" />
  <MetadataValueItem v-else :item="metadataItem" :disabled="disabled"
    :model-value="modelValue as MetadataEditorValue" @update:model-value="change" />
</template>
<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import { useI18n } from 'vue-i18n'
import Editable from '@jetlinks-web-core/components/Editable/index.vue'
import MetadataValueItem from '@jetlinks-web-core/components/MetadataValueItem/index.vue'
import type { MetricParameter } from './types'
import { numericParameter, parameterElements, parameterNumber, parameterPrecision, parameterValueText } from './parameterPresentation'
import { metricMessages } from './messages'
type MetadataEditorValue = string | number | unknown[] | Record<string, unknown> | undefined
const props = defineProps<{ parameter: MetricParameter; modelValue: unknown; inline?: boolean; disabled?: boolean }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: unknown): void }>()
const { t } = useI18n({ useScope:'local', messages:metricMessages })
const numeric = computed(() => numericParameter(props.parameter))
const precision = computed(() => parameterPrecision(props.parameter))
const type = computed(() => props.parameter.valueType?.type || 'string')
const fields = computed<MetricParameter[]>(() => Array.isArray(props.parameter.valueType?.properties) ? props.parameter.valueType.properties : [])
const element = computed<MetricParameter>(() => ({ id:props.parameter.id, valueType:{ type:'string', ...props.parameter.valueType?.elementType as Record<string,unknown> } }))
const objectValue = computed<Record<string,unknown>>(() => props.modelValue && typeof props.modelValue === 'object' && !Array.isArray(props.modelValue) ? props.modelValue as Record<string,unknown> : {})
const arrayValue = computed<unknown[]>(() => Array.isArray(props.modelValue) ? props.modelValue : [])
const tableFields = computed<MetricParameter[]>(() => props.parameter.expands?.editor === 'table' && type.value === 'array' && Array.isArray(element.value.valueType?.properties) ? element.value.valueType.properties : [])
const tableStyle = computed(() => ({ gridTemplateColumns:`repeat(${tableFields.value.length}, minmax(0, 1fr))${props.disabled ? '' : ' 28px'}` }))
const minItems = computed(() => Number(props.parameter.expands?.minItems || 0))
const maxItems = computed(() => Number(props.parameter.expands?.maxItems || Infinity))
function changeRow(index:number,id:string,value:unknown) {
  const row = arrayValue.value[index]
  const next = { ...(row && typeof row === 'object' ? row as Record<string,unknown> : {}) }
  if (value === undefined) delete next[id]; else next[id] = value
  change(arrayValue.value.map((item,i) => i === index ? next : item))
}
const dateValue = computed(() => props.modelValue == null || props.modelValue === '' ? undefined : dayjs(props.modelValue as string | number))
/** 字段未提供和显式空值分别保留；编辑一个字段不重建或丢弃其他来源字段。 */
function changeField(id:string,value:unknown) { const next = { ...objectValue.value }; if (value === undefined) delete next[id]; else next[id] = value; change(next) }
function changeElement(index:number,value:unknown) { change(arrayValue.value.map((item,i)=>i===index ? value ?? null : item)) }
const simple = computed(() => numeric.value || ['string', 'boolean', 'enum'].includes(type.value))
const editorType = computed(() => ['boolean','enum'].includes(type.value) ? 'select' : numeric.value ? 'number' : 'string')
const choices = computed(() => parameterElements(props.parameter))
const enumKey = (value:unknown) => { const index = choices.value.findIndex(item=>item.value === value); return index < 0 ? undefined : String(index) }
const editableValue = computed(() => type.value === 'enum' ? props.parameter.valueType?.multi && Array.isArray(props.modelValue) ? props.modelValue.map(enumKey).filter(value=>value !== undefined) : enumKey(props.modelValue)
  : type.value === 'boolean' && typeof props.modelValue === 'boolean' ? String(props.modelValue) : props.modelValue)
const editorProps = computed(() => {
  if (type.value === 'boolean') return { defaultOpen:true, dropdownMatchSelectWidth:false, options:[{ value:'true', label:t('parameterOn'), icon:'CheckCircleOutlined', description:'true' }, { value:'false', label:t('parameterOff'), icon:'CloseCircleOutlined', description:'false' }] }
  if (type.value === 'enum') return { defaultOpen:true, dropdownMatchSelectWidth:false, mode:props.parameter.valueType?.multi ? 'multiple' : undefined, options:choices.value.map((item,index) => ({ value:String(index), label:item.text ?? item.label ?? String(item.value), icon:'TagOutlined', description:String(item.value) })) }
  return numeric.value ? { controls:false, precision:precision.value, min:parameterNumber(props.parameter.valueType?.min), max:parameterNumber(props.parameter.valueType?.max), formatter:formatNumber } : {}
})
const display = computed(() => parameterValueText(props.parameter, props.modelValue, t))
function change(value:unknown) { if (!props.disabled) emit('update:modelValue', value) }
/** Select 的选项键只用于交互；返回声明中的原始编码，保留数值0与布尔false。 */
function changeInline(value:unknown) {
  if (type.value === 'enum') change(Array.isArray(value) ? value.map(key=>choices.value[Number(key)]?.value) : value == null ? undefined : choices.value[Number(value)]?.value)
  else change(type.value === 'boolean' && value != null ? value === 'true' : value)
}
/** canonical 枚举使用 text，现有元数据控件的选项显示使用 label；只适配显示，不改配置。 */
const metadataItem = computed(() => {
  const valueType = props.parameter.valueType || { type: 'string' }
  return { ...props.parameter, valueType: valueType.type === 'enum' && Array.isArray(valueType.elements)
    ? { ...valueType, elements: valueType.elements.map(item => ({ ...item, label: item.text ?? item.label ?? String(item.value) })) } : valueType }
})
/** 只移除补齐的小数零；输入时保留小数点、负号等尚未完成的文本。 */
function formatNumber(value: string | number | undefined, info: { userTyping: boolean; input: string }) {
  if (info.userTyping) return info.input
  return String(value ?? '').replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1')
}
</script>
<style scoped>
.metric-parameter-value { min-width:64px; max-width:100%; vertical-align:middle }
.metric-value-table { width:100%; min-width:0; display:grid; gap:6px; font-size:12px }
.metric-value-table__row { display:grid; gap:6px; align-items:center; min-width:0 }
.metric-value-table__head { color:var(--ink-3); line-height:24px }
.metric-value-table__row > * { min-width:0 }
.metric-value-table__row :deep(.ant-input-number) { min-width:0; width:100% }
.metric-parameter-value--structured { min-width:0; width:100%; overflow:hidden }
.metric-parameter-value--structured summary { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer; line-height:32px }
.metric-parameter-value--structured pre { max-height:180px; overflow:auto; white-space:pre-wrap; font-size:12px }
.metric-structured-value { display:grid; gap:8px; min-width:0; width:100% }
.metric-structured-value__row { display:grid; grid-template-columns:minmax(24px,auto) minmax(0,1fr) auto; align-items:start; gap:6px; min-width:0 }
.metric-structured-value__row>span { font-size:12px; padding-top:5px; overflow-wrap:anywhere }
.metric-structured-value small { color:var(--ink-3); font-size:12px }
</style>
