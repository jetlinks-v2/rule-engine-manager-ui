import assert from 'node:assert/strict'
import test from 'node:test'
import { defineComponent, h, reactive, ref } from 'vue'
import { createMetricLoader, createMetricRenderer, flush, walk, textContent } from './helpers/metricRuntime.mjs'

const FormulaEditor = createMetricLoader({ 'vue-i18n': { useI18n: () => ({ t: key => key,locale:ref('zh') }) } })('components/Metric/template/TemplateMathEditor.vue').default
test('公式图标和放大入口收进输入框；放大及关闭保留同一编辑实例',async()=>{
  const Workspace=createMetricLoader({'vue-i18n':{useI18n:()=>({t:key=>key,locale:ref('zh')})}})('components/Expression/ExpressionWorkspace.vue').default
  const {renderer,root}=createMetricRenderer()
  const app=renderer.createApp({setup:()=>()=>h(Workspace,{node:{type:'literal',valueType:'int',value:1},context:{references:[],functions:[]},stationary:true,hideHeading:true,editable:true},{default:({expand})=>[h('a-button',{'aria-label':'expandEdit',onClick:expand}),h('math-field')]})})
  app.component('a-button',defineComponent({inheritAttrs:false,setup:(_,{attrs,slots})=>()=>h('a-button',attrs,slots.default?.())}))
  app.config.warnHandler=()=>{};app.mount(root)
  const find=predicate=>walk(root,predicate)[0]
  try {
    await flush()
    const editor=find(node=>node.type==='math-field')
    assert.equal(find(node=>node.props.class==='expression-workspace__heading'),undefined)
    const expand=find(node=>node.props['aria-label']==='expandEdit')
    assert.ok(expand);assert.equal(textContent(expand),'')
    expand.props.onClick();await flush()
    assert.equal(find(node=>node.type==='math-field'),editor)
    assert.ok(find(node=>node.props.class==='expression-workspace__modal-heading'))
    find(node=>node.props['aria-label']==='close').props.onClick();await flush()
    assert.equal(find(node=>node.type==='math-field'),editor)
    assert.ok(find(node=>node.props['aria-label']==='expandEdit'))
  } finally {app.unmount()}
})
test('指标适配公共编辑器：查看不写回，编辑保存结构树、字段路径及依赖',async()=>{
  const {resolve}=await import('node:path')
  const {sourceRoot}=await import('./helpers/metricRuntime.mjs')
  const boundary=defineComponent({props:['modelValue','context','source','empty','disabled','hideMode'],emits:['change','invalid','reference-hover'],setup:(props,{emit})=>()=>h('math-editor',{
    hideMode:props.hideMode,node:props.modelValue?.root,context:props.context,disabled:props.disabled,empty:props.empty,
    commit:root=>emit('change',{expression:props.source.format({version:1,root}),expressionTree:{version:1,root}}),
    invalid:value=>emit('invalid',value)})})
  const loader=createMetricLoader({'vue-i18n':{useI18n:()=>({t:key=>key,locale:ref('zh')})},
    [resolve(sourceRoot,'components/Expression/MathExpressionEditor.vue')]:{default:boundary,__esModule:true}})
  const Editor=loader('components/Metric/template/TemplateFormulaEditor.vue').default
  const changes=[],invalid=[],props=reactive({modelValue:'input1 / 2',references:[{key:'input1',label:'测量值',expression:'input1',metricId:'input1',group:'data'},
    {key:'limit',label:'阈值',expression:'limit',group:'parameter'}],
    onInvalid:value=>invalid.push(value),onChange(value){changes.push(value);props.tree=value.expressionTree;props.modelValue=value.expression}})
  const {renderer,root}=createMetricRenderer(),app=renderer.createApp({setup:()=>()=>h(Editor,props)})
  app.config.warnHandler=()=>{};app.mount(root)
  const editor=()=>walk(root,n=>n.type==='math-editor')[0]
  try {
    await flush();assert.equal(changes.length,0)
    assert.equal(editor().props.node.operator,'divide');assert.equal(editor().props.hideMode,true)
    assert.equal(editor().props.context.references[0].label,'测量值')
    assert.notEqual(editor().props.context.references[0].group,editor().props.context.references[1].group)
    const current=editor().props.node
    const branch={type:'conditional',condition:{type:'literal',valueType:'boolean',value:true},whenTrue:current,whenFalse:{type:'literal',valueType:'null',value:null}}
    editor().props.commit(branch);await flush()
    assert.deepEqual(props.tree.root,branch);assert.deepEqual(changes[0].metricIds,['input1'])
    assert.deepEqual(editor().props.node.whenTrue,current)
    editor().props.invalid(true);assert.equal(invalid.at(-1),true)
    props.tree=undefined;props.modelValue='';await flush()
    assert.equal(editor().props.empty,true);assert.equal(changes.length,1)
    editor().props.commit(current);await flush()
    assert.equal(editor().props.empty,false);assert.equal(changes.length,2)
    props.disabled=true;await flush();editor().props.commit(current);assert.equal(changes.length,2)
    assert.equal(editor().props.disabled,true)
  } finally {app.unmount()}
})

test('指标引用保留字段路径、数据类型、单位和参数分组，显示不改变身份',()=>{
  const {templateExpressionReferences}=createMetricLoader()('components/Metric/template/formula.ts')
  const references=[{key:'temperature',label:'温度',expression:'temperature',metricId:'temperature',group:'data',schema:{type:'double'},unit:'℃'},
    {key:'limit',label:'上界',expression:'limit',group:'parameter',schema:{type:'int'}}]
  const zh=templateExpressionReferences(references,'zh'),en=templateExpressionReferences(references,'en')
  assert.equal(zh[0].schema.type,'double');assert.equal(zh[0].unit,'℃')
  assert.equal(zh[0].metricId,en[0].metricId);assert.deepEqual(zh[0].path,en[0].path)
  assert.notEqual(zh[0].group,en[0].group);assert.notEqual(zh[0].group,zh[1].group)
  assert.notEqual(zh[0].icon,zh[1].icon)
})

test('真实公式组件保留高级原文；只切换模式不改源码；禁用期间不接受编辑', async () => {
  const changes = []; const invalid = []
  const props = reactive({ modelValue: '  #t.toString()  ', references: [{ key: 'temperature', label: '温度', expression: '#t' }], disabled: false,
    onChange(value) { changes.push(value); props.modelValue = value.expression }, onInvalid(value) { invalid.push(value) } })
  const { renderer, root } = createMetricRenderer()
  const app = renderer.createApp({ setup: () => () => h(FormulaEditor, props) })
  for (const type of ['a-radio-group', 'a-radio-button', 'a-button', 'a-select', 'a-textarea', 'a-alert']) {
    app.component(type, defineComponent({ inheritAttrs: false, setup: (_props, { attrs, slots }) => () => h(type, attrs, Object.entries(slots).flatMap(([name,slot]) => name === 'option' ? [] : slot?.())) }))
  }
  app.config.warnHandler = () => {}; app.mount(root)
  const find = type => walk(root, node => node.type === type)[0]
  try {
    assert.equal(find('a-textarea').props.value, props.modelValue)
    const modeButton = () => walk(root, x => x.type === 'a-button' && ['editExpression', 'backToFormula'].includes(x.props['aria-label']))[0]
    assert.equal(modeButton().props.disabled, true)
    modeButton().props.onClick(); await flush()
    assert.equal(changes.length, 0); assert.ok(find('a-textarea'))
    find('a-textarea').props['onUpdate:value']('#t + 1'); await flush()
    assert.deepEqual(changes, [{ expression: '#t + 1' }]); assert.equal(invalid.at(-1), false)
    modeButton().props.onClick(); await flush()
    assert.equal(find('a-textarea'), undefined); assert.equal(changes.length, 1)
    modeButton().props.onClick(); await flush()
    assert.equal(find('a-textarea').props.value, '#t + 1'); assert.equal(changes.length, 1)
    props.disabled = true; await flush()
    find('a-textarea').props['onUpdate:value']('99'); modeButton().props.onClick(); await flush()
    assert.equal(props.modelValue, '#t + 1'); assert.equal(changes.length, 1); assert.ok(find('a-textarea'))
    props.modelValue = '#unknown.run()'; await flush()
    assert.equal(find('a-textarea').props.value, '#unknown.run()')
  } finally { app.unmount() }
})


test('指标只提供公式编辑，无法投影的历史源码保留且不开放表达式输入',async()=>{
  const Editor=createMetricLoader({'vue-i18n':{useI18n:()=>({t:key=>key,locale:ref('zh')})}})('components/Metric/template/TemplateFormulaEditor.vue').default
  const changes=[],{renderer,root}=createMetricRenderer(),app=renderer.createApp(Editor,{modelValue:'#old.method()',references:[],onChange:value=>changes.push(value)})
  app.config.warnHandler=()=>{};app.mount(root)
  try{await flush();assert.equal(walk(root,node=>node.type==='a-textarea').length,0);assert.equal(walk(root,node=>node.type==='a-alert')[0].props.message,'formulaVisualUnavailable');assert.deepEqual(changes,[])}finally{app.unmount()}
})
