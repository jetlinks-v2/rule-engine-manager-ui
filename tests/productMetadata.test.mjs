import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { computed, ref } from 'vue'
import { parse } from 'vue/compiler-sfc'

const require = createRequire(import.meta.url)
const editor = new URL('../views/SceneLinkage/editor/', import.meta.url)
function load(file, mocks = {}) {
  const code = ts.transpileModule(readFileSync(new URL(file, editor), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  new Function('require', 'exports', code)(id => id in mocks ? mocks[id] : require(id), exports)
  return exports
}
const { useProductMetadata } = load('useProductMetadata.ts', { '../../../api/scene-linkage': { getProduct() {} } })
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b }); return {promise, resolve, reject} }

test('product changes clear capabilities immediately and late responses cannot replace the current model', async () => {
  let id = 'old'
  const first = deferred(), second = deferred()
  const state = useProductMetadata(() => id, value => value === 'old' ? first.promise : second.promise)
  const oldTask = state.load()
  assert.equal(state.loading.value, true)
  id = 'new'
  const newTask = state.load()
  assert.deepEqual(state.metadata.value, { properties: [], functions: [], events: [] })
  second.resolve({ result: { metadata: JSON.stringify({ events: [{id:'alert'}] }) } })
  await newTask
  first.resolve({ result: { metadata: { properties: [{id:'stale'}] } } })
  await oldTask
  assert.deepEqual(state.metadata.value, { properties: [], functions: [], events: [{id:'alert'}] })
  assert.equal(state.loading.value, false)
  assert.equal(state.failed.value, false)
})

test('late rejection does not hide the newer loading state or report a failure for a different product', async () => {
  let id = 'old'
  const first = deferred(), second = deferred()
  const state = useProductMetadata(() => id, value => value === 'old' ? first.promise : second.promise)
  const oldTask = state.load(); id='new'; const newTask=state.load()
  first.reject(new Error('old request failed')); await oldTask
  assert.equal(state.loading.value, true)
  assert.equal(state.failed.value, false)
  second.resolve({ result: {metadata: {}} }); await newTask
  assert.equal(state.loading.value, false)
})

test('empty, malformed, failed and recovered models have distinct states', async () => {
  let response = { result: { metadata: {} } }
  const state = useProductMetadata(() => 'p', async () => response)
  await state.load(); assert.equal(state.failed.value, false)
  response = {result:{metadata:'invalid json'}}
  await state.load(); assert.equal(state.failed.value, true)
  response = {result:{metadata:{properties:[{id:'temperature'}],functions:null,events:{}}}}
  await state.load()
  assert.equal(state.failed.value, false)
  assert.deepEqual(state.metadata.value, {properties:[{id:'temperature'}],functions:[],events:[]})
})

// Evaluate the SFC's actual computed expressions to cover capability and progressive-field visibility.
function expression(file, name, bindings) {
  const {descriptor} = parse(readFileSync(new URL(file, editor), 'utf8'))
  const source = ts.createSourceFile(file, descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  let initializer
  for (const statement of source.statements) if (ts.isVariableStatement(statement)) {
    const node=statement.declarationList.declarations.find(item => item.name.getText(source) === name)
    if (node) initializer=node.initializer.getText(source)
  }
  assert.ok(initializer, name)
  const code=ts.transpileModule('return '+initializer, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
  return new Function(...Object.keys(bindings), code)(...Object.values(bindings))
}
const t = key => key
for (const file of ['index.vue', 'components/MultiTriggerCard.vue']) {
  test(file + ': no-model triggers hide property and event, keeping state triggers available', () => {
    const propertyOptions=ref([]), eventOptions=ref([])
    const kinds=expression(file,'deviceTriggerKinds',{computed,t,propertyOptions,eventOptions})
    assert.deepEqual(kinds.value.map(item=>item.value), ['online','offline','state'])
    propertyOptions.value=[{value:'temp'}]
    assert.deepEqual(kinds.value.map(item=>item.value), ['property','online','offline','state'])
    eventOptions.value=[{value:'alarm'}]; propertyOptions.value=[]
    assert.deepEqual(kinds.value.map(item=>item.value), ['event','online','offline','state'])
    const form={triggerKind:'event'}, trigger=ref(form), deviceTriggerChosen=ref(false), metadataLoading=ref(false), metadataFailed=ref(false)
    const selected=expression(file,'selectedDeviceTriggerKind',{computed,form,trigger,deviceTriggerChosen,metadataLoading,metadataFailed,deviceTriggerKinds:kinds})
    assert.equal(selected.value, undefined)
    deviceTriggerChosen.value=true; assert.equal(selected.value,'event')
    metadataLoading.value=true; assert.equal(selected.value,undefined)
    metadataLoading.value=false; eventOptions.value=[]; assert.equal(selected.value,undefined)
  })
}

test('device action starts unselected and never exposes an unsupported internal operation', () => {
  const readableProperties=ref([]), writableProperties=ref([]), functions=ref([])
  const options=expression('components/DeviceActionRow.vue','operationTypeOptions',{computed,t,readableProperties,writableProperties,functions})
  const config=ref({message:{messageType:'READ_PROPERTY'}}), metadataLoading=ref(false), metadataFailed=ref(false)
  const selected=expression('components/DeviceActionRow.vue','operationType',{computed,config,metadataLoading,metadataFailed,operationTypeOptions:options})
  assert.deepEqual(options.value,[]); assert.equal(selected.value,undefined)
  functions.value=[{value:'restart'}]
  assert.deepEqual(options.value.map(item=>item.value),['INVOKE_FUNCTION']); assert.equal(selected.value,undefined)
  config.value.message.messageType='INVOKE_FUNCTION'; assert.equal(selected.value,'INVOKE_FUNCTION')
  metadataLoading.value=true; assert.equal(selected.value,undefined)
  metadataLoading.value=false; config.value.message.messageType=''; assert.equal(selected.value,undefined)
  readableProperties.value=[{value:'temperature'}]; writableProperties.value=[{value:'target'}]
  assert.deepEqual(options.value.map(item=>item.value),['READ_PROPERTY','WRITE_PROPERTY','INVOKE_FUNCTION'])
})
