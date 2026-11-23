import assert from 'node:assert/strict'
import test from 'node:test'
import { h, reactive, ref, toRef, watch } from 'vue'
import { resolve } from 'node:path'
import { createMetricLoader, createMetricRenderer, walk, flush, textContent, sourceRoot, passthrough } from './helpers/metricRuntime.mjs'

const load = createMetricLoader({
  'vue-i18n': { useI18n: () => ({ t:key => key, locale:ref('zh') }) },
  [resolve(sourceRoot, 'components/Metric/MetricTrend.vue')]: { default:passthrough('trend-stub'), __esModule:true },
})
const { simulationIndex, simulationNodeAt, simulationUnit } = load('components/Metric/template/simulationPreview.ts')
const { addSimulationSample, patchSimulationSample, sampleExecutionTime } = load('components/Metric/template/simulation.ts')
const {sampleInputs}=load('components/Metric/template/simulation.ts')

test('通用来源样本保留引用并隔离同名属性和其他业务配置',()=>{
  const value=template()
  const reference={provider:'objects',sourceType:'query',configuration:{parameters:{zone:'A'}}}
  const config={targetType:'device',targetId:'sample',inputMappings:{power:{kind:'provider',id:'reading',providerSource:reference}}}
  const facts=addSimulationSample(value,{configuration:config,samples:[]},'power',1000)
  const sample=facts.samples[0]
  assert.equal(sample.sourceKind,'provider');assert.deepEqual(sample.providerSource,reference)
  assert.deepEqual(sampleInputs(value,facts,sample),['power'])
  assert.deepEqual(sampleInputs(value,facts,{...sample,providerSource:{...reference,configuration:{parameters:{zone:'B'}}}}),[])
  assert.deepEqual(sampleInputs(value,facts,{...sample,sourceKind:'property'}),[])
})
const template = () => ({ id:'power', version:'1', name:'平均功率', parameterDefinitions:[], parameters:{},
  inputDefinitions:[{ id:'power', name:'功率', unit:'kW', valueType:{ type:'double' } }],
  definitions:[{ id:'mean', name:'平均功率', type:'feature', sourceMetric:'power', aggregation:'avg', window:{ mode:'time', size:'PT15M' } }, { id:'high', name:'功率偏高', expression:'mean > 105', dependsOn:['mean'] }],
  outputs:[{ metricId:'high', label:'功率偏高' }] })
const facts = value => {
  let result = { configuration:{ targetType:'device', targetId:'sample', inputMappings:{} }, samples:[], custom:false }
  for (const [time, reading] of [[60_000,80], [300_000,100], [600_000,120], [840_000,140]]) {
    result = addSimulationSample(value, result, 'power', time)
    result = patchSimulationSample(result, result.samples.length - 1, { value:reading })
  }
  return result
}
const response = (results = [], records = []) => ({ status:'success', results, records, recordsTruncated:false })
const node = (id, definitionId, evaluationTime, fields = {}) => ({ id, action:'metric.node', attributes:{ definitionId, evaluationTime, ...fields } })
const output = (id, parentId, resultIndex) => ({ id, parentId, action:'metric.output', attributes:{ resultIndex } })

test('图上游标不读取未来；均值、判断和注入样本分别使用原始身份与时间', () => {
  const value = template(), samples = facts(value)
  const results = [{ metricId:'mean', value:100, evaluationTime:600_000 }, { metricId:'high', value:false, evaluationTime:600_000 }, { metricId:'mean', value:110, evaluationTime:840_000 }, { metricId:'high', value:true, evaluationTime:840_000 }]
  const records = results.flatMap((item, index) => [node('n'+index, item.metricId, item.evaluationTime, { state:'produced' }), output('o'+index, 'n'+index, index)])
  const index = simulationIndex(value, samples, results, response(results, records))
  assert.deepEqual(index.times, [60_000,300_000,600_000,840_000])
  assert.equal(simulationNodeAt(index, { kind:'rule', index:0 }, 300_000).entry, undefined)
  const atTen = simulationNodeAt(index, { kind:'rule', index:0 }, 600_000)
  assert.equal(atTen.entry.value, results[0]); assert.equal(atTen.entry.record, records[0]); assert.equal(atTen.previous, false)
  assert.equal(simulationNodeAt(index, { kind:'rule', index:1 }, 600_000).entry.value.value, false)
  assert.equal(simulationNodeAt(index, { kind:'output', index:0 }, 840_000).entry.value.value, true)
  assert.equal(simulationNodeAt(index, { kind:'input', index:0 }, 600_000).entry.sample, samples.samples[2])
  assert.equal(simulationNodeAt(index, { kind:'rule', index:0 }, 700_000).previous, true)
})

test('样本推进时刻优先process、再ingest、再event；同刻多来源与重复样本不覆盖', () => {
  assert.equal(sampleExecutionTime({ processTime:3000, ingestTime:2000, eventTime:1000 }), 3000)
  assert.equal(sampleExecutionTime({ processTime:0, ingestTime:2000, eventTime:1000 }), 2000)
  assert.equal(sampleExecutionTime({ processTime:-1, ingestTime:0, eventTime:1000 }), 1000)
  const value = template(); value.inputDefinitions.push({ id:'ambient', valueType:{ type:'boolean' } })
  let samples = facts(value)
  samples = addSimulationSample(value, samples, 'ambient', 840_000)
  samples = patchSimulationSample(samples, 4, { value:false })
  samples = addSimulationSample(value, samples, 'power', 840_000)
  samples = patchSimulationSample(samples, 5, { value:0 })
  samples.samples[0].processTime = 120_000
  const index = simulationIndex(value, samples, [], response())
  assert.equal(index.times.includes(60_000), false)
  assert.equal(index.times.includes(120_000), true)
  assert.equal(simulationNodeAt(index, { kind:'input', index:0 }, 840_000).alternatives.length, 2)
  assert.equal(simulationNodeAt(index, { kind:'input', index:0 }, 840_000).entry.sample.value, 0)
  assert.equal(simulationNodeAt(index, { kind:'input', index:1 }, 840_000).entry.sample.value, false)
})

test('同刻窗口族结果、跳过与错误按响应顺序保留；无效结果不能回退有效值', () => {
  const value = template()
  value.definitions = [{ id:'statistics', windowFamily:{ ranges:[{ outputs:[{ id:'mean' },{ id:'peak' }] }] } }]
  value.outputs = [{ metricId:'peak' }]
  const results = [{ metricId:'mean', value:100, evaluationTime:1000 }, { metricId:'peak', value:130, evaluationTime:1000 }, { metricId:'peak', value:null, status:'invalid', evaluationTime:2000 }]
  const records = [node('skip','statistics',1000,{ state:'skipped' }), output('o0','stats',0), output('o1','stats',1), node('stats','statistics',1000,{ state:'produced' }), node('none','statistics',1500,{ state:'noOutput' }), output('o2','bad',2), { ...node('bad','statistics',2000), hasError:true, errorDetail:'bad reading' }]
  const index = simulationIndex(value, undefined, results, response(results, records))
  const selected = { kind:'rule', index:0 }
  const first = simulationNodeAt(index, selected, 1000)
  assert.deepEqual(first.alternatives.map(entry => entry.key), ['record-skip','result-0','result-1'])
  assert.equal(first.entry.value, results[1]); assert.equal(first.entry.record.id, 'stats')
  assert.equal(simulationNodeAt(index, selected, 1000, 'result-0').entry.value, results[0])
  assert.equal(simulationNodeAt(index, selected, 1500).state, 'stepNoResult')
  assert.equal(simulationNodeAt(index, selected, 2000).state, 'calculationFailed')
  assert.equal(simulationNodeAt(index, { kind:'output', index:0 }, 2500).entry.value, results[2])
})

test('缺记录与截断保持不确定；同刻记录不会被猜测为结果的父节点', () => {
  const value = template()
  const result = { metricId:'mean', value:0, evaluationTime:1000 }
  const unlinked = node('unlinked','mean',1000,{ state:'skipped' })
  const index = simulationIndex(value, undefined, [result], response([result],[unlinked]))
  const snapshot = simulationNodeAt(index, { kind:'rule', index:0 }, 1000)
  assert.equal(snapshot.entry.value, result); assert.equal(snapshot.entry.record, undefined)
  assert.equal(snapshot.alternatives[0].record, unlinked)
  assert.equal(simulationNodeAt(index, { kind:'rule', index:1 }, 1000).state, 'notExecuted')
  index.response.recordsTruncated = true
  assert.equal(simulationNodeAt(index, { kind:'rule', index:1 }, 1000).state, 'processUnavailable')
})

test('同刻产出后的重复跳过不遮挡计算结果；显式过程选择和后续失败仍保持真实', () => {
  const value = template()
  const result = { metricId:'mean', value:60, evaluationTime:1000 }
  const records = [node('produced','mean',1000,{ state:'produced' }), output('out','produced',0),
    node('duplicate','mean',1000,{ state:'skipped' }), node('later-skip','mean',2000,{ state:'skipped' })]
  const index = simulationIndex(value, undefined, [result], response([result],records))
  const selected = { kind:'rule', index:0 }
  assert.equal(simulationNodeAt(index, selected, 1000).entry.value, result)
  assert.equal(simulationNodeAt(index, selected, 1000).state, 'trialProduced')
  assert.equal(simulationNodeAt(index, selected, 1000, 'record-duplicate').state, 'notTriggered')
  assert.equal(simulationNodeAt(index, selected, 2000).state, 'notTriggered', 'cannot carry an earlier result into a later evaluation')
  const failed = { ...node('failed','mean',1000), hasError:true }
  const failureIndex = simulationIndex(value, undefined, [result], response([result],[...records.slice(0,3), failed, node('after-failure','mean',1000,{state:'skipped'})]))
  assert.equal(simulationNodeAt(failureIndex, selected, 1000).state, 'calculationFailed')
  assert.equal(simulationNodeAt(failureIndex, selected, 1000).entry.record.id, 'failed')
  const invalid = { ...result, value:null, status:'invalid' }
  const invalidIndex = simulationIndex(value, undefined, [invalid], response([invalid],records))
  assert.equal(simulationNodeAt(invalidIndex, selected, 1000).state, 'calculationFailed')
})

test('无效质量与主值显示一致；使用声明单位且不改写响应', async () => {
  const value = template(); value.outputs = [{ metricId:'mean', unit:'kW' }]
  const results = [{ metricId:'mean', value:100, evaluationTime:1000 }, { metricId:'mean', value:7, quality:{ valid:false }, evaluationTime:2000 }]
  const index = simulationIndex(value, undefined, results, response(results))
  const snapshot = simulationNodeAt(index, { kind:'rule', index:0 }, 2000)
  assert.equal(snapshot.state, 'calculationFailed')
  assert.equal(snapshot.entry.value, results[1]); assert.equal(results[1].unit, undefined)
  assert.equal(simulationUnit(value, { kind:'rule', index:0 }, snapshot.entry), 'kW')
  const Graph = load('components/Metric/template/TemplateGraph.vue').default
  const { renderer, root } = createMetricRenderer()
  const app = renderer.createApp({ setup:() => () => h(Graph, {template:value,simulationPreview:{time:2000,nodes:{'rule-0':snapshot}}}) }); app.config.warnHandler = () => {}; app.mount(root)
  try {
    const selected = walk(root, element => element.props['data-node'] === 'rule-0')[0]
    assert.match(textContent(selected.parent), /—kW.*calculationFailed/); assert.doesNotMatch(textContent(selected.parent), /100|7/)
  } finally { app.unmount() }
})

test('适用条件不满足使用主值的中性状态，实际执行错误仍优先', () => {
  const value = template()
  const result = { metricId:'mean', value:null, status:'invalid', reason:'notApplicable', quality:{valid:false}, evaluationTime:1000 }
  const index = simulationIndex(value, undefined, [result], response([result]))
  assert.equal(simulationNodeAt(index, {kind:'rule',index:0}, 1000).state, 'notApplicable')
  const record = {...node('failed','mean',1000),hasError:true}
  const failed = simulationIndex(value, undefined, [result], response([result],[record,output('out','failed',0)]))
  assert.equal(simulationNodeAt(failed, {kind:'rule',index:0}, 1000).state, 'calculationFailed')
})

test('真实时间轴导航只投影一次响应；修改样本后清空结果、未知字段无损', async () => {
  const Simulation = load('components/Metric/template/TemplateSimulation.vue').default
  const value = template(), samples = facts(value)
  const results = [{ metricId:'mean', value:100, evaluationTime:600_000 }, { metricId:'mean', value:110, evaluationTime:840_000 }]
  let trial
  const props = reactive({ template:value, text:JSON.stringify(samples), format:'json', results, response:response(results), loading:false, error:'', selected:{ kind:'rule', index:0 },
    'onUpdate:text':next => { props.text = next; props.results = []; props.response = undefined } })
  const { renderer, root } = createMetricRenderer()
  const Clock = load('components/Metric/template/TemplateSimulationClock.vue').default
  const { useTemplateSimulation } = load('components/Metric/template/useTemplateSimulation.ts')
  const app = renderer.createApp({ setup:() => {
    watch(() => props.text, () => { props.results = []; props.response = undefined }, {flush:'sync'})
    trial = useTemplateSimulation({ ...Object.fromEntries(['template','text','format','results','response','loading'].map(key => [key,toRef(props,key)])), invalidate:() => { props.results = []; props.response = undefined } })
    return () => h('div', [h(Clock,{trial}), h(Simulation,{template:props.template,selected:props.selected,trial})])
  } }); app.config.warnHandler = () => {}; app.mount(root)
  try {
    assert.equal(trial.preview.nodes['rule-0'].entry.value.value, 110)
    const previous = () => walk(root, element => element.type === 'a-button' && element.props['aria-label'] === 'trialPreviousTime')[0]
    previous().props.onClick(); await flush()
    assert.equal(trial.time, 600_000); assert.equal(trial.preview.nodes['rule-0'].entry.value.value, 100)
    previous().props.onClick(); await flush(); assert.equal(trial.preview.nodes['rule-0'].entry, undefined)
    const field = walk(root, element => element.type === 'external-shell' && element.props.type === 'number')[0]
    trial.selectTime(600_000)
    field.props.onChange(0); await flush()
    assert.equal(JSON.parse(props.text).samples[0].value, 0); assert.equal(JSON.parse(props.text).custom, false)
    assert.equal(trial.preview.nodes['rule-0'].entry, undefined); assert.equal(trial.preview.nodes['rule-0'].state, 'trialPending')
    props.loading = true; await flush(); assert.equal(trial.preview.nodes['rule-0'].state, 'calculating')
    props.results = [...results, { metricId:'mean', value:150, evaluationTime:900_000 }]
    props.response = response(props.results); props.loading = false; await flush()
    assert.equal(trial.time, 600_000, '刷新响应保留主动选中的早期截点')
    trial.updateFacts({ ...trial.facts, samples:trial.facts.samples.filter(sample => sample.eventTime !== 600_000) })
    await flush(); assert.equal(trial.time, 840_000, '选中时刻被移除才回退到最新可用时刻')
    trial.reset(); props.results = results; props.response = response(results); await flush()
    assert.equal(trial.time, 840_000, '新会话恢复默认末尾定位')
  } finally { app.unmount() }
})

test('模拟区手动展开与收起在样本补全、加载和响应期间保持，输入定位与新错误可展开', async () => {
  const Simulation = load('components/Metric/template/TemplateSimulation.vue').default
  const { useTemplateSimulation } = load('components/Metric/template/useTemplateSimulation.ts')
  const props = reactive({ template:template(), text:JSON.stringify(facts(template())), format:'json', results:[], response:undefined, loading:false, selected:undefined })
  const { renderer, root } = createMetricRenderer()
  let trial
  const app = renderer.createApp({ setup:() => {
    trial = useTemplateSimulation({ ...Object.fromEntries(['template','text','format','results','response','loading'].map(key => [key,toRef(props,key)])), invalidate:() => { props.results = []; props.response = undefined } })
    return () => h(Simulation,{template:props.template,selected:props.selected,trial})
  } }); app.config.warnHandler = () => {}; app.mount(root)
  const samples = () => walk(root, element => element.type === 'details' && element.props.class === 'template-simulation__samples')[0]
  const toggle = async open => { samples().props.onToggle({target:{open}}); await flush() }
  try {
    await flush(); assert.equal(samples().props.open, false)
    await toggle(true)
    props.selected = { kind:'rule', index:0 }; props.loading = true; await flush()
    assert.equal(samples().props.open, true, '切换计算节点与加载不会收起手动展开的模拟区')
    trial.setSampleInvalid(true); await flush()
    trial.setSampleInvalid(false); props.loading = false; props.response = response([]); await flush()
    assert.equal(samples().props.open, true, '补全样本后不会收起')
    await toggle(false)
    props.response = response([]); await flush(); assert.equal(samples().props.open, false, '响应刷新不强制展开')
    props.selected = { kind:'input', index:0 }; await flush(); assert.equal(samples().props.open, true)
    await toggle(false)
    trial.patchValue(0, 20); await flush(); assert.equal(samples().props.open, false, '输入保持选中时仍可手动折叠')
    trial.setSampleInvalid(true); await flush(); assert.equal(samples().props.open, true)
    await toggle(false)
    trial.endAtInvalid = true; await flush(); assert.equal(samples().props.open, true, '新增截止时间错误会展开')
    await toggle(false)
    trial.endAtInvalid = false; await flush(); assert.equal(samples().props.open, false, '另一个错误未修正时也尊重手动折叠')
  } finally { app.unmount() }
})

test('样本定位和清除筛选独立于配置选中项，保留计算详情', async () => {
  const Simulation=load('components/Metric/template/TemplateSimulation.vue').default
  const {useTemplateSimulation}=load('components/Metric/template/useTemplateSimulation.ts')
  const props=reactive({template:template(),text:JSON.stringify(facts(template())),format:'json',results:[],response:undefined,loading:false,selected:{kind:'rule',index:0}})
  const {renderer,root}=createMetricRenderer();let panel,clears=0
  const app=renderer.createApp({setup:()=>{
    const trial=useTemplateSimulation({...Object.fromEntries(['template','text','format','results','response','loading'].map(key=>[key,toRef(props,key)])),invalidate(){}})
    return ()=>h(Simulation,{ref:value=>{panel=value},template:props.template,selected:props.selected,trial,'onClear-selection':()=>{clears++}})
  }});app.config.warnHandler=()=>{};app.mount(root)
  try {
    await panel.focusSamples(false,'power');await flush()
    assert.equal(walk(root,node=>node.props.class==='sample-editor__filter').length,1)
    assert.equal(walk(root,node=>node.props.class==='template-simulation__result').length,1)
    walk(root,node=>node.props['aria-label']==='trialAllInputs')[0].props.onClick();await flush()
    assert.equal(walk(root,node=>node.props.class==='sample-editor__filter').length,0)
    assert.equal(clears,0);assert.equal(props.selected.kind,'rule')
    assert.equal(walk(root,node=>node.props.class==='template-simulation__result').length,1)
    props.selected={kind:'input',index:0};await flush()
    const renamed=JSON.parse(props.text)
    renamed.configuration.inputMappings={renamed:renamed.configuration.inputMappings.power}
    props.template.inputDefinitions[0].id='renamed';props.text=JSON.stringify(renamed);await flush()
    assert.match(textContent(walk(root,node=>node.props.class==='sample-editor__filter')[0]),/功率/,'同一输入重命名后筛选仍指向当前声明')
  } finally {app.unmount()}
})
