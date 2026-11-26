import assert from 'node:assert/strict'
import test from 'node:test'
import { effectScope, ref } from 'vue'
import { createMetricLoader, flush } from './helpers/metricRuntime.mjs'

const load = createMetricLoader()
const { metricSourceTemplate, semanticValueText } = load('components/Metric/valueSemantics.ts')
const { useMetricSourceTemplate } = load('components/Metric/useMetricSourceTemplate.ts')
const { evidenceValue } = load('components/Metric/evidence.ts')
const { executionFormula } = load('components/Metric/template/formula/execution.ts')
const t = key => key
const template = () => ({ id:'generic', inputDefinitions:[{id:'at',valueType:{type:'long'}},{id:'count',valueType:{type:'long'}},
  {id:'state',valueType:{type:'enum',elements:[{value:1,text:'One'}]}},{id:'duration',valueType:{type:'double',unit:'s'}}],
  definitions:[{id:'age',inputs:[{id:'stamp',metricId:'at'}],expression:'stamp + 1'}],outputs:[],parameterDefinitions:[],parameters:{} })

test('真实来源的日期类型补齐旧long模板，普通数值和显式状态保留，展示投影不修改原声明', () => {
  const raw = template(), before = JSON.stringify(raw)
  const date = {valueType:{type:'date'}}
  const view = metricSourceTemplate(raw,{at:date,count:{valueType:{type:'long'}},state:date,duration:{valueType:{type:'double',unit:'s'}}})
  assert.equal(view.inputDefinitions[0].valueType.type,'date')
  assert.equal(view.inputDefinitions[1].valueType.type,'long')
  assert.equal(view.inputDefinitions[2].valueType.type,'enum')
  assert.equal(view.inputDefinitions[3].valueType.type,'double')
  assert.equal(JSON.stringify(raw),before)
  const at = new Date(2026,10,7,9,8,13).getTime()
  assert.equal(semanticValueText(at,{schema:view.inputDefinitions[0].valueType},t),'2026-11-07 09:08:13')
  assert.notEqual(semanticValueText(at,{schema:view.inputDefinitions[1].valueType},t),'2026-11-07 09:08:13')
})

test('来源语义同时用于依据明细，公式代入保留记录的原始毫秒，来源失败不猜类型', () => {
  const raw = template(), at = new Date(2026,10,7,9,8,13).getTime()
  const view = metricSourceTemplate(raw,{at:{valueType:{type:'date'}}})
  const leaf = {id:'stamp',kind:'input',path:'/value',type:'number',value:String(at),state:'available'}
  const value = {metricId:'age',value:1,evidence:{execution:{values:[leaf]}}}
  assert.equal(evidenceValue(leaf,'at',view,'en',t).text,'2026-11-07 09:08:13')
  assert.equal(executionFormula(view,view.definitions[0],value,[],t).text,`(${at} + 1)`)
  assert.equal(metricSourceTemplate(raw,{at:{valueType:{type:'date'},error:'denied'}}).inputDefinitions[0].valueType.type,'long')
  raw.inputDefinitions[0].valueType = {type:'date',format:'yyyy-MM-dd HH:mm'}
  assert.equal(evidenceValue(leaf,'at',metricSourceTemplate(raw,{at:{valueType:{type:'date'}}}),'zh',t).text,'2026-11-07 09:08')
})

test('详情来源元数据仅在打开时读取，实时结果/同身份配置刷新不重查，关闭隔离迟到响应', async () => {
  const scope = effectScope(), pending = []
  const raw = ref(template()), config = ref({id:'c',inputMappings:{at:{kind:'property',id:'timestamp',thingId:'one'}}})
  const context = ref({ownerType:'device',ownerId:'one',targetType:'device',targetId:'one'}), active = ref(false)
  const picker = ref(Object.assign(async()=>undefined,{describe:(...args)=>new Promise((resolve,reject)=>pending.push({args,resolve,reject}))}))
  const view = scope.run(()=>useMetricSourceTemplate(raw,config,context,active,picker))
  try {
    await flush(); assert.equal(pending.length,0)
    active.value=true; await flush(); assert.equal(pending.length,1)
    config.value=JSON.parse(JSON.stringify(config.value)); await flush()
    assert.equal(pending.length,1)
    pending[0].resolve({at:{valueType:{type:'date'}}}); await flush()
    assert.equal(view.value.inputDefinitions[0].valueType.type,'date')
    context.value={...context.value,ownerId:'two',targetId:'two'}; await flush()
    assert.equal(pending.length,2); assert.equal(view.value.inputDefinitions[0].valueType.type,'long')
    assert.equal(pending[1].args[0].targetId,'two')
    active.value=false; await flush()
    pending[1].resolve({at:{valueType:{type:'date'}}}); await flush()
    assert.equal(view.value.inputDefinitions[0].valueType.type,'long')
    active.value=true; await flush(); assert.equal(pending.length,3)
    pending[2].reject(new Error('unavailable')); await flush()
    assert.equal(view.value.inputDefinitions[0].valueType.type,'long')
  } finally {scope.stop()}
})
