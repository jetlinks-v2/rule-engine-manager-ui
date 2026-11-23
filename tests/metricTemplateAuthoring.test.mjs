import assert from 'node:assert/strict'
import test from 'node:test'
import {effectScope,ref} from 'vue'
import {resolve} from 'node:path'
import {createMetricLoader,sourceRoot} from './helpers/metricRuntime.mjs'

const load=createMetricLoader({[resolve(sourceRoot,'components/Metric/api.ts')]:{metricApi:{}}})
const {useMetricTemplates}=load('components/Metric/template/useMetricTemplates.ts')
const {templateReferenceStarter,captureTemplateExample,exampleFacts}=load('components/Metric/template/templateAuthoring.ts')
const {localizedTemplate,metricTemplateTextEntries}=load('components/Metric/template/text.ts')
const {configurationObject,encodeConfiguration}=load('components/Metric/template/configurationText.ts')
const clone=value=>JSON.parse(JSON.stringify(value))
const template=()=>({id:'state',version:'2',name:'连接状态',thingType:'device',inputDefinitions:[
  {id:'status',name:'状态',valueType:{type:'enum',valueType:{type:'int'},elements:[{value:0,text:'离线'},{value:5,text:'维护'}]}},
  {id:'previous',name:'前值',valueType:{type:'int'}},
  {id:'event',name:'事件',valueType:{type:'object',properties:[{id:'at',name:'时间',valueType:{type:'date'}},{id:'confirmed',name:'确认',valueType:{type:'boolean'}}]}}],
  parameterDefinitions:[{id:'enabled',name:'启用',valueType:{type:'boolean'},expands:{defaultValue:false,editable:true}}],parameters:{enabled:false},
  definitions:[{id:'result',name:'结果',expressionTree:{type:'reference',name:'status'},options:{stateLabels:[{value:5,name:'维护',icon:'color:#722ed1'}]}}],
  outputs:[{metricId:'result',label:'连接状态',persist:true,custom:false}],options:{custom:{zero:0},i18nMessages:{name:{en:'Connection'},'input.status.enum.5':{en:'Maintenance'},'input.event.field.at.name':{en:'Time'},'rule.result.state.5.name':{en:'Maintenance'}}}})
const facts=spec=>({configuration:{targetType:'device',targetId:'private-device',templateId:spec.id,templateVersion:spec.version,inputMappings:{
  status:{kind:'provider',thingType:'device',thingId:'private-device',id:'state',providerSource:{provider:'business',configuration:{secret:'private'}}},
  previous:{kind:'provider',thingType:'device',thingId:'private-device',id:'state',providerSource:{provider:'business',configuration:{secret:'private'}}},
  event:{kind:'property',id:'event'}},parameters:{enabled:false}},samples:[
  {sourceKind:'provider',thingType:'device',thingId:'private-device',metricId:'state',providerSource:{provider:'business',configuration:{secret:'private'}},value:0,eventTime:1000,ingestTime:1100,processTime:1200,quality:{valid:true,attributes:{stateSince:900}}},
  {thingType:'device',thingId:'private-device',metricId:'event',value:{at:1000,confirmed:false},eventTime:1000}],endAt:3000})

test('参考发布快照完整复制，未发布草稿和实体身份不进入新模板',async()=>{
  const spec=template(),entity={id:'persisted',revision:3,editRevision:8,released:true,available:true,template:spec,draft:{...spec,name:'未发布修改'}}
  const original=clone(entity),scope=effectScope()
  try {
    const model=scope.run(()=>useMetricTemplates(ref(true)))
    model.open(undefined,templateReferenceStarter(entity))
    assert.equal(model.selected.value,undefined)
    assert.notEqual(model.draft.value.id,spec.id)
    assert.equal(model.draft.value.name,'连接状态')
    for (const section of ['inputDefinitions','parameterDefinitions','parameters','definitions','outputs']) assert.deepEqual(clone(model.draft.value[section]),spec[section])
    assert.equal(model.draft.value.options.authoring.reference.revision,3)
    assert.equal(model.hasChanges.value,false)
    model.draft.value.inputDefinitions[0].valueType.elements[1].text='检修'
    assert.deepEqual(entity,original)
    assert.equal(model.hasChanges.value,true)
  } finally {scope.stop()}
})

test('保存样本剥离业务身份，保留共享报文、0/false、日期、质量及观察时间',()=>{
  const spec=template(),input=facts(spec),original=clone(input)
  const example=captureTemplateExample(spec,input)
  assert.deepEqual(example.sources,[['status','previous'],['event']])
  assert.ok(!JSON.stringify(example).includes('private'))
  const restored=exampleFacts(spec,example)
  assert.equal(restored.samples.length,2)
  assert.deepEqual(restored.configuration.inputMappings.status,restored.configuration.inputMappings.previous)
  assert.equal(restored.samples[0].value,0)
  assert.equal(restored.samples[0].quality.attributes.stateSince,900)
  assert.equal(restored.samples[0].processTime,1200)
  assert.deepEqual(restored.samples[1].value,{at:1000,confirmed:false})
  assert.equal(restored.configuration.parameters.enabled,false)
  assert.equal(restored.endAt,3000)
  assert.deepEqual(captureTemplateExample(spec,restored),example)
  assert.deepEqual(input,original)
})

test('样本和开关参与脏状态，保存重开及格式切换可继续试算',async()=>{
  let stored,request
  const api={saveTemplate:async spec=>(stored={id:'new',template:clone(spec),released:false,editRevision:1}),queryTemplates:async()=>({data:[]}),simulate:async value=>(request=value,{status:'success',results:[]})}
  const scope=effectScope()
  try {
    const model=scope.run(()=>useMetricTemplates(ref(true),api))
    const spec=template()
    model.open(undefined,{id:spec.id,name:spec.name,template:spec,simulation:facts(spec)})
    assert.equal(model.keepExample.value,true)
    assert.equal(model.hasChanges.value,false)
    const input=configurationObject(model.simulationText.value,model.format.value)
    input.samples[0].value=5
    model.simulationText.value=encodeConfiguration(input,model.format.value)
    assert.equal(model.hasChanges.value,true)
    await model.save()
    assert.equal(model.hasChanges.value,false)
    model.close();model.open(stored)
    assert.equal(model.keepExample.value,true)
    model.switchFormat('json');model.switchMode('full');model.switchMode('form')
    assert.equal(model.hasChanges.value,false)
    await model.simulate()
    assert.equal(request.samples[0].value,5)
    assert.equal(request.samples.length,2)
    assert.equal(request.template.options.authoring,undefined)
    model.keepExample.value=false
    assert.equal(model.hasChanges.value,true)
    await model.save()
    assert.equal(stored.template.options.authoring.example,undefined)
    model.open(stored);assert.equal(model.keepExample.value,false)
  } finally {scope.stop()}
})

test('多语言投影按编码与字段定位，保留类型、颜色与原始模板',()=>{
  const spec=template(),original=clone(spec)
  spec.inputDefinitions[0].valueType.elements.reverse()
  const view=localizedTemplate(spec,'en')
  assert.equal(view.name,'Connection')
  assert.deepEqual(view.inputDefinitions[0].valueType.elements[0],{value:5,text:'Maintenance'})
  assert.equal(view.inputDefinitions[2].valueType.properties[0].name,'Time')
  assert.equal(view.inputDefinitions[2].valueType.properties[0].valueType.type,'date')
  assert.deepEqual(view.definitions[0].options.stateLabels[0],{value:5,name:'Maintenance',icon:'color:#722ed1'})
  assert.equal(metricTemplateTextEntries(view)['input.status.enum.5'],'Maintenance')
  spec.inputDefinitions[0].valueType.elements.reverse()
  assert.deepEqual(spec,original)
})
