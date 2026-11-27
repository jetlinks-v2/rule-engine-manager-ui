import {getBaseApi,isFromCloud} from '@jetlinks-web-core/utils'
import {RULE_EDITOR_RESOURCE_VERSION} from './resourceVersion'

/** Keep the editor within the current project, edge, and origin boundary. */
export function buildRuleEditorUrl(ruleId:string):string {
  const query=new URLSearchParams({v:RULE_EDITOR_RESOURCE_VERSION,_parentOrigin:window.location.origin,hideHeader:'true'})
  let base=String(getBaseApi() || '').replace(/\/$/,'')
  if(isFromCloud()){
    base=String(localStorage.getItem('proxy') || '').replace(/\/$/,'')
    const thingId=localStorage.getItem('thingId')
    if(thingId)query.set('_agent',`device:${thingId}`)
  }
  return `${base}/rule-editor/index.html?${query}#flow/${encodeURIComponent(ruleId)}`
}
