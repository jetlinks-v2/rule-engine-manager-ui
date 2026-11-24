import { defineComponent, h, watch, type Ref } from 'vue'
import type { MetricContext } from '../types'
import { useI18n } from 'vue-i18n'
import type { MetricInputMapping, MetricSourceDescription } from '../types'
import { metricSourceSchema, metricSourceField } from '../sourceSchema'
import { loadMetricDevice, loadMetricProductSources, loadMetricProductName, loadMetricOutput, loadMetricBuiltins, describeMetricProvider, readMetricProvider } from '../../../api/metricSources'
import { localizedTemplate } from '../template/text'
import { metricOutputName } from '../presentation'
import { durationParts } from '../template/window'
import MetricSourceModal from './MetricSourceModal.vue'
import MetricSourceFields from './MetricSourceFields.vue'
import { useMetricSourcePicker } from './useMetricSourcePicker'
import { metricHostMessages } from './messages'
import { sourceKindIcon } from './sources/catalog'

/** 公开来源适配：调用者仅消费 picker 与 host，不依赖设备模块私有弹窗状态。 */
export function useMetricSourceAdapter(context: Ref<MetricContext>) {
  const composer = useI18n({ useScope:'local' })
  const state = useMetricSourcePicker(composer.locale)
  // 宿主可能已创建 local composer；显式合并命名空间，避免后一次 useI18n 的消息被忽略。
  for (const [language, messages] of Object.entries(metricHostMessages)) {
    composer.mergeLocaleMessage(language, { metricSources:messages })
  }
  const t = (key:string, values:Record<string, unknown> = {}) => composer.t(`metricSources.${key}`, values)
  const { locale } = composer
  // 元数据与宿主重绘不撤销待选来源；只有对象身份变化才终止当前选择。
  watch([() => context.value.ownerType, () => context.value.ownerId], state.cancel)
  const host = defineComponent({ name: 'MetricDeviceSourceHost', setup: () => () => state.request.value?.inline ? null : h(MetricSourceModal, { state }) })
  const editor = defineComponent({ name:'MetricDeviceSourceEditor', setup:() => () => h(MetricSourceFields, { state, inline:true }) })
  /** 一次编辑按对象去重取元数据；失败逐输入反馈，不复用其他会话的授权结果。 */
  async function describe(owner:MetricContext, mappings:Record<string, MetricInputMapping>) {
    const reads = new Map<string, ReturnType<typeof loadMetricDevice>>()
    const metrics = new Map<string, ReturnType<typeof loadMetricOutput>>()
    const builtins = new Map<string, ReturnType<typeof loadMetricBuiltins>>()
    const productNames = new Map<string, Promise<string>>()
    let product:ReturnType<typeof loadMetricProductSources> | undefined
    const currentMember = (mapping:MetricInputMapping)=>owner.scope === 'children' && !mapping.thingId && !mapping.providerSource?.configuration.thingId
    const productSource = ()=>product ||= loadMetricProductSources(owner.ownerId)
    const entries = await Promise.all(Object.entries(mappings).map(async ([id, mapping]):Promise<[string,MetricSourceDescription]> => {
      try {
        if (mapping.kind === 'provider' && mapping.providerSource) {
          const reference = mapping.providerSource
          const member = currentMember(mapping)
          const thingId = mapping.thingId || String(reference.configuration.thingId || '') || (member ? '*' : owner.targetId || owner.ownerId)
          if (['things','device-events'].includes(reference.provider) && reference.sourceType === 'event') {
            if (!member && !reads.has(thingId)) reads.set(thingId,loadMetricDevice(thingId))
            const device = member ? undefined : await reads.get(thingId)!
            const event = (member ? (await productSource()).events : device!.events).find(item=>item.id === mapping.id)
            return [id,event ? { label:`${device?.device.name || t('currentDevice')} / ${event.name}`,valueType:event.valueType,capabilities:['subscribe','history'] } : {error:t('sourceMissing')}]
          }
          const result = await describeMetricProvider({id:mapping.id,provider:reference.provider,thingType:mapping.thingType || owner.targetType || owner.ownerType,sourceType:reference.sourceType,configuration:{...reference.configuration,thingId}})
          const schema = metricSourceSchema(result.schema)
          return [id,{label:result.name,detail:member ? t('currentDevice') : thingId,valueType:reference.provider === 'events' ? metricSourceField(schema,String(reference.configuration.valuePath || mapping.id)) : schema,capabilities:result.capabilities}]
        }
        if (mapping.kind === 'builtin') {
          const type = mapping.thingType || owner.targetType || owner.ownerType
          const objectId = mapping.thingId || owner.targetId || owner.ownerId
          const key = JSON.stringify([type, objectId])
          if (!builtins.has(key)) builtins.set(key, loadMetricBuiltins(type, objectId))
          const item = (await builtins.get(key)!).find(item => item.id === mapping.id)
          if (!item) return [id, { error:t('noBuiltins') }]
          const label = type === owner.ownerType && objectId === owner.ownerId ? owner.label || objectId : objectId
          return [id, { label:`${label} / ${item.name}`, detail:item.supportsChildren
            ? `${mapping.includeChildren ? t('includeChildren') : t('directMembers')} · ${item.description}` : item.description,
            unit:item.unit, valueType:{ type:item.valueType || 'long' } }]
        }
        if (mapping.kind === 'metric') {
          if (!mapping.configId || owner.scope === 'children') return [id, { error:t('unsupported') }]
          if (!metrics.has(mapping.configId)) metrics.set(mapping.configId, loadMetricOutput(mapping.configId))
          const { config, template:raw } = await metrics.get(mapping.configId)!
          const template = localizedTemplate(raw, String(locale.value))
          const output = template.outputs.find(item => item.metricId === mapping.id)
          if (mapping.statistics) {
            const spec = mapping.statistics
            const required = spec.period === 'current' ? [mapping.id] : [mapping.id, spec.periodMetricId, spec.coverageMetricId]
            if (!output || config.state !== 'enabled' || config.scope !== 'children' || config.ownerType !== spec.sourceType
              || config.ownerId !== spec.sourceId || config.targetType !== spec.memberType || required.some(id => !template.outputs.some(item => item.metricId === id && item.persist && !item.latestOnly))) {
              return [id, { error:t('metricMissing') }]
            }
            if (mapping.sourceDataVersion && mapping.sourceDataVersion !== config.dataVersion) return [id, { error:t('metricChanged') }]
            const age = durationParts(spec.maxAge)
            const conditionValue = typeof spec.value === 'boolean' ? t(spec.value ? 'statisticsTrue' : 'statisticsFalse') : spec.value
            if (!productNames.has(spec.sourceId)) productNames.set(spec.sourceId, loadMetricProductName(spec.sourceId))
            return [id, { label:`${config.name || template.name} / ${metricOutputName(output, template) || output.metricId}`,
              detail:t('statisticsReadDetail', { scope:t(mapping.includeChildren ? 'includeChildren' : 'directMembers'), product:await productNames.get(spec.sourceId)!,
                operation:t(`statistics_${spec.operation}`), condition:spec.operator ? ` · ${t(`statistics_${spec.operator}`)} ${conditionValue}` : '',
                period:t(`statistics_${spec.period}`), age:age ? t(`statisticsAge_${age.unit}`, { count:age.amount }) : spec.maxAge }),
              unit:spec.operation === 'count' ? undefined : output.unit, valueType:{ type:spec.operation === 'count' ? 'long' : 'double' } }]
          }
          if (!output || config.state !== 'enabled' || config.scope === 'children'
            || config.targetType !== (mapping.thingType || owner.targetType)
            || config.targetId !== (mapping.thingId || owner.targetId || owner.ownerId)) return [id, { error:t('metricMissing') }]
          if (mapping.sourceDataVersion && mapping.sourceDataVersion !== config.dataVersion) return [id, { error:t('metricChanged') }]
          return [id, { label:`${config.name || template.name} / ${metricOutputName(output, template) || output.metricId}`,
            detail:output.metricId, unit:output.unit, valueType:output.valueType ? { type:output.valueType } : undefined }]
        }
        const deviceId = mapping.thingId || owner.targetId || owner.ownerId
        const member = currentMember(mapping)
        if (!member && !reads.has(deviceId)) reads.set(deviceId, loadMetricDevice(deviceId))
        const device = member ? undefined : await reads.get(deviceId)!
        const properties = member ? (await productSource()).properties : device!.properties
        const property = properties.find(item => item.id === mapping.id)
        if (!property && mapping.id !== '$online') return [id, { error:t('sourceMissing') }]
        const label = mapping.id === '$online' ? t('online') : property!.name
        return [id, { label:`${member ? t('currentDevice') : device!.device.name} / ${label}`, detail:mapping.id,
          unit:property?.unit, valueType:property?.valueType }]
      } catch { return [id, { error:t('failed') }] }
    }))
    return Object.fromEntries(entries)
  }
  const readCurrent = (owner:MetricContext,mapping:MetricInputMapping) => {
    const reference = mapping.providerSource
    if (!reference) return Promise.resolve(undefined)
    return readMetricProvider({id:mapping.id,provider:reference.provider,sourceType:reference.sourceType,thingType:mapping.thingType || owner.targetType || owner.ownerType,
      configuration:{...reference.configuration,thingId:mapping.thingId || owner.targetId || owner.ownerId}})
  }
  const pickSource = Object.defineProperty(Object.assign(state.pickSource,{editor,describe,readCurrent,cancel:state.cancel}),'sourceOptions',{get:()=>[
    {value:'property',label:t('propertyData')},{value:'event',label:t('eventData')},{value:'builtin',label:t('builtinData')},{value:'metric',label:t('metrics')},
    {value:'businessEvent',label:t('businessEvent')},{value:'businessQuery',label:t('businessQuery')},
  ].map(option=>({...option,icon:sourceKindIcon(option.value),description:t(`sourceHint_${option.value}`)}))})
  return { pickSource, host }
}
