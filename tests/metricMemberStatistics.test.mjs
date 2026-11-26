import assert from 'node:assert/strict'
import test from 'node:test'
import { effectScope, nextTick, ref, shallowRef } from 'vue'
import { loadMetricTestModule } from './metricTestModule.mjs'

const { useMetricMemberStatistics } = await loadMetricTestModule('../components/Metric/source-picker/useMetricMemberStatistics.ts', {
  '../../../api/metricSources':`export const loadMetricInheritedOutputs=(...args)=>globalThis.__memberOutputs(...args);
    export const loadMetricProductName=async id=> 'Product ' + id;
    export const queryMetricProducts=(...args)=>globalThis.__memberProducts(...args);`,
})
const { supportsSnapshotSource } = await loadMetricTestModule('../components/Metric/sourcePolicy.ts')
const { addSimulationSample, sampleInputs } = await loadMetricTestModule('../components/Metric/template/simulation.ts')

const item = (id, type = 'double') => ({ config:{id:'inherited',state:'enabled',scope:'children',ownerType:'product',ownerId:'p',targetType:'device'},
  template:{name:'Daily machine'},output:{metricId:id,valueType:type,persist:true} })
const candidates = [item('seconds'),item('period'),item('coverage'),item('state','string')]
function setup(extra = {}) {
  const lifetime = effectScope(), request = shallowRef({context:{ownerType:'space',ownerId:'workshop'},input:{id:'count'},scheduled:true,...extra})
  const accepted = [], range = ref({type:'space',id:'workshop'}), descendants = ref(true)
  const state = lifetime.run(() => useMetricMemberStatistics(request,range,descendants,selection => accepted.push(selection)))
  globalThis.__memberProducts = async () => ({data:[{id:'p',name:'Machine'}],total:1})
  globalThis.__memberOutputs = async () => candidates
  return { state, accepted, lifetime, request }
}

test('member statistics require explicit product and output, retain range and count arbitrary states', async () => {
  const {state,accepted,lifetime} = setup()
  try {
    state.open(); await nextTick()
    assert.equal(state.canConfirm.value,false)
    assert.deepEqual(state.products.value,[{id:'p',name:'Machine'}])
    await state.selectProduct('p'); state.selectOutput(candidates[3])
    state.spec.value.value = 'repair'
    assert.equal(state.spec.value.operator,'eq')
    assert.equal(state.canConfirm.value,true)
    state.confirm('repair devices')
    assert.deepEqual(accepted[0].mapping,{kind:'metric',configId:'inherited',id:'state',thingType:'space',thingId:'workshop',includeChildren:true,
      statistics:{memberType:'device',sourceType:'product',sourceId:'p',operation:'count',operator:'eq',value:'repair',maxAge:'PT10M',period:'current',zone:Intl.DateTimeFormat().resolvedOptions().timeZone}})
  } finally {lifetime.stop()}
})

test('calendar distinct counts and duration sums require period and coverage outputs from the same configuration', async () => {
  const {state,accepted,lifetime} = setup()
  try {
    state.open(); await state.selectProduct('p'); state.selectOutput(candidates[0]); state.spec.value.period = 'day'
    assert.equal(state.canConfirm.value,false)
    state.spec.value.periodMetricId = 'period'; state.spec.value.coverageMetricId = 'period'
    assert.equal(state.canConfirm.value,false)
    state.spec.value.coverageMetricId = 'coverage'
    assert.equal(state.canConfirm.value,true)
    state.confirm('started today')
    assert.equal(accepted[0].mapping.statistics.value,0)
    assert.equal(accepted[0].mapping.statistics.operator,'gt')
    state.operation('sum'); state.predicate(undefined)
    assert.equal(state.canConfirm.value,true)
    state.confirm('total seconds')
    assert.equal(accepted[1].mapping.statistics.operation,'sum')
    assert.equal(accepted[1].mapping.statistics.value,undefined)
  } finally {lifetime.stop()}
})

test('restoration preserves configuration semantics; schedule and history incompatibilities cannot be confirmed', async () => {
  const {state,request,lifetime} = setup()
  try {
    const mapping={kind:'metric',configId:'inherited',id:'seconds',statistics:{memberType:'device',sourceType:'product',sourceId:'p',operation:'sum',maxAge:'PT30M',period:'day',zone:'Asia/Shanghai',periodMetricId:'period',coverageMetricId:'coverage'}}
    state.open(mapping); await new Promise(resolve => setImmediate(resolve))
    assert.equal(state.selected.value.output.metricId,'seconds')
    assert.equal(state.productLabel.value,'Product p','restoration resolves the object name independently of candidate pagination')
    assert.equal(state.spec.value.maxAge,'PT30M')
    assert.equal(state.canConfirm.value,true)
    request.value={...request.value,scheduled:false}
    assert.equal(state.canConfirm.value,false)
    request.value={...request.value,scheduled:true,input:{id:'count',source:{lookback:'PT1H'}}}
    assert.equal(state.canConfirm.value,false)
  } finally {lifetime.stop()}
})

test('switching product and closing ignores late candidates and failures do not restore old output', async () => {
  const {state,lifetime} = setup()
  let release
  try {
    state.open(); await nextTick()
    globalThis.__memberOutputs = id => id === 'old' ? new Promise(resolve=>{release=resolve}) : Promise.resolve([item('new')])
    const previous=state.selectProduct('old')
    await state.selectProduct('new'); release(candidates); await previous
    assert.deepEqual(state.outputs.value.map(item=>item.output.metricId),['new'])
    const pending=state.selectProduct('old'); state.close(); release(candidates); await pending
    assert.equal(state.active.value,false)
    globalThis.__memberOutputs = async()=>{throw new Error('denied')}
    await state.selectProduct('denied')
    assert.equal(state.error.value,true); assert.equal(state.canConfirm.value,false); assert.equal(state.outputs.value.length,0)
  } finally {lifetime.stop()}
})

test('snapshot policy checks direct consumers and simulation distinguishes conditions for the same output', () => {
  const input={id:'count'}, template={inputDefinitions:[input],definitions:[{id:'ratio',dependsOn:['count'],window:{emitPolicy:'onSchedule'}}]}
  assert.equal(supportsSnapshotSource(template,input),true)
  assert.equal(supportsSnapshotSource({...template,definitions:[...template.definitions,{dependsOn:['count']}]},input),false)
  assert.equal(supportsSnapshotSource(template,{...input,source:{lookback:'PT1H'}}),false)
  const statistics={memberType:'device',sourceType:'product',sourceId:'p',operation:'count',operator:'gt',value:0,maxAge:'PT10M',period:'current',zone:'UTC'}
  const facts={configuration:{targetType:'space',targetId:'line',inputMappings:{count:{kind:'metric',configId:'c',id:'seconds',includeChildren:true,statistics}}},samples:[]}
  const next=addSimulationSample(template,facts,'count',1000), sample=next.samples[0]
  assert.deepEqual(sampleInputs(template,next,sample),['count'])
  assert.deepEqual(sampleInputs(template,next,{...sample,statistics:Object.fromEntries(Object.entries(statistics).reverse())}),['count'])
  assert.deepEqual(sampleInputs(template,next,{...sample,statistics:{...statistics,value:1}}),[])
  assert.deepEqual(sampleInputs(template,next,{...sample,includeChildren:false}),[])
})
