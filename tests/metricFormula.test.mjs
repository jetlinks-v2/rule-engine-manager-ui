import assert from 'node:assert/strict'
import test from 'node:test'
import { createMetricLoader } from './helpers/metricRuntime.mjs'

const { expressionToFormula, expressionToDisplayFormula, formulaToExpression, formulaMacros, referenceMacro, ruleFormulaReferences, dataFormulaReferences } = createMetricLoader()('components/Metric/template/formula.ts')
const { expressionLabel } = createMetricLoader()('components/Metric/template/designer.ts')
const references = [
  { key: 'winding', metricId: 'temperature', label: '绕组温度', expression: '#t' },
  { key: 'ambient', metricId: 'ambient', label: '环境温度', expression: '#ambient' },
  { key: 'energy', metricId: 'energy', label: '用电量', expression: '#energy' },
  { key: 'quantity', metricId: 'quantity', label: '产量', expression: '#quantity' },
  { key: 'factor', label: '修正系数', expression: "#sample.getTags()['parameters']['factor']" },
]

test('原生SpEL变量和参数短路径转换；#仍可读取，高级原文不迁移', () => {
  const refs = [
    { key: 'energy', metricId: 'energy', label: '用电量', expression: 'energy' },
    { key: 'quantity', metricId: 'quantity', label: '产量', expression: 'quantity' },
    { key: 'factor', label: '修正系数', expression: 'params.factor' },
    { key: 'special', label: '特殊系数', expression: "params['factor-''key']" },
  ]
  for (const source of ['energy / quantity * params.factor', '#energy / #quantity * #params.factor']) {
    assert.deepEqual(formulaToExpression(expressionToFormula(source, refs), refs), {
      expression: '((energy / quantity) * params.factor)', metricIds: ['energy', 'quantity'],
    })
  }
  assert.equal(formulaToExpression(expressionToFormula("energy * params['factor-''key']", refs), refs).expression,
    "(energy * params['factor-''key'])")
  for (const source of ['energy1 + 1', 'params.factorOther', 'energy.value', "'energy'", "#sample.getTags()['parameters']['factor']"]) {
    assert.equal(expressionToFormula(source, refs), undefined, source)
  }
})

test('温升、单位能耗、嵌套函数转换保留别名、参数路径和实际依赖', () => {
  const cases = [
    ['#t - #ambient', '(#t - #ambient)', ['temperature', 'ambient']],
    ["(#energy / #quantity) * #sample.getTags()['parameters']['factor']", "((#energy / #quantity) * #sample.getTags()['parameters']['factor'])", ['energy', 'quantity']],
    ["$math.round((#energy / #quantity) * #sample.getTags()['parameters']['factor'], 2)", "$math.round(((#energy / #quantity) * #sample.getTags()['parameters']['factor']), 2)", ['energy', 'quantity']],
    ['$math.max($math.abs(-#t), $math.sqrt(9), $math.min(2, 3))', '$math.max($math.abs(-(#t)), $math.sqrt(9), $math.min(2, 3))', ['temperature']],
    ['1 + 2 * 3 - 4 / (5 - .5)', '((1 + (2 * 3)) - (4 / (5 - .5)))', []],
  ]
  for (const [source, expected, metricIds] of cases) {
    const latex = expressionToFormula(source, references)
    assert.notEqual(latex, undefined, source)
    assert.deepEqual(formulaToExpression(latex, references), { expression: expected, metricIds })
  }
})

test('MathLive常见序列化格式：分式、配对括号、平方根、运算符与函数', () => {
  assert.equal(formulaToExpression('\\frac{\\left(85-30\\right)}{2}', references).expression, '((85 - 30) / 2)')
  assert.equal(formulaToExpression('\\operatorname{round}\\left(\\frac{\\JLc}{\\JLd}\\times\\JLe,2\\right)', references).expression,
    "$math.round(((#energy / #quantity) * #sample.getTags()['parameters']['factor']), 2)")
  assert.equal(formulaToExpression('\\sqrt{9}+\\max(2,3)\\cdot 2', references).expression, '($math.sqrt(9) + ($math.max(2, 3) * 2))')
  assert.equal(formulaToExpression('\\operatorname{\\mathrm{round}}\\left(\\JLa-\\JLb,2\\right)', references).expression, '$math.round((#t - #ambient), 2)')
  assert.equal(formulaToExpression('\\frac{\\mathord{\\JLc}}{\\mathord{\\JLd}}', references).expression, '(#energy / #quantity)')
})

test('不完整公式和不支持的数学内容必须报错，不静默改写为有效规则', () => {
  for (const latex of ['', '1+', '\\left(1+2', '\\frac{1}{}', '\\operatorname{round}(1,\\placeholder{})', '1 2', 'x', '\\JLunknown', '\\sqrt{}', '\\sqrt[3]{8}', '2^3', '\\operatorname{abs}(1,2)']) {
    assert.throws(() => formulaToExpression(latex, references), undefined, latex)
  }
})

test('高级SpEL与未知引用保持原文；只转换确定的数值语法', () => {
  for (const source of ['#t > 80 ? 1 : 0', '#unknown + 1', '#temperature', '#t.value', "T(java.lang.Math).abs(-1)", '#sample.getValue()', '$math.pow(2,3)', '$math.round(1,2,3)', '1e3x', '1.2e-3']) {
    assert.equal(expressionToFormula(source, references), undefined, source)
  }
  assert.equal(expressionToFormula('', references), '')
  assert.equal(formulaToExpression(expressionToFormula('.0012 + -2', references), references).expression, '(.0012 + -(2))')
})

test('变量标识与中文显示名解耦；同名变量、特殊显示字符和超过26个引用不混淆', () => {
  const refs = Array.from({ length: 30 }, (_, i) => ({ key: String(i), label: '温度{A}\\test%', expression: `#v${i}`, metricId: String(i) }))
  assert.equal(referenceMacro(26), 'JLaa')
  assert.equal(Object.keys(formulaMacros(refs)).length, 30)
  assert.equal(formulaMacros(refs).JLa.expand, false)
  assert.deepEqual(formulaToExpression(expressionToFormula('#v1 + #v10 + #v29', refs), refs).metricIds, ['1', '10', '29'])
})

test('只读公式与编辑器共用数值转换；条件回显保留比较、逻辑与括号优先级', () => {
  for (const source of ['12 * (#energy + #t) / (#quantity + #ambient)', '-(#t - #ambient) / 2', '$math.round(#energy / #quantity, 2)']) {
    assert.equal(expressionToDisplayFormula(source, references), expressionToFormula(source, references))
  }
  assert.equal(expressionToDisplayFormula('#quantity + #ambient > 0', references), '\\mathord{\\JLd}+\\mathord{\\JLb}>0')
  assert.equal(expressionToDisplayFormula('(#t > 80 || #ambient <= 5) && !(#energy == #quantity)', references),
    '\\left(\\mathord{\\JLa}>80\\lor \\mathord{\\JLb}\\le 5\\right)\\land \\lnot \\left(\\mathord{\\JLc}=\\mathord{\\JLd}\\right)')
  assert.equal(expressionToDisplayFormula('#t != 0 && #ambient >= 5', references), '\\mathord{\\JLa}\\ne 0\\land \\mathord{\\JLb}\\ge 5')
  for (const source of ['#quantity > 0', '#t && #ambient', '!(#t > 80)']) assert.equal(expressionToFormula(source, references), undefined)
  for (const source of ['#t > 80 ? 1 : 0', '#unknown > 0', '#t >', "#t == 'alarm'", '#t > 80 and #ambient < 5']) {
    assert.equal(expressionToDisplayFormula(source, references), undefined, source)
  }
})

test('编辑与回显共用声明引用、显式别名、前置计算及参数路径，读取不修改规则', () => {
  const rule = { id: 'result', inputs: [{ id: 't-air', metricId: 'temperature', maxAge: 'PT10S' }, { id: 'remote', source: { kind: 'property' } }] }
  const template = { inputDefinitions: [{ id: 'temperature', name: '温度' }], definitions: [{ id: 'average' }, rule],
    outputs: [{ metricId: 'average', label: '平均温度' }], parameterDefinitions: [{ id: 'factor', name: '修正系数' }, { id: "factor-'key", name: '特殊参数' }] }
  const before = JSON.stringify(template)
  const refs = ruleFormulaReferences(template, rule)
  assert.deepEqual(refs.filter(item=>!item.referenceId).map(item => [item.expression, item.label]), [
    ['t_air', '温度'], ['average', '平均温度'], ['remote', 'remote'], ['params.factor', '修正系数'], ["params['factor-''key']", '特殊参数'],
  ])
  assert.deepEqual(refs.find(item=>item.key === 'system:processTime').path,['processTime'])
  assert.deepEqual(refs.find(item=>item.key === 'metadata:temperature:inputTimeStart').path,['t-air','inputTimeStart'])
  assert.ok(expressionToDisplayFormula('t_air / average * params.factor', refs)?.includes('\\frac'))
  assert.equal(JSON.stringify(template), before)
})

test('输入说明与公式候选共用声明，历史读取不改变字段、枚举合法值与时间引用', () => {
  const input = { id:'gateway-state', name:'网关状态', valueType:{type:'object',properties:[
    {id:'connection',name:'连接',valueType:{type:'enum',elements:[{value:0,text:'离线'},{value:1,text:'在线'},{value:false,text:'未确认'}]}},
    {id:'statistics',name:'统计',valueType:{type:'object',properties:[{id:'duration',name:'时长',valueType:{type:'double',unit:'s'}}]}},
  ]} }
  const spec = { inputDefinitions:[input], definitions:[], outputs:[], parameterDefinitions:[] }
  const before = JSON.stringify(spec)
  const refs = dataFormulaReferences(spec,{id:input.id,label:input.name})
  assert.deepEqual(ruleFormulaReferences(spec,{id:'result'}).filter(item=>item.metricId === input.id),refs)
  assert.deepEqual(refs.map(item=>item.path),[undefined,['connection'],['statistics'],['statistics','duration'],[input.id,'inputTimeStart'],[input.id,'inputTimeEnd']])
  assert.deepEqual(refs[1].schema.elements.map(item=>item.value),[0,1,false])
  assert.equal(refs[3].unit,'s')
  const historical = {...spec,inputDefinitions:[{...input,source:{lookback:'PT2H'}}]}
  assert.deepEqual(dataFormulaReferences(historical,{id:input.id,label:input.name}),refs)
  const alias = "state-'key"
  const mapped = ruleFormulaReferences(spec,{id:'result',inputs:[{id:alias,metricId:input.id}]},[],'en')
  const field = mapped.find(item=>item.path?.join('.') === 'statistics.duration')
  assert.equal(field.expression,"state__key['statistics']['duration']")
  assert.deepEqual(field.schema,refs[3].schema)
  const time = mapped.find(item=>item.key === `metadata:${input.id}:inputTimeStart`)
  assert.equal(time.displayLabel,'Input interval start')
  assert.deepEqual(time.path,[alias,'inputTimeStart'])
  assert.equal(time.expression,"metricValues['state-''key'].getInputTimeStart()")
  assert.equal(JSON.stringify(spec),before)
})

test('前向引用与对象字段使用声明或当前语言元数据名称，表达式和字符串常量保持原样', () => {
  const rule = { id:'result', expression:"stats['activeDuration'] / 60", dependsOn:['stats'] }
  const statistics = { id:'stats', calculator:{ provider:'state', providerVersion:'1', outputType:{ type:'object', properties:[{ id:'activeDuration', valueType:{ type:'double' } }] } } }
  const spec = { inputDefinitions:[], definitions:[rule,statistics], outputs:[], parameterDefinitions:[] }
  const before = JSON.stringify(spec)
  const descriptor = name => [{ name, configuration:{ provider:'state', providerVersion:'1', outputType:{ type:'object', properties:[{ id:'activeDuration', name:name === 'State duration' ? 'Active seconds' : '运行秒数', valueType:{ type:'double' } }] } } }]
  for (const [name,field] of [['状态时长','运行秒数'],['State duration','Active seconds']]) {
    const refs = ruleFormulaReferences(spec,rule,descriptor(name))
    const names = new Map(refs.map(item=>[item.expression,item.label]))
    assert.equal(refs.find(item=>item.expression === "stats['activeDuration']").label, `${name} · ${field}`)
    assert.equal(refs.find(item=>item.expression === "stats['activeDuration']").displayLabel,field)
    assert.ok(expressionToDisplayFormula(rule.expression, refs)?.includes('\\frac'))
    assert.equal(expressionLabel(spec,rule.expression,names),`${name} · ${field} / 60`)
    assert.equal(expressionLabel(spec,`"stats['activeDuration']"`,names),`"stats['activeDuration']"`)
    assert.equal(expressionLabel(spec,"object.stats['activeDuration']",names),"object.stats['activeDuration']")
  }
  statistics.calculator.outputType.properties[0].name = 'activeDuration'
  assert.ok(ruleFormulaReferences(spec,rule,descriptor('State duration')).some(item=>item.displayLabel === 'Active seconds'))
  statistics.calculator.outputType.properties[0].name = 'Custom duration'
  assert.ok(ruleFormulaReferences(spec,rule,descriptor('State duration')).some(item=>item.label.endsWith('Custom duration')))
  delete statistics.calculator.outputType.properties[0].name
  assert.equal(JSON.stringify(spec), before)
})
