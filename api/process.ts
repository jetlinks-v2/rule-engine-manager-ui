import { request } from '@jetlinks-web/core'
import type { ProcessApi } from '@jetlinks-web-core/components/Process/types'

const part = encodeURIComponent, options = { hiddenError: true }
async function result<T>(operation: Promise<{ result: T; status?: number; success?: boolean; message?: string }>): Promise<T> {
  const response = await operation
  if (response.success === false || response.status && response.status >= 400) throw new Error(response.message || String(response.status))
  return response.result
}
const objectRoot = (object: {type:string;id:string}) => `/process/objects/${part(object.type)}/${part(object.id)}`
/** 保留宿主认证和请求上下文；受理回执与执行结果分别读取。 */
export const processApi: ProcessApi = {
  templates: (page, published) => result(request.post('/process/templates/_query', { pageIndex:page,pageSize:20,sorts:[{name:'createTime',order:'desc'}],terms:published === undefined ? [] : [{column:'published',termType:'eq',value:published}] },options)),
  template: key => result(request.get(`/process/templates/${part(key)}`,undefined,options)),
  resolveTemplate: async (id,version) => {
    const page = await result<{data:import('@jetlinks-web-core/components/Process/types').ProcessTemplateEntity[]}>(request.post('/process/templates/_query',{pageSize:1,terms:[{column:'templateId',termType:'eq',value:id},{column:'version',termType:'eq',value:version}]},options))
    if (!page.data[0]) throw new Error('process_template_not_found')
    return page.data[0]
  },
  saveTemplate: (template,expectedRevision) => result(request.post('/process/templates',{template,expectedRevision},options)),
  publish: (key,expectedRevision) => result(request.post(`/process/templates/${part(key)}/_publish`,undefined,{...options,params:{expectedRevision}})),
  validate: template => result(request.post('/process/templates/_validate',template,options)),
  simulate: (template,inputs) => result(request.post('/process/templates/_simulate',{template,inputs},options)),
  configurations: (owner,page) => result(request.post('/process/configs/_query',{pageIndex:page,pageSize:20,sorts:[{name:'createTime',order:'desc'}],terms:[{column:'ownerType',termType:'eq',value:owner.type},{column:'ownerId',termType:'eq',value:owner.id}]},options)),
  saveBinding: (binding,expectedRevision) => result(request.post('/process/configs',{binding,expectedRevision},options)),
  removeBinding: (id,expectedRevision) => result(request.remove(`/process/configs/${part(id)}`,undefined,{...options,params:{expectedRevision}})).then(() => undefined),
  assignments: (owner,after) => result(request.get(`${objectRoot(owner)}/assignments`,{after,size:50},options)),
  runs: (owner,page) => result(request.get(`${objectRoot(owner)}/runs`,{page,size:20},options)),
  run: id => result(request.get(`/process/runs/${part(id)}`,undefined,options)),
  history: (id,page) => result(request.get(`/process/runs/${part(id)}/history`,{page,size:100},options)),
  operations: (id,page) => result(request.get(`/process/runs/${part(id)}/operations`,{page,size:100},options)),
  start: (subject,slot,requestId) => result(request.post('/process/_start',{subject:{type:subject.type,id:subject.id},slot,requestId},options)),
  stop: (id,requestId) => result(request.post(`/process/runs/${part(id)}/_stop`,{requestId},options)),
  reconcile: (id,requestId) => result(request.post(`/process/runs/${part(id)}/_reconcile`,{requestId},options)),
  resume: (id,requestId) => result(request.post(`/process/runs/${part(id)}/_resume`,{requestId},options)),
  resolve: (id,operation,requestId,decision,reason) => result(request.post(`/process/runs/${part(id)}/operations/${part(operation)}/_resolve`,{requestId,decision,reason},options)),
}
