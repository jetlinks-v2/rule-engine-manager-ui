import assert from 'node:assert/strict'
import test from 'node:test'
import { createMetricLoader } from './helpers/metricRuntime.mjs'

const load=createMetricLoader()
const {resolveMetricResultType:resolve}=load('components/Metric/template/resultTypes.ts')
const {metricValueSchema:display}=load('components/Metric/valueSemantics.ts')
const template=()=>({id:'generic',inputDefinitions:[{id:'start',valueType:{type:'date'}},{id:'end',valueType:{type:'date'}}],parameterDefinitions:[],definitions:[],outputs:[]})

test('未建立统一日期算式契约时保持未知，不根据日期类型冒推数值结果',()=>{
  const spec=template()
  spec.definitions.push({id:'elapsed',expressionTree:{version:1,root:{type:'binary',operator:'subtract',left:{type:'reference',id:'end',path:[]},right:{type:'reference',id:'start',path:[]}}}})
  assert.equal(resolve(spec,'elapsed').schema,undefined)
  assert.deepEqual(display(spec,'elapsed'),resolve(spec,'elapsed').schema)
  assert.equal(resolve(spec,'elapsed').issue,'unknown')
})

test('显式枚举、对象与数组结果完整传递，未知结果不假定double',()=>{
  const spec=template(),schemas=[{type:'enum',valueType:{type:'int'},elements:[{value:0,text:'停止'},{value:1,text:'运行'}]},
    {type:'object',properties:[{id:'at',valueType:{type:'date'}}]},
    {type:'array',elementType:{type:'double',unit:'Pa'}}]
  for(const [i,schema] of schemas.entries()){
    spec.definitions.push({id:`result${i}`,resultType:schema})
    assert.deepEqual(resolve(spec,`result${i}`).schema,schema)
    assert.deepEqual(display(spec,`result${i}`),schema)
  }
  assert.equal(resolve(spec,'missing').schema,undefined)
  assert.equal(display(spec,'missing'),undefined)
})
