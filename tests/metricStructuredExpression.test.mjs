import assert from 'node:assert/strict'
import test from 'node:test'
import {createMetricLoader} from './helpers/metricRuntime.mjs'
const load=createMetricLoader()
const {expressionToTree}=load('components/Metric/template/formula.ts')
const {expressionText,supportsMathProjection,expressionReferences}=load('components/Expression/display.ts')
const {explanationDecisions,explanationText}=load('components/Expression/explanation.ts')
const {ruleExpression}=load('components/Metric/template/designer.ts')
const references=[{key:'temperature',label:'Temperature',expression:'temperature',metricId:'temperature'},
  {key:'parameter:limit',label:'Limit',group:'parameter',expression:'params.limit'}]

test('同一树覆盖条件、逻辑、函数和参数，保存JSON往返后投影一致',()=>{
  const tree=expressionToTree('temperature > params.limit ? $math.abs(temperature) : 0',references)
  assert.equal(tree.root.type,'conditional')
  assert.equal(tree.root.condition.right.id,'params')
  assert.deepEqual(tree.root.condition.right.path,['limit'])
  assert.equal(tree.root.whenTrue.function,'math.abs')
  assert.deepEqual(expressionReferences(tree.root).map(item=>item.id),['temperature','params','temperature'])
  assert.equal(expressionText(JSON.parse(JSON.stringify(tree))),expressionText(tree))
  assert.equal(ruleExpression({expressionTree:tree}),expressionText(tree))
  assert.equal(ruleExpression({applicabilityTree:tree},'applicabilityExpression'),expressionText(tree))
  assert.equal(ruleExpression({temporalCondition:{enterTree:tree}},'enterExpression'),expressionText(tree))
})

test('复杂旧脚本保留高级模式，精确值不能隐式降为普通数学输入',()=>{
  assert.equal(expressionToTree("T(java.lang.System).currentTimeMillis()",references),undefined)
  const literal={type:'literal',valueType:'decimal',value:'12345678901234567890.123456789'}
  assert.equal(supportsMathProjection(literal),false)
  assert.equal(expressionText({version:1,root:literal}),literal.value)
  assert.equal(supportsMathProjection({...literal,valueType:'long',value:'1'}),false)
  assert.equal(supportsMathProjection({...literal,valueType:'long',value:'9007199254740993'}),true)
  assert.equal(supportsMathProjection({...literal,valueType:'int',value:'-'}),false)
  assert.equal(expressionToTree('9007199254740993',references).root.value,'9007199254740993')
})

const literal=value=>({kind:'literal',state:'available',value,path:[],children:[]})
test('短路逻辑不生成一元前缀，未知表达式不渲染为空白',()=>{
  const format=node=>({text:String(node.value)})
  const short={kind:'operator',operation:'and',children:[literal(false),{...literal(1),state:'skipped'}]}
  assert.equal(explanationText(short,format),'false')
  assert.equal(explanationText({...short,children:[short,{...literal(1),state:'skipped'}]},format),'false')
  const unknown={kind:'unsupported',state:'unknown',expression:'stats.coverage < limit',path:[],children:[]}
  assert.equal(explanationText({kind:'operator',operation:'or',children:[literal(false),unknown]},format),'false ∨ stats.coverage < limit')
  assert.equal(explanationText({kind:'operator',operation:'not',children:[literal(false)]},format),'¬false')
})
test('解释仅呈现后端选中分支，未知判断不继续下探',()=>{
  const nested={kind:'condition',state:'available',value:1,path:[],children:[literal(true),literal(1),{...literal(5),state:'skipped'}]}
  const root={kind:'condition',state:'available',value:1,path:[],children:[literal(false),{...literal(3),state:'skipped'},nested]}
  assert.deepEqual(explanationDecisions(root).rows.map(row=>row.selected),[false,true])
  assert.equal(explanationDecisions(root).result.value,1)
  const unknown={...root,children:[{...literal(false),state:'unknown'},nested,nested]}
  assert.equal(explanationDecisions(unknown).rows.length,1)
  assert.equal(explanationDecisions(unknown).rows[0].selected,undefined)
  const read={kind:'read',state:'available',value:0,path:['state'],children:[]}
  assert.equal(explanationText({kind:'operator',operation:'==',children:[read,literal(0)]},node=>({label:node.kind === 'read' ? 'Connection' : undefined,text:String(node.value)})),'Connection（0） = 0')
})
