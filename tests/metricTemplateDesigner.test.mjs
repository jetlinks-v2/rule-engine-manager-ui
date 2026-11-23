import assert from 'node:assert/strict'
import test from 'node:test'
import { effectScope, ref, reactive, defineComponent, h } from 'vue'
import { resolve } from 'node:path'
import { createMetricLoader, createMetricRenderer, flush, walk, textContent, sourceRoot } from './helpers/metricRuntime.mjs'

const load = createMetricLoader({
  'vue-i18n': { useI18n: () => ({ t: key => key, locale: { value: 'zh' } }) },
  [resolve(sourceRoot, 'components/Metric/api.ts')]: { metricApi: {} },
  [resolve(sourceRoot, 'components/Metric/template/TemplateFormulaEditor.vue')]: { default: defineComponent({
    inheritAttrs: false, setup: (_props, { attrs }) => () => h('formula-boundary', attrs),
  }), __esModule: true },
})
const { useTemplateDesigner } = load('components/Metric/template/useTemplateDesigner.ts')
const { useMetricTemplates } = load('components/Metric/template/useMetricTemplates.ts')
const { templateGraph } = load('components/Metric/template/designer.ts')
const NodeEditor = load('components/Metric/template/TemplateNodeEditor.vue').default
const template = () => ({ id: 'rise', version: '1', name: '温升',
  inputDefinitions: [{ id: 'temperature', name: '绕组温度', unit: 'Cel', maxAge: 'PT30S', custom: false }, { id: 'ambient', name: '环境温度', unit: 'Cel' }],
  definitions: [{ id: 'rise', type: 'composite', dependsOn: ['temperature'], expression: '#temperature', window: { mode: 'none', extension: 0 } }],
  outputs: [{ metricId: 'rise', label: '温升', persist: false, publish: true, custom: { x: 0 } }],
  parameterDefinitions: [{ id: 'limit', name: '限值', valueType: { type: 'double' } }], parameters: { limit: 0 }, options: { unknown: false },
})

test('仅空白新建预置一个未配置输入，初始不脏；参考和撤回复用普通新输入规则',()=>{
  const scope=effectScope(),editable=ref(true)
  try {
    const model=scope.run(()=>useMetricTemplates(editable))
    model.open()
    assert.deepEqual(model.draft.value.inputDefinitions,[{id:'input1',presence:'required'}])
    assert.deepEqual(model.draft.value.definitions,[]);assert.deepEqual(model.draft.value.outputs,[])
    assert.equal(model.hasChanges.value,false)
    const editor=scope.run(()=>useTemplateDesigner(model.draft,ref(false),value=>{model.draft.value=value},undefined,true))
    assert.deepEqual(editor.selection.value,{kind:'input',index:0})
    assert.equal(editor.applyInputReference({id:'temperature',name:'温度',valueType:{type:'double'},semantics:{semanticId:'urn:temperature'}}),'applied')
    assert.equal(model.draft.value.inputDefinitions[0].id,'temperature')
    assert.deepEqual(model.draft.value.inputDefinitions[0].semantics,{semanticId:'urn:temperature'})
    editor.revert();assert.deepEqual(model.draft.value.inputDefinitions,[])
    const empty={...template(),inputDefinitions:[],definitions:[],outputs:[]}
    model.open({id:'saved',released:false,template:empty});assert.deepEqual(model.draft.value.inputDefinitions,[])
    model.open({id:'published',released:true,template:empty});assert.deepEqual(model.draft.value.inputDefinitions,[])
    model.open(undefined,{id:'starter',name:'起点',template:empty});assert.deepEqual(model.draft.value.inputDefinitions,[])
    model.open(undefined,{id:'rise',name:'温升',template:template()});assert.equal(model.draft.value.inputDefinitions.length,2)
    editable.value=false;model.open();assert.deepEqual(model.draft.value.inputDefinitions,[])
  } finally {scope.stop()}
})

test('输出候选只包含计算结果及窗口族结果',()=>{
  const spec={...template(),definitions:[{id:'stats',windowFamily:{ranges:[{outputs:[{id:'maximum'}]}]}}],outputs:[{metricId:'maximum'}]}
  const {renderer,root}=createMetricRenderer(),app=renderer.createApp({setup:()=>()=>h(NodeEditor,{template:spec,node:{kind:'output',index:0}})})
  app.config.warnHandler=()=>{};app.mount(root)
  try {
    const source=walk(root,node=>node.props.class==='node-editor__output-choice')[0]
    assert.deepEqual(source.props['component-props'].options.map(item=>item.value),['stats','maximum'])
  } finally {app.unmount()}
})

test('窗口族输出复用生产节点，依赖排序、连线与独立公开输出一致',()=>{
  const spec={...template(),definitions:[{id:'consumer',dependsOn:['maximum']},{id:'statistics',sourceMetric:'temperature',windowFamily:{ranges:[{outputs:[{id:'minimum'},{id:'maximum'}]}]}}],outputs:[{metricId:'maximum'}]}
  const graph=templateGraph(spec)
  const family=graph.nodes.find(node=>node.key==='rule-1'), consumer=graph.nodes.find(node=>node.key==='rule-0')
  assert.ok(consumer.level>family.level)
  assert.ok(graph.edges.some(edge=>edge.source==='rule-1' && edge.target==='rule-0'))
  assert.ok(graph.edges.some(edge=>edge.source==='rule-1' && edge.target==='output-0'))
})

test('从业务起点创建独立模板与试算事实，固定引用随新身份更新且不污染示例', async () => {
  let request
  const scope = effectScope()
  const view = scope.run(() => useMetricTemplates(ref(true), { simulate: async value => { request = value; return { status: 'success', results: [] } } }))
  const starter = { id: 'rise', name: '温升', description: '', groupId:'maintenance', icon:'HeartOutlined', template: template(), simulation: {
    configuration: { templateId: 'rise', templateVersion: '1', inputMappings: { temperature: { kind: 'property', id: 'temp' } } },
    samples: [{ value: 0, eventTime: 1000, quality: { valid: true } }], endAt: 2000,
  } }
  try {
    view.open(undefined, starter)
    const firstId = view.draft.value.id
    assert.equal(view.draft.value.options.category,'maintenance')
    assert.equal(view.draft.value.options.icon,'HeartOutlined')
    assert.equal(starter.template.options.category,undefined)
    assert.ok(firstId.startsWith('rise-'))
    view.draft.value.name = 'New name'
    await view.simulate()
    assert.equal(request.configuration.templateId, firstId)
    assert.equal(request.template.id, firstId)
    assert.equal(request.samples[0].value, 0)
    assert.equal(request.endAt, 2000)
    assert.equal(request.includeRecords, true)
    view.draft.value.id = 'renamed'
    view.draft.value.version = '2'
    await view.simulate()
    assert.equal(request.configuration.templateId, 'renamed')
    assert.equal(request.configuration.templateVersion, '2')
    view.open(undefined, starter)
    assert.notEqual(view.draft.value.id, firstId)
    assert.equal(view.draft.value.name, '温升')
    assert.equal(starter.template.id, 'rise')
    assert.equal(starter.simulation.configuration.templateId, 'rise')
  } finally { scope.stop() }
})
function designer() {
  const scope = effectScope(); const value = ref(template()); const disabled = ref(false); const commits = []
  const view = scope.run(() => useTemplateDesigner(value, disabled, next => { commits.push(next); value.value = next }))
  return { scope, value, disabled, commits, view }
}

test('算法单位修改同步直接输出，清除、切换与撤回保持其他输出和展示配置', () => {
  const { scope, value, view } = designer()
  try {
    const calculator = { provider:'calibration', providerVersion:'1', outputType:{type:'double'}, outputUnit:'L' }
    value.value.definitions[0].calculator = calculator
    value.value.outputs[0].unit = 'L'
    value.value.outputs.push({metricId:'other',unit:'kPa'})
    const original = JSON.stringify(value.value)
    view.select({kind:'rule',index:0})
    view.patch({calculator:{...calculator,outputUnit:'m³'}})
    assert.equal(value.value.outputs[0].unit,'m³')
    assert.equal(value.value.outputs[1].unit,'kPa')
    assert.deepEqual(value.value.outputs[0].custom,{x:0})
    view.patch({calculator:{...calculator,outputUnit:''}})
    assert.equal(value.value.outputs[0].unit,undefined)
    view.revert()
    assert.equal(JSON.stringify(value.value),original)
    view.patch({calculator:{provider:'filter',outputType:{type:'boolean'}}})
    assert.equal(value.value.outputs[0].unit,undefined)
    view.revert()
    assert.equal(value.value.outputs[0].unit,'L')
  } finally {scope.stop()}
})

test('属性修改直接进入页面草稿，切换保留，撤回仅影响当前项并保留扩展及0/false', () => {
  const { scope, value, commits, view } = designer()
  try {
    view.select({ kind: 'input', index: 0 }); view.patch({ name: '温度' }); view.move(1); view.patch({ unit: 'K' })
    assert.equal(value.value.inputDefinitions[0].name, '温度'); assert.equal(value.value.inputDefinitions[1].unit, 'K')
    view.revert(); assert.equal(value.value.inputDefinitions[0].name, '温度'); assert.equal(value.value.inputDefinitions[1].unit, 'Cel')
    view.select({ kind: 'output', index: 0 }); view.patch({ label: '温升结果', publish: false }); view.select()
    assert.equal(commits.length, 4); assert.equal(view.selection.value, undefined)
    assert.deepEqual(value.value.outputs[0], { metricId: 'rise', label: '温升结果', persist: false, publish: false, custom: { x: 0 } })
    assert.deepEqual(value.value.options, { unknown: false }); assert.equal(value.value.parameters.limit, 0)
  } finally { scope.stop() }
})

test('错误文本阻止节点及主体切换/添加；撤回恢复，撤权后旧回调不能修改草稿', () => {
  const { scope, value, disabled, commits, view } = designer()
  try {
    view.select({ kind: 'rule', index: 0 }); view.invalid.value = true; view.move(1); view.select(); view.add('input')
    assert.equal(view.selection.value.kind, 'rule'); assert.equal(view.view.value.inputDefinitions.length, 2); assert.equal(commits.length, 0)
    view.revert(); assert.equal(view.invalid.value, false)
    view.select({ kind: 'input', index: 0 }); view.patch({ name: '未提交' }); disabled.value = true
    assert.equal(value.value.inputDefinitions[0].name, '未提交')
    const before = commits.length
    view.patch({ name: '只读' }); view.revert(); view.add('input'); assert.equal(commits.length, before)
    disabled.value = false; view.select({ kind: 'rule', index: 0 }); value.value = { ...template(), id:'other' }; assert.equal(view.selection.value, undefined)
  } finally { scope.stop() }
})

test('添加删除即时更新草稿，新项可撤回，删除末项仍能连续编辑', () => {
  const { scope, value, view } = designer()
  try {
    view.add('input'); assert.equal(value.value.inputDefinitions.at(-1).id, 'input1'); view.revert(); assert.equal(value.value.inputDefinitions.length, 2)
    view.add('rule'); view.patch({ expression: '#rise * 2', dependsOn: ['rise'] }); view.add('output')
    assert.equal(value.value.outputs.at(-1).metricId, 'result1')
    view.select({ kind: 'output', index: 1 }); view.remove(); assert.ok(view.selection.value); assert.equal(value.value.outputs.length, 1)
  } finally { scope.stop() }
})

test('从图中节点接续计算和输出采用所选来源，取消不残留且不改写已有分支', () => {
  const { scope, value, view, disabled } = designer()
  try {
    const before = JSON.stringify(value.value)
    view.add('rule', { kind:'input', index:1 })
    assert.deepEqual(view.view.value.definitions.at(-1).dependsOn, ['ambient'])
    assert.equal(view.view.value.definitions.at(-1).expression, '')
    assert.deepEqual(view.view.value.definitions[0].dependsOn, ['temperature'])
    view.revert(); assert.equal(JSON.stringify(value.value), before)
    assert.equal(view.add('output', { kind:'input', index:0 }), false)
    assert.equal(JSON.stringify(value.value), before)
    view.add('rule', { kind:'rule', index:0 }); view.patch({ expression:'#rise * 2' })
    assert.deepEqual(value.value.definitions.at(-1).dependsOn, ['rise'])
    view.add('output', { kind:'rule', index:0 })
    assert.equal(value.value.outputs.at(-1).metricId, 'rise')
    disabled.value = true; const length = value.value.definitions.length
    view.add('rule', { kind:'input', index:0 }); assert.equal(value.value.definitions.length, length)
  } finally { scope.stop() }
})

test('节点单动作直接接续，多动作菜单可输出，候选换代与只读边界一致', async () => {
  const Graph = load('components/Metric/template/TemplateGraph.vue').default
  const { renderer, root } = createMetricRenderer(); const additions = [], selections = [], blanks = []
  const props = reactive({ template:template(), selected:{kind:'input',index:1}, addKinds:['input','rule','output'],
    onAdd: (...args) => additions.push(args), onSelect:(...args) => selections.push(args), onBackground:() => blanks.push(true) })
  const app = renderer.createApp({ setup: () => () => h(Graph, props) })
  for (const type of ['a-button','a-dropdown','a-menu','a-menu-item']) app.component(type, defineComponent({ inheritAttrs:false,
    setup:(_props,{ attrs, slots }) => () => h(type, attrs, Object.values(slots).flatMap(slot => slot?.())) }))
  app.config.warnHandler = () => {}; app.mount(root)
  const plus = key => walk(root, n => n.props['data-add-from'] === key)[0]
  try {
    const button = plus('input-1')
    assert.ok(button); assert.equal(plus('output-0'), undefined)
    const node = walk(root, n => n.props['data-node'] === 'input-1')[0]
    assert.equal(walk(node.parent, n => n === button).length, 1)
    assert.equal(walk(button, n => n.type === 'button').length, 1)
    assert.equal(node.parent.props.class.includes('is-selected'),true)
    assert.equal(walk(node.parent,n=>n.type==='a-menu').length,0)
    const staleSingle = button.props.onClick
    button.props.onClick({ currentTarget:button })
    await flush()
    assert.deepEqual(additions[0], ['rule',button,{ kind:'input', index:1 }]); assert.equal(selections.length, 0)
    const ruleButton = plus('rule-0');let restoredFocus=0
    ruleButton.focus=()=>{restoredFocus++}
    ruleButton.props.onClick({currentTarget:ruleButton})
    const menu = walk(ruleButton.parent,n=>n.type==='a-menu')[0]
    assert.deepEqual(walk(menu,n=>n.type==='a-menu-item').map(textContent),['addNextCalculation','addOutput'])
    assert.equal(additions.length,1)
    ruleButton.parent.props.onOpenChange(true);await flush()
    assert.equal(ruleButton.parent.props.open,true)
    let stopped=0
    menu.props.onKeydown({key:'Escape',preventDefault(){},stopPropagation(){stopped++}});await flush()
    assert.equal(ruleButton.parent.props.open,false);assert.equal(stopped,1);assert.equal(restoredFocus,1)
    menu.props.onClick({key:'output'});await flush()
    assert.deepEqual(additions[1],['output',ruleButton,{kind:'rule',index:0}])
    const background = walk(root, n => n.props.class === 'template-graph')[0]
    background.props.onClick({ target:{ closest:() => button } }); assert.equal(blanks.length, 0)
    background.props.onClick({ target:{ closest:() => null } }); assert.equal(blanks.length, 1)
    const stale = menu.props.onClick
    props.addKinds = ['rule']; await flush()
    assert.equal(walk(root, n => n.props['data-add-root'] === 'input').length, 0)
    assert.equal(walk(root, n => n.type === 'a-menu-item' && textContent(n).includes('addOutput')).length, 0)
    stale({ key:'output' }); assert.equal(additions.length, 2)
    const ruleSingle = plus('rule-0')
    assert.equal(walk(ruleSingle.parent,n=>n.type==='a-menu').length,0)
    ruleSingle.props.onClick({currentTarget:ruleSingle});await flush()
    assert.deepEqual(additions[2],['rule',ruleSingle,{kind:'rule',index:0}])
    props.addKinds = []; await flush(); assert.equal(plus('input-1'), undefined)
    stale({ key:'rule' });staleSingle({currentTarget:button});assert.equal(additions.length, 3)
    props.addKinds=['rule'];props.outputLocked=true;await flush()
    const lockedButton=plus('rule-0')
    lockedButton.props.onClick({currentTarget:lockedButton})
    const lockedMenu=walk(lockedButton.parent,n=>n.type==='a-menu')[0]
    const lockedOutput=walk(lockedMenu,n=>n.type==='a-menu-item' && n.props.disabled)[0]
    assert.match(textContent(lockedOutput),/addOutput.*publishedOutputLocked/)
    lockedMenu.props.onClick({key:'output'});assert.equal(additions.length,3)
    props.outputLocked=false
    props.template.inputDefinitions = []; props.template.definitions = []; props.template.outputs = []
    props.addKinds = ['input','rule','output']; await flush()
    assert.equal(walk(root, n => n.props['data-add-root']).length,0)
    assert.equal(walk(root,n=>n.type==='a-empty')[0].props.description,'emptyDesign')
  } finally { app.unmount() }
})

test('同一图标的计算方式与定时语义合并展示，悬浮仍保留两种说明',()=>{
  const Graph=load('components/Metric/template/TemplateGraph.vue').default
  const spec=template()
  spec.definitions[0]={id:'rise',calculator:{provider:'state',providerVersion:'1',parameters:{duration:'PT1H',maxHold:'PT2M'}},window:{mode:'none',emitPolicy:'onSchedule',emitInterval:'PT1M'}}
  const {renderer,root}=createMetricRenderer(),app=renderer.createApp({setup:()=>()=>h(Graph,{template:spec,calculators:[{id:'duration',name:'状态时长',icon:'ClockCircleOutlined',configuration:spec.definitions[0].calculator}]})})
  app.component('a-tooltip',defineComponent({inheritAttrs:false,setup:(_,{attrs,slots})=>()=>h('hint',attrs,slots.default?.())}))
  app.config.warnHandler=()=>{};app.mount(root)
  try {
    const node=walk(root,n=>n.props['data-node']==='rule-0')[0]
    const hints=walk(node,n=>n.type==='hint' && String(n.props.title).includes('状态时长'))
    assert.equal(hints.length,1)
    assert.match(hints[0].props.title,/状态时长\ngraphEvery/)
  } finally {app.unmount()}
})

test('撤回当前节点的翻译不会覆盖模板名称翻译及先前节点修改', () => {
  const { scope, value, view } = designer()
  try {
    value.value.options.i18nMessages = { name:{ en:'Template' }, 'input.temperature.name':{ en:'Winding' } }
    view.select({ kind:'input', index:0 }); view.patch({ name:'新温度' })
    view.setMessages({ ...value.value.options.i18nMessages, 'input.temperature.name':{ en:'Temperature' } })
    value.value = { ...value.value, name:'新模板', options:{ ...value.value.options, i18nMessages:{ ...value.value.options.i18nMessages, name:{ en:'New template' } } } }
    view.invalid.value = true; const version = view.editorVersion.value
    view.revert()
    assert.equal(value.value.inputDefinitions[0].name, '绕组温度')
    assert.equal(value.value.name, '新模板')
    assert.deepEqual(value.value.options.i18nMessages, { name:{ en:'New template' }, 'input.temperature.name':{ en:'Winding' } })
    assert.equal(view.invalid.value, false); assert.equal(view.editorVersion.value, version + 1)
  } finally { scope.stop() }
})

test('保存锁定结束后撤回以保存结果为基线，新节点不会被当成未保存项移除', () => {
  const { scope, value, disabled, view } = designer()
  try {
    view.add('input'); view.patch({ name:'新测点' })
    disabled.value = true
    value.value = JSON.parse(JSON.stringify(value.value))
    disabled.value = false
    view.patch({ name:'再次修改' }); view.revert()
    assert.equal(value.value.inputDefinitions.at(-1).name, '新测点')
    assert.equal(value.value.inputDefinitions.length, 3)
  } finally { scope.stop() }
})

test('关系图读取多级、前向声明及显式输入引用；未知或循环不挂起、不伪造连线', () => {
  const value = template()
  value.definitions = [{ id: 'last', dependsOn: ['middle'] }, { id: 'middle', inputs: [{ id: 'a', metricId: 'temperature' }, { id: 'b', metricId: 'ambient' }] }]
  value.outputs[0].metricId = 'last'
  const graph = templateGraph(value)
  assert.equal(graph.edges.length, 4)
  assert.ok(graph.nodes.find(x => x.index === 0 && x.kind === 'rule').level > graph.nodes.find(x => x.index === 1 && x.kind === 'rule').level)
  value.definitions = [{ id: 'a', dependsOn: ['b'] }, { id: 'b', dependsOn: ['a', 'unknown'] }]
  assert.equal(templateGraph(value).edges.length, 2)
  value.definitions = [{ id: 'temperature', sourceMetric: 'temperature' }]; value.outputs[0].metricId = 'temperature'
  assert.deepEqual(templateGraph(value).edges.map(edge => edge.key), ['input-0:rule-0', 'rule-0:output-0'])
})

test('同一模板在可视与YAML/JSON间往返，坏文本不覆盖草稿及扩展字段', async () => {
  const scope = effectScope(); const view = scope.run(() => useMetricTemplates(ref(true), {}))
  try {
    view.open({ id: 'e', released: false, template: template() }); view.draft.value.definitions[0].expression = '#temperature - #ambient'
    const changed = JSON.stringify(view.draft.value)
    view.switchMode('full'); view.switchFormat('json'); assert.equal(JSON.parse(view.fullText.value).definitions[0].window.extension, 0)
    view.switchMode('form'); assert.equal(JSON.stringify(view.draft.value), changed); view.switchMode('full')
    const original = JSON.stringify(view.draft.value); view.fullText.value = '{'; view.switchMode('form')
    assert.equal(view.mode.value, 'full'); assert.equal(JSON.stringify(view.draft.value), original); assert.equal(view.fullText.value, '{')
    view.fullText.value = '{"definitions":null}'; view.switchMode('form'); assert.equal(view.mode.value, 'full')
    view.fullText.value = original; view.switchMode('form'); assert.equal(view.draft.value.options.unknown, false)
    assert.equal(view.draft.value.definitions[0].expression, '#temperature - #ambient')
    view.open({ id: 'e', released: false, template: template() }); view.switchMode('full'); view.switchMode('form'); assert.equal(view.hasChanges.value, false)
  } finally { scope.stop() }
})

test('撤销与配置往返忽略对象顺序及空值字面量省略，保留真实配置差异', () => {
  const scope=effectScope(),view=scope.run(()=>useMetricTemplates(ref(true),{}))
  const value=template();value.definitions[0].expressionTree={version:1,root:{type:'literal',valueType:'null'}}
  try {
    view.open({id:'e',template:value})
    view.draft.value.definitions[0].expressionTree.root.value=null
    assert.equal(view.hasChanges.value,false)
    view.switchMode('full');view.switchFormat('json')
    const reorder=item=>Array.isArray(item)?item.map(reorder):item && typeof item==='object'
      ? Object.fromEntries(Object.keys(item).reverse().map(key=>[key,reorder(item[key])])) : item
    view.fullText.value=JSON.stringify(reorder(view.draft.value));assert.equal(view.hasChanges.value,false)
    view.switchMode('form')
    view.draft.value.options.custom=null;assert.equal(view.hasChanges.value,true)
    delete view.draft.value.options.custom;assert.equal(view.hasChanges.value,false)
    view.draft.value.definitions[0].expressionTree.root={type:'literal',valueType:'long',value:'9007199254740993'}
    assert.equal(view.hasChanges.value,true)
    view.draft.value=structuredClone(value);assert.equal(view.hasChanges.value,false)
    view.draft.value.inputDefinitions.reverse();assert.equal(view.hasChanges.value,true)
  } finally {scope.stop()}
})

test('完整配置校验定位业务区块，失败时保留原文与草稿且不发出保存', async () => {
  const scope=effectScope(),calls=[]
  const view=scope.run(()=>useMetricTemplates(ref(true),{saveTemplate:async()=>{calls.push('save')}},
    (key,args)=>key==='templateConfigurationArray' ? `${args.section}:${args.field}` : `localized:${key}`))
  try {
    view.open({id:'e',template:template()});view.switchMode('full');view.switchFormat('json')
    const previous=JSON.stringify(view.draft.value)
    for(const field of ['inputDefinitions','parameterDefinitions','definitions','outputs']) {
      const invalid=JSON.stringify({...template(),[field]:{}});view.fullText.value=invalid
      view.switchMode('form');await view.save()
      assert.equal(view.mode.value,'full');assert.ok(view.error.value.endsWith(`:${field}`))
      assert.equal(view.fullText.value,invalid);assert.equal(JSON.stringify(view.draft.value),previous)
    }
    view.fullText.value='[]';view.switchMode('form');assert.equal(view.error.value,'localized:invalidObject')
    view.fullText.value=JSON.stringify({...template(),parameters:[]});view.switchMode('form')
    assert.equal(view.error.value,'localized:templateConfigurationParameters');assert.equal(calls.length,0)
    view.fullText.value=previous;view.switchMode('form');assert.equal(view.error.value,'');assert.equal(view.hasChanges.value,false)
  } finally {scope.stop()}
})

test('模板分类读取完整集合，关闭会话后迟到试算不回填或改变首页列表', async () => {
  const scope = effectScope(); let finishSimulation, query
  const rows = Array.from({length:25},(_,i)=>({ id:`row-${i}`, template:template() }))
  const view = scope.run(()=>useMetricTemplates(ref(true),{
    queryTemplates:async value=>{ query=value; return { data:value.paging===false?rows:rows.slice(0,20),total:25 } },
    simulate:()=>new Promise(resolve=>{ finishSimulation=resolve }),
  }))
  try {
    await view.load()
    assert.equal(view.entities.value.length,25)
    assert.equal(query.paging,false)
    view.open(rows[24]); const pending=view.simulate()
    view.close()
    finishSimulation({ status:'success', results:[{metricId:'rise',value:5}] }); await pending
    assert.equal(view.draft.value,undefined)
    assert.equal(view.selected.value,undefined)
    assert.equal(view.simulationResponse.value,undefined)
    assert.equal(view.simulating.value,false)
    assert.equal(view.entities.value.length,25)
  } finally { scope.stop() }
})

test('修改规则、样本、权限或卸载后，旧试算结果和晚到响应均不可回填', async () => {
  const scope = effectScope(); const editable = ref(true); let resolveResult
  const view = scope.run(() => useMetricTemplates(editable, { simulate: () => new Promise(resolve => { resolveResult = resolve }) }))
  try {
    view.open({ id: 'e', released: false, template: template() })
    for (const change of [() => { view.draft.value.parameters.limit = 1 }, () => { view.simulationText.value += '\n' }, () => { editable.value = false }]) {
      editable.value = true; const pending = view.simulate(); change(); resolveResult({ status: 'success', results: [{ metricId: 'rise', value: 35 }], records: [], recordsTruncated: false }); await pending
      assert.deepEqual(view.simulationResults.value, []); assert.equal(view.simulating.value, false)
    }
    editable.value = true; const first = view.simulate(); resolveResult({ status: 'success', results: [{ metricId: 'rise', value: false }], records: [], recordsTruncated: false }); await first
    assert.equal(view.simulationResults.value[0].value, false)
    view.draft.value.inputDefinitions[0].maxAge = 'PT5S'; assert.deepEqual(view.simulationResults.value, [])
    const pending = view.simulate(); scope.stop(); resolveResult({ status: 'success', results: [{ metricId: 'rise', value: 99 }], records: [], recordsTruncated: false }); await pending; assert.deepEqual(view.simulationResults.value, [])
  } finally { scope.stop() }
})

test('保存并发布期间撤权不继续发起发布', async () => {
  const scope = effectScope(); const editable = ref(true); let finishSave; let releases = 0
  const view = scope.run(() => useMetricTemplates(editable, { saveTemplate: () => new Promise(resolve => { finishSave = resolve }), queryTemplates: async () => ({ data: [], total: 0 }), releaseTemplate: async () => { releases++ } }))
  try {
    view.open(); const pending = view.release(); editable.value = false
    finishSave({ id: 'e', released: false, template: template() }); await pending; assert.equal(releases, 0)
  } finally { scope.stop() }
})

function mountRule(rule) {
  const { renderer, root } = createMetricRenderer(); const patches = []; const invalid = []
  const props = reactive({ template: template(), rule, disabled: false, onPatch: fields => { patches.push(fields); Object.assign(props.rule, fields) }, onInvalid: value => invalid.push(value) })
  props.template.definitions = [props.rule]
  const app = renderer.createApp({ setup: () => () => h(NodeEditor, { ...props, node: { kind: 'rule', index: 0 } }) })
  for (const type of ['a-form', 'a-form-item', 'a-select', 'a-button', 'a-dropdown', 'a-menu', 'a-menu-item', 'a-textarea', 'a-collapse', 'a-collapse-panel', 'a-alert', 'a-input', 'a-input-number', 'a-space']) {
    app.component(type, defineComponent({ inheritAttrs: false, setup: (_props, { attrs, slots }) => () => h(type, attrs, Object.entries(slots).flatMap(([name, slot]) => name === 'option' ? [] : slot?.())) }))
  }
  app.config.warnHandler = () => {}; app.mount(root)
  return { root, props, patches, invalid, close: () => app.unmount() }
}
const switchKind = (editor, key) => walk(editor.root, node => node.type === 'a-menu' && node.props['aria-label'] === 'calculationMethod')[0].props.onClick({ key })
const inlineField = (root, label) => walk(root, node => node.type === 'external-shell' && node.props['component-props']?.['aria-label'] === label)[0]
test('公式编辑边界复用别名，显式输入与依赖同步，保留输入约束，禁用不提交', async () => {
  const editor = mountRule({ id: 'rise', expression: '#t + 1', dependsOn: ['temperature'], inputs: [{ id: 't', metricId: 'temperature', maxAge: 'PT10S' }] })
  try {
    const formula = () => walk(editor.root, x => x.type === 'formula-boundary')[0]
    assert.equal(formula().props.references[0].expression, 't')
    const plain=formula().props.references.filter(item=>!item.referenceId)
    assert.equal(plain[1].expression, 'ambient')
    assert.deepEqual(plain.map(item => item.group), ['data', 'data', 'parameter'])
    assert.equal(plain[2].expression, 'params.limit')
    formula().props.onChange({ expression: 't + ambient', metricIds: ['temperature', 'ambient'] }); await flush()
    assert.equal(editor.props.rule.expression, 't + ambient')
    assert.deepEqual(editor.props.rule.dependsOn, ['temperature', 'ambient'])
    assert.equal(editor.props.rule.inputs[0].maxAge, 'PT10S'); assert.equal(editor.props.rule.inputs[1].metricId, 'ambient')
    formula().props.onInvalid(true); await flush()
    switchKind(editor, 'temporal'); await flush()
    assert.equal(editor.patches.length, 2); assert.equal(editor.invalid.at(-1), false)
    assert.equal(editor.props.rule.expression, undefined)
    assert.ok(editor.props.rule.temporalCondition)
    formula().props.onInvalid(false)
    editor.props.disabled = true; await flush(); formula().props.onChange({ expression: '1', metricIds: [] }); await flush(); assert.equal(editor.patches.length, 2)
  } finally { editor.close() }
})
test('公式引用沿用后端输入别名清理规则；特殊参数键使用SpEL索引', async () => {
  const editor = mountRule({ id: 'rise', expression: 't_air', inputs: [{ id: 't-air', metricId: 'temperature' }] })
  try {
    editor.props.template.parameterDefinitions.push({ id: "factor-'key", name: '修正系数' }); await flush()
    const references = walk(editor.root, x => x.type === 'formula-boundary')[0].props.references
    assert.equal(references[0].expression, 't_air')
    assert.equal(references.find(item=>item.key === "parameter:factor-'key").expression, "params['factor-''key']")
    assert.equal(references.find(item=>item.key === "parameter:factor-'key").group, 'parameter')
  } finally { editor.close() }
})
test('真实算法编辑器保留坏YAML原文且不覆盖对象，修正后保留0/false与扩展元数据', async () => {
  const editor = mountRule({ id: 'usage', calculator: { provider: 'measurement', providerVersion: '1', parameters: { operation: 'increase' }, custom: false } })
  try {
    const textarea = () => walk(editor.root, x => x.type === 'external-shell' && x.props.language === 'yaml')[0]
    textarea().props['onUpdate:modelValue']('{'); await flush()
    assert.equal(textarea().props['model-value'], '{'); assert.equal(editor.invalid.at(-1), true); assert.equal(editor.props.rule.calculator.provider, 'measurement')
    textarea().props['onUpdate:modelValue']('provider: measurement\ncustom: false\nparameters:\n  zero: 0\n'); await flush()
    assert.equal(editor.invalid.at(-1), false); assert.equal(editor.props.rule.calculator.custom, false); assert.equal(editor.props.rule.calculator.parameters.zero, 0)
  } finally { editor.close() }
})

test('未完成输入关联仍可更换计算方式，避免困在算法编辑中', async () => {
  const editor = mountRule({ id: 'usage', calculator: { provider: 'measurement', providerVersion: '1', inputTypes: { reading: { type: 'array', elementType: { type: 'double' } } } } })
  try {
    await flush()
    assert.equal(editor.invalid.at(-1), false)
    switchKind(editor, 'expression')
    await flush()
    assert.equal(editor.props.rule.calculator, undefined)
  } finally { editor.close() }
})

test('持续条件未完成时仍可切换算法，旧错误清除且引用和共用约束保留', async () => {
  const editor = mountRule({id:'average',name:'内存一分钟均值',dependsOn:['temperature'],maxInputSkew:'PT10S',
    temporalCondition:{enterExpression:'',exitExpression:'',dwell:'PT3M',recovery:'PT1M'}})
  try {
    const formulas=walk(editor.root,node=>node.type==='formula-boundary')
    formulas[0].props.onInvalid(true);formulas[1].props.onInvalid(true);await flush()
    assert.equal(editor.invalid.at(-1),true)
    const method=walk(editor.root,node=>node.type==='a-button' && node.props['aria-label']==='calculationMethod')[0]
    assert.equal(method.props.disabled,false)
    switchKind(editor,'calculator');await flush()
    assert.equal(editor.props.rule.temporalCondition,undefined)
    assert.equal(editor.props.rule.calculator.provider,'')
    assert.equal(editor.invalid.at(-1),false)
    assert.equal(editor.props.rule.name,'内存一分钟均值')
    assert.deepEqual(editor.props.rule.dependsOn,['temperature'])
    assert.equal(editor.props.rule.maxInputSkew,'PT10S')
    switchKind(editor,'statistics');await flush()
    assert.equal(editor.props.rule.aggregation,'avg')
    assert.equal(editor.props.rule.calculator,undefined)
  } finally {editor.close()}
})

test('算法YAML无效时可更换计算方式，禁用态仍不能切换', async () => {
  const editor=mountRule({id:'usage',calculator:{provider:'measurement',providerVersion:'1',parameters:{operation:'increase'}}})
  try {
    walk(editor.root,node=>node.type==='external-shell' && node.props.language==='yaml')[0].props['onUpdate:modelValue']('{');await flush()
    assert.equal(editor.invalid.at(-1),true)
    switchKind(editor,'statistics');await flush()
    assert.equal(editor.invalid.at(-1),false)
    assert.equal(editor.props.rule.calculator,undefined)
    const count=editor.patches.length
    editor.props.disabled=true;await flush();switchKind(editor,'temporal');await flush()
    assert.equal(editor.patches.length,count)
    assert.equal(editor.props.rule.aggregation,'avg')
  } finally {editor.close()}
})

test('更换计算方式不清除仍适用的附加条件草稿错误', async () => {
  const editor=mountRule({id:'rise',expression:'temperature',applicabilityExpression:'temperature > 0',dependsOn:['temperature']})
  try {
    const summary=walk(editor.root,node=>node.props.class==='rule-editor__condition-summary')[0]
    walk(summary,node=>node.type==='a-button')[0].props.onClick();await flush()
    const formulas=walk(editor.root,node=>node.type==='formula-boundary')
    formulas[1].props.onInvalid(true);await flush()
    switchKind(editor,'statistics');await flush()
    assert.equal(editor.props.rule.aggregation,'avg')
    assert.equal(editor.props.rule.applicabilityExpression,'temperature > 0')
    assert.equal(editor.invalid.at(-1),true)
    walk(editor.root,node=>node.type==='formula-boundary')[0].props.onInvalid(false);await flush()
    assert.equal(editor.invalid.at(-1),false)
  } finally {editor.close()}
})

test('输入侧栏展示枚举合法选项和区间时间，读取模式切换不改变候选且不产生额外修改', async () => {
  const { renderer, root } = createMetricRenderer()
  const value = template()
  value.inputDefinitions[0].valueType = {type:'enum',elements:[{value:0,text:'离线'},{value:1,text:'在线'},{value:false,text:'未确认'}]}
  const props = reactive({template:value,node:{kind:'input',index:0}})
  const patches = []
  const app = renderer.createApp({setup:()=>()=>h(NodeEditor,{...props,onPatch:fields=>patches.push(fields)})})
  app.config.warnHandler = () => {}; app.mount(root)
  const available = () => walk(root,node=>node.props['aria-label'] === 'inputAvailable')[0]
  try {
    const text = textContent(available())
    assert.ok(text.includes('parameterEnum'))
    assert.ok(text.includes('离线0')); assert.ok(text.includes('在线1')); assert.ok(text.includes('未确认false'))
    assert.ok(text.includes('输入区间开始inputDateType')); assert.ok(text.includes('输入区间结束inputDateType'))
    assert.equal(walk(available(),node=>['button','input','external-shell'].includes(node.type)).length,0)
    assert.deepEqual(patches,[])
    inlineField(root,'readMode').props.onChange('history'); await flush()
    assert.deepEqual(patches,[{source:{lookback:'PT1H'}}])
    props.template.inputDefinitions[0].source = patches[0].source
    await flush()
    assert.equal(textContent(available()),text)
    assert.equal(props.template.inputDefinitions[0].valueType.type,'enum')
  } finally { app.unmount() }
})

test('输入侧栏只读展示嵌套对象字段和单位，不从默认值推断未知类型', async () => {
  const { renderer, root } = createMetricRenderer()
  const value = template()
  value.inputDefinitions[0] = {...value.inputDefinitions[0],valueType:{type:'object',properties:[
    {id:'zone',name:'防火分区',valueType:{type:'string'}},
    {id:'statistics',name:'统计',valueType:{type:'object',properties:[{id:'elapsed',name:'持续时间',valueType:{type:'double',unit:'s'}}]}},
  ]}}
  const props = reactive({template:value,node:{kind:'input',index:0},disabled:true,published:true})
  const patches = []
  const app = renderer.createApp({setup:()=>()=>h(NodeEditor,{...props,onPatch:fields=>patches.push(fields)})})
  app.config.warnHandler = () => {}; app.mount(root)
  const available = () => walk(root,node=>node.props['aria-label'] === 'inputAvailable')[0]
  try {
    let text = textContent(available())
    assert.ok(text.includes('inputValueparameterObject')); assert.ok(text.includes('防火分区parameterText'))
    assert.ok(text.includes('统计 · 持续时间parameterNumber · s'))
    props.template.inputDefinitions[0] = {...props.template.inputDefinitions[0],valueType:undefined,defaultValue:123}
    await flush()
    text = textContent(available())
    assert.ok(text.includes('inputUndeclaredType')); assert.ok(!text.includes('parameterNumber')); assert.ok(!text.includes('parameterText'))
    props.template.inputDefinitions[0].valueType = {type:'vendor-specific'}; await flush()
    assert.ok(textContent(available()).includes('inputUnknownType'))
    props.template.inputDefinitions[0].valueType = {type:'date'}; await flush()
    assert.ok(textContent(available()).includes('inputValueinputDateType'))
    assert.deepEqual(patches,[])
  } finally { app.unmount() }
})

test('历史输入切回最新值同步移除序列约束，其它来源扩展和输入约束保留', async () => {
  const { renderer, root } = createMetricRenderer(); const value = template(); let patch
  value.inputDefinitions[0] = { ...value.inputDefinitions[0], source: { lookback: 'PT1H', maxPoints: 128, extra: false }, minSamples: 2, maxGap: 'PT30M' }
  const app = renderer.createApp({ setup: () => () => h(NodeEditor, { template: value, node: { kind: 'input', index: 0 }, onPatch: fields => { patch = fields } }) })
  app.config.warnHandler = () => {}; app.mount(root)
  try {
    inlineField(root, 'readMode').props.onChange('latest'); await flush()
    assert.deepEqual(patch, { source: { lookback: undefined, maxPoints: undefined, extra: false }, minSamples: undefined, maxGap: undefined })
    assert.equal(value.inputDefinitions[0].maxAge, 'PT30S')
  } finally { app.unmount() }
})

test('输入数据要求保留零和false默认值，已发布限制与只读沿用原契约', async () => {
  const { renderer, root } = createMetricRenderer()
  const value = template()
  value.inputDefinitions[0] = { ...value.inputDefinitions[0], presence:'defaultValue', defaultValue:0, valueType:{type:'double'} }
  const props = reactive({ template:value, node:{kind:'input',index:0}, published:true, disabled:false })
  const app = renderer.createApp({setup:()=>()=>h(NodeEditor,props)})
  app.config.warnHandler = () => {}; app.mount(root)
  try {
    await flush()
    const defaultValue = () => walk(root,node=>node.type==='external-shell' && node.props.class?.includes('metric-parameter-value'))[0]
    assert.equal(defaultValue().props.value,0)
    assert.equal(defaultValue().props.type,'number')
    assert.equal(inlineField(root,'unit').props['component-props'].disabled,true)
    assert.equal(inlineField(root,'inputPresence').props['component-props'].disabled,true)
    assert.equal(inlineField(root,'readMode').props['component-props'].disabled,false)
    props.template.inputDefinitions[0] = {...props.template.inputDefinitions[0],defaultValue:false,valueType:{type:'boolean'}}
    await flush()
    assert.equal(defaultValue().props.value,'false')
    assert.equal(defaultValue().props.type,'select')
    defaultValue().props.onChange('true')
    props.disabled = true; await flush()
    assert.equal(inlineField(root,'readMode').props['component-props'].disabled,true)
    assert.equal(defaultValue().props['component-props'].disabled,true)
    assert.equal(walk(root,node=>node.type==='a-form').length,0)
  } finally { app.unmount() }
})

test('已发布输出可通过兼容修订开启计算依据，保留扩展并沿用编辑权限', async () => {
  const { renderer, root } = createMetricRenderer()
  const value = template()
  value.outputs[0].options = { custom:false }
  const props = reactive({ template:value, node:{kind:'output',index:0}, published:true, disabled:false })
  let patch
  const app = renderer.createApp({setup:()=>()=>h(NodeEditor,{...props,onPatch:fields=>{patch=fields}})})
  app.config.warnHandler = () => {}; app.mount(root)
  try {
    const setting = () => walk(root,node=>node.props?.['aria-label']==='evidenceRecord')[0]
    assert.equal(setting().props.disabled,false)
    assert.equal(setting().props.checked,false)
    setting().props.onChange(true); await flush()
    assert.deepEqual(patch,{options:{custom:false,explain:true}})
    assert.deepEqual(value.outputs[0].options,{custom:false})
    props.disabled=true; await flush()
    assert.equal(setting().props.disabled,true)
  } finally { app.unmount() }
})

test('输出类型与单位显式编辑，汇总往返只修改读取策略并保留结果用途',async()=>{
  const {renderer,root}=createMetricRenderer(),value=template(),invalid=[],patches=[]
  value.outputs[0].options={custom:false,explain:true}
  const props=reactive({template:value,node:{kind:'output',index:0},disabled:false,published:false})
  const app=renderer.createApp({setup:()=>()=>h(NodeEditor,{...props,onInvalid:value=>invalid.push(value),onPatch:fields=>{patches.push(fields);Object.assign(props.template.outputs[0],fields)}})})
  app.config.warnHandler=()=>{};app.mount(root)
  const mode=()=>walk(root,node=>node.type==='a-switch' && node.props['aria-label']==='policyMode')[0]
  try {
    assert.equal(inlineField(root,'outputDataType').props.value,undefined)
    assert.equal(inlineField(root,'unit').props.value,undefined)
    assert.equal(mode().props.disabled,true)
    mode().props.onChange(true);await flush();assert.equal(patches.length,0)
    assert.equal(props.template.outputs[0].valueType,undefined)
    assert.ok(textContent(root).includes('typeRequired'))
    const types=inlineField(root,'outputDataType').props['component-props'].options
    assert.ok(types.every(item=>item.icon && item.description && item.label));assert.ok(types.some(item=>item.value==='date'))
    inlineField(root,'outputDataType').props.onChange('double');await flush()
    inlineField(root,'unit').props.onChange('Cel');await flush()
    assert.equal(mode().props.disabled,false)
    mode().props.onChange(true);await flush()
    assert.deepEqual(Object.keys(patches.at(-1)),['options'])
    assert.equal(props.template.outputs[0].options.readAggregation.defaultOperation,'average')
    assert.equal(props.template.outputs[0].valueType,'double');assert.equal(props.template.outputs[0].unit,'Cel')
    assert.equal(props.template.outputs[0].persist,false);assert.equal(props.template.outputs[0].publish,true)
    assert.equal(invalid.at(-1),false)
    mode().props.onChange(false);await flush()
    assert.deepEqual(props.template.outputs[0].options,{custom:false,explain:true})
    inlineField(root,'outputDataType').props.onChange('enum');await flush()
    mode().props.onChange(true);await flush()
    assert.equal(props.template.outputs[0].options.readAggregation.semantic,'state')
    assert.equal(props.template.outputs[0].options.readAggregation.defaultOperation,'distribution')
    inlineField(root,'outputDataType').props.onChange('object');await flush()
    assert.equal(invalid.at(-1),true);assert.ok(textContent(root).includes('typeIncompatible'))
    assert.equal(walk(root,node=>node.type==='details' && node.props.class==='read-policy')[0].props.open,true,'类型与策略冲突时自动展开，不把修正入口藏在折叠区')
    mode().props.onChange(false);await flush();assert.equal(invalid.at(-1),false)
    assert.equal(mode().props.disabled,true);assert.equal(props.template.outputs[0].valueType,'object')
    inlineField(root,'outputDataType').props.onChange(undefined);await flush()
    assert.equal(props.template.outputs[0].valueType,undefined);assert.equal(invalid.at(-1),false)
  } finally {app.unmount()}
})

test('已发布输出类型和汇总只读，未声明类型的旧输出不会被回填',async()=>{
  const {renderer,root}=createMetricRenderer(),value=template(),patches=[]
  const props=reactive({template:value,node:{kind:'output',index:0},published:true,disabled:false})
  const app=renderer.createApp({setup:()=>()=>h(NodeEditor,{...props,onPatch:fields=>patches.push(fields)})})
  app.config.warnHandler=()=>{};app.mount(root)
  const mode=()=>walk(root,node=>node.type==='a-switch' && node.props['aria-label']==='policyMode')[0]
  try {
    await flush();assert.equal(patches.length,0);assert.equal(value.outputs[0].valueType,undefined)
    assert.equal(inlineField(root,'outputDataType').props['component-props'].disabled,true)
    assert.equal(inlineField(root,'unit').props['component-props'].disabled,true)
    assert.equal(mode().props.disabled,true)
    props.template.outputs[0]={...props.template.outputs[0],valueType:'double'};await flush()
    mode().props.onChange(true);await flush();assert.equal(patches.length,0)
    props.published=false;props.disabled=true;await flush()
    assert.equal(inlineField(root,'outputDataType').props['component-props'].disabled,true)
    assert.equal(mode().props.disabled,true)
  } finally {app.unmount()}
})

test('窗口统计通过来源/时长/统计方式组装真实规则；切回公式无残留字段', async () => {
  const editor = mountRule({ id: 'average', type: 'composite', expression: 'temperature', dependsOn: ['temperature'], window: { mode: 'none' } })
  try {
    switchKind(editor, 'statistics'); await flush()
    assert.equal(editor.props.rule.type, 'feature'); assert.equal(editor.props.rule.window.timeMode, 'event')
    inlineField(editor.root, 'statisticSource').props.onChange('ambient'); await flush()
    assert.equal(editor.props.rule.sourceMetric, 'ambient'); assert.deepEqual(editor.props.rule.dependsOn, ['ambient'])
    inlineField(editor.root, 'windowRange').props.onChange('latestN'); await flush()
    assert.equal(editor.props.rule.window.size, '5'); assert.equal(editor.props.rule.window.emitPolicy, 'onEvent')
    switchKind(editor, 'expression'); await flush()
    assert.equal(editor.props.rule.window, undefined); assert.equal(editor.props.rule.aggregation, undefined)
  } finally { editor.close() }
})

test('公式和算法可定时；随数据的算法不残留不支持的window对象', async () => {
  const editor = mountRule({ id: 'r', type: 'composite', expression: 'temperature', dependsOn: ['temperature'] })
  try {
    const trigger = () => inlineField(editor.root, 'calculationTrigger')
    trigger().props.onChange('onSchedule'); await flush()
    assert.equal(editor.props.rule.window.mode, 'none'); assert.equal(editor.props.rule.window.emitInterval, 'PT5M')
    switchKind(editor, 'calculator'); await flush()
    trigger().props.onChange('onSchedule'); await flush(); trigger().props.onChange('onEvent'); await flush()
    assert.equal(editor.props.rule.window, undefined)
    editor.props.disabled = true; await flush(); trigger().props.onChange('onSchedule'); assert.equal(editor.props.rule.window, undefined)
  } finally { editor.close() }
})

test('附加条件按需编辑和清除，不丢手动依赖，时间要求保留摘要且禁用不提交', async () => {
  const editor = mountRule({ id: 'ratio', expression: 'temperature / ambient', dependsOn: ['temperature', 'ambient'], maxInputSkew: 'PT30S' })
  const action = key => walk(editor.root, node => node.type === 'a-button' && textContent(node).includes(key))[0]
  const formulas = () => walk(editor.root, node => node.type === 'formula-boundary')
  try {
    assert.equal(formulas().length, 1)
    assert.ok(textContent(editor.root).includes('noExtraCondition'))
    assert.ok(textContent(walk(editor.root, node => node.type === 'summary')[0]).includes('inputSkewSummary'))
    action('addCondition').props.onClick(); await flush()
    assert.equal(formulas().length, 2)
    formulas()[1].props.onChange({ expression: 'temperature > 0', metricIds: ['temperature'] }); await flush()
    assert.deepEqual(editor.props.rule.dependsOn, ['temperature', 'ambient'])
    formulas()[1].props.onInvalid(true); await flush()
    assert.equal(editor.invalid.at(-1), true)
    assert.equal(action('collapseEditor').props.disabled, true)
    action('clearCondition').props.onClick(); await flush()
    assert.equal(editor.props.rule.applicabilityExpression, undefined)
    assert.equal(editor.invalid.at(-1), false)
    assert.equal(formulas().length, 1)
    assert.deepEqual(editor.props.rule.dependsOn, ['temperature', 'ambient'])
    const staleAdd = action('addCondition').props.onClick
    editor.props.disabled = true; await flush()
    assert.equal(action('addCondition'), undefined)
    const before = editor.patches.length
    // 撤权后即使旧回调打开本地编辑器，也不能改写配置。
    staleAdd(); await flush()
    formulas()[1].props.onChange({ expression: 'false' }); await flush()
    assert.equal(editor.patches.length, before)
  } finally { editor.close() }
})

test('节点名称与标识首行，计算方式归入用途标题，类型切换沿用已有字段收敛', async () => {
  const editor = mountRule({ id: 'ratio', name: '单位产量能耗', expression: 'temperature', dependsOn: ['temperature'] })
  try {
    const identity = walk(editor.root, node => node.type === 'header')[0]
    const id = walk(identity, node => node.props['aria-label'] === 'declarationId')[0]
    assert.equal(textContent(id), 'ratio')
    assert.equal(id.props['aria-label'], 'declarationId')
    assert.equal(walk(identity,node=>node.props['aria-label']==='calculationMethod').length,0)
    const method = walk(editor.root, node => node.props['aria-label']==='calculationMethod')[0]
    assert.equal(method.props['aria-label'], 'calculationMethod')
    const methodTitle=walk(editor.root,node=>node.props.class==='template-clause__title' && walk(node,item=>item === method).length)[0]
    assert.ok(methodTitle)
    assert.equal(walk(editor.root, node => node.type === 'a-menu-item').length, 4)
    assert.equal(walk(editor.root, node => node.props.description && node.props.icon).length, 4, 'all method choices reuse the icon and description component')
    const count = editor.patches.length
    switchKind(editor, 'expression'); await flush()
    assert.equal(editor.patches.length, count)
    assert.equal(editor.props.rule.expression, 'temperature')
    switchKind(editor, 'statistics'); await flush()
    assert.equal(editor.props.rule.aggregation, 'avg')
    assert.equal(editor.props.rule.expression, undefined)
  } finally { editor.close() }
})
