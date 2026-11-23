import assert from 'node:assert/strict'
import test from 'node:test'
import { effectScope, ref, toRaw } from 'vue'
import { createMetricLoader, flush } from './helpers/metricRuntime.mjs'

const load = createMetricLoader({
  '@jetlinks-web/vite/dist/dynamic-remote': { dynamicRemoteManager:{} },
  '@jetlinks-web-core/utils/consts': { isSubApp:false }, './api': { metricApi:{} },
})
const { useMetricConfigTrial } = load('components/Metric/useMetricConfigTrial.ts')
const template = () => ({ id:'pressure', version:'1', name:'资源压力', parameters:{ factor:1 }, parameterDefinitions:[],
  inputDefinitions:[{ id:'cpu', unit:'%' }, { id:'memory', unit:'%' }],
  definitions:[{ id:'pressure', expression:'(cpu + memory) / 2' }], outputs:[{ metricId:'pressure' }] })
const configuration = () => ({ id:'c', ownerType:'device', ownerId:'macbook', targetType:'device', targetId:'macbook',
  templateId:'pressure', templateVersion:'1', templateRevision:2, parameters:{}, state:'disabled', revision:1,
  inputMappings:{ cpu:{ kind:'property', id:'cpuUsage' }, memory:{ kind:'property', id:'memoryUsage' } } })
const response = value => ({ status:'success', results:[{ metricId:'pressure', value, evaluationTime:1000 }], records:[], recordsTruncated:false })
function setup(api) {
  const scope = effectScope(), config = ref(configuration()), editable = ref(true), source = ref(template())
  const view = scope.run(() => useMetricConfigTrial(source, config, editable, api))
  return { scope, config, editable, source, view }
}
function samples(view, cpu = 20, memory = 60) {
  view.trial.addSample('cpu'); view.trial.patchValue(0, cpu)
  view.trial.addSample('memory'); view.trial.patchValue(1, memory)
  view.trial.updateFacts({ ...view.trial.facts, endAt:2000 })
}

test('显式读取当前样本保留原始时间与0，空值不伪造样本，绑定换代丢弃迟到响应',async()=>{
  const {scope,config,view}=setup({simulateConfig:async()=>response(0)})
  try {
    view.active.value=true
    await view.readSample('cpu',async()=>({value:0,eventTime:1000,ingestTime:1100,processTime:1200,unit:'%'}))
    assert.deepEqual(view.trial.facts.samples.map(({value,eventTime,ingestTime,processTime})=>({value,eventTime,ingestTime,processTime})),[{value:0,eventTime:1000,ingestTime:1100,processTime:1200}])
    await view.readSample('cpu',async()=>undefined)
    assert.equal(view.trial.facts.samples.length,1);assert.equal(view.sampleReadError.value,'sampleReadEmpty')
    let finish
    const pending=view.readSample('cpu',()=>new Promise(resolve=>{finish=resolve}))
    config.value.inputMappings.cpu.id='newSource';finish({value:99,eventTime:2000});await pending
    assert.equal(view.trial.facts.samples.length,0)
  } finally {scope.stop()}
})

test('业务试算提交当前固定模板引用与显式样本，使用后端结果且不保存配置', async () => {
  const requests = []
  const { scope, config, view } = setup({ simulateConfig:async value => { requests.push(value); return response(40) } })
  try {
    const original = structuredClone(toRaw(config.value))
    samples(view, 0, false)
    await view.run()
    assert.equal(requests.length, 1)
    assert.equal(Object.hasOwn(requests[0], 'template'), false)
    assert.deepEqual(requests[0].configuration, original)
    assert.deepEqual(requests[0].samples.map(sample => sample.value), [0, false])
    assert.equal(requests[0].endAt, 2000)
    assert.equal(requests[0].includeRecords, true)
    assert.equal(requests[0].includeIntermediate, true)
    assert.equal(view.trial.results[0].value, 40)
    assert.deepEqual(config.value, original)
  } finally { scope.stop() }
})

test('修改参数保留样本和时钟并丢弃迟到结果，切换来源清除旧样本', async () => {
  let finish
  const { scope, config, view } = setup({ simulateConfig:() => new Promise(resolve => { finish = resolve }) })
  try {
    samples(view)
    const running = view.run()
    config.value.parameters.factor = 0
    assert.deepEqual(view.trial.facts.samples.map(sample => sample.value), [20, 60])
    assert.equal(view.trial.facts.endAt, 2000)
    finish(response(40)); await running
    assert.equal(view.trial.response, undefined)
    assert.equal(view.trial.loading, false)
    config.value.inputMappings.cpu.id = 'otherCpu'
    assert.deepEqual(view.trial.facts.samples, [])
    assert.equal(view.trial.facts.endAt, undefined)
    assert.equal(view.trial.invalid, true)
  } finally { scope.stop() }
})

test('撤权清除样本与迟到结果，继承和缺少公开引用的指标来源不发起试算', async () => {
  let calls = 0, finish
  const { scope, config, editable, view } = setup({ simulateConfig:() => { calls++; return new Promise(resolve => { finish = resolve }) } })
  try {
    samples(view); view.active.value = true
    const running = view.run()
    editable.value = false; await flush()
    finish(response(40)); await running
    assert.equal(view.active.value, false)
    assert.equal(view.trial.response, undefined)
    await view.run(); assert.equal(calls, 1)
    editable.value = true; config.value.scope = 'children'; await flush()
    assert.equal(view.supported.value, false)
    await view.run(); assert.equal(calls, 1)
    config.value.scope = 'single'; config.value.inputMappings.cpu.kind = 'metric'; await flush()
    assert.equal(view.supported.value, false)
    await view.run(); assert.equal(calls, 1)
  } finally { scope.stop() }
})

test('公开指标引用生成独立来源的显式样本并提交真实业务试算', async () => {
  const requests=[]
  const {scope,config,view}=setup({simulateConfig:async request=>{requests.push(request);return response(25)}})
  try {
    config.value.inputMappings.cpu={kind:'metric',configId:'source-config',id:'cpuUsage'}
    await flush()
    samples(view,20,30)
    assert.equal(view.supported.value,true)
    assert.equal(view.trial.facts.samples[0].configId,'source-config')
    assert.equal(view.trial.facts.samples[1].configId,undefined)
    await view.run()
    assert.equal(requests.length,1)
    assert.equal(requests[0].samples[0].configId,'source-config')
  } finally {scope.stop()}
})

test('同一属性可供多个输入使用，一条样本在所有相关节点显示且不重复发送', async () => {
  const requests = []
  const { scope, config, view } = setup({ simulateConfig:async request => { requests.push(request); return response(20) } })
  try {
    config.value.inputMappings.memory = { ...config.value.inputMappings.cpu }
    view.trial.addSample('cpu'); view.trial.patchValue(0, 20)
    assert.equal(view.trial.invalid, false)
    assert.equal(view.trial.preview.nodes['input-0'].entry.sample.value, 20)
    assert.equal(view.trial.preview.nodes['input-1'].entry.sample.value, 20)
    await view.run()
    assert.equal(requests[0].samples.length, 1)
  } finally { scope.stop() }
})
