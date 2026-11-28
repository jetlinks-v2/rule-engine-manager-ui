import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { writeFile, rm } from 'node:fs/promises'
import { createRenderer, ref, nextTick } from 'vue'
import { Observable, Subject } from 'rxjs'

const temporary = new URL(`../.rule-list-test-${process.pid}.mjs`, import.meta.url)
const mocks = {
  '@vueuse/core': `export const useElementSize=()=>globalThis.__ruleListEnv; export const useScroll=()=>globalThis.__ruleListEnv;
    export {watch as watchDebounced} from 'vue';
    export const useDocumentVisibility=()=>globalThis.__ruleListEnv.visibility;
    export const useTimestamp=()=>({timestamp:globalThis.__ruleListEnv.now,pause(){},resume(){}});`,
  '../../api/instanceObservation': `import {EMPTY} from 'rxjs';export const loadRulePreviews=(...args)=>globalThis.__previewRules?.(...args) || EMPTY;
    export const streamRuleInstances=(...args)=>globalThis.__streamRules(...args);export const observeRuleInstances=(...args)=>globalThis.__observeRules(...args);`,
}
const result = await build({ stdin: { contents: `export * from './views/Instance/useRuleInstanceList';export * from './views/Instance/listTypes'`, resolveDir: new URL('..', import.meta.url).pathname },
  bundle: true, write: false, platform: 'node', format: 'esm', external: ['vue', 'rxjs'], plugins: [{ name: 'transport-boundaries', setup(b) {
    b.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'mock' } : undefined)
    b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path] }))
  } }] })
await writeFile(temporary, result.outputFiles[0].text)
const { useRuleInstanceList, ruleListWindow } = await import(temporary.href)
await rm(temporary)
const flush = async () => { await nextTick(); await new Promise(resolve => setImmediate(resolve)); await nextTick() }
const row = id => ({ id: String(id), name: `Rule ${id}`, createTime: 1000 - Number(id), state: {value:'started',text:'Enabled'} })
function mount() {
  globalThis.__ruleListEnv = { width: ref(980), height: ref(480), y: ref(0), visibility: ref('visible'), now: ref(Date.now()) }
  const reads = [], subscriptions = []
  globalThis.__streamRules = (query, cursor) => { const stream = new Subject(); reads.push({ query, cursor, stream }); return stream }
  globalThis.__observeRules = ids => new Observable(observer => {
    const item = { ids, observer, cancelled: false }; subscriptions.push(item)
    return () => { item.cancelled = true }
  })
  globalThis.__previewRules = undefined
  let state
  const renderer = createRenderer({ createComment: () => ({}), parentNode: () => null, nextSibling: () => null, insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {}, createElement: () => ({}), createText: () => ({}) })
  const app = renderer.createApp({ setup() { state = useRuleInstanceList(); return () => null } })
  app.mount({})
  return { state, reads, subscriptions, env: globalThis.__ruleListEnv, close: () => app.unmount() }
}

test('ten thousand rules retain a bounded card and subscription window at every width', () => {
  for (const width of [250, 640, 1000, 1800]) for (const scroll of [0, 5000, 500000]) {
    const window = ruleListWindow(10000, width, 800, scroll)
    assert.ok(window.end - window.start <= 64)
    assert.ok(window.start >= 0 && window.end <= 10000 + window.columns)
    assert.ok(window.height > 0)
  }
})

test('records appear before completion, filter replacement cancels and isolates old reads', async () => {
  const { state, reads, close } = mount()
  try {
    state.refresh()
    reads[0].stream.next(row(1))
    assert.equal(state.items.value.length, 1)
    assert.equal(state.loading.value, true)
    state.refresh({ terms: [{ column: 'name', value: 'new' }] })
    assert.equal(reads[0].stream.observed, false)
    reads[0].stream.next(row(2))
    reads[1].stream.next(row(3)); reads[1].stream.complete()
    await flush()
    assert.deepEqual(state.items.value.map(item => item.id), ['3'])
    assert.equal(state.more.value, false)
  } finally { close() }
})

test('empty-state search terms follow the effective query through refresh, failure and clearing', async () => {
  const { state, reads, close } = mount()
  try {
    const terms = [{ column: 'name', value: 'missing' }]
    state.refresh({ terms }); reads[0].stream.complete(); await flush()
    assert.deepEqual(state.searchTerms.value, terms)
    assert.equal(state.items.value.length, 0)
    state.refresh(); assert.deepEqual(reads[1].query.terms, terms)
    reads[1].stream.error(new Error('offline'))
    assert.deepEqual(state.searchTerms.value, terms)
    state.refresh({ terms: [] })
    assert.deepEqual(state.searchTerms.value, [])
    assert.deepEqual(reads[2].query.terms, [])
  } finally { close() }
})

test('failed segments retain rows, retry from the last completed cursor and deduplicate', async () => {
  const { state, reads, close } = mount()
  try {
    state.refresh()
    for (let i = 0; i < 32; i++) reads[0].stream.next(row(i))
    reads[0].stream.complete(); await flush()
    assert.equal(reads.length, 1)
    state.loadMore()
    assert.deepEqual(reads[1].cursor, { beforeTime: 969, beforeId: '31' })
    reads[1].stream.next(row(32)); reads[1].stream.error(new Error('offline'))
    assert.equal(state.items.value.length, 33)
    assert.equal(state.error.value, true)
    state.loadMore()
    assert.deepEqual(reads[2].cursor, reads[1].cursor)
    reads[2].stream.next(row(32)); reads[2].stream.next(row(33)); reads[2].stream.complete(); await flush()
    assert.equal(state.items.value.length, 34)
    assert.equal(state.error.value, false)
  } finally { close() }
})

test('scroll replaces the single visible subscription, clears old observations and releases on hide or unmount', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const { state, reads, subscriptions, env, close } = mount()
  try {
    state.refresh()
    for (let i = 0; i < 32; i++) reads[0].stream.next(row(i))
    reads[0].stream.complete(); await flush()
    t.mock.timers.tick(100); await flush()
    assert.equal(subscriptions.filter(item => !item.cancelled).length, 1)
    const first = subscriptions.at(-1)
    first.observer.next({ timestamp: Date.now(), rules: [{ id: '0', observationStatus: 'ready', inputRate: 0 }] })
    assert.equal(state.runtime.value.get('0').inputRate, 0)
    env.y.value = 1200; await flush()
    assert.equal(first.cancelled, true)
    assert.equal(state.runtime.value.size, 0)
    t.mock.timers.tick(100); await flush()
    assert.ok(subscriptions.at(-1).ids.length <= 64)
    first.observer.next({ timestamp: Date.now(), rules: [{ id: '0', inputRate: 999 }] })
    assert.equal(state.runtime.value.size, 0)
    env.visibility.value = 'hidden'; await flush()
    assert.equal(subscriptions.filter(item => !item.cancelled).length, 0)
    env.visibility.value = 'visible'; await flush()
    t.mock.timers.tick(100); await flush()
    assert.equal(subscriptions.filter(item => !item.cancelled).length, 1)
  } finally { close() }
  assert.equal(subscriptions.filter(item => !item.cancelled).length, 0)
})

test('disabled rules never start an observation sampler', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const { state, reads, subscriptions, close } = mount()
  try {
    state.refresh()
    reads[0].stream.next({ ...row(1), state: { value: 'disable', text: 'Disabled' } })
    reads[0].stream.complete(); await flush(); t.mock.timers.tick(100); await flush()
    assert.equal(subscriptions.length, 0)
  } finally { close() }
})

test('visible previews carry metadata icons without requiring a thumbnail and release their blobs', async () => {
  const { state, reads, close } = mount()
  const images = new Subject()
  globalThis.__previewRules = () => images
  const revoked = []
  const original = URL.revokeObjectURL
  URL.revokeObjectURL = url => { revoked.push(url); original.call(URL, url) }
  let url
  try {
    state.refresh(); [1,2,3].forEach(id => reads[0].stream.next(row(id))); reads[0].stream.complete(); await flush()
    images.next({ id: '1', metadata: { thumbnailSvg: '<svg xmlns="http://www.w3.org/2000/svg"/>', icon: 'SendOutlined' } })
    images.next({ id: '2', metadata: { icon: 'ClockCircleOutlined' } })
    images.next({ id: '3', metadata: { icon: 42 } }); images.complete()
    url = state.previews.value.get('1').url
    assert.match(url, /^blob:/)
    assert.equal(state.previews.value.get('1').icon, 'SendOutlined')
    assert.equal(state.previews.value.get('2').icon, 'ClockCircleOutlined')
    assert.equal(state.previews.value.get('2').url, undefined)
    assert.equal(state.previews.value.get('3').icon, undefined)
  } finally { close(); URL.revokeObjectURL = original }
  assert.ok(revoked.includes(url))
})
