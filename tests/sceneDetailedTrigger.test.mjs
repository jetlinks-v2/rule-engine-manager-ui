import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'
import { parse } from 'vue/compiler-sfc'
import { computed, nextTick, reactive, ref, watch } from 'vue'

const require = createRequire(import.meta.url)
const base = new URL('../views/SceneLinkage/', import.meta.url)
function load(file, mocks = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(file, base), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'exports', code)(id => mocks[id] ?? require(id), exports)
  return exports
}
let id = 0
const utils = load('utils.ts', { '@jetlinks-web/utils': { randomNumber: () => ++id } })
const conditions = load('sceneRule.ts')
function bindings(file, names, context) {
  const { descriptor } = parse(readFileSync(new URL(file, base), 'utf8'))
  const source = ts.createSourceFile(file, descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const declarations = names.map(name => source.statements.find(node =>
    ts.isFunctionDeclaration(node) && node.name?.text === name
    || ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(source) === name)))
  assert.ok(declarations.every(Boolean), 'run the production SFC declarations')
  const code = ts.transpileModule(declarations.map(d => d.getText(source)).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText
  return new Function(...Object.keys(context), `${code}; return { ${names.join(',')} }`)(...Object.values(context))
}
const cloneDeep = value => structuredClone(JSON.parse(JSON.stringify(value)))

test('detailed visual configuration retains display names, recognition settings and unrelated branches', () => {
  const data = ref({ trigger: {}, options: { trigger: {} }, branches: [{ when: [{ column: '_now', termType: 'gt', value: 0 }], then: [{ actions: [{ executor: 'delay' }] }] }] })
  const { aiEvent } = bindings('editor/detail/SaasTriggerConfig.vue', ['ensureFirstBranch', 'aiEvent'], {
    data, computed, ...utils, ...conditions,
  })
  const config = { sceneId: 's', sceneName: '园区巡检', taskTarget: 'ClutterDetection', taskTargetName: '杂物检测',
    mediaTargets: [{ deviceId: 'd', channelId: 'c', entityId: 'm', name: '入口摄像头' }],
    recognitionRule: { type: 'hits', time: 60, threshold: 3 } }
  aiEvent.value = config
  assert.deepEqual(aiEvent.value.recognitionRule, config.recognitionRule)
  assert.equal(aiEvent.value.sceneName, '园区巡检')
  assert.equal(aiEvent.value.taskTargetName, '杂物检测')
  assert.equal(aiEvent.value.mediaTargets[0].name, '入口摄像头')
  assert.equal(data.value.trigger.configuration.mediaTargets[0].name, undefined)
  assert.equal(data.value.branches[0].when[0].column, '_now')
  assert.equal(data.value.branches[0].then[0].actions[0].executor, 'delay')
  aiEvent.value = { ...config, recognitionRule: { type: 'missed', time: 120 } }
  assert.deepEqual(aiEvent.value.recognitionRule, { type: 'missed', time: 120 })
  aiEvent.value = { ...config, recognitionRule: undefined }
  assert.equal(aiEvent.value.recognitionRule, undefined)
  assert.equal(conditions.findSceneCondition(data.value.branches[0].when, term => term.column === 'hitResults'), undefined)
  assert.equal(data.value.branches[0].when[0].column, '_now')
})

test('repeated add-trigger events keep a single multi root and preserve leaf display metadata', async () => {
  const data = ref({ triggerType: 'device', trigger: { type: 'device', device: { productId: 'p' } }, options: { trigger: { name: '测试设备' } } })
  let opened = 0
  const { convertTriggerToMulti } = bindings('editor/detail/DetailedSceneEditor.vue', ['convertTriggerToMulti'], {
    data, cloneDeep, nextTick, multiTriggerRef: ref({ openPicker: () => opened++ }),
  })
  await Promise.all([convertTriggerToMulti(), convertTriggerToMulti(), convertTriggerToMulti()])
  assert.equal(data.value.triggerType, 'multi')
  assert.equal(data.value.trigger.multi.triggers[0].trigger.type, 'device')
  assert.equal(data.value.trigger.multi.triggers[0].options.name, '测试设备')
  assert.equal(opened, 3)
})

test('condition parsing waits for every multi child type and preserves leaf indexes', () => {
  const data = ref({ trigger: { type: 'multi', multi: { triggers: [{ index: 1, trigger: { type: 'device' } }, { index: 2, trigger: {} }] } }, branches: [] })
  const original = cloneDeep(data.value)
  const { createTermColumnsDraft } = bindings('editor/detail/DetailedSceneEditor.vue', ['asRuleRecord', 'normalizeParseConditions', 'createTermColumnsDraft'], { data, cloneDeep })
  assert.equal(createTermColumnsDraft(), undefined)
  assert.deepEqual(JSON.parse(JSON.stringify(data.value)), original)
  data.value.trigger.multi.triggers[1].trigger.type = 'timer'
  assert.deepEqual(createTermColumnsDraft().trigger.multi.triggers.map(item => item.index), [1, 2])
})

test('initial detailed actions stay compact until a trigger is configured without changing branch data', () => {
  const props = reactive({ rule: { branches: [{ when: [{ terms: [{}] }], then: [{ actions: [{ executor: 'delay' }] }] }] }, triggerType: '', triggerReady: false })
  const before = JSON.stringify(props.rule)
  const state = bindings('editor/detail/DetailedSceneExecution.vue', ['hasConfiguredConditions', 'timerOnlyMultiTrigger', 'isTimerAction', 'usesDirectAction'], { props, computed, ...conditions })
  assert.equal(state.usesDirectAction.value, true)
  props.triggerType = 'device'
  assert.equal(state.usesDirectAction.value, true, 'choosing a type is still pending configuration')
  props.triggerReady = true
  assert.equal(state.usesDirectAction.value, false)
  assert.equal(JSON.stringify(props.rule), before)
  props.triggerType = 'timer'
  assert.equal(state.usesDirectAction.value, true)
  props.triggerType = ''; props.triggerReady = false
  props.rule.branches[0].when = [{ terms: [{ column: 'temperature', value: 0 }] }]
  assert.equal(state.usesDirectAction.value, false, 'keep existing conditions editable even if the trigger is removed')
  props.rule.branches[0].when = []
  props.rule.branches.push({ when: [], then: [] })
  assert.equal(state.usesDirectAction.value, false, 'never hide additional saved branches')
})

test('detailed device trigger starts blank and switching types preserves the selection while clearing dependent fields', async () => {
  const file = '../Scene/Save/Device/Type.vue'
  for (const existing of [{}, { operator: 'reportEvent', eventId: 'alarm' }]) {
    const props = { operator: existing, options: {} }
    const { formModel, optionCache } = bindings(file, ['formModel', 'optionCache'], { props, reactive })
    // Object.assign is the production hydration step after form construction.
    Object.assign(formModel, props.operator)
    assert.equal(formModel.operator, existing.operator)
    assert.equal(formModel.eventId, existing.eventId)
    const { descriptor } = parse(readFileSync(new URL(file, base), 'utf8'))
    const source = ts.createSourceFile(file, descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const statement = source.statements.find(node => ts.isExpressionStatement(node) && node.expression.getText(source).startsWith('watch(() => formModel.operator'))
    const code = ts.transpileModule(statement.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
    let cleared = 0
    new Function('watch', 'formModel', 'optionCache', 'typeForm', code)(watch, formModel, optionCache, ref({ clearValidate() { cleared++ } }))
    formModel.operator = 'writeProperty'
    await nextTick()
    assert.equal(formModel.operator, 'writeProperty')
    assert.equal(formModel.eventId, undefined)
    assert.deepEqual({ ...formModel.writeProperties }, {})
    assert.equal(cleared, 1)
  }
})

test('detailed device commands stay blank until chosen and preserve saved command parameters', async () => {
  const vue = require('vue')
  const { useDeviceActions } = load('../Scene/Save/action/Device/actions/useDeviceActions.ts', {
    vue: { ...vue, inject: () => undefined },
    'vue-i18n': { useI18n: () => ({ t: key => key }) },
    '@rule-engine-manager-ui/store/scene': { useSceneStore: () => ({}) },
    pinia: { storeToRefs: () => ({ data: ref({}) }) },
    '@rule-engine-manager-ui/api/others': { detail: async () => ({}) },
    '../../../util': { ACTION_DATA: 'test', getParams: async () => [] },
    '@rule-engine-manager-ui/assets': { sceneImages: {} },
    '../../../../../SceneLinkage/editor/thingModel': { toThingModelOptions: items => items },
  })
  const productDetail = { id: 'p', metadata: { functions: [{ id: 'restart' }], properties: [{ id: 'temperature', expands: { type: ['read'] } }] } }
  const fresh = useDeviceActions(reactive({ compact: true, values: {}, productDetail }), () => {})
  await nextTick()
  assert.equal(fresh.modelRef.message.messageType, '')
  fresh.onMessageTypeChange('READ_PROPERTY')
  assert.equal(fresh.deviceMessageType.value, 'READ_PROPERTY')
  const saved = { messageType: 'INVOKE_FUNCTION', functionId: 'restart', inputs: [{ name: 'force', value: false }] }
  const props = reactive({ compact: true, values: { message: saved }, productDetail })
  const editing = useDeviceActions(props, () => {})
  await nextTick()
  assert.deepEqual(JSON.parse(JSON.stringify(editing.modelRef.message)), saved)
  props.productDetail = { id: 'empty', metadata: { functions: [], properties: [] } }
  await nextTick()
  assert.equal(editing.deviceMessageType.value, '')
  assert.equal(editing.modelRef.message.functionId, undefined)
})

test('invalid detailed trigger validation settles and keeps the resource dialog editable', async () => {
  const file = '../Scene/Save/Device/Type.vue'
  const { descriptor } = parse(readFileSync(new URL(file, base), 'utf8'))
  const source = ts.createSourceFile(file, descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const expose = source.statements.find(node => ts.isExpressionStatement(node) && node.expression.getText(source).startsWith('defineExpose('))
  const method = expose.expression.arguments[0].properties.find(node => node.name?.getText(source) === 'vail')
  const code = ts.transpileModule(`return (${method.initializer.getText(source)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const invalid = new Error('operator required')
  const validate = new Function('cloneDeep', 'formModel', 'typeForm', code)(cloneDeep, {}, ref({ validateFields: async () => { throw invalid } }))
  await assert.rejects(validate(), error => error === invalid)
  const scopeValidation = ref(), typeRef = ref({ vail: validate })
  const { validateScope } = bindings('../Scene/Save/Device/AddModal.vue', ['validateScope'], { scopeValidation, typeRef })
  assert.equal(await validateScope(), false)
  typeRef.value.vail = async () => ({ data: { operator: 'online' }, action: '' })
  assert.equal(await validateScope(), true)
  assert.equal(scopeValidation.value.data.operator, 'online')
})
