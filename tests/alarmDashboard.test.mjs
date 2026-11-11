import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const vueUrl = pathToFileURL(require.resolve('vue/dist/vue.runtime.esm-bundler.js')).href
const { createRenderer, defineComponent, h, ref, reactive, nextTick } = await import(vueUrl)
const moduleRoot = fileURLToPath(new URL('../', import.meta.url))
const { outputFiles } = await build({
  stdin: { resolveDir: moduleRoot, contents: [
    "export * from './api/alarmDashboard'",
    "export * from './visDashboard/AlarmCenter/dashboard.types'",
    "export * from './visDashboard/AlarmCenter/dashboardConfig'",
    "export * from './visDashboard/AlarmCenter/services/query'",
    "export * from './visDashboard/AlarmCenter/services/metrics'",
    "export * from './visDashboard/AlarmCenter/services/trends'",
    "export * from './visDashboard/AlarmCenter/services/statistics'",
    "export * from './visDashboard/AlarmCenter/hooks/useAlarmWidget'",
    "export * from './visDashboard/AlarmCenter/hooks/useAlarmCapabilities'",
    "export * from './views/DashBoard/alarmDashboardStorage'",
    "export * from './views/DashBoard/alarmDashboardLayout'",
  ].join(';') },
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{
    name: 'alarm-dashboard-platform-fixture',
    setup(plugin) {
      plugin.onResolve({ filter: /^vue$/ }, () => ({ path: vueUrl, external: true }))
      plugin.onResolve({ filter: /^(@jetlinks-web\/core|@jetlinks-web-core\/|vue-router)/ }, args => ({ path: args.path, namespace: 'fixture' }))
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: {
        '@jetlinks-web/core': 'export const request = { post: (...args) => globalThis.alarmDashboardFixture.request(...args) }',
        '@jetlinks-web-core/store/menu': 'export const useMenuStore = () => globalThis.alarmDashboardFixture.menu || { initialized: true, loading: false, menuResultCache: [{code: "machine-vision/VisualAlarm"}] }',
        '@jetlinks-web-core/utils/module-registry': 'export const moduleRegistry = { hasModule: () => globalThis.alarmDashboardFixture.installed ?? true, onChange: callback => { globalThis.alarmDashboardFixture.changed = callback; return () => {} } }',
        '@jetlinks-web-core/locales': 'export default { global: { t: key => key } }',
        '@jetlinks-web-core/store/user': 'export const useUserStore = () => globalThis.alarmDashboardFixture.user',
        '@jetlinks-web-core/utils/project-runtime': 'export const getProjectCodeFromLocation = () => globalThis.alarmDashboardFixture.project',
        '@jetlinks-web-core/utils/request-context': 'export const getRequestBaseApi = () => "/api"',
        'vue-router': 'export const useRoute = () => globalThis.alarmDashboardFixture.route',
      }[args.path] || 'export {}' }))
    },
  }],
})
const api = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'))
const signal = () => new AbortController().signal
const ok = result => ({ success: true, result })
const fixtureApi = overrides => ({
  countAlarms: async () => ok(0), countEvents: async () => ok(0),
  aggregateAlarms: async () => ok([]), aggregateEvents: async () => ok([]),
  queryDevices: async () => ok([]), ...overrides,
})

test('natural-day windows preserve yesterday and cross-month 3/7/30-day ranges', () => {
  const now = new Date(2026, 0, 1, 0, 0, 1).getTime()
  assert.equal(api.resolveRange('today', now).startTime, new Date(2026, 0, 1).getTime())
  const yesterday = api.resolveRange('yesterday', now)
  assert.equal(yesterday.startTime, new Date(2025, 11, 31).getTime())
  assert.equal(yesterday.endTime, new Date(2025, 11, 31, 23, 59, 59, 999).getTime())
  for (const days of [3, 7, 30]) {
    assert.equal(api.resolveRange(days + 'd', now).startTime, new Date(2026, 0, 2 - days).getTime())
    assert.equal(api.resolveRange(days + 'd', now).interval, '1d')
  }
})

test('failed or malformed responses never become business zero; explicit zero is retained', () => {
  for (const value of [null, undefined, '', -1, {}, { success: false, result: 0 }, { status: 500, result: 0 }]) {
    assert.throws(() => api.countOf(value))
  }
  assert.equal(api.countOf(ok(0)), 0)
  assert.equal(api.countOf(ok('12')), 12)
  assert.throws(() => api.rowsOf({ success: true }))
  assert.deepEqual(api.rowsOf(ok([])), [])
})

test('raw event count excludes review records; interception uses completed review results', async () => {
  const calls = []
  const client = fixtureApi({ countEvents: async payload => {
    calls.push(payload)
    const hit = payload.terms.find(term => term.column === 'hitResults')
    return ok(hit ? hit.value === 0 ? 3 : 1 : 100)
  } })
  const { metric } = await api.loadEventMetrics(client, signal())
  assert.equal(metric.today, 100)
  assert.equal(metric.filterRate, 75)
  assert(calls[0].terms.some(term => term.column === 'taskType' && term.termType === 'not' && term.value === 'reviewHandle'))
  assert(calls.slice(1).every(call => call.terms.some(term => term.column === 'success' && term.value === true)))
  assert(calls.slice(1).every(call => call.terms.some(term => term.column === 'waiting' && term.value === true && term.termType === 'not')))
  const empty = await api.loadEventMetrics(fixtureApi(), signal())
  assert.equal(empty.metric.today, 0)
  assert.equal(empty.metric.filterRate, null)
  const partial = await api.loadEventMetrics(fixtureApi({ countEvents: async payload => {
    if (payload.terms.some(term => term.column === 'hitResults')) throw new Error('review down')
    return ok(20)
  } }), signal())
  assert.equal(partial.metric.today, 20)
  assert.deepEqual(partial.metric.failed, ['filterRate'])
})

test('today and cumulative alarm counts use separate filters, with independent failures', async () => {
  const payloads = []
  const result = await api.loadAlarmMetrics(fixtureApi({ countAlarms: async (target, payload) => {
    assert.equal(target, 'device')
    payloads.push(payload)
    if (payload.terms.some(term => term.value === 'warning')) throw new Error('unavailable')
    return ok(payload.terms.length ? 2 : 15)
  } }), 'device', signal())
  assert.equal(result.metric.today, 2)
  assert.equal(result.metric.total, 15)
  assert.equal(result.metric.active, null)
  assert.deepEqual(result.metric.failed, ['active'])
  assert.equal(payloads.filter(payload => payload.terms.length === 0).length, 1)
})

test('trend shares one range and record grain; one failed source preserves other sources', async () => {
  const requests = []
  const result = await api.loadTrends(fixtureApi({
    aggregateEvents: async payload => { requests.push(payload); return ok([{ time: '2026-10-20 00:00', total: 4 }]) },
    aggregateAlarms: async (target, payload) => {
      requests.push(payload)
      if (target === 'device') throw new Error('iot down')
      return ok([{ time: '2026-10-20 00:00', count: 0 }])
    },
  }), 'today', signal())
  assert.equal(result.series[0].points[0].count, 4)
  assert.equal(result.series[1].failed, true)
  assert.equal(result.series[2].points[0].count, 0)
  assert.equal(requests[0].interval, '1h')
  assert.equal(requests[1].groupByTime.column, 'alarmTime')
  assert.equal(requests[0].from, requests[1].filter.terms[0].value[0])
  assert.equal(requests[0].to, requests[2].filter.terms[0].value[1])
})

test('device type aggregates by product using bounded batch enrichment, without per-device calls', async () => {
  let batches = 0
  const rows = Array.from({ length: 205 }, (_, index) => ({ deviceId: 'd' + index, count: 1 }))
  const result = await api.loadStatistics(fixtureApi({
    aggregateAlarms: async () => ok(rows),
    queryDevices: async ids => {
      batches++
      assert(ids.length <= 200)
      return ok(ids.map(id => ({ id, productId: 'p', productName: 'Temperature sensor' })))
    },
  }), 'device', 'deviceType', signal())
  assert.equal(batches, 2)
  assert.deepEqual(result.ranking, [{ id: 'p', name: 'Temperature sensor', count: 205 }])
})

test('camera statistics use the same record collection and today filter as metrics', async () => {
  const result = await api.loadStatistics(fixtureApi({ aggregateAlarms: async (target, payload) => {
    assert.equal(target, 'aiTaskMediaTarget')
    assert.deepEqual(payload.groupBy.map(group => group.column), ['sourceId', 'sourceName'])
    assert.equal(payload.filter.terms[0].column, 'alarmTime')
    return ok([{ id: 'b', name: 'Camera B', count: 2 }, { id: 'a', name: 'Camera A', count: 5 }])
  } }), 'aiTaskMediaTarget', 'camera', signal())
  assert.deepEqual(result.ranking, [{ id: 'a', name: 'Camera A', count: 5 }, { id: 'b', name: 'Camera B', count: 2 }])
})

test('API preserves cancellation and explicit device asset scope for event queries', async () => {
  const calls = []
  const client = api.createAlarmDashboardApi({ post: (...args) => { calls.push(args); return Promise.resolve(ok(0)) } })
  const abort = signal()
  await client.countEvents({}, abort)
  await client.aggregateEvents({}, abort)
  assert(calls.every(call => call[2].signal === abort && call[2].params.assetType === 'device'))
  await client.countAlarms('device', {}, abort)
  assert.equal(calls[2][0], '/alarm/record/device/_count')
  assert.deepEqual(calls[2][1].terms, [{ column: 'targetType', termType: 'eq', value: 'device' }])
  await client.aggregateAlarms('aiTaskMediaTarget', { filter: { terms: [] } }, abort)
  assert.equal(calls[3][1].filter.terms[0].value, 'aiTaskMediaTarget')
})

test('every responsive layout contains nine unique non-overlapping widgets within 24 columns', () => {
  for (const mode of ['wide', 'medium', 'compact']) {
    const items = api.alarmDashboardLayout(mode)
    assert.equal(new Set(items.map(item => item[0])).size, 9)
    for (const [, x, y, w, h] of items) assert(x >= 0 && y >= 0 && w >= 4 && h >= 4 && x + w <= 24)
    for (const [index, a] of items.entries()) for (const b of items.slice(index + 1)) {
      assert(!(a[1] < b[1] + b[3] && b[1] < a[1] + a[3] && a[2] < b[2] + b[4] && b[2] < a[2] + a[4]))
    }
  }
})

const renderer = createRenderer({
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {},
  parentNode: () => null, nextSibling: () => null,
})
const flush = () => new Promise(resolve => setTimeout(resolve, 0))
test('preview makes no requests; switching modes and unmounting cancel stale results and timers', async () => {
  const requests = []
  const pending = []
  globalThis.alarmDashboardFixture = {
    user: reactive({ userInfo: { id: 'user' } }), route: reactive({ path: '/alarms/dashboard', params: {}, query: {} }), project: 'p',
    request: (url, data, config) => new Promise(resolve => { requests.push({ url, data, config }); pending.push(resolve) }),
  }
  const preview = ref(true)
  const info = ref({ componentProps: { alarmCenterTodayEvents: { refreshSeconds: 0 } } })
  let state
  const app = renderer.createApp(defineComponent({
    setup() { state = api.useAlarmWidget('TodayEvents', info, preview); return () => h('div') },
  }))
  app.mount({})
  assert.equal(requests.length, 0)
  assert.equal(state.data.value.metric.today, 1280)
  preview.value = false
  await nextTick()
  assert.equal(requests.length, 3)
  preview.value = true
  await nextTick()
  assert(requests.every(call => call.config.signal.aborted))
  for (const resolve of pending.splice(0)) resolve(ok(999))
  await flush()
  assert.equal(state.data.value.metric.today, 1280)
  preview.value = false
  await nextTick()
  const recent = requests.slice(3)
  app.unmount()
  assert(recent.every(call => call.config.signal.aborted))
  for (const resolve of pending) resolve(ok(999))
  await flush()
})

test('new locale keys are symmetric and nine component export triples are present', async () => {
  const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8')
  const [zh, en] = await Promise.all(['zh', 'en'].map(async lang => JSON.parse(await read('locales/lang/' + lang + '.json'))))
  const keys = Object.keys(zh).filter(key => key.startsWith('alarmDashboard.')).sort()
  assert.deepEqual(keys, Object.keys(en).filter(key => key.startsWith('alarmDashboard.')).sort())
  for (const kind of api.dashboardKinds) {
    const source = await read('visDashboard/AlarmCenter/' + kind + '/index.ts')
    for (const suffix of ['', 'Config', 'ConfigProps']) assert(source.includes('export const AlarmCenter' + kind + suffix + ' ='))
  }
})


test('two handling widgets select time independently and query only their own target', async () => {
  const calls = []
  globalThis.alarmDashboardFixture = {
    user: reactive({ userInfo: { id: 'user' } }), route: reactive({ path: '/alarms/dashboard', params: {}, query: {} }), project: 'p',
    request: async (url, data) => { calls.push({ url, data }); return ok([{ time: data.filter.terms.find(term => term.column === 'alarmTime').value[0], count: data.filter.terms.find(term => term.column === 'state').value === 'warning' ? 3 : 7 }]) },
  }
  const states = {}
  const app = renderer.createApp(defineComponent({
    setup() {
      for (const kind of ['IotHandlingStatistics', 'VisionHandlingStatistics']) {
        states[kind] = api.useAlarmWidget(kind, ref({ componentProps: { [api.typeOf(kind)]: { refreshSeconds: 0 } } }), ref(false))
      }
      return () => h('div')
    },
  }))
  app.mount({})
  try {
    await flush()
    assert.deepEqual(calls.map(call => call.url), ['/alarm/record/device/_aggregation', '/alarm/record/device/_aggregation', '/alarm/record/aiTaskMediaTarget/_aggregation', '/alarm/record/aiTaskMediaTarget/_aggregation'])
    assert.deepEqual(Object.keys(states.IotHandlingStatistics.data.value.handling), ['iot'])
    assert.deepEqual(Object.keys(states.VisionHandlingStatistics.data.value.handling), ['vision'])
    const vision = states.VisionHandlingStatistics.data.value
    states.IotHandlingStatistics.timeRange.value = 'yesterday'
    await nextTick(); await flush()
    assert.equal(calls.length, 6)
    assert(calls.slice(4).every(call => call.url === '/alarm/record/device/_aggregation'))
    assert.equal(states.VisionHandlingStatistics.timeRange.value, 'today')
    assert.equal(states.VisionHandlingStatistics.data.value, vision)
    const iotWindow = states.IotHandlingStatistics.data.value.window
    assert.deepEqual(calls[4].data.filter.terms.find(term => term.column === 'alarmTime').value, [iotWindow.startTime, iotWindow.endTime])
  } finally { app.unmount() }
})


test('capabilities follow module and authorized menu readiness, including event-only access and preview', async () => {
  const menu = reactive({initialized:false, loading:true, menuResultCache:[{code:'machine-vision/VisualAlarm'}]})
  globalThis.alarmDashboardFixture = {menu, installed:false}
  const preview=ref(false); let cap
  const app=renderer.createApp(defineComponent({setup(){cap=api.useAlarmCapabilities(preview);return ()=>h('div')}}));app.mount({})
  try {
    assert.deepEqual(cap.value,{ready:false,vision:false,events:false})
    menu.initialized=true;menu.loading=false;await nextTick()
    assert.deepEqual(cap.value,{ready:true,vision:false,events:false})
    globalThis.alarmDashboardFixture.installed=true;globalThis.alarmDashboardFixture.changed();await nextTick()
    assert.deepEqual(cap.value,{ready:true,vision:true,events:true})
    menu.menuResultCache=[{code:'video/event'}];await nextTick()
    assert.deepEqual(cap.value,{ready:true,vision:false,events:true})
    menu.menuResultCache=[];await nextTick()
    assert.deepEqual(cap.value,{ready:true,vision:false,events:false})
    preview.value=true;await nextTick();assert.deepEqual(cap.value,{ready:true,vision:true,events:true})
  } finally {app.unmount()}
})

test('loading and absent sources avoid requests; capability loss aborts pending and ignores late results', async () => {
  const menu=reactive({initialized:false,loading:true,menuResultCache:[{code:'machine-vision/VisualAlarm'}]})
  const calls=[], pending=[]
  globalThis.alarmDashboardFixture={menu,installed:true,user:reactive({userInfo:{id:'u'}}),route:reactive({path:'/alarms/dashboard',params:{},query:{}}),project:'p',request:(url,data,config)=>new Promise(resolve=>{calls.push({url,data,config});pending.push(resolve)})}
  let vision, trend
  const app=renderer.createApp(defineComponent({setup(){
    vision=api.useAlarmWidget('VisionAlarms',ref({componentProps:{alarmCenterVisionAlarms:{refreshSeconds:0}}}),ref(false))
    trend=api.useAlarmWidget('AlarmTrend',ref({componentProps:{alarmCenterAlarmTrend:{refreshSeconds:0}}}),ref(false))
    return ()=>h('div')
  }}));app.mount({})
  try {
    assert.equal(calls.length,0)
    menu.initialized=true;menu.loading=false;await nextTick()
    assert(calls.some(c=>c.url.includes('aiTaskMediaTarget')))
    const old=calls.slice();menu.menuResultCache=[];await nextTick()
    assert(old.every(c=>c.config.signal.aborted));assert.equal(vision.available.value,false)
    const fresh=calls.slice(old.length);assert(fresh.length>0)
    assert(fresh.every(c=>c.url.includes('/alarm/record/device/')))
    for(const resolve of pending)resolve(ok(999));await flush()
    assert.equal(vision.data.value.metric,undefined)
    assert.deepEqual(trend.data.value.series.map(s=>s.source),['iot'])
  } finally {app.unmount()}
})

test('restricted layouts and keys isolate personalized full layouts', () => {
  for (const mode of ['wide','medium','compact']) for(const cap of [{events:false,vision:false},{events:true,vision:false}]) {
    const items=api.alarmDashboardLayout(mode,cap)
    assert(!items.some(([kind])=>kind.startsWith('Vision')))
    assert.equal(items.some(([kind])=>kind==='TodayEvents'),cap.events)
    assert.equal(items.find(([kind])=>kind==='IotStatistics')[3],24)
    for(const [i,a] of items.entries()) for(const b of items.slice(i+1)) assert(!(a[1]<b[1]+b[3]&&b[1]<a[1]+a[3]&&a[2]<b[2]+b[4]&&b[2]<a[2]+a[4]))
    const full=api.alarmDashboardStorageKeys('scope',false,mode)
    const reduced=api.alarmDashboardStorageKeys('scope',false,mode,cap)
    assert.notEqual(full.key,reduced.key);assert.deepEqual(reduced.legacyKeys,[])
    assert.equal(api.alarmDashboardStorageKeys('scope',false,mode,{events:true,vision:true}).key,full.key)
  }
})

test('module removal cancels vision widget and its scheduled refresh despite a retained menu', async () => {
  const calls=[]
  const menu=reactive({initialized:true,loading:false,menuResultCache:[{code:'machine-vision/VisualAlarm'}]})
  globalThis.alarmDashboardFixture={menu,installed:true,user:reactive({userInfo:{id:'u'}}),route:reactive({path:'/alarms/dashboard',params:{},query:{}}),project:'p',request:async(url,data,config)=>{calls.push({url,config});return ok(0)}}
  let state
  const app=renderer.createApp(defineComponent({setup(){state=api.useAlarmWidget('VisionAlarms',ref({componentProps:{alarmCenterVisionAlarms:{refreshSeconds:1}}}),ref(false));return ()=>h('div')}}));app.mount({})
  try {
    await flush();assert.equal(calls.length,4);assert.equal(state.available.value,true)
    globalThis.alarmDashboardFixture.installed=false;globalThis.alarmDashboardFixture.changed();await nextTick()
    assert.equal(state.available.value,false);assert(calls.every(call=>call.config.signal.aborted))
    await new Promise(resolve=>setTimeout(resolve,1100));assert.equal(calls.length,4)
  } finally {app.unmount()}
})
