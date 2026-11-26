import test from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { defineComponent, effectScope, h, reactive, ref } from 'vue'
import { createMetricLoader, createMetricRenderer, flush, walk, textContent, sourceRoot, passthrough } from './helpers/metricRuntime.mjs'

const boundary = defineComponent({inheritAttrs:false,setup:(_, {attrs,slots})=>()=>h('boundary',attrs,[slots.default?.(),slots.tools?.(),slots['input-reference']?.()])})
const load = createMetricLoader({'vue-i18n':{useI18n:()=>({t:key=>key,locale:ref('zh')})},'@vueuse/core':{useElementSize:()=>({width:ref(1000)})},
  ...Object.fromEntries(['TemplateGraph','TemplateNodeEditor','TemplateSimulation','TemplateParameters','TemplatePresentation'].map(file=>[resolve(sourceRoot,`components/Metric/template/${file}.vue`),{default:boundary,__esModule:true}])),
  [resolve(sourceRoot,'components/Metric/api.ts')]:{metricApi:{}}})
const {useTemplateDesigner} = load('components/Metric/template/useTemplateDesigner.ts')
const {metricSourceSchema,metricSourceField} = load('components/Metric/sourceSchema.ts')
const empty = ()=>({id:'new',version:'1',name:'空白',inputDefinitions:[],definitions:[],outputs:[],parameterDefinitions:[],parameters:{}})

test('来源建议随身份变更、撤回及删除，不改变类型、公式和真实绑定',()=>{
  const template=ref({...empty(),inputDefinitions:[{id:'reading'}],options:{inputHints:{reading:{sources:['event','businessQuery']}},other:0}})
  const scope=effectScope()
  try {
    const editor=scope.run(()=>useTemplateDesigner(template,ref(false),value=>{template.value=value}))
    editor.select({kind:'input',index:0});editor.patch({id:'renamed'})
    assert.deepEqual(template.value.options.inputHints,{renamed:{sources:['event','businessQuery']}})
    editor.update({...template.value,options:{...template.value.options,inputHints:{renamed:{sources:['metric']}}}})
    editor.revert();assert.deepEqual(template.value.options.inputHints,{reading:{sources:['event','businessQuery']}})
    editor.remove();assert.deepEqual(template.value.options.inputHints,{})
    assert.equal(template.value.options.other,0)
    editor.add('input');editor.update({...template.value,options:{...template.value.options,inputHints:{[template.value.inputDefinitions[0].id]:{sources:['builtin']}}}})
    editor.revert();assert.deepEqual(template.value.options.inputHints,{})
  } finally {scope.stop()}
})

test('目录按声明转换嵌套对象、数组、枚举和日期，字段路径不猜测业务语义',()=>{
  const schema=metricSourceSchema({type:'object',properties:{status:{enum:[0,false],enumNames:['离线','否']},at:{type:'string',format:'date-time'},samples:{type:'array',items:{type:'number'}}}})
  const status=metricSourceField(schema,'status')
  assert.equal(status.type,'enum')
  assert.deepEqual(status.elements,[{value:0,text:'离线'},{value:false,text:'否'}])
  assert.deepEqual(status.enum,[0,false],'normalization preserves the original source declaration')
  assert.equal(metricSourceField(schema,'at').type,'date')
  assert.equal(metricSourceField(schema,'samples').type,'array')
  assert.deepEqual(metricSourceField(schema,'samples').elementType,{type:'double'})
  assert.equal(metricSourceField(schema,'unknown'),undefined)
  assert.equal(metricSourceField(schema,'$'),schema)
  assert.deepEqual(metricSourceSchema(reactive(schema)),JSON.parse(JSON.stringify(schema)),'reactive declarations retain their persisted JSON semantics')
})

test('真实值控件逐字段编辑并保留缺失、空、0、false、未知字段和空数组',async()=>{
  const Value=load('components/Metric/MetricParameterValue.vue').default
  const props=reactive({parameter:{id:'alarm',valueType:{type:'object',properties:[{id:'count',valueType:{type:'int'}},{id:'active',valueType:{type:'boolean'}},{id:'tags',valueType:{type:'array',elementType:{type:'string'}}}]}},modelValue:{count:0,active:false,tags:[],extra:'keep'},'onUpdate:modelValue':value=>{props.modelValue=value}})
  const {renderer,root}=createMetricRenderer(), app=renderer.createApp({setup:()=>()=>h(Value,props)})
  app.component('a-dropdown',passthrough('dropdown'));app.config.warnHandler=()=>{};app.mount(root)
  try {
    const number=walk(root,node=>node.type==='a-input-number')[0];number.props['onUpdate:value'](2);await flush()
    assert.deepEqual(props.modelValue,{count:2,active:false,tags:[],extra:'keep'})
    walk(root,node=>node.type==='a-switch')[0].props['onUpdate:checked'](true);await flush()
    assert.equal(props.modelValue.active,true)
    walk(root,node=>node.type==='a-button' && textContent(node).includes('valueAddElement'))[0].props.onClick();await flush()
    assert.deepEqual(props.modelValue.tags,[null])
    const menu=walk(root,node=>node.type==='a-menu-item')
    menu.find(node=>textContent(node)==='valueSetNull').props.onClick();await flush();assert.equal(props.modelValue.count,null)
    walk(root,node=>node.type==='a-menu-item' && textContent(node)==='valueUnset')[0].props.onClick();await flush();assert.equal(Object.hasOwn(props.modelValue,'count'),false)
    props.parameter={id:'when',valueType:{type:'date'}};props.modelValue=0;await flush()
    assert.equal(walk(root,node=>node.type==='a-date-picker')[0].props.value.valueOf(),0)
  } finally {app.unmount()}
})

test('从空模板创建输入后在侧栏参考，仅复制声明，迟到选择不写入另一个模板',async()=>{
  const Designer=load('components/Metric/template/TemplateDesigner.vue').default
  let finish
  const pickSource=Object.assign(()=>new Promise(resolve=>{finish=resolve}),{cancel(){}})
  const props=reactive({template:empty(),disabled:false,pickSource,'onUpdate:template':value=>{props.template=value}})
  const {renderer,root}=createMetricRenderer(), app=renderer.createApp({setup:()=>()=>h(Designer,props)})
  app.component('a-dropdown',passthrough('a-dropdown'));app.config.warnHandler=()=>{};app.mount(root)
  try {
    assert.equal(walk(root,node=>node.type==='a-button' && textContent(node).includes('inputImport')).length,0)
    walk(root,node=>node.type==='a-menu')[0].props.onClick({key:'input'});await flush()
    const click=()=>walk(root,node=>node.type==='a-button' && textContent(node).includes('inputReference'))[0].props.onClick()
    const pending=click();finish({mapping:{kind:'provider',thingId:'gateway-1',id:'alarm',providerSource:{provider:'device-events',sourceType:'event',configuration:{}}},label:'网关 / 火警',declaration:{name:'火警',valueType:{type:'object',properties:[{id:'value',valueType:{type:'int'}}]}}});await pending;await flush()
    assert.equal(props.template.inputDefinitions.length,1)
    assert.equal(props.template.inputDefinitions[0].name,'火警')
    assert.equal(props.template.inputDefinitions[0].id,'alarm')
    assert.equal(props.template.inputDefinitions[0].source,undefined)
    assert.equal(JSON.stringify(props.template).includes('gateway-1'),false)
    const same=click();props.template={...props.template,name:'同模板编辑'};await flush();finish({mapping:{kind:'property',id:'b'},declaration:{name:'温度',valueType:{type:'double'}}});await same;await flush()
    assert.equal(props.template.inputDefinitions.length,1)
    assert.equal(props.template.inputDefinitions[0].valueType.type,'object')
    assert.match(textContent(root),/inputReferenceOverwrite/)
    walk(root,node=>node.type==='a-button' && textContent(node)==='cancel')[0].props.onClick();await flush()
    const late=click();props.template={...empty(),id:'another'};await flush();finish({mapping:{kind:'property',id:'a'},declaration:{valueType:{type:'double'}}});await late;await flush()
    assert.equal(props.template.inputDefinitions.length,0)
  } finally {app.unmount()}
})

test('参考原标识及别名避重，手填身份保留；完整声明覆盖确认和撤回共用输入编辑规则',()=>{
  const template=ref({...empty(),inputDefinitions:[{id:'fire-alarm'}],definitions:[{id:'fire_alarm2'}]})
  const scope=effectScope(),editor=scope.run(()=>useTemplateDesigner(template,ref(false),value=>{template.value=value}))
  const schema={type:'object',properties:[{id:'state',valueType:{type:'enum',elements:[{value:0,text:'离线'},{value:false,text:'否'}]}},{id:'samples',valueType:{type:'array',elementType:{type:'double'}}}]}
  try {
    editor.add('input')
    assert.equal(editor.applyInputReference({id:'fire-alarm',name:'火警',valueType:schema,unit:'%'}),'applied')
    assert.equal(template.value.inputDefinitions[1].id,'fire-alarm3')
    assert.deepEqual(template.value.inputDefinitions[1].valueType,schema)
    editor.revert();assert.equal(template.value.inputDefinitions.length,1)
    editor.add('input');editor.patch({id:'manual',name:'手填名称',unit:'Cel',valueType:{type:'double'}})
    assert.equal(editor.applyInputReference({id:'fire-alarm',name:'参考名称',valueType:schema}),'confirm')
    assert.equal(template.value.inputDefinitions[1].unit,'Cel')
    assert.equal(editor.applyInputReference({id:'fire-alarm',name:'参考名称',valueType:schema},true),'applied')
    assert.equal(template.value.inputDefinitions[1].id,'manual');assert.equal(template.value.inputDefinitions[1].name,'手填名称')
    assert.equal(template.value.inputDefinitions[1].unit,undefined);assert.deepEqual(template.value.inputDefinitions[1].valueType,schema)
    editor.select({kind:'input',index:0});editor.patch({valueType:{type:'boolean'}})
    assert.equal(editor.applyInputReference({id:'other',name:'原输入',valueType:{type:'boolean'}}),'applied')
    assert.equal(template.value.inputDefinitions[0].id,'fire-alarm')
    editor.revert();assert.equal(template.value.inputDefinitions[0].valueType,undefined)
  } finally {scope.stop()}
})

test('内嵌参考切换输入或禁用即取消，迟到结果不写入另一个输入',async()=>{
  const Designer=load('components/Metric/template/TemplateDesigner.vue').default
  let finish,request,cancels=0
  const pickSource=Object.assign(next=>{request=next;return new Promise(resolve=>{finish=resolve})},{cancel(){cancels++},editor:defineComponent({setup:()=>()=>h('reference-catalog','catalog')})})
  const props=reactive({template:empty(),disabled:false,pickSource,'onUpdate:template':value=>{props.template=value}})
  const {renderer,root}=createMetricRenderer(),app=renderer.createApp({setup:()=>()=>h(Designer,props)})
  app.component('a-dropdown',passthrough('a-dropdown'));app.config.warnHandler=()=>{};app.mount(root)
  try {
    const button=label=>walk(root,node=>node.type==='a-button' && textContent(node)===label)[0]
    walk(root,node=>node.type==='a-menu')[0].props.onClick({key:'input'});await flush()
    const pending=button('inputReference').props.onClick();await flush()
    assert.equal(request.inline,true);assert.equal(request.input.id,'input1');assert.equal(walk(root,node=>node.type==='reference-catalog').length,1)
    walk(root,node=>node.type==='a-menu')[0].props.onClick({key:'input'});await flush()
    assert.ok(cancels>0);assert.equal(walk(root,node=>node.type==='reference-catalog').length,0)
    finish({mapping:{id:'late'},declaration:{name:'迟到',valueType:{type:'double'}}});await pending;await flush()
    assert.deepEqual(props.template.inputDefinitions.map(item=>item.id),['input1','input2'])
    const blocked=button('inputReference').props.onClick();props.disabled=true;await flush()
    finish({mapping:{id:'blocked'},declaration:{valueType:{type:'double'}}});await blocked
    assert.equal(props.template.inputDefinitions[1].valueType,undefined)
  } finally {app.unmount()}
})

test('枚举选择保留混合编码的真实类型，已发布类型可见且禁止修改',async()=>{
  const Value=load('components/Metric/MetricParameterValue.vue').default
  const props=reactive({parameter:{id:'state',valueType:{type:'enum',elements:[{value:0,text:'零'},{value:false,text:'否'},{value:'0',text:'文本零'}]}},modelValue:false,'onUpdate:modelValue':value=>{props.modelValue=value}})
  const {renderer,root}=createMetricRenderer(),app=renderer.createApp({setup:()=>()=>h(Value,props)})
  app.config.warnHandler=()=>{};app.mount(root)
  try {
    let select=walk(root,node=>node.type==='a-select')[0]
    assert.equal(select.props.value,'1');select.props.onChange('0');await flush();assert.equal(props.modelValue,0)
    select=walk(root,node=>node.type==='a-select')[0];select.props.onChange('2');await flush();assert.equal(props.modelValue,'0')
  } finally {app.unmount()}
  const Input=load('components/Metric/template/TemplateInputEditor.vue').default
  const second=createMetricRenderer(),locked=second.renderer.createApp({setup:()=>()=>h(Input,{input:{id:'state',valueType:{type:'enum',elements:[{value:0,text:'离线'}]}},published:true})})
  locked.config.warnHandler=()=>{};locked.mount(second.root)
  try {assert.match(textContent(second.root),/inputDataType/);assert.ok(walk(second.root,node=>node.props['aria-label']==='inputPublishedType').length)} finally {locked.unmount()}
})

test('没有计算时不创建无法被编译的输出',()=>{
  const template=ref({...empty(),inputDefinitions:[{id:'state'}]})
  const scope=effectScope(),editor=scope.run(()=>useTemplateDesigner(template,ref(false),value=>{template.value=value}))
  try {assert.equal(editor.add('output'),false);assert.deepEqual(template.value.outputs,[])} finally {scope.stop()}
})
