import assert from 'node:assert/strict'
import test from 'node:test'
import { effectScope, ref } from 'vue'
import { resolve } from 'node:path'
import { createMetricLoader, flush, sourceRoot } from './helpers/metricRuntime.mjs'
const load = createMetricLoader({
  '@jetlinks-web/vite/dist/dynamic-remote': { dynamicRemoteManager: {} },
  '@jetlinks-web-core/utils/consts': { isSubApp: false },
  [resolve(sourceRoot, 'components/Metric/api.ts')]: { metricApi: {} },
})
const { moduleRegistry } = load('utils/module-registry.ts')
const { useMetricPresentation } = load('components/Metric/extensions/useMetricPresentation.ts')
const { useMetricEditor } = load('components/Metric/useMetricEditor.ts')
const { useMetricTemplates } = load('components/Metric/template/useMetricTemplates.ts')
const { formatMetricValue } = load('components/Metric/extensions/presentationSettings.ts')
const { metricOutputPresentation } = load('components/Metric/outputPresentation.ts')
const { metricDurationText } = load('components/Metric/presentation.ts')
const template = { id: 'power', version: '1', name: 'Power', outputs: [{ metricId: 'value', unit: 'kW' }], inputDefinitions: [], parameterDefinitions: [{ id: 'factor', expands: { editable: true } }], parameters: { factor: 1 }, definitions: [], options: { presentation: { provider: 'line/status', settings: { decimals: 2, warning: true } } } }
const config = { id: 'c', ownerType: 'line', ownerId: 'a', targetType: 'line', targetId: 'a', slot: 'c', templateId: 'power', templateVersion: '1', inputMappings: {}, parameters: {}, presentation: { decimals: 0, warning: false, unknown: 9 }, state: 'enabled', revision: 2, dataVersion: 'same' }

test('short protocol durations retain millisecond precision without changing stored seconds',()=>{
  const t=(key,{count})=>`${key}:${count}`
  assert.equal(metricDurationText(0.025,'s',t),'intervalMilliseconds:25')
  assert.equal(metricDurationText(0.000025,'s',t),'intervalMilliseconds:0.025')
  assert.equal(metricDurationText(8.6 / 3,'s',t),'intervalSeconds:2.8666667')
  assert.equal(metricDurationText(8600 / 3,'ms',t),'intervalSeconds:2.8666667')
  assert.equal(metricDurationText(8.6 / 180,'min',t),'intervalSeconds:2.8666667')
  assert.equal(metricDurationText(0,'s',t),'intervalSeconds:0')
  assert.equal(metricDurationText(61,'s',t),'intervalMinutes:1 intervalSeconds:1')
})

test('输出语义统一菜单与历史类型，数值状态、条件和持续区间不混用', () => {
  const output = { metricId:'v',valueType:'int' }
  const table = [
    [{...output,metricKind:'state'},'SwitcherOutlined','state'],
    [{...output,valueType:'enum'},'SwitcherOutlined','state'],
    [{...output,valueType:'boolean'},'CheckSquareOutlined','boolean'],
    [{...output,metricKind:'score'},'DashboardOutlined','number'],
    [{...output,unit:'%'},'PercentageOutlined','number'],
    [{...output,unit:'s'},'ClockCircleOutlined','number'],
    [{...output,metricKind:'quantity'},'NumberOutlined','number'],
    [output,'LineChartOutlined','number'],
    [{...output,valueType:'string',unit:'s'},'FontSizeOutlined','records'],
    [{...output,valueType:'object'},'ProfileOutlined','records'],
    [{metricId:'v'},'FileUnknownOutlined','auto'],
  ]
  for (const [definition,icon,history] of table) assert.deepEqual(metricOutputPresentation(definition),{icon,history})
  assert.equal(metricOutputPresentation({...output,options:{readAggregation:{semantic:'state'}}}).history,'state')
  assert.equal(metricOutputPresentation(output,{labels:[{value:1,name:'在线',icon:'img:/online.png'}]}).history,'state')
  const tracked = {...template,definitions:[{id:'v',stateTracking:{}}]}
  assert.deepEqual(metricOutputPresentation(output,{template:tracked}),{icon:'FieldTimeOutlined',history:'interval'})
  assert.equal(metricOutputPresentation(output,{template:{...template,definitions:[{id:'v',temporalCondition:{}}]}}).history,'boolean')
  assert.equal(metricOutputPresentation({...output,label:'在线时长',metricId:'connectionState'}).history,'number','names and IDs do not define semantics')
})

test('score presentation uses a compact default while preserving explicit precision and raw values', () => {
  const score = {metricId:'health',options:{readAggregation:{semantic:'score'}}}
  assert.equal(formatMetricValue(96.66666666,{},score),'96.7')
  assert.equal(formatMetricValue(96.66666666,{decimals:2},score),'96.67')
  assert.equal(formatMetricValue(96.66666666,{decimals:0},score),'97')
  assert.equal(formatMetricValue(0.000001,{}),'0.000001')
})

test('展示解析响应卸载与恢复，缺失提供者保留设置并禁止专用编辑保存', async () => {
  moduleRegistry.clear()
  moduleRegistry.registerResource('line', 'metricPresentations', { status: { label: 'Status', configFields: { render() {} } } })
  let saves = 0
  const scope = effectScope()
  const context = ref({ ownerType: 'line', ownerId: 'a', editable: true })
  const view = scope.run(() => useMetricEditor(context, ref(config), ref(), {
    getConfig: async () => (config),
    selectable: async () => [], resultTemplate(...args) { return this.configTemplate(...args) }, configTemplate: async () => template,
    saveConfig: async value => { saves++; return { ...value, revision: value.revision + 1 } },
  }))
  const presentation = scope.run(() => useMetricPresentation(view.selectedTemplate, view.draft))
  try {
    await flush()
    assert.deepEqual(presentation.settings.value, { decimals: 0, warning: false, unknown: 9 })
    moduleRegistry.unregister('line'); await flush()
    assert.equal(presentation.missing.value, true)
    assert.equal(await view.save(false), undefined)
    assert.equal(saves, 0)
    assert.deepEqual(view.draft.value.presentation, config.presentation)
    moduleRegistry.registerResource('line', 'metricPresentations', { status: { label: 'Status' } }); await flush()
    view.draft.value.presentation = { ...view.draft.value.presentation, decimals: 3 }
    const saved = await view.save(false)
    assert.equal(saved.presentation.decimals, 3)
    assert.equal(saved.dataVersion, 'same')
    context.value.editable = false
    assert.equal(await view.save(false), undefined)
    assert.equal(saves, 1)
  } finally { scope.stop(); moduleRegistry.clear() }
})

test('草稿删除仅允许已保存且未发布；失败保留草稿，成功清理，配置文本保留展示DTO', async () => {
  const entity = { id: 'saved', name: 'Power', released: false, available: false, template }
  let removeFail = true
  const removed = []
  const scope = effectScope()
  const editable = ref(true)
  const view = scope.run(() => useMetricTemplates(editable, {
    queryTemplates: async () => ({ data: [entity], total: 1 }),
    removeTemplate: async id => { removed.push(id); if (removeFail) throw new Error('Template is referenced') },
  }))
  try {
    view.open(); assert.equal(await view.removeDraft(), false)
    view.open({ ...entity, released: true }); assert.equal(await view.removeDraft(), false)
    view.open(entity); view.switchMode('full'); view.switchFormat('json')
    assert.equal(JSON.parse(view.fullText.value).options.presentation.provider, 'line/status')
    view.switchMode('form'); assert.equal(view.draft.value.options.presentation.settings.decimals, 2)
    assert.equal(await view.removeDraft(), false)
    assert.equal(view.selected.value.id, 'saved')
    assert.equal(view.error.value, 'Template is referenced')
    editable.value = false; assert.equal(await view.removeDraft(), false)
    editable.value = true; removeFail = false
    assert.equal(await view.removeDraft(), true)
    assert.equal(view.draft.value, undefined)
    assert.deepEqual(removed, ['saved', 'saved'])
  } finally { scope.stop() }
})

test('配置向导模板切换和来源选择沿用当前草稿；异步来源不回填已切换模板', async () => {
  moduleRegistry.clear()
  const standard = { ...template, options: {}, inputDefinitions: [{ id: 'meter' }] }
  const another = { ...standard, id: 'another', version: '2' }
  const scope = effectScope(); const owner = ref({ ownerType: 'line', ownerId: 'a', editable: true }); let finish
  const picker = ref(async () => ({ mapping: { kind: 'property', id: 'power' }, label: 'Meter' }))
  const view = scope.run(() => useMetricEditor(owner, ref(), picker, { selectable: async () => [standard, another].map(template => ({ id: template.id, template, available: true, released: true })) }))
  try {
    await flush(); view.templateSelection.value = undefined; view.templateSelection.value = 'invalid'
    view.templateSelection.value = JSON.stringify(['power', '1'])
    assert.equal(view.draft.value.templateId, 'power')
    await view.choose(standard.inputDefinitions[0]); assert.equal(view.sourceLabels.value.meter, 'Meter')
    picker.value = () => new Promise(resolve => { finish = resolve })
    const pending = view.choose(standard.inputDefinitions[0])
    view.templateSelection.value = JSON.stringify(['another', '2'])
    finish({ mapping: { kind: 'property', id: 'stale' } }); await pending
    assert.deepEqual(view.draft.value.inputMappings, {})
    picker.value = async () => { throw new Error('Source unavailable') }
    await view.choose(standard.inputDefinitions[0]); assert.equal(view.error.value, 'Source unavailable')
    owner.value.editable = false; await view.choose(standard.inputDefinitions[0]); assert.equal(view.choosing.value, '')
  } finally { scope.stop() }
})

test('模板同一DTO在表单和JSON间往返，发布/新版本/可选性与显式样本试算保持原流程', async () => {
  const standard = { ...template, options: {} }
  let saved; let released = 0; let available; let samples; let failSave = false; let failRelease = false; let failSimulation = false
  const scope = effectScope()
  const view = scope.run(() => useMetricTemplates(ref(true), {
    queryTemplates: async () => ({ data: [], total: 0 }),
    saveTemplate: async value => { if (failSave) throw new Error('Save denied'); saved = value; return { id: 'entity', name: value.name, released: false, available: false, template: value } },
    releaseTemplate: async () => { released++; if (failRelease) throw new Error('Release denied') },
    setAvailable: async (_id, value) => { available = value },
    simulate: async request => { if (failSimulation) throw new Error('Simulation denied'); samples = request; return { status: 'success', results: [{ metricId: 'value', value: 0 }], records: [], recordsTruncated: false } },
  }))
  try {
    view.switchMode('full'); assert.ok(view.error.value)
    view.open({ id: 'entity', name: 'Power', available: false, released: false, template: standard })
    view.draft.value.options.presentation = { provider: 'builtin/default', settings: { decimals: 0, warning: false } }
    assert.equal(view.hasChanges.value, true)
    view.switchMode('full'); view.switchFormat('json'); assert.equal(JSON.parse(view.fullText.value).options.presentation.settings.warning, false)
    view.switchMode('form'); await view.save(); assert.equal(saved.options.presentation.settings.decimals, 0)
    failSave = true; await view.save(); assert.equal(view.error.value, 'Save denied'); failSave = false
    failRelease = true; await view.release(); assert.equal(view.error.value, 'Release denied'); failRelease = false
    await view.release(); assert.equal(released, 2); assert.equal(view.readOnly.value, false, 'published versions allow compatible edits')
    await view.setAvailable(true); assert.equal(available, true)
    view.newVersion(); assert.equal(view.draft.value.version, ''); assert.equal(view.selected.value, undefined)
    await view.simulate(); assert.equal(view.simulationResults.value[0].value, 0); assert.deepEqual(samples.samples, [])
    failSimulation = true; await view.simulate(); assert.equal(view.simulationError.value, 'Simulation denied')
    view.switchMode('full'); view.fullText.value = '['; view.switchMode('form'); assert.ok(view.error.value)
    assert.equal(view.mode.value, 'full'); assert.equal(view.fullText.value, '[')
  } finally { scope.stop() }
})
