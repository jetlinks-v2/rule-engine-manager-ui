import { request, type Request } from '@jetlinks-web/core'
import { parseJsonResponseWithPrecision } from '@jetlinks-web-core/utils/json'
import { metricApi as readApi } from './readApi'
export * from './readApi'
import type { MetricApi, MetricConfig, MetricTemplate, MetricTemplateEntity, MetricTemplateRevision, MetricSimulationResponse } from './types'

const options = { hiddenError: true, transformResponse: [parseJsonResponseWithPrecision] }
const http: Pick<Request, 'get' | 'post' | 'put' | 'remove'> = request
const id = encodeURIComponent
function result<T>(response: { result: T; status?: number; message?: string }): T {
  if (response.status && response.status >= 400) throw new Error(response.message || String(response.status))
  return response.result
}
/** 管理请求复用平台传输和授权上下文；结果查询由 core 提供。 */
export const metricApi: MetricApi = {
  ...readApi,
  bindObjectMetric: async binding => result(await http.post<import('./types').MetricObjectBindingView>('/metric/bindings', binding, options)),
  unbindObjectMetric: async (type, objectId, bindingId) => { result(await http.remove(`/metric/bindings/${id(type)}/${id(objectId)}/${id(bindingId)}`, undefined, options)) },
  simulateConfig: async simulation => result(await http.post<MetricSimulationResponse>('/metric/configs/simulate', simulation, options)),
  selectable: async () => result(await http.get<MetricTemplateEntity[]>('/metric/configs/templates', undefined, options)),
  saveConfig: async config => result(await http.post<MetricConfig>('/metric/configs', config, options)),
  outputStorageConstraints: async configId => result(await http.get<string[]>(`/metric/configs/${id(configId)}/output-storage/constraints`, undefined, options)),
  setFeatured: async (configId, revision, featured) => result(await http.post<MetricConfig>(`/metric/configs/${id(configId)}/featured`, { revision, featured }, options)),
  orderConfigs: async request => result(await http.post<MetricConfig[]>('/metric/configs/_order', request, options)),
  removeConfig: async configId => { result(await http.remove(`/metric/configs/${id(configId)}`, undefined, options)) },
  queryTemplates: async query => result(await http.post<{ data: MetricTemplateEntity[]; total: number }>('/metric/templates/_query', query, options)),
  saveTemplate: async (template, editRevision) => result(await http.post<MetricTemplateEntity>(`/metric/templates${editRevision === undefined ? '' : `?editRevision=${editRevision}`}`, template, options)),
  releaseTemplate: async (templateId, editRevision) => result(await http.post<MetricTemplateEntity>(`/metric/templates/${id(templateId)}/_release${editRevision === undefined ? '' : `?editRevision=${editRevision}`}`, undefined, options)),
  discardTemplateDraft: async (templateId, editRevision) => result(await http.post<MetricTemplateEntity>(`/metric/templates/${id(templateId)}/_discard-draft?editRevision=${editRevision}`, {}, options)),
  templateRevisions: async (templateId, before) => result(await http.get<MetricTemplateRevision[]>(`/metric/templates/${id(templateId)}/revisions`, { before }, options)),
  templateReferences: async (templateId, cursor) => result(await http.get<MetricConfig[]>(`/metric/configs/template/${id(templateId)}/references`, { cursor, limit: 32 }, options)),
  applyTemplateRevision: async (configId, revision, expectedRevision) => result(await http.post<MetricConfig>(`/metric/configs/${id(configId)}/template-revision/${revision}?expectedRevision=${expectedRevision}`, undefined, options)),
  setAvailable: async (templateId, available) => { result(await http.put(`/metric/templates/${id(templateId)}/available/${available}`, undefined, options)) },
  removeTemplate: async templateId => { result(await http.remove(`/metric/templates/${id(templateId)}`, undefined, options)) },
  simulate: async simulation => result(await http.post<MetricSimulationResponse>('/metric/templates/_simulate', simulation, options))
}
