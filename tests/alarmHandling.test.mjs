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
    export * from './visDashboard/AlarmCenter/services/preview';
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

test('handling aggregates current states by occurrence time and aligns daily buckets for each source', async t => {
  t.mock.method(Date, 'now', () => new Date(2026, 9, 28, 17, 42).getTime())
  const calls = []
  const value = await api.loadHandlingStatistics(aggregateApi(async (target, query) => {
    calls.push({ target, query })
    const [start, end] = query.filter.terms.find(term => term.column === 'alarmTime').value
    const active = query.filter.terms.find(term => term.column === 'state').value === 'warning'
    const counts = target === 'device' ? active ? [18, 9] : [100, 59] : active ? [204, 100] : [524, 300]
    return ok({ data: [
      { value: { time: end, count: String(counts[1]) } },
      { time: start, count: counts[0] - 1 }, { time: start, count: 1 },
    ] })
  }), '7d', signal())
  assert.equal(calls.length, 4)
  assert.deepEqual(calls.map(c => c.target), ['device', 'device', 'aiTaskMediaTarget', 'aiTaskMediaTarget'])
  for (const { query } of calls) {
    assert.equal(query.groupBy, undefined)
    assert.deepEqual(query.columns, [{ column: 'id', alias: 'count', aggregation: 'COUNT' }])
    assert.deepEqual(query.filter.terms[0], { column: 'alarmTime', termType: 'btw', value: [value.window.startTime, value.window.endTime] })
    assert.equal(query.filter.terms[1].termType, 'eq')
    assert.deepEqual(query.groupByTime, {
      column: 'alarmTime', alias: 'time', interval: '1d', format: 'yyyy-MM-dd',
      from: '2026-10-22 00:00:00', to: '2026-10-28 17:42:00',
    })
  }
  assert.deepEqual(calls.map(c => c.query.filter.terms[1].value), ['warning', 'normal', 'warning', 'normal'])
  assert.equal(value.handling.iot.total, 186)
  assert.equal(value.handling.iot.rate, 85.5)
  assert.equal(value.handling.vision.total, 1128)
  assert.equal(value.handling.vision.rate, 73)
  assert.equal(value.handling.iot.points.length, 7)
  assert.deepEqual(value.handling.iot.points[0], { timestamp: new Date(2026, 9, 22).getTime(), active: 18, handled: 100 })
  assert.deepEqual(value.handling.iot.points[6], { timestamp: new Date(2026, 9, 28).getTime(), active: 9, handled: 59 })
  assert(value.handling.iot.points.slice(1, 6).every(point => point.active === 0 && point.handled === 0))
  for (const stats of Object.values(value.handling)) {
    assert.equal(stats.points.reduce((sum, point) => sum + point.active + point.handled, 0), stats.total)
  }
})

test('successful empty and zero aggregations retain the full zero-valued time axis', async () => {
  for (const empty of [true, false]) {
    const { handling, window } = await api.loadHandlingStatistics(aggregateApi(async (_, query) =>
      ok(empty ? [] : [{ time: query.filter.terms[0].value[0], count: '0' }]),
    ), 'today', signal())
    for (const stats of Object.values(handling)) {
      const { points, ...summary } = stats
      assert.deepEqual(summary, { total: 0, active: 0, handled: 0, rate: null, failed: false })
      assert.equal(points[0].timestamp, window.startTime)
      assert(points.at(-1).timestamp <= window.endTime)
      assert(points.length >= 1 && points.length <= 24)
      assert(points.every(point => point.active === 0 && point.handled === 0))
    }
  }
})

test('one failed state or malformed time bucket cannot become zero or hide the other source', async () => {
  for (const invalid of [
    { success: false, status: 403 }, ok([{ count: 1 }]),
    ok([{ time: 'invalid', count: 1 }]), ok([{ time: 0, count: 1 }]),
    ok([{ time: Date.now(), count: -1 }]), ok({}),
    ok(Array.from({ length: 1000 }, () => ({ time: Date.now(), count: 1 }))),
  ]) {
    const { handling } = await api.loadHandlingStatistics(aggregateApi(async (target, query) => {
      const state = query.filter.terms[1].value
      if (target === 'aiTaskMediaTarget' && state === 'normal') return invalid
      return ok([{ time: query.filter.terms[0].value[0], count: state === 'normal' ? 4 : 0 }])
    }), 'today', signal())
    assert.equal(handling.iot.handled, 4)
    assert.equal(handling.iot.rate, 100)
    assert.deepEqual(handling.vision, { total: null, active: null, handled: null, rate: null, points: [], failed: true })
  }
})

test('hourly handling merges duplicate buckets and fills gaps through the last hour', async t => {
  t.mock.method(Date, 'now', () => new Date(2026, 9, 28, 17, 42).getTime())
  const { handling, window } = await api.loadHandlingStatistics(aggregateApi(async (_, query) => {
    assert.equal(query.groupByTime.interval, '1h')
    assert.equal(query.groupByTime.format, 'yyyy-MM-dd HH:mm')
    assert.equal(query.groupByTime.from, '2026-10-27 00:00:00')
    assert.equal(query.groupByTime.to, '2026-10-27 23:59:59')
    return ok(query.filter.terms[1].value === 'warning'
      ? [{ time: '2026-10-27 23:00', count: 5 }, { time: '2026-10-27 03:00', count: 2 }, { time: '2026-10-27 03:10', count: '3' }]
      : [{ timestamp: new Date(2026, 9, 27, 3).getTime(), alarmCount: 7 }])
  }), 'yesterday', signal(), 'iot')
  const stats = handling.iot
  assert.equal(stats.points.length, 24)
  assert.deepEqual(stats.points[3], { timestamp: new Date(2026, 9, 27, 3).getTime(), active: 5, handled: 7 })
  assert.deepEqual(stats.points[23], { timestamp: new Date(2026, 9, 27, 23).getTime(), active: 5, handled: 0 })
  assert.deepEqual(stats.points[0], { timestamp: window.startTime, active: 0, handled: 0 })
  assert.equal(stats.total, 17)
})

test('daily handling windows cross year boundaries and stop at the current day', async t => {
  const now = new Date(2026, 0, 1, 10, 15).getTime()
  t.mock.method(Date, 'now', () => now)
  for (const days of [3, 7, 30]) {
    const { handling, window } = await api.loadHandlingStatistics(aggregateApi(async (_, query) =>
      ok([{ time: query.filter.terms[0].value[0], count: 1 }]),
    ), days + 'd', signal(), 'vision')
    const { points } = handling.vision
    assert.equal(points.length, days)
    assert.equal(points[0].timestamp, new Date(2026, 0, 2 - days).getTime())
    assert.equal(points.at(-1).timestamp, new Date(2026, 0, 1).getTime())
    assert.equal(window.endTime, now)
    assert.equal(handling.vision.total, 2)
  }
})

test('handling preview includes a complete time axis and its totals equal the displayed buckets', () => {
  for (const range of ['today', 'yesterday', '3d', '7d', '30d']) {
    const { handling } = api.previewData('HandlingStatistics', range, 'type')
    for (const stats of Object.values(handling)) {
      assert.equal(stats.points.length, range === 'today' ? 19 : range === 'yesterday' ? 24 : parseInt(range, 10))
      assert.equal(stats.points.reduce((sum, point) => sum + point.active, 0), stats.active)
      assert.equal(stats.points.reduce((sum, point) => sum + point.handled, 0), stats.handled)
    }
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
  assert.deepEqual(calls.map(c => c[0]), ['/alarm/record/device/_aggregation', '/alarm/record/device/_aggregation', '/alarm/record/aiTaskMediaTarget/_aggregation', '/alarm/record/aiTaskMediaTarget/_aggregation'])
  assert(calls.every(c => c[2].signal === abort && c[1].filter.terms[0].column === 'targetType'))
  assert.deepEqual(calls.map(c => c[1].filter.terms[0].value), ['device', 'device', 'aiTaskMediaTarget', 'aiTaskMediaTarget'])
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
      return ok([{ time: query.filter.terms[0].value[0], count: query.filter.terms[1].value === 'warning' ? 2 : 8 }])
    }), 'yesterday', signal(), source)
    assert.equal(calls.length, 2)
    assert.equal(calls[0].target, source === 'iot' ? 'device' : 'aiTaskMediaTarget')
    assert.deepEqual(Object.keys(value.handling), [source])
    const { points, ...summary } = value.handling[source]
    assert.deepEqual(summary, { total: 10, active: 2, handled: 8, rate: 80, failed: false })
    assert.equal(points.length, 24)
    assert.deepEqual(points[0], { timestamp: value.window.startTime, active: 2, handled: 8 })
    assert(points.slice(1).every(point => point.active === 0 && point.handled === 0))
    assert(calls.every(call => call.target === calls[0].target))
    assert.deepEqual(calls.map(call => call.query.filter.terms[1].value), ['warning', 'normal'])
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

test('only complete historical nine-card desktop defaults grow for the ring chart; personal layouts are retained', () => {
  const legacy = api.legacyAlarmDashboardLayout('wide')
  for (const height of [6, 8]) {
    const previous = stored([...legacy.slice(0, 5),
      ['IotHandlingStatistics', 0, 14, 12, height], ['VisionHandlingStatistics', 12, 14, 12, height],
      ...legacy.slice(5).map(([kind, x, y, w, h]) => [kind, x, y + height, w, h])])
    const before = JSON.stringify(previous)
    const next = api.addHandlingStatisticsToLayout(previous, 'wide')
    assert.deepEqual(next, stored(api.alarmDashboardLayout('wide')))
    assert.equal(next.find(item => item.i === 'alarmCenterIotHandlingStatistics').h, 9)
    assert.equal(next.find(item => item.i === 'alarmCenterVisionHandlingStatistics').h, 9)
    assert.equal(next.find(item => item.i === 'alarmCenterVisionStatistics').y, 23)
    assert.equal(JSON.stringify(previous), before)
    const moved = previous.map(item => ({ ...item }))
    moved[0].y = 90
    assert.equal(api.addHandlingStatisticsToLayout(moved, 'wide'), undefined)
    const resized = previous.map(item => ({ ...item }))
    resized[5].h = height + 1
    assert.equal(api.addHandlingStatisticsToLayout(resized, 'wide'), undefined)
    assert.equal(api.addHandlingStatisticsToLayout(next, 'wide'), undefined)
  }
})
