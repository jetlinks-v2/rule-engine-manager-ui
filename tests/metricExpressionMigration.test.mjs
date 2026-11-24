import test from 'node:test'
import assert from 'node:assert/strict'
import {createMetricLoader} from './helpers/metricRuntime.mjs'
const loader=createMetricLoader()
const {importFormulaExpression,structureMetricTemplate}=loader('components/Metric/template/structureExpressions.ts')
const {ruleFormulaReferences}=loader('components/Metric/template/formula.ts')
const base={id:'test',version:'1',name:'test',inputDefinitions:[{id:'online',name:'连接',valueType:{type:'int'}}],parameterDefinitions:[],outputs:[],definitions:[],options:{}}

test('显式迁移保留长整数、小数类型、短路、静态字段及系统元数据',()=>{
  const rule={id:'state',dependsOn:['online'],stateTracking:{maxNoData:'PT2M'},expression:'online',options:{stateLabels:[{value:0,name:'离线'},{value:1,name:'在线'}]}}
  const next={id:'duration',dependsOn:['state'],expression:"state == 0 ? metricValues['state'].getState().getDuration() : 0"}
  const template={...base,definitions:[rule,next,{id:'clock',dependsOn:['online'],expression:'sample.getProcessTime() - 1000L'},{id:'false',dependsOn:['online'],expression:'false && 1 / 0 > 0'}]}
  const result=structureMetricTemplate(template)
  assert.deepEqual(result.unsupported,[]);assert.equal(result.converted,4)
  assert.equal(result.template.inputDefinitions[0].valueType.type,'enum')
  assert.deepEqual(result.template.definitions[1].expressionTree.root.whenTrue,{type:'reference',id:'metricValues',path:['state','state','duration']})
  assert.equal(result.template.definitions[2].expressionTree.root.right.valueType,'long')
  assert.equal(result.template.definitions[3].expressionTree.root.type,'logical')
  assert.equal(template.definitions[0].expression,'online');assert.equal(result.template.definitions[0].expression,undefined)
  const refs=ruleFormulaReferences(template,next)
  assert.equal(importFormulaExpression('sample.getProcessTime() / 1000.0',refs).root.right.valueType,'double')
  assert.equal(importFormulaExpression('$math.abs(state).doubleValue()',refs).root.function,'data.toDouble')
  assert.equal(importFormulaExpression("'a''b'",refs).root.value,"a'b")
  assert.equal(importFormulaExpression('unknown.deleteAll()',refs),undefined)
  assert.equal(importFormulaExpression('sample.getClass()',refs),undefined)
})

test('适用和持续条件同时迁移，不改窗口或未支持脚本，也不偷偷覆盖已有树',()=>{
  const temporalCondition={enterExpression:'online > 1',exitExpression:'online < 1',dwell:'PT1M',recovery:'PT30S'}
  const window={mode:'none',timeMode:'processing',emitPolicy:'onSchedule',emitInterval:'PT1M'}
  const rule={id:'held',dependsOn:['online'],applicabilityExpression:'online != null',temporalCondition,window}
  const result=structureMetricTemplate({...base,definitions:[rule,{id:'legacy',expression:'T(java.lang.System).currentTimeMillis()'}]})
  assert.equal(result.converted,3);assert.deepEqual(result.unsupported,['legacy.expression'])
  assert.deepEqual(result.template.definitions[0].window,window)
  assert.equal(result.template.definitions[0].temporalCondition.dwell,'PT1M')
  assert.equal(result.template.definitions[0].temporalCondition.enterExpression,undefined)
  assert.ok(result.template.definitions[0].temporalCondition.enterTree)
  assert.equal(result.template.definitions[1].expression,'T(java.lang.System).currentTimeMillis()')
  const existing={version:1,root:{type:'literal',valueType:'int',value:'7'}}
  assert.deepEqual(structureMetricTemplate({...base,definitions:[{id:'already',expression:'99',expressionTree:existing}]}).template.definitions[0].expressionTree,existing)
})

test('连续逻辑条件展平且保留原求值次序与短路边界',()=>{
  const refs=ruleFormulaReferences(base,{dependsOn:['online']})
  const tree=importFormulaExpression(Array.from({length:30},(_,i)=>`online != ${i}`).join(' && '),refs)
  assert.equal(tree.root.type,'logical');assert.equal(tree.root.operands.length,30)
  assert.equal(tree.root.operands[29].right.value,'29')
  assert.equal(importFormulaExpression('online == 0 && (online == 1 || online == 2)',refs).root.operands[1].operator,'or')
})
