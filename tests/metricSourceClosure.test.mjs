import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { effectScope, ref } from 'vue'
import { createMetricLoader, flush } from './helpers/metricRuntime.mjs'

const reads=[], metadataReads=[]
let objectCandidates=async()=>({data:[],total:0}),deviceCandidates=async()=>{throw Error('must not enumerate devices')}
const metricOutputs=ref([])
const temperature={id:'temperature',name:'温度',valueType:{type:'double'},expands:{semanticId:'urn:temperature'}}
const query={id:'summary',name:'统计',kind:'query',configurableParameters:['limit'],bindings:{id:{source:'subjectId'}}}
let capabilities=[query], denied=false, metadata=async()=>({id:'read',name:'读取',inputs:[{id:'id'},{id:'limit',valueType:{type:'long'}}],output:{type:'object',properties:[{...temperature},{id:'count',name:'数量',valueType:{type:'long'}}]}})
const api={
  loadMetricObjectSources:async(type,id)=>{reads.push([type,id]);if(denied)throw Error('denied');return {properties:[temperature],events:[]}},
  loadMetricBuiltins:async()=>[],loadMetricInheritedOutputs:async()=>[],loadMetricProductName:async id=>id,
  queryMetricDevices:(...args)=>deviceCandidates(...args),queryMetricProducts:async()=>({data:[],total:0}),
  describeMetricProvider:async()=>({schema:{type:'object',properties:{active:{type:'boolean',expands:{semanticId:'urn:active'}}}},capabilities:['subscribe']}),
}
const business={
  loadObjectSourceCapabilities:async(type,id)=>{reads.push(['capabilities',type,id]);if(denied)throw Error('denied');return Promise.all(capabilities.map(async capability=>({...capability,reference:{provider:'ontology',sourceType:capability.id,configuration:{}},metadata:capability.kind==='query' ? (metadataReads.push([type,id,capability.id]),await metadata(capability.id)) : {}})))},
  loadObjectSourceMetadata:async(type,id,capability)=>{metadataReads.push([type,id,capability]);return metadata(capability)},
  loadMetricObjectTypes:async()=>[],queryMetricBusinessObjects:(...args)=>objectCandidates(...args),
}
let catalogReply
const catalogSnapshot=business.loadObjectSourceCapabilities
business.loadObjectSourceCapabilities=(...args)=>catalogReply ? catalogReply(...args) : catalogSnapshot(...args)
const load=createMetricLoader({
  [fileURLToPath(new URL('../api/metricSources.ts',import.meta.url))]:api,
  [fileURLToPath(new URL('../api/metricBusinessSources.ts',import.meta.url))]:business,
  './useMetricOutputSources':{useMetricOutputSources:()=>({loading:ref(false),error:ref(false),items:metricOutputs})},
})
const {useMetricSourcePicker}=load(fileURLToPath(new URL('../components/Metric/source-picker/useMetricSourcePicker.ts',import.meta.url)))
const {sourceItems,mappingSourceKind}=load(fileURLToPath(new URL('../components/Metric/source-picker/sources/catalog.ts',import.meta.url)))
const context={ownerType:'device',ownerId:'D1',targetType:'device',targetId:'D1',label:'当前设备'}
function fixture(){const scope=effectScope();return {scope,state:scope.run(useMetricSourcePicker)}}

test('扩展来源通过管理目录反显，不按本体或其他提供者名称分支',()=>{
  for(const provider of ['ontology','objects','custom-domain']) {
    assert.equal(mappingSourceKind({kind:'provider',providerSource:{provider,sourceType:'domain-query',configuration:{}}}),'businessQuery')
  }
})

test('切换对象类型立即清除旧候选，来源失败不能残留另一类型的对象',async()=>{
  const {scope,state}=fixture()
  objectCandidates=async()=>({data:[{id:'G1',name:'分组'}],total:1})
  try{
    const pending=state.pickSource({context:{ownerType:'deviceGroup',ownerId:'G1'},input:{id:'metric'},purpose:'reference'})
    await flush();state.changeObject();await flush()
    assert.equal(state.devices.value[0].id,'G1')
    let reject
    deviceCandidates=()=>new Promise((_resolve,fail)=>{reject=fail})
    state.changeObjectType('device')
    assert.deepEqual(state.devices.value,[]);assert.equal(state.total.value,0)
    reject(Error('source unavailable'));await flush()
    assert.equal(state.error.value,true);assert.deepEqual(state.devices.value,[])
    state.cancel();await pending
  }finally{
    objectCandidates=async()=>({data:[],total:0});deviceCandidates=async()=>{throw Error('must not enumerate devices')};scope.stop()
  }
})
test('关联输出只列指标且允许其公开类型，不读取对象物模型',async()=>{
  const {scope,state}=fixture()
  const before=reads.length
  metricOutputs.value=[{config:{id:'C1',targetType:'device',targetId:'D1'},template:{id:'T1',inputDefinitions:[],parameterDefinitions:[],outputs:[],definitions:[{id:'online',resultType:{type:'boolean'}}]},output:{metricId:'online'}}]
  try{
    const pending=state.pickSource({context,input:{id:'metric',source:{kind:'metric'}},purpose:'reference',hint:{sources:['metric']}})
    await flush();assert.equal(state.canChangeObject.value,true);assert.equal(state.metricsExpanded.value,true)
    assert.equal(state.objectId.value,'');assert.equal(state.choosingObject.value,true);assert.equal(state.canConfirm.value,false)
    await state.selectObject('D1');await flush()
    assert.equal(reads.length,before);assert.equal(state.items.value.length,1)
    state.chooseMethod(method(state,'online'))
    assert.equal(state.open.value,true,'selection remains a draft until explicit confirmation')
    assert.equal(state.requiresConfirmation.value,true);assert.equal(state.canConfirm.value,true)
    state.confirm()
    const value=await pending;assert.equal(value.mapping.thingId,'D1');assert.equal(value.mapping.configId,'C1')
  }finally{metricOutputs.value=[];scope.stop()}
})

test('每次添加已有指标先选来源，取消和上次选择不绑定承接对象',async()=>{
  const {scope,state}=fixture()
  try{
    for(const owner of [context,{ownerType:'space',ownerId:'S1'}, {ownerType:'product',ownerId:'P1',targetType:'device',targetId:'*',scope:'children'}]){
      const pending=state.pickSource({context:owner,input:{id:'metric',source:{kind:'metric'}},purpose:'reference'})
      await flush();assert.equal(state.objectId.value,'');assert.equal(state.choosingObject.value,true);assert.equal(state.canConfirm.value,false)
      await state.selectObject('chosen');state.cancel();assert.equal(await pending,undefined)
    }
  }finally{scope.stop()}
})
const method=(state,id,path)=>state.items.value.flatMap(item=>item.methods).find(item=>item.id===id && (path===undefined || item.valuePath===path))

test('已有指标来源保留显式枚举和对象声明，不退化为顶层type或默认double',async()=>{
  const schema={type:'enum',valueType:{type:'int'},elements:[{value:0,text:'停止'},{value:1,text:'运行'}]}
  const spec={id:'source',name:'来源',inputDefinitions:[],parameterDefinitions:[],definitions:[{id:'state',resultType:schema}],outputs:[]}
  metricOutputs.value=[{config:{id:'C1'},template:spec,output:{metricId:'state',valueType:'enum'}}]
  const {scope,state}=fixture()
  try{
    const pending=state.pickSource({context,input:{id:'value',valueType:schema}});await flush()
    assert.deepEqual(JSON.parse(JSON.stringify(method(state,'state').valueType)),schema)
    state.cancel();await pending
    spec.definitions[0]={id:'state'};metricOutputs.value=[{config:{id:'C1'},template:spec,output:{metricId:'state'}}]
    const unknown=state.pickSource({context,input:{id:'value',valueType:{type:'double'}}});await flush()
    assert.equal(method(state,'state'),undefined)
    state.cancel();await unknown
  }finally{metricOutputs.value=[];scope.stop()}
})

test('绑定默认实际目标，但可切换独立来源并保留完整对象身份；声明导入仍可选对象',async()=>{
  const {scope,state}=fixture();reads.length=0
  try{
    const pending=state.pickSource({context:{...context,ownerType:'space',ownerId:'S1'},input:{id:'value',valueType:{type:'double'}}});await flush()
    assert.equal(state.objectId.value,'D1');assert.equal(state.objectType.value,'device');assert.equal(state.canChangeObject.value,true)
    state.changeObject();state.changeObjectType('device');await state.selectObject('other');await flush()
    assert.equal(state.objectId.value,'other');assert.equal(state.choosingObject.value,false)
    assert.deepEqual(reads[0],['device','D1'])
    state.chooseMethod(method(state,'temperature'));assert.equal((await pending).mapping.thingId,'other')
    const declaration=state.pickSource({context,input:{id:'value'},purpose:'declaration'});await state.selectObject('example');await flush()
    assert.equal(state.canChangeObject.value,true);state.chooseMethod(method(state,'temperature'));await declaration
  }finally{scope.stop()}
})

test('产品成员引用保持相对目标，模型来自归属对象，不枚举或误用产品汇总',async()=>{
  const {scope,state}=fixture();reads.length=0
  try{
    const pending=state.pickSource({context:{ownerType:'product',ownerId:'P1',targetType:'device',targetId:'*',scope:'children'},input:{id:'value',valueType:{type:'double'}}});await flush()
    assert.equal(state.currentMember.value,true);assert.deepEqual(reads[0],['product','P1'])
    assert.equal(state.business.methods.value.length,0)
    state.chooseMethod(method(state,'temperature'));const result=await pending
    assert.equal(result.mapping.thingType,'device');assert.equal(result.mapping.thingId,undefined)
  }finally{scope.stop()}
})

test('声明目录排除动作；查询输出保留类型语义，参数只开放显式配置项',async()=>{
  const {scope,state}=fixture();capabilities=[query,{id:'start',name:'启动',kind:'action'}];metadataReads.length=0
  try{
    const pending=state.pickSource({context,input:{id:'value',valueType:{type:'double'},semantics:{semanticId:'urn:temperature'}}});await flush()
    assert.deepEqual(metadataReads,[['device','D1','summary']])
    assert.deepEqual(state.business.methods.value.find(item=>item.valuePath==='temperature').command.inputs.map(item=>item.id),['limit'])
    assert.deepEqual(state.items.value.flatMap(item=>item.methods).filter(item=>item.kind==='businessQuery').map(item=>item.valuePath),['temperature','count'])
    state.chooseMethod(method(state,'summary','temperature'));state.business.parameters.value={limit:0};state.confirm()
    const result=await pending
    assert.equal(result.mapping.providerSource.provider,'ontology');assert.equal(result.mapping.providerSource.sourceType,'summary')
    assert.equal(result.mapping.providerSource.configuration.valuePath,'temperature');assert.equal(result.mapping.providerSource.configuration.parameters.limit,0)
  }finally{capabilities=[query];scope.stop()}
})

test('本体绑定按能力与字段恢复，保留零值参数和未编辑扩展',async()=>{
  const {scope,state}=fixture()
  try{
    const mapping={kind:'provider',thingType:'device',thingId:'D1',id:'temperature',custom:false,providerSource:{provider:'ontology',sourceType:'summary',configuration:{valuePath:'temperature',parameters:{limit:0},custom:0}}}
    const pending=state.pickSource({context,input:{id:'value',valueType:{type:'double'}},mapping});await flush()
    assert.equal(state.method.value.valuePath,'temperature');assert.equal(state.canConfirm.value,true)
    assert.equal(state.business.parameters.value.limit,0);state.confirm();const result=await pending
    assert.equal(result.mapping.custom,false);assert.equal(result.mapping.providerSource.configuration.custom,0)
  }finally{scope.stop()}
})

test('实时和历史读取需求按声明准入，不把当前摘要当历史或订阅',async()=>{
  const {scope,state}=fixture()
  try{
    for(const options of [{scheduled:false},{input:{id:'value',valueType:{type:'double'},source:{lookback:'1h'}}}]){
      const pending=state.pickSource({context,input:{id:'value',valueType:{type:'double'}},...options});await flush()
      assert.equal(method(state,'summary','count'),undefined)
      state.chooseMethod(state.business.methods.value.find(item=>item.valuePath==='count'));state.confirm()
      assert.equal(state.canConfirm.value,false);assert.equal(state.open.value,true)
      state.cancel();await pending
    }
    capabilities=[{...query,id:'history',bindings:{from:{source:'from'},to:{source:'to'}},evidenceMapping:{observedAt:'timestamp'}}]
    const pending=state.pickSource({context,input:{id:'value',valueType:{type:'double'},source:{lookback:'1h'}}});await flush()
    state.chooseMethod(method(state,'history','count'));state.confirm()
    assert.equal((await pending).mapping.providerSource.configuration.historyCapability,'history')
  }finally{capabilities=[query];scope.stop()}
})

test('同一事件的不同字段分开选择，仅相同路径的显式关联查询提供读取方式',()=>{
  const count={key:'event:changed:count',kind:'businessEvent',id:'changed',name:'次数',valuePath:'count',capabilities:['subscribe']}
  const timestamp={...count,key:'event:changed:timestamp',name:'时间',valuePath:'timestamp'}
  const queryCount={...count,key:'query:summary:count',kind:'businessQuery',id:'summary',capabilities:['current'],command:{expands:{metricSource:{eventType:'changed'}}}}
  const unrelated={...queryCount,key:'query:other:count',id:'other',command:{}}
  const items=sourceItems([count,timestamp,queryCount,unrelated])
  assert.equal(items.length,3)
  assert.deepEqual(items.find(item=>item.name==='次数').methods,[count,queryCount])
  assert.deepEqual(items.find(item=>item.name==='时间').methods,[timestamp])
  assert.deepEqual(items.find(item=>item.key===unrelated.key).methods,[unrelated])
})

test('结构化事件字段保留语义声明，可绑定事件字段',async()=>{
  const {scope,state}=fixture();capabilities=[{id:'changed',name:'状态变化',kind:'event',event:{transport:'structuredEvent',definitionId:'changed'}}]
  try{
    const pending=state.pickSource({context,scheduled:false,input:{id:'value',valueType:{type:'boolean'},semantics:{semanticId:'urn:active'}}});await flush()
    const candidate=method(state,'changed','active');assert.ok(candidate)
    state.chooseMethod(candidate);state.confirm()
    const result=await pending
    assert.equal(result.mapping.providerSource.sourceType,'changed');assert.equal(result.mapping.providerSource.configuration.valuePath,'active')
  }finally{capabilities=[query];scope.stop()}
})

test('有时间窗但缺观测时间的查询不冒充当前值',async()=>{
  const {scope,state}=fixture();capabilities=[{...query,bindings:{from:{source:'from'},to:{source:'to'}}}]
  try{
    const pending=state.pickSource({context,input:{id:'value',valueType:{type:'double'}}});await flush()
    assert.equal(method(state,'summary','count'),undefined)
    const unavailable=state.business.methods.value.find(item=>item.valuePath==='count')
    assert.equal(state.issue(unavailable),'sourceNoCurrent');state.chooseMethod(unavailable)
    assert.equal(state.canConfirm.value,false)
    state.cancel();await pending
  }finally{capabilities=[query];scope.stop()}
})

test('显式subject反显保留来源对象及运行目标',async()=>{
  const {scope,state}=fixture()
  try{
    const subject={type:'fleet',id:'F1'}
    const mapping={kind:'provider',thingType:'device',thingId:'D1',id:'count',providerSource:{provider:'ontology',sourceType:'summary',subject,configuration:{valuePath:'count',parameters:{limit:0}}}}
    const pending=state.pickSource({context,input:{id:'value',valueType:{type:'long'}},mapping});await flush()
    assert.equal(state.objectType.value,'fleet');assert.equal(state.objectId.value,'F1')
    state.confirm();const result=await pending
    assert.deepEqual(result.mapping.providerSource.subject,subject);assert.equal(result.mapping.thingType,'device');assert.equal(result.mapping.thingId,'D1')
  }finally{scope.stop()}
})

test('统一来源目录只请求一次，取消后迟到快照不回填',async()=>{
  const {scope,state}=fixture();let complete,calls=0
  try{
    catalogReply=()=>{calls++;return new Promise(resolve=>{complete=resolve})}
    const pending=state.pickSource({context,input:{id:'value',valueType:{type:'double'}}});await flush();assert.equal(calls,1)
    state.cancel();await pending;complete([{...query,reference:{provider:'objects',sourceType:'query',configuration:{commandId:'read'}},metadata:{output:{type:'long'}}}]);await flush()
    assert.equal(state.business.methods.value.length,0);assert.equal(calls,1)
  }finally{catalogReply=undefined;scope.stop()}
})

test('权限撤销后目录及选择清空，重试不复用旧授权',async()=>{
  const {scope,state}=fixture()
  try{
    const pending=state.pickSource({context,input:{id:'value',valueType:{type:'double'}}});await flush();state.selectMethod(method(state,'summary','count'))
    denied=true;await Promise.all([state.loadObject(),state.business.load()]);await flush()
    assert.equal(state.business.methods.value.length,0);assert.equal(state.business.failed.value,true);assert.equal(state.canConfirm.value,false)
    denied=false;await Promise.all([state.loadObject(),state.business.load()]);await flush();assert.ok(method(state,'temperature'))
    state.cancel();await pending
  }finally{denied=false;scope.stop()}
})

test('未声明类型不额外过滤目录，导入声明保留原语义',async()=>{
  const {scope,state}=fixture()
  try{
    const pending=state.pickSource({context,input:{id:'value',valueType:{},semantics:{}}});await flush()
    assert.equal(state.inputUndeclared.value,true);assert.ok(method(state,'temperature'))
    state.showAllSources.value=true;await flush();assert.ok(state.groups.value.length > 0)
    state.propertyId.value='temperature';state.confirm();assert.equal(state.canConfirm.value,false);assert.equal(state.open.value,true)
    state.cancel();await pending
    const reference=state.pickSource({context,input:{id:'value'},purpose:'declaration'});await state.selectObject('D1');await flush()
    assert.equal(state.inputUndeclared.value,false);assert.ok(method(state,'temperature'))
    state.chooseMethod(method(state,'temperature'))
    assert.deepEqual((await reference).declaration.semantics,{semanticId:'urn:temperature'})
  }finally{scope.stop()}
})

test('语义不限制来源选择，查看全部来源仍保留类型约束',async()=>{
  const {scope,state}=fixture()
  try{
    const pending=state.pickSource({context,input:{id:'value',semantics:{semanticId:'urn:temperature'}}});await flush()
    assert.ok(method(state,'temperature'));assert.ok(method(state,'summary','temperature'));assert.ok(method(state,'summary','count'))
    state.showAllSources.value=true;await flush();assert.ok(method(state,'summary','count'))
    state.chooseMethod(method(state,'summary','temperature'));state.confirm()
    assert.deepEqual((await pending).declaration.semantics,{semanticId:'urn:temperature'})
    const invalid=state.pickSource({context,input:{id:'value',valueType:{type:'boolean'}},mapping:{kind:'property',thingType:'device',thingId:'D1',id:'temperature'}});await flush()
    assert.equal(state.method.value,undefined);assert.equal(state.canConfirm.value,false);assert.equal(state.items.value.length,0)
    state.propertyId.value='temperature';state.confirm();assert.equal(state.open.value,true)
    state.cancel();await invalid
  }finally{scope.stop()}
})
