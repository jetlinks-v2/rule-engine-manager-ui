import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { createRenderer, defineComponent, h, KeepAlive, nextTick, ref } = require('vue')
const root = fileURLToPath(new URL('../', import.meta.url))
const result = await build({
  stdin: { resolveDir: root, loader: 'ts', contents: `
    export * from './api/alarmDashboard';
    export * from './visDashboard/AlarmCenter/services/handling';
    export * from './views/DashBoard/alarmDashboardLayout';
    export * from '../authentication-manager-ui/visDashboard/Base/Operations/alarmService';
    export * from '../authentication-manager-ui/visDashboard/Base/Operations/useQuickAlarms';
  ` },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
  plugins: [{ name: 'handling-io', setup(plugin) {
    plugin.onResolve({ filter: /^(@jetlinks-web\/core|@jetlinks-web-core\/locales|vue-i18n|ant-design-vue)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: ({
      '@jetlinks-web/core': 'export const request={post:(...args)=>globalThis.handlingFixture.post(...args)}',
      '@jetlinks-web-core/locales': 'export default {global:{t:key=>key}}',
      'vue-i18n': 'export const useI18n=()=>({t:key=>key})',
      'ant-design-vue': 'export const message={success:text=>globalThis.handlingFixture.messages.push(text)}',
    })[args.path] }))
  } }],
})
const loaded = { exports: {} }
new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, loaded, loaded.exports)
const api = loaded.exports
const ok = result => ({ success: true, result })
const signal = () => new AbortController().signal
const aggregateApi = aggregateAlarms => ({ aggregateAlarms })
const flush = async () => { await Promise.resolve(); await nextTick(); await Promise.resolve(); await nextTick() }

test('handling aggregates each source with the same time window and explicit state groups', async () => {
  const calls = []
  const value = await api.loadHandlingStatistics(aggregateApi(async (target, query) => {
    calls.push({ target, query })
    return ok(target === 'device'
      ? [{ state: 'warning', count: 27 }, { state: { value: 'normal', text: '已处理' }, count: 159 }]
      : [{ state: 'warning', count: 304 }, { state: 'normal', count: 824 }])
  }), '7d', signal())
  assert.equal(calls.length, 2)
  assert.deepEqual(calls.map(c => c.target), ['device', 'aiTaskMediaTarget'])
  assert.deepEqual(calls[0].query.groupBy, [{ column: 'state', alias: 'state' }])
  assert.deepEqual(calls[0].query.filter, calls[1].query.filter)
  assert.deepEqual(calls[0].query.filter.terms[0].value, [value.window.startTime, value.window.endTime])
  assert.equal(value.handling.iot.total, 186)
  assert.equal(value.handling.iot.rate, 85.5)
  assert.equal(value.handling.vision.total, 1128)
  assert.equal(value.handling.vision.rate, 73)
})

test('successful empty and zero counts preserve zero but do not invent a handling rate', async () => {
  for (const rows of [[], [{ state: 'warning', count: 0 }, { state: 'normal', count: '0' }]]) {
    const { handling } = await api.loadHandlingStatistics(aggregateApi(async () => ok(rows)), 'today', signal())
    for (const source of ['iot', 'vision']) assert.deepEqual(handling[source], { total: 0, active: 0, handled: 0, rate: null, failed: false })
  }
})

test('one failed, malformed or unsupported state cannot turn into zero or hide the other source', async () => {
  for (const invalid of [{ success: false, status: 403 }, ok([{ state: 'other', count: 1 }]), ok([{ state: 'warning', count: -1 }]), ok({})]) {
    const { handling } = await api.loadHandlingStatistics(aggregateApi(async target => target === 'device' ? ok([{ state: 'normal', count: 4 }]) : invalid), 'today', signal())
    assert.equal(handling.iot.handled, 4)
    assert.equal(handling.iot.rate, 100)
    assert.equal(handling.vision.failed, true)
    assert.equal(handling.vision.active, null)
    assert.equal(handling.vision.rate, null)
  }
})

test('aborted handling aggregation is rejected rather than published as a failed card', async () => {
  const controller = new AbortController()
  await assert.rejects(api.loadHandlingStatistics(aggregateApi(async () => {
    controller.abort()
    return ok([])
  }), 'today', controller.signal))
})

test('aggregate API retains type scope and cancellation for handling statistics', async () => {
  const calls = []
  const io = api.createAlarmDashboardApi({ post: async (...args) => { calls.push(args); return ok([]) } })
  const abort = signal()
  await api.loadHandlingStatistics(io, 'today', abort)
  assert.deepEqual(calls.map(c => c[0]), ['/alarm/record/device/_aggregation', '/alarm/record/aiTaskMediaTarget/_aggregation'])
  assert(calls.every(c => c[2].signal === abort && c[1].filter.terms[0].column === 'targetType'))
  assert.deepEqual(calls.map(c => c[1].filter.terms[0].value), ['device', 'aiTaskMediaTarget'])
})

test('old default layouts upgrade to the nine-card layout in all width modes without mutation', () => {
  for (const mode of ['wide', 'medium', 'compact']) {
    const old = api.legacyAlarmDashboardLayout(mode).map(([kind, x, y, w, h]) => ({ i: 'alarmCenter' + (kind === 'AlarmTrend' ? 'Trend' : kind), x, y, w, h }))
    const before = JSON.stringify(old)
    const next = api.addHandlingStatisticsToLayout(old, mode)
    assert.equal(JSON.stringify(old), before)
    assert.equal(next.length, 9)
    assert.deepEqual(next, api.alarmDashboardLayout(mode).map(([kind, x, y, w, h]) => ({ i: 'alarmCenter' + (kind === 'AlarmTrend' ? 'Trend' : kind), x, y, w, h })))
  }
})

test('manual layout coordinates remain exact and handling is appended once below the old bottom', () => {
  const old = api.legacyAlarmDashboardLayout('wide').map(([kind, x, y, w, h]) => ({ i: 'alarmCenter' + (kind === 'AlarmTrend' ? 'Trend' : kind), x, y, w, h }))
  old[0] = { ...old[0], y: 90, h: 12 }
  const next = api.addHandlingStatisticsToLayout(old, 'wide')
  assert.deepEqual(next.slice(0, 7), old)
  assert.equal(next[7].y, 102)
  assert.equal(next[7].i, 'alarmCenterIotHandlingStatistics')
  assert.equal(next[8].i, 'alarmCenterVisionHandlingStatistics')
  assert.equal(next[8].y, 102)
  assert.equal(api.addHandlingStatisticsToLayout(next, 'wide'), undefined)
  assert.equal(api.addHandlingStatisticsToLayout(old.slice(0, 6), 'wide'), undefined)
  assert.equal(api.addHandlingStatisticsToLayout([...old.slice(0, 6), old[0]], 'wide'), undefined)
})

test('public overview list extension adds only caller time terms and keeps type, state and pagination', async () => {
  const calls = []
  globalThis.handlingFixture = { messages: [], post: async (...args) => { calls.push(args); return ok({ data: [], total: 0 }) } }
  const terms = [{ column: 'alarmTime', termType: 'btw', value: [1, 2] }]
  await api.queryQuickAlarms('visionAlarm', 2, terms)
  assert.equal(calls[0][0], '/alarm/record/aiTaskMediaTarget/_query')
  assert.equal(calls[0][1].pageIndex, 1)
  assert.equal(calls[0][1].pageSize, 5)
  assert.deepEqual(calls[0][1].terms, [
    { column: 'targetType', termType: 'eq', value: 'aiTaskMediaTarget' },
    { column: 'state', termType: 'eq', value: 'warning' }, ...terms,
  ])
  assert.deepEqual(terms, [{ column: 'alarmTime', termType: 'btw', value: [1, 2] }])
  await api.queryQuickAlarm('visionAlarm', 'record')
    .then(() => assert.fail('missing record must fail'), () => {})
  assert(!calls[1][1].terms.some(term => term.column === 'alarmTime' || term.column === 'state'))
})

function node() { return { children: [], parent: null } }
const renderer = createRenderer({
  createElement: node, createText: node, createComment: node, setText() {}, setElementText() {}, patchProp() {},
  parentNode: e => e.parent, nextSibling: () => null,
  insert(e, parent) { e.parent = parent; parent.children.push(e) },
  remove(e) { if (e.parent) e.parent.children = e.parent.children.filter(child => child !== e) },
})
function mount(t, setup) {
  let state
  const app = renderer.createApp(defineComponent({ setup() { state = setup(); return () => h('div') } }))
  app.mount(node()); t.after(() => app.unmount()); return state
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const row = { id: 'r', alarmConfigId: 'rule', alarmTime: Date.now(), alarmName: 'Alarm', state: { value: 'warning', text: 'Unhandled' } }

test('scope switches invalidate late list and command callbacks without refreshing a different project', async t => {
  const scope = ref('project-a'), disabled = ref(false), listJob = deferred(), commandJob = deferred()
  let command = false, notified = 0
  const calls = []
  const fixture = { messages: [], post: async (url, payload) => {
    calls.push({ url, payload })
    if (url.endsWith('_handle')) return commandJob.promise
    if (payload.terms.some(term => term.column === 'id')) return ok({ data: [row], total: 1 })
    return command ? ok({ data: [], total: 0 }) : listJob.promise
  } }
  globalThis.handlingFixture = fixture
  const state = mount(t, () => api.useQuickAlarms('deviceAlarm', () => notified++, { scope: () => scope.value, disabled: () => disabled.value, terms: () => [{ column: 'alarmTime', termType: 'btw', value: [1, 2] }] }))
  const loading = state.load()
  scope.value = 'project-b'; await flush()
  listJob.resolve(ok({ data: [row], total: 1 })); await loading
  assert.deepEqual(state.rows.value, [])
  assert.equal(state.loading.value, false)
  command = true
  await state.select(row)
  const submit = state.submit('Handled')
  scope.value = 'project-c'; await flush()
  commandJob.resolve(ok(true)); await submit
  assert.equal(state.selected.value, undefined)
  assert.equal(notified, 0)
  assert.equal(fixture.messages.length, 0)
  disabled.value = true
  const count = calls.length
  state.setOpen(true); await state.select(row); await state.submit('Blocked'); await state.load()
  assert.equal(calls.length, count)
})

test('ordinary time-term refresh keeps an open detail; only an explicit scope change resets it', async t => {
  const scope = ref('p:today'), terms = ref([{ column: 'alarmTime', termType: 'btw', value: [1, 2] }])
  globalThis.handlingFixture = { messages: [], post: async () => ok({ data: [row], total: 1 }) }
  const state = mount(t, () => api.useQuickAlarms('deviceAlarm', () => {}, { scope: () => scope.value, terms: () => terms.value }))
  await state.select(row)
  const selected = state.selected.value
  terms.value = [{ column: 'alarmTime', termType: 'btw', value: [1, 3] }]
  await flush()
  assert.equal(state.selected.value, selected)
  scope.value = 'p:7d'; await flush()
  assert.equal(state.selected.value, undefined)
})

test('KeepAlive deactivation closes handling layers and rejects late detail responses', async t => {
  const shown = ref(true)
  const detail = deferred()
  globalThis.handlingFixture = { messages: [], post: async () => detail.promise }
  let state
  const Probe = defineComponent({ setup() {
    state = api.useQuickAlarms('deviceAlarm', () => {}, { scope: () => 'project:today' })
    return () => h('div')
  } })
  const app = renderer.createApp({ setup: () => () => h(KeepAlive, () => shown.value ? h(Probe) : null) })
  app.mount(node())
  t.after(() => app.unmount())
  const selecting = state.select(row)
  assert.equal(state.detailLoading.value, true)
  shown.value = false
  await flush()
  assert.equal(state.selected.value, undefined)
  assert.equal(state.open.value, false)
  detail.resolve(ok({ data: [row], total: 1 }))
  await selecting
  assert.equal(state.selected.value, undefined)
  shown.value = true
  await flush()
  assert.equal(state.selected.value, undefined)
})


const stored = items => items.map(([kind, x, y, w, h]) => ({ i: 'alarmCenter' + (kind === 'AlarmTrend' ? 'Trend' : kind), x, y, w, h }))

for (const source of ['iot', 'vision']) {
  test(source + ': split handling queries exactly one source and keeps its own window', async () => {
    const calls = []
    const value = await api.loadHandlingStatistics(aggregateApi(async (target, query) => {
      calls.push({ target, query })
      return ok([{ state: 'warning', count: 2 }, { state: 'normal', count: 8 }])
    }), 'yesterday', signal(), source)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].target, source === 'iot' ? 'device' : 'aiTaskMediaTarget')
    assert.deepEqual(Object.keys(value.handling), [source])
    assert.deepEqual(value.handling[source], { total: 10, active: 2, handled: 8, rate: 80, failed: false })
    assert.deepEqual(calls[0].query.filter.terms[0].value, [value.window.startTime, value.window.endTime])
    assert.equal(new Date(value.window.endTime).getHours(), 23)
  })
}

test('every combined default version upgrades to separate source cards without mutating input', () => {
  for (const mode of ['wide', 'medium', 'compact']) {
    const legacy = api.legacyAlarmDashboardLayout(mode)
    const y = legacy[5][2]
    for (const height of [mode === 'wide' ? 8 : mode === 'medium' ? 9 : 18, mode === 'compact' ? 18 : 10]) {
      const old = stored([...legacy.slice(0, 5), ['HandlingStatistics', 0, y, 24, height],
        ...legacy.slice(5).map(([kind, x, oldY, w, h]) => [kind, x, oldY + height, w, h])])
      const before = JSON.stringify(old)
      assert.deepEqual(api.addHandlingStatisticsToLayout(old, mode), stored(api.alarmDashboardLayout(mode)))
      assert.equal(JSON.stringify(old), before)
    }
    const current = stored(api.alarmDashboardLayout(mode))
    current[0].y += 100
    assert.equal(api.addHandlingStatisticsToLayout(current, mode), undefined)
  }
})

test('a manual combined card splits in place without moving or resizing the other seven cards', () => {
  for (const mode of ['wide', 'medium', 'compact']) {
    const retained = stored(api.legacyAlarmDashboardLayout(mode))
    const combined = { i: 'alarmCenterHandlingStatistics', x: mode === 'compact' ? 0 : 2, y: 80, w: mode === 'compact' ? 24 : 19, h: 17 }
    const saved = [...retained, combined]
    const before = JSON.stringify(saved)
    const next = api.addHandlingStatisticsToLayout(saved, mode)
    assert.equal(JSON.stringify(saved), before)
    assert.deepEqual(next.slice(0, 7), retained)
    assert.equal(next.length, 9)
    const [iot, vision] = next.slice(7)
    assert.equal(iot.i, 'alarmCenterIotHandlingStatistics')
    assert.equal(vision.i, 'alarmCenterVisionHandlingStatistics')
    if (mode === 'compact') {
      assert.deepEqual([iot.x, iot.y, iot.w, iot.h], [0, 80, 24, 8])
      assert.deepEqual([vision.x, vision.y, vision.w, vision.h], [0, 88, 24, 9])
    } else {
      assert.deepEqual([iot.x, iot.y, iot.w, iot.h], [2, 80, 9, 17])
      assert.deepEqual([vision.x, vision.y, vision.w, vision.h], [11, 80, 10, 17])
    }
    assert.equal(api.addHandlingStatisticsToLayout(next, mode), undefined)
  }
})

test('an undersized manual combined card moves only the two replacement cards below retained content', () => {
  const retained = stored(api.legacyAlarmDashboardLayout('compact'))
  retained[0] = { ...retained[0], y: 110 }
  const next = api.addHandlingStatisticsToLayout([...retained, { i: 'alarmCenterHandlingStatistics', x: 0, y: 90, w: 24, h: 9 }], 'compact')
  assert.deepEqual(next.slice(0, 7), retained)
  assert.equal(next[7].y, 114)
  assert.equal(next[8].y, next[7].y + next[7].h)
})

test('only the complete prior nine-card desktop default is compacted; personal layouts are retained', () => {
  const legacy = api.legacyAlarmDashboardLayout('wide')
  const previous = stored([...legacy.slice(0, 5),
    ['IotHandlingStatistics', 0, 14, 12, 8], ['VisionHandlingStatistics', 12, 14, 12, 8],
    ...legacy.slice(5).map(([kind, x, y, w, h]) => [kind, x, y + 8, w, h])])
  const before = JSON.stringify(previous)
  const next = api.addHandlingStatisticsToLayout(previous, 'wide')
  assert.deepEqual(next, stored(api.alarmDashboardLayout('wide')))
  assert.equal(next.find(item => item.i === 'alarmCenterIotHandlingStatistics').h, 6)
  assert.equal(next.find(item => item.i === 'alarmCenterVisionStatistics').y, 20)
  assert.equal(JSON.stringify(previous), before)
  const moved = previous.map(item => ({ ...item }))
  moved[0].y = 90
  assert.equal(api.addHandlingStatisticsToLayout(moved, 'wide'), undefined)
  const resized = previous.map(item => ({ ...item }))
  resized[5].h = 9
  assert.equal(api.addHandlingStatisticsToLayout(resized, 'wide'), undefined)
  assert.equal(api.addHandlingStatisticsToLayout(next, 'wide'), undefined)
})
