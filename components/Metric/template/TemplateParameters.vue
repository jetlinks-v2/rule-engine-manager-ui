<template>
  <div ref="root" class="metric-parameters">
    <MetricParameterBlock v-for="(parameter, index) in template.parameterDefinitions" :key="index" :parameter="display.parameterDefinitions[index]"
      :value="templateParameterDefault(template, parameter)" :value-label="t('defaultValue')" :disabled="disabled" :expanded="expandedIndex === index" @toggle="expandedIndex = expandedIndex === index ? -1 : index" @change="defaultField(parameter.id, $event)">
      <template #name><I18nTextEditable :value="parameter.name" :field="`parameter.${parameter.id}.name`" :label="t('label')" :disabled="disabled" :i18n-messages="templateMessages(template)" @change="setText(index, 'name', $event)" /></template>
      <template #type><Editable type="select" :value="parameter.valueType?.type || 'string'" :component-props="{ disabled:disabled || published, bordered:false, defaultOpen:true, dropdownMatchSelectWidth:false, options:parameterTypes, 'aria-label':t('parameterType') }" @change="parameterField(index, { valueType:{ type:String($event) } })" /></template>
      <template #actions><a-dropdown v-if="!disabled && !published" :trigger="['click']"><a-button class="metric-parameters__more" type="text" size="small" :aria-label="t('moreSettings')"><AIcon type="EllipsisOutlined" /></a-button><template #overlay><a-menu><a-menu-item danger @click="remove(index)"><AIcon type="DeleteOutlined" />{{ t('remove') }}</a-menu-item></a-menu></template></a-dropdown></template>
      <template #identifier><Editable :value="parameter.id" :component-props="{ disabled:disabled || published, bordered:false, 'aria-label':t('declarationId') }" @change="parameterField(index, { id:String($event) })" /></template>
      <template #state><button type="button" class="metric-parameters__permission" :disabled="disabled || published" @click="setEditable(index)"><AIcon :type="parameter.expands?.editable ? 'UserOutlined' : 'LockOutlined'" />{{ t(parameter.expands?.editable ? 'parameterAdjustable' : 'parameterFixed') }}</button><span v-if="!references.get(parameter.id)?.length" class="metric-parameters__unused">{{ t('parameterUnused') }}</span></template>
      <template #description><I18nTextEditable :value="parameter.description" :field="`parameter.${parameter.id}.description`" :label="t('parameterPurpose')" :placeholder="t('parameterPurposePlaceholder')" :disabled="disabled" :i18n-messages="templateMessages(template)" @change="setText(index, 'description', $event)" /></template>
      <div v-if="references.get(parameter.id)?.length" class="metric-parameters__references"><span>{{ t('parameterUsedBy') }}</span><TemplateReference v-for="rule in references.get(parameter.id)" :key="rule.id" :metric-id="rule.id" locatable>{{ rule.label }}</TemplateReference></div>
      <TemplateParameterSettings :parameter="parameter" :messages="templateMessages(template)" :disabled="disabled" :published="published" @patch="(fields:Partial<MetricParameter>, messages?:I18nMessages) => parameterField(index, fields, messages)" />
    </MetricParameterBlock>
    <a-dropdown v-if="!disabled && !published" :trigger="['click']">
      <a-button type="text" size="small"><AIcon type="PlusOutlined" />{{ t('parameterAdd') }}</a-button>
      <template #overlay><a-menu @click="add(String($event.key))"><a-menu-item v-for="type in newTypes" :key="type.value"><SelectOption :icon="type.icon" :label="t(type.label)" :description="t(`${type.label}Hint`)" /></a-menu-item></a-menu></template>
    </a-dropdown>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MetricParameterBlock from '../MetricParameterBlock.vue'
import Editable from '@jetlinks-web-core/components/Editable/index.vue'
import SelectOption from '@jetlinks-web-core/components/SelectOption/index.vue'
import { parameterTypeKeys } from '../parameterPresentation'
import I18nTextEditable from '@jetlinks-web-core/components/I18n/I18nTextEditable.vue'
import type { I18nMessages } from '@jetlinks-web-core/components/I18n/types'
import TemplateParameterSettings from './TemplateParameterSettings.vue'
import TemplateReference from './TemplateReference.vue'
import { localizedTemplate, templateMessages } from './text'
import { metricMessages } from '../messages'
import { removeTemplateParameter, templateParameterDefault, templateParameterReferences, updateTemplateParameter } from './parameters'
import type { MetricParameter, MetricTemplate } from '../types'
const props = defineProps<{ template: MetricTemplate; disabled?: boolean; published?: boolean }>()
const emit = defineEmits<{ (event: 'update:template', template: MetricTemplate): void }>()
const { t, locale } = useI18n({ useScope: 'local', messages: metricMessages })
const root = ref<HTMLElement>()
const expandedIndex = ref(0)
watch(() => `${props.template.id}:${props.template.version}`, () => { expandedIndex.value = 0 })
const display = computed(() => localizedTemplate(props.template, String(locale.value)))
const references = computed(() => templateParameterReferences(display.value))
const parameterTypes = computed(() => Object.entries(parameterTypeKeys).map(([value, key]) => ({ value, label:value === 'float' ? `${t(key)} (float)` : t(key), icon:newTypes.find(type => type.value === value)?.icon || 'NumberOutlined', description:t(`${key}Hint`) })))
const newTypes = [
  { value:'double', label:'parameterNumber', icon:'NumberOutlined' }, { value:'string', label:'parameterText', icon:'FontSizeOutlined' },
  { value:'boolean', label:'parameterBoolean', icon:'PoweroffOutlined' }, { value:'enum', label:'parameterEnum', icon:'UnorderedListOutlined' },
  { value:'object', label:'parameterObject', icon:'CodeOutlined' }, { value:'array', label:'parameterArray', icon:'BarsOutlined' },
]
function parameterField(index: number, fields: Partial<MetricParameter>, messages?:I18nMessages) {
  if (props.disabled) return
  // 已发布身份、类型、约束及开放权限不可通过控件事件绕过。
  if (props.published && ['id', 'valueType', 'expands'].some(key => Object.hasOwn(fields, key))) return
  const template = updateTemplateParameter(props.template, index, fields)
  emit('update:template', messages ? { ...template, options:{ ...template.options, i18nMessages:messages } } : template)
}
function defaultField(id: string, value: unknown) {
  if (!props.disabled) emit('update:template', { ...props.template, parameters: { ...props.template.parameters, [id]: value } })
}
function setEditable(index:number) {
  const parameter = props.template.parameterDefinitions[index]
  parameterField(index, { expands:{ ...parameter.expands, editable:parameter.expands?.editable !== true } })
}
function setText(index:number, field:'name' | 'description', value:{ value:string; i18nMessages:I18nMessages }) {
  parameterField(index, { [field]:value.value }, value.i18nMessages)
}
function remove(index: number) {
  if (props.disabled || props.published) return
  if (expandedIndex.value === index) expandedIndex.value = -1
  else if (expandedIndex.value > index) expandedIndex.value--
  emit('update:template', removeTemplateParameter(props.template, index))
}
async function add(type:string) {
  if (props.disabled || props.published) return
  const template = props.template
  let sequence = 1
  while (template.parameterDefinitions.some(item => item.id === `parameter${sequence}`)) sequence++
  const id = `parameter${sequence}`
  expandedIndex.value = template.parameterDefinitions.length
  emit('update:template', { ...template, parameterDefinitions:[...template.parameterDefinitions, { id, name:'', valueType:{ type }, expands:{ editable:false } }] })
  await nextTick()
  root.value?.querySelector?.<HTMLElement>(`[data-parameter="${id}"] .metric-parameter__name [role="button"]`)?.click()
}
</script>
<style scoped>
.metric-parameters { display:grid; gap:12px; min-width:0 }
.metric-parameters__permission { display:inline-flex; align-items:center; gap:4px; flex:none; border:0; padding:0; background:transparent; color:var(--ink-3); font:inherit; cursor:pointer; min-height:24px }
.metric-parameters__permission:disabled { cursor:default }
.metric-parameters__permission:focus-visible { outline:1px solid var(--accent); border-radius:4px }
.metric-parameters :deep(.metric-parameters__more) { flex:none; width:20px; height:24px; padding:0; color:var(--ink-3); opacity:0 }
.metric-parameters :deep(.metric-parameter:hover .metric-parameters__more),.metric-parameters :deep(.metric-parameter:focus-within .metric-parameters__more) { opacity:1 }
@media(hover:none) { .metric-parameters :deep(.metric-parameters__more) { opacity:1 } }
.metric-parameters__unused { color:var(--ink-3); font-size:11px }
.metric-parameters__references { display:flex; align-items:center; flex-wrap:wrap; gap:4px 6px; font-size:12px; margin-top:8px; color:var(--ink-3) }
.metric-parameters__references > :deep(.template-reference) { color:var(--accent) }
</style>
