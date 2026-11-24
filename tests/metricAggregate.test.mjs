import assert from 'node:assert/strict'
import test from 'node:test'
import {defineComponent,h,ref} from 'vue'
import {resolve} from 'node:path'
import {createMetricLoader,createMetricRenderer,flush,sourceRoot} from './helpers/metricRuntime.mjs'
const load=createMetricLoader({[resolve(sourceRoot,'components/Metric/api.ts')]:{metricApi:{}}})
const {aggregateValue,aggregateCards,aggregateDirectory}=load('components/Metric/collection/aggregatePresentation.ts')
const {useMetricAggregate}=load('components/Metric/collection/useMetricAggregate.ts')

test('scope summaries average unique valid objects and preserve missing results',()=>{
  const point={observed:10,valid:2,sum:30,min:10,max:20}
  assert.equal(aggregateValue(point,'average'),15)
  assert.equal(aggregateValue(point,'min'),10)
  assert.equal(aggregateValue({...point,valid:0},'sum'),undefined)
  assert.equal(aggregateValue({...point,sum:null},'average'),undefined)
})

test('one template card contains compatible outputs but keeps different source parameters separate',()=>{
  const groups=[{id:'health',cardId:'v1-default'},{id:'score',cardId:'v1-default'},{id:'other-threshold',cardId:'v1-custom'},{id:'revision',cardId:'v2-default'}]
  const cards=aggregateCards(groups)
  assert.equal(cards.length,3)
  assert.deepEqual(cards[0].groups.map(item=>item.id),['health','score'])
  assert.deepEqual(cards[1].groups.map(item=>item.id),['other-threshold'])
})

test('authorized template declarations remain visible without fabricating aggregate values or merging parameter groups',()=>{
  const entries=[{id:'a',cardId:'default',templateId:'t',templateName:'Template',version:'1',revision:2,output:{metricId:'score'},operations:['collection','average'],policy:{defaultOperation:'average'}},
    {id:'b',cardId:'default',templateId:'t',templateName:'Template',version:'1',revision:2,output:{metricId:'state'},operations:['collection']},
    {id:'c',cardId:'custom',templateId:'t',templateName:'Template',version:'1',revision:2,output:{metricId:'score'},operations:['collection','average']}]
  const groups=aggregateDirectory([],entries)
  assert.equal(aggregateCards(groups).length,2)
  assert.equal(groups[0].availability,'noRecords');assert.equal(groups[1].availability,'unsupported')
  assert.equal(aggregateValue(groups[0].latest,'average'),undefined)
  const stored={...groups[0],id:'stored',cardId:'t:1:2:default:true',availability:undefined,latest:{valid:2,sum:30}}
  const merged=aggregateDirectory([stored],entries)
  assert.equal(aggregateCards(merged).length,2)
  assert.equal(merged.filter(item=>item.output.metricId==='score').length,2)
  const legacy={...entries[0],revision:undefined}
  assert.equal(aggregateDirectory([{...stored,revision:1,cardId:'t:1:1:default:true'}],[legacy]).length,1,
    'an unspecified published revision resolves to one, matching persisted projections')
})

test('aggregate refresh shares scope requests, keeps old cards mounted and rejects stale scopes',async()=>{
  const pending=[],calls=[]
  const api={aggregate:query=>{calls.push(query);return new Promise(resolve=>pending.push(resolve))}}
  const context=ref({ownerType:'product',ownerId:'p'}),scope=ref({memberType:'device'})
  const {renderer,root}=createMetricRenderer();let state
  const app=renderer.createApp(defineComponent({setup(){state=useMetricAggregate(context,scope,api);return()=>h('div')}}))
  app.mount(root);await new Promise(resolve=>setTimeout(resolve,10));await flush()
  assert.equal(calls.length,1);assert.equal(calls[0].rootId,'p');assert.ok((calls[0].to-calls[0].from)/calls[0].interval<=256)
  pending.shift()({readTime:1,groups:[{id:'one'}]});await flush()
  const refresh=state.refresh();assert.equal(state.result.value.groups[0].id,'one','refresh must not replace cards with a loading placeholder')
  await state.refresh();assert.equal(calls.length,2,'one scope query can be in flight')
  context.value={ownerType:'product',ownerId:'new'};await flush()
  pending.shift()({readTime:2,groups:[{id:'old'}]});await refresh
  await new Promise(resolve=>setTimeout(resolve,10));await flush()
  assert.equal(state.result.value,undefined);assert.equal(calls.at(-1).rootId,'new')
  pending.shift()({readTime:3,groups:[{id:'new'}]});await flush()
  assert.equal(state.result.value.groups[0].id,'new');app.unmount()
})

test('template preference is applied before aggregation and uses a lightweight directory',async()=>{
  const oldStorage=globalThis.localStorage,stored=new Map(),calls=[],catalog=[],directories=[]
  globalThis.localStorage={getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)}
  stored.set('metric-aggregate:["u/p","product","p","device"]',JSON.stringify(['t','removed']))
  const api={aggregateTemplates:async query=>{directories.push(query);return [{templateId:'t',templateName:'T'},{templateId:'other',templateName:'Other'}]},collection:async query=>{catalog.push(query);return {groups:[]}},aggregate:async query=>{calls.push(query);return {readTime:1,groups:query.templateIds?.map(templateId=>({templateId})) || [{templateId:'t'},{templateId:'other'}]}}}
  const context=ref({ownerType:'product',ownerId:'p',preferenceScope:'u/p'})
  const {renderer,root}=createMetricRenderer();let state
  const app=renderer.createApp(defineComponent({setup(){state=useMetricAggregate(context,ref({memberType:'device'}),api);return()=>h('div')}}))
  app.mount(root)
  try {
    await new Promise(resolve=>setTimeout(resolve,10));await flush()
    assert.deepEqual(calls[0].templateIds,['t']);assert.deepEqual(state.selectedTemplates.value,['t']);assert.equal(catalog.length,0);assert.equal(directories.length,1)
    await state.refresh();assert.equal(catalog.length,0,'aggregate requests must not discover members')
    state.selectTemplates(['other']);await new Promise(resolve=>setTimeout(resolve,10));await flush();assert.deepEqual(state.selectedTemplates.value,['other']);assert.deepEqual(calls.at(-1).templateIds,['other']);assert.equal(state.directory.value.length,2)
    assert.deepEqual(JSON.parse(stored.get('metric-aggregate:["u/p","product","p","device"]')),['other'])
    context.value={...context.value,preferenceScope:'another-user'};await flush();await new Promise(resolve=>setTimeout(resolve,10));await flush()
    assert.equal(calls.at(-1).templateIds,undefined,'identity change must not restore another user selection')
  } finally {app.unmount();globalThis.localStorage=oldStorage}
})

test('declared depth is preserved and result counts are never used as member counts',async()=>{
  const calls=[],scope=ref({memberType:'device'}),catalog={visibleMembers:23,groups:[],data:[],total:23}
  const api={collection:async query=>{calls.push(query);return catalog},aggregate:async query=>{calls.push(query);return {readTime:1,groups:[]}}}
  const {renderer,root}=createMetricRenderer();let state
  const app=renderer.createApp(defineComponent({setup(){state=useMetricAggregate(ref({ownerType:'product',ownerId:'p'}),scope,api);return()=>h('div')}}))
  app.mount(root)
  try {
    await new Promise(resolve=>setTimeout(resolve,10));await flush()
    assert.equal(calls[0].depth,'self','non-tree scopes cannot silently expand descendants')
    assert.equal(state.result.value.visibleMembers,undefined);assert.equal(calls.length,1)
    scope.value={memberType:'product',tree:true};await flush();await new Promise(resolve=>setTimeout(resolve,10));await flush()
    state.descendants.value=false;await flush();await new Promise(resolve=>setTimeout(resolve,10));await flush()
    assert.equal(calls.at(-1).depth,'children')
  } finally {app.unmount()}
})

test('a queued refresh rechecks aggregate permissions and forbidden reads clear prior content',async()=>{
  const pending=[],catalogs=[];let failure
  const api={collection:async query=>{catalogs.push(query);return {visibleMembers:2,groups:[]}},aggregate:()=>failure ? Promise.reject(failure) : new Promise(resolve=>pending.push(resolve))}
  const {renderer,root}=createMetricRenderer();let state
  const app=renderer.createApp(defineComponent({setup(){state=useMetricAggregate(ref({ownerType:'product',ownerId:'p'}),ref({memberType:'device'}),api);return()=>h('div')}}))
  app.mount(root)
  try {
    await new Promise(resolve=>setTimeout(resolve,10));await flush()
    await state.refresh(true)
    pending.shift()({readTime:1,groups:[]});await flush();await new Promise(resolve=>setTimeout(resolve,10));await flush()
    assert.equal(catalogs.length,0,'a queued refresh must not scan member configurations');assert.equal(pending.length,1)
    pending.shift()({readTime:2,groups:[]});await flush()
    failure=new Error('network');await state.refresh()
    assert.equal(state.result.value.readTime,2,'transient failures retain a clearly marked previous result')
    failure={response:{status:403},message:'forbidden'};await state.refresh()
    assert.equal(state.result.value,undefined);assert.equal(state.directory.value,undefined)
  } finally {app.unmount()}
})

test('已添加指标复用有界汇总，筛选只改变展示，偏好与相同类型的成员范围隔离',async()=>{
  const previousStorage=globalThis.localStorage,stored=new Map(),calls=[]
  globalThis.localStorage={getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)}
  const scope=ref({kind:'linked',memberType:'device'}),context=ref({ownerType:'space',ownerId:'room',preferenceScope:'u'})
  const api={
    collection:async query=>{calls.push(['directory',query]);return {visibleMembers:3,groups:[{templateId:'member'}]}},
    aggregate:async query=>{calls.push(['members',query]);return {readTime:1,groups:[{templateId:'member'}]}},
    aggregateLinked:async query=>{calls.push(['linked',query]);return {readTime:1,groups:[{templateId:'a'},{templateId:'b'}]}},
  }
  let state
  const {renderer,root}=createMetricRenderer(),app=renderer.createApp({setup(){state=useMetricAggregate(context,scope,api);return()=>h('div')}})
  const settle=async()=>{await new Promise(resolve=>setTimeout(resolve,15));await flush()}
  app.mount(root)
  try{
    await settle();assert.equal(calls.length,1);assert.equal(calls[0][0],'linked')
    const query=calls[0][1]
    assert.equal(query.objectType,'space');assert.equal(query.objectId,'room');assert.equal(query.targetType,'device')
    assert.ok((query.to-query.from)/query.interval<=120);assert.equal(query.rootType,undefined)
    state.selectTemplates(['a','unauthorized']);await flush()
    assert.deepEqual(state.selectedTemplates.value,['a']);assert.equal(calls.length,1,'filtering a complete linked response must not repeat storage reads')
    assert.equal(state.result.value.groups.length,2,'retain full server results for resetting the filter')
    await state.refresh();assert.deepEqual(state.selectedTemplates.value,['a'])
    scope.value={kind:'members',memberType:'device'};await settle()
    assert.equal(calls.at(-1)[0],'members');assert.ok(calls.every(([kind])=>kind!=='directory'))
    assert.equal(calls.at(-1)[1].templateIds,undefined)
    state.selectTemplates(['member']);await flush()
    scope.value={kind:'linked',memberType:'device'};await settle()
    assert.equal(calls.at(-1)[0],'linked');assert.deepEqual(state.selectedTemplates.value,['a'])
  }finally{app.unmount();globalThis.localStorage=previousStorage}
})

test('切换统计来源隔离迟到结果，普通刷新保持卡片，关联汇总撤权后清理结果',async()=>{
  const scope=ref({kind:'members',memberType:'device'}),pending=[]
  let failure
  const api={aggregate:()=>new Promise(resolve=>pending.push(resolve)),aggregateLinked:async()=>{if(failure)throw failure;return {readTime:2,groups:[{id:'linked',templateId:'t'}]}}}
  let state
  const {renderer,root}=createMetricRenderer(),app=renderer.createApp({setup(){state=useMetricAggregate(ref({ownerType:'space',ownerId:'room'}),scope,api);return()=>h('div')}})
  const settle=async()=>{await new Promise(resolve=>setTimeout(resolve,15));await flush()}
  app.mount(root)
  try{
    await settle();assert.equal(pending.length,1)
    scope.value={kind:'linked',memberType:'device'};await settle()
    pending.shift()({readTime:1,groups:[{id:'stale',templateId:'t'}]});await settle()
    assert.equal(state.result.value.groups[0].id,'linked')
    failure=new Error('network');await state.refresh()
    assert.equal(state.result.value.groups[0].id,'linked')
    failure={response:{status:403},message:'forbidden'};await state.refresh()
    assert.equal(state.result.value,undefined);assert.equal(state.directory.value,undefined)
  }finally{app.unmount()}
})
