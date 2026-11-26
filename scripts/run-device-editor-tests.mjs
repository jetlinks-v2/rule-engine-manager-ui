import { build } from 'esbuild'
import { parse, compileScript } from 'vue/compiler-sfc'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temp = await mkdtemp(path.join(tmpdir(), 'device-editor-tests-'))
try {
  const output = path.join(temp, 'fixture.mjs')
  await build({ stdin: { contents: `
import assert from 'node:assert/strict'
import { createRenderer, h, reactive, nextTick } from 'vue'
import Timer from './views/Scene/Save/components/Timer/index.vue'
import Type from './views/Scene/Save/Device/Type.vue'
import QuickAction from './views/SceneLinkage/editor/components/DeviceActionRow.vue'
import { useDeviceActions } from './views/Scene/Save/action/Device/actions/useDeviceActions'
import { useDeviceActionScope } from './views/Scene/Save/action/Device/useDeviceActionScope'
const renderer = createRenderer({ createElement: () => ({}), createText: () => ({}), createComment: () => ({}), setText() {}, setElementText() {}, parentNode() {}, nextSibling() {}, insert() {}, remove() {}, patchProp() {} })
const input = reactive({ metadata: {}, operator: { operator: 'online' } })
let trigger
renderer.createApp({ setup: () => () => h(Type, { ...input, ref: value => { trigger = value } }) }).mount({})
const values = () => trigger.$.setupState.topOptions.map(item => item.value)
await nextTick()
assert.deepEqual(values(), ['online', 'offline'])
input.metadata = { properties: [{ id: 'temp', valueType: { type: 'int' }, expands: { type: ['read', 'report'] } }] }
await nextTick()
assert.deepEqual(values(), ['online', 'offline', 'readProperty', 'reportProperty'])
input.metadata = { functions: [{ id: 'start', inputs: [{ id: 'duration' }] }], events: [{ id: 'alarm' }] }
await nextTick()
assert.deepEqual(values(), ['online', 'offline', 'reportEvent', 'invokeFunction'])
assert.equal(trigger.$.setupState.functionOptions[0].inputs[0].id, 'duration')
input.metadata = {}; await nextTick()
assert.deepEqual(values(), ['online', 'offline'])
assert.deepEqual(trigger.$.setupState.functionOptions, [])
assert.deepEqual(trigger.$.setupState.readProperties, [])
const props = reactive({ compact: true, productDetail: { id: 'p1' }, values: { message: { messageType: 'WRITE_PROPERTY', properties: { temp: 10 } } }, name: 0, thenName: 0, branchesName: 0, columnMap: {} })
let action, scope
renderer.createApp({ setup() { action = useDeviceActions(props, () => {}); scope = useDeviceActionScope(props); return () => null } }).mount({})
await nextTick()
assert.equal(action.modelRef.message.messageType, 'WRITE_PROPERTY')
props.productDetail = { id: 'p1', metadata: { properties: [{ id: 'temp', expands: { type: ['read', 'write'] } }] } }; await nextTick()
assert.deepEqual(action.actionTypeOptions.value.map(item => item.value), ['READ_PROPERTY', 'WRITE_PROPERTY'])
assert.equal(action.modelRef.message.messageType, 'WRITE_PROPERTY')
props.productDetail = { id: 'p1', metadata: { properties: [{ id: 'temp', expands: { type: ['read'] } }] } }; await nextTick()
assert.equal(action.modelRef.message.messageType, 'READ_PROPERTY')
assert.deepEqual(action.modelRef.message.properties, [])
props.productDetail = { id: 'p1', metadata: '{}' }; await nextTick()
assert.deepEqual(action.actionTypeOptions.value, [])
assert.equal(action.modelRef.message.messageType, '')
assert.deepEqual(scope.variables.value[0].children.map(item => item.id), ['scene.deviceId'])
props.productDetail = { id: 'p2', metadata: '{}' }; await nextTick(); await nextTick()
assert.deepEqual(scope.variables.value, [])
assert.deepEqual(scope.disabledModes.value, ['context'])
globalThis.fixtureMetadata = { properties: [{ id: 'temp', expands: { type: ['read'] } }], functions: [] }
const quickProps = reactive({ action: { type: 'device', config: { productId: 'p1', options: {}, message: { messageType: 'INVOKE_FUNCTION' } } }, index: 0, autoOpen: true })
let quick
renderer.createApp({ setup: () => () => h(QuickAction, { ...quickProps, ref: value => { quick = value } }) }).mount({})
await nextTick(); await nextTick(); await nextTick()
assert.deepEqual(quick.$.setupState.operationTypeOptions.map(item => item.value), ['READ_PROPERTY'])
assert.equal(quick.$.setupState.operationType, 'READ_PROPERTY')
globalThis.fixtureMetadata = {}; await quick.$.setupState.loadMetadata(); await nextTick()
assert.deepEqual(quick.$.setupState.operationTypeOptions, [])
assert.equal(quick.$.setupState.validateAction(), false)
let timer
renderer.createApp({setup:()=>()=>h(Timer,{ref:value=>{timer=value}})}).mount({})
await nextTick()
const invalid=new Error('无效的 Cron 表达式')
timer.$.setupState.timerForm={validateFields:()=>Promise.reject(invalid)}
await assert.rejects(Promise.race([timer.validateFields(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('校验 Promise 未结束')),500))]),error=>error===invalid)
timer.$.setupState.timerForm={validateFields:()=>Promise.resolve({cron:'0 0 8 * * ?'})}
assert.deepEqual(await timer.validateFields(),{cron:'0 0 8 * * ?'})
console.log('PASS: 定时校验错误可捕获并能再次确认')
console.log('PASS: 触发能力、物模型切换、功能参数、动作回显与默认值、空物模型、同产品变量')
`, resolveDir: root, loader: 'ts' }, outfile: output, bundle: true, platform: 'node', format: 'esm', target: 'node22',
    plugins: [{ name: 'device-editor-test-boundaries', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        let mock
        if (args.path === '@jetlinks-web-core/utils/utils') mock = 'edition'
        if (args.path === 'vue-i18n' || args.path.includes('@jetlinks-web-core/locales')) mock = 'i18n'
        if (args.path.includes('/assets')) mock = 'assets'
        if (args.path.includes('/store/scene')) mock = 'store'
        if (args.path.includes('/api/others') || args.path.includes('/api/scene-linkage')) mock = 'api'
        if (args.path === '@jetlinks-web-core/utils/comm') mock = 'comm'
        if (['useDeviceActions.ts', 'useDeviceActionScope.ts'].some(name => args.importer.endsWith(name)) && ['../../util', '../../../util'].includes(args.path)) mock = 'params'
        if (args.importer.endsWith('Type.vue') && args.path === '../components') mock = 'timer'
        if (mock) return { path: mock, namespace: 'fixture' }
      })
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: {
        edition: 'export const isNoCommunity = true',
        i18n: 'export const useI18n = () => ({ t: key => key }); export default { global: { t: key => key } }',
        assets: 'export const sceneImages = {}',
        comm: 'export const onlyMessage = () => {}',
        api: 'export const getProduct = async id => ({ result: { id, name: id, metadata: globalThis.fixtureMetadata || {} } }); export const detail = async () => ({ status: 200, result: { metadata: "{}" } })',
        params: 'export const ACTION_DATA = Symbol(); export const getParams = async () => [{ id: "scene", children: [{ id: "scene.timestamp" }, { id: "scene.deviceId", options: { productId: "p1" } }] }]',
        store: "import { defineStore, createPinia, setActivePinia } from 'pinia'; setActivePinia(createPinia()); export const useSceneStore = defineStore('fixture', { state: () => ({ data: { trigger: { type: 'device' }, branches: [] } }) })",
        timer: 'export const Timer = { render: () => null }',
      }[args.path], loader: 'js', resolveDir: root }))
      builder.onLoad({ filter: /\.vue$/ }, async args => {
        if (!/[\\/]Device[\\/]Type\.vue$/.test(args.path) && !args.path.endsWith('DeviceActionRow.vue') && !/[\\/]components[\\/]Timer[\\/]index\.vue$/.test(args.path)) return { contents: 'export default { render: () => null }', loader: 'js' }
        const { descriptor } = parse(await readFile(args.path, 'utf8'), { filename: args.path })
        const script = compileScript(descriptor, { id: 'device-trigger', genDefaultAs: 'component' }).content
        return { contents: ((args.path.endsWith('Type.vue') || /[\\/]Timer[\\/]index\.vue$/.test(args.path)) ? "import { reactive, ref, computed, watch, onMounted, watchEffect, unref } from 'vue';\n" : '') + script + '\ncomponent.render = () => null; export default component', loader: 'ts' }
      })
    } }],
  })
  await import(pathToFileURL(output).href)
} finally {
  await rm(temp, { recursive: true, force: true })
}
