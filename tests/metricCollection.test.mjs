import assert from 'node:assert/strict'
import test from 'node:test'
import { defineComponent, h, ref } from 'vue'
import { resolve } from 'node:path'
import { createMetricLoader, createMetricRenderer, flush, sourceRoot } from './helpers/metricRuntime.mjs'
const api = {}
const load = createMetricLoader({ [resolve(sourceRoot,'components/Metric/api.ts')]:{ metricApi:api } })
const { readPolicy, compatibleReadOperations, updateReadPolicy, suggestedReadSemantic, supportedReadSemantics } = load('components/Metric/collection/aggregationPolicy.ts')
const { useMetricCollection } = load('components/Metric/collection/useMetricCollection.ts')

test('aggregation suggestions never infer addition from a numeric type or algorithm', () => {
  assert.equal(suggestedReadSemantic({metricId:'x',valueType:'boolean'}),'state')
  assert.deepEqual(compatibleReadOperations('state'),['collection','distribution'])
  assert.equal(compatibleReadOperations('score',true).includes('sum'),false)
  assert.equal(compatibleReadOperations('quantity').includes('sum'),false)
  assert.equal(compatibleReadOperations('quantity',true).includes('sum'),true)
  const output = { metricId:'x',options:{custom:{kept:true}} }
  const fields = updateReadPolicy(output,readPolicy('score'))
  assert.deepEqual(fields.options.custom,{kept:true}); assert.equal(output.options.readAggregation,undefined)
  assert.equal(updateReadPolicy({...output,...fields}).options.readAggregation,undefined)
})

test('custom summaries require declared compatible types without changing unknown or structured outputs',()=>{
  for (const type of ['byte','short','int','integer','long','float','double','number','decimal']) assert.deepEqual(supportedReadSemantics(type),['state','score','duration','quantity','ratio','numeric'])
  for (const type of ['boolean','string','enum']) assert.deepEqual(supportedReadSemantics(type),['state'])
  for (const type of [undefined,'','object','array','date','vendor-type']) assert.deepEqual(supportedReadSemantics(type),[])
})

test('scope reads use one request and a stale previous page cannot replace a newer page', async () => {
  const pending = [], calls = []
  api.collection = query => { calls.push({...query}); return new Promise(resolve=>pending.push(resolve)) }
  const {renderer,root} = createMetricRenderer(); let state
  const app = renderer.createApp(defineComponent({setup(){ state=useMetricCollection(ref({ownerType:'product',ownerId:'p'}),ref({memberType:'device'}),api);return()=>h('div') }}))
  app.mount(root)
  assert.equal(calls.length,1)
  assert.equal(calls[0].includeUnconfigured,true,'the member overview requests authorized unconfigured and disabled members explicitly')
  pending.shift()({readTime:1,visibleMembers:100,total:100,groups:[],data:[]}); await flush()
  state.changePage(2); state.changePage(3)
  assert.deepEqual(calls.slice(1).map(item=>item.pageIndex),[1,2])
  pending.pop()({readTime:3,visibleMembers:100,total:100,groups:[],data:[{key:'page3'}]}); await flush()
  pending.pop()({readTime:2,visibleMembers:100,total:100,groups:[],data:[{key:'page2'}]}); await flush()
  assert.equal(state.result.value.readTime,3); assert.equal(state.result.value.data[0].key,'page3')
  state.changeView('bars'); assert.equal(calls.length,3,'presentation changes do not reload metric values')
  app.unmount()
})

test('tree depth switches between descendants and direct children while related devices stay directly bound', async () => {
  const calls = []
  const api = { collection: async query => { calls.push({...query}); return { readTime:1, visibleMembers:0, total:0, groups:[], data:[] } } }
  const context = ref({ownerType:'space',ownerId:'scope-root'})
  const scope = ref({memberType:'space',tree:true})
  const {renderer,root} = createMetricRenderer(); let state
  const app = renderer.createApp(defineComponent({setup(){ state=useMetricCollection(context,scope,api);return()=>h('div') }}))
  app.mount(root); await flush()
  assert.equal(calls.at(-1).depth,'descendants')
  state.changeDepth(false); await flush()
  assert.equal(calls.at(-1).depth,'children','a child-region view must not load the root itself')
  scope.value = {memberType:'device',tree:true}; await flush()
  state.changeDepth(false); await flush()
  assert.equal(calls.at(-1).depth,'self','related devices use the current container direct bindings')
  state.changeDepth(true); await flush()
  assert.equal(calls.at(-1).depth,'descendants')
  app.unmount()
})

test('member overview defaults to a declared primary output, retains coverage and never loads each member in the browser', async () => {
  const calls = []
  const primary = { id:'state',output:{metricId:'state'},displaySettings:{primaryOutput:'state'},operations:['collection','distribution'],policy:{defaultOperation:'distribution'} }
  const api = { collection:async query => { calls.push({...query}); return {readTime:1,visibleMembers:2,total:2,groups:[{id:'score',output:{metricId:'score'},operations:['collection']},primary],coverage:{configuredMembers:1,unconfiguredMembers:1},data:[{kind:'unconfigured',key:'member:b',target:{type:'device',id:'b',name:'B'}}]} } }
  const {renderer,root} = createMetricRenderer();let state
  const app = renderer.createApp(defineComponent({setup(){state=useMetricCollection(ref({ownerType:'product',ownerId:'p'}),ref({memberType:'device'}),api);return()=>h('div')}}))
  try {
    app.mount(root);await flush()
    assert.equal(state.group.value,'state');assert.equal(state.operation.value,'distribution')
    assert.equal(calls.length,2,'initial metadata and the selected output use bounded collection requests')
    assert.deepEqual(state.result.value.coverage,{configuredMembers:1,unconfiguredMembers:1})
    assert.equal(state.result.value.data[0].kind,'unconfigured');assert.equal(state.selected.value,undefined)
  } finally {app.unmount()}
})

test('depth preferences apply before the first scope request even without groups and do not leak across owners', async () => {
  const priorStorage = globalThis.localStorage
  const stored = new Map([['metric-collection:["user-project","space","preferred","space"]',JSON.stringify({descendants:false})]])
  globalThis.localStorage = {getItem:key=>stored.get(key) ?? null,setItem:(key,value)=>stored.set(key,value)}
  const calls = []
  const api = { collection: async query => { calls.push({...query}); return { readTime:1, visibleMembers:0, total:0, groups:[], data:[] } } }
  const context = ref({preferenceScope:'user-project',ownerType:'space',ownerId:'preferred'})
  const {renderer,root} = createMetricRenderer(); let app
  try {
    app = renderer.createApp(defineComponent({setup(){ useMetricCollection(context,ref({memberType:'space',tree:true}),api);return()=>h('div') }}))
    app.mount(root); await flush()
    assert.equal(calls.length,1,'a saved direct scope must not first scan every descendant')
    assert.equal(calls[0].depth,'children')
    context.value = {preferenceScope:'user-project',ownerType:'space',ownerId:'another'}; await flush()
    assert.equal(calls.at(-1).depth,'descendants','the next owner uses its own default')
  } finally { app?.unmount(); globalThis.localStorage = priorStorage }
})

test('multiple outputs use one paginated request, persist per identity and restore only currently visible groups', async () => {
  const priorStorage=globalThis.localStorage,stored=new Map(),calls=[]
  globalThis.localStorage={getItem:key=>stored.get(key) ?? null,setItem:(key,value)=>stored.set(key,value)}
  let catalog=['a','b','c']
  const api={collection:async query=>{calls.push({...query});return {readTime:1,visibleMembers:2,total:4,groups:catalog.map(id=>({id,output:{metricId:id},operations:['collection','average']})),data:[]}}}
  const context=ref({preferenceScope:'user-a/project',ownerType:'product',ownerId:'p'})
  let state,app
  const mount=()=>{const {renderer,root}=createMetricRenderer();app=renderer.createApp(defineComponent({setup(){state=useMetricCollection(context,ref({memberType:'device'}),api);return()=>h('div')}}));app.mount(root)}
  try {
    mount();await flush();calls.length=0
    state.selectGroups(['a','b']);await flush()
    assert.equal(calls.length,1);assert.deepEqual(calls[0].groups,['a','b']);assert.equal(calls[0].group,undefined);assert.equal(calls[0].operation,'collection')
    state.changePage(2);await flush();assert.equal(calls.at(-1).pageIndex,1);assert.deepEqual(calls.at(-1).groups,['a','b'])
    app.unmount();calls.length=0;mount();await flush()
    assert.equal(calls.length,2);assert.equal(calls[0].groups,undefined,'saved IDs are validated against the authorized catalog first')
    assert.deepEqual(state.selectedGroups.value,['a','b'])
    app.unmount();catalog=['a','c'];calls.length=0;mount();await flush()
    assert.deepEqual(state.selectedGroups.value,['a']);assert.equal(calls.at(-1).group,'a')
    context.value={...context.value,preferenceScope:'user-b/project'};await flush()
    assert.equal(state.selectedGroups.value.length,1,'another user does not inherit the prior multi-selection')
    state.selectGroups();await flush();assert.equal(state.group.value,undefined);assert.equal(calls.at(-1).groups,undefined)
    assert.equal(JSON.parse(stored.get('metric-collection:["user-a/project","product","p","device"]')).groups[0],'a')
  } finally {app?.unmount();globalThis.localStorage=priorStorage}
})

test('summary drilldown uses its explicit depth and never overwrites standalone member preferences',async()=>{
  const previous=globalThis.localStorage,writes=[],calls=[]
  globalThis.localStorage={getItem:()=>JSON.stringify({descendants:true,groups:['other']}),setItem:(...args)=>writes.push(args)}
  const api={collection:async query=>{calls.push(query);return {readTime:1,visibleMembers:2,total:2,groups:[{id:'other',output:{metricId:'other'},operations:['collection']}],data:[]}}}
  const {renderer,root}=createMetricRenderer();let state
  const app=renderer.createApp(defineComponent({setup(){state=useMetricCollection(ref({ownerType:'deviceGroup',ownerId:'g',preferenceScope:'u'}),ref({memberType:'deviceGroup',tree:true}),api,ref({templateId:'quality',descendants:false}));return()=>h('div')}}))
  try {
    app.mount(root);await flush()
    assert.equal(calls.length,1);assert.equal(calls[0].depth,'children');assert.equal(calls[0].templateId,'quality');assert.equal(calls[0].group,undefined)
    assert.equal(state.operation.value,'collection');assert.deepEqual(writes,[])
  } finally {app.unmount();globalThis.localStorage=previous}
})
