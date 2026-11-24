import assert from 'node:assert/strict'
import test from 'node:test'
import { computed, ref } from 'vue'
import { createMetricLoader, createMetricRenderer, flush } from './helpers/metricRuntime.mjs'

const load = createMetricLoader({ './api': { metricApi: {} } })
const { useMetricTrends } = load('components/Metric/useMetricTrends.ts')
const { useMetricResult } = load('components/Metric/useMetricResult.ts')
const { metricBooleanPoints, metricChartPoints, metricHistoryKind, metricSparkline, metricSparklinePoint } = load('components/Metric/presentation.ts')

test('缩略图不放大浮点尾差，仍保留真实小幅变化与原始读数',()=>{
  const points=[[100,96.58053333333334],[200,null],[300,96.58053333333336]]
  const plot=metricSparkline(points,[100,300])
  assert.deepEqual(plot.points.map(point=>point[1]),[28,28])
  assert.equal(metricSparklinePoint(points,296,[100,300]).y,28)
  assert.equal(metricSparklinePoint(points,296,[100,300]).value,points[2][1])
  for(const readings of [[[100,96],[200,96.0000001]],[[100,1e-100],[200,2e-100]],[[100,-2],[200,-1]]]){
    const sparkline=metricSparkline(readings)
    assert.match(sparkline.path,/48\.00.*8\.00/,'representable changes still retain their shape')
  }
})
const { useMetricCalculators,useMetricAggregations } = load('components/Metric/useMetricCalculators.ts')
const target = (id, key = 'v1') => ({ id, key, outputs: ['score', 'condition'] })
const result = (metricId, value, time = 1000) => ({ metricId, value, evaluationTime: time, quality: { valid: true } })

function fixture(api, initial = [target('a')], timeRange) {
  const targets = ref(initial), selected = ref(), snapshot = ref({}), latest = ref({ configId: 'a', outputs: { score: result('score', 0), condition: result('condition', false) } })
  const configurations = computed(() => targets.value.map(item => ({ id: item.id })))
  const view = createMetricRenderer()
  let trends, details
  const app = view.renderer.createApp({ setup() {
    trends = useMetricTrends(targets, selected, api,timeRange)
    details = useMetricResult(selected, api, latest, { ...trends, configurations, refreshLatest: async () => {} })
    return () => null
  } })
  app.mount(view.root)
  return { targets, selected, snapshot, latest, trends, details, close: () => app.unmount() }
}

test('同一配置不同来源的历史互相隔离，共用所选时段并保留后台刷新图表',async()=>{
  const calls=[],pending=[];let hold=false
  const timeRange={range:ref(3600000),customRange:ref([10,20])}
  const f=fixture({history:async(id,request)=>{calls.push([id,request]);return hold ? new Promise(resolve=>pending.push(resolve)) : [result('score',request.targetId==='A' ? 1 : 2)]}},
    ['A','B'].map(id=>({id,configId:'shared',key:id,outputs:['score'],targetType:'device',targetId:id})),timeRange)
  try{
    f.trends.observe('A',{});f.trends.observe('B',{});await flush()
    assert.deepEqual(calls.map(([id,request])=>[id,request.targetId]),[['shared','A'],['shared','B']])
    assert.equal(f.trends.entries.value.A.values[0].value,1);assert.equal(f.trends.entries.value.B.values[0].value,2)
    hold=true;timeRange.customRange.value=[30,40];await flush()
    assert.equal(f.trends.entries.value.A.values[0].value,1);assert.equal(f.trends.entries.value.B.values[0].value,2)
    assert.deepEqual(calls.at(-1)[1].query.terms[0].value,[30,40])
    pending[0]([result('score',3)]);pending[1]([result('score',4)]);await flush()
    assert.equal(f.trends.entries.value.A.values[0].value,3);assert.equal(f.trends.entries.value.B.values[0].value,4)
  }finally{f.close()}
})

test('概览、详情与辅助输出共享同一配置历史，不重复 latest/getConfig；趋势范围不改变当前值', async () => {
  const calls = []
  const api = { history: async (id, request) => { calls.push({ id, request }); return [result('score', 0), result('condition', false)] }, latest: () => assert.fail('must share latest'), getResultConfig(...args) { return this.getConfig(...args) }, getConfig: () => assert.fail('must share configuration') }
  const f = fixture(api)
  try {
    f.trends.observe('a', {}); await flush()
    assert.equal(calls.length, 1); assert.deepEqual(calls[0].request.outputs, ['score', 'condition'])
    f.selected.value = { configId: 'a', outputId: 'score' }; await flush()
    assert.equal(calls.length, 1); assert.equal(f.details.current.value.value, 0); assert.equal(f.details.values.value.length, 1)
    f.selected.value = { configId: 'a', outputId: 'condition' }; await flush()
    assert.equal(calls.length, 1); assert.equal(f.details.current.value.value, false); assert.equal(f.details.values.value[0].value, false)
    f.trends.customRange.value = [100, 200]; await flush()
    assert.equal(calls.length, 2); assert.deepEqual(calls[1].request.query.terms[0].value, [100, 200])
    assert.equal(f.details.current.value.value, false)
    assert.equal(calls[1].request.query.pageSize, 200)
  } finally { f.close() }
})

test('同一历史目标多个可见输出只读一次，移除一张卡片不阻断另一张刷新',async()=>{
  let reads=0
  const f=fixture({history:async()=>{reads++;return[result('score',reads)]}})
  try{
    f.trends.observe('a',{},'first');f.trends.observe('a',{},'second');await flush();assert.equal(reads,1)
    f.trends.observe('a',null,'first');f.snapshot.value={next:true};await flush()
    assert.equal(reads,1);assert.equal(f.trends.entries.value.a.values[0].value,1)
    f.trends.refresh();await flush();assert.equal(reads,2)
  }finally{f.close()}
})

test('切换时段保留共享历史与最新值，旧请求不能覆盖新时段', async () => {
  const pending=[]
  let hold=false
  const f=fixture({ history:()=>hold ? new Promise(resolve=>pending.push(resolve)) : Promise.resolve([result('score',7)]) })
  try {
    f.trends.observe('a',{});f.selected.value={configId:'a',outputId:'score'};await flush()
    hold=true;f.trends.customRange.value=[10,20];await flush()
    assert.equal(f.details.loading.value,true)
    assert.equal(f.details.values.value[0].value,7)
    assert.equal(f.details.current.value.value,0)
    f.trends.customRange.value=[30,40];await flush()
    pending[0]([result('score',99)]);await flush()
    assert.equal(f.details.values.value[0].value,7)
    assert.equal(f.details.loading.value,true)
    pending[1]([result('score',8)]);await flush()
    assert.equal(f.details.values.value[0].value,8)
    assert.equal(f.details.loading.value,false)
    assert.deepEqual(f.details.bounds.value,[30,40])
  } finally { f.close() }
})

test('隐藏卡片切换时段后再次可见时按新范围查询', async () => {
  const calls=[]
  const f=fixture({history:async(_id,request)=>{calls.push(request);return [result('score',7)]}})
  try {
    f.trends.observe('a',{});await flush()
    f.trends.observe('a',null);await flush()
    f.trends.customRange.value=[30,40];await flush()
    assert.equal(calls.length,1)
    assert.equal(f.trends.entries.value.a,undefined)
    f.trends.observe('a',{});await flush()
    assert.equal(calls.length,2)
    assert.deepEqual(calls[1].query.terms[0].value,[30,40])
  } finally {f.close()}
})

test('历史最多三个并发；切换范围时旧任务占用并发但不能回填新状态', async () => {
  const pending = [], calls = []; let running = 0, maximum = 0
  const f = fixture({ history: (id, request) => {
    running++; maximum = Math.max(maximum, running); calls.push({ id, request })
    return new Promise(resolve => pending.push(value => { running--; resolve([result('score', value)]) }))
  } }, Array.from({ length: 8 }, (_, i) => target(String(i))))
  try {
    for (const item of f.targets.value) f.trends.observe(item.id, {})
    await flush(); assert.equal(calls.length, 3)
    f.trends.customRange.value = [10, 20]; await flush(); assert.equal(calls.length, 3)
    pending.splice(0, 3).forEach(resolve => resolve(99)); await flush()
    assert.ok(Object.values(f.trends.entries.value).every(entry => !entry.values.length))
    for (let round = 0; round < 4 && pending.length; round++) { pending.splice(0).forEach(resolve => resolve(1)); await flush() }
    assert.equal(maximum, 3); assert.equal(calls.length, 11)
    assert.ok(Object.values(f.trends.entries.value).every(entry => entry.values[0].value === 1 && !entry.loading))
    assert.ok(calls.slice(3).every(call => call.request.query.terms[0].value[0] === 10))
  } finally { f.close() }
})

test('撤权、版本改变和卸载隔离迟到历史；历史失败不抹去最新值', async () => {
  const pending = []
  const f = fixture({ history: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) })
  try {
    f.trends.observe('a', {}); await flush()
    f.selected.value = { configId: 'a', outputId: 'score' }; await flush()
    f.targets.value = [target('a', 'v2')]; await flush()
    assert.equal(pending.length, 2)
    pending[0].resolve([result('score', 99)]); await flush(); assert.equal(f.details.values.value.length, 0)
    pending[1].reject(new Error('history unavailable')); await flush()
    assert.equal(f.details.error.value, 'history unavailable'); assert.equal(f.details.current.value.value, 0)
    f.trends.refresh('a'); await flush(); assert.equal(pending.length, 3)
    f.targets.value = []; await flush(); assert.equal(f.details.inaccessible.value, true)
    pending[2].resolve([result('score', 99)]); await flush(); assert.deepEqual(f.trends.entries.value, {})
  } finally { f.close() }
})

test('单个IntersectionObserver只准入可见卡片与选中详情，隐藏卡片不随轮询重读', async () => {
  const before = globalThis.IntersectionObserver; let observer, disconnected = false
  globalThis.IntersectionObserver = class { constructor(callback) { this.callback = callback; observer = this } observe() {} unobserve() {} disconnect() { disconnected = true } }
  const calls = [], first = {}, second = {}
  const f = fixture({ history: async id => { calls.push(id); return [] } }, [target('a'), target('b')])
  try {
    f.trends.observe('a', first); f.trends.observe('b', second); await flush(); assert.equal(calls.length, 0)
    observer.callback([{ target: first, isIntersecting: true }]); await flush(); assert.deepEqual(calls, ['a'])
    f.selected.value = { configId: 'b', outputId: 'score' }; await flush(); assert.deepEqual(calls, ['a', 'b'])
    observer.callback([{ target: first, isIntersecting: false }]); await flush()
    f.snapshot.value = {}; await flush(); assert.deepEqual(calls, ['a', 'b'])
  } finally { f.close(); globalThis.IntersectionObserver = before }
  assert.equal(disconnected, true)
})

test('500项指标只读取可见与选中配置，采样更新不放大为全量历史查询', async () => {
  const before=globalThis.IntersectionObserver;let observer,maximum=0,running=0
  globalThis.IntersectionObserver=class {constructor(callback){this.callback=callback;observer=this} observe(){} unobserve(){} disconnect(){} }
  const calls=[],pending=[],elements=Array.from({length:500},()=>({}))
  const f=fixture({history:(id,request)=>{
    calls.push({id,request});running++;maximum=Math.max(maximum,running)
    return new Promise(resolve=>pending.push(()=>{running--;resolve([])}))
  }},Array.from({length:500},(_,index)=>target(String(index))))
  try {
    elements.forEach((element,index)=>f.trends.observe(String(index),element))
    observer.callback(elements.map((element,index)=>({target:element,isIntersecting:index<2})))
    f.selected.value={configId:'499',outputId:'score'};await flush()
    assert.deepEqual(calls.map(call=>call.id),['0','1','499']);assert.equal(maximum,3)
    assert.ok(calls.every(call=>call.request.query.pageSize===200&&call.request.outputs.length===2))
    pending.splice(0).forEach(resolve=>resolve());await flush()
    for(let index=0;index<500;index++) f.snapshot.value[String(index)]={score:result('score',index)}
    await flush();assert.equal(calls.length,3,'live readings share latest state without one history request per sample')
    f.snapshot.value={...f.snapshot.value};await flush()
    assert.deepEqual(calls.slice(3).map(call=>call.id),[],'快照更新不重读任何历史')
    pending.splice(0).forEach(resolve=>resolve());await flush();assert.equal(maximum,3)
  } finally {f.close();globalThis.IntersectionObserver=before}
})

test('数值保留0与断点，条件保留false和未知，不生成持续区间；孤立样本仍可见', () => {
  const values = [result('v', 0, 100), { ...result('v', 50, 200), quality: { stale: true } }, result('v', 2, 300)]
  const points = metricChartPoints(values)
  assert.deepEqual(points, [[100, 0], [200, null], [300, 2]])
  const sparkline = metricSparkline(points, [100, 300])
  assert.equal((sparkline.path.match(/M/g) || []).length, 2); assert.equal(sparkline.path.includes('L'), false); assert.equal(sparkline.points.length, 2)
  assert.equal(metricSparkline([[100, 0], [200, 2]]).points.length, 0, 'continuous paths do not allocate one DOM marker per reading')
  assert.equal(metricHistoryKind([result('v', 0)]), 'number')
  assert.equal(metricHistoryKind([result('v', false)]), 'boolean')
  assert.equal(metricHistoryKind([result('v', 'running')]), 'other')
  assert.deepEqual(metricBooleanPoints([result('v', false, 100), result('v', true, 200), { ...result('v', false, 300), status: 'invalid' }]), [[100, false], [200, true], [300, null]])
})

test('缩略图峰值与悬停均基于范围内真实样本，保留零和断点，不产生插值', () => {
  const points = [[50,999],[100,0],[200,null],[300,12],[400,7],[500,1000]]
  const bounds = [100,400], sparkline = metricSparkline(points,bounds)
  assert.equal(sparkline.peak.time,300); assert.equal(sparkline.peak.value,12)
  assert.equal(metricSparklinePoint(points,4,bounds).value,0)
  assert.equal(metricSparklinePoint(points,101,bounds),undefined)
  const peak = metricSparklinePoint(points,199,bounds)
  assert.deepEqual(peak,sparkline.peak)
  assert.equal(metricSparklinePoint(points,296,bounds).time,400)
  assert.equal(metricSparklinePoint([],150),undefined)
  assert.equal(metricSparkline([[100,null]]).peak,undefined)
  assert.equal(metricSparkline([[100,-5],[200,-5]]).peak.value,-5)
})

for (const [method,hook] of [['calculators',useMetricCalculators],['aggregations',useMetricAggregations]]) test(`${method} 元数据按面板和语言共享，迟到响应与卸载不能覆盖当前语言`, async () => {
  const locale = ref('zh'), requests = [], view = createMetricRenderer()
  let calculators
  const app = view.renderer.createApp({ setup() { calculators = hook(locale, { [method]:() => new Promise(resolve => requests.push(resolve)) }); return () => null } })
  app.mount(view.root)
  try {
    assert.equal(requests.length,1)
    locale.value = 'en'; await flush(); assert.equal(requests.length,2)
    requests[0]([{ name:'旧语言' }]); await flush(); assert.deepEqual(calculators.value,[])
    requests[1]([{ name:'Current language' }]); await flush(); assert.equal(calculators.value[0].name,'Current language')
    locale.value = 'fr'; await flush(); app.unmount()
    requests[2]([{ name:'Unmounted' }]); await flush(); assert.deepEqual(calculators.value,[])
  } finally { app.unmount() }
})
