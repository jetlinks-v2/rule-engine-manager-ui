import assert from 'node:assert/strict'
import test from 'node:test'
import { ref } from 'vue'
import { resolve } from 'node:path'
import { createMetricLoader, createMetricRenderer, flush, sourceRoot } from './helpers/metricRuntime.mjs'

const load = createMetricLoader({ [resolve(sourceRoot, 'components/Metric/api.ts')]: { metricApi: {} } })
const { loadMetricLatest, metricLatestBatches } = load('components/Metric/extensions/latestBatch.ts')
const { useMetricPanel } = load('components/Metric/useMetricPanel.ts')
const value = number => ({ metricId: 'value', value: number })
const template = { id: 'test', version: '1', name: 'Metric', outputs: [{ metricId: 'value' }], definitions: [], inputDefinitions: [], parameters: {}, parameterDefinitions: [] }
const config = (id, owner = 'owner', target = owner) => ({ id, ownerType: 'line', ownerId: owner, targetType: 'line', targetId: target, templateId: 'test', templateVersion: '1', slot: id, state: 'enabled', revision: 1, inputMappings: {}, parameters: {} })

test('交错目标先分组再按128切批，每个配置只读取一次，不修改调用方顺序', () => {
  const ids = Array.from({ length: 258 }, (_, index) => `config-${index}`)
  const targets = new Map(ids.map((id, index) => [id, { targetType: 'device', targetId: index % 2 ? 'B' : 'A' }]))
  const batches = metricLatestBatches(ids, targets)
  assert.deepEqual(batches.map(batch => [batch.target.targetId, batch.ids.length]), [['A', 128], ['A', 1], ['B', 128], ['B', 1]])
  assert.equal(new Set(batches.flatMap(batch => batch.ids)).size, 258)
  for (const batch of batches) for (const id of batch.ids) assert.deepEqual(targets.get(id), batch.target)
  assert.equal(ids[0], 'config-0'); assert.equal(ids[1], 'config-1')
  assert.deepEqual(metricLatestBatches([]), [])
})

test('单次读取按真实请求隔离失败，成功值及时更新，成功省略仍撤权', async () => {
  const ids = ['A', 'B', 'C'], calls = []
  const targets = new Map(ids.map(id => [id, { targetType: 'device', targetId: id }]))
  const previous = Object.fromEntries(ids.map(id => [id, { value: value(1) }]))
  const failedRuntime = { state: 'failed', complete: true, replicas: 1 }
  const previousRuntime = Object.fromEntries(ids.map(id => [id, failedRuntime]))
  const api = { latest: async (batch, target) => {
    calls.push([batch, target.targetId])
    if (target.targetId === 'B') throw new Error('B unavailable')
    return target.targetId === 'A' ? [{ configId: 'A', outputs: { value: value(2) } }, { configId: 'C', outputs: { value: value(99) } }] : []
  } }
  const result = await loadMetricLatest(api, ids, previous, ['A'], () => true, previousRuntime, targets)
  assert.deepEqual(calls, [[['A'], 'A'], [['B'], 'B'], [['C'], 'C']])
  assert.equal(result.outputs.A.value.value, 2)
  assert.equal(result.outputs.B.value.value, 1)
  assert.equal(result.outputs.C, undefined)
  assert.deepEqual(result.inaccessibleIds, ['C'])
  assert.deepEqual(result.errors, { B: 'B unavailable' })
  assert.deepEqual(result.runtimes, { B: failedRuntime })
  assert.equal(previous.A.value.value, 1)
})

test('批次退场后不再请求其他目标，也不提交已在途的旧结果', async () => {
  const pending = deferred(), calls = []
  let current = true
  const targets = new Map(['A', 'B'].map(id => [id, { targetType: 'device', targetId: id }]))
  const task = loadMetricLatest({ latest: async ids => { calls.push(ids); return pending.promise } },
    ['A', 'B'], {}, [], () => current, {}, targets)
  current = false
  pending.resolve([{ configId: 'A', outputs: { value: value(3) } }])
  assert.equal(await task, undefined)
  assert.deepEqual(calls, [['A']])
})

test('面板按目标读取最少批次，一个目标失败不阻塞另一个目标的新值', async () => {
  const before = globalThis.document
  globalThis.document = { hidden: true, addEventListener() {}, removeEventListener() {} }
  const configs = Array.from({ length: 149 }, (_, index) => config(`config-${index}`, 'owner', index % 2 ? 'B' : 'A'))
  const calls = []
  let view, round = 1, failB = false
  const { renderer, root } = createMetricRenderer()
  const app = renderer.createApp({ setup() {
    view = useMetricPanel(ref({ ownerType: 'line', ownerId: 'owner' }), {
      byOwner: async () => configs, resultTemplate(...args) { return this.configTemplate(...args) }, configTemplate: async () => template,
      latest: async (ids, target) => {
        calls.push([target.targetId, ids.length])
        if (failB && target.targetId === 'B') throw new Error('B timeout')
        return ids.map(configId => ({ configId, outputs: { value: value(round) } }))
      },
    })
    return () => null
  } })
  try {
    app.mount(root); await view.refresh()
    assert.deepEqual(calls, [['A', 75], ['B', 74]])
    round = 2; failB = true
    await view.refresh()
    assert.equal(view.outputs.value['config-0'].value.value, 2)
    assert.equal(view.outputs.value['config-1'].value.value, 1)
    assert.equal(view.latestErrors.value['config-0'], undefined)
    assert.equal(view.latestErrors.value['config-1'], 'B timeout')
    assert.deepEqual(view.inaccessibleIds.value, [])
  } finally { app.unmount(); globalThis.document = before }
})

for (const stage of ['configuration', 'template']) {
  for (const leave of ['switch', 'unmount']) {
    test(`${stage}阶段${leave}后停止旧对象后续模板和最新值读取`, async () => {
      const before = globalThis.document
      globalThis.document = { hidden: true, addEventListener() {}, removeEventListener() {} }
      const owner = ref({ ownerType: 'line', ownerId: 'A' }), pending = deferred()
      const templates = [], latest = []
      let view, mounted = true
      const { renderer, root } = createMetricRenderer()
      const app = renderer.createApp({ setup() {
        view = useMetricPanel(owner, {
          byOwner: async (_type, id) => id === 'A' && stage === 'configuration' ? pending.promise
            : [config(`${id}-first`, id), { ...config(`${id}-second`, id), templateId: 'other' }],
          resultTemplate(...args) { return this.configTemplate(...args) },
          configTemplate: async id => {
            templates.push(id)
            return id === 'A-first' && stage === 'template' ? pending.promise : template
          },
          latest: async ids => { latest.push(ids); return ids.map(configId => ({ configId, outputs: {} })) },
        })
        return () => null
      } })
      try {
        app.mount(root)
        const old = view.refresh(); await flush()
        if (leave === 'switch') {
          owner.value = { ownerType: 'line', ownerId: 'B' }; await view.refresh()
        } else { app.unmount(); mounted = false }
        pending.resolve(stage === 'template' ? template : [config('A-first', 'A'), config('A-second', 'A')])
        await old; await flush()
        assert.equal(templates.filter(id => id.startsWith('A')).length, stage === 'template' ? 2 : 0, '已并发发出的读取可以完成，但不能回填离开的对象')
        assert.ok(latest.flat().every(id => id.startsWith('B')))
        if (leave === 'switch') assert.deepEqual(view.configurations.value.map(item => item.id), ['B-first', 'B-second'])
      } finally { if (mounted) app.unmount(); globalThis.document = before }
    })
  }
}

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
