<template>
  <div class="input-schema">
    <div class="input-schema__line" :class="{ 'is-compact':$slots.prefix || $slots.suffix }"><slot name="prefix"><span v-if="!hideTypeLabel">{{ t('inputDataType') }}</span></slot><Editable type="select" :value="modelValue?.type" :component-props="{ disabled, bordered:false, defaultOpen:true, placeholder:t('inputChooseType'), 'aria-label':t('inputDataType'), options:types }" @change="changeType(String($event))" /><slot name="suffix" /></div>
    <details v-if="modelValue?.type === 'enum'" :open="expanded">
      <summary>{{ t('inputConfigureChoices') }} · {{ elements.length }}</summary>
      <div v-for="(element,index) in elements" :key="index" class="input-schema__entry">
        <Editable :value="element.text ?? element.label" :component-props="{disabled,bordered:false,placeholder:t('parameterChoiceLabel'),'aria-label':t('parameterChoiceLabel')}" @change="elementField(index,{text:String($event ?? '')})" />
        <div class="input-schema__line"><MetricParameterValue inline :parameter="{id:'code',name:t('parameterChoiceCode'),valueType:{type:scalarType(element.value)}}" :model-value="element.value" :disabled="disabled" @update:model-value="elementField(index,{value:$event})" /><Editable type="select" :value="scalarType(element.value)" :component-props="{disabled,bordered:false,defaultOpen:true,'aria-label':t('inputCodeType'),options:scalarTypes}" @change="elementField(index,{value:$event === 'double' ? 0 : $event === 'boolean' ? false : ''})" /><a-button v-if="!disabled" type="text" size="small" :aria-label="t('remove')" @click="set('elements',elements.filter((_,i)=>i!==index))"><AIcon type="MinusOutlined" /></a-button></div>
      </div>
      <a-button v-if="!disabled" type="text" size="small" @click="addElement"><AIcon type="PlusOutlined" />{{ t('parameterAddChoice') }}</a-button>
    </details>
    <details v-if="modelValue?.type === 'object'" :open="expanded">
      <summary>{{ t('inputConfigureFields') }} · {{ properties.length }}</summary>
      <div v-for="(property,index) in properties" :key="index" class="input-schema__entry">
        <div class="input-schema__line"><Editable :value="property.name" :component-props="{disabled,bordered:false,placeholder:t('label'),'aria-label':t('label')}" @change="propertyField(index,{name:String($event ?? '')})" /><a-button v-if="!disabled" type="text" size="small" :aria-label="t('remove')" @click="set('properties',properties.filter((_,i)=>i!==index))"><AIcon type="MinusOutlined" /></a-button></div>
        <Editable :value="property.id" :component-props="{disabled,bordered:false,'aria-label':t('declarationId')}" @change="propertyField(index,{id:String($event ?? '').trim()})" />
        <TemplateInputSchema :model-value="property.valueType" :disabled="disabled" @update:model-value="propertyField(index,{valueType:$event})" />
      </div>
      <a-button v-if="!disabled" type="text" size="small" @click="addProperty"><AIcon type="PlusOutlined" />{{ t('inputAddField') }}</a-button>
    </details>
    <div v-if="modelValue?.type === 'array'" class="input-schema__entry"><span>{{ t('inputElementType') }}</span><TemplateInputSchema :model-value="modelValue.elementType as Record<string,unknown>" :disabled="disabled" @update:model-value="set('elementType',$event)" /></div>
    <div v-if="unitEditable !== false && ['int','long','float','double'].includes(String(modelValue?.type))" class="input-schema__line"><span>{{ t('unit') }}</span><Editable :value="modelValue?.unit" :component-props="{disabled,bordered:false,placeholder:t('noUnit'),'aria-label':t('unit')}" @change="set('unit',$event || undefined)" /></div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Editable from '@jetlinks-web-core/components/Editable/index.vue'
import MetricParameterValue from '../MetricParameterValue.vue'
import { metricTypeOptions } from '../parameterPresentation'
import { metricMessages } from '../messages'
const props = defineProps<{modelValue?:Record<string,unknown>;disabled?:boolean;unitEditable?:boolean;hideTypeLabel?:boolean}>()
const emit = defineEmits<{(event:'update:modelValue',value:Record<string,unknown>):void}>()
const {t} = useI18n({useScope:'local',messages:metricMessages})
const expanded = ref(false)
const types = computed(()=>metricTypeOptions(t))
const scalarTypes = computed(()=>types.value.filter(item=>['double','string','boolean'].includes(item.value)))
const scalarType = (value:unknown) => typeof value === 'number' ? 'double' : typeof value === 'boolean' ? 'boolean' : 'string'
const elements = computed(()=>Array.isArray(props.modelValue?.elements) ? props.modelValue.elements as Record<string,unknown>[] : [])
const properties = computed(()=>Array.isArray(props.modelValue?.properties) ? props.modelValue.properties as {id:string;name?:string;valueType?:Record<string,unknown>}[] : [])
function update(value:Record<string,unknown>) { if (!props.disabled) emit('update:modelValue',value) }
function set(key:string,value:unknown) { update({...props.modelValue,[key]:value}) }
function changeType(type:string) {
  expanded.value = type === 'enum' || type === 'object'
  const value = {...props.modelValue,type}
  for (const key of ['elements','properties','elementType','valueType','min','max','scale','unit']) delete (value as Record<string,unknown>)[key]
  if (type === 'enum') Object.assign(value,{elements:[]})
  if (type === 'object') Object.assign(value,{properties:[]})
  if (type === 'array') Object.assign(value,{elementType:{type:'double'}})
  update(value)
}
function elementField(index:number,fields:Record<string,unknown>) { set('elements',elements.value.map((item,i)=>i===index ? {...item,...fields} : item)) }
function propertyField(index:number,fields:Record<string,unknown>) { set('properties',properties.value.map((item,i)=>i===index ? {...item,...fields} : item)) }
function addElement() { let value=0; while(elements.value.some(item=>item.value===value)) value++; set('elements',[...elements.value,{value,text:''}]) }
function addProperty() { let n=1; while(properties.value.some(item=>item.id===`field${n}`)) n++; set('properties',[...properties.value,{id:`field${n}`,name:'',valueType:{type:'double'}}]) }
</script>
<style scoped>
.input-schema { min-width:0; font-size:13px }
.input-schema__line { display:flex; align-items:center; gap:8px; min-height:32px; min-width:0 }
.input-schema__line > :first-child { flex:1; min-width:0 }
.input-schema__line > :deep(.editable-field) { flex:1; min-width:60px; color:var(--accent) }
.input-schema__line.is-compact { flex-wrap:wrap; gap:4px 8px }
.input-schema__line.is-compact > :first-child { flex:none }
.input-schema__line.is-compact > :deep(.editable-field) { flex:0 1 auto; min-width:0 }
.input-schema summary { cursor:pointer; color:var(--ink-3); line-height:28px }
.input-schema__entry { margin:4px 0 8px; padding-left:12px; border-left:1px solid var(--line) }
.input-schema__entry > :deep(.editable-field) { max-width:100%; color:var(--ink-3) }
.input-schema :deep(.metric-parameter-value) { flex:1; min-width:0 }
</style>
