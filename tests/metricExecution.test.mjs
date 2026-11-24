import assert from 'node:assert/strict'
import test from 'node:test'
import { effectScope, ref } from 'vue'
import { createMetricLoader, flush, sourceRoot } from './helpers/metricRuntime.mjs'
import { resolve } from 'node:path'

const load = createMetricLoader({[resolve(sourceRoot,'components/Metric/api.ts')]:{metricApi:{}}})
const { useMetricExecution } = load('components/Metric/useMetricExecution.ts')
const { metricExecutionSteps, executionGraph, distinctExecutionReads, executionReadForStep } = load('components/Metric/execution.ts')
const { metricChartPoints, metricSparkline, metricSampleInterval } = load('components/Metric/presentation.ts')
const evidence = (inputId,metricId,value)=>({inputs:[{inputId,metricId,count:1,inputTimeStart:900,inputTimeEnd:900}],
  execution:{truncated:false,values:[{kind:'input',id:inputId,path:'/value',type:'number',value:String(value),state:'available'}]}})
const snapshot = {resultId:'selected',evaluationTime:1000,truncated:false,steps:[
  {id:0,definitionId:'raw',name:'Raw',state:'produced',value:{metricId:'raw',value:95,evidence:evidence('source','cpu',95)},outputs:[{metricId:'raw',value:95,resultId:'intermediate'}]},
  {id:1,definitionId:'score',name:'Score',state:'produced',value:{metricId:'score',value:190,evidence:evidence('load','raw',95)},outputs:[{metricId:'score',value:190,resultId:'selected'}]},
]}
const template = {inputDefinitions:[{id:'cpu',name:'CPU'},{id:'unused',name:'Unused'}],
  definitions:[{id:'raw',sourceMetric:'cpu'},{id:'score',dependsOn:['raw']},{id:'unrelated'}],outputs:[{metricId:'score'},{metricId:'unrelated'}]}

test('直接消费后端当次事实，原图保留未参与节点并映射真实输入及输出',()=>{
  assert.deepEqual(metricExecutionSteps(snapshot,'missing'),[])
  assert.equal(metricExecutionSteps(snapshot,'selected'),snapshot.steps)
  assert.deepEqual(metricExecutionSteps(undefined,'selected'),[])
  const graph = executionGraph(template,snapshot)
  assert.equal(graph.nodes['rule-0'],'done')
  assert.equal(graph.nodes['rule-1'],'done')
  assert.equal(graph.nodes['rule-2'],'inactive')
  assert.equal(graph.nodes['input-1'],'inactive')
  assert.equal(graph.nodes['output-1'],'inactive')
  assert.equal(graph.values['input-0'].value,95)
  assert.equal(graph.values['input-0'].eventTime,900)
  assert.equal(graph.values['output-0'].value,190)
  assert.equal(graph.owners['rule-1'].definitionId,'score')
})

test('全部步骤直接展示记录值；截断不伪装成未参与，保留小数和大整数',()=>{
  const graph=executionGraph(template,{...snapshot,truncated:true})
  assert.equal(graph.nodes['rule-2'],'incomplete')
  assert.equal(graph.nodes['rule-1'],'done')
  assert.equal(graph.values['output-0'].value,190)
  const source=structuredClone(snapshot)
  source.steps[0].value.evidence.execution.values[0].value='1.25'
  assert.equal(executionGraph(template,source).values['input-0'].value,1.25)
  source.steps[0].value.evidence.execution.values[0].value='9223372036854775807'
  assert.equal(executionGraph(template,source).values['input-0'].value,'9223372036854775807')
})

test('来源实际标识与模板声明不同时，仍按模板别名定位原图且展示记录值',()=>{
  const spec={...template,inputDefinitions:[{id:'session',name:'设备会话'}],
    definitions:[{id:'raw',inputs:[{id:'source',metricId:'session'}]}]}
  const source=structuredClone(snapshot)
  source.steps=source.steps.slice(0,1)
  source.steps[0].value.evidence.inputs[0].metricId='platform-device-session'
  const graph=executionGraph(spec,source)
  assert.equal(graph.nodes['input-0'],'done')
  assert.equal(graph.values['input-0'].value,95)
})

test('同一来源的不同时间取值分别保留，选中步骤只取自己的读取；对象摘要不冒充缺数',()=>{
  const spec={...template,definitions:[{id:'raw',inputs:[{id:'source',metricId:'cpu'}]},{id:'score',inputs:[{id:'load',metricId:'cpu'}]}]}
  const source=structuredClone(snapshot)
  source.steps[1].value.evidence.inputs[0].metricId='cpu'
  source.steps[1].value.evidence.inputs[0].inputTimeEnd=950
  source.steps[1].value.evidence.execution.values[0].value='0'
  let graph=executionGraph(spec,source)
  assert.equal(graph.nodes['input-0'],'done')
  assert.equal(graph.values['input-0'],undefined)
  assert.equal(graph.reads['input-0'].length,2)
  assert.equal(distinctExecutionReads(graph.reads['input-0']).length,2)
  assert.equal(executionReadForStep(graph.reads['input-0'],source.steps[0]).value.value,95)
  assert.equal(executionReadForStep(graph.reads['input-0'],source.steps[1]).value.value,0)
  assert.equal(graph.edges.has('input-0:rule-1'),true)
  source.steps[0].value.evidence.execution.values=[{kind:'input',id:'source',path:'/value/online/duration',type:'number',value:'30',state:'available'}]
  graph=executionGraph(spec,source)
  assert.deepEqual(executionReadForStep(graph.reads['input-0'],source.steps[0]).value.value,{online:null})
})

test('详情按所选结果读取，切换取消旧请求，错配身份和迟到响应不能展示',async()=>{
  const scope = effectScope(), pending = []
  const reference = ref({configId:'a',outputId:'score',targetType:'device',targetId:'one'})
  const current = ref({metricId:'score',resultId:'first'}), active = ref(false)
  const api = {execution:(...args)=>new Promise((resolve,reject)=>pending.push({args,resolve,reject}))}
  const view = scope.run(()=>useMetricExecution(reference,current,active,api))
  try {
    await flush(); assert.equal(pending.length,0)
    active.value = true; await flush(); assert.equal(pending.length,1)
    assert.equal(view.value.loading,true)
    current.value = {metricId:'score',resultId:'second'}; await flush()
    assert.equal(pending.length,2)
    assert.equal(pending[0].args[3].aborted,true)
    pending[0].resolve({...snapshot,resultId:'first'}); await flush(); assert.equal(view.value.snapshot,undefined)
    assert.equal(pending[1].args[2].resultId,'second')
    pending[1].resolve({...snapshot,resultId:'second'}); await flush(); assert.equal(view.value.snapshot.resultId,'second')
    reference.value = {...reference.value,targetId:'two'}; await flush(); assert.equal(pending.length,3)
    assert.equal(pending[1].args[3].aborted,true)
    assert.equal(view.value.snapshot,undefined)
    pending[2].reject(new Error('Forbidden')); await flush(); assert.equal(view.value.error,'Forbidden')
    view.value.refresh(); await flush(); assert.equal(pending.length,4)
    active.value = false; await flush()
    assert.equal(pending[3].args[3].aborted,true); assert.equal(view.value.error,undefined)
    pending[3].resolve(snapshot); await flush(); assert.equal(view.value.snapshot,undefined)
    current.value = {...current.value,evidence:{execution:{values:[],truncated:false}}}
    active.value = true; await flush(); assert.equal(pending.length,5,'durable evidence still allows the original graph replay')
  } finally {scope.stop()}
  assert.equal(pending.at(-1).args[3].aborted,true)
})

test('返回其他轮次的过程不能冒充所选轮次',async()=>{
  const scope=effectScope(),current=ref({metricId:'score',resultId:'first'})
  const view=scope.run(()=>useMetricExecution(ref({configId:'c',outputId:'score'}),current,ref(true),{execution:async()=>snapshot}))
  try {await flush();assert.equal(view.value.snapshot,undefined);assert.equal(view.value.loading,false)} finally {scope.stop()}
})

test('同一结果的已知过程在服务端记录过期后刷新仍保留，换轮次或范围不能沿用',async()=>{
  for(const following of [false,true]) {
    const scope=effectScope(),pending=[]
    const reference=ref({configId:'c',outputId:'score',targetType:'device',targetId:'one'})
    const current=ref({metricId:'score',executionId:'round-one',value:0}),active=ref(true)
    const view=scope.run(()=>useMetricExecution(reference,current,active,{execution:(...args)=>new Promise(resolve=>pending.push({args,resolve}))},ref(following)))
    try {
      await flush();pending[0].resolve({...snapshot,resultId:undefined,executionId:'round-one'});await flush()
      const known=view.value.snapshot
      view.value.refresh();await flush();assert.strictEqual(view.value.snapshot,known)
      pending[1].resolve(undefined);await flush()
      assert.strictEqual(view.value.snapshot,known,'保留此详情已经读取的冻结事实，不额外创建历史缓存')
      assert.equal(view.value.loading,false);assert.equal(view.value.value.value,0)
      current.value={...current.value,executionId:'round-two'};await flush()
      pending[2].resolve(undefined);await flush();assert.equal(view.value.snapshot,undefined)
      view.value.refresh();await flush()
      pending[3].resolve({...snapshot,resultId:undefined,executionId:'round-two'});await flush()
      view.value.refresh();await flush()
      reference.value={...reference.value,targetId:'two'}
      assert.equal(view.value.snapshot,undefined);await flush()
      pending[4].resolve(undefined);await flush();assert.equal(view.value.snapshot,undefined)
      pending[5].resolve(undefined);await flush();assert.equal(view.value.snapshot,undefined)
    }finally{scope.stop()}
  }
})

test('跟随最新时保留成组的值和过程，响应后原子替换；历史/对象切换和撤权立即隔离',async()=>{
  const scope=effectScope(),pending=[]
  const reference=ref({configId:'c',outputId:'score',targetType:'device',targetId:'one'})
  const current=ref({metricId:'score',resultId:'first',value:10,evaluationTime:1000}),active=ref(true),follow=ref(true)
  const view=scope.run(()=>useMetricExecution(reference,current,active,{execution:(...args)=>new Promise((resolve,reject)=>pending.push({args,resolve,reject}))},follow))
  try {
    await flush();pending[0].resolve({...snapshot,resultId:'first'});await flush()
    const original=view.value.snapshot
    current.value={metricId:'score',resultId:'second',value:20,evaluationTime:2000};await flush()
    assert.strictEqual(view.value.snapshot,original)
    assert.equal(view.value.value.resultId,'first');assert.equal(view.value.loading,true)
    pending[1].resolve({...snapshot,resultId:'second'});await flush()
    assert.equal(view.value.snapshot.resultId,'second');assert.equal(view.value.value.resultId,'second')
    view.value.refresh();await flush()
    assert.equal(view.value.snapshot.resultId,'second','same-result manual refresh retains process')
    current.value={...current.value,resultId:'third'};await flush()
    assert.equal(pending[2].args[3].aborted,true)
    pending[2].resolve({...snapshot,resultId:'second'});await flush()
    assert.equal(view.value.snapshot.resultId,'second')
    pending[3].resolve(undefined);await flush()
    assert.equal(view.value.snapshot,undefined,'a genuinely missing process replaces the prior one')
    assert.equal(view.value.value.resultId,'third')
    current.value={...current.value,resultId:'fourth'};await flush()
    follow.value=false;current.value={...current.value,resultId:'history'};await flush()
    assert.equal(view.value.snapshot,undefined);assert.equal(view.value.value.resultId,'history')
    assert.equal(pending[4].args[3].aborted,true)
    pending[5].resolve({...snapshot,resultId:'history'});await flush()
    reference.value={...reference.value,targetId:'two'}
    assert.equal(view.value.snapshot,undefined,'scope is checked before the watcher runs')
    await flush();active.value=false
    assert.equal(view.value.snapshot,undefined);await flush()
    assert.equal(pending[6].args[3].aborted,true)
    pending[6].resolve({...snapshot,resultId:'history'});await flush();assert.equal(view.value.snapshot,undefined)
  }finally{scope.stop()}
})

test('无稳定结果ID使用执行引用查询，同刻同值的轮次与迟到响应仍严格隔离',async()=>{
  const scope=effectScope(),current=ref({metricId:'score',executionId:'round-one',evaluationTime:1000,value:3}),pending=[]
  const view=scope.run(()=>useMetricExecution(ref({configId:'c',outputId:'score',targetType:'device',targetId:'one'}),current,ref(true),{
    execution:(...args)=>new Promise(resolve=>pending.push({args,resolve})),
  }))
  try {
    await flush();assert.equal(pending[0].args[2].executionId,'round-one');assert.equal(pending[0].args[2].resultId,undefined)
    current.value={...current.value,executionId:'round-two'};await flush()
    assert.equal(pending[0].args[3].aborted,true);assert.equal(pending.length,2)
    pending[0].resolve({...snapshot,resultId:undefined,executionId:'round-one'});await flush()
    assert.equal(view.value.snapshot,undefined)
    pending[1].resolve({...snapshot,resultId:undefined,executionId:'other-round'});await flush()
    assert.equal(view.value.snapshot,undefined)
    view.value.refresh();await flush()
    pending[2].resolve({...snapshot,resultId:undefined,executionId:'round-two'});await flush()
    assert.equal(view.value.snapshot.executionId,'round-two')
    current.value={metricId:'score',evaluationTime:1000,value:3};await flush()
    assert.equal(view.value.snapshot,undefined);assert.equal(pending.length,3,'legacy results do not acquire an invented identity')
  } finally {scope.stop()}
})

test('未参与步骤无结果与连线，相同读取合并且不依赖步骤顺序',()=>{
  const skipped={...snapshot.steps[0],definitionId:'unrelated',state:'skipped',outputs:[]}
  const graph=executionGraph(template,{...snapshot,steps:[snapshot.steps[1],skipped,snapshot.steps[0]]})
  assert.equal(graph.nodes['rule-2'],'inactive')
  assert.equal(graph.values['rule-2'],undefined)
  assert.equal(graph.edges.has('rule-0:rule-1'),true)
  assert.equal(graph.edges.has('rule-1:output-0'),true)
  assert.equal(graph.edges.has('input-0:rule-2'),false)
  const read=graph.reads['input-0'][0]
  assert.equal(distinctExecutionReads([read,{...read,step:snapshot.steps[1]}]).length,1)
})

const rows = times=>times.map((evaluationTime,index)=>({metricId:'load',evaluationTime,value:index,quality:{valid:true}}))
test('公共数值投影保留显式无效点，稳定节奏长缺口断线；稀疏事件不补缺口',()=>{
  const dense = rows([1000,2000,3000,4000,5000,6000,120000])
  const points = metricChartPoints(dense)
  assert.equal(points.length,8)
  assert.equal(points[6][1],null)
  assert.equal((metricSparkline(points).path.match(/M/g)||[]).length,2)
  assert.equal(metricChartPoints(rows([1000,3000,6000,10000,17000,30000,90000])).length,7)
  assert.equal(metricChartPoints(rows([1000])).length,1)
  assert.equal(metricChartPoints(rows([1000,2000,3000,4000,5000,6000])).length,6)
  assert.equal(metricChartPoints(rows([1000,120000]),1000).length,3)
  const invalid = dense.map((row,index)=>index===3 ? {...row,status:'invalid'} : row)
  assert.equal(metricChartPoints(invalid)[3][1],null)
  assert.equal(metricSampleInterval({definitions:[{id:'score',window:{emitPolicy:'onSchedule',emitInterval:'PT1M'}}]},'score'),60000)
  assert.equal(metricSampleInterval({definitions:[{id:'score',window:{emitPolicy:'onEvent',emitInterval:'PT1M'}}]},'score'),undefined)
})
