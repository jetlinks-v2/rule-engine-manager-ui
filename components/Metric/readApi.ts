import { request, type Request } from '@jetlinks-web/core'
import { subscribeSocketTopic } from '@jetlinks-web-core/utils/websocket-subscriptions'
import { createRuntimeNdJson } from '@jetlinks-web-core/utils/ndjson'
import { parseJsonResponseWithPrecision } from '@jetlinks-web-core/utils/json'
import { map } from 'rxjs'
import { createMetricResultStreams, type MetricWatchFrame } from './resultStreams'
import {compareMetricPresentation} from './featured'
import type { MetricReadApi, MetricBuiltinItem, MetricCalculatorDescriptor, MetricAggregationDescriptor, MetricConfig, MetricLatest, MetricTemplate, MetricTemplateEntity, MetricTemplateRevision, MetricValue, MetricSimulationResponse, MetricResultFrame } from './types'

const options = { hiddenError: true, transformResponse: [parseJsonResponseWithPrecision] }
const http: Pick<Request, 'get' | 'post' | 'put' | 'remove'> = request
const id = encodeURIComponent
export const metricNdjsonWatchResults = createMetricResultStreams((targets, next, error) => {
  const subscription = createRuntimeNdJson().post('/metric/configs/_watch', { targets }).pipe(map((value: unknown) => {
    const envelope = value as { result?: MetricWatchFrame; success?: boolean; status?: number; message?: string }
    if (envelope.success === false || envelope.status && envelope.status >= 400) throw new Error(envelope.message || String(envelope.status))
    return envelope.result || value as MetricWatchFrame
  })).subscribe({ next, error, complete: () => error(new Error('Metric stream closed')) })
  return () => subscription.unsubscribe()
})
/** API 保留平台请求上下文和授权处理；组件只消费领域结果。 */
function result<T>(response: { result: T; status?: number; message?: string }): T {
  if (response.status && response.status >= 400) throw new Error(response.message || String(response.status))
  return response.result
}
/** 类型目录只声明实际后端来源；前端注册负责呈现，不能补造服务端能力。 */
export interface MetricObjectType {
  id:string; name:string; description?:string; icon?:string; i18nName?:string
  metricSource?:{root:boolean;icon?:string}
}
export const loadMetricObjectTypes = async ():Promise<MetricObjectType[]> => result(await http.get<MetricObjectType[]>('/metric/configs/sources/types', undefined, options))

export const metricApi: MetricReadApi = {
  objectBindings: async (type, objectId, cursor, includeDescendants) => result(await http.get<import('./types').MetricObjectBindingPage>(`/metric/bindings/${id(type)}/${id(objectId)}`, {cursor,includeDescendants}, options)),
  aggregateLinked: async query => result(await http.post<import('./collection/types').MetricAggregateResult>('/metric/bindings/_aggregate', query, options)),
  aggregateLinkedTemplates: async query => result(await http.post<import('./collection/types').MetricAggregateTemplate[]>('/metric/bindings/_aggregate/templates', query, options)),
  aggregate: async query => result(await http.post<import('./collection/types').MetricAggregateResult>('/metric/configs/_aggregate', query, options)),
  aggregateTemplates: async query => result(await http.post<import('./collection/types').MetricAggregateTemplate[]>('/metric/configs/_aggregate/templates', query, options)),
  collectionOverview: async query => result(await http.post<import('./collection/types').MetricScopeOverview>('/metric/configs/_collection/overview', query, options)),
  collection: async query => result(await http.post<import('./collection/types').MetricCollectionResult>('/metric/configs/_collection', query, options)),
  builtinSources: async (type, objectId) => result(await http.get<MetricBuiltinItem[]>(`/metric/configs/sources/builtin/${id(type)}/${id(objectId)}`, undefined, options)),
  describeSource: async source => result(await http.post<import('./types').MetricProviderSourceDescription>('/metric/configs/sources/_describe', source, options)),
  readSource: async source => result(await http.post<MetricValue | undefined>('/metric/configs/sources/_read', source, options)),
  templateCategories: async () => {
    const items = result(await http.get<{ value:string; text:string; ordinal?:number }[]>('/dictionary/metric-template-category/items', undefined, options))
    return [...items].sort((a,b) => (a.ordinal || 0) - (b.ordinal || 0)).map(item => ({ value:item.value, label:item.text }))
  },
  calculators: async () => result(await http.get<MetricCalculatorDescriptor[]>('/metric/templates/calculators', undefined, options)),
  aggregations: async () => result(await http.get<MetricAggregationDescriptor[]>('/metric/templates/aggregations', undefined, options)),
  getConfig: async (configId, target) => result(await http.get<MetricConfig>(`/metric/configs/${id(configId)}`, target, options)),
  getResultConfig: async (configId, target) => result(await http.get<MetricConfig>(`/metric/configs/${id(configId)}/result`, target, options)),
  resultTemplate: async (configId, target) => result(await http.get<MetricTemplate>(`/metric/configs/${id(configId)}/result/template`, target, options)),
  byOwner: async (type, ownerId) => result(await http.get<MetricConfig[]>(`/metric/configs/owner/${id(type)}/${id(ownerId)}`, undefined, options)).sort(compareMetricPresentation),
  configTemplate: async (configId, target) => result(await http.get<MetricTemplate>(`/metric/configs/${id(configId)}/template`, target, options)),
  latest: async (configIds, target) => result(await http.post<MetricLatest[]>('/metric/configs/_latest', { configIds, ...target }, options)),
  watchResults: (configId, query, next, error) => {
    const subscription = subscribeSocketTopic<MetricResultFrame>(`metric-watch-${crypto.randomUUID()}`,
      '/metric/configs/results', { configId, query, includeHistory: true })
      .subscribe({ next, error, complete: () => error(new Error('Metric stream closed')) })
    return () => subscription.unsubscribe()
  },
  watchLatest: (configIds, target, interval, onValue, onError) => {
    const subscription = createRuntimeNdJson().post('/metric/configs/_latest', { configIds, ...target, interval })
      .pipe(map((value: unknown) => {
        const envelope = value as { success?: boolean; result?: MetricLatest; message?: string; status?: number }
        if (envelope.success === false || envelope.status && envelope.status >= 400) {
          throw new Error(envelope.message || String(envelope.status))
        }
        return envelope.result || value as MetricLatest
      })).subscribe({ next: onValue, error: onError, complete: () => onError(new Error('Metric stream closed')) })
    return () => subscription.unsubscribe()
  },
  subscribe: (target, interval, onValue, onError) => {
    const subscription = subscribeSocketTopic<MetricValue>(`metric-results-${crypto.randomUUID()}`,
      `/@${target.targetType}/${target.targetId}/metric/*/*/data`, { interval })
      .subscribe({ next: onValue, error: onError })
    return () => subscription.unsubscribe()
  },
  history: async (configId, query) => result(await http.post<MetricValue[]>(`/metric/configs/${id(configId)}/history`, query, options)),
  aggregateHistory: async (configId, query, signal) => result(await http.post<import('./types').MetricHistoryAggregate>(`/metric/configs/${id(configId)}/history/aggregate`, query, { ...options, signal })),
  historyVersions: async (configId, before, target) => result(await http.get<import('./types').MetricConfigHistoryPage>(`/metric/configs/${id(configId)}/history-versions`, { before, ...target }, options)),
  execution: async (configId, output, query, signal) => result(await http.get<import('./types').MetricExecutionSnapshot | undefined>(`/metric/configs/${id(configId)}/execution/${id(output)}`, query, { ...options, signal }))
}
