import assert from 'node:assert/strict'
import test from 'node:test'
import { defineComponent, h, ref } from 'vue'
import { resolve } from 'node:path'
import { createMetricLoader, createMetricRenderer, flush, sourceRoot } from './helpers/metricRuntime.mjs'
const load=createMetricLoader({[resolve(sourceRoot,'components/Metric/api.ts')]:{metricApi:{}}})
const {useMetricScopeOverview}=load('components/Metric/collection/useMetricScopeOverview.ts')
const {useMetricCollection}=load('components/Metric/collection/useMetricCollection.ts')

test('scope summaries share template discovery, serialize refresh and discard an old owner response',async()=>{
  const context=ref({ownerType:'product',ownerId:'p'})
  const configs=ref([{id:'a',templateId:'t',targetType:'device'},{id:'b',templateId:'t',targetType:'device'}])
  const calls=[],pending=[]
  const api={collectionOverview:query=>{calls.push(query);return new Promise(resolve=>pending.push(resolve))}}
  const {renderer,root}=createMetricRenderer();let state
  const app=renderer.createApp(defineComponent({setup(){state=useMetricScopeOverview(context,configs,api);return()=>h('div')}}))
  app.mount(root)
  try {
    const first=state.refresh();await flush()
    assert.deepEqual(calls[0].templateIds,['t'])
    state.refresh();assert.equal(calls.length,1,'refresh cannot start a second overlapping scope scan')
    context.value={ownerType:'product',ownerId:'new'};await flush()
    pending.shift()({readTime:1,visibleMembers:2,templates:[{templateId:'t',coverage:{enabledMembers:2},outputs:[]}]})
    await first;assert.equal(state.state(configs.value[0]),undefined,'an old owner cannot populate the new owner')
    const second=state.refresh();await flush()
    pending.shift()({readTime:2,visibleMembers:3,templates:[{templateId:'t',coverage:{enabledMembers:1},outputs:[]}]})
    await second
    assert.equal(state.state(configs.value[1]).members,3)
  } finally {app.unmount()}
})

test('opening summary members filters the template before pagination and retains absent members',async()=>{
  const calls=[]
  const selection=ref({templateId:'quality',group:'primary'})
  const group={id:'primary',templateId:'quality',output:{metricId:'health'},operations:['collection']}
  const api={collection:async query=>{calls.push(query);return {groups:[group],data:[],visibleMembers:2,total:2,readTime:1}}}
  const {renderer,root}=createMetricRenderer()
  const app=renderer.createApp(defineComponent({setup(){useMetricCollection(ref({ownerType:'product',ownerId:'p'}),ref({memberType:'device'}),api,selection);return()=>h('div')}}))
  app.mount(root);await flush()
  try {
    assert.equal(calls[0].templateId,'quality');assert.equal(calls[0].group,'primary')
    assert.equal(calls[0].includeUnconfigured,true)
    selection.value=undefined;await flush()
    assert.equal(calls.at(-1).templateId,undefined)
  } finally {app.unmount()}
})
