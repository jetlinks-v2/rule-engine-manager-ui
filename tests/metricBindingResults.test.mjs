import assert from 'node:assert/strict'
import test from 'node:test'
import {defineComponent,h,ref} from 'vue'
import {resolve} from 'node:path'
import {createMetricLoader,createMetricRenderer,flush,sourceRoot} from './helpers/metricRuntime.mjs'

const names=[]
const load=createMetricLoader({
  [resolve(sourceRoot,'components/Metric/api.ts')]:{metricApi:{}},
  [resolve(sourceRoot,'components/Metric/extensions/registry.ts')]:{collectMetricResources:()=>({dimensions:[{provider:{ownerType:'device',resolveObjects:async ids=>{names.push(ids);return ids.map(ownerId=>({ownerId,label:`Name ${ownerId}`}))}}},{provider:{ownerType:'group',resolveObjects:async ids=>ids.map(ownerId=>({ownerId,label:`Group ${ownerId}`}))}}]})},
})
const {useMetricBindingResults}=load('components/Metric/bindings/useMetricBindingResults.ts')
const link=(id,objectId,targetId='d',outputId='usage')=>({id,reference:{objectType:'group',objectId,configId:'scope',outputId,targetType:'device',targetId},pending:false})
const template={id:'t',name:'Statistics',definitions:[],inputDefinitions:[],parameterDefinitions:[],outputs:[{metricId:'usage',name:'Usage',persist:true},{metricId:'count',name:'Count'}]}
function mount(links,api){let state;const {renderer,root}=createMetricRenderer();const app=renderer.createApp(defineComponent({setup(){state=useMetricBindingResults(links,ref('en'),api);return()=>h('div')}}));app.mount(root);return {state,close:()=>app.unmount()}}

test('linked results deduplicate paths, batch names, and keep each target of a shared config separate',async()=>{
  const latest=[],configs=[],templates=[]
  const fixture=mount(ref([link('a','child'),link('b','parent'),link('c','child','d2'),link('e','child','d','count')]),{
    latest:async(ids,target)=>{latest.push([ids,target]);return [{configId:'scope',outputs:{usage:{value:target.targetId==='d' ? 4 : 9}}}]},
    getResultConfig(...args) { return this.getConfig(...args) },
    getConfig:async(...args)=>{configs.push(args);return {id:'scope',state:'enabled'}},
    resultTemplate(...args) { return this.configTemplate(...args) },
    configTemplate:async(...args)=>{templates.push(args);return template},
  })
  try{await flush();assert.equal(fixture.state.cards.value.length,3);assert.equal(latest.length,2);assert.equal(configs.length,2);assert.equal(templates.length,2)
    const cards=fixture.state.cards.value;assert.equal(cards[0].links.length,2);assert.equal(cards[0].value.value,4);assert.equal(cards[1].value.value,9)
    assert.equal(cards[0].source,'Name d');assert.equal(cards[0].locations.a,'Group child');assert.deepEqual(names.at(-1),['d','d2'])
  }finally{fixture.close()}
})

test('revoked metric access clears names and values, while late owner reads cannot replace the new list',async()=>{
  const links=ref([link('old','old')]);let finish
  const fixture=mount(links,{latest:async()=>new Promise(resolve=>{finish=resolve}),getResultConfig(...args) { return this.getConfig(...args) },getConfig:async()=>({id:'scope'}),resultTemplate(...args) { return this.configTemplate(...args) },configTemplate:async()=>template})
  try{await flush();const old=finish;links.value=[link('new','new','secret')];await flush();const current=finish
    current([{configId:'scope',inaccessible:true,outputs:{}}]);await flush();old([{configId:'scope',outputs:{usage:{value:42}}}]);await flush()
    assert.equal(fixture.state.cards.value[0].links[0].id,'new');assert.equal(fixture.state.cards.value[0].unavailable,true);assert.equal(fixture.state.cards.value[0].value,undefined);assert.equal(fixture.state.cards.value[0].source,undefined)
  }finally{fixture.close()}
})

test('safe unavailable bindings retain their removal identity without loading source metadata',async()=>{
  const fixture=mount(ref([{id:'hidden',addedAt:{type:'group',id:'here'},unavailable:true,pending:false}]),{
    latest:async()=>{throw Error('must not read redacted source')},getResultConfig(...args) { return this.getConfig(...args) },getConfig:async()=>{throw Error('must not read redacted source')},resultTemplate(...args) { return this.configTemplate(...args) },configTemplate:async()=>{throw Error('must not read redacted source')},
  })
  try{await flush();const card=fixture.state.cards.value[0];assert.equal(card.unavailable,true);assert.equal(card.links[0].id,'hidden');assert.equal(card.source,undefined);assert.equal(card.value,undefined)}finally{fixture.close()}
})

test('switching result identities clears prior values before a slow read finishes',async()=>{
  const links=ref([link('a','parent')]);let complete
  const fixture=mount(links,{latest:async(_ids,target)=>target.targetId==='d' ? [{configId:'scope',outputs:{usage:{value:42}}}] : new Promise(resolve=>{complete=resolve}),getResultConfig(...args) { return this.getConfig(...args) },getConfig:async()=>({id:'scope'}),resultTemplate(...args) { return this.configTemplate(...args) },configTemplate:async()=>template})
  try{await flush();assert.equal(fixture.state.cards.value[0].value.value,42)
    links.value=[link('b','elsewhere','other')];await flush()
    assert.equal(fixture.state.cards.value.length,0);assert.equal(fixture.state.query.state.value.status,'loading')
    complete([{configId:'scope',inaccessible:true,outputs:{}}]);await flush()
    assert.equal(fixture.state.cards.value[0].unavailable,true)
  }finally{fixture.close()}
})

test('same-source refresh retains cards while waiting and ignores older snapshots only within the same enabled data version',async()=>{
  let next,finish
  const config={id:'scope',state:'enabled',dataVersion:'v1',enabledAt:10}
  const value=time=>({metricId:'usage',value:time,evaluationTime:time,thingType:'device',thingId:'d',dataVersion:'v1',tags:{enabledAt:10,configId:'scope'}})
  const fixture=mount(ref([link('a','parent')]),{latest:async()=>next ? new Promise(resolve=>{finish=resolve}) : [{configId:'scope',outputs:{usage:value(100)}}],getResultConfig(...args) { return this.getConfig(...args) },getConfig:async()=>config,resultTemplate(...args) { return this.configTemplate(...args) },configTemplate:async()=>template})
  try{
    await flush();const card=fixture.state.cards.value[0]
    next=true;const refresh=fixture.state.refresh();await flush()
    assert.strictEqual(fixture.state.cards.value[0],card)
    finish([{configId:'scope',outputs:{usage:value(50)}}]);await refresh
    assert.equal(fixture.state.cards.value[0].value.evaluationTime,100)
    const revoked=fixture.state.refresh();await flush();finish([{configId:'scope',inaccessible:true,outputs:{}}]);await revoked
    assert.equal(fixture.state.cards.value[0].unavailable,true);assert.equal(fixture.state.cards.value[0].value,undefined)
  }finally{fixture.close()}
})
