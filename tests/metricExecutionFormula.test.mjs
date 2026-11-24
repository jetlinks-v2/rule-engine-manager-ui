import assert from 'node:assert/strict'
import test from 'node:test'
import { createMetricLoader } from './helpers/metricRuntime.mjs'

const load=createMetricLoader()
const {executionFormula}=load('components/Metric/template/formula/execution.ts')
const {evidenceValue}=load('components/Metric/evidence.ts')
const {metricDateText}=load('components/Metric/time.ts')
const {metricDurationText}=load('components/Metric/presentation.ts')
const {metricMessages}=load('components/Metric/messages.ts')
const t=(key,values={})=>(metricMessages.zh[key] || key).replace(/\{(\w+)\}/g,(_,key)=>String(values[key]))
const leaf=(id,value,type='number',kind='input',path='/value')=>({id,value,type,kind,path,state:'available'})
const rule={id:'load',inputs:[{id:'a',metricId:'cpu'},{id:'b',metricId:'memory'}],expression:'a * params.factor + b * 0.5'}
const template={inputDefinitions:[{id:'cpu',name:'CPU'},{id:'memory',name:'Memory'}],definitions:[rule],outputs:[],parameterDefinitions:[{id:'factor',name:'Factor'}],parameters:{factor:999}}
const value={metricId:'load',value:62.5,evidence:{execution:{truncated:false,values:[leaf('a','50'),leaf('b','75'),leaf('factor','0.5','number','parameter','')]}}}
const formula=(r=rule,v=value,spec=template)=>executionFormula(spec,r,v,[],t)?.text

test('按本步别名和执行参数代入AST，保留原快照，当前参数不能替代记录',()=>{
  const before=JSON.stringify({template,value})
  assert.equal(formula(),'((50 × 0.5) + (75 × 0.5))')
  assert.equal(JSON.stringify({template,value}),before)
  assert.equal(formula({...rule,expression:'#a * #params.factor'}),'(50 × 0.5)')
  assert.match(formula(rule,{...value,evidence:undefined}),/未记录：CPU.*未记录：Factor/)
})

test('对象字段按JSON Pointer精确匹配；参数和来源字面量不被字符串替换',()=>{
  const spec={...template,inputDefinitions:[{id:'cpu',name:'CPU',valueType:{type:'object',properties:[{id:'x/y~z',valueType:{type:'double'}}]}}]}
  const r={...rule,expression:"a['x/y~z'] + params.factor"}
  const v={...value,evidence:{execution:{values:[leaf('a','12','number','input','/value/x~1y~0z'),leaf('factor','2','number','parameter','')]}}}
  assert.equal(formula(r,v,spec),'(12 + 2)')
  assert.equal(formula({...r,expression:'a == null'},v,spec),'(［CPU：已记录1项字段］ == null)')
  assert.equal(formula({...rule,expression:"a == 'a' ? b : null"}), '50 == "a" ? 75 : null'.replace('50 == "a"','(50 == "a")'))
})

test('字符串、布尔、null、缺失和大整数保留区别，不计算条件或舍入取值',()=>{
  for (const [raw,type,text] of [['9223372036854775807','number','9223372036854775807'],['0.123456789123456789','number','0.123456789123456789'],['true','boolean','true'],['<img src=x>','string','"<img src=x>"'],[null,'null','null']]) {
    const v={...value,evidence:{execution:{values:[leaf('a',raw,type)]}}}
    assert.equal(formula({...rule,expression:'a'},v),text)
  }
  for (const state of ['missing','expired','invalid']) assert.match(formula({...rule,expression:'a'},{...value,evidence:{execution:{values:[{...leaf('a','100'),state}]}}}),/未记录/)
  const v={...value,value:999,evidence:{execution:{values:[leaf('a','0')]}}}
  assert.equal(formula({...rule,expression:'a == 0 ? 1 : 2'},v),'(0 == 0) ? 1 : 2')
  assert.deepEqual(executionFormula(template,{...rule,expression:'a == 0 ? 1 : a == 2 ? 3 : 4'},v,[],t).branches,
    [{condition:'(0 == 0)',value:'1'},{condition:'(0 == 2)',value:'3'},{value:'4'}])
})

test('已记录状态时长可代入白名单访问；高级调用及窗口样本不伪造完整计算',()=>{
  const spec={...template,definitions:[{id:'cpu',stateTracking:{maxNoData:'PT1M'}},rule]}
  const v={...value,evidence:{execution:{values:[leaf('a','61','number','input','/state/duration')]}}}
  assert.equal(formula({...rule,expression:"metricValues['a'].getState().getDuration()"},v,spec),'61')
  assert.equal(formula({...rule,expression:'a.someMethod()'}),undefined)
  for (const extra of [{aggregation:'avg'},{calculator:{provider:'state'}},{windowFamily:{}},{temporalCondition:{}}]) assert.equal(formula({...rule,...extra}),undefined)
})

test('日期按类型与声明格式展示，零与非法时间不反显epoch，普通long不猜时间',()=>{
  const time=new Date(2026,10,7,7,26,36).getTime()
  const spec={...template,inputDefinitions:[{id:'date',valueType:{type:'date',format:'yyyy-MM-dd HH:mm:ss'}},{id:'raw',valueType:{type:'long'}}]}
  assert.equal(evidenceValue(leaf('date',String(time)),'date',spec,'zh',t).text,'2026-11-07 07:26:36')
  assert.equal(metricDateText(time,'HH:mm:ss'),'07:26:36')
  assert.equal(metricDateText(time,'timestamp'),'2026-11-07 07:26:36','存储标识不能按dayjs格式模板解释')
  assert.equal(evidenceValue(leaf('date',String(time)),'date',{...spec,inputDefinitions:[{id:'date',valueType:{type:'date',format:'timestamp'}}]},'zh',t).text,'2026-11-07 07:26:36')
  for(const input of [0,undefined,null,NaN,Infinity,-1,'','invalid']) assert.equal(metricDateText(input),'—')
  assert.equal(evidenceValue(leaf('date','0'),'date',spec,'zh',t).text,'—')
  assert.notEqual(evidenceValue(leaf('raw',String(time)),'raw',spec,'zh',t).text,metricDateText(time))
})

test('毫秒不丢单位，时长不被当作日期，零时长有效',()=>{
  const spec={...template,inputDefinitions:[{id:'delay',unit:'ms'}]}
  assert.equal(evidenceValue(leaf('delay','500'),'delay',spec,'zh',t).text,'500毫秒')
  assert.equal(metricDurationText(1500,'ms',t),'1.5秒')
  assert.equal(metricDurationText(0,'ms',t),'0秒')
})
