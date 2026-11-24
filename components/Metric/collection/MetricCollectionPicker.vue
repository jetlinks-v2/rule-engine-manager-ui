<template>
  <a-popover v-model:open="open" :trigger="['click']" placement="bottomLeft" :overlay-style="{maxWidth:'calc(100vw - 24px)'}">
    <button type="button" class="collection-picker__trigger" :aria-label="t(templates ? 'templatePicker' : 'output')" :aria-expanded="open">
      <AIcon :type="templates ? 'AppstoreOutlined' : active ? metricOutputPresentation(active.output,{labels:active.stateLabels}).icon : 'UnorderedListOutlined'" />
      <span>{{ active?.output.label || active?.output.metricId || (value?.length ? t(templates ? 'templatesSelected' : 'outputsSelected',{count:value.length}) : t(templates ? 'allTemplates' : 'all')) }}<small v-if="active && !templates">{{ active.templateName }}</small></span><AIcon type="DownOutlined" />
    </button>
    <template #content>
      <section class="collection-picker" role="dialog" :aria-label="t(templates ? 'templatePicker' : 'output')" @keydown.esc.stop="open=false">
        <header><strong>{{ t(templates ? 'templatePicker' : 'output') }}</strong><a-input ref="searchInput" v-model:value="search" allow-clear :placeholder="t('searchOutputs')" :aria-label="t('searchOutputs')"><template #prefix><AIcon type="SearchOutlined" /></template></a-input></header>
        <div class="collection-picker__body">
          <a-empty v-if="!sections.length" :description="t('noMatches')" :image="simpleImage" />
          <section v-for="section in sections" :key="section.id" class="collection-picker__category">
            <header><strong>{{ section.name }}</strong><a-checkbox :checked="categoryChecked(section.items)" :indeterminate="categoryPartial(section.items)" @change="toggleCategory(section.items)">{{ t('selectCategory') }}</a-checkbox></header>
            <div class="collection-picker__options">
              <a-checkbox v-for="item in section.items" :key="item.id" :checked="isChecked(item.id)" @change="toggle(item.id)">
                <span class="collection-picker__option"><AIcon :type="templates ? 'AppstoreOutlined' : metricOutputPresentation(item.output,{labels:item.stateLabels}).icon" /><span>{{ item.output.label || item.output.metricId }}<small v-if="section.duplicates.has(item.output.metricId)">v{{ item.version }}<template v-if="item.revision != null"> · r{{ item.revision }}</template></small></span><small v-if="item.output.unit && !templates">{{ item.output.unit }}</small></span>
              </a-checkbox>
            </div>
          </section>
        </div>
        <footer><a-button type="text" size="small" @click="draft=undefined">{{ t('resetAll') }}</a-button><small>{{ draft ? t(templates ? 'templatesSelected' : 'outputsSelected',{count:draft.length}) : t(templates ? 'allTemplates' : 'all') }}</small><a-button size="small" @click="open=false">{{ t('cancel') }}</a-button><a-button type="primary" size="small" :disabled="invalid" @click="apply">{{ t('apply') }}</a-button></footer>
        <p :role="draft && draft.length > 128 ? 'alert' : undefined">{{ t(draft && draft.length > 128 ? 'selectionLimit' : templates ? 'templateSelectionHint' : 'selectionHint') }}</p>
      </section>
    </template>
  </a-popover>
</template>
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Empty } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { metricOutputPresentation } from '../outputPresentation'
import { collectionMessages } from './messages'
import type { MetricCollectionGroup, MetricAggregateTemplate } from './types'
type PickerGroup = Pick<MetricCollectionGroup, 'id' | 'templateId' | 'templateName' | 'output' | 'stateLabels'> & Partial<Pick<MetricCollectionGroup, 'version' | 'revision'>>
const props = defineProps<{ groups:(PickerGroup | MetricAggregateTemplate)[]; value?:string[]; templates?:boolean }>()
const emit = defineEmits<{(event:'change',value?:string[]):void;(event:'open'):void}>()
const { t } = useI18n({useScope:'local',messages:collectionMessages})
const simpleImage = Empty.PRESENTED_IMAGE_SIMPLE
const open=ref(false),search=ref(''),draft=ref<string[]>()
const searchInput=ref<{focus():void}>()
const choices=computed<PickerGroup[]>(()=>props.templates ? [...new Map(props.groups.map(item=>[item.templateId,{...item,id:item.templateId,output:{metricId:item.templateId,label:item.templateName}}])).values()] : props.groups.filter((item):item is PickerGroup=>'output' in item))
const active=computed(()=>props.value?.length===1 ? choices.value.find(item=>item.id===props.value![0]) : undefined)
const checked=computed(()=>new Set(draft.value || choices.value.map(item=>item.id)))
const invalid=computed(()=>!!draft.value && (!draft.value.length || draft.value.length>128))
const sections=computed(()=>{
  const query=search.value.trim().toLocaleLowerCase()
  const templates=new Map<string,{id:string;name:string;items:PickerGroup[];duplicates:Set<string>;seen:Set<string>}>()
  for(const item of choices.value) {
    if(query && !`${item.templateName} ${item.output.label || ''} ${item.output.metricId}`.toLocaleLowerCase().includes(query))continue
    const key=props.templates ? 'templates' : item.templateId
    let section=templates.get(key)
    if(!section){section={id:key,name:props.templates ? t('allTemplates') : item.templateName,items:[],duplicates:new Set(),seen:new Set()};templates.set(key,section)}
    if(section.seen.has(item.output.metricId))section.duplicates.add(item.output.metricId)
    section.seen.add(item.output.metricId)
    section.items.push(item)
  }
  return [...templates.values()]
})
const isChecked=(id:string)=>checked.value.has(id)
const categoryChecked=(items:PickerGroup[])=>items.every(item=>isChecked(item.id))
const categoryPartial=(items:PickerGroup[])=>!categoryChecked(items) && items.some(item=>isChecked(item.id))
function toggle(id:string){const next=new Set(checked.value);next.has(id)?next.delete(id):next.add(id);draft.value=[...next]}
function toggleCategory(items:PickerGroup[]){const next=new Set(checked.value);const remove=categoryChecked(items);items.forEach(item=>remove?next.delete(item.id):next.add(item.id));draft.value=[...next]}
function apply(){if(invalid.value)return;const allowed=new Set(choices.value.map(item=>item.id));const ids=draft.value?.filter(id=>allowed.has(id));if(ids && !ids.length)return;emit('change',ids?.length===choices.value.length ? undefined : ids);open.value=false}
watch(open,async value=>{if(value){emit('open');draft.value=props.value ? [...props.value] : undefined;search.value='';await nextTick();searchInput.value?.focus()}})
</script>
<style scoped>
.collection-picker__trigger { display:flex; align-items:center; gap:8px; border:0; background:none; padding:4px 0; max-width:100%; color:var(--ink-1); font:inherit; text-align:left; cursor:pointer }
.collection-picker__trigger>span:not(.anticon) { display:grid; gap:3px; min-width:0; font-weight:600; overflow-wrap:anywhere }
.collection-picker__trigger small { font-size:11px; color:var(--ink-3); font-weight:400 }
.collection-picker__trigger>.anticon { font-size:13px; color:var(--ink-3); flex:none }
.collection-picker__trigger:focus-visible { outline:2px solid var(--accent); outline-offset:4px; border-radius:4px }
.collection-picker { width:min(640px,calc(100vw - 64px)); font-size:12px }
.collection-picker>header { display:grid; gap:10px; padding-bottom:12px }
.collection-picker>header strong { font-size:14px; font-weight:600 }
.collection-picker__body { max-height:min(52vh,460px); overflow:auto; overscroll-behavior:contain; scrollbar-gutter:stable }
.collection-picker__category { padding:12px 0; border-top:1px solid var(--line,#f0f0f0) }
.collection-picker__category>header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px }
.collection-picker__category>header strong { font-size:12px; font-weight:500; color:var(--ink-2); overflow-wrap:anywhere }
.collection-picker__category>header :deep(.ant-checkbox-wrapper) { flex:none; font-size:11px; color:var(--ink-3) }
.collection-picker__options { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px 12px }
.collection-picker__options :deep(.ant-checkbox-wrapper) { margin:0; min-width:0; align-items:flex-start; border-radius:var(--r-2,6px); padding:8px 6px; font-size:12px }
.collection-picker__options :deep(.ant-checkbox-wrapper-checked) { background:var(--accent-soft,#e6f4ff) }
.collection-picker__options :deep(.ant-checkbox-wrapper>span:last-child) { flex:1; min-width:0 }
.collection-picker__option { display:flex; align-items:baseline; gap:7px; min-width:0 }
.collection-picker__option>span:not(.anticon) { flex:1; min-width:0; overflow-wrap:anywhere }
.collection-picker__option>.anticon { color:var(--ink-3); flex:none }
.collection-picker__option small { font-size:11px; color:var(--ink-3) }
.collection-picker__option>span>small { display:block }
.collection-picker>footer { display:flex; align-items:center; gap:8px; border-top:1px solid var(--line,#f0f0f0); padding-top:12px }
.collection-picker>footer>small { flex:1; color:var(--ink-3) }
.collection-picker>p { margin:8px 0 0; font-size:11px; color:var(--ink-3) }
@media(max-width:600px){.collection-picker__options{grid-template-columns:1fr}}
</style>
