import assert from 'node:assert/strict'
import test from 'node:test'
import { defineComponent, h, ref } from 'vue'
import { resolve } from 'node:path'
import { createMetricLoader, createMetricRenderer, flush, sourceRoot } from './helpers/metricRuntime.mjs'

const load = createMetricLoader({ [resolve(sourceRoot, 'components/Metric/api.ts')]: { metricApi: {} } })
const { useMetricHistoryVersions } = load('components/Metric/useMetricHistoryVersions.ts')
const snapshot = (version, revision, output = 'removedOutput') => ({ recordedAt: revision * 100000,
  configuration: { id: 'metric', scope: 'single', targetType: 'device', targetId: `device-${version}`, dataVersion: version, revision },
  template: { id: 'template', name: 'Usage', outputs: [{ metricId: output, persist: true }], definitions: [] } })
function mount(api) {
  let state
  const reference = ref({ configId: 'metric', outputId: 'currentOutput', targetType: 'device', targetId: 'current' }), open = ref(false)
  const { renderer, root } = createMetricRenderer()
  const app = renderer.createApp(defineComponent({ setup() { state = useMetricHistoryVersions(reference, open, api); return () => h('div') } }))
  app.mount(root)
  return { state, reference, open, close: () => app.unmount() }
}
test('history is lazy, reads the original output and target, and never subscribes or polls', async () => {
  const requests = [], pages = []
  const fixture = mount({ historyVersions: async (...args) => { pages.push(args); return { records: [snapshot('new', 2), snapshot('old', 1)], nextRevision: 1 } },
    history: async (...args) => { requests.push(args); return [{ metricId: 'removedOutput', value: 4, dataVersion: args[1].dataVersion }] } })
  try {
    await flush(); assert.equal(pages.length, 0)
    fixture.open.value = true; await flush(); assert.equal(pages.length, 1); assert.equal(requests.length, 0)
    fixture.state.selected.value = 'old'; await flush()
    assert.equal(requests.length, 1)
    assert.equal(requests[0][1].dataVersion, 'old')
    assert.equal(requests[0][1].targetId, 'device-old')
    assert.deepEqual(requests[0][1].outputs, ['removedOutput'])
    assert.deepEqual(fixture.state.bounds.value, [-3400000, 200000])
    assert.equal(fixture.state.values.value[0].value, 4)
    await fixture.state.loadMore(); assert.equal(pages[1][1], 1)
  } finally { fixture.close() }
})
test('closing or changing the object discards late history and definition responses', async () => {
  let finish, finishPage
  const fixture = mount({ historyVersions: async () => ({ records: [snapshot('old', 1)] }),
    history: async () => new Promise(resolve => { finish = resolve }) })
  try {
    fixture.open.value = true; await flush(); fixture.state.selected.value = 'old'; await flush()
    fixture.open.value = false; await flush(); finish([{ value: 'secret' }]); await flush()
    assert.deepEqual(fixture.state.values.value, [])
    fixture.open.value = true; await flush()
    fixture.reference.value = { configId: 'other', outputId: 'x' }; await flush()
    assert.equal(fixture.state.selected.value, undefined)
  } finally { fixture.close() }
  const pending = mount({ historyVersions: () => new Promise(resolve => { finishPage = resolve }) })
  try {
    pending.open.value = true; await flush(); pending.open.value = false; await flush()
    finishPage({ records: [snapshot('private', 1)] }); await flush()
    assert.deepEqual(pending.state.versions.value, [])
  } finally { pending.close() }
})
test('revoked historical access clears old results rather than retaining a successful read', async () => {
  let allowed = true
  const fixture = mount({ historyVersions: async () => ({ records: [snapshot('old', 1)] }),
    history: async () => { if (!allowed) throw Error('denied'); return [{ value: 5 }] } })
  try {
    fixture.open.value = true; await flush(); fixture.state.selected.value = 'old'; await flush()
    assert.equal(fixture.state.values.value.length, 1)
    allowed = false; await fixture.state.refresh()
    assert.deepEqual(fixture.state.values.value, []); assert.match(fixture.state.error.value, /denied/)
  } finally { fixture.close() }
})
