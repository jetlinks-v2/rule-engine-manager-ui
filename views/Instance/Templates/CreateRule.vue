<template>
  <a-modal open :title="t('RuleTemplates.choose')" :width="1000" :mask-closable="false" :closable="!creation.creating.value" :footer="null" :body-style="{padding:0}" @cancel="close">
    <div class="rule-templates" :aria-busy="creation.creating.value">
      <a-alert v-if="creation.loadError.value" type="warning" show-icon :message="t('RuleTemplates.loadFailed')"><template #action><a-button type="link" @click="creation.load">{{t('RuleTemplates.retry')}}</a-button></template></a-alert>
      <a-alert v-if="creation.error.value" type="error" show-icon :message="creation.error.value" />
      <a-alert v-if="creation.validationIssue.value" type="error" show-icon :message="t(`RuleTemplates.${creation.validationIssue.value}`)" />
      <template v-if="!selected">
        <div class="rule-templates__search"><a-input-search v-model:value="search" allow-clear :placeholder="t('RuleTemplates.search')" :aria-label="t('RuleTemplates.search')" /></div>
        <nav class="rule-templates__categories" :aria-label="t('RuleTemplates.choose')">
          <button type="button" :aria-pressed="!category" @click="category=undefined">{{t('RuleTemplates.all')}}</button>
          <button v-for="group in templateCategories" :key="group" type="button" :aria-pressed="category===group" @click="category=group">{{t(`RuleTemplates.categories.${group}`)}}</button>
        </nav>
        <div class="rule-templates__gallery">
          <button class="rule-templates__blank" type="button" :disabled="creation.creating.value" @click="selectTemplate('blank')"><AIcon type="PlusOutlined" />{{t('RuleTemplates.blankShortcut')}}</button>
          <div v-if="creation.loading.value" class="rule-templates__loading"><a-spin />{{t('RuleTemplates.loading')}}</div>
          <div class="rule-templates__grid">
            <article v-for="template in visibleTemplates" :key="template.id" class="rule-templates__card">
              <span class="rule-templates__heading"><AIcon :type="template.icon" /><strong>{{title(template.id)}}</strong><AIcon type="ArrowRightOutlined" /></span>
              <span class="rule-templates__description">{{description(template.id)}}</span>
              <RuleTemplateDiagram :illustration="{id:template.id}" :label="`${t('RuleTemplates.diagram')} · ${title(template.id)}`" compact />
              <span v-if="unavailable(template).length" class="rule-templates__missing">{{t('RuleTemplates.missingNodes',{nodes:unavailable(template).map(type=>templateNodeLabel(type,t)).join(', ')})}}</span>
              <div class="rule-templates__card-actions"><a-button type="link" :aria-label="`${t('RuleTemplates.viewFlow')} · ${title(template.id)}`" @click="inspectedId=template.id">{{t('RuleTemplates.viewFlow')}}</a-button><a-button :disabled="creation.creating.value || creation.loading.value || unavailable(template).length>0" :aria-label="`${t('RuleTemplates.useTemplate')} · ${title(template.id)}`" @click="selectTemplate(template.id)">{{t('RuleTemplates.useTemplate')}}</a-button></div>
            </article>
          </div>
          <a-empty v-if="!visibleTemplates.length && !creation.loading.value" :description="t('RuleTemplates.noTemplates')"><a-button @click="search='';category=undefined">{{t('RuleTemplates.resetSearch')}}</a-button></a-empty>
        </div>
      </template>
      <template v-else>
        <div class="rule-templates__detail-head"><a-button type="text" :disabled="creation.creating.value" @click="selectedId=undefined"><AIcon type="ArrowLeftOutlined" />{{t('RuleTemplates.back')}}</a-button></div>
        <p class="rule-templates__optional">{{t('RuleTemplates.optionalSetup')}}</p>
        <div class="rule-templates__setup">
          <section class="rule-templates__parameters">
            <a-config-provider :theme="{components:{Form:{itemMarginBottom:16,labelColor:'var(--ink-2)'}}}">
            <DeviceSourceFields :state="source" :id="selected.id" />
            <a-form :model="parameters" class="rule-templates__target-fields" layout="horizontal" label-align="left" :label-col="{flex:'112px'}" :wrapper-col="{flex:1}" label-wrap :colon="false" :required-mark="false">
              <template v-if="isForwardingTemplate(selected.id)">
                <a-form-item name="target" :label="t('RuleTemplates.target')" required><a-select v-model:value="parameters.target" :options="targetOptions" :aria-label="t('RuleTemplates.target')" /></a-form-item>
                <a-form-item v-if="parameters.target==='http request'" name="url" :label="t('RuleTemplates.url')"><a-input v-model:value="parameters.url" :placeholder="t('RuleTemplates.urlPlaceholder')" /></a-form-item>
                <a-form-item v-else name="topic" :label="t('RuleTemplates.topic')"><a-input v-model:value="parameters.topic" /></a-form-item>
              </template>
              <template v-if="selected.id==='device-summary'">
                <a-form-item name="window" :label="t('RuleTemplates.window')"><a-select v-model:value="parameters.window" :options="windowOptions" /></a-form-item>
                <a-form-item name="aggregate" :label="t('RuleTemplates.aggregate')"><a-select v-model:value="parameters.aggregate" :options="aggregateOptions" /></a-form-item>
              </template>
              <template v-if="selected.id==='threshold-notify'">
                <a-form-item name="comparison" :label="t('RuleTemplates.comparison')"><a-select v-model:value="parameters.comparison" :options="comparisonOptions" /></a-form-item>
                <a-form-item name="threshold" :label="t('RuleTemplates.threshold')" required><a-input-number v-model:value="parameters.threshold" style="width:100%" /></a-form-item>
              </template>
              <a-form-item v-if="selected.id==='scheduled-read'" name="cron" :label="t('RuleTemplates.cron')" required><a-select v-model:value="parameters.cron" :options="scheduleOptions" /></a-form-item>
            </a-form>
            </a-config-provider>
          </section>
          <aside class="rule-templates__preview">
            <h3>{{preview?.payload.name || title(selected.id)}}</h3><p>{{preview?.payload.description || description(selected.id)}}</p>
            <RuleTemplateDiagram :illustration="{id:selected.id,target:parameters.target,message:source.message.value}" :label="`${t('RuleTemplates.diagram')} · ${title(selected.id)}`" />
            <p v-if="preview?.initialization.pending.length" class="rule-templates__hint">{{t('RuleTemplates.finishInEditor')}}<br /><span v-for="item in preview.initialization.pending" :key="item.nodeId">{{item.label}}<br /></span></p>
          </aside>
        </div>
        <footer class="rule-templates__footer"><a-button :disabled="creation.creating.value" @click="close">{{t('RuleTemplates.cancel')}}</a-button><a-button :disabled="creation.creating.value" @click="create(selected.id,true)">{{t('RuleTemplates.configureLater')}}</a-button><a-button type="primary" :loading="creation.creating.value" @click="create(selected.id)">{{t('RuleTemplates.create')}}</a-button></footer>
      </template>
    </div>
  </a-modal>
  <a-modal v-if="inspected" open :width="1120" :title="title(inspected.id)" @cancel="inspectedId=undefined">
    <p class="rule-templates__diagram-description">{{description(inspected.id)}}</p>
    <RuleTemplateDiagram :illustration="{id:inspected.id}" :label="`${t('RuleTemplates.diagram')} · ${title(inspected.id)}`" />
    <template #footer><a-button @click="inspectedId=undefined">{{t('RuleTemplates.cancel')}}</a-button><a-button type="primary" :disabled="creation.loading.value || unavailable(inspected).length>0" @click="useInspected">{{t('RuleTemplates.useTemplate')}}</a-button></template>
  </a-modal>
</template>
<script setup lang="ts">
import {computed,nextTick,onMounted,reactive,ref,watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {onlyMessage} from '@jetlinks-web/utils'
import {saveAiAgentHandoff} from '@jetlinks-web-core/layout/components/AiChat/agentHandoff'
import DeviceSourceFields from './DeviceSourceFields.vue'
import RuleTemplateDiagram from './RuleTemplateDiagram.vue'
import {forwardingTargets,getRuleTemplate,isForwardingTemplate,missingTemplateNodes,searchRuleTemplates,templateCategories,templateNodeLabel} from './catalog'
import {buildTemplateFlow} from './buildFlow'
import {useRuleTemplateCreation,type CreatedTemplateRule} from './useRuleTemplateCreation'
import {useTemplateSource} from './useTemplateSource'
import {defaultTemplateParameters,type RuleTemplate,type TemplateCategory,type TemplateId,type TemplateCreationRequest} from './types'
const props=defineProps<{initialRequest?:TemplateCreationRequest}>()
const emit=defineEmits<{(event:'close'):void;(event:'created',value:CreatedTemplateRule):void}>()
const {t,locale}=useI18n()
const creation=useRuleTemplateCreation(t,()=>String(locale.value))
const category=ref<TemplateCategory>(),selectedId=ref<TemplateId>(),search=ref(''),inspectedId=ref<TemplateId>()
const inspected=computed(()=>inspectedId.value ? getRuleTemplate(inspectedId.value) : undefined)
const selected=computed(()=>selectedId.value ? getRuleTemplate(selectedId.value) : undefined)
const source=useTemplateSource(computed(()=>selectedId.value || 'blank'),computed(()=>String(locale.value)))
const parameters=reactive(defaultTemplateParameters())
const values=()=>({...parameters,source:source.source.value})
watch(values,current=>{
  if(selectedId.value && creation.validationIssue.value)creation.validate(selectedId.value,current)
},{deep:true})
const title=(id:TemplateId)=>t(`RuleTemplates.templates.${id}.title`)
const description=(id:TemplateId)=>t(`RuleTemplates.templates.${id}.description`)
const visibleTemplates=computed(()=>searchRuleTemplates(search.value,category.value,t))
const unavailable=(template:RuleTemplate)=>missingTemplateNodes(template,creation.available.value)
const targetOptions=computed(()=>forwardingTargets.filter(type=>creation.available.value.has(type)).map(value=>({value,label:t(`RuleTemplates.targets.${value}`)})))
const windowOptions=computed(()=>['1m','5m','15m','1h'].map(value=>({value,label:t(`RuleTemplates.windows.${value}`)})))
const scheduleOptions=computed(()=>['0 * * * * ?','0 */5 * * * ?','0 */15 * * * ?','0 0 * * * ?'].map((value,index)=>({value,label:windowOptions.value[index].label})))
const aggregateOptions=computed(()=>['avg','sum','min','max'].map(value=>({value,label:t(`RuleTemplates.aggregates.${value}`)})))
const comparisonOptions=computed(()=>['>','>=','<','<='].map(value=>({value,label:t(`RuleTemplates.comparisons.${value}`)})))
const preview=computed(()=>{
  if(!selectedId.value)return
  try {let index=0;return buildTemplateFlow(selectedId.value,values(),t,String(locale.value),()=>`preview-${index++}`)}catch{return undefined}
})
async function create(id:TemplateId,configureLater=false){
  const result=await creation.create(id,values(),configureLater)
  if(!result)return
  if(props.initialRequest?.userGoal)saveAiAgentHandoff({
    clientId:'ruleEditorChat',subjectType:'ruleInstance',subjectId:result.rule.id,subjectName:String(result.rule.name || ''),
    prompt:props.initialRequest.userGoal,source:'rule-template',context:{userGoal:props.initialRequest.userGoal,template:result.initialization,rule:result.rule},
  })
  onlyMessage(t('RuleTemplates.created'));emit('created',result)
}
function selectTemplate(id:TemplateId){
  creation.error.value=''
  creation.validationIssue.value=undefined
  const template=getRuleTemplate(id)
  if(!template?.setup){void create(id);return}
  Object.assign(parameters,defaultTemplateParameters())
  parameters.target=forwardingTargets.find(type=>creation.available.value.has(type)) || 'http request'
  selectedId.value=id
}
const close=()=>{if(!creation.creating.value)emit('close')}
const useInspected=()=>{const id=inspectedId.value;inspectedId.value=undefined;if(id)selectTemplate(id)}
onMounted(async()=>{
  await creation.load()
  const request=props.initialRequest
  if(!request || !getRuleTemplate(request.templateId))return
  selectTemplate(request.templateId)
  if(!selected.value)return
  await nextTick()
  const input=request.parameters || {}
  for(const key of ['url','topic','cron'] as const)if(typeof input[key]==='string')parameters[key]=input[key]
  if(forwardingTargets.includes(input.target as typeof forwardingTargets[number]))parameters.target=input.target as typeof parameters.target
  if(['1m','5m','15m','1h'].includes(String(input.window)))parameters.window=input.window as typeof parameters.window
  if(['avg','sum','min','max'].includes(String(input.aggregate)))parameters.aggregate=input.aggregate as typeof parameters.aggregate
  if(['>','>=','<','<='].includes(String(input.comparison)))parameters.comparison=input.comparison as typeof parameters.comparison
  if(typeof input.threshold==='number')parameters.threshold=input.threshold
  await source.prefill(input)
})
</script>
<style scoped>
.rule-templates{min-width:0;color:var(--ink-1)}
.rule-templates__search{padding:16px 20px 0}
.rule-templates__categories{display:flex;flex-wrap:wrap;gap:8px;padding:16px 20px;border-bottom:1px solid var(--line)}
.rule-templates__categories button{border:0;background:transparent;color:var(--ink-2);padding:6px 12px;border-radius:var(--r-2,6px);font:inherit;cursor:pointer}
.rule-templates__categories button[aria-pressed=true]{background:var(--accent-soft);color:var(--accent)}
.rule-templates__gallery{max-height:66vh;overflow:auto;padding:20px;scrollbar-gutter:stable}
.rule-templates__blank{display:flex;align-items:center;gap:8px;border:0;background:transparent;color:var(--accent);font:inherit;margin-bottom:16px;cursor:pointer}
.rule-templates__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.rule-templates__card{display:flex;flex-direction:column;gap:12px;min-width:0;padding:18px;text-align:start;border:1px solid var(--line);border-radius:var(--r-2,6px);background:var(--panel-background);color:var(--ink-1);font:inherit}
.rule-templates__card:hover{border-color:var(--accent)}
.rule-templates__card-actions{display:flex;gap:8px;justify-content:space-between;margin-top:auto}.rule-templates__card-actions :deep(.ant-btn-link){padding-inline:0}
.rule-templates__diagram-description{color:var(--ink-2);line-height:1.8}
.rule-templates__card:focus-visible,.rule-templates__categories button:focus-visible,.rule-templates__blank:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.rule-templates__heading{display:flex;align-items:center;gap:10px;min-width:0}.rule-templates__heading strong{flex:1;font-weight:500;font-size:14px}
.rule-templates__description{font-size:13px;line-height:1.7;color:var(--ink-2)}
.rule-templates__steps,.rule-templates__missing{font-size:12px;line-height:1.8;color:var(--ink-3);overflow-wrap:anywhere}
.rule-templates__steps{margin-top:auto}.rule-templates__loading{display:flex;gap:12px;align-items:center;margin-bottom:16px;color:var(--ink-3)}
.rule-templates__detail-head{padding:12px 16px;border-bottom:1px solid var(--line)}
.rule-templates__optional{margin:0;padding:14px 20px 0;color:var(--ink-2);font-size:13px}
.rule-templates__setup{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);max-height:65vh;overflow:auto}
.rule-templates__parameters{padding:20px;min-width:0}.rule-templates__preview{padding:24px;min-width:0;border-inline-start:1px solid var(--line)}
.rule-templates__target-fields{padding-top:16px;border-top:1px solid var(--line)}
.rule-templates__preview h3{font-size:16px;line-height:1.6;color:var(--ink-1)}.rule-templates__preview p{font-size:13px;line-height:1.8;color:var(--ink-2)}
.rule-templates__preview ol{padding-inline-start:20px;color:var(--ink-2)}.rule-templates__preview li{padding-block:6px;line-height:1.7}
.rule-templates__hint{display:block;margin-top:8px;font-size:12px;line-height:1.7;color:var(--ink-3)}
.rule-templates__footer{display:flex;justify-content:flex-end;gap:12px;padding:14px 20px;border-top:1px solid var(--line)}
@media(max-width:720px){.rule-templates__grid,.rule-templates__setup{grid-template-columns:minmax(0,1fr)}.rule-templates__preview{border-inline-start:0;border-top:1px solid var(--line)}.rule-templates__gallery{padding:16px}.rule-templates__categories{padding:12px}}
@media(min-width:721px) and (max-width:860px){.rule-templates__setup{grid-template-columns:minmax(0,1fr)}.rule-templates__preview{border-inline-start:0;border-top:1px solid var(--line)}}
</style>
