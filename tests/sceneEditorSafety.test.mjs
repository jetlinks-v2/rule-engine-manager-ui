import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'
import * as vue from 'vue'
import { parse } from 'vue/compiler-sfc'

const require = createRequire(import.meta.url)
const editor = new URL('../views/SceneLinkage/editor/', import.meta.url)
function load(file, mocks = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(file, editor), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'exports', code)(id => mocks[id] ?? require(id), exports)
  return exports
}
const snapshot = load('sceneDraftSnapshot.ts')
const draftHooks = () => load('useSceneLeaveGuard.ts', {
  './sceneDraftSnapshot': snapshot,
  'vue-router': { onBeforeRouteLeave() {}, onBeforeRouteUpdate() {} },
  'ant-design-vue': { Modal: {} },
})

test('draft comparison ignores generated metadata, retains actual configuration parameters, and tracks restoration', () => {
  const data = vue.reactive({ name: '', trigger: {}, branches: [], options: { summary: '' } })
  const changes = draftHooks().useSceneDraftChanges(() => data)
  assert.equal(changes.dirty.value, false)
  changes.markClean()
  Object.assign(data, { key: 'temporary', options: { summary: 'generated', trigger: { productName: 'loaded' } } })
  assert.equal(changes.dirty.value, false)
  data.name = '新名称'
  assert.equal(changes.dirty.value, true)
  data.name = ''
  assert.equal(changes.dirty.value, false)
  data.trigger = { configuration: { key: 'business-key', options: { value: 1 }, message: { properties: { summary: 1 } } } }
  changes.markClean()
  for (const change of [
    () => { data.trigger.configuration.key = 'changed' },
    () => { data.trigger.configuration.options.value++ },
    () => { data.trigger.configuration.message.properties.summary++ },
  ]) {
    change()
    assert.equal(changes.dirty.value, true)
    changes.markClean()
  }
  data.branches.push({ when: [], then: [] })
  assert.equal(changes.dirty.value, true)
  data.branches.pop()
  assert.equal(changes.dirty.value, false)
})

test('quick visual alarm source changes remain dirty even when only options source IDs change', () => {
  const form = vue.reactive({ triggerKind: 'alarm', alarm: { modes: ['trigger'], options: { sceneId: 's1', taskTarget: 'a1' } } })
  const changes = draftHooks().useSceneDraftChanges(() => form)
  changes.markClean()
  form.alarm.options.taskTarget = 'a2'
  assert.equal(changes.dirty.value, true)
  form.alarm.options.taskTarget = 'a1'
  assert.equal(changes.dirty.value, false)
})

function guardHarness(saveChanges = async () => true) {
  const lifecycle = {}, routes = {}, listeners = new Map(), dialogs = []
  let dirty = false, saving = false
  const hooks = load('useSceneLeaveGuard.ts', {
    './sceneDraftSnapshot': snapshot,
    vue: { ...vue, onActivated: fn => { lifecycle.activate = fn }, onDeactivated: fn => { lifecycle.deactivate = fn }, onScopeDispose: fn => { lifecycle.dispose = fn } },
    'vue-router': { onBeforeRouteLeave: fn => { routes.leave = fn }, onBeforeRouteUpdate: fn => { routes.update = fn } },
    'ant-design-vue': { Modal: { confirm: config => {
      const dialog = { config, destroyed: false, update(value) { Object.assign(this.config, value) }, destroy() { this.destroyed = true } }
      dialogs.push(dialog)
      return dialog
    } } },
  })
  const previousWindow = globalThis.window
  globalThis.window = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) }
  const guard = hooks.useSceneLeaveGuard(() => dirty, () => saving, key => key, saveChanges)
  return { guard, lifecycle, routes, listeners, dialogs, setDirty: value => { dirty = value }, setSaving: value => { saving = value },
    cleanup() { lifecycle.dispose(); globalThis.window = previousWindow } }
}

test('route guard handles clean, saving, repeated attempts, cancel, discard and saved navigation', async () => {
  const h = guardHarness()
  try {
    assert.equal(h.routes.leave(), true)
    h.setSaving(true)
    assert.equal(h.routes.leave(), false)
    h.setSaving(false)
    h.setDirty(true)
    const first = h.routes.leave()
    assert.strictEqual(h.routes.leave(), first)
    assert.equal(h.dialogs.length, 1)
    h.dialogs[0].config.onCancel({ triggerCancel: true })
    assert.equal(await first, false)
    const second = h.routes.leave()
    // The previous dialog's delayed close must not dismiss the new decision.
    h.dialogs[0].config.afterClose()
    assert.strictEqual(h.routes.leave(), second)
    h.dialogs[1].config.onOk()
    assert.equal(await second, true)
    h.guard.markSaved()
    assert.equal(h.routes.leave(), true)
    assert.equal(h.dialogs.length, 2)
  } finally { h.cleanup() }
})

test('refresh protection follows dirty/saving state and releases listeners and unresolved navigation on disposal', async () => {
  const h = guardHarness()
  try {
    const unload = () => {
      const event = { prevented: false, preventDefault() { this.prevented = true } }
      h.listeners.get('beforeunload')(event)
      return event
    }
    assert.equal(unload().prevented, false)
    h.setDirty(true)
    assert.equal(unload().prevented, true)
    h.lifecycle.deactivate()
    assert.equal(unload().prevented, false)
    h.lifecycle.activate()
    h.setDirty(false)
    h.setSaving(true)
    assert.equal(unload().prevented, true)
    h.setSaving(false)
    h.setDirty(true)
    const pending = h.routes.leave()
    h.lifecycle.dispose()
    assert.equal(await pending, false)
    assert.equal(h.dialogs[0].destroyed, true)
    assert.equal(h.listeners.size, 0)
  } finally { h.cleanup() }
})

test('same editor UI navigation does not prompt but different route parameters are guarded', async () => {
  const h = guardHarness()
  try {
    h.setDirty(true)
    assert.equal(h.routes.update({ path: '/editor/a', params: { id: 'a' } }, { path: '/editor/a', params: { id: 'a' } }), true)
    const pending = h.routes.update({ path: '/editor/b', params: { id: 'b' } }, { path: '/editor/a', params: { id: 'a' } })
    h.dialogs[0].config.onCancel({ triggerCancel: true })
    assert.equal(await pending, false)
  } finally { h.cleanup() }
})

test('leave confirmation differentiates close, discard, successful save, failed save and rejected save', async () => {
  for (const result of [true, false, 'reject']) {
    let calls = 0
    const h = guardHarness(async () => { calls++; if (result === 'reject') throw new Error('failed'); return result })
    try {
      h.setDirty(true)
      const closed = h.routes.leave()
      h.dialogs.at(-1).config.onCancel({ triggerCancel: true })
      assert.equal(await closed, false); assert.equal(calls, 0)
      const discarded = h.routes.leave()
      h.dialogs.at(-1).config.onCancel()
      assert.equal(await discarded, true); assert.equal(calls, 0)
      const saved = h.routes.leave()
      const dialog = h.dialogs.at(-1)
      assert.equal(dialog.config.maskClosable, false); assert.equal(dialog.config.closable, true)
      await dialog.config.onOk()
      assert.equal(await saved, result === true); assert.equal(calls, 1)
    } finally { h.cleanup() }
  }
})

test('discard invokes the close callback supplied by Ant before leaving; icon close keeps the draft', async () => {
  const h = guardHarness()
  try {
    h.setDirty(true)
    const discarded = h.routes.leave()
    let closed = false
    h.dialogs.at(-1).config.onCancel(() => { closed = true })
    assert.equal(closed, true)
    assert.equal(await discarded, true)
    const stayed = h.routes.leave()
    const dialog = h.dialogs.at(-1)
    // Ant first runs afterClose, then invokes onCancel with a no-op close function for X / Escape.
    dialog.config.afterClose()
    dialog.config.onCancel(() => {})
    assert.equal(await stayed, false)
  } finally { h.cleanup() }
})

test('quick timer local validation keeps daily schedules valid and rejects incomplete custom dates', () => {
  const { quickTimerValidation: validate } = load('quickTimerValidation.ts')
  const daily = { triggerKind: 'repeat', repeatMode: 'daily', repeatTime: '08:00', repeatWeekdays: [], repeatMonthDays: [] }
  assert.equal(validate(daily), undefined)
  for (const mode of ['weekly', 'monthly']) {
    const draft = { ...daily, repeatMode: 'custom', repeatCustomMode: mode }
    assert.equal(validate(draft), 'IotSceneLinkage.message.repeatDateRequired')
    draft[mode === 'weekly' ? 'repeatWeekdays' : 'repeatMonthDays'] = [1]
    assert.equal(validate(draft), undefined)
  }
  assert.equal(validate({ triggerKind: 'date' }), 'IotSceneLinkage.message.dateRequired')
  assert.equal(validate({ triggerKind: 'interval', interval: 0 }), 'IotSceneLinkage.message.repeatTimeRequired')
})

function sfcBindings(file, names, context) {
  const { descriptor } = parse(readFileSync(new URL(file, editor), 'utf8'))
  const source = ts.createSourceFile(file, descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const declarations = names.map(name => source.statements.find(node =>
    ts.isFunctionDeclaration(node) && node.name?.text === name || ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(source) === name)))
  assert.ok(declarations.every(Boolean))
  const code = ts.transpileModule(declarations.map(d => d.getText(source)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function(...Object.keys(context), `${code}; return { ${names.join(',')} }`)(...Object.values(context))
}

function preview(rule) {
  const t = key => key.split('.').at(-1)
  const context = { computed: vue.computed, props: { rule, termColumns: {} }, t, calendarTags: vue.ref([]),
    summaryPartsText: parts => parts.map(p => p.text).join(''),
    detailedTriggerSummaryParts: () => [{ text: '设备上线' }],
    detailedConditionSummaryParts: terms => (terms || []).map(term => ({ text: term.description })),
    detailedDebounceSummaryParts: () => [], formatActionParts: action => [{ text: action.description }] }
  return sfcBindings('detail/DetailedSceneRuleSummary.vue', ['asRecords', 'asRecord', 'formatAction', 'formatParallelActionParts', 'previewLines'], context).previewLines.value
}

test('confirming a detailed trigger opens empty first-branch conditions and preserves existing conditions and actions', () => {
  const actions = [{ actions: [{ executor: 'delay', delay: { time: 5 } }] }]
  const data = vue.ref({ branches: [{ when: [], then: actions }], options: { when: [{ terms: [] }] } })
  const triggerPending = vue.ref(true)
  const defaultBranches = [{ when: [{ type: 'and', terms: [{ value: { source: 'fixed' } }] }] }]
  const { completeTriggerConfig } = sfcBindings('detail/DetailedSceneEditor.vue', ['completeTriggerConfig'], {
    data, triggerPending, pendingTriggerSnapshot: {}, defaultBranches,
    cloneDeep: structuredClone, assignmentKey: value => value,
  })
  completeTriggerConfig()
  assert.equal(triggerPending.value, false)
  assert.deepEqual(JSON.parse(JSON.stringify(data.value.branches[0].when)), defaultBranches[0].when)
  assert.notStrictEqual(data.value.branches[0].when, defaultBranches[0].when)
  assert.deepEqual(JSON.parse(JSON.stringify(data.value.branches[0].then)), actions)
  assert.deepEqual(JSON.parse(JSON.stringify(data.value.options.when[0].terms)), [{ terms: [['', 'eq', '', 'and']] }])
  data.value.branches[0].when = [{ column: 'temperature', value: 0 }]
  completeTriggerConfig()
  assert.deepEqual(JSON.parse(JSON.stringify(data.value.branches[0].when)), [{ column: 'temperature', value: 0 }])
})

test('detailed preview preserves independent when/then pairs and otherwise conditions in mixed branches', () => {
  const branch = (description, executeAnyway) => ({ executeAnyway, when: [{ description: `${description}条件` }], then: [{ actions: [{ description: `${description}动作` }] }] })
  const lines = preview({ branches: [branch('首个'), branch('独立', true), branch('否则'), branch('下一独立', true)], options: {} })
  assert.deepEqual(lines.map(line => [line.kind, line.value]), [
    ['when', '设备上线'], ['and', '首个条件'], ['then', '首个动作'],
    ['when', '设备上线'], ['and', '独立条件'], ['then', '独立动作'],
    ['otherwise', 'previewOtherwiseDescription'], ['and', '否则条件'], ['then', '否则动作'],
    ['when', '设备上线'], ['and', '下一独立条件'], ['then', '下一独立动作'],
  ])
  assert.equal(new Set(lines.map(line => line.key)).size, lines.length)
})

test('detailed preview retains trigger, shared conditions and empty-action placeholders for independent branches', () => {
  const lines = preview({ terms: [{ description: '共用门槛' }], branches: [{ then: [] }, { executeAnyway: true, then: [] }], options: {} })
  assert.deepEqual(lines.map(line => line.kind), ['when', 'and', 'then', 'when', 'and', 'then'])
  assert.ok(lines.filter(line => line.kind === 'then').every(line => line.empty))
})

test('failed detailed saves preserve the loaded baseline; only successful saves mark the editor saved', async () => {
  const canonicalDraft = vue.ref({ name: '原始名称' }), saving = vue.ref(false)
  let fail = true, saved = 0, navigations = 0
  const { saveDetailed } = sfcBindings('index.vue', ['saveDetailed'], {
    canonicalDraft, saving, form: {}, originalSnapshot: vue.ref({}), sceneRouteKey: vue.ref('scene'),
    hasUnsupportedLegacyAction: () => false, t: key => key, onlyMessage() {},
    mergeDetailedDraft: (_base, scene) => ({ ...scene }),
    persistCanonicalDraft: async () => { if (fail) throw new Error('save failed') },
    leaveGuard: { markSaved: () => saved++ }, menuStore: { jumpPage: () => navigations++ },
  })
  await saveDetailed({ name: '修改后的名称' })
  assert.equal(canonicalDraft.value.name, '原始名称')
  assert.equal(saving.value, false)
  assert.equal(saved, 0)
  assert.equal(navigations, 0)
  fail = false
  await saveDetailed({ name: '修改后的名称' })
  assert.equal(canonicalDraft.value.name, '修改后的名称')
  assert.equal(saved, 1)
  assert.equal(navigations, 1)
})

test('cancelling a newly selected detailed trigger restores the exact draft and clean state', async () => {
  const original = { name: '', trigger: {}, branches: [{ when: [{ terms: [{ value: { source: 'fixed' } }] }], then: [] }], options: {} }
  const data = vue.ref(structuredClone(original)), triggerPending = vue.ref(false)
  const changes = draftHooks().useSceneDraftChanges(() => data.value)
  changes.markClean()
  const methods = sfcBindings('detail/DetailedSceneEditor.vue', ['changeTrigger', 'selectTriggerFromPicker', 'removeTrigger', 'cancelNewTrigger'], {
    data, triggerPending, pendingTriggerSnapshot: undefined, props: { lockedTriggerProviders: [] },
    triggerPickerVisible: vue.ref(true), getDraft: () => JSON.parse(JSON.stringify(data.value)),
    alarmPickerKinds: new Set(['iot-alarm', 'visual-alarm']), nextTick: vue.nextTick,
    findSceneCondition: () => undefined, sceneForm: vue.ref(), timerTriggerRef: vue.ref(), deviceRef: vue.ref(), collectorRef: vue.ref(), saasTriggerRef: vue.ref(),
  })
  await methods.selectTriggerFromPicker('timer')
  assert.deepEqual(data.value.branches[0].when, [])
  assert.equal(changes.dirty.value, true)
  methods.cancelNewTrigger()
  assert.deepEqual(JSON.parse(JSON.stringify(data.value)), original)
  assert.equal(changes.dirty.value, false)
  assert.equal(triggerPending.value, false)
})
