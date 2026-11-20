import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import { computed, ref } from 'vue'
import { parse } from 'vue/compiler-sfc'

const base = new URL('../views/', import.meta.url)
function bindings(file, names, context) {
  const { descriptor } = parse(readFileSync(new URL(file, base), 'utf8'))
  const source = ts.createSourceFile(file, descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const declarations = names.map(name => source.statements.find(node =>
    ts.isFunctionDeclaration(node) && node.name?.text === name
    || ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(source) === name)))
  assert.ok(declarations.every(Boolean))
  const code = ts.transpileModule(declarations.map(d => d.getText(source)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function(...Object.keys(context), `${code}; return { ${names.join(',')} }`)(...Object.values(context))
}

test('time condition confirmation rejects empty and partial ranges, accepts overnight and cancellation restores snapshot', () => {
  const original = { type: 'timeRange', ranges: [{ start: '09:00', end: '17:00' }] }
  const props = { condition: structuredClone(original) }, originalCondition = ref(), conditionEditorVisible = ref(false), createdByPicker = ref(false), timeRangeInvalid = ref(false)
  const h = bindings('SceneLinkage/editor/components/SceneConditionRow.vue', ['openEditor', 'saveConditionEditor', 'cancelConditionEditor'], {
    props, originalCondition, conditionEditorVisible, createdByPicker, timeRangeInvalid,
    timeRangeDraft: ref(), timeRangeEditor: ref(), updateTimeRanges: ranges => { props.condition.ranges = ranges },
    update: value => { props.condition = value }, emit() {}, openDeviceEditor() {},
  })
  h.openEditor(); props.condition.ranges = []; h.saveConditionEditor()
  assert.equal(conditionEditorVisible.value, true); assert.equal(timeRangeInvalid.value, true)
  props.condition.ranges = [{ start: '20:00', end: '' }]; h.saveConditionEditor(); assert.equal(conditionEditorVisible.value, true)
  props.condition.ranges = [{ start: '20:00', end: '20:00' }]; h.saveConditionEditor(); assert.equal(conditionEditorVisible.value, true)
  h.cancelConditionEditor(); assert.deepEqual(props.condition, original)
  h.openEditor(); assert.equal(timeRangeInvalid.value, false)
  props.condition.ranges = [{ start: '22:00', end: '06:00' }]; h.saveConditionEditor()
  assert.equal(conditionEditorVisible.value, false); assert.equal(originalCondition.value, undefined)
})

function timeDraft(ranges, editingKey, pending) {
  const props = { modelValue: ranges }, editingRangeKey = ref(editingKey), customRange = ref(pending), events = []
  const draft = bindings('SceneLinkage/editor/components/TimeRangeConditionEditor.vue', [
    'rangeKey', 'isFull', 'isCustomRangeReady', 'isCustomDuplicate', 'pendingRanges', 'getError', 'saveCustomRange', 'cancelCustomRange',
  ], { props, editingRangeKey, customRange, computed, maxRanges: 5, emit: (...event) => events.push(event) })
  return { ...draft, props, editingRangeKey, customRange, events }
}

test('modal confirmation applies a pending custom range without requiring the inline add button', () => {
  const draft = timeDraft([], '__new__', ['09:00', '22:00'])
  const props = { condition: { type: 'timeRange', ranges: [] } }, conditionEditorVisible = ref(true), timeRangeInvalid = ref(false)
  const { saveConditionEditor } = bindings('SceneLinkage/editor/components/SceneConditionRow.vue', ['saveConditionEditor'], {
    props, conditionEditorVisible, timeRangeInvalid, originalCondition: ref({}), createdByPicker: ref(false),
    timeRangeEditor: ref({ getRanges: () => draft.pendingRanges.value }),
    updateTimeRanges: ranges => { props.condition = { ...props.condition, ranges } },
  })
  assert.equal(draft.events.length, 0)
  saveConditionEditor()
  assert.equal(conditionEditorVisible.value, false)
  assert.equal(timeRangeInvalid.value, false)
  assert.deepEqual(props.condition.ranges, [{ start: '09:00', end: '22:00' }])
})

test('pending time ranges replace edits, allow overnight, reject duplicates, equal times and a sixth range', () => {
  const ranges = [{ start: '09:00', end: '18:00' }, { start: '10:00', end: '20:00' }]
  const draft = timeDraft(ranges, '10:00-20:00', ['22:00', '06:00'])
  assert.deepEqual(draft.pendingRanges.value, [ranges[0], { start: '22:00', end: '06:00' }])
  assert.deepEqual(ranges[1], { start: '10:00', end: '20:00' })
  draft.customRange.value = ['09:00', '18:00']
  assert.equal(draft.pendingRanges.value, undefined)
  assert.equal(draft.getError(), 'IotSceneLinkage.message.timeRangeDuplicate')
  draft.customRange.value = ['09:00', '09:00']
  assert.equal(draft.pendingRanges.value, undefined)
  assert.equal(draft.getError(), 'IotSceneLinkage.message.timeRangeInvalid')
  draft.customRange.value = ['09:00', '']
  assert.equal(draft.pendingRanges.value, undefined)
  draft.cancelCustomRange()
  assert.strictEqual(draft.pendingRanges.value, ranges)
  const full = timeDraft(Array.from({ length: 5 }, (_, i) => ({ start: `0${i}:00`, end: `0${i}:30` })), '__new__', ['22:00', '06:00'])
  assert.equal(full.pendingRanges.value, undefined)
})

test('action insertion accepts providers without optional columns metadata and releases the add dialog', () => {
  const visible = ref(true), events = []
  const h = bindings('Scene/Save/action/ListItem/List.vue', ['onSave', 'onCancel'], { visible, emit: (...args) => events.push(args) })
  h.onSave({ type: 'alarm-record-query', executor: 'alarm-record-query', key: 'a', actionId: 1, configuration: { alarmConfigId: 'rule' } })
  assert.equal(visible.value, false); assert.equal(events.length, 1)
  assert.deepEqual(events[0][1].options.columns, []); assert.equal(events[0][1].configuration.alarmConfigId, 'rule')
  visible.value = true; h.onCancel(); assert.equal(visible.value, false)
})

test('alarm query draft confirmation preserves provider-specific configuration and source metadata', () => {
  const events = [], draft = ref({ sourceKind: 'visual-ai', alarmConfigId: 'rule', options: { alarmConfigName: '入侵告警', sceneId: 'scene', taskTarget: 'target' } })
  const h = bindings('Scene/Save/action/AlarmRecordQuery/index.vue', ['save'], { draft, emit: (...args) => events.push(args) })
  h.save(); assert.deepEqual(events[0][1], { alarmConfigId: 'rule', targetType: 'aiTaskMediaTarget' })
  assert.equal(events[0][2].name, '入侵告警'); assert.equal(events[0][2].sceneId, 'scene')
  draft.value = { sourceKind: 'iot-device', alarmConfigId: 'iot', options: { productId: 'p', deviceId: 'd' } }
  h.save(); assert.deepEqual(events[1][1], { alarmConfigId: 'iot', targetType: 'device', productId: 'p', deviceId: 'd' })
})

test('delay confirmation rejects cleared or out-of-range inputs and only persists an integer duration', () => {
  const _value = ref(null), unit = ref('seconds'), events = [], submitted = ref(false)
  const h = bindings('Scene/Save/action/Delay/index.vue', ['onOk'], { _value, unit, submitted, emit: (...args) => events.push(args), $t: key => key, timeUnitEnum: { seconds: '秒' } })
  for (const value of [null, 0, -1, 65536, 1.5]) { _value.value = value; h.onOk() }
  assert.equal(events.length, 0); assert.equal(submitted.value, true)
  _value.value = 60; h.onOk(); assert.deepEqual(events[0][1], { time: 60, unit: 'seconds' })
})

for (const [file, formName] of [['WriteProperty', 'writeForm'], ['InvokeFunction', 'invokeForm']]) {
  test(`${file} parameter validation rejects promptly and permits correction`, async () => {
    const fieldForm = ref({ validateFields: async () => ({ reportKey: 'p', functionId: 'f' }) })
    let invalid = true
    const functionRef = ref({ validate: async () => { if (invalid) throw new Error('required'); return [{ id: 'p', value: 10 }] } })
    const { descriptor } = parse(readFileSync(new URL(`Scene/Save/Device/${file}.vue`, base), 'utf8'))
    const source = ts.createSourceFile(file, descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const expose = source.statements.find(node => ts.isExpressionStatement(node) && node.expression.expression?.getText(source) === 'defineExpose')
    const code = ts.transpileModule(expose.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
    let exposed
    new Function('defineExpose', formName, 'functionRef', 'formModel', 'isEmpty', code)(value => { exposed = value }, fieldForm, functionRef, { reportKey: 'p' }, row => row.value != null)
    await assert.rejects(exposed.validateFields(), /required/)
    invalid = false
    const result = await exposed.validateFields()
    assert.equal(file === 'WriteProperty' ? result.data.p : result.functionData[0].value, 10)
  })
}
