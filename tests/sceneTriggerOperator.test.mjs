import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'
import { parse } from 'vue/compiler-sfc'
import { reactive, ref } from 'vue'

const require = createRequire(import.meta.url)
const editor = new URL('../views/SceneLinkage/editor/', import.meta.url)
const messages = JSON.parse(readFileSync(new URL('../locales/lang/zh.json', import.meta.url), 'utf8'))
const thingModel = ts.transpileModule(readFileSync(new URL('thingModel.ts', editor), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const exports = {}
new Function('require', 'exports', thingModel)(id => id === './summaryParts' ? {} : require(id), exports)
const { getTermTypes } = exports

// 直接运行两个 SFC 的切换入口；隔离页面初始化请求，保留实际字段重置行为。
function loadSwitch(file, binding, state) {
  const filename = new URL(file, editor).pathname
  const { descriptor } = parse(readFileSync(new URL(file, editor), 'utf8'), { filename })
  const source = ts.createSourceFile(filename, descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const handler = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'changeDeviceTriggerKind')
  assert.ok(handler)
  const code = ts.transpileModule(handler.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function(binding, 'deviceTriggerChosen', `${code}; return changeDeviceTriggerKind`)(state, ref(false))
}

for (const [name, file, binding] of [['single', 'index.vue', 'form'], ['combined', 'components/MultiTriggerCard.vue', 'trigger']]) {
  test(`${name}: editing an event and switching to property displays a named valid operator`, () => {
    const state = reactive({ triggerKind: 'event', productId: 'p', deviceIds: ['d'], propertyId: undefined, termType: 'gt', termValue: undefined, eventId: 'alarm', eventOutputId: 'temperature', eventTermType: 'gt', eventTermValue: 60 })
    const change = loadSwitch(file, binding, binding === 'form' ? state : ref(state))
    change('property')
    const options = getTermTypes().map(value => ({ value, label: messages[`IotSceneLinkage.term.${value}`] }))
    assert.equal(options.find(option => option.value === state.termType)?.label, '等于')
    assert.equal(state.eventTermType, 'eq')
    assert.equal(state.eventId, undefined)
    assert.equal(state.eventTermValue, undefined)
    assert.equal(state.productId, 'p')
    assert.deepEqual(state.deviceIds, ['d'])
    state.propertyId = 'temperature'; state.termType = 'gt'; state.termValue = 60
    change('event')
    assert.equal(state.termType, 'eq')
    assert.equal(state.propertyId, undefined)
    assert.equal(state.termValue, undefined)
  })

  test(`${name}: reselecting the same trigger type preserves configured operators and values`, () => {
    const state = reactive({ triggerKind: 'property', propertyId: 'temperature', termType: 'gt', termValue: 60 })
    const change = loadSwitch(file, binding, binding === 'form' ? state : ref(state))
    change('property')
    assert.deepEqual({ ...state }, { triggerKind: 'property', propertyId: 'temperature', termType: 'gt', termValue: 60 })
    change('unsupported')
    assert.equal(state.termType, 'gt')
  })
}
