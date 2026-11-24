<template>
  <button type="button" class="source-row" :aria-pressed="selected" @click="$emit('select')">
    <AIcon :type="item.methods[0].icon || sourceKindIcon(item.methods[0].kind)" /><span class="source-row__copy"><b>{{ item.name }}<small v-if="item.methods[0].unit">{{ item.methods[0].unit }}</small></b><small>{{ summary }}</small></span>
    <span v-if="reference && preview" class="source-row__preview"><MetricValueView :template="preview.template" :output="preview.output" :value="preview.value" inline hide-quality /><time v-if="previewTime">{{ new Date(previewTime).toLocaleString(String(locale),{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) }}</time></span>
    <AIcon v-if="selected" type="CheckOutlined" />
  </button>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { metricHostMessages } from '../messages'
import MetricValueView from '../../MetricValue.vue'
import { metricMessages } from '../../messages'
import { parameterTypeKeys } from '../../parameterPresentation'
import { sourceKindIcon, type SourceItem } from './catalog'
const props=defineProps<{item:SourceItem;selected:boolean;declaration?:boolean;reference?:boolean}>()
defineEmits<{(event:'select'):void}>()
const {t,locale}=useI18n({useScope:'local',messages:{zh:{...metricMessages.zh,...metricHostMessages.zh},en:{...metricMessages.en,...metricHostMessages.en}}})
const preview=computed(()=>props.item.methods[0].preview)
const previewTime=computed(()=>preview.value?.value?.evaluationTime || preview.value?.value?.eventTime)
const summary=computed(()=>{
  if (props.reference) return props.item.group || ''
  if (!props.declaration) return [...new Set(props.item.methods.flatMap(method=>method.capabilities))].map(value=>t(`capability_${value}`)).join(' · ')
  const method=props.item.methods[0], schema=method.valueType, type=String(schema?.type || '')
  const detail=Array.isArray(schema?.elements) ? t('referenceChoices',{count:schema.elements.length}) : Array.isArray(schema?.properties) ? t('referenceFields',{count:schema.properties.length}) : ''
  return [method.id,t(type === 'date' ? 'inputDateType' : parameterTypeKeys[type] || 'inputUndeclaredType'),detail].filter(Boolean).join(' · ')
})
</script>
<style scoped>
.source-row { display:flex; align-items:center; gap:8px; width:100%; min-width:0; min-height:44px; padding:8px; border:1px solid transparent; border-radius:var(--r-2,6px); background:transparent; text-align:left; color:var(--ink-2); cursor:pointer }
.source-row:hover { background:var(--bg-sunken) }
.source-row[aria-pressed=true] { background:var(--accent-soft); border-color:var(--accent); color:var(--accent) }
.source-row:focus-visible { outline:2px solid var(--accent); outline-offset:1px }
.source-row__copy { flex:1; min-width:0 }
.source-row__copy>b { display:flex; gap:8px; font-size:13px; font-weight:500; overflow-wrap:anywhere }
.source-row__copy small { font-size:12px; font-weight:400; color:var(--ink-3) }
.source-row__copy>b>small { margin-left:auto; flex:none }
.source-row__preview{display:grid;justify-items:end;gap:2px;min-width:0;max-width:40%}.source-row__preview time{font-size:11px;color:var(--ink-3)}
</style>
