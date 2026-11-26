import assert from 'node:assert/strict'
import test from 'node:test'
import { ref } from 'vue'
import { createMetricLoader, createMetricRenderer, flush } from './helpers/metricRuntime.mjs'

const load = createMetricLoader({ './api': { metricApi: {} } })
const { useMetricTrends } = load('components/Metric/useMetricTrends.ts')
const { useMetricPanel } = load('components/Metric/useMetricPanel.ts')
const { useMetricResult } = load('components/Metric/useMetricResult.ts')
const target = id => ({ id, key: id, outputs: ['value'], targetType: 'device', targetId: id })
const value = (number, time = Date.now()) => ({ metricId: 'value', value: number, evaluationTime: time })

function fixture(ids = ['a','b','c','d']) {
  const priorDocument = globalThis.document
  const priorObserver = globalThis.IntersectionObserver
  const listeners = {}, calls = [], received = []
  let intersect, model
  globalThis.document = { hidden: false, addEventListener: (event, fn) => { listeners[event] = fn }, removeEventListener() {} }
  globalThis.IntersectionObserver = class { constructor(callback) { intersect = callback } observe() {} unobserve() {} disconnect() {} }
  const targets = ref(ids.map(target)), snapshot = ref({}), interval = ref(1000)
  const api = { watchResults(id, request, frame, error) { const call = { id, request, frame, error, stopped: false }; calls.push(call); return () => { call.stopped = true } } }
  const view = createMetricRenderer()
  const app = view.renderer.createApp({ setup() { model = useMetricTrends(targets, ref(), api, undefined, { interval, onFrame: (id,frame) => received.push([id,frame]) }); return () => null } })
  app.mount(view.root)
  const elements = Object.fromEntries(targets.value.map(item => [item.id, {}]))
  for (const [id, element] of Object.entries(elements)) model.observe(id, element)
  return { model, targets, snapshot, interval, calls, received, listeners,
    visible(ids) { intersect(Object.entries(elements).map(([id,element]) => ({ target: element, isIntersecting: ids.includes(id) }))) },
    close() { app.unmount(); globalThis.document = priorDocument; globalThis.IntersectionObserver = priorObserver } }
}

test('只加载可视卡片，历史逐条展示；最新变化不重读历史，滚出视区取消', async () => {
  const f = fixture()
  try {
    await flush(); assert.equal(f.calls.length, 0)
    f.visible(['a','b']); await flush(); assert.deepEqual(f.calls.map(call => call.id), ['a','b'])
    const a = f.calls[0]
    a.frame({ kind: 'reset' }); a.frame({ kind: 'history', value: value(1) })
    assert.equal(f.model.entries.value.a.values[0].value, 1)
    assert.equal(f.model.entries.value.a.loading, true)
    a.frame({ kind: 'ready' }); a.frame({ kind: 'latest', latest: { configId: 'a', outputs: { value: value(2) } } })
    assert.equal(f.model.entries.value.a.latestLoading, false)
    f.snapshot.value = { next: true }; await flush(); assert.equal(f.calls.length, 2)
    f.visible(['b','c']); await flush(); assert.equal(a.stopped, true); assert.equal(f.calls.at(-1).id, 'c')
    a.frame({ kind: 'history', value: value(99) }); assert.equal(f.model.entries.value.a, undefined)
    f.visible(['a','c']); await flush(); assert.equal(f.calls.at(-1).id, 'a')
  } finally { f.close() }
})

test('实时更新保留零合并间隔，切换时取消旧订阅并继续接收新结果', async () => {
  const f = fixture(['a'])
  try {
    f.visible(['a']); await flush()
    const previous = f.calls[0]
    previous.frame({ kind: 'ready' })
    f.interval.value = 0; await flush()
    assert.equal(previous.stopped, true)
    const current = f.calls.at(-1)
    assert.equal(current.request.interval, 0)
    current.frame({ kind: 'ready' })
    const time = Date.now() - 10
    for (const number of [1, 2, 3]) current.frame({ kind: 'latest', latest: { configId: 'a', outputs: { value: value(number, time + number) } } })
    assert.deepEqual(f.received.filter(([, frame]) => frame.kind === 'latest').map(([, frame]) => frame.latest.outputs.value.value), [1, 2, 3])
    assert.deepEqual(f.model.entries.value.a.values.map(item => item.value), [3, 2, 1])
    assert.equal(f.calls.length, 2)
  } finally { f.close() }
})

test('初始历史最多三个在途，长连接不占已完成历史的队列额度', async () => {
  const f = fixture()
  try {
    f.visible(['a','b','c','d']); await flush(); assert.equal(f.calls.length, 3)
    f.calls[1].frame({ kind: 'ready' }); await flush(); assert.equal(f.calls.length, 4)
    assert.equal(f.calls[1].stopped, false)
    f.calls[0].error(new Error('failed')); await flush(); assert.equal(f.model.entries.value.a.error, 'failed')
    assert.equal(f.calls[2].stopped, false)
    globalThis.document.hidden = true; f.listeners.visibilitychange(); assert.ok(f.calls.every(call => call.stopped))
    globalThis.document.hidden = false; f.listeners.visibilitychange(); await flush(); assert.equal(f.calls.length, 7)
  } finally { f.close() }
})

test('配置列表先展示每个占位卡片，慢模板不阻塞已就绪模板且不读取整批最新值', async () => {
  const previous = globalThis.document
  globalThis.document = { hidden: true, addEventListener() {}, removeEventListener() {} }
  let resolveSlow, model
  const configs = ['slow','fast'].map(id => ({ id, templateId: id, templateVersion: '1', state: 'enabled', ownerType: 'device', ownerId: 'one' }))
  const view = createMetricRenderer()
  const app = view.renderer.createApp({ setup() {
    model = useMetricPanel(ref({ ownerType: 'device', ownerId: 'one' }), {
      byOwner: async () => configs,
      resultTemplate(...args) { return this.configTemplate(...args) },
      configTemplate: id => id === 'slow' ? new Promise(resolve => { resolveSlow = resolve }) : Promise.resolve({ id, definitions: [], outputs: [{ metricId: 'value' }] }),
      watchResults() {}, latest: () => assert.fail('stream loads values only for visible cards')
    }); return () => null
  } })
  try {
    app.mount(view.root); const pending = model.refresh(); await flush()
    assert.equal(model.configurations.value.length, 2); assert.equal(model.cardGroups.value.length, 2)
    assert.equal(model.templates.value.fast.id, 'fast'); assert.equal(model.templates.value.slow, undefined)
    assert.equal(model.loading.value, false)
    resolveSlow({ id: 'slow', definitions: [], outputs: [{ metricId: 'value' }] }); await pending
  } finally { app.unmount(); globalThis.document = previous }
})

test('500项指标只建立可视卡片的流，高频更新保持历史容器有界',async()=>{
  const f=fixture(Array.from({length:500},(_,index)=>String(index)))
  try{
    f.visible(['0','1']);await flush();assert.equal(f.calls.length,2)
    const stream=f.calls[0],now=Date.now()
    stream.frame({kind:'ready'})
    for(let index=0;index<1000;index++)stream.frame({kind:'latest',latest:{configId:'0',outputs:{value:value(index,now-1000+index)}}})
    assert.equal(f.model.entries.value['0'].values.length,400);assert.equal(f.calls.length,2)
    assert.equal(Object.keys(f.model.entries.value).length,2)
  }finally{f.close()}
})

test('独立详情走同一结果流，切换时段保留当前值，卸载释放订阅',async()=>{
  const calls=[],view=createMetricRenderer()
  let model
  const api={getResultConfig(...args) { return this.getConfig(...args) },getConfig:async()=>({id:'one',state:'enabled',targetType:'device',targetId:'one',dataVersion:'v1',enabledAt:1}),
    latest:()=>assert.fail('no extra latest query'),history:()=>assert.fail('no extra history query'),
    watchResults(id,request,frame){const stream={id,request,frame,stopped:false};calls.push(stream);return()=>{stream.stopped=true}}}
  const app=view.renderer.createApp({setup(){model=useMetricResult(ref({configId:'one',outputId:'value'}),api);return()=>null}})
  try{
    app.mount(view.root);await flush();assert.equal(calls.length,1)
    const current={...value(3),thingType:'device',thingId:'one',dataVersion:'v1',tags:{configId:'one',enabledAt:1}}
    calls[0].frame({kind:'history',value:current});calls[0].frame({kind:'ready'});calls[0].frame({kind:'latest',latest:{configId:'one',outputs:{value:current}}})
    assert.equal(model.current.value.value,3);assert.equal(model.values.value[0].value,3)
    model.customRange.value=[10,20];await flush();assert.equal(calls[0].stopped,true);assert.equal(calls.length,2)
    assert.equal(model.current.value.value,3);assert.deepEqual(calls[1].request.query.terms[0].value,[10,20])
  }finally{app.unmount();assert.ok(calls.every(call=>call.stopped))}
})
