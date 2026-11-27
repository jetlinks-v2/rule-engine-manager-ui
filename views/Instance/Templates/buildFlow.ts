import { forwardingTargets, getRuleTemplate, isForwardingTemplate } from './catalog'
import { i18nText } from '@jetlinks-web-core/components/I18n/text'
import { localizedTemplateIllustration } from './illustrations'
import type { DeviceSource, FlowNode, TemplateDraft, TemplateId, TemplateParameters, Translate } from './types'

export const encodeNodeText = (value: string) => btoa(String.fromCharCode(...new TextEncoder().encode(value)))
const literal = (value: string) => `'${value.replace(/'/g, "''")}'`
const identifier = (value: string) => `"${value.replace(/"/g, '""')}"`
const numericTypes = new Set(['int', 'long', 'float', 'double', 'number', 'decimal'])
export const isNumericProperty = (property: { valueType?: { type?: string } }) => numericTypes.has(property.valueType?.type || '')

export function validateTemplateParameters(id: TemplateId, parameters: TemplateParameters): string | undefined {
  const template = getRuleTemplate(id)
  if (!template) return 'agentUnknown'
  if (isForwardingTemplate(id) && !forwardingTargets.includes(parameters.target)) return 'required'
  if (id === 'device-summary' && (!['1m','5m','15m','1h'].includes(parameters.window) || !['avg','sum','min','max'].includes(parameters.aggregate))) return 'required'
  if (id === 'threshold-notify' && !['>','>=','<','<='].includes(parameters.comparison)) return 'required'
  if (!template.setup) return
  const source = parameters.source
  if (!source?.product.id || (source.scope === 'devices' && !source.devices.length)) return 'sourceNeeded'
  if (source.devices.some(device => device.productId !== source.product.id)) return 'sourceNeeded'
  if (source.message === 'event' && !source.event?.id) return 'sourceNeeded'
  if (source.message === 'property' && (source.format !== 'message' || id !== 'device-forward') && !source.properties.length) return 'sourceNeeded'
  if ((id === 'device-summary' || id === 'threshold-notify') && (source.message !== 'property' || !source.properties.length || source.properties.some(property => !isNumericProperty(property)))) return 'numericRequired'
  if (id === 'threshold-notify' && (source.properties.length !== 1 || !Number.isFinite(parameters.threshold))) return 'required'
  if (id === 'event-action' && source.message !== 'event') return 'sourceNeeded'
  if (id === 'scheduled-read') {
    if (source.scope !== 'devices' || source.devices.length !== 1 || source.message !== 'property') return 'singleDevice'
    if (parameters.cron.trim().split(/\s+/).length !== 6) return 'invalidCron'
  }
  if (isForwardingTemplate(id) && parameters.target === 'http request' && parameters.url) {
    try { if (!['http:', 'https:'].includes(new URL(parameters.url).protocol)) return 'invalidUrl' } catch { return 'invalidUrl' }
  }
}

export function deviceSourceSql(source: DeviceSource): string {
  const device=source.scope==='devices' && source.devices.length===1 ? source.devices[0].id : '*'
  const topic = `/device/${source.product.id}/${device}/message/${source.message === 'event' ? `event/${source.event!.id}` : 'property/report'}`
  const scope = source.scope === 'devices' ? ` where this.deviceId in (${source.devices.map(device => literal(device.id)).join(', ')})` : ''
  const from = `${identifier(topic)}${scope}`
  if (source.format === 'message') return `select * from ${from}`
  const base = 'this.deviceId deviceId, coalesce(this.productId, this.headers.productId) productId, this.timestamp timestamp'
  if (source.message === 'event') {
    const fields = source.eventFields.length ? source.eventFields.map(field => `${literal(field.id)}, this.data[${literal(field.id)}]`).join(', ') : ''
    return `select ${base}, this.event event, ${fields ? `new_map(${fields})` : 'this.data'} data from ${from}`
  }
  if (source.format === 'fields') {
    const fields = source.properties.map(property => `${literal(property.id)}, this.properties[${literal(property.id)}]`).join(', ')
    return `select ${base}, new_map(${fields}) properties from ${from}`
  }
  const metadata = source.includeMetadata ? ", thing.metadata.property('device', deviceId, entry.key) metadata" : ''
  return `select deviceId, productId, timestamp, entry.key property, entry.value value${metadata} from (select ${base}, unnest(this.properties.entries) entry from ${from}) where entry.key in (${source.properties.map(property => literal(property.id)).join(', ')})`
}

/** Each call owns its nodes and all references, including aggregation mapping keys. */
export function buildTemplateFlow(id: TemplateId, parameters: TemplateParameters, t: Translate, locale: string, nextId:()=>string=()=>crypto.randomUUID()): TemplateDraft {
  const template = getRuleTemplate(id)
  const issue = validateTemplateParameters(id, parameters)
  if (!template || (issue && !(issue==='sourceNeeded' && !parameters.source))) throw new Error(t(`RuleTemplates.${issue || 'agentUnknown'}`))
  const nodes: FlowNode[] = [], pending: TemplateDraft['initialization']['pending'] = []
  const label = (key: string) => t(`RuleTemplates.steps.${key}`)
  const node = (type: string, step: string, config: Record<string, unknown> = {}) => {
    const created: FlowNode = { id:nextId(), type, name:label(step), x:180 + nodes.length * 300, y:180, wires:[[]], ...config }
    nodes.push(created)
    return created
  }
  const link = (from: FlowNode, to: FlowNode) => { from.wires[0].push(to.id) }
  const func = (step: string, body: string) => node('function', step, {
    func:encodeNodeText(`handler.onMessage(function(ruleData) {\n    var data = ruleData.data;\n    ${body}\n});`),
    outputs:1, base64ed:'true', noerr:0,
  })
  const debug = () => node('debug', 'viewResult', { active:true, tosidebar:true, console:false, complete:'true' })
  const later = (target: FlowNode, key: string) => { pending.push({ nodeId:target.id, label:t(`RuleTemplates.${key}`) }); return target }
  const query = (step: string) => later(node('command-support', step, { source:'fixed', serviceId:'', command:'', parameter:'{}', streamOut:'false' }), 'configureQuery')
  let focus: FlowNode | undefined

  if (id === 'transform-response' || id === 'manual-transform') {
    const input = node('rule-input',id === 'manual-transform' ? 'enterData' : 'receive',{executePayload:'{}'})
    focus = func('prepareData', 'return data;')
    const output = node('rule-output','returnResult')
    output.wires = []; link(input,focus); link(focus,output)
    if(id==='manual-transform'){const log=debug();log.x=output.x;log.y=300;link(focus,log)}
  } else if (id === 'parallel-response' || id === 'device-query-all') {
    const input = node('rule-input','receive',{executePayload:'{}'})
    const parallel = node('zip-input','processTogether')
    const first = id === 'parallel-response' ? func('mapInput','return { data: data };') : query('queryDevice')
    const second = id === 'parallel-response' ? func('summarizeInput',"return { fieldCount: data && typeof data === 'object' ? Object.keys(data).length : 0 };") : query('readProperties')
    first.x = second.x = 780; first.y = 100; second.y = 280
    const combine = node('zip-output','combineResults', { flatWhenSingle:true, maxBufferSize:10000,
      mapping:{[first.id]:{alias:id === 'parallel-response' ? 'data' : 'deviceInfo'}, [second.id]:{alias:id === 'parallel-response' ? 'summary' : 'propertyResult'}} })
    const output = node('rule-output','returnResult'); combine.x = 1080; output.x = 1380; output.wires = []
    link(input,parallel); link(parallel,first); link(parallel,second); link(first,combine); link(second,combine); link(combine,output)
    focus = id === 'parallel-response' ? first : combine
  } else if (id === 'device-query') {
    const input = node('rule-input','receive',{executePayload:'{}'}), lookup = query('queryDevice'), output = node('rule-output','returnResult')
    output.wires=[]; link(input,lookup); link(lookup,output); focus=lookup
  } else if (id === 'scheduled-read') {
    const source = parameters.source
    const timer = node('timer','schedule',{cron:parameters.cron,singleton:'true'})
    const read = node('device-message-sender','readProperties',{from:'fixed',waitType:'sync',timeout:'10s',stateOperator:'ignoreOffline',noerr:0,
      message:source ? JSON.stringify({messageType:'READ_PROPERTY',deviceId:source.devices[0]?.id,properties:source.properties.map(property=>property.id)}) : '{}' })
    if(!source)later(read,'configureSource')
    const output=debug(); link(timer,read);link(read,output);focus=read
  } else if (template.setup === 'device-source') {
    const source = parameters.source
    let sql=''
    if(source){
      const records = {...source,format:'records' as const}
      sql=deviceSourceSql(id === 'device-summary' || id === 'threshold-notify' || id === 'device-normalize' ? records : source)
      if (id === 'device-summary') sql = `select deviceId, productId, property, ${parameters.aggregate}(cast(value as double)) value, count(1) total from (${sql}) where value is not null group by interval(${literal(parameters.window)}), deviceId, productId, property`
      if (id === 'threshold-notify') sql = `select * from (${sql}) where value ${parameters.comparison} ${parameters.threshold}`
    }
    const input=node('reactor-ql',(source?.message || (id==='event-action' ? 'event' : 'property')) === 'event' ? 'eventSource' : 'source',{stream:'1',sql:encodeNodeText(sql),base64ed:'true'})
    if(!source)later(input,'configureSource')
    focus=input
    if (isForwardingTemplate(id)) {
      const adapt=parameters.target==='kafka-producer' ? undefined : func('prepareData',parameters.target === 'http request' ? "return { payload: data, contentType: 'application/json' };" : 'return { payload: data };')
      let destination: FlowNode
      if (parameters.target === 'http request') destination=node(parameters.target,'destination',{method:'POST',url:parameters.url,ret:'obj',bodyType:'jsonBody',trustAll:'false'})
      else destination=node(parameters.target,'destination',{topic:parameters.topic})
      if (parameters.target !== 'http request' || !parameters.url) later(destination,'configureTarget')
      if(adapt){link(input,adapt);link(adapt,destination)}else link(input,destination)
    } else if (id === 'event-action') {
      const action=later(node('device-message-sender','operateDevice',{from:'fixed',waitType:'sync',timeout:'10s',noerr:0,message:'{"messageType":"READ_PROPERTY","properties":[]}'}),'configureAction')
      link(input,action)
    } else if (id === 'threshold-notify') {
      link(input,later(node('notify','sendNotice'),'configureNotice'))
    } else link(input,debug())
  }

  let name=t(`RuleTemplates.templates.${id}.title`), description=t(`RuleTemplates.templates.${id}.description`)
  const source=parameters.source
  if (source && template.setup) {
    const object=source.scope === 'devices' && source.devices.length === 1 ? source.devices[0].name : source.product.name
    name=t(`RuleTemplates.named.${id}`,{object})
    const scope=source.scope === 'product' ? t('RuleTemplates.scopeProduct',{product:source.product.name})
      : source.devices.length === 1 ? source.devices[0].name : t('RuleTemplates.scopeDevices',{count:source.devices.length})
    const language=locale.replace('_','-')
    const fields=new Intl.ListFormat(language,{style:'long',type:'conjunction'}).format(source.properties.map(property=>i18nText(property.name || property.id,property.nameI18n,locale)))
    const data=source.message === 'event' ? t('RuleTemplates.dataEvent',{event:source.event!.name || source.event!.id}) : fields || t('RuleTemplates.dataProperties')
    if (id === 'device-forward') description=t('RuleTemplates.forwardDescription',{scope,data,target:parameters.url ? new URL(parameters.url).host : t('RuleTemplates.targetSystem')})
    else if (id === 'scheduled-read') description=t('RuleTemplates.scheduleDescription',{device:object,fields})
    else if (id === 'threshold-notify') {
      const rawUnit=source.properties[0].valueType?.unit || ''
      const unit=({celsius:'℃',fahrenheit:'℉',percent:'%'} as Record<string,string>)[rawUnit] || (/^[a-z][a-zA-Z0-9]*$/.test(rawUnit) ? '' : rawUnit)
      description=t('RuleTemplates.thresholdDescription',{scope,property:fields,comparison:t(`RuleTemplates.comparisons.${parameters.comparison}`),value:String(parameters.threshold),unit})
    }
    else if(id==='device-summary')description=t('RuleTemplates.summaryDescription',{scope,fields,window:t(`RuleTemplates.windows.${parameters.window}`),aggregate:t(`RuleTemplates.aggregates.${parameters.aggregate}`),target:t('RuleTemplates.targetSystem')})
    else if(id==='device-normalize')description=t('RuleTemplates.normalizeDescription',{scope,fields})+(source.includeMetadata ? t('RuleTemplates.metadataDescription') : '')
    else if(id==='event-action')description=t('RuleTemplates.eventActionDescription',{scope,event:source.event!.name || source.event!.id})
    else description=t('RuleTemplates.sourceDescription',{scope,data})
  }
  const thumbnailSvg=localizedTemplateIllustration({id,target:parameters.target,message:source?.message},t)
  return {
    payload:{name:Array.from(name).slice(0,64).join(''),description:Array.from(description).slice(0,200).join(''),modelMeta:JSON.stringify({rev:nextId(),flows:nodes}),metadata:{icon:template.icon,...(thumbnailSvg ? {thumbnailSvg} : {})}},
    initialization:{templateId:id,focusNodeId:pending[0]?.nodeId || focus?.id,pending,source:source ? JSON.parse(JSON.stringify(source)) as DeviceSource : undefined},
  }
}
