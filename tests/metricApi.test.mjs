import assert from 'node:assert/strict'
import test from 'node:test'
import { createMetricLoader } from './helpers/metricRuntime.mjs'
import { resolve } from 'node:path'
import { sourceRoot } from './helpers/metricRuntime.mjs'
import { Observable } from 'rxjs'
import { effectScope, ref } from 'vue'
const precision = createMetricLoader()('utils/json/index.ts')
const httpOptions = { hiddenError:true, transformResponse:[precision.parseJsonResponseWithPrecision] }
const calls = []; let status = 200; let payload = []
const request = Object.fromEntries(['get','post','put','remove'].map(method => [method, async (...args) => { calls.push([method,...args]); return { status, result: payload, message: 'Denied' } }]))
const streams = []
const wsClient = { getWebSocket: (id, topic, parameter) => ({ subscribe: observer => {
  const stream = { id, topic, parameter, observer, stopped:false }
  streams.push(stream)
  return { unsubscribe: () => { stream.stopped = true } }
} }) }
const sampled = []
const createRuntimeNdJson = () => ({ post:(path, body) => new Observable(observer => {
  const stream = { path, body, observer, stopped:false }; sampled.push(stream)
  return () => { stream.stopped = true }
}) })
const load = createMetricLoader({ '@jetlinks-web/core': { request, wsClient }, [resolve(sourceRoot,'utils/json/index.ts')]:precision,
  [resolve(sourceRoot, 'utils/ndjson.ts')]: { createRuntimeNdJson } })
const { metricApi, loadMetricObjectTypes, metricNdjsonWatchResults } = load('components/Metric/api.ts')
const { dispatchSocketSubscriptionError } = load('utils/websocket-subscriptions.ts')

test('保留批量NDJSON请求消费同样的历史和实时帧，取消会释放传输',async()=>{
  const received=[],errors=[]
  const query={outputs:['value'],query:{pageSize:200},interval:1000,targetType:'device',targetId:'one'}
  const stop=metricNdjsonWatchResults('config/one',query,frame=>received.push(frame),error=>errors.push(error.message))
  await new Promise(resolve=>queueMicrotask(resolve))
  const stream=sampled.at(-1)
  assert.equal(stream.path,'/metric/configs/_watch');assert.deepEqual(stream.body.targets[0].query,query)
  assert.equal(stream.body.targets[0].configId,'config/one')
  for(const frame of [{kind:'history',value:{value:1}},{kind:'ready'},{kind:'latest',latest:{configId:'config/one',outputs:{}}}])stream.observer.next({success:true,result:{subscriptionId:stream.body.targets[0].subscriptionId,frame}})
  assert.deepEqual(received.map(frame=>frame.kind),['history','ready','latest']);assert.deepEqual(errors,[])
  stop();await new Promise(resolve=>queueMicrotask(resolve));assert.equal(stream.stopped,true)
})

test('对象目录读取原relation声明，空目录不补造类型且业务失败保留',async()=>{
  payload=[{id:'device',name:'Device'}];status=200
  assert.deepEqual(await loadMetricObjectTypes(),payload)
  assert.deepEqual(calls.at(-1),['get','/relation/types',undefined,httpOptions])
  payload=[];assert.deepEqual(await loadMetricObjectTypes(),[])
  status=503;await assert.rejects(loadMetricObjectTypes(),/Denied/)
  status=200
})

test('default template references do not depend on a backend discovery request',async()=>{
  const { useMetricTemplates } = createMetricLoader({ [resolve(sourceRoot,'components/Metric/api.ts')]:{ metricApi } })('components/Metric/template/useMetricTemplates.ts')
  const scope=effectScope(),model=scope.run(()=>useMetricTemplates(ref(true))),before=calls.length
  try {
    await model.loadStarters()
    assert.equal(calls.length,before)
    assert.equal(model.starterError.value,'')
    assert.equal(model.startersLoading.value,false)
  } finally { scope.stop() }
})

test('指标HTTP响应使用公共精确数值解析，试算和历史取值不丢失精度',async()=>{
  for (const action of [()=>metricApi.simulate({}),()=>metricApi.history('config',{}),()=>metricApi.execution('config','output',{})]) {
    await action()
    const transform=calls.at(-1).at(-1).transformResponse[0]
    assert.deepEqual(transform('{"status":200,"result":[{"value":9007199254740993},{"value":12345678901234567890.123456789},{"value":12.5}]}'),
      {status:200,result:[{value:'9007199254740993'},{value:'12345678901234567890.123456789'},{value:12.5}]})
  }
})

test('periodic latest uses one cancellable NDJSON request and propagates business failures', () => {
  const received = [], failures = [], target = { targetType:'device', targetId:'pump' }
  const stop = metricApi.watchLatest(['first','second'], target, 1000, row => received.push(row), error => failures.push(error.message))
  const stream = sampled.at(-1)
  assert.equal(stream.path, '/metric/configs/_latest')
  assert.deepEqual(stream.body, { configIds:['first','second'], ...target, interval:1000 })
  const row = { configId:'first', outputs:{} }
  stream.observer.next({ success:true, result:row }); stream.observer.next(row)
  assert.deepEqual(received, [row,row])
  stream.observer.next({ success:false, status:403, message:'Denied' })
  assert.deepEqual(failures, ['Denied']); assert.equal(stream.stopped, true)
  stop()
})

test('inherited result requests carry the actual target and subscriptions use asset aliases with a configurable interval', async () => {
  const target = { targetType:'device', targetId:'pump-1' }
  await metricApi.getConfig('product-config', target)
  assert.deepEqual(calls.at(-1).slice(1,3), ['/metric/configs/product-config', target])
  await metricApi.getResultConfig('product-config', target)
  assert.deepEqual(calls.at(-1).slice(1,3), ['/metric/configs/product-config/result', target])
  await metricApi.resultTemplate('product-config', target)
  assert.deepEqual(calls.at(-1).slice(1,3), ['/metric/configs/product-config/result/template', target])
  await metricApi.configTemplate('product-config', target)
  assert.deepEqual(calls.at(-1).slice(1,3), ['/metric/configs/product-config/template', target])
  await metricApi.latest(['product-config'], target)
  assert.deepEqual(calls.at(-1).slice(1,3), ['/metric/configs/_latest', { configIds:['product-config'], ...target }])
  const received = [], failed = []
  const stop = metricApi.subscribe(target, 5000, value => received.push(value), () => failed.push(true))
  const stream = streams.at(-1)
  assert.equal(stream.topic, '/@device/pump-1/metric/*/*/data')
  assert.deepEqual(stream.parameter, { interval:5000 })
  const value = { metricId:'duration', value:123, tags:{ configId:'product-config' } }
  stream.observer.next({ type:'result', payload:value })
  assert.deepEqual(received, [value])
  stream.observer.error(new Error('disconnected'))
  assert.deepEqual(failed, [true])
  stop(); assert.equal(stream.stopped, true)
})
test('business simulation uses the configuration endpoint without an administrator template payload', async () => {
  const value = { configuration:{ templateId:'fixed', templateVersion:'1', templateRevision:2 }, samples:[], endAt:1000, includeRecords:true }
  await metricApi.simulateConfig(value)
  assert.deepEqual(calls.at(-1), ['post', '/metric/configs/simulate', value, httpOptions])
})
test('execution requests encode identities and preserve result, target, auth transport and cancellation', async()=>{
  status = 200
  const controller = new AbortController(), query = {resultId:'result-1',targetType:'device',targetId:'pump'}
  await metricApi.execution('a/b','x/y',query,controller.signal)
  assert.deepEqual(calls.at(-1),['get','/metric/configs/a%2Fb/execution/x%2Fy',query,{...httpOptions,signal:controller.signal}])
})
test('指标API和新增草稿删除使用既有请求上下文、编码ID并拒绝业务失败响应', async () => {
  await metricApi.calculators()
  assert.deepEqual(calls.at(-1), ['get', '/metric/templates/calculators', undefined, httpOptions])
  await metricApi.getConfig('a/b'); await metricApi.byOwner('line', 'a/b'); await metricApi.selectable(); await metricApi.configTemplate('a/b')
  await metricApi.saveConfig({}); await metricApi.removeConfig('a/b'); await metricApi.latest(['a']); await metricApi.history('a/b', {})
  await metricApi.queryTemplates({}); await metricApi.saveTemplate({}); await metricApi.releaseTemplate('a/b'); await metricApi.setAvailable('a/b', false)
  await metricApi.removeTemplate('a/b'); await metricApi.simulate({})
  assert.deepEqual(calls.find(call => call[0] === 'remove' && call[1].includes('/templates')), ['remove','/metric/templates/a%2Fb',undefined,httpOptions])
  assert.ok(calls.some(call => call[1] === '/metric/configs/owner/line/a%2Fb'))
  status = 403; await assert.rejects(metricApi.removeTemplate('denied'), /Denied/)
})

test('模板修订的传输保留编辑CAS、引用游标及配置CAS，不把新修订隐式应用到已有指标', async () => {
  status = 200
  await metricApi.saveTemplate({ name: 'Energy' }, 7)
  assert.equal(calls.at(-1)[1], '/metric/templates?editRevision=7')
  await metricApi.releaseTemplate('a/b', 8)
  assert.equal(calls.at(-1)[1], '/metric/templates/a%2Fb/_release?editRevision=8')
  await metricApi.discardTemplateDraft('a/b', 9)
  assert.equal(calls.at(-1)[1], '/metric/templates/a%2Fb/_discard-draft?editRevision=9')
  await metricApi.templateRevisions('a/b', 33)
  assert.deepEqual(calls.at(-1).slice(0, 3), ['get', '/metric/templates/a%2Fb/revisions', { before: 33 }])
  await metricApi.templateReferences('a/b', 'cursor')
  assert.deepEqual(calls.at(-1).slice(0, 3), ['get', '/metric/configs/template/a%2Fb/references', { cursor: 'cursor', limit: 32 }])
  await metricApi.applyTemplateRevision('c/d', 2, 5)
  assert.equal(calls.at(-1)[1], '/metric/configs/c%2Fd/template-revision/2?expectedRevision=5')
})

test('模板分类读取平台字典当前文案和顺序，业务失败不伪造空分类', async () => {
  status = 200
  payload = [{ value:'energy',text:'能源',ordinal:2 },{ value:'maintenance',text:'设备保养',ordinal:1 }]
  assert.deepEqual(await metricApi.templateCategories(), [{value:'maintenance',label:'设备保养'},{value:'energy',label:'能源'}])
  assert.deepEqual(calls.at(-1), ['get','/dictionary/metric-template-category/items',undefined,httpOptions])
  assert.equal(payload[0].value,'energy', 'mapping must not mutate cached dictionary data')
  status = 403
  await assert.rejects(metricApi.templateCategories(), /Denied/)
  status = 200; payload = []
})

test('可见指标直接增删WebSocket逻辑订阅，其他指标不重建且不发起NDJSON',()=>{
  const before=sampled.length, received=[], failures=[]
  const stopA=metricApi.watchResults('one',{outputs:['value'],query:{}},frame=>received.push(['one',frame]),cause=>failures.push(cause.message))
  const first=streams.at(-1)
  const stopB=metricApi.watchResults('two',{outputs:['value'],query:{}},frame=>received.push(['two',frame]),cause=>failures.push(cause.message))
  const second=streams.at(-1)
  assert.equal(first.topic,'/metric/configs/results');assert.equal(first.parameter.configId,'one')
  assert.equal(first.parameter.includeHistory,true);assert.equal(sampled.length,before)
  first.observer.next({payload:{kind:'history',value:{value:1}}})
  second.observer.next({payload:{kind:'ready'}})
  stopA();assert.equal(first.stopped,true);assert.equal(second.stopped,false)
  second.observer.next({payload:{kind:'latest',latest:{configId:'two',outputs:{}}}})
  assert.deepEqual(received.map(([id,frame])=>[id,frame.kind]),[['one','history'],['two','ready'],['two','latest']])
  assert.deepEqual(failures,[]);stopB()
})

test('单项WebSocket协议错误交给原指标并取消它，其他订阅继续，未识别错误返回公共处理',()=>{
  const failures=[],received=[]
  const stop=metricApi.watchResults('error',{query:{}},()=>assert.fail('no value'),error=>failures.push(error.message))
  const failed=streams.at(-1)
  const otherStop=metricApi.watchResults('other',{query:{}},frame=>received.push(frame),()=>assert.fail('other must stay active'))
  const other=streams.at(-1)
  assert.equal(dispatchSocketSubscriptionError({requestId:failed.id,message:'Denied'}),true)
  assert.deepEqual(failures,['Denied']);assert.equal(failed.stopped,true);assert.equal(other.stopped,false)
  other.observer.next({payload:{kind:'ready'}});assert.equal(received.length,1)
  assert.equal(dispatchSocketSubscriptionError({requestId:failed.id,message:'late error'}),false)
  assert.equal(dispatchSocketSubscriptionError({requestId:'unknown',message:'unknown'}),false)
  stop();otherStop()
})
