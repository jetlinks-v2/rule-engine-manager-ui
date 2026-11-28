import type { RuleTemplate, TemplateCategory, TemplateId, TemplateParameters, Translate } from './types'

export const templateCategories: TemplateCategory[] = ['data-forwarding', 'data-preparation', 'data-query', 'device-actions', 'anomaly-notifications', 'examples']
export const ruleTemplates: RuleTemplate[] = [
  { id:'blank', icon:'BranchesOutlined', nodes:[], steps:[] },
  { id:'device-forward', category:'data-forwarding', icon:'SendOutlined', nodes:['reactor-ql','function'], setup:'device-source', steps:['source','prepareData','destination'] },
  { id:'device-summary', category:'data-forwarding', icon:'BarChartOutlined', nodes:['reactor-ql','function'], setup:'device-source', steps:['source','summarize','destination'] },
  { id:'device-normalize', category:'data-preparation', icon:'FormatPainterOutlined', nodes:['reactor-ql','debug'], setup:'device-source', steps:['source','prepareData','viewResult'] },
  { id:'transform-response', category:'data-preparation', icon:'SwapOutlined', nodes:['rule-input','function','rule-output'], steps:['receive','prepareData','returnResult'] },
  { id:'parallel-response', category:'data-preparation', icon:'BranchesOutlined', nodes:['rule-input','zip-input','function','zip-output','rule-output'], steps:['receive','processTogether','combineResults','returnResult'] },
  { id:'device-query', category:'data-query', icon:'SearchOutlined', nodes:['rule-input','command-support','rule-output'], steps:['receive','queryDevice','returnResult'] },
  { id:'device-query-all', category:'data-query', icon:'ProfileOutlined', nodes:['rule-input','zip-input','command-support','zip-output','rule-output'], steps:['receive','queryTogether','combineResults','returnResult'] },
  { id:'scheduled-query', category:'data-query', icon:'ClockCircleOutlined', nodes:['timer','command-support','function','debug'], steps:['schedule','queryData','prepareData','viewResult'] },
  { id:'scheduled-query-all', category:'data-query', icon:'ClockCircleOutlined', nodes:['timer','zip-input','command-support','zip-output','debug'], steps:['schedule','queryFirst','querySecond','combineResults','viewResult'] },
  { id:'scheduled-read', category:'device-actions', icon:'ClockCircleOutlined', nodes:['timer','device-message-sender','debug'], setup:'schedule', steps:['schedule','readProperties','viewResult'] },
  { id:'event-action', category:'device-actions', icon:'ThunderboltOutlined', nodes:['reactor-ql','device-message-sender'], setup:'device-source', steps:['eventSource','operateDevice'] },
  { id:'threshold-notify', category:'anomaly-notifications', icon:'BellOutlined', nodes:['reactor-ql','notify'], setup:'device-source', steps:['source','checkThreshold','sendNotice'] },
  { id:'manual-transform', category:'examples', icon:'ExperimentOutlined', nodes:['rule-input','function','debug','rule-output'], steps:['enterData','prepareData','viewResult'] },
]
export const forwardingTargets = ['http request', 'mqtt out', 'kafka-producer'] as const
export const getRuleTemplate = (id: string) => ruleTemplates.find(item => item.id === id)
export function searchRuleTemplates(query:string,category:TemplateCategory|undefined,t:Translate):RuleTemplate[] {
  const words=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  return ruleTemplates.filter(item=>item.id!=='blank' && (!category || item.category===category) && words.every(word=>[
    t(`RuleTemplates.templates.${item.id}.title`),t(`RuleTemplates.templates.${item.id}.description`),
    t(`RuleTemplates.categories.${item.category}`),...item.steps.map(step=>t(`RuleTemplates.steps.${step}`)),item.id,...item.nodes,
    ...(isForwardingTemplate(item.id) ? forwardingTargets.map(type=>t(`RuleTemplates.targets.${type}`)) : []),
  ].join(' ').toLocaleLowerCase().includes(word)))
}
export const isForwardingTemplate = (id: TemplateId) => id === 'device-forward' || id === 'device-summary'
export function templateNodeLabel(type:string,t:Translate):string {
  if((forwardingTargets as readonly string[]).includes(type))return t(`RuleTemplates.targets.${type}`)
  const step=({'reactor-ql':'prepareData',function:'prepareData',debug:'viewResult','rule-input':'receive','rule-output':'returnResult','zip-input':'processTogether','zip-output':'combineResults','command-support':'executeCommand',timer:'schedule','device-message-sender':'operateDevice',notify:'sendNotice'} as Record<string,string>)[type]
  return step ? t(`RuleTemplates.steps.${step}`) : t('RuleTemplates.targetSystem')
}
export function missingTemplateNodes(template: RuleTemplate, available: ReadonlySet<string>, parameters?: TemplateParameters): string[] {
  const required = [...template.nodes]
  if (isForwardingTemplate(template.id)) {
    if (parameters) required.push(parameters.target)
    else if (!forwardingTargets.some(type => available.has(type))) required.push('http request / mqtt out / kafka-producer')
  }
  return required.filter(type => !available.has(type))
}
