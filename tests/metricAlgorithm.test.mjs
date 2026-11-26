import assert from 'node:assert/strict'
import test from 'node:test'
import { defineComponent, effectScope, h, reactive, ref } from 'vue'
import { resolve } from 'node:path'
import { createMetricLoader, createMetricRenderer, flush, walk, textContent, sourceRoot } from './helpers/metricRuntime.mjs'

const load = createMetricLoader({ '@jetlinks-web/core': { request: {} }, [resolve(sourceRoot,'utils/ndjson.ts')]: { createRuntimeNdJson:()=>({}) },
  [resolve(sourceRoot,'components/Metric/template/TemplateAlgorithmGuide.vue')]: { default:defineComponent({inheritAttrs:false,setup:(_,{attrs})=>()=>h('algorithm-guide',attrs)}),__esModule:true },
  'vue-i18n': { useI18n: () => ({ t: (key, values) => values?.name ? `${key} · ${values.name}` : key, locale:{ value:'zh' } }) } })
const { algorithmParameterValue, algorithmSourceMatches, algorithmSuggestions, bindAlgorithmInput, calculatorKey, chooseAlgorithm, findCalculator, interactiveCalculator } = load('components/Metric/template/algorithm.ts')
const { calculatorIcon, calculatorOption } = load('components/Metric/template/calculatorPresentation.ts')
const { metricMessages } = load('components/Metric/messages.ts')
const { ruleFormulaReferences, expressionToFormula, formulaToExpression } = load('components/Metric/template/formula.ts')
const Editor = load('components/Metric/template/TemplateAlgorithmEditor.vue').default
const { useMetricTemplates } = load('components/Metric/template/useMetricTemplates.ts')
const state = {
  id: 'duration', name: 'State duration', icon: 'ClockCircleOutlined', inputNames: { state: 'State' },
  configuration: { provider: 'state', providerVersion: '1', inputTypes: { state: { type: 'array', elementType: { type: 'int' } } },
    outputType: { type: 'object', properties: [{ id: 'activeDuration', name: 'Runtime', valueType: { type: 'double', unit: 's' } }] },
    parameters: { duration: 'PT1H', maxHold: 'PT20M', activeValue: 1, inactiveValue: 0 } },
  parameterDefinitions: [
    { id: 'duration', name: 'Duration', valueType: { type: 'string' }, expands: { editor: 'duration' } },
    { id: 'maxHold', name: 'Validity', valueType: { type: 'string' }, expands: { editor: 'duration' } },
    { id: 'activeValue', name: 'Active', valueType: { type: 'int' }, expands: { typeFromInput: 'state' } },
    { id: 'inactiveValue', name: 'Inactive', valueType: { type: 'int' }, expands: { typeFromInput: 'state' } },
  ],
}
const meter = { id: 'increase', name: 'Counter increase', icon: 'RiseOutlined', inputNames: { reading: 'Reading' },
  configuration: { provider: 'measurement', providerVersion: '1', inputTypes: { reading: { type: 'array', elementType: { type: 'double' } } },
    outputType: { type: 'double' }, parameters: { operation: 'increase', negativeDelta: 'reject' } },
  parameterDefinitions: [{ id: 'negativeDelta', name: 'Decrease', valueType: { type: 'enum', elements: [{ value: 'reject', text: 'Reject' }, { value: 'rollover', text: 'Rollover' }] } }],
}
// 用扩展 provider 和不同参数名验证编辑能力来自描述，而非内置算法判断。
const contextual = { id:'score', name:'Grouped score', inputNames:{signal:'Signal'},
  configuration:{provider:'external-analysis',providerVersion:'1',inputTypes:{signal:{type:'array',elementType:{type:'double'}}},outputType:{type:'double'},parameters:{operation:'score'}},
  parameterDefinitions:[{id:'groupBy',name:'Operating mode',valueType:{type:'string'},expands:{inputType:{type:'array',elementType:{}}}}] }
const clone = value => JSON.parse(JSON.stringify(value))
function fixture() {
  const calculator = { ...clone(state.configuration), custom: false, parameters: { ...state.configuration.parameters, extra: 0 } }
  const rule = { id: 'statistics', inputs: [{ id: 'state', metricId: 'operating', presence: 'required' }], calculator }
  const template = { id: 'runtime', version: '1', name: 'Runtime', parameters: {}, parameterDefinitions: [], outputs: [],
    inputDefinitions: [{ id: 'operating', name: 'Operating', valueType: { type: 'int' }, source: { lookback: 'PT2H', maxPoints: 256 } },
      { id: 'online', name: 'Online', valueType: { type: 'boolean' } }], definitions: [rule] }
  return { rule, template }
}
function mount(extra = {}) {
  const { renderer, root } = createMetricRenderer()
  const { rule, template } = fixture()
  const invalid = [], patches = []
  const props = reactive({ rule, template, calculators: clone([state, meter]), disabled: false,
    onPatch: fields => { patches.push(fields); Object.assign(props.rule, fields) }, onInvalid: value => invalid.push(value), ...extra })
  const app = renderer.createApp({ setup: () => () => h(Editor, props) })
  for (const type of ['a-select', 'a-button', 'a-tooltip', 'a-tag', 'a-input', 'a-input-number', 'a-space', 'a-switch']) {
    app.component(type, defineComponent({ inheritAttrs: false, setup: (_props, { attrs, slots }) => () => h(type, attrs, Object.entries(slots).flatMap(([name,slot]) => name === 'option' ? [] : slot?.())) }))
  }
  app.config.warnHandler = () => {}; app.mount(root)
  return { root, props, invalid, patches, close: () => app.unmount() }
}
const nodes = (view, type) => walk(view.root, node => node.type === type)
const yaml = view => nodes(view, 'external-shell').find(node => node.props.language === 'yaml')
const mode = view => nodes(view, 'a-button').find(node => ['YAML', 'algorithmInteractive'].includes(node.props['aria-label']))

test('来源候选按算法角色类型过滤，分段输入按声明接受不同状态类型',async()=>{
  const {rule,template}=fixture();rule.calculator=clone(contextual.configuration);rule.inputs=[{id:'signal',metricId:'operating'}]
  template.inputDefinitions.push({id:'mode',name:'Mode',valueType:{type:'string'}})
  const view=mount({rule,template,calculators:[clone(contextual)]})
  try {
    const choice=name=>nodes(view,'external-shell').find(node=>node.props['component-props']?.['aria-label']===`source · ${name}`).props['component-props'].options.map(option=>option.value)
    assert.deepEqual(choice('Signal'),['operating'])
    assert.deepEqual(choice('Operating mode'),['operating','online','mode'])
    assert.equal(algorithmSourceMatches(contextual.configuration,'signal',undefined,contextual),false)
    assert.equal(algorithmSourceMatches(state.configuration,'state',{type:'boolean'},state),true)
  } finally {view.close()}
})

test('观测序列与数组来源分开匹配，切换算法仍保留已知的单次观测类型', () => {
  const scalar = { id:'median', configuration:{provider:'filter',providerVersion:'1',inputTypes:{signal:{type:'double'}},outputType:{type:'double'},parameters:{operation:'median'}}, parameterDefinitions:[] }
  const array = {type:'array',elementType:{type:'double'}}
  assert.equal(algorithmSourceMatches(scalar.configuration,'signal',array,scalar),false)
  assert.equal(algorithmSourceMatches(meter.configuration,'reading',array,meter),false)
  assert.equal(algorithmSourceMatches(meter.configuration,'reading',{type:'double'},meter),true)
  const previous={inputs:[{id:'reading',metricId:'sensor'}],calculator:clone(meter.configuration)}
  assert.deepEqual(chooseAlgorithm(previous,scalar).inputs,[{id:'signal',metricId:'sensor'}])
  assert.deepEqual(chooseAlgorithm(previous,scalar,[{id:'sensor',valueType:array}]).inputs,[])
  const selected=bindAlgorithmInput({calculator:clone(state.configuration)},'state','vectors',array,state)
  assert.deepEqual(selected.calculator.inputTypes.state,{type:'array',elementType:array})
})

test('参数编辑复用通用值控件，原始枚举编码、数值范围和显式空值保持一致',async()=>{
  const descriptor=clone(meter)
  descriptor.parameterDefinitions=[{id:'threshold',name:'Threshold',valueType:{type:'double',min:0,max:100}},
    {id:'mode',name:'Mode',valueType:{type:'enum',elements:[{value:0,text:'Zero'},{value:false,text:'False'}]}}]
  descriptor.configuration.parameters.threshold=10
  const {template,rule}=fixture();rule.calculator={...clone(descriptor.configuration),parameters:{...descriptor.configuration.parameters,threshold:null,mode:0}}
  const view=mount({rule,template,calculators:[descriptor]})
  try {
    assert.equal(algorithmParameterValue(descriptor.parameterDefinitions[0],rule.calculator,descriptor),null)
    const field=name=>nodes(view,'external-shell').find(node=>node.props['component-props']?.['aria-label']===name)
    assert.equal(field('Threshold').props.value,null)
    assert.equal(field('Threshold').props['component-props'].min,0)
    assert.equal(field('Threshold').props['component-props'].max,100)
    assert.equal(field('Mode').props.value,'0')
    field('Mode').props.onChange('1');await flush()
    assert.equal(rule.calculator.parameters.mode,false)
    assert.equal(view.patches.length,1)
  } finally {view.close()}
})

test('外部配置变更到不可视结构时回退显示完整声明，撤回后恢复交互',async()=>{
  const view=mount()
  try {
    const original=clone(view.props.rule.calculator)
    view.props.rule.calculator={...original,inputTypes:{unknown:{type:'double'}}};await flush()
    assert.ok(yaml(view))
    view.props.rule.calculator=original;await flush()
    assert.equal(yaml(view),undefined)
  } finally {view.close()}
})

test('切换算法保留条件依赖，不将其迁移为算法参数',()=>{
  const rule={calculator:clone(meter.configuration),inputs:[{id:'reading',metricId:'temperature'},{id:'gate',metricId:'enabled'}],applicabilityTree:{version:1,root:{type:'reference',id:'gate'}}}
  const next=chooseAlgorithm(rule,contextual,[{id:'temperature',valueType:{type:'double'}},{id:'enabled',valueType:{type:'boolean'}}])
  assert.deepEqual(next.inputs,[{id:'signal',metricId:'temperature'},{id:'gate',metricId:'enabled'}])
  assert.deepEqual(Object.keys(next.calculator.inputTypes),['signal'])
  assert.equal(rule.inputs[0].id,'reading')
  const unbound=chooseAlgorithm({...rule,inputs:[{id:'gate',metricId:'enabled'}],dependsOn:['enabled']},state,[{id:'enabled',valueType:{type:'boolean'}}])
  assert.deepEqual(unbound.inputs,[{id:'gate',metricId:'enabled'}])
})

test('可选输入可交互添加、替换、清除，保留原输入和其他参数',async()=>{
  const {rule,template}=fixture()
  rule.calculator=clone(contextual.configuration);rule.inputs=[{id:'signal',metricId:'operating'}]
  template.inputDefinitions.push({id:'mode',name:'Mode',valueType:{type:'string'},source:{lookback:'PT15M'}})
  const view=mount({rule,template,calculators:[clone(contextual)]})
  try {
    assert.equal(yaml(view),undefined)
    assert.equal(view.invalid.at(-1),false)
    const select=()=>nodes(view,'external-shell').find(node=>node.props['component-props']?.['aria-label']==='source · Operating mode')
    assert.equal(select().props['component-props'].allowClear,true)
    select().props.onChange('mode');await flush()
    assert.equal(rule.calculator.parameters.groupBy,'groupBy')
    assert.equal(rule.calculator.inputTypes.groupBy.elementType.type,'string')
    assert.deepEqual(rule.inputs,[{id:'signal',metricId:'operating'},{id:'groupBy',metricId:'mode',source:undefined}])
    assert.equal(yaml(view),undefined)
    select().props.onChange('operating');await flush()
    assert.equal(rule.calculator.inputTypes.groupBy.elementType.type,'int')
    select().props.onChange(undefined);await flush()
    assert.equal(rule.calculator.parameters.groupBy,undefined)
    assert.equal(rule.calculator.inputTypes.groupBy,undefined)
    assert.deepEqual(rule.inputs,[{id:'signal',metricId:'operating'}])
    assert.equal(rule.calculator.parameters.operation,'score')
    assert.equal(yaml(view),undefined)
  } finally {view.close()}
})

test('已配置的可选输入按描述反显并在切换算法时保留，未声明的输入仍回退',()=>{
  const rule={id:'score',calculator:{...clone(contextual.configuration),inputTypes:{...clone(contextual.configuration.inputTypes),batch:{type:'array',elementType:{type:'string'}}},parameters:{operation:'score',groupBy:'batch'}},inputs:[{id:'signal',metricId:'reading'},{id:'batch',metricId:'mode'}]}
  assert.equal(interactiveCalculator(rule.calculator,contextual),true)
  const alternative={...clone(contextual),id:'another',configuration:{...clone(contextual.configuration),parameters:{operation:'another'}}}
  const next=chooseAlgorithm(rule,alternative)
  assert.equal(next.calculator.parameters.groupBy,'batch')
  assert.deepEqual(next.inputs,rule.inputs)
  assert.equal(interactiveCalculator({...rule.calculator,inputTypes:{...rule.calculator.inputTypes,unknown:{type:'double'}}},contextual),false)
  assert.equal(interactiveCalculator({...clone(contextual.configuration),parameters:{operation:'score',groupBy:'missing'}},contextual),false)
  const selected=findCalculator(rule.calculator,[contextual,{...clone(contextual),id:'other-input',configuration:{...clone(contextual.configuration),inputTypes:{other:{type:'double'}}}}])
  assert.equal(selected,contextual)
})

test('未选算法时直接展开可搜索候选，选择后显示可视参数且不预写配置', async () => {
  const {template,rule}=fixture();rule.calculator={provider:''}
  const before=JSON.stringify(rule),view=mount({template,rule,calculators:[]})
  try {
    const choice=()=>nodes(view,'a-select').find(node=>node.props['aria-label']==='chooseAlgorithm')
    assert.ok(choice());assert.equal(choice().props['default-open'],true)
    assert.equal(yaml(view),undefined);assert.equal(mode(view),undefined)
    assert.equal(JSON.stringify(rule),before);assert.equal(view.patches.length,0)
    view.props.calculators=clone([state,meter]);await flush()
    assert.equal(choice().props.options.length,2)
    choice().props.onChange(calculatorKey(meter));await flush()
    assert.equal(view.props.rule.calculator.provider,'measurement')
    assert.equal(yaml(view),undefined);assert.equal(choice(),undefined)
    assert.ok(mode(view));assert.equal(view.patches.length,1)
  } finally {view.close()}
})

test('只读空算法仍显示选择入口，但不展开或修改配置', async () => {
  const {template,rule}=fixture();rule.calculator={provider:''}
  const view=mount({template,rule,disabled:true})
  try {
    const choice=nodes(view,'a-select').find(node=>node.props['aria-label']==='chooseAlgorithm')
    assert.equal(choice.props.disabled,true);assert.equal(choice.props['default-open'],false)
    choice.props.onChange(calculatorKey(meter));await flush()
    assert.equal(view.patches.length,0);assert.equal(yaml(view),undefined)
  } finally {view.close()}
})

test('算法配置按来源、计算、结果分层，来源块复用真实引用且选择仍更新原规则', async () => {
  const view = mount()
  try {
    const stages = walk(view.root, node => node.props.class === 'algorithm-editor__stage-title').map(textContent)
    assert.deepEqual(stages, ['algorithmDataStage','algorithmProcessStage','algorithmResultStage'])
    assert.equal(walk(view.root, node => node.props.class?.split(' ').includes('algorithm-editor__stage')).length, 3)
    const reference = walk(view.root, node => node.props.class?.includes('algorithm-editor__source-chip') && node.props['data-reference'] === 'operating')[0]
    assert.ok(reference)
    const source = nodes(view,'external-shell').find(node => node.props['component-props']?.['aria-label'] === 'source · State')
    assert.ok(source)
    assert.equal(source.props['component-props'].options.find(item => item.value === 'operating').label, 'Operating')
    source.props.onChange('online'); await flush()
    assert.equal(view.props.rule.inputs[0].metricId,'online')
  } finally { view.close() }
})

test('算法图标直接使用描述声明，不按内置名称或 Provider 推断', () => {
  assert.equal(calculatorIcon(state), 'ClockCircleOutlined')
  assert.equal(calculatorIcon(meter), 'RiseOutlined')
  assert.equal(calculatorIcon({ ...meter, id:'integral', icon:'AreaChartOutlined' }), 'AreaChartOutlined')
  assert.equal(calculatorIcon({ ...meter, id:'rms', icon:'DashboardOutlined', configuration:{ provider:'signal' } }), 'DashboardOutlined')
  assert.equal(calculatorIcon({ ...meter, icon:undefined }), 'CalculatorOutlined')
  assert.equal(calculatorIcon({ ...meter, icon:'', id:'future' }), 'CalculatorOutlined')
  assert.equal(calculatorIcon({ ...meter, icon:'ExperimentOutlined', configuration:{ ...meter.configuration, provider:'third-party' } }), 'ExperimentOutlined')
  assert.equal(calculatorIcon(), 'CalculatorOutlined')
  const opaque = { id:'custom', name:'Custom model', configuration:{ provider:'custom', providerVersion:'v7' } }
  const original = JSON.stringify(opaque)
  for (const locale of ['zh','en']) {
    const t = (key, values) => (metricMessages[locale][key] || key).replace('{version}', values?.version || '')
    const option = calculatorOption(opaque, t)
    assert.equal(option.label, opaque.name)
    assert.equal(option.icon, 'CodeOutlined')
    assert.match(option.description, /YAML/)
    assert.ok(option.description.includes(locale === 'zh' ? '版本 v7' : 'Version v7'))
    const builtin = calculatorOption({ ...meter, description:'Counter change' }, t)
    assert.equal(builtin.description, `Counter change · ${locale === 'zh' ? '版本 1' : 'Version 1'}`)
  }
  assert.equal(JSON.stringify(opaque), original)
})

test('数值算法显示来源单位并可单独修改结果单位，保留绑定与参数', async () => {
  const view = mount()
  try {
    view.props.rule.calculator = clone(meter.configuration)
    view.props.rule.inputs = [{ id:'reading', metricId:'operating' }]
    view.props.template.inputDefinitions[0].unit = 'kWh'
    await flush()
    assert.ok(textContent(view.root).includes('kWh'))
    const unit = nodes(view,'external-shell').find(node => node.props['component-props']?.['aria-label'] === 'outputUnit')
    assert.ok(unit)
    unit.props.onChange('L'); await flush()
    assert.equal(view.props.rule.calculator.outputUnit,'L')
    assert.deepEqual(view.props.rule.inputs,[{ id:'reading', metricId:'operating' }])
    assert.equal(view.props.rule.calculator.parameters.negativeDelta,'reject')
    unit.props.onChange(undefined); await flush()
    assert.equal(view.props.rule.calculator.outputUnit,undefined)
    view.props.rule.calculator.outputType = { type:'boolean' }; await flush()
    assert.ok(!nodes(view,'external-shell').some(node => node.props['component-props']?.['aria-label'] === 'outputUnit'))
  } finally { view.close() }
})

test('算法说明来自精确匹配的描述，结果字段保留模板字典翻译',()=>{
  const {template,rule}=fixture()
  template.inputDefinitions[0].valueType={type:'enum',elements:[{value:1,text:'Raw online',icon:'color:#22c55e'},{value:0,text:'Raw offline'}]}
  template.options={i18nMessages:{'input.operating.enum.1':{zh:'运行中'},'input.operating.enum.0':{zh:'已停止'},'rule.statistics.output.field.activeDuration.name':{zh:'已运行时间'}}}
  const original=JSON.stringify(template),view=mount({template,rule})
  try {
    const guide=nodes(view,'algorithm-guide')[0]
    assert.equal(guide.props.descriptor.configuration.provider,'state')
    assert.equal(guide.props.labels,undefined)
    assert.ok(textContent(view.root).includes('已运行时间'))
    assert.equal(JSON.stringify(template),original)
  } finally {view.close()}
})

test('常用菜单依据可视描述筛选起点，扩展算法与同名版本仍按精确身份选择', async () => {
  const newer = { ...clone(meter), configuration:{ ...clone(meter.configuration), providerVersion:'2' } }
  const extension = { ...clone(meter), name:'External meter', configuration:{ ...clone(meter.configuration), provider:'external-meter' } }
  const opaque = { id:'custom', name:'Custom', inputNames:{}, parameterDefinitions:[], configuration:{ provider:'custom', providerVersion:'v7' } }
  const view = mount({ calculators:clone([state,meter,newer,extension,opaque]) })
  try {
    const select = () => nodes(view,'external-shell').find(node => node.props['component-props']?.['aria-label'] === 'chooseAlgorithm')
    assert.equal(select().props['component-props'].dropdownMatchSelectWidth, false)
    const options = select().props['component-props'].options
    assert.equal(new Set(options.map(item => item.value)).size, 4)
    assert.equal(options.some(item => item.value === calculatorKey(opaque)), false)
    assert.ok(options.some(item => item.value === calculatorKey(extension)))
    assert.equal(options[1].label, options[2].label)
    assert.equal(options[1].icon, 'RiseOutlined')
    select().props.onChange(calculatorKey(newer)); await flush()
    assert.equal(view.props.rule.calculator.providerVersion, '2')
    assert.equal(view.props.rule.calculator.parameters.operation, 'increase')
    select().props.onChange(calculatorKey(extension)); await flush()
    assert.equal(view.props.rule.calculator.provider, 'external-meter')
    assert.equal(yaml(view), undefined)
    assert.equal(view.patches.length, 2)
  } finally { view.close() }
})

test('已有自定义算法保留选中回显与YAML编辑，可切换到普通算法', async () => {
  const opaque = { id:'custom', name:'Custom', inputNames:{}, parameterDefinitions:[], configuration:{ provider:'custom', providerVersion:'v7' } }
  const { rule, template } = fixture()
  rule.calculator = { ...opaque.configuration, parameters:{ custom:0 } }
  const view = mount({ rule, template, calculators:clone([state,meter,opaque]) })
  try {
    const select = () => nodes(view,'external-shell').find(node => node.props['component-props']?.['aria-label'] === 'chooseAlgorithm')
    assert.equal(select().props.value, calculatorKey(opaque))
    assert.ok(select().props['component-props'].options.some(item => item.value === calculatorKey(opaque)))
    assert.ok(yaml(view))
    assert.equal(view.patches.length, 0)
    yaml(view).props['onUpdate:modelValue']('provider: custom\nproviderVersion: v7\nparameters:\n  custom: 2'); await flush()
    assert.equal(view.props.rule.calculator.parameters.custom, 2)
    select().props.onChange(calculatorKey(meter)); await flush()
    assert.equal(view.props.rule.calculator.provider, 'measurement')
    assert.equal(yaml(view), undefined)
    assert.equal(select().props['component-props'].options.some(item => item.value === calculatorKey(opaque)), false)
  } finally { view.close() }
})

test('来源缺项在对应输入旁具名提示，原位选择后消失且不阻止切换', async () => {
  const { rule, template } = fixture()
  rule.inputs = []
  const view = mount({ rule, template })
  try {
    const hints = () => nodes(view,'p').filter(node => node.props.role === 'status').map(textContent)
    const source = () => nodes(view,'external-shell').find(node => node.props['component-props']?.['aria-label'] === 'source · State')
    assert.deepEqual(hints(), ['algorithmMissingSource · State'])
    assert.equal(source().props['component-props']['aria-invalid'], true)
    assert.equal(view.invalid.at(-1), false)
    mode(view).props.onClick(); await flush()
    assert.ok(yaml(view)); assert.deepEqual(hints(), ['algorithmMissingSource · State'])
    mode(view).props.onClick(); await flush()
    source().props.onChange('operating'); await flush()
    assert.deepEqual(hints(), [])
    assert.equal(source().props['component-props']['aria-invalid'], false)
    assert.equal(view.props.rule.inputs[0].metricId, 'operating')
  } finally { view.close() }
})

test('省略的算法参数显示描述中默认值，显式0与false保留，回显不写配置', () => {
  const descriptor = clone(meter)
  descriptor.configuration.parameters.multiplier = 1
  descriptor.parameterDefinitions.push({ id:'multiplier', name:'Multiplier', valueType:{type:'double'} }, { id:'enabled', name:'Enabled', valueType:{type:'boolean'} })
  descriptor.configuration.parameters.enabled = true
  const rule = { id:'usage', inputs:[{id:'reading',metricId:'reading'}], calculator:{ ...clone(descriptor.configuration), parameters:{ operation:'increase', negativeDelta:'reject', enabled:false } } }
  const template = { ...fixture().template, definitions:[rule], inputDefinitions:[{id:'reading',name:'Reading',valueType:{type:'array'}}] }
  const view = mount({ calculators:[descriptor], rule, template })
  try {
    const number = nodes(view,'external-shell').find(node => node.props['component-props']?.['aria-label'] === 'Multiplier')
    const flag = nodes(view,'external-shell').find(node => node.props['component-props']?.['aria-label'] === 'Enabled')
    assert.equal(number.props.value,1)
    assert.equal(flag.props.value,'false')
    assert.equal(Object.hasOwn(view.props.rule.calculator.parameters,'multiplier'),false)
    assert.equal(view.patches.length,0)
    number.props.onChange(0)
    assert.equal(view.props.rule.calculator.parameters.multiplier,0)
  } finally { view.close() }
})

test('algorithm selection pins provider, version and operation; opaque inputs stay in YAML', () => {
  assert.equal(findCalculator(state.configuration, [state]), state)
  assert.equal(findCalculator({ ...state.configuration, providerVersion: '2' }, [state]), undefined)
  assert.equal(findCalculator({ ...meter.configuration, parameters: { operation: 'integral' } }, [meter]), undefined)
  assert.equal(interactiveCalculator(state.configuration, state), true)
  assert.equal(interactiveCalculator({ ...state.configuration, inputTypes: { from: { type: 'long' } } }, state), false)
  assert.equal(interactiveCalculator({ provider: 'external' }), false)
  const { rule } = fixture()
  const next = chooseAlgorithm(rule, meter)
  assert.equal(next.calculator.provider, 'measurement'); assert.deepEqual(next.inputs, [{id:'reading',metricId:'operating',presence:'required'}])
  assert.equal(rule.calculator.custom, false); assert.equal(state.configuration.parameters.duration, 'PT1H')
})

test('窗口来源切换到算法后迁移为输入别名，后续算法切换保留来源与读取约束', () => {
  const rule={id:'usage',sourceMetric:'temperature',dependsOn:['temperature']}
  const sources=[{id:'temperature',valueType:{type:'double'}}]
  const next=chooseAlgorithm(rule,meter,sources)
  assert.equal(next.sourceMetric,undefined)
  assert.deepEqual(next.inputs,[{id:'reading',metricId:'temperature'}])
  assert.deepEqual(chooseAlgorithm({...rule,inputs:[{id:'unbound'}]},meter,sources).inputs,next.inputs)
  const rebound={...rule,...next,inputs:[{...next.inputs[0],maxAge:'PT10S',presence:'optional',custom:false}]}
  const signal={...clone(meter),id:'rms',configuration:{provider:'signal',providerVersion:'1',inputTypes:{signal:{type:'array',elementType:{type:'double'}}},parameters:{operation:'rms'}}}
  const switched=chooseAlgorithm(rebound,signal,sources)
  assert.deepEqual(switched.inputs,[{id:'signal',metricId:'temperature',maxAge:'PT10S',presence:'optional',custom:false}])
  assert.equal(rule.sourceMetric,'temperature');assert.equal(rebound.inputs[0].id,'reading')
})

test('单一依赖和直接来源可无损继承；多来源没有明确对应时不按顺序猜测', () => {
  assert.deepEqual(chooseAlgorithm({dependsOn:['temperature']},meter).inputs,[{id:'reading',metricId:'temperature'}])
  assert.deepEqual(chooseAlgorithm({dependsOn:['']},meter).inputs,[])
  const direct={id:'signal',source:{kind:'provider',id:'reading',providerSource:{provider:'objects',sourceType:'query',configuration:{}}},presence:'optional',defaultValue:0}
  const rule={inputs:[direct],calculator:{inputTypes:{signal:{type:'array',elementType:{type:'double'}}}}}
  assert.deepEqual(chooseAlgorithm(rule,meter).inputs,[{...direct,id:'reading'}])
  assert.deepEqual(chooseAlgorithm({dependsOn:['temperature','ambient']},meter).inputs,[])
  const multi={...clone(meter),configuration:{...clone(meter.configuration),inputTypes:{left:{type:'double'},right:{type:'double'}}}}
  assert.deepEqual(chooseAlgorithm({inputs:[{id:'a',metricId:'one'},{id:'b',metricId:'two'}]},multi).inputs,[])
})

test('多个独立类型的唯一对应一次迁移，同类型的歧义角色仍需明确选择', () => {
  const descriptor = { ...clone(meter), configuration:{ ...clone(meter.configuration),
    inputTypes:{ reading:{type:'double'}, enabled:{type:'boolean'}, batch:{type:'string'} } } }
  const inputs = [{id:'mode',metricId:'lot'}, {id:'active',metricId:'switch'}, {id:'signal',metricId:'sensor'}]
  const sources = [{id:'lot',valueType:{type:'string'}}, {id:'switch',valueType:{type:'boolean'}}, {id:'sensor',valueType:{type:'double'}}]
  const expected = [{id:'reading',metricId:'sensor'}, {id:'enabled',metricId:'switch'}, {id:'batch',metricId:'lot'}]
  assert.deepEqual(chooseAlgorithm({inputs},descriptor,sources).inputs,expected)
  assert.deepEqual(chooseAlgorithm({inputs:inputs.toReversed()},descriptor,sources).inputs,expected)
  descriptor.configuration.inputTypes.secondReading = {type:'double'}
  assert.deepEqual(chooseAlgorithm({inputs},descriptor,sources).inputs,expected.slice(1))
})

test('保留同名输入；明确类型不匹配时要求重选，动态状态输入沿用来源实际类型', () => {
  const source=[{id:'online',valueType:{type:'boolean'}}]
  assert.deepEqual(chooseAlgorithm({inputs:[{id:'reading',metricId:'online'}]},meter,source).inputs,[])
  const next=chooseAlgorithm({inputs:[{id:'reading',metricId:'online'}]},state,source)
  assert.deepEqual(next.inputs,[{id:'state',metricId:'online'}])
  assert.equal(next.calculator.inputTypes.state.elementType.type,'boolean')
  assert.equal(next.calculator.parameters.activeValue,undefined)
  const rules={inputs:[{id:'reading',metricId:'temperature',maxAge:'PT5S'},{id:'context',metricId:'batch'}]}
  assert.deepEqual(chooseAlgorithm(rules,meter,[{id:'temperature',valueType:{type:'float'}}]).inputs,[rules.inputs[0]])
})

test('binding uses declared source types, keeps other bindings and does not alter lookback', () => {
  const { rule, template } = fixture()
  rule.inputs.push({ id: 'other', metricId: 'other', presence: 'optional' })
  const next = bindAlgorithmInput(rule, 'state', 'online', { type: 'boolean' }, state)
  assert.equal(next.calculator.inputTypes.state.elementType.type, 'boolean')
  assert.equal(next.calculator.parameters.activeValue, undefined); assert.equal(next.calculator.parameters.inactiveValue, undefined)
  assert.equal(next.calculator.parameters.extra, 0); assert.equal(next.calculator.custom, false)
  assert.equal(next.inputs[0].presence, 'optional'); assert.equal(template.inputDefinitions[0].source.lookback, 'PT2H')
  assert.equal(rule.calculator.inputTypes.state.elementType.type, 'int')
})

test('same operation with different input roles uses the matching variant in editor and formula metadata', () => {
  const cycle = { ...clone(meter), id:'increaseByCycle', name:'Usage by cycle', icon:'SwapOutlined' }
  cycle.configuration.inputTypes.cycle = {type:'array',elementType:{type:'string'}}
  cycle.configuration.parameters.contextInput = 'cycle'
  const switched=chooseAlgorithm({sourceMetric:'memory',dependsOn:['memory']},cycle,[{id:'memory',valueType:{type:'double'}}])
  assert.deepEqual(switched.inputs,[{id:'reading',metricId:'memory'}],'双输入算法保留唯一匹配的数值来源，新增周期输入仍待选择')
  for (const descriptors of [[meter,cycle],[cycle,meter]]) {
    assert.equal(findCalculator(meter.configuration,descriptors),meter)
    assert.equal(findCalculator(cycle.configuration,descriptors),cycle)
    assert.equal(interactiveCalculator(cycle.configuration,findCalculator(cycle.configuration,descriptors)),true)
    const template={inputDefinitions:[],parameterDefinitions:[],outputs:[],definitions:[{id:'usage',name:'usage',calculator:cycle.configuration}]}
    const references=ruleFormulaReferences(template,{id:'next',type:'composite',dependsOn:['usage']},descriptors)
    assert.equal(references.find(item=>item.key==='usage')?.label,'Usage by cycle')
  }
  assert.equal(calculatorIcon(cycle),'SwapOutlined')
  assert.equal(findCalculator({...cycle.configuration,inputTypes:{unexpected:{type:'double'}}},[meter,cycle]),undefined)
  assert.equal(findCalculator(cycle.configuration,[cycle,{...cycle,id:'ambiguous'}]),undefined)
  const suggestions=algorithmSuggestions('parameters:\n  operation: ',cycle.configuration,cycle,[meter,cycle])
  assert.equal(suggestions.filter(item=>item.label==='increase').length,1,'one executable operation must not appear twice because of input variants')
  const bound=bindAlgorithmInput({calculator:cycle.configuration,inputs:[]},'cycle','lastReset',{type:'date'},cycle)
  assert.equal(bound.calculator.inputTypes.cycle.elementType.type,'date')
  assert.equal(findCalculator(bound.calculator,[meter,cycle]),cycle)
  assert.equal(interactiveCalculator(bound.calculator,cycle),true)
})

test('object result selection roundtrips MathLive aliases and depends on its parent calculation', () => {
  const { rule, template } = fixture()
  delete rule.calculator.outputType.properties[0].name
  const expression = { id: 'minutes', inputs: [{ id: 'stats', metricId: 'statistics' }] }
  template.definitions.push(expression)
  const references = ruleFormulaReferences(template, expression, [state])
  const field = references.find(item => item.expression === "stats['activeDuration']")
  assert.equal(field.label, 'State duration · Runtime'); assert.equal(field.metricId, 'statistics')
  const latex = expressionToFormula("stats['activeDuration'] / 60", references)
  assert.ok(latex)
  const restored = formulaToExpression(latex, references)
  assert.equal(restored.expression, "(stats['activeDuration'] / 60)")
  assert.deepEqual(restored.metricIds, ['statistics'])
})

test('YAML completion is contextual for keys, enums, duration and exact provider versions', () => {
  assert.ok(algorithmSuggestions('parameters:\n  dur', state.configuration, state, [state]).some(item => item.label === 'duration' && item.insertText.includes('PT1H')))
  assert.deepEqual(algorithmSuggestions('parameters:\n  negativeDelta: re', meter.configuration, meter, [meter]).map(item => item.label), ['reject', 'rollover'])
  assert.deepEqual(algorithmSuggestions('parameters:\n  duration: ', state.configuration, state, [state]).map(item => item.label), ['PT1M', 'PT5M', 'PT1H'])
  assert.equal(algorithmSuggestions('providerVersion: ', state.configuration, state, [state, meter])[0].insertText, '"1"')
  assert.deepEqual(algorithmSuggestions('outputType:\n  properties:\n    unknown: ', state.configuration, state, [state]), [])
})

test('interactive changes and YAML share a draft; invalid text cannot overwrite or switch away', async () => {
  const view = mount()
  try {
    await flush()
    assert.equal(yaml(view), undefined)
    assert.ok(textContent(view.root).includes('Runtime'))
    const duration = nodes(view, 'external-shell').find(node => node.props.value === 1 && node.props['component-props']?.['aria-label'] === 'durationAmount')
    duration.props.onChange(2); await flush()
    assert.equal(view.props.rule.calculator.parameters.duration, 'PT7200S')
    mode(view).props.onClick(); await flush()
    assert.ok(yaml(view).props['model-value'].includes('custom: false'))
    yaml(view).props['onUpdate:modelValue']('{'); await flush()
    assert.equal(view.invalid.at(-1), true); assert.equal(yaml(view).props['model-value'], '{')
    mode(view).props.onClick(); await flush(); assert.ok(yaml(view))
    yaml(view).props['onUpdate:modelValue']('provider: state\nproviderVersion: "1"\ncustom: false\nparameters: []'); await flush()
    assert.equal(view.invalid.at(-1), true); assert.equal(view.props.rule.calculator.parameters.extra, 0)
    const valid = clone(view.props.rule.calculator); valid.parameters.duration = 'PT3H'
    yaml(view).props['onUpdate:modelValue'](JSON.stringify(valid)); await flush()
    assert.equal(view.invalid.at(-1), false); mode(view).props.onClick(); await flush()
    assert.equal(yaml(view), undefined)
    assert.equal(view.props.rule.calculator.parameters.duration, 'PT3H')
    assert.equal(view.props.rule.calculator.parameters.extra, 0); assert.equal(view.props.rule.calculator.custom, false)
    view.props.disabled = true; await flush()
    const before = view.patches.length
    nodes(view, 'external-shell').find(node => node.props.type === 'number').props.onChange(4); await flush()
    assert.equal(view.patches.length, before)
  } finally { view.close() }
})

test('boolean state binding requires explicit meanings and preserves false when completed', async () => {
  const view = mount()
  try {
    await flush()
    const source = nodes(view, 'external-shell').find(node => node.props['component-props']?.['aria-label'] === 'source · State')
    source.props.onChange('online'); await flush()
    const hints = () => nodes(view,'span').filter(node => node.props.role === 'status').map(textContent)
    assert.deepEqual(hints(), ['algorithmMissingParameter · Active', 'algorithmMissingParameter · Inactive'])
    assert.equal(view.invalid.at(-1), false)
    const field = name => nodes(view, 'external-shell').find(node => node.props['component-props']?.['aria-label'] === name)
    assert.deepEqual(field('Active').props['component-props'].options.map(item => item.value), ['true', 'false'])
    assert.equal(field('Active').props['component-props']['aria-invalid'], true)
    mode(view).props.onClick(); await flush(); assert.ok(yaml(view)); assert.deepEqual(hints(), [])
    mode(view).props.onClick(); await flush()
    field('Active').props.onChange('true'); await flush(); assert.deepEqual(hints(), ['algorithmMissingParameter · Inactive'])
    field('Inactive').props.onChange('false'); await flush(); assert.deepEqual(hints(), [])
    assert.equal(view.props.rule.calculator.parameters.inactiveValue, false)
    assert.equal(view.invalid.at(-1), false)
  } finally { view.close() }
})

test('数值状态0为已填写，不从算法默认值推断输入含义', async () => {
  const { rule, template } = fixture()
  delete rule.calculator.parameters.activeValue
  rule.calculator.parameters.inactiveValue = 0
  const view = mount({ rule, template })
  try {
    const hints = () => nodes(view,'span').filter(node => node.props.role === 'status').map(textContent)
    assert.deepEqual(hints(), ['algorithmMissingParameter · Active'])
    const active = nodes(view,'external-shell').find(node => node.props['component-props']?.['aria-label'] === 'Active')
    active.props.onChange(0); await flush()
    assert.deepEqual(hints(), [])
    assert.equal(view.props.rule.calculator.parameters.activeValue, 0)
  } finally { view.close() }
})

test('YAML completions are scoped to the active model and disposed across editor replacements', async () => {
  const view = mount()
  let closed = false
  try {
    mode(view).props.onClick(); await flush()
    const registrations = [], callbacks = []
    const model = { getValueInRange: () => 'parameters:\n  dur', getWordUntilPosition: () => ({ startColumn: 3 }) }
    const editor = { getModel: () => model, onDidDispose: callback => callbacks.push(callback) }
    const monaco = { languages: { CompletionItemKind: { Property: 9 }, registerCompletionItemProvider: (_language, provider) => {
      const registration = { provider, disposals: 0, dispose() { this.disposals++ } }; registrations.push(registration); return registration
    } } }
    yaml(view).props.init(editor, monaco)
    const position = { lineNumber: 2, column: 6 }
    assert.deepEqual(registrations[0].provider.provideCompletionItems({}, position).suggestions, [])
    assert.ok(registrations[0].provider.provideCompletionItems(model, position).suggestions.some(item => item.label === 'duration'))
    yaml(view).props.init(editor, monaco)
    callbacks[0](); assert.equal(registrations[1].disposals, 0)
    view.close(); closed = true; assert.equal(registrations[1].disposals, 1)
  } finally { if (!closed) view.close() }
})

test('metadata query failure is visible and disposed or superseded requests cannot replace the catalogue', async () => {
  const scope = effectScope(); let finish
  const api = { calculators: async () => { throw new Error('offline') } }
  const state = scope.run(() => useMetricTemplates(ref(true), api))
  try {
    await state.loadCalculators(); assert.equal(state.calculatorError.value, 'offline'); assert.deepEqual(state.calculators.value, [])
    api.calculators = () => new Promise(resolve => { finish = resolve })
    const old = state.loadCalculators()
    api.calculators = async () => [meter]
    await state.loadCalculators(); finish([]); await old
    assert.equal(state.calculators.value[0].name, meter.name); assert.equal(state.calculatorError.value, '')
    api.calculators = () => new Promise(resolve => { finish = resolve })
    const pending = state.loadCalculators(); scope.stop(); finish([]); await pending
    assert.equal(state.calculators.value[0].name, meter.name)
  } finally { scope.stop() }
})
