import assert from 'node:assert/strict'
import test from 'node:test'
import {resolve} from 'node:path'
import {defineComponent,effectScope,h,reactive,ref} from 'vue'
import {createMetricLoader,createMetricRenderer,flush,walk,textContent,sourceRoot} from './helpers/metricRuntime.mjs'

const load = createMetricLoader({'vue-i18n':{useI18n:()=>({t:key=>key,locale:ref('zh')})},[resolve(sourceRoot,'components/Metric/api.ts')]:{metricApi:{}}})
const {renameTemplateInput,inputIdentityIssue} = load('components/Metric/template/inputIdentity.ts')
const {inputSchemaIssue} = load('components/Metric/template/inputSchema.ts')
const {ruleFormulaReferences} = load('components/Metric/template/formula.ts')
const {useTemplateDesigner} = load('components/Metric/template/useTemplateDesigner.ts')
const {useTemplateSimulation} = load('components/Metric/template/useTemplateSimulation.ts')
const {useMetricTemplates} = load('components/Metric/template/useMetricTemplates.ts')
const Schema = load('components/Metric/template/TemplateInputSchema.vue').default
const doc = () => ({id:'new',name:'测试',version:'1',inputDefinitions:[{id:'input1',name:'连接状态',valueType:{type:'enum',elements:[{value:0,text:'离线'},{value:1,text:'在线'}]}}],definitions:[],outputs:[],parameterDefinitions:[],parameters:{}})
const tree = root => ({version:1,root})
const reference = id => ({type:'reference',id,path:[]})

test('输入重命名同步结构化引用、依赖、输出和翻译，保留显式别名及来源身份',()=>{
  const value = doc()
  value.definitions = [
    {id:'result',dependsOn:['input1'],sourceMetric:'input1',expressionTree:tree({type:'conditional',condition:reference('input1'),whenTrue:{type:'reference',id:'metricValues',path:['input1','inputTimeStart']},whenFalse:{type:'literal',valueType:'string',value:'input1'}}),temporalCondition:{enterTree:tree(reference('input1'))}},
    {id:'bound',inputs:[{id:'oldAlias',metricId:'input1',maxAge:'PT1M'},{id:'external',metricId:'input1',source:{kind:'property',thingId:'device-1'}}],expressionTree:tree(reference('oldAlias'))},
  ]
  value.outputs = [{metricId:'input1',label:'原始状态'}]
  value.options = {i18nMessages:{'input.input1.name':{en:'Connection'},'rule.result.name':{en:'Result'}}}
  const before = JSON.stringify(value)
  const next = renameTemplateInput(value,0,'connectionState')
  assert.equal(next.inputDefinitions[0].id,'connectionState')
  assert.deepEqual(next.definitions[0].dependsOn,['connectionState'])
  assert.equal(next.definitions[0].sourceMetric,'connectionState')
  assert.equal(next.definitions[0].expressionTree.root.condition.id,'connectionState')
  assert.deepEqual(next.definitions[0].expressionTree.root.whenTrue.path,['connectionState','inputTimeStart'])
  assert.equal(next.definitions[0].expressionTree.root.whenFalse.value,'input1')
  assert.equal(next.definitions[0].temporalCondition.enterTree.root.id,'connectionState')
  assert.equal(next.definitions[1].inputs[0].metricId,'connectionState')
  assert.equal(next.definitions[1].inputs[0].id,'oldAlias')
  assert.equal(next.definitions[1].inputs[0].maxAge,'PT1M')
  assert.equal(next.definitions[1].inputs[1].metricId,'input1')
  assert.equal(next.definitions[1].expressionTree.root.id,'oldAlias')
  assert.equal(next.outputs[0].metricId,'connectionState')
  assert.deepEqual(next.options.i18nMessages['input.connectionState.name'],{en:'Connection'})
  assert.equal(next.options.i18nMessages['input.input1.name'],undefined)
  assert.equal(JSON.stringify(value),before)
  assert.deepEqual(ruleFormulaReferences(next,next.definitions[0])[0].schema.elements.map(item=>item.value),[0,1])
})

test('空白及冲突标识不写入；高级脚本保留原文，有显式别名时可安全改目标身份',()=>{
  const value = doc(); value.definitions = [{id:'result',dependsOn:['input1'],expression:"input1 == 'input1' ? 1 : 0"}]
  assert.equal(inputIdentityIssue(value,0,''),'inputIdRequired')
  assert.equal(inputIdentityIssue(value,0,'result'),'inputIdDuplicate')
  assert.equal(inputIdentityIssue(value,0,'renamed'),'inputIdScript')
  assert.throws(()=>renameTemplateInput(value,0,'renamed'),/inputIdScript/)
  value.definitions[0].inputs = [{id:'input1',metricId:'input1'}]
  const next = renameTemplateInput(value,0,'renamed')
  assert.equal(next.definitions[0].expression,value.definitions[0].expression)
  assert.deepEqual(next.definitions[0].inputs,[{id:'input1',metricId:'renamed'}])
  value.inputDefinitions.push({id:'sensor-a'})
  assert.equal(inputIdentityIssue(value,0,'sensor_a'),'inputIdDuplicate')
})

test('草稿重命名及撤回同步模拟映射键，物理来源和其他节点修改保留',()=>{
  const scope = effectScope(), value = ref(doc()), disabled = ref(false)
  const facts = {configuration:{targetType:'device',targetId:'gateway',inputMappings:{input1:{kind:'property',id:'physical-state',thingId:'gateway'}}},samples:[{thingType:'device',thingId:'gateway',metricId:'physical-state',value:0,eventTime:1000}]}
  const text = ref(JSON.stringify(facts))
  const trial = scope.run(()=>useTemplateSimulation({template:value,text,format:ref('json'),results:ref([]),response:ref(),loading:ref(false),invalidate(){}}))
  const renames = []
  const view = scope.run(()=>useTemplateDesigner(value,disabled,next=>{value.value=next},(previous,next)=>{
    renames.push([previous,next]); trial.renameInput(previous,next)
  }))
  try {
    view.select({kind:'input',index:0}); assert.equal(view.patch({id:'connectionState'}),true)
    assert.equal(trial.facts.configuration.inputMappings.connectionState.id,'physical-state')
    value.value = {...value.value,parameters:{limit:0}}
    view.revert()
    assert.equal(value.value.inputDefinitions[0].id,'input1')
    assert.deepEqual(value.value.parameters,{limit:0})
    assert.deepEqual(renames,[['input1','connectionState'],['connectionState','input1']])
    assert.equal(trial.facts.configuration.inputMappings.input1.id,'physical-state')
    assert.equal(trial.facts.samples[0].metricId,'physical-state')
    assert.equal(trial.facts.samples[0].value,0)
  } finally {scope.stop()}
})

test('嵌套声明只校验重复字段及编码，0/false和未知旧类型保持合法',()=>{
  assert.equal(inputSchemaIssue(undefined),undefined)
  assert.equal(inputSchemaIssue({type:'vendor-type'}),undefined)
  assert.equal(inputSchemaIssue({type:'enum',elements:[{value:0},{value:false},{value:'0'}]}),undefined)
  assert.equal(inputSchemaIssue({type:'enum',elements:[]}),'inputChoiceRequired')
  assert.equal(inputSchemaIssue({type:'enum',elements:[{value:0},{value:0}]}),'inputChoiceDuplicate')
  assert.equal(inputSchemaIssue({type:'array',elementType:{type:'object',properties:[{id:'status'},{id:'status'}]}}),'inputFieldDuplicate')
})

test('连续改标识后编辑翻译，撤回恢复当前输入的原始翻译并保留模板修改',()=>{
  for (const original of [undefined,{en:'Original connection'}]) {
    const scope = effectScope(), value = ref(doc())
    value.value.options = {i18nMessages:{name:{en:'Template'},...(original ? {'input.input1.name':original} : {})}}
    const view = scope.run(()=>useTemplateDesigner(value,ref(false),next=>{value.value=next}))
    try {
      view.select({kind:'input',index:0})
      view.patch({id:'connectionState'})
      view.setMessages({...value.value.options.i18nMessages,'input.connectionState.name':{en:'After rename'}})
      view.patch({id:'state'})
      view.setMessages({...value.value.options.i18nMessages,'input.state.name':{en:'After second rename'}})
      value.value = {...value.value,options:{i18nMessages:{...value.value.options.i18nMessages,name:{en:'New template'}}}}
      view.revert()
      assert.equal(value.value.inputDefinitions[0].id,'input1')
      assert.deepEqual(value.value.options.i18nMessages,{name:{en:'New template'},...(original ? {'input.input1.name':original} : {})})
    } finally {scope.stop()}
  }
})

test('模板声明通过完整配置与保存边界往返，保留类型、枚举编码和扩展字段',async()=>{
  const scope = effectScope(), value=doc(), writes=[]
  value.inputDefinitions.push({id:'gateway',valueType:{type:'object',properties:[{id:'values',valueType:{type:'array',elementType:{type:'double',unit:'℃'}}}]},custom:false})
  value.inputDefinitions[0].valueType.elements.push({value:false,text:'未确认'})
  const view = scope.run(()=>useMetricTemplates(ref(true),{
    queryTemplates:async()=>({data:[],total:0}),
    saveTemplate:async template=>{writes.push(template);return {id:'key',released:false,editRevision:1,template}},
  }))
  try {
    view.open({id:'key',released:false,editRevision:0,template:value})
    view.switchMode('full')
    const saved=await view.save()
    assert.equal(writes.length,1)
    assert.deepEqual(writes[0].inputDefinitions,value.inputDefinitions)
    view.close(); view.open(saved)
    assert.deepEqual(view.draft.value.inputDefinitions,value.inputDefinitions)
  } finally {scope.stop()}
})

test('真实声明编辑器配置数值和布尔枚举，候选及只读回调使用同一canonical元数据',async()=>{
  const {renderer,root} = createMetricRenderer(), props = reactive({modelValue:undefined,disabled:false})
  const changes = []
  const app = renderer.createApp({setup:()=>()=>h(Schema,{...props,'onUpdate:modelValue':value=>{props.modelValue=value;changes.push(value)}})})
  app.component('a-button',defineComponent({inheritAttrs:false,setup:(_,{attrs,slots})=>()=>h('button',attrs,slots.default?.())}))
  app.config.warnHandler=()=>{}; app.mount(root)
  const field = label => walk(root,node=>node.props['component-props']?.['aria-label']===label)[0]
  const button = label => walk(root,node=>node.type==='button' && textContent(node)===label)[0]
  try {
    field('inputDataType').props.onChange('enum'); await flush()
    button('parameterAddChoice').props.onClick(); await flush()
    assert.equal(props.modelValue.elements[0].value,0)
    field('parameterChoiceLabel').props.onChange('离线'); await flush()
    assert.equal(props.modelValue.elements[0].text,'离线')
    field('inputCodeType').props.onChange('boolean'); await flush()
    assert.equal(props.modelValue.elements[0].value,false)
    const value = doc(); value.inputDefinitions[0].valueType=props.modelValue
    assert.deepEqual(ruleFormulaReferences(value,{id:'result'})[0].schema.elements,[{value:false,text:'离线'}])
    const callback=field('inputDataType').props.onChange, count=changes.length
    props.disabled=true; await flush(); callback('object'); await flush()
    assert.equal(changes.length,count)
  } finally {app.unmount()}
})
