import assert from 'node:assert/strict'
import test from 'node:test'
import { effectScope, ref, reactive, h, toRef } from 'vue'
import { resolve } from 'node:path'
import { createMetricLoader, createMetricRenderer, walk, flush, sourceRoot, passthrough, textContent } from './helpers/metricRuntime.mjs'

const load = createMetricLoader({ 'vue-i18n': { useI18n: () => ({ t: key => key }) }, [resolve(sourceRoot, 'components/Metric/api.ts')]: { metricApi: {} } })
const { calculationFields, calculationKind, windowFields, durationSeconds } = load('components/Metric/template/window.ts')
const { addSimulationSample, patchSimulationSample, visualSamples, simulationRange, sampleInput, sampleDate } = load('components/Metric/template/simulation.ts')
const { useMetricTemplates } = load('components/Metric/template/useMetricTemplates.ts')
const { useTemplateSimulation } = load('components/Metric/template/useTemplateSimulation.ts')
function trialState(props) {
  return useTemplateSimulation({ ...Object.fromEntries(['template','text','format','results','response','loading'].map(key => [key,toRef(props,key)])), invalidate:() => { props.response = undefined; props.results = [] } })
}
const { simulationTimes, simulationSteps, simulationResultCells, simulationOperation } = load('components/Metric/template/simulationFlow.ts')
const { expressionLabel } = load('components/Metric/template/designer.ts')
const response = results => ({ status: 'success', results, records: [], recordsTruncated: false })

test('试算失败保留真实部分结果和记录；修改配置同时清除两者', async () => {
  const scope = effectScope(); let sent
  const record = { id: 'node-1', action: 'metric.node', attributes: { definitionId: 'average', state: 'produced' } }
  const view = scope.run(() => useMetricTemplates(ref(true), { simulate: async request => {
    sent = request
    return { ...response([{ metricId: 'average', value: 0 }]), status: 'failed', records: [record], recordsTruncated: true, error: 'calculation failed' }
  } }))
  try {
    view.open({ id: 'e', template: template() }); view.switchFormat('json')
    const facts = JSON.parse(view.simulationText.value); facts.endAt = 10000; facts.custom = false
    view.simulationText.value = JSON.stringify(facts); await view.simulate()
    assert.equal(sent.endAt, 10000); assert.equal(sent.custom, false); assert.equal(sent.includeRecords, true)
    assert.equal(view.simulationError.value, 'calculation failed'); assert.equal(view.simulationResults.value[0].value, 0)
    assert.equal(view.simulationResponse.value.records[0].id, 'node-1'); assert.equal(view.simulationResponse.value.recordsTruncated, true)
    view.simulationText.value += '\n'; assert.equal(view.simulationResponse.value, undefined); assert.deepEqual(view.simulationResults.value, [])
  } finally { scope.stop() }
})

test('执行详情使用结果序号与父子ID，同刻相同值也不能混用输入', () => {
  const { simulationProcessForResult, simulationRecordCells } = load('components/Metric/template/simulationFlow.ts')
  const records = [
    { id: 'a', action: 'metric.node', attributes: { definitionId: 'average', evaluationTime: 1000, state: 'skipped' } },
    { id: 'b', action: 'metric.node', attributes: { definitionId: 'average', evaluationTime: 1000, state: 'skipped' } },
    { id: 'out-b', parentId: 'b', action: 'metric.output', attributes: { resultIndex: 0 } },
    { id: 'out-a', parentId: 'a', action: 'metric.output', attributes: { resultIndex: 1 } },
  ]
  assert.equal(simulationProcessForResult(records, 0).node.id, 'b'); assert.equal(simulationProcessForResult(records, 1).node.id, 'a')
  assert.equal(simulationProcessForResult(records, 0).output.id, 'out-b')
  const cells = simulationRecordCells(records.slice(0, 2), new Map([[1000, 2]]))
  assert.equal(cells.length, 1); assert.equal(cells[0].values.length, 2)
  assert.equal(simulationProcessForResult(records, 2), undefined)
})

test('窗口族详情跟随具体输出的参与数量；本轮读取不冒充窗口全部数据', async () => {
  const flowLoad = createMetricLoader({
    'vue-i18n': { useI18n: () => ({ t: (key, values) => key + (values?.count === undefined ? '' : ':' + values.count) }) },
    [resolve(sourceRoot, 'components/Metric/MetricValue.vue')]: { default: passthrough('metric-value-stub'), __esModule: true },
    [resolve(sourceRoot, 'components/Metric/MetricTrend.vue')]: { default: passthrough('metric-trend-stub'), __esModule: true },
  })
  const Detail = flowLoad('components/Metric/template/TemplateSimulationDetail.vue').default
  const { simulationIndex, simulationNodeAt } = flowLoad('components/Metric/template/simulationPreview.ts')
  const value = template()
  value.definitions = [{ id: 'stats', sourceMetric: 'reading', dependsOn: ['reading'], windowFamily: { ranges: [{ mode: 'time', size: 'PT15M', outputs: [{ id: 'mean', aggregation: 'avg' }, { id: 'peak', aggregation: 'max' }] }] } }]
  const results = [{ metricId: 'mean', value: 100, evaluationTime: 1000, quality: { attributes: { actualCount: 8 } } }, { metricId: 'peak', value: 130, evaluationTime: 2000, quality: { attributes: { actualCount: 3 } } }]
  const records = [{ id: 'node', action: 'metric.node', attributes: { definitionId: 'stats', state: 'produced', evaluationTime: 2000, inputs: [{ id: 'reading', count: 1, value: 70 }] } },
    ...results.map((item, index) => ({ id: 'out-' + index, parentId: 'node', action: 'metric.output', attributes: { evaluationTime: item.evaluationTime, resultIndex: index } }))]
  const selected = { kind:'rule', index:0 }
  const index = simulationIndex(value, undefined, results, { ...response(results), records })
  const props = reactive({ template: value, results, selected, snapshot:simulationNodeAt(index, selected, 1000), time:1000 })
  const { renderer, root } = createMetricRenderer()
  const app = renderer.createApp({ setup: () => () => h(Detail, props) }); app.config.warnHandler = () => {}; app.mount(root)
  try {
    assert.match(textContent(root), /participatingSampleCount:8/)
    // 步骤取值已统一到图节点浮层；旧记录没有 execution 时不在结果摘要重建过程。
    assert.match(textContent(root), /processUnavailable/)
    assert.doesNotMatch(textContent(root), /currentReads|inputSampleCount:/)
    props.snapshot = simulationNodeAt(index, selected, 2000); props.time = 2000; await flush()
    assert.match(textContent(root), /participatingSampleCount:3/)
    assert.doesNotMatch(textContent(root), /participatingSampleCount:8/)
    props.results = []; props.snapshot = undefined; await flush()
    assert.doesNotMatch(textContent(root), /participatingSampleCount:/)
  } finally { app.unmount() }
})

test('观察截止点原位编辑、清空与JSON/YAML无损保留扩展', async () => {
  const Simulation = load('components/Metric/template/TemplateSimulation.vue').default
  const { renderer, root } = createMetricRenderer()
  const source = { ...facts(), custom: false, samples: [] }
  const props = reactive({ template: template(), text: JSON.stringify(source), format: 'json', results: [], loading: false, error: '',
    'onUpdate:text': text => { props.text = text } })
  const app = renderer.createApp({ setup: () => { const trial = trialState(props); return () => h(Simulation, {template:props.template,trial}) } }); app.component('a-popover', passthrough('test-popover')); app.config.warnHandler = () => {}; app.mount(root)
  try {
    const input = () => walk(root, node => node.type === 'a-input' && node.props['aria-label'] === 'observeUntil')[0]
    input().props.onChange({ target: { value: '2026-11-02T10:30:00' } }); await flush()
    assert.equal(JSON.parse(props.text).endAt, new Date('2026-11-02T10:30:00').getTime()); assert.equal(JSON.parse(props.text).custom, false)
    const { configurationObject, encodeConfiguration } = load('components/Metric/template/configurationText.ts')
    props.text = encodeConfiguration(JSON.parse(props.text), 'yaml'); props.format = 'yaml'; await flush()
    assert.equal(configurationObject(props.text, 'yaml').endAt, new Date('2026-11-02T10:30:00').getTime())
    input().props.onChange({ target: { value: '' } }); await flush()
    assert.equal(configurationObject(props.text, 'yaml').endAt, undefined); assert.equal(configurationObject(props.text, 'yaml').custom, false)
  } finally { app.unmount() }
})
const template = () => ({ id: 'power', version: '1', name: '平均功率',
  inputDefinitions: [{ id: 'reading', name: '有功功率', unit: 'kW', maxAge: 'PT3M' }], parameterDefinitions: [], parameters: {},
  definitions: [{ id: 'average', ...calculationFields('statistics'), sourceMetric: 'reading', dependsOn: ['reading'] }], outputs: [{ metricId: 'average', unit: 'kW' }] })
const facts = () => ({ configuration: { ownerType: 'simulation', ownerId: 'simulation', slot: 'simulation', targetType: 'simulation', targetId: 'simulation', templateId: 'power', templateVersion: '1', state: 'disabled', revision: 0, inputMappings: {}, parameters: {} }, samples: [] })

test('计算方式切换清理互斥设置；窗口范围保持未知扩展且不残留定时策略', () => {
  for (const kind of ['expression', 'statistics', 'temporal', 'calculator']) {
    const rule = { id: 'r', dependsOn: ['x'], custom: false, ...calculationFields(kind) }
    assert.equal(calculationKind(rule), kind); assert.equal(rule.custom, false)
    if (kind !== 'statistics') assert.equal(rule.aggregation, undefined)
  }
  const next = windowFields({ mode: 'time', size: 'PT1H', emitPolicy: 'onSchedule', emitInterval: 'PT1M', step: 'PT1M', custom: false }, 'latestN')
  assert.equal(next.size, '5'); assert.equal(next.emitPolicy, 'onEvent'); assert.equal(next.emitInterval, undefined); assert.equal(next.step, undefined); assert.equal(next.custom, false)
  assert.equal(windowFields(next, 'none').size, undefined)
  assert.equal(durationSeconds('PT15M'), 900); assert.equal(durationSeconds('P1DT2H'), 93600); assert.equal(durationSeconds('PT0.5S'), .5)
  assert.equal(durationSeconds('15m'), undefined); assert.equal(durationSeconds('P'), undefined)
})

test('简易样本按输入自动绑定独立模拟来源，完整保留配置和样本元数据', () => {
  const value = template(); value.inputDefinitions.push({ id: 'ambient', valueType: { type: 'boolean' } })
  let current = { ...facts(), custom: false }
  current = addSimulationSample(value, current, 'reading', 1000); current = addSimulationSample(value, current, 'ambient', 2000)
  assert.equal(current.samples[0].value, null, 'an empty editor is not a measured zero')
  assert.equal(current.samples[1].value, null, 'boolean input also requires an explicit choice')
  current = patchSimulationSample(current, 1, { value: false })
  current.samples[0].tags = { provenance: 'original' }; current.samples[0].ingestTime = 1100; current.samples[0].processTime = 1200
  const updated = patchSimulationSample(current, 0, { eventTime: 3000, value: 0 })
  assert.equal(updated.custom, false); assert.equal(updated.samples[0].value, 0); assert.equal(updated.samples[1].value, false)
  assert.equal(updated.samples[0].ingestTime, 3100); assert.equal(updated.samples[0].processTime, 3200)
  assert.deepEqual(updated.samples[0].tags, { provenance: 'original' }); assert.equal(current.samples[0].eventTime, 1000)
  assert.equal(sampleInput(value, updated, updated.samples[1]), 'ambient'); assert.equal(visualSamples(value, updated), true)
  const unknown = structuredClone(updated); unknown.samples[0].thingId = 'other'; assert.equal(visualSamples(value, unknown), false)
  const shared = structuredClone(updated); shared.configuration.inputMappings.ambient = shared.configuration.inputMappings.reading
  assert.equal(visualSamples(value, shared), false)
  assert.equal(new Date(sampleDate(3000)).getTime(), 3000)
})

test('15分钟、5分钟、最近N条范围预览按来源和时间选择，不混入其它输入', () => {
  const value = template(); let current = facts()
  const minutes = [8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30]
  for (const minute of minutes) current = addSimulationSample(value, current, 'reading', minute * 60000)
  const rule = value.definitions[0]
  let preview = simulationRange(value, current, rule)
  assert.equal(preview.start, 15 * 60000); assert.equal(preview.lanes[0].points.filter(point => point.selected).length, 8)
  preview = simulationRange(value, current, { ...rule, window: { mode: 'time', size: 'PT5M' } })
  assert.equal(preview.lanes[0].points.filter(point => point.selected).length, 3)
  preview = simulationRange(value, current, { ...rule, window: { mode: 'latestN', size: '3' } })
  assert.equal(preview.start, 26 * 60000); assert.equal(preview.end, 30 * 60000)
  assert.equal(preview.lanes[0].points.filter(point => point.selected).length, 3)
  assert.equal(simulationRange(value, facts(), rule), undefined)
  preview = simulationRange(value, current, { ...rule, sourceMetric: 'derived', dependsOn: ['derived'] })
  assert.equal(preview.lanes[0].points.some(point => point.selected), false, 'derived calculations do not invent participating samples')
})

test('可视配置和合成样本组成真实试算契约；只展示API返回的质量与结果', async () => {
  const scope = effectScope(); let request
  const view = scope.run(() => useMetricTemplates(ref(true), { simulate: async value => { request = value; return response([{ metricId: 'average', value: 100, quality: { valid: true }, inputTimeStart: 16 * 60000, inputTimeEnd: 30 * 60000 }]) } }))
  try {
    view.open({ id: 'entity', template: template(), released: false }); view.switchFormat('json')
    let current = JSON.parse(view.simulationText.value)
    for (const minute of [16, 18, 20, 22, 24, 26, 28, 30]) current = addSimulationSample(view.draft.value, current, 'reading', minute * 60000)
    view.simulationText.value = JSON.stringify(current); await view.simulate()
    assert.equal(request.template.definitions[0].window.size, 'PT15M'); assert.equal(request.template.definitions[0].window.emitPolicy, 'onEvent')
    assert.equal(request.includeIntermediate, true)
    assert.equal(request.includeRecords, true)
    assert.equal(request.samples.length, 8); assert.equal(request.configuration.inputMappings.reading.thingType, 'device')
    assert.equal(request.samples[0].metricId, request.configuration.inputMappings.reading.id)
    assert.equal(view.simulationResults.value[0].value, 100)
    view.draft.value.definitions[0].window.size = 'PT5M'; assert.deepEqual(view.simulationResults.value, [])
    await view.simulate(); assert.equal(view.simulationResults.value.length, 1)
    view.invalidateSimulation(); assert.deepEqual(view.simulationResults.value, [])
  } finally { scope.stop() }
})

test('真实样本组件逐行保留时间错误；修正其它行不能放行，删除坏行可恢复', async () => {
  const Editor = load('components/Metric/template/TemplateSampleEditor.vue').default
  const { renderer, root } = createMetricRenderer(); const value = template(); const invalid = []
  const data = addSimulationSample(value, addSimulationSample(value, facts(), 'reading', 1000), 'reading', 2000)
  data.samples.forEach(sample => { sample.value = 0 })
  const props = reactive({ template: value, facts: data, loading: false,
    onChange: next => { props.facts = next }, onInvalid: next => invalid.push(next) })
  const app = renderer.createApp({ setup: () => () => h(Editor, props) }); app.component('a-popover', passthrough('test-popover')); app.config.warnHandler = () => {}; app.mount(root)
  const fields = () => walk(root, n => n.type === 'a-input' && n.props.type === 'datetime-local')
  try {
    fields()[0].props.onChange({target:{value:''}}); fields()[1].props.onChange({target:{value:''}}); await flush()
    assert.equal(invalid.at(-1), true); assert.equal(props.facts.samples[0].eventTime, 1000)
    fields()[1].props.onChange({target:{value:sampleDate(3000)}}); await flush(); assert.equal(invalid.at(-1), true)
    walk(root, n => n.type === 'a-button' && n.props['aria-label'] === 'removeSample')[0].props.onClick(); await flush()
    assert.equal(invalid.at(-1), false); assert.equal(props.facts.samples.length, 1)
    props.loading = true; await flush()
    const original = JSON.stringify(props.facts)
    fields()[0].props.onChange({target:{value:sampleDate(4000)}}); await flush(); assert.equal(JSON.stringify(props.facts), original)
    assert.equal(walk(root, n => n.props.inert === true).length, 1)
  } finally { app.unmount() }
})

test('时长组件按分钟读写并保留自定义格式，切换单位保持输入数量', async () => {
  const Duration = load('components/Metric/template/TemplateDuration.vue').default
  const { renderer, root } = createMetricRenderer(); const props = reactive({ modelValue: 'PT15M', 'onUpdate:modelValue': value => { props.modelValue = value } })
  const app = renderer.createApp({ setup: () => () => h(Duration, props) }); app.config.warnHandler = () => {}; app.mount(root)
  try {
    const field = type => walk(root, n => n.type === 'external-shell' && n.props.type === type)[0]
    assert.equal(field('number').props.value, 15)
    field('number').props.onChange(5); await flush(); assert.equal(props.modelValue, 'PT300S')
    field('select').props.onChange(3600); await flush(); assert.equal(props.modelValue, 'PT18000S')
    props.modelValue = '15m'; await flush(); assert.equal(walk(root, n => n.type === 'a-input')[0].props.value, '15m')
  } finally { app.unmount() }
})

test('布尔数据点初始留空，显式选择false后才变为有效样本', async () => {
  const Editor = load('components/Metric/template/TemplateSampleEditor.vue').default
  const { renderer, root } = createMetricRenderer(); const value = template(); const invalid = []
  value.inputDefinitions[0].valueType = { type: 'boolean' }
  const props = reactive({ template: value, facts: addSimulationSample(value, facts(), 'reading', 1000),
    onChange: next => { props.facts = next }, onInvalid: next => invalid.push(next) })
  const app = renderer.createApp({ setup: () => () => h(Editor, props) }); app.component('a-popover', passthrough('test-popover')); app.config.warnHandler = () => {}; app.mount(root)
  try {
    assert.equal(invalid.at(-1), true)
    const select = () => walk(root, node => node.type === 'external-shell' && node.props.type === 'select')[0]
    assert.equal(select().props.value, undefined)
    select().props.onChange('false'); await flush()
    assert.equal(props.facts.samples[0].value, false); assert.equal(select().props.value, 'false'); assert.equal(invalid.at(-1), false)
  } finally { app.unmount() }
})

test('高级配置语法未完成时保留编辑器，修正后可返回图例', async () => {
  const Simulation = load('components/Metric/template/TemplateSimulation.vue').default
  const { renderer, root } = createMetricRenderer()
  const props = reactive({ template: template(), text: JSON.stringify(facts()), format: 'json', results: [], loading: false, error: '' })
  const app = renderer.createApp({ setup: () => { const trial = trialState(props); return () => h(Simulation, {template:props.template,trial}) } }); app.config.warnHandler = () => {}; app.mount(root)
  const toggle = () => walk(root, node => node.type === 'a-button' && node.props['aria-pressed'] !== undefined)[0]
  try {
    toggle().props.onClick(); await flush(); assert.equal(toggle().props['aria-pressed'], true)
    props.text = '{'; await flush()
    assert.equal(toggle().props.disabled, true); assert.equal(toggle().props['aria-pressed'], true)
    assert.equal(walk(root, node => node.props.class === 'template-simulation__advanced').length, 1)
    props.text = JSON.stringify(facts()); await flush(); assert.equal(toggle().props.disabled, false)
    toggle().props.onClick(); await flush(); assert.equal(toggle().props['aria-pressed'], false)
  } finally { app.unmount() }
})

test('融合面板切换节点保留未完成的时间编辑，修正后才允许试算', async () => {
  const Simulation = load('components/Metric/template/TemplateSimulation.vue').default
  const { renderer, root } = createMetricRenderer()
  const value = template()
  const samples = patchSimulationSample(addSimulationSample(value, facts(), 'reading', 1000), 0, {value:0})
  const props = reactive({ template:value, text:JSON.stringify(samples), format:'json', results:[], loading:false, selected:{kind:'input',index:0} })
  let trial
  const app = renderer.createApp({ setup:() => { trial = trialState(props); return () => h(Simulation,{template:props.template,trial,selected:props.selected}) } })
  app.component('a-popover',passthrough('test-popover')); app.config.warnHandler = () => {}; app.mount(root)
  const inputTime = () => walk(root,node => node.type === 'a-input' && node.props['aria-label'] === '有功功率 · sampleTime')[0]
  try {
    inputTime().props.onChange({target:{value:''}}); await flush(); assert.equal(trial.invalid,true)
    props.selected = {kind:'rule',index:0}; await flush()
    assert.equal(trial.invalid,true); assert.equal(trial.facts.samples[0].value,0)
    assert.equal(walk(root,node => node.type === 'details' && node.props.class === 'template-simulation__samples')[0].props.open,true)
    props.selected = {kind:'input',index:0}; await flush(); assert.equal(trial.invalid,true)
    inputTime().props.onChange({target:{value:sampleDate(2000)}}); await flush()
    assert.equal(trial.invalid,false); assert.equal(trial.facts.samples[0].eventTime,2000)
  } finally { app.unmount() }
})

test('时序流程按实际依赖排序；异步输入和同一时刻多个结果分别保留', () => {
  const value = template()
  value.definitions.unshift({ id: 'scaled', expression: 'average * 1.1', dependsOn: ['average'] })
  value.outputs = [{ metricId: 'scaled', label: '平均功率', unit: 'kW' }]
  const results = [{ metricId: 'scaled', value: 110, eventTime: 1000, evaluationTime: 2000 }, { metricId: 'scaled', value: 121, eventTime: 1000, evaluationTime: 2000 }, { metricId: 'average', value: 100, evaluationTime: 2000 }]
  const times = simulationTimes([{ eventTime: 1000 }, { eventTime: 1500 }], results)
  assert.deepEqual(times, [1000, 1500, 2000])
  const steps = simulationSteps(value, results)
  assert.deepEqual(steps.map(step => step.id), ['average', 'scaled'])
  assert.deepEqual(steps[1].dependencies, ['average']); assert.equal(steps[1].output.label, '平均功率')
  const cells = simulationResultCells(steps[1].values, new Map(times.map((time, index) => [time, index + 2])))
  assert.equal(cells.length, 1); assert.equal(cells[0].column, 4); assert.deepEqual(cells[0].values.map(item => item.value.value), [110, 121])
  assert.deepEqual(simulationSteps(value, [])[0].values, [], 'no intermediate values are calculated in the browser')
  assert.match(simulationOperation(value.definitions[1], key => key), /15 minutes.*avg/)
})

test('窗口族展开真实输出；参数和无#别名显示业务名称但字符串及对象属性保持原文', () => {
  const value = template()
  value.definitions = [{ id: 'stats', sourceMetric: 'reading', windowFamily: { ranges: [{ mode: 'time', size: 'PT5M', outputs: [{ id: 'mean', aggregation: 'avg' }, { id: 'peak', aggregation: 'max' }] }] } }]
  assert.deepEqual(simulationSteps(value, []).map(step => [step.id, step.rule.window.size, step.rule.aggregation]), [['mean', 'PT5M', 'avg'], ['peak', 'PT5M', 'max']])
  value.parameterDefinitions = [{ id: 'factor', name: '修正系数' }, { id: "factor-'key", name: '特殊参数' }]
  assert.equal(expressionLabel(value, "reading * params.factor + #reading + params['factor-''key'] + 'reading' + other.reading"), "有功功率 * 修正系数 + 有功功率 + 特殊参数 + 'reading' + other.reading")
})
