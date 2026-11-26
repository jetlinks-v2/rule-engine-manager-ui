import assert from 'node:assert/strict'
import test from 'node:test'
import {effectScope,ref} from 'vue'
import {resolve} from 'node:path'
import {createMetricLoader,flush,sourceRoot} from './helpers/metricRuntime.mjs'
const load=createMetricLoader({[resolve(sourceRoot,'components/Metric/api.ts')]:{metricApi:{}}})
const {useMetricHistoryAggregate}=load('components/Metric/history/useMetricHistoryAggregate.ts')
const result={operations:[{id:'avg',name:'平均值',icon:'BarChartOutlined'}],operation:'avg',interval:1000,buckets:[{from:1000,to:2000,value:2},{from:2000,to:3000,value:null},{from:3000,to:4000}]}

test('汇总按需读取完整范围，空桶保留缺口且不产生执行身份，刷新取消前次查询',async()=>{
  const scope=effectScope(),reference=ref({configId:'C',outputId:'O',targetType:'device',targetId:'D'}),bounds=ref([1000,10000]),available=ref(true),calls=[]
  const api={aggregateHistory:async(id,query,signal)=>{calls.push({id,query,signal});return result}}
  const state=scope.run(()=>useMetricHistoryAggregate(reference,bounds,available,api))
  try{
    await flush();assert.equal(calls.length,0)
    state.describe();await flush();assert.equal(calls.length,1);assert.equal(calls[0].query.operation,undefined)
    state.operation.value='avg';await flush();assert.equal(calls.length,2)
    assert.deepEqual(calls[1].query,{output:'O',targetType:'device',targetId:'D',from:1000,to:10000,interval:1000,operation:'avg'})
    assert.deepEqual(state.values.value.map(v=>v.value),[2,null,null]);assert.ok(state.values.value.every(v=>!v.resultId && !v.executionId))
    assert.equal(state.values.value[1].status,'invalid')
    await state.refresh();assert.equal(calls.length,3);assert.equal(calls[1].signal.aborted,true)
    available.value=false;await flush();assert.deepEqual(state.values.value,[]);assert.equal(state.operation.value,'')
  }finally{scope.stop()}
})

test('来源切换和卸载取消请求，迟到汇总不能填入新来源',async()=>{
  const scope=effectScope(),reference=ref({configId:'A',outputId:'value'}),bounds=ref([1000,10000]),available=ref(true),pending=[]
  const state=scope.run(()=>useMetricHistoryAggregate(reference,bounds,available,{aggregateHistory:(_id,_query,signal)=>new Promise(resolve=>pending.push({signal,resolve}))}))
  try{
    state.operation.value='avg';await flush();assert.equal(pending.length,1)
    reference.value={configId:'B',outputId:'value'};await flush();assert.equal(pending[0].signal.aborted,true)
    pending[0].resolve(result);await flush();assert.deepEqual(state.values.value,[])
    state.describe();await flush();scope.stop();assert.equal(pending[1].signal.aborted,true)
  }finally{scope.stop()}
})

test('配置口径变化清除旧汇总，并将新口径传到查询边界',async()=>{
  const scope=effectScope(),reference=ref({configId:'C',outputId:'value'}),bounds=ref([1000,10000]),version=ref('v1'),calls=[]
  const state=scope.run(()=>useMetricHistoryAggregate(reference,bounds,ref(true),{aggregateHistory:async(_id,query,signal)=>{calls.push({query,signal});return result}},version))
  try{
    state.operation.value='avg';await flush();assert.equal(calls[0].query.dataVersion,'v1')
    version.value='v2';await flush();assert.equal(calls[0].signal.aborted,true)
    assert.equal(state.operation.value,'');assert.deepEqual(state.values.value,[])
    state.describe();await flush();assert.equal(calls[1].query.dataVersion,'v2')
    assert.equal(calls[1].query.operation,undefined)
  }finally{scope.stop()}
})

test('实时推送只推进原始时间轴，汇总仅随查询意图或刷新重读',async()=>{
  const scope=effectScope(),bounds=ref([1000,10000]),queryKey=ref('1h'),calls=[]
  const state=scope.run(()=>useMetricHistoryAggregate(ref({configId:'C',outputId:'value'}),bounds,ref(true),{aggregateHistory:async(_id,query)=>{calls.push(query);return result}},undefined,queryKey))
  try{
    state.operation.value='avg';await flush();assert.equal(calls.length,1)
    bounds.value=[2000,11000];await flush();assert.equal(calls.length,1);assert.deepEqual(state.bounds.value,[1000,10000])
    await state.refresh();assert.equal(calls.length,2);assert.deepEqual(state.bounds.value,[2000,11000])
    bounds.value=[1000,20000];queryKey.value='24h';await flush();assert.equal(calls.length,3)
  }finally{scope.stop()}
})

test('首个部分时间桶仍在所选范围内显示，桶边界保留在来源信息中',async()=>{
  const scope=effectScope()
  const state=scope.run(()=>useMetricHistoryAggregate(ref({configId:'C',outputId:'value'}),ref([1500,10000]),ref(true),{aggregateHistory:async()=>result}))
  try{
    state.operation.value='avg';await flush()
    assert.equal(state.values.value[0].evaluationTime,1500)
    assert.equal(state.values.value[0].tags.historyAggregation.from,1000)
  }finally{scope.stop()}
})

test('状态分布默认查询完整范围，等待范围就绪，不随实时边界轮询；原始选择与撤权均生效',async()=>{
  const scope=effectScope(),bounds=ref(),queryKey=ref('1h'),available=ref(true),calls=[]
  const response={operations:[{id:'distribution',name:'记录分布',icon:'HeatMapOutlined'}],operation:'distribution',interval:1000,buckets:[{from:1000,to:2000,states:[{state:false,count:500},{state:null,count:1}]}]}
  const state=scope.run(()=>useMetricHistoryAggregate(ref({configId:'C',outputId:'state'}),bounds,available,{aggregateHistory:async(_id,query,signal)=>{calls.push({query,signal});return response}},undefined,queryKey,ref('distribution'),ref(10)))
  try{
    await flush();assert.equal(calls.length,0)
    bounds.value=[1000,11000];await flush();assert.equal(calls.length,1)
    assert.equal(calls[0].query.operation,'distribution');assert.equal(calls[0].query.interval,1000)
    assert.equal(state.response.value.buckets[0].states.reduce((sum,entry)=>sum+entry.count,0),501)
    bounds.value=[2000,12000];await flush();assert.equal(calls.length,1)
    state.operation.value='';await flush();queryKey.value='custom';await flush();assert.equal(calls.length,1)
    state.operation.value='distribution';await flush();assert.equal(calls.length,2)
    available.value=false;await flush();assert.equal(calls[1].signal.aborted,true);assert.equal(state.response.value,undefined);assert.deepEqual(state.operations.value,[])
    available.value=true;await flush();assert.equal(calls.length,3)
  }finally{scope.stop()}
})

test('缩小查看时段后，已不适用的手动桶宽恢复自动间隔',async()=>{
  const scope=effectScope(),bounds=ref([1000,3601000]),queryKey=ref('hour'),calls=[]
  const state=scope.run(()=>useMetricHistoryAggregate(ref({configId:'C',outputId:'value'}),bounds,ref(true),{aggregateHistory:async(_id,query)=>{calls.push(query);return result}},undefined,queryKey))
  try{
    state.interval.value=60000;state.operation.value='avg';await flush()
    bounds.value=[1000,11000];queryKey.value='detail';await flush()
    assert.equal(state.interval.value,0);assert.equal(calls.at(-1).interval,1000)
  }finally{scope.stop()}
})
