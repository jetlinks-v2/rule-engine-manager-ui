import { onScopeDispose, ref } from 'vue'
import { saveRule } from '../../../api/instance'
import { loadRuleTemplateNodes, ruleApiResult } from '../../../api/ruleTemplates'
import { buildTemplateFlow, validateTemplateParameters } from './buildFlow'
import { getRuleTemplate, missingTemplateNodes, templateNodeLabel } from './catalog'
import { defaultTemplateParameters, type TemplateInitialization, type TemplateParameters, type TemplateId, type Translate } from './types'

export interface CreatedTemplateRule { rule:Record<string,unknown> & {id:string}; initialization:TemplateInitialization }
export function useRuleTemplateCreation(t:Translate,locale:()=>string) {
  const available=ref(new Set<string>()),loading=ref(false),loadError=ref(false),creating=ref(false),error=ref(''),validationIssue=ref<string>()
  let generation=0
  async function load() {
    const token=++generation
    loading.value=true;loadError.value=false
    try {const nodes=await loadRuleTemplateNodes();if(token===generation)available.value=nodes}
    catch {if(token===generation){available.value=new Set();loadError.value=true}}
    finally {if(token===generation)loading.value=false}
  }
  function validate(id:TemplateId,parameters:TemplateParameters):boolean {
    validationIssue.value=validateTemplateParameters(id,parameters)
    return !validationIssue.value
  }
  async function create(id:TemplateId,parameters:TemplateParameters,configureLater=false):Promise<CreatedTemplateRule|undefined> {
    if(creating.value)return
    error.value=''
    validationIssue.value=undefined
    const template=getRuleTemplate(id)
    if(!template)return
    if(configureLater)parameters={...defaultTemplateParameters(),target:parameters.target}
    else if(!validate(id,parameters))return
    const missing=missingTemplateNodes(template,available.value,parameters)
    if(missing.length){error.value=t('RuleTemplates.missingNodes',{nodes:missing.map(type=>templateNodeLabel(type,t)).join(', ')});return}
    let draft:ReturnType<typeof buildTemplateFlow>
    try {draft=buildTemplateFlow(id,parameters,t,locale())}
    catch(cause){error.value=cause instanceof Error ? cause.message : t('RuleTemplates.required');return}
    creating.value=true
    try {
      const result=ruleApiResult(await saveRule(draft.payload))
      if(!result || typeof result!=='object' || !('id' in result) || typeof result.id!=='string' || !result.id)throw new Error('missing rule identity')
      return {rule:{...draft.payload,...result,id:result.id},initialization:draft.initialization}
    } catch {error.value=t('RuleTemplates.createFailed')}
    finally {creating.value=false}
  }
  onScopeDispose(()=>{generation++})
  return {available,loading,loadError,creating,error,validationIssue,validate,load,create}
}
