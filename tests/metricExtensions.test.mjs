import assert from 'node:assert/strict'
import test from 'node:test'
import { effectScope, ref, nextTick } from 'vue'
import { resolve } from 'node:path'
import { createMetricLoader, flush, sourceRoot } from './helpers/metricRuntime.mjs'
const load = createMetricLoader({
  '@jetlinks-web/vite/dist/dynamic-remote': { dynamicRemoteManager: {} },
  '@jetlinks-web-core/utils/consts': { isSubApp: false },
  [resolve(sourceRoot,'components/Metric/api.ts')]: { loadMetricObjectTypes:async()=>collectMetricResources().dimensions.map(({provider})=>({id:provider.ownerType})) },
})
const { moduleRegistry } = load('utils/module-registry.ts')
const { collectMetricResources, resolveMetricPresentation } = load('components/Metric/extensions/registry.ts')
const { normalizePresentation, presentationSettings, formatMetricValue, applyMetricConfigFields } = load('components/Metric/extensions/presentationSettings.ts')
const { useMetricWorkspace } = load('components/Metric/workspace/useMetricWorkspace.ts')
const dimension = ownerType => ({ ownerType, label: ownerType, navigator: { render() {} }, useSourcePicker: () => ({ pickSource: async () => undefined }) })

test('首次工作区按授权维度排序预选，显式路由和历史选择优先，对象仍需授权确认', async () => {
  moduleRegistry.clear()
  moduleRegistry.register('objects', { metricDimensions: {
    blocked:{...dimension('blocked'),order:-1,available:()=>false},
    product:{...dimension('product'),order:30},
    sensor:{...dimension('sensor'),order:0},
  } })
  for (const [initial,saved,expected] of [
    [undefined,undefined,{ownerType:'sensor',ownerId:''}],
    [{ownerType:'product',ownerId:'linked'},undefined,{ownerType:'product',ownerId:'linked'}],
    [undefined,{ownerType:'product',ownerIds:{product:'remembered'}},{ownerType:'product',ownerId:'remembered'}],
  ]) {
    const scope=effectScope()
    try {
      const view=scope.run(()=>useMetricWorkspace(ref('fresh'),ref(initial),ref(true),()=>{}, {
        getItem:()=>saved ? JSON.stringify(saved) : null,setItem(){},removeItem(){},
      }))
      await flush()
      assert.deepEqual(view.selection.value,expected)
      assert.equal(view.context.value,undefined,'preselecting a dimension does not authorize an object')
    } finally {scope.stop()}
  }
  const scope=effectScope()
  try {
    const view=scope.run(()=>useMetricWorkspace(ref('fresh'),ref({ownerType:'missing',ownerId:'x'}),ref(true),()=>{}))
    await flush()
    assert.equal(view.selection.value,undefined)
    assert.equal(view.unavailable.value,true,'an unavailable explicit dimension never falls through to another')
  } finally {scope.stop();moduleRegistry.clear()}
})

test('第五业务维度和模块限定界面可注册；冲突隔离，卸载和替换可见', () => {
  moduleRegistry.clear()
  moduleRegistry.registerResource('test-line', 'metricDimensions', { line: dimension('line') })
  moduleRegistry.registerResource('test-line', 'metricPresentations', { status: { label: 'Line status', card: { render() {} } } })
  assert.equal(collectMetricResources().dimensions[0].provider.ownerType, 'line')
  assert.equal(resolveMetricPresentation('test-line/status').provider.label, 'Line status')
  moduleRegistry.registerResource('other', 'metricPresentations', { status: { label: 'Other' } })
  assert.equal(resolveMetricPresentation('other/status').provider.label, 'Other')
  moduleRegistry.registerResource('other', 'metricDimensions', { line: dimension('line') })
  assert.equal(collectMetricResources().dimensions.length, 0)
  assert.equal(collectMetricResources().issues[0].type, 'duplicate-dimension')
  moduleRegistry.unregister('other')
  assert.equal(collectMetricResources().dimensions.length, 1)
  moduleRegistry.unregister('test-line')
  assert.equal(resolveMetricPresentation('test-line/status').missing, true)
})

test('展示覆盖浅合并保留零和false，展示精度与计算字段隔离', () => {
  const template = { options: { presentation: { provider: 'test-line/status', settings: { decimals: 2, warning: true, nested: { a: 1 } } } }, parameterDefinitions: [{ id: 'factor', expands: { editable: true } }] }
  for (const empty of [undefined, null, {}]) assert.deepEqual(normalizePresentation(empty), {})
  assert.deepEqual(presentationSettings(template, { presentation: { decimals: 0, warning: false, nested: { b: 2 } } }), { decimals: 0, warning: false, nested: { b: 2 } })
  assert.equal(formatMetricValue(5.815, { decimals: 2 }), '5.82')
  assert.equal(formatMetricValue(0, { decimals: 2 }), '0.00')
  assert.equal(formatMetricValue(false, { decimals: 2 }), 'false')
  assert.equal(formatMetricValue(5.815, { decimals: 0 }), '6')
  assert.equal(formatMetricValue(5.815, { decimals: -1 }), '5.815')
  const draft = { inputMappings: {}, parameters: { constant: 7 }, presentation: { decimals: 0 }, revision: 3, state: 'enabled' }
  const next = applyMetricConfigFields(draft, template, { parameters: { factor: 0, constant: 99 }, revision: 99, presentation: { decimals: 8 } })
  assert.deepEqual(next.parameters, { factor: 0 })
  assert.equal(next.revision, 3)
  assert.deepEqual(next.presentation, { decimals: 0 })
})

test('工作区路由ID需要导航确认，维护权限取交集，模块退场不切换其他对象', async () => {
  moduleRegistry.clear()
  moduleRegistry.registerResource('line-module', 'metricDimensions', { line: { ...dimension('line'), canEdit: selection => selection.ownerId === 'allowed' } })
  const storage = new Map()
  const scope = effectScope()
  const identity = ref('user-a:project-1:tenant-a')
  const selected = ref({ ownerType: 'line', ownerId: 'allowed' })
  const editable = ref(true)
  const updates = []
  const view = scope.run(() => useMetricWorkspace(identity, selected, editable, selection => updates.push(selection), {
    getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)
  }))
  assert.equal(view.context.value, undefined)
  await flush()
  view.confirmObject({ ownerId: 'allowed', label: 'Line A' })
  assert.equal(view.context.value.label, 'Line A')
  assert.equal(view.context.value.editable, true)
  view.confirmObject({ ownerId: 'denied', label: 'Line B' })
  assert.equal(view.context.value.editable, false)
  assert.ok([...storage.values()].every(value => !value.includes('Line')))
  identity.value = 'user-b:project-1:tenant-a'
  await nextTick()
  assert.equal(view.context.value, undefined)
  assert.equal(view.selection.value, undefined)
  moduleRegistry.unregister('line-module')
  await flush()
  assert.equal(view.context.value, undefined)
  scope.stop()
})

test('实际ModuleRegistry本地与远程加载透传指标资源，订阅在scope退场解除', async () => {
  const remoteDimension = dimension('remote-line')
  const remote = { default: { metricDimensions: { 'remote-line': remoteDimension }, metricPresentations: { custom: { label: 'Remote' } } } }
  const requests = []
  const remoteLoad = createMetricLoader({
    '@jetlinks-web/vite/dist/dynamic-remote': { dynamicRemoteManager: { addRemote: async (...args) => requests.push(args), loadRemoteComponent: async () => remote } },
    '@jetlinks-web-core/utils/consts': { isSubApp: false },
  })
  const registry = remoteLoad('utils/module-registry.ts').moduleRegistry
  const collect = remoteLoad('components/Metric/extensions/registry.ts').collectMetricResources
  const useResources = remoteLoad('components/Metric/extensions/useMetricResources.ts').useMetricResources
  registry.register('local', { metricDimensions: { local: dimension('local') } })
  await registry.loadRemoteModule('remote', 'https://installed.example/remote.js')
  assert.equal(requests.length, 1)
  assert.equal(registry.getModule('remote').metricDimensions['remote-line'], remoteDimension)
  assert.deepEqual(collect().dimensions.map(item => item.provider.ownerType), ['local', 'remote-line'])
  const scope = effectScope(); const snapshot = scope.run(useResources)
  registry.unregister('remote'); await flush(); assert.equal(snapshot.value.dimensions.length, 1)
  scope.stop(); const stopped = snapshot.value
  registry.unregister('local'); await flush(); assert.equal(snapshot.value, stopped)
  let current = false
  await registry.loadRemoteModule('stale', 'https://installed.example/remote.js', () => current)
  assert.equal(registry.hasModule('stale'), false)
  assert.equal(requests.length, 1)
})

test('无效组件/URL、维度钩子异常被隔离，既有维度消失和重新注册不暗选其他对象', async () => {
  moduleRegistry.clear()
  moduleRegistry.register('bad', { metricDimensions: {
    mismatch: dimension('different'), noHook: { ...dimension('noHook'), useSourcePicker: false },
    throws: { ...dimension('throws'), available() { throw new Error('permission unavailable') } },
    hidden: { ...dimension('hidden'), available: () => false },
  }, metricPresentations: { bad: { label: 'Bad', card: 'https://server/execute.js' }, 'wrong/key': { label: 'Bad key' } } })
  assert.equal(collectMetricResources().dimensions.length, 0)
  assert.equal(collectMetricResources().issues.length, 5)
  assert.equal(resolveMetricPresentation({ url: 'https://server' }).missing, true)
  const scope = effectScope(); const selection = ref({ ownerType: 'line', ownerId: 'a' }); const updates = []
  moduleRegistry.register('line', { metricDimensions: { line: { ...dimension('line'), canEdit() { throw new Error('permission check') } } } })
  const view = scope.run(() => useMetricWorkspace(ref('scope'), selection, ref(true), value => updates.push(value), { getItem() { throw new Error('storage blocked') }, setItem() { throw new Error('storage blocked') }, removeItem() { throw new Error('storage blocked') } }))
  try {
    await flush()
    view.confirmObject({ ownerId: 'a', label: 'Line A' }); assert.equal(view.context.value.editable, false)
    view.chooseDimension('unknown'); assert.equal(view.selection.value.ownerId, 'a')
    moduleRegistry.unregister('line'); await flush()
    assert.equal(view.selection.value, undefined); assert.equal(view.unavailable.value, true)
    moduleRegistry.registerResource('line', 'metricDimensions', { line: dimension('line') }); await flush()
    assert.equal(view.context.value, undefined)
    view.chooseDimension('line'); view.confirmObject(); assert.equal(view.selection.value.ownerId, '')
    selection.value = { ownerType: 'line', ownerId: 'b' }; await flush(); assert.equal(view.context.value, undefined)
    view.confirmObject({ ownerId: 'b', label: 'Line B' }); selection.value = { ownerType: 'line', ownerId: 'b' }; await flush()
    assert.equal(view.context.value.label, 'Line B')
  } finally { scope.stop(); moduleRegistry.clear() }
})


test('工作区按维度记忆ID，隔离用户项目租户；恢复必须再次授权，失效只清对应维度', async () => {
  moduleRegistry.clear()
  moduleRegistry.register('objects', { metricDimensions: { line: dimension('line'), area: dimension('area') } })
  const storage = new Map()
  const scope = effectScope(); const identity = ref('u/p/t'); const updates = []
  const view = scope.run(() => useMetricWorkspace(identity, ref(), ref(true), selection => updates.push(selection), {
    getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)
  }))
  try {
    await flush()
    view.chooseDimension('line'); view.confirmObject({ ownerId: 'A', label: 'Line A' })
    view.chooseDimension('area'); view.confirmObject({ ownerId: 'B', label: 'Area B' })
    view.chooseDimension('line')
    assert.deepEqual(view.selection.value, { ownerType: 'line', ownerId: 'A' })
    assert.equal(view.context.value, undefined)
    view.confirmObject(); assert.equal(view.selection.value.ownerId, '')
    view.chooseDimension('area'); assert.equal(view.selection.value.ownerId, 'B')
    assert.equal(view.context.value, undefined)
    view.confirmObject({ ownerId: 'B', label: 'Area B authorized' })
    for (const other of ['other/p/t', 'u/other/t', 'u/p/other']) {
      identity.value = other; await flush(); assert.equal(view.selection.value, undefined)
    }
    identity.value = 'u/p/t'; await flush()
    assert.equal(view.selection.value.ownerId, 'B'); assert.equal(view.context.value, undefined)
    view.chooseDimension('line'); assert.equal(view.selection.value.ownerId, '')
    view.confirmObject({ ownerId: 'A2', label: 'Line A2' }); view.chooseDimension('area')
    moduleRegistry.register('objects', { metricDimensions: { line: dimension('line') } }, { override: true }); await flush()
    assert.equal(view.context.value, undefined)
    view.chooseDimension('line'); assert.equal(view.selection.value.ownerId, 'A2')
    moduleRegistry.register('objects', { metricDimensions: { line: dimension('line'), area: dimension('area') } }, { override: true }); await flush()
    view.chooseDimension('area'); assert.equal(view.selection.value.ownerId, '')
    assert.ok([...storage.values()].every(value => !value.includes('Line') && !value.includes('authorized')))
  } finally { scope.stop(); moduleRegistry.clear() }
})
