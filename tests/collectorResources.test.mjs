import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'
import { effectScope, nextTick, ref } from 'vue'

const require = createRequire(import.meta.url)
const base = new URL('../views/Scene/Save/action/Collector/', import.meta.url)
function load(file, mocks = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(file, base), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'exports', code)(id => mocks[id] ?? require(id), exports)
  return exports
}
const flush = async () => { await nextTick(); await nextTick() }
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
function fixture(queryPoints = async () => ({ result: [] })) {
  const { useCollectorActionResources } = load('useCollectorActionResources.ts', {
    '../../../../../api/collector': {
      queryChannelNoPaging: async () => ({ result: [{ id: 'a', name: '通道 A' }, { id: 'b', name: '通道 B' }] }),
      queryCollectorTree: async () => ({ result: [{ id: 'one', name: '风扇', channelId: 'a' }, { id: 'two', name: '水泵', channelId: 'b' }] }),
      queryPointNoPagingV2: queryPoints,
    },
    './collectorPoint': load('collectorPoint.ts'),
  })
  const scope = effectScope(), handler = ref('read')
  const state = scope.run(() => useCollectorActionResources('', '', handler))
  return { state, handler, dispose: () => scope.stop() }
}

test('collector selection keeps all channels, filters predictably and remains stable across read/write/report', async () => {
  const f = fixture()
  try {
    await flush()
    assert.equal(f.state.channels.value[0].name, '通道 A')
    assert.equal(f.state.visibleCollectors.value.length, 2)
    f.state.selectCollector(['one']); await flush()
    assert.equal(f.state.channelId.value, '')
    assert.equal(f.state.currentChannel.value.name, '通道 A')
    for (const type of ['write', 'sub', 'read']) {
      f.handler.value = type; await flush()
      assert.equal(f.state.visibleCollectors.value.length, 2)
      assert.equal(f.state.collectorId.value, 'one')
    }
    f.state.pointId.value = 'old'
    f.state.selectChannel(['channel:b']); await flush()
    assert.equal(f.state.collectorId.value, '')
    assert.equal(f.state.pointId.value, '')
    assert.deepEqual(f.state.visibleCollectors.value.map(c => c.id), ['two'])
    f.state.selectCollector(['two']); await flush()
    assert.equal(f.state.currentChannel.value.name, '通道 B')
    f.state.selectChannel(['channel:all'])
    assert.equal(f.state.collectorId.value, 'two')
    f.state.collectorKeyword.value = '风扇'
    assert.deepEqual(f.state.visibleCollectors.value.map(c => c.id), ['one'])
  } finally { f.dispose() }
})

test('late collector point responses cannot replace the current collector or reset its loading state', async () => {
  const first = deferred(), second = deferred()
  const f = fixture(params => params.terms[0].value === 'one' ? first.promise : second.promise)
  try {
    await flush()
    f.state.selectCollector(['one']); await flush()
    f.state.selectCollector(['two']); await flush()
    first.resolve({ result: [{ id: 'stale', accessModes: ['read'] }] }); await flush()
    assert.equal(f.state.pointsLoading.value, true)
    assert.deepEqual(f.state.points.value, [])
    second.resolve({ result: [{ id: 'current', accessModes: ['read', 'write'] }] }); await flush()
    assert.equal(f.state.pointsLoading.value, false)
    assert.deepEqual(f.state.points.value.map(point => point.id), ['current'])
    f.handler.value = 'write'; await flush()
    assert.deepEqual(f.state.visiblePoints.value.map(point => point.id), ['current'])
  } finally { f.dispose() }
})
