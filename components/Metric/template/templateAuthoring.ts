import type { I18nTextMessages } from '@jetlinks-web-core/components/I18n/types'
import type { MetricConfig, MetricTemplate, MetricTemplateEntity, MetricTemplateStarter } from '../types'
import { copy } from '../service'
import { sampleInputs, visualSamples, type SimulationFacts, type SimulationSample } from './simulation'

export interface TemplateExample {
  /** 一条报文可供多个输入使用；恢复后仍只发送一次。 */
  sources: string[][]
  samples: (Pick<SimulationSample, 'value'|'eventTime'|'ingestTime'|'processTime'|'unit'> & { source:number; quality?:unknown })[]
  parameters: Record<string, unknown>
  endAt?: number
}
export interface TemplateAuthoring {
  reference?: { id:string; version:string; revision?:number; name:string; nameI18n?:I18nTextMessages; builtin?:boolean; providerId?:string; providerName?:string }
  example?: TemplateExample
}
export const templateAuthoring = (template:MetricTemplate) => (template.options?.authoring || {}) as TemplateAuthoring

/** 只复制发布快照，绝不把原实体身份或未发布草稿带入新模板。 */
export function templateReferenceStarter(entity:MetricTemplateEntity):MetricTemplateStarter {
  const template = copy(entity.template)
  template.options = { ...template.options, authoring:{ ...templateAuthoring(template), reference:{ id:template.id, version:template.version,
    revision:entity.revision, name:template.name, nameI18n:(template.options?.i18nMessages as Record<string,I18nTextMessages> | undefined)?.name } } }
  return { id:entity.id, name:template.name, description:String(template.options.description || ''), template }
}

/** 编辑样本只保存输入关联和事实，不保存设备身份、事件订阅或业务查询配置。 */
export function captureTemplateExample(template:MetricTemplate, value:Record<string,unknown>):TemplateExample | undefined {
  if (!visualSamples(template,value)) return undefined
  const sources:string[][] = []
  const samples = value.samples.map(sample => {
    const inputs = sampleInputs(template,value,sample)
    let source = sources.findIndex(ids => ids.length === inputs.length && ids.every((id,index) => id === inputs[index]))
    if (source < 0) source = sources.push(inputs) - 1
    const { value:observation,eventTime,ingestTime,processTime,unit,quality } = sample
    return copy({ source,value:observation,eventTime,ingestTime,processTime,unit,...(quality !== undefined ? {quality} : {}) })
  })
  return { sources,samples,parameters:copy(value.configuration.parameters || {}),...(typeof value.endAt === 'number' ? {endAt:value.endAt} : {}) }
}

/** 模拟身份在每次打开时生成，和真实对象绑定完全分离。 */
export function exampleFacts(template:MetricTemplate, example?:TemplateExample):SimulationFacts {
  const configuration:MetricConfig = { ownerType:'simulation',ownerId:'simulation',slot:'simulation',targetType:template.thingType || 'simulation',targetId:'simulation',
    templateId:template.id,templateVersion:template.version,state:'disabled',revision:0,inputMappings:{},parameters:copy(example?.parameters || {}) }
  const groups = example?.sources || []
  const source = (index:number) => ({ kind:'property' as const,thingType:'device',thingId:`simulation-${index}`,id:`sample-${index}` })
  for (const [index,ids] of groups.entries()) for (const id of ids) {
    if (template.inputDefinitions.some(input => input.id === id)) configuration.inputMappings[id] = source(index)
  }
  template.inputDefinitions.forEach((input,index) => { configuration.inputMappings[input.id] ||= source(groups.length + index) })
  return { configuration,samples:(example?.samples || []).filter(sample => groups[sample.source]?.some(id => configuration.inputMappings[id])).map(sample => {
    const {source:index,...fields} = copy(sample)
    const mapping = source(index)
    return {...fields,thingType:mapping.thingType,thingId:mapping.thingId,metricId:mapping.id}
  }),...(example?.endAt !== undefined ? {endAt:example.endAt} : {}) }
}
