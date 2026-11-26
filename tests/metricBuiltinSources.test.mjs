import assert from 'node:assert/strict'
import test from 'node:test'
import { effectScope, nextTick } from 'vue'
import { loadMetricTestModule } from './metricTestModule.mjs'
import { readFileSync } from 'node:fs'
const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));await nextTick()}

const { useMetricSourcePicker } = await loadMetricTestModule('../components/Metric/source-picker/useMetricSourcePicker.ts', {
  '../../../api/metricBusinessSources': 'export const loadMetricObjectTypes=async()=>[];export const queryMetricBusinessObjects=async()=>({data:[],total:0});',
  '../../../../api/metricBusinessSources': 'export const loadObjectSourceCapabilities=async()=>[];export const loadObjectSourceMetadata=async()=>({});',
  '../../../../api/metricSources': 'export const describeMetricProvider=async()=>({schema:{},capabilities:[]});',
  '../../../api/metricSources': `export const queryMetricDevices=()=>{throw new Error('must not enumerate devices')};
    export const loadMetricDevice=(...args)=>globalThis.__metricBuiltinDevice(...args);
    export const loadMetricObjectSources=async(type,id)=>type==='device' && globalThis.__metricBuiltinDevice ? loadMetricDevice(id) : ({properties:[],events:[]});
    export const loadMetricProduct=async()=>[];export const loadMetricProductSources=async()=>({properties:[],events:[]});
    export const loadMetricProductName=async id=>id;
    export const loadMetricBuiltins=(...args)=>globalThis.__metricBuiltinApi(...args);
    export const loadMetricInheritedOutputs=async()=>[];
    export const queryMetricProducts=async()=>({data:[],total:0});`,
  './useMetricOutputSources': `export const useMetricOutputSources=()=>({loading:{value:false},error:{value:false},items:{value:[]}})`,
  '@rule-engine-manager-ui/metric': `export const metricSourceSchema=schema=>schema`,
})
const { addSimulationSample, sampleInputs } = await loadMetricTestModule('../components/Metric/template/simulation.ts')
const iotMetricStarters = JSON.parse(readFileSync(new URL('./fixtures/sourceTemplates.json',import.meta.url),'utf8'))

test('scope reference keeps generic built-in bindings and integer declarations', () => {
  const fixture = iotMetricStarters.find(item => item.id === 'scope-connectivity')
  assert.deepEqual(Object.values(fixture.simulation.configuration.inputMappings).map(item => item.kind), ['builtin','builtin','builtin'])
  assert.ok(fixture.template.inputDefinitions.every(item => item.valueType.type === 'long'))
  assert.equal(fixture.template.definitions.find(item => item.id === 'scopeOnlinePercent').applicabilityTree.root.operator, 'gt')
})

test('object builtin selection restores scope and commits without enumerating devices', async () => {
  const scope = effectScope()
  const state = scope.run(useMetricSourcePicker)
  const calls = []
  globalThis.__metricBuiltinApi = async (...args) => { calls.push(args); return [{id:'deviceCount',name:'设备总数',supportsChildren:true}] }
  try {
    const pending = state.pickSource({ context:{ownerType:'space',ownerId:'workshop',label:'车间'}, input:{id:'count',valueType:{type:'long'}},
      mapping:{kind:'builtin',thingType:'space',thingId:'workshop',id:'deviceCount',includeChildren:true} })
    await flush()
    assert.equal(state.choosingObject.value,false)
    assert.equal(state.ownerBuiltin.value,true)
    assert.equal(state.includeChildren.value,true)
    assert.deepEqual(calls,[['space','workshop']])
    assert.equal(state.canConfirm.value,true)
    state.confirm()
    assert.deepEqual((await pending).mapping,{kind:'builtin',thingType:'space',thingId:'workshop',id:'deviceCount',includeChildren:true})
  } finally { scope.stop() }
})

test('reopening a builtin binding preserves its source object instead of changing it to the owner', async () => {
  const scope = effectScope()
  const state = scope.run(useMetricSourcePicker)
  const calls = []
  globalThis.__metricBuiltinApi = async (...args) => { calls.push(args); return [{id:'deviceCount',name:'设备总数',supportsChildren:true}] }
  try {
    const pending = state.pickSource({ context:{ownerType:'space',ownerId:'workshop',label:'车间'}, input:{id:'count',valueType:{type:'long'}},
      mapping:{kind:'builtin',thingType:'deviceGroup',thingId:'production-line',id:'deviceCount',includeChildren:true} })
    await flush()
    assert.deepEqual(calls,[['deviceGroup','production-line']])
    state.confirm()
    assert.deepEqual((await pending).mapping,{kind:'builtin',thingType:'deviceGroup',thingId:'production-line',id:'deviceCount',includeChildren:true})
  } finally { scope.stop() }
})

test('builtin history is unavailable and failed metadata never becomes a zero or selectable source', async () => {
  const scope = effectScope()
  const state = scope.run(useMetricSourcePicker)
  try {
    globalThis.__metricBuiltinApi = async () => [{id:'deviceCount',name:'设备总数',supportsChildren:false}]
    const pending = state.pickSource({ context:{ownerType:'product',ownerId:'p'}, input:{id:'count',valueType:{type:'long'},source:{lookback:'PT1H'}},
      mapping:{kind:'builtin',id:'deviceCount'} })
    await flush()
    assert.equal(state.historyInput.value,true)
    assert.equal(state.canConfirm.value,false)
    globalThis.__metricBuiltinApi = async () => {throw new Error('denied')}
    await state.loadBuiltins()
    assert.equal(state.builtinError.value,true)
    assert.equal(state.canConfirm.value,false)
    state.cancel()
    assert.equal(await pending,undefined)
  } finally { scope.stop() }
})

test('simulation isolates builtin snapshots from identically named properties and descendant scopes', () => {
  const template={inputDefinitions:[{id:'count'}]}
  const facts={configuration:{targetType:'space',targetId:'workshop',inputMappings:{count:{kind:'builtin',id:'deviceCount',includeChildren:true}}},samples:[]}
  const next=addSimulationSample(template,facts,'count',1000)
  const sample=next.samples[0]
  assert.equal(sample.sourceKind,'builtin')
  assert.equal(sample.includeChildren,true)
  assert.deepEqual(sampleInputs(template,next,sample),['count'])
  assert.deepEqual(sampleInputs(template,next,{...sample,sourceKind:'property'}),[])
  assert.deepEqual(sampleInputs(template,next,{...sample,includeChildren:false}),[])
})

test('device alarm builtins retain their types and online history remains a property source', async () => {
  const scope = effectScope()
  const state = scope.run(useMetricSourcePicker)
  const calls = []
  globalThis.__metricBuiltinDevice = async id => ({device:{id,name:'水泵'},properties:[{id:'$online',name:'在线状态',platform:true,history:true,valueType:{type:'int'}}]})
  globalThis.__metricBuiltinApi = async (...args) => {
    calls.push(args)
    return [
      {id:'alarmActive',name:'是否告警中',valueType:'boolean',supportsChildren:false},
      {id:'longestAlarmDuration',name:'最长当前告警时长',valueType:'double',unit:'s',supportsChildren:false},
    ]
  }
  try {
    let pending = state.pickSource({context:{ownerType:'device',ownerId:'pump',label:'水泵'},input:{id:'alarm',valueType:{type:'boolean'}},
      mapping:{kind:'builtin',thingType:'device',thingId:'pump',id:'alarmActive'}})
    await flush()
    assert.deepEqual(calls,[['device','pump']])
    assert.equal(state.builtins.value[0].valueType,'boolean')
    assert.equal(state.canConfirm.value,true)
    state.confirm()
    assert.deepEqual((await pending).mapping,{kind:'builtin',thingType:'device',thingId:'pump',id:'alarmActive',includeChildren:false})

    pending = state.pickSource({context:{ownerType:'device',ownerId:'pump'},input:{id:'state',valueType:{type:'int'},source:{lookback:'PT1H'}},
      mapping:{kind:'property',thingType:'device',thingId:'pump',id:'$online'}})
    await flush()
    assert.equal(state.canConfirm.value,true)
    state.propertyId.value='longestAlarmDuration'
    assert.equal(state.canConfirm.value,false)
    state.propertyId.value='$online'
    state.confirm('在线状态')
    assert.deepEqual((await pending).mapping,{kind:'property',thingType:'device',thingId:'pump',id:'$online'})
  } finally { scope.stop() }
})

test('通信模板可选平台连接和会话时间，数值输入可选连接统计，读取能力仍准确限制', async () => {
  const scope=effectScope(),state=scope.run(useMetricSourcePicker)
  const context={ownerType:'device',ownerId:'gateway',targetType:'device',targetId:'gateway'}
  const online={type:'enum',valueType:{type:'int'},elements:[{value:0,text:'离线'},{value:1,text:'在线'}]}
  globalThis.__metricBuiltinApi=async()=>[]
  globalThis.__metricBuiltinDevice=async()=>({properties:[
    {id:'temperature',name:'温度',valueType:{type:'double'}},
    {id:'$online',name:'平台连接状态',platform:true,history:true,group:'连接与会话',valueType:{...online,elements:[{value:'0',text:'离线'},{value:'1',text:'在线'}]},expands:{semanticId:'urn:jetlinks:device:platform:online',semanticTypes:['observation'],metricSource:{capabilities:['current','subscribe','history']}}},
    {id:'$lastCommunicationTime',name:'最近会话通信时间',platform:true,group:'连接与会话',valueType:{type:'date'},expands:{semanticId:'urn:jetlinks:device:platform:lastCommunicationTime',semanticTypes:['observation'],metricSource:{capabilities:['current']}}},
    ...['$connectionReadBytes','$connectionReadErrors','$connectionAckTimeouts','$connectionAckAverageDuration'].map(id=>({id,name:id,platform:true,group:'连接收发',valueType:{type:'long'},expands:{metricSource:{capabilities:['current']}}})),
  ]})
  const find=id=>state.items.value.flatMap(item=>item.methods).find(item=>item.id===id)
  const template=iotMetricStarters.find(item=>item.id==='communication-observation').template
  try {
    for (const [inputId,sourceId] of [['connectionState','$online'],['lastCommunicationTime','$lastCommunicationTime']]) {
      const pending=state.pickSource({context,input:template.inputDefinitions.find(item=>item.id===inputId),scheduled:true});await flush()
      assert.ok(find(sourceId));assert.equal(find('temperature'),undefined)
      state.chooseMethod(find(sourceId));assert.equal((await pending).mapping.id,sourceId)
    }
    let pending=state.pickSource({context,input:{id:'errors',valueType:{type:'long'}},scheduled:true});await flush()
    for (const id of ['$connectionReadBytes','$connectionReadErrors','$connectionAckTimeouts','$connectionAckAverageDuration']) assert.ok(find(id))
    assert.ok(state.groups.value.some(group=>group.name==='连接收发'));assert.equal(find('$lastCommunicationTime'),undefined)
    state.chooseMethod(find('$connectionReadErrors'));assert.equal((await pending).mapping.id,'$connectionReadErrors')
    pending=state.pickSource({context,input:{id:'state',valueType:online},scheduled:false});await flush()
    assert.ok(find('$online'));assert.equal(find('$connectionReadErrors'),undefined)
    state.chooseMethod(find('$online'));assert.equal((await pending).mapping.id,'$online')
  }finally{scope.stop()}
})
