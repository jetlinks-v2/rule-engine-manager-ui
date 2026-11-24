import assert from 'node:assert/strict'
import test from 'node:test'
import {defineComponent,h,ref} from 'vue'
import {resolve} from 'node:path'
import {createMetricLoader,createMetricRenderer,flush,sourceRoot} from './helpers/metricRuntime.mjs'

const load=createMetricLoader({
  [resolve(sourceRoot,'components/Metric/api.ts')]:{metricApi:{}},
  [resolve(sourceRoot,'components/Metric/extensions/registry.ts')]:{collectMetricResources:()=>({dimensions:[]})},
})
const {useMetricBindings}=load('components/Metric/bindings/useMetricBindings.ts')
function mount(context,picker,api){
  let state
  const {renderer,root}=createMetricRenderer()
  const app=renderer.createApp(defineComponent({setup(){state=useMetricBindings(context,ref(picker),api);return()=>h('div')}}))
  app.mount(root)
  return {state,close:()=>app.unmount()}
}
const reference={configId:'source',outputId:'usage',targetType:'device',targetId:'d'}

test('linked pagination retains the authority cursor even when the visible page is empty',async()=>{
  const calls=[]
  const {state,close}=mount(ref({ownerType:'zone',ownerId:'z'}),undefined,{
    objectBindings:async(type,id,cursor)=>{calls.push(cursor);return cursor ? {items:[{id:'b',reference}],nextCursor:undefined} : {items:[],nextCursor:'hidden'}},
  })
  try{await flush();assert.equal(state.page.data.value.nextCursor,'hidden');await state.refresh('hidden');assert.equal(state.page.data.value.items[0].id,'b');assert.deepEqual(calls,[undefined,'hidden'])}
  finally{close()}
})

test('changing the owner invalidates late results and a pending source selection',async()=>{
  const context=ref({ownerType:'zone',ownerId:'old'}),pending=[],writes=[]
  let choose
  const {state,close}=mount(context,()=>new Promise(resolve=>{choose=resolve}),{
    objectBindings:async(_type,id)=>id==='old' ? new Promise(resolve=>pending.push(resolve)) : {items:[]},
    bindObjectMetric:async value=>writes.push(value),
  })
  try{
    const add=state.add('concrete');await flush();context.value={ownerType:'zone',ownerId:'new'};await flush()
    pending.shift()({items:[{id:'old',reference}]});choose({mapping:{kind:'metric',configId:'source',id:'usage',thingType:'device',thingId:'d'}})
    await add;await flush();assert.deepEqual(state.page.data.value.items,[]);assert.equal(writes.length,0)
  }finally{close()}
})

test('links require concrete outputs and failed refreshes clear previously visible results',async()=>{
  let denied=false,selected={kind:'metric',configId:'source',id:'usage',thingType:'device',thingId:'*'}
  const writes=[]
  const {state,close}=mount(ref({ownerType:'zone',ownerId:'z'}),async()=>({mapping:selected}),{
    objectBindings:async()=>{if(denied)throw new Error('forbidden');return {items:[{id:'b',reference}]}},
    bindObjectMetric:async value=>writes.push(value),
  })
  try{
    await flush();await state.add('concrete');assert.equal(writes.length,0);assert.equal(state.mutationError.value,'concrete')
    selected={...selected,thingId:'d'};await state.add('concrete');assert.equal(writes[0].targetId,'d')
    await flush();assert.deepEqual(state.types.value,['device'])
    denied=true;await state.refresh()
    assert.equal(state.page.data.value,undefined);assert.deepEqual(state.types.value,[])
  }finally{close()}
})

test('failed additions retain the selected result for retry and never carry it to another owner',async()=>{
  const context=ref({ownerType:'zone',ownerId:'z'}),writes=[];let fail=true
  const {state,close}=mount(context,async()=>({mapping:{kind:'metric',configId:'source',id:'usage',thingType:'device',thingId:'d'}}),{
    objectBindings:async()=>({items:[]}),bindObjectMetric:async value=>{writes.push(value);if(fail)throw Error('write failed')},
  })
  try{
    await state.add('concrete');assert.equal(state.pendingAdd.value.targetId,'d');assert.equal(state.mutationError.value,'write failed')
    fail=false;await state.retryAdd();assert.deepEqual(writes[0],writes[1]);assert.equal(state.pendingAdd.value,undefined)
    fail=true;await state.add('concrete');context.value={ownerType:'zone',ownerId:'another'};await flush()
    assert.equal(state.pendingAdd.value,undefined);await state.retryAdd();assert.equal(writes.length,3)
  }finally{close()}
})
