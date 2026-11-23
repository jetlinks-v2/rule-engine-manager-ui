<template>
  <details v-if="numericParameter(parameter) || parameter.valueType?.type === 'enum'" class="parameter-settings">
    <summary>{{ t('parameterValueRequirements') }}</summary>
    <template v-if="numericParameter(parameter)">
      <div class="parameter-settings__line"><span>{{ t('parameterMinimum') }}</span><Editable type="number" :value="parameter.valueType?.min" :component-props="editorProps('parameterMinimum')" @change="valueType('min', $event)" /></div>
      <div class="parameter-settings__line"><span>{{ t('parameterMaximum') }}</span><Editable type="number" :value="parameter.valueType?.max" :component-props="editorProps('parameterMaximum')" @change="valueType('max', $event)" /></div>
      <div v-if="!['int','long'].includes(parameter.valueType?.type || '')" class="parameter-settings__line"><span>{{ t('parameterPrecision') }}</span><Editable type="number" :value="parameter.valueType?.scale" :component-props="{ ...editorProps('parameterPrecision'), precision:0, min:0 }" @change="valueType('scale', $event)" /></div>
      <div class="parameter-settings__line"><span>{{ t('unit') }}</span><Editable type="string" :value="parameter.valueType?.unit" :component-props="editorProps('unit')" @change="valueType('unit', $event)" /></div>
    </template>
    <div v-if="parameter.valueType?.type === 'enum'" class="parameter-settings__choices">
      <div v-for="(element, index) in parameterElements(parameter)" :key="index" class="parameter-settings__choice">
        <I18nTextEditable :value="element.text ?? element.label" :field="parameterEnumField(parameter.id, element.value)" :label="t('parameterChoiceLabel')" :disabled="disabled" :i18n-messages="messages" @change="label(index, $event)" />
        <div class="parameter-settings__line"><small>{{ t('parameterChoiceCode') }}</small><Editable :value="element.value" :component-props="editorProps('parameterChoiceCode')" @change="code(index, String($event))" /><a-button v-if="!disabled && !published" type="text" size="small" danger :aria-label="t('remove')" @click="remove(index)"><AIcon type="MinusOutlined" /></a-button></div>
      </div>
      <a-button v-if="!disabled && !published" type="text" size="small" @click="add"><AIcon type="PlusOutlined" />{{ t('parameterAddChoice') }}</a-button>
    </div>
    <p v-if="published" class="parameter-settings__hint">{{ t('parameterPublishedContract') }}</p>
  </details>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import Editable from '@jetlinks-web-core/components/Editable/index.vue'
import I18nTextEditable from '@jetlinks-web-core/components/I18n/I18nTextEditable.vue'
import type { I18nMessages } from '@jetlinks-web-core/components/I18n/types'
import { numericParameter, parameterElements } from '@jetlinks-web-core/components/Metric/parameterPresentation'
import { metricMessages } from '@jetlinks-web-core/components/Metric/messages'
import { parameterEnumField } from '@jetlinks-web-core/components/Metric/template/text'
import type { MetricParameter } from '@jetlinks-web-core/components/Metric/types'
const props = defineProps<{ parameter:MetricParameter; messages:I18nMessages; disabled?:boolean; published?:boolean }>()
const emit = defineEmits<{ (event:'patch', fields:Partial<MetricParameter>, messages?:I18nMessages):void }>()
const { t } = useI18n({ useScope:'local', messages:metricMessages })
function editorProps(label:string) { return { disabled:props.disabled || props.published, bordered:false, controls:false, placeholder:t('notConfigured'), 'aria-label':t(label) } }
function patch(fields:Partial<MetricParameter>, messages?:I18nMessages) { if (!props.disabled && !props.published) emit('patch', fields, messages) }
function valueType(field:string, value:unknown, messages?:I18nMessages) {
  if (props.disabled || props.published) return
  const valueType:NonNullable<MetricParameter['valueType']> = { ...props.parameter.valueType, type:props.parameter.valueType?.type || 'string' }
  if (value == null || value === '') delete valueType[field]
  else valueType[field] = value
  patch({ valueType }, messages)
}
function elements(value:ReturnType<typeof parameterElements>, messages?:I18nMessages) { valueType('elements', value, messages) }
function label(index:number, value:{ value:string; i18nMessages:I18nMessages }) {
  if (props.disabled) return
  // 已发布枚举仅改展示翻译，不改 valueType 中参与公开契约的结构。
  if (props.published) { emit('patch', {}, value.i18nMessages); return }
  elements(parameterElements(props.parameter).map((item, i) => i === index ? { ...item, text:value.value } : item), value.i18nMessages)
}
function code(index:number, value:string) {
  if (props.disabled || props.published) return
  const previous = parameterElements(props.parameter)[index].value
  if (previous === value) return
  const messages = { ...props.messages }, field = parameterEnumField(props.parameter.id, previous)
  if (messages[field]) { messages[parameterEnumField(props.parameter.id, value)] = messages[field]; delete messages[field] }
  elements(parameterElements(props.parameter).map((item, i) => i === index ? { ...item, value } : item), messages)
}
function remove(index:number) {
  if (props.disabled || props.published) return
  const messages = { ...props.messages }
  delete messages[parameterEnumField(props.parameter.id, parameterElements(props.parameter)[index].value)]
  elements(parameterElements(props.parameter).filter((_, i) => i !== index), messages)
}
function add() {
  if (props.disabled || props.published) return
  const values = parameterElements(props.parameter)
  let sequence = 1
  while (values.some(item => item.value === `option${sequence}`)) sequence++
  elements([...values, { value:`option${sequence}`, text:'' }])
}
</script>
<style scoped>
.parameter-settings { margin-top:10px; color:var(--ink-3); font-size:12px }
.parameter-settings summary { cursor:pointer; line-height:24px }
.parameter-settings__line { display:flex; align-items:center; gap:6px; min-height:36px; max-width:100% }
.parameter-settings__line > :first-child { flex:none }
.parameter-settings__line > :deep(.editable-field) { min-width:72px; max-width:100%; color:var(--ink-2); flex:1 }
.parameter-settings__choice { padding:6px 0; border-bottom:1px solid var(--line) }
.parameter-settings__hint { line-height:1.6; margin:8px 0 0 }
</style>
