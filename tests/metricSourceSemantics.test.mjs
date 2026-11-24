import assert from 'node:assert/strict'
import test from 'node:test'
import { createMetricLoader } from './helpers/metricRuntime.mjs'

const { metricSourceMatchesSemantics: matches, metricSourceMatchesInput: selectable, metricSourceMatchesType: typeMatches, metricSourceSchema: schema } = createMetricLoader()('components/Metric/sourceSchema.ts')

test('通用JSON Schema映射器的x扩展保留到原字段和单位',()=>{
  const converted=schema({type:'object',properties:{reading:{type:'number','x-unit':'Pa','x-semanticId':'urn:example:pressure'}}})
  assert.equal(converted.properties[0].expands.semanticId,'urn:example:pressure')
  assert.equal(converted.properties[0].valueType.unit,'Pa')
})

test('模板按原元数据语义限制输入，开放词汇保留，不以名称推测用途',()=>{
  const declaration = { semanticId:'urn:iot:temperature',semanticTypes:['observation','industry:measurement'],semanticRole:'value' }
  assert.equal(matches(undefined,{}),true)
  assert.equal(matches({semanticId:'urn:iot:temperature',semanticTypes:['observation']},declaration),true)
  assert.equal(matches({semanticTypes:['industry:measurement'],semanticRole:'value'},declaration),true)
  assert.equal(matches({semanticId:'urn:iot:pressure'},declaration),false)
  assert.equal(matches({semanticTypes:['result']},declaration),false)
  assert.equal(matches({semanticRole:'value'},{name:'value'}),false)
  assert.equal(matches({semanticId:'urn:iot:temperature'}),false)
})

test('明确单位须一致，平台ID和显示符号保留，Unicode等价表示不改变值',()=>{
  const input={id:'v',valueType:{type:'double'},unit:'°C'}
  assert.equal(selectable(input,{valueType:{type:'double',unit:'celsiusDegrees'},unit:'℃'}),true)
  assert.equal(selectable(input,{valueType:{type:'double',unit:'Pa'}}),false)
  assert.equal(selectable(input,{valueType:{type:'double'}}),false)
  assert.equal(selectable({...input,unit:'celsiusDegrees'},{valueType:{type:'double',unit:'celsiusDegrees'},unit:'℃'}),true)
  assert.equal(selectable({...input,unit:undefined},{valueType:{type:'double',unit:'Pa'}}),true)
})

test('JSON Schema投影保留根及嵌套扩展、枚举编码、单位和数组结构',()=>{
  const original={type:'object',expands:{semanticTypes:['result']},properties:{
    state:{type:'integer',enum:[0,1],unit:'count',expands:{semanticId:'state'}},
    samples:{type:'array',expands:{custom:1},items:{type:'string',format:'date-time'}}}}
  const converted=schema(original)
  assert.deepEqual(converted.expands,original.expands)
  const state=converted.properties.find(item=>item.id==='state')
  assert.equal(state.valueType.type,'enum')
  assert.equal(state.valueType.valueType.type,'long')
  assert.equal(state.valueType.unit,'count')
  assert.deepEqual(state.expands,{semanticId:'state'})
  const samples=converted.properties.find(item=>item.id==='samples').valueType
  assert.deepEqual(samples.expands,{custom:1})
  assert.equal(samples.elementType.type,'date')
})

test('只列出声明兼容的来源；数值类型通用，显式语义与类型共同约束',()=>{
  assert.equal(selectable({id:'v'},{valueType:{type:'double'}}),false)
  assert.equal(selectable({id:'v',valueType:{},semantics:{}},{valueType:{type:'double'}}),false)
  for (const type of ['byte','short','integer','long','float','double','decimal']) assert.equal(selectable({id:'v',valueType:{type:'double'}},{valueType:{type}}),true)
  assert.equal(selectable({id:'v',valueType:{type:'double'}},{valueType:{type:'string'}}),false)
  assert.equal(selectable({id:'v',valueType:{type:'boolean'}},{valueType:{type:'long'}}),false)
  assert.equal(selectable({id:'v',semantics:{semanticId:'temperature'}},{expands:{semanticId:'temperature'}}),true)
  assert.equal(selectable({id:'v',valueType:{type:'double'},semantics:{semanticId:'temperature'}},{valueType:{type:'double'},expands:{semanticId:'pressure'}}),false)
  assert.equal(selectable({id:'v',valueType:{type:'double'},semantics:{semanticId:'temperature'}},{valueType:{type:'string'},expands:{semanticId:'temperature'}}),false)
})

test('对象匹配必要字段，数组匹配元素，枚举保留值与类型',()=>{
  const object = type=>({type:'object',properties:[{id:'reading',valueType:{type}}]})
  assert.equal(typeMatches(object('double'),{type:'object',properties:[...object('long').properties,{id:'label',valueType:{type:'string'}}]}),true)
  assert.equal(typeMatches(object('double'),{type:'object',properties:[]}),false)
  assert.equal(typeMatches(object('double'),object('boolean')),false)
  assert.equal(typeMatches({type:'array',elementType:object('double')},{type:'array',elementType:object('long')}),true)
  assert.equal(typeMatches({type:'array',elementType:{type:'double'}},{type:'array',elementType:{type:'string'}}),false)
  assert.equal(typeMatches({type:'array',elementType:{type:'double'}},{type:'array'}),false)
  const enumeration = values=>({type:'enum',elements:values.map(value=>({value}))})
  assert.equal(typeMatches(enumeration([0,1]),enumeration([1])),true)
  assert.equal(typeMatches(enumeration([0,1]),enumeration(['1'])),false)
  assert.equal(typeMatches(enumeration([0,1]),enumeration([2])),false)
  assert.equal(typeMatches({type:'double'},enumeration([0,1])),true)
  assert.equal(typeMatches({type:'double'},enumeration(['0','1'])),false)
  const platform = {...enumeration(['0','1']),valueType:{type:'int'}}
  assert.equal(typeMatches(enumeration([0,1]),platform),true)
  assert.equal(typeMatches({type:'double'},platform),true)
  assert.equal(typeMatches({type:'string'},platform),false)
  assert.equal(typeMatches(enumeration([0,1]),{...platform,valueType:{type:'string'}}),false)
  assert.equal(typeMatches(enumeration([0,1]),{...enumeration(['0','2']),valueType:{type:'int'}}),false)
})
