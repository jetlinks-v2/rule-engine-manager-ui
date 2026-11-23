import assert from 'node:assert/strict'
import test from 'node:test'
import { ref } from 'vue'
import { resolve } from 'node:path'
import { createMetricLoader, createMetricRenderer, flush, sourceRoot } from './helpers/metricRuntime.mjs'

const load = createMetricLoader({ [resolve(sourceRoot, 'components/Metric/api.ts')]: { metricApi: {} } })
const { useMetricPanel } = load('components/Metric/useMetricPanel.ts')
const { useMetricTrends } = load('components/Metric/useMetricTrends.ts')
const { createConfig, metricDataTarget } = load('components/Metric/service.ts')
const template = { id:'state', version:'1', inputDefinitions:[], definitions:[], outputs:[{ metricId:'duration' }], parameters:{}, parameterDefinitions:[] }
const config = { id:'product-config', ownerType:'product', ownerId:'pumps', scope:'children', targetType:'device', targetId:'*',
  slot:'runtime', templateId:'state', templateVersion:'1', revision:1, dataVersion:'same', enabledAt:1, state:'enabled', inputMappings:{}, parameters:{} }
const value = (device, result, at) => ({ thingType:'device', thingId:device, metricId:'duration', value:result, dataVersion:'same',
  evaluationTime:at, processTime:at, tags:{ configId:'product-config', enabledAt:1 } })

test('product creates one inherited definition, while summaries retain their own target', () => {
  const product = { ownerType:'product', ownerId:'pumps', inheritance:{ targetType:'device', label:'Each pump' } }
  const inherited = createConfig(product)
  assert.equal(inherited.scope, 'children')
  assert.equal(inherited.targetId, '*')
  assert.equal(inherited.targetType, 'device')
  assert.equal(metricDataTarget(inherited, product), undefined)
  assert.deepEqual(metricDataTarget(inherited, { ownerType:'device', ownerId:'new-pump' }), { targetType:'device', targetId:'new-pump' })
  assert.equal(createConfig({ ownerType:'product', ownerId:'pumps' }).targetType, 'product')
})

test('inherited device results update live without editing the product or accepting stale snapshots and callbacks', async () => {
  const prior = globalThis.document, visibility = new Map()
  globalThis.document = { hidden:false, addEventListener:(name, callback) => visibility.set(name, callback), removeEventListener:name => visibility.delete(name) }
  const context = ref({ ownerType:'device', ownerId:'A', editable:true })
  const streams = [], targets = []
  let writes = 0, allowed = true, historyReads = 0, view, trends
  const api = {
    byOwner:async () => [config], resultTemplate(...args) { return this.configTemplate(...args) }, configTemplate:async (_id, target) => { targets.push(target); return template },
    latest:async (ids, target) => allowed ? ids.map(configId => ({ configId, outputs:{ duration:value(target.targetId, target.targetId === 'A' ? 10 : 30, 100) } })) : [],
    saveConfig:async () => { writes++ },
    history:async () => { historyReads++; return [] },
    watchLatest:(ids, target, interval, next, error) => { const stream = { ids, target, interval, next:value => next(value.configId ? value : { configId:config.id, outputs:{ duration:value } }), error, stopped:false }; streams.push(stream); return () => { stream.stopped = true } },
  }
  const { renderer, root } = createMetricRenderer()
  const app = renderer.createApp({ setup() {
    view = useMetricPanel(context, api)
    trends = useMetricTrends(ref([{ id:config.id, key:'A', outputs:['duration'], targetType:'device', targetId:'A' }]), view.reference, api)
    trends.observe(config.id, {})
    return () => null
  } })
  try {
    app.mount(root); await view.refresh(); await flush()
    assert.equal(view.canManage(config), false)
    view.openEditor(config); assert.equal(view.editorOpen.value, false)
    await view.setEnabled(config, false); assert.equal(writes, 0)
    assert.deepEqual(targets[0], { targetType:'device', targetId:'A' })
    const readsBeforePush = historyReads
    streams[0].next({ ...value('A', 10, 100), state:{ duration:10, readView:{time:1000,duration:20} } })
    streams[0].next({ ...value('A', 10, 100), state:{ duration:10, readView:{time:2000,duration:21} } })
    assert.equal(view.outputs.value['product-config'].duration.state.readView.duration, 21,
      'periodic reads must advance the current view even when the computation identity is unchanged')
    for (let index = 0; index < 100; index++) streams[0].next(value('A', index, 200 + index))
    await flush()
    assert.equal(historyReads, readsBeforePush, 'high frequency pushes must not trigger history queries')
    streams[0].next(value('A', 20, 400)); assert.equal(view.outputs.value['product-config'].duration.value, 20)
    streams[0].next({...value('A', 999, 999),dataVersion:'old'})
    assert.equal(view.outputs.value['product-config'].duration.value, 20, 'late obsolete revisions must not clear the current result')
    await view.refresh(); assert.equal(view.outputs.value['product-config'].duration.value, 20)
    view.refreshInterval.value = 5000; await flush()
    assert.equal(streams[0].stopped, true); assert.equal(streams.at(-1).interval, 5000)
    streams[0].error()
    await view.refresh()
    assert.equal(streams.length, 2, 'a stale terminal callback cannot remove the replacement subscription')
    const old = streams.at(-1)
    context.value = { ...context.value, ownerId:'B' }; await view.refresh(); await flush()
    assert.equal(old.stopped, true)
    old.next(value('A', 999, 999)); assert.equal(view.outputs.value['product-config'].duration.value, 30)
    streams.at(-1).next(value('B', 40, 300)); assert.equal(view.outputs.value['product-config'].duration.value, 40)
    view.select('product-config', 'duration')
    streams.at(-1).next({ configId:'product-config', outputs:{}, inaccessible:true })
    assert.equal(view.outputs.value['product-config'], undefined)
    assert.equal(view.reference.value, undefined)
    allowed = false; await view.refresh()
    assert.deepEqual(view.inaccessibleIds.value, ['product-config'])
    assert.equal(streams.at(-1).stopped, true)
    globalThis.document.hidden = true; visibility.get('visibilitychange')()
  } finally { app.unmount(); globalThis.document = prior }
})

test('metadata synchronization recovers a failed stream while retaining a healthy stream', async () => {
  const prior = globalThis.document
  globalThis.document = {hidden:false,addEventListener(){},removeEventListener(){}}
  const configs = ['A','B'].map(id => ({...config,id,scope:'single',targetId:id}))
  const streams = []
  let reads=0, view
  const api = {
    byOwner:async()=>configs, resultTemplate(...args) { return this.configTemplate(...args) }, configTemplate:async()=>template,
    latest:async(ids,target)=>{ reads++; return ids.map(id=>({configId:id,outputs:{duration:{...value(target.targetId,10,100),tags:{configId:id,enabledAt:1}}}})) },
    watchLatest:(ids,target,interval,next,error)=>{ const stream={ids,next,error,stopped:false}; streams.push(stream); return()=>{stream.stopped=true} },
  }
  const {renderer,root}=createMetricRenderer()
  const app=renderer.createApp({setup(){view=useMetricPanel(ref({ownerType:'space',ownerId:'floor'}),api);return()=>null}})
  try {
    app.mount(root); await view.refresh(); await flush()
    const first=streams[0], healthy=streams[1], initialReads=reads
    await view.refresh(false)
    assert.equal(reads,initialReads,'healthy streams avoid duplicate latest polling')
    first.error(new Error('disconnected'))
    assert.equal(view.latestErrors.value.A,'disconnected')
    await view.refresh(false)
    assert.equal(view.latestErrors.value.A,undefined)
    assert.equal(healthy.stopped,false)
    assert.equal(streams.length,3,'the failed target reconnects without replacing its healthy sibling')
    streams.at(-1).next({configId:'A',outputs:{},inaccessible:true})
    assert.equal(view.outputs.value.A,undefined)
    await view.refresh(false)
    assert.equal(view.outputs.value.A.duration.value,10,'restored access is checked on metadata synchronization')
  } finally {app.unmount();globalThis.document=prior}
})
