import assert from 'node:assert/strict'
import test from 'node:test'
import { effectScope, ref } from 'vue'
import { createMetricLoader, flush } from './helpers/metricRuntime.mjs'

const load = createMetricLoader({ '@jetlinks-web/vite/dist/dynamic-remote': { dynamicRemoteManager:{} },
  '@jetlinks-web-core/utils/consts': { isSubApp:false }, './api': { metricApi:{} }, '../api': { metricApi:{} } })
const { useMetricTemplates } = load('components/Metric/template/useMetricTemplates.ts')
const { useTemplateSimulation } = load('components/Metric/template/useTemplateSimulation.ts')
const { useMetricConfigTrial } = load('components/Metric/useMetricConfigTrial.ts')
const template = () => ({ id:'window', version:'1', name:'窗口统计', parameters:{}, parameterDefinitions:[],
  inputDefinitions:[{ id:'reading', name:'读数', valueType:{type:'double'} }],
  definitions:[{id:'average', sourceMetric:'reading', aggregation:'avg', window:{mode:'time',size:'PT15M'}},
    {id:'high', expression:'average > 10', dependsOn:['average'], temporalCondition:{enterExpression:'average > 10', dwell:'PT1M'}}],
  outputs:[{metricId:'high'}] })
const response = value => ({status:'success',results:[{metricId:'high',value,evaluationTime:10000}],records:[],recordsTruncated:false})
function setup() {
  const scope=effectScope(), editable=ref(true), requests=[], finishes=[]
  const owner=scope.run(()=>useMetricTemplates(editable,{simulate:request=>{requests.push(request);return new Promise(resolve=>finishes.push(resolve))}}))
  const trial=scope.run(()=>useTemplateSimulation({template:owner.draft,text:owner.simulationText,format:owner.format,
    results:owner.simulationResults,response:owner.simulationResponse,loading:owner.simulating,invalidate:owner.invalidateSimulation,
    execution:{run:owner.simulate,enabled:()=>editable.value}}))
  owner.open({id:'entity',template:template()}); trial.reset()
  return {scope,editable,requests,finishes,owner,trial}
}
function samples(trial) {
  trial.addSample('reading'); trial.patchValue(0,0)
  trial.addSample('reading'); trial.patchValue(1,20)
  trial.updateFacts({...trial.facts,endAt:10000,samples:trial.facts.samples.map((sample,index)=>({...sample,eventTime:1000+index*1000,processTime:1000+index*1000}))})
}

test('确认样本后500ms合并请求，运行中仅排队最新修改并重放完整窗口与持续条件',async t=>{
  t.mock.timers.enable({apis:['setTimeout']})
  const {scope,requests,finishes,owner,trial}=setup()
  try {
    t.mock.timers.tick(1000); assert.equal(requests.length,0,'打开模板不执行')
    samples(trial); trial.patchValue(1,30)
    t.mock.timers.tick(499); assert.equal(requests.length,0)
    t.mock.timers.tick(1); assert.equal(requests.length,1)
    assert.equal(owner.simulating.value,true)
    trial.patchValue(0,10); trial.patchValue(1,40)
    assert.equal(owner.simulating.value,true,'失效不能伪装成请求已经结束')
    t.mock.timers.tick(500); assert.equal(requests.length,1,'同一会话最多一个在途请求')
    finishes[0](response('old')); await flush()
    assert.equal(owner.simulationResponse.value,undefined); assert.equal(requests.length,2)
    assert.deepEqual(requests[1].samples.map(x=>x.value),[10,40]); assert.equal(requests[1].endAt,10000)
    assert.deepEqual(requests[1].template.definitions,template().definitions)
    assert.equal(requests[1].includeIntermediate,true); assert.equal(requests[1].includeRecords,true)
    finishes[1](response('backend-only')); await flush()
    assert.equal(trial.preview.nodes['output-0'].entry.value.value,'backend-only','直接使用后端结果')
    trial.selectTime(1000); t.mock.timers.tick(1000); assert.equal(requests.length,2,'观察游标不执行')
  } finally {scope.stop()}
})

test('无效输入阻止自动执行，修正后恢复；手动执行消耗待执行任务，关闭清理',async t=>{
  t.mock.timers.enable({apis:['setTimeout']})
  const {scope,requests,finishes,owner,trial,editable}=setup()
  try {
    samples(trial); trial.setSampleInvalid(true)
    t.mock.timers.tick(1000); assert.equal(requests.length,0)
    trial.setSampleInvalid(false); t.mock.timers.tick(500); assert.equal(requests.length,1)
    finishes[0](response(false)); await flush()
    trial.patchValue(0,25); const manual=trial.run()
    assert.equal(requests.length,2)
    finishes[1](response(true)); await manual
    t.mock.timers.tick(1000); assert.equal(requests.length,2,'手动试算不会叠加自动请求')
    trial.patchValue(0,null); t.mock.timers.tick(1000); assert.equal(requests.length,2)
    trial.patchValue(0,0); editable.value=false; t.mock.timers.tick(1000); assert.equal(requests.length,2)
    editable.value=true; trial.patchValue(0,1); owner.close(); t.mock.timers.tick(1000); assert.equal(requests.length,2)
    owner.open({id:'other',template:template()}); trial.reset(); samples(trial)
    scope.stop(); t.mock.timers.tick(1000); assert.equal(requests.length,2)
  } finally {scope.stop()}
})

test('业务配置共用自动调度，关闭试算丢弃迟到结果；失败不自动重试',async t=>{
  t.mock.timers.enable({apis:['setTimeout']})
  const scope=effectScope(), requests=[], finishes=[], editable=ref(true)
  const config=ref({id:'config',templateId:'window',templateVersion:'1',targetType:'device',targetId:'device',
    inputMappings:{reading:{kind:'property',id:'temperature'}},parameters:{},scope:'single'})
  const source=ref()
  const view=scope.run(()=>useMetricConfigTrial(source,config,editable,{simulateConfig:request=>{requests.push(request);return new Promise(resolve=>finishes.push(resolve))}}))
  try {
    source.value=template(); await flush()
    assert.equal(view.trial.advanced,false,'异步加载模板后保留图形与时间轴编辑')
    samples(view.trial); t.mock.timers.tick(1000); assert.equal(requests.length,0,'关闭试算时不自动执行')
    view.active.value=true; view.trial.patchValue(0,5); t.mock.timers.tick(500); assert.equal(requests.length,1)
    assert.equal(Object.hasOwn(requests[0],'template'),false,'继续提交固定模板引用')
    assert.deepEqual(requests[0].samples.map(x=>x.value),[5,20])
    view.trial.patchValue(0,10); t.mock.timers.tick(500); view.active.value=false
    finishes[0](response('stale')); await flush(); t.mock.timers.tick(1000)
    assert.equal(requests.length,1); assert.equal(view.trial.response,undefined)
    view.active.value=true; view.trial.patchValue(0,15); t.mock.timers.tick(500)
    finishes[1]({...response(null),status:'failed',error:'Backend unavailable'}); await flush()
    t.mock.timers.tick(10000); assert.equal(requests.length,2); assert.equal(view.error.value,'Backend unavailable')
    view.trial.patchValue(0,20); config.value.inputMappings.reading.id='other'; await flush(); t.mock.timers.tick(1000)
    assert.equal(requests.length,2); assert.deepEqual(view.trial.facts.samples,[])
  } finally {scope.stop()}
})
