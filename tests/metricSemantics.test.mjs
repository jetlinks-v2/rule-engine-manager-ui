import assert from 'node:assert/strict'
import test from 'node:test'
import { defineComponent, h, reactive, ref } from 'vue'
import { resolve } from 'node:path'
import { createMetricLoader, createMetricRenderer, flush, walk, textContent, passthrough, sourceRoot } from './helpers/metricRuntime.mjs'

const load = createMetricLoader()
const { metricMessages } = load('components/Metric/messages.ts')
const translate = locale => (key, values = {}) => (metricMessages[locale][key] || key).replace(/\{(\w+)\}/g, (_, name) => String(values[name]))
const { expressionStory } = load('components/Metric/template/formula/semantic.ts')
const { parseDisplayExpression, expressionToFormula, ruleFormulaReferences } = load('components/Metric/template/formula.ts')
const { metricValueLabels, metricValueSchema, metricValueFields, semanticValueText } = load('components/Metric/valueSemantics.ts')
function example() {
  const labels = [{ value:0, name:'离线', nameI18n:{ en:'Offline' } }, { value:1, name:'在线', nameI18n:{ en:'Online' } }, { value:3, name:'维修', nameI18n:{ en:'Repair' } }]
  const state = { id:'state', name:'设备工况', inputs:[{ id:'sourceAlias', metricId:'sensor' }], expression:'sourceAlias', stateTracking:{ maxNoData:'PT20M' }, options:{ stateLabels:labels } }
  const rule = { id:'duration', inputs:[{ id:'current', metricId:'state' }], expression:"current == 3 ? metricValues['current'].getState().getDuration() : 0" }
  return { rule, state, template:{ id:'generic', inputDefinitions:[{ id:'sensor', name:'状态输入', valueType:{ type:'int' } }], definitions:[state,rule], outputs:[], parameterDefinitions:[] } }
}
const story = (value, locale = 'zh') => expressionStory(value.template,value.rule,value.rule.expression,[],locale,translate(locale))

test('条件与状态事实通过公共结构反显，别名及多状态含义来自声明且不改变表达式', () => {
  const value = example(), before = JSON.stringify(value)
  const result = story(value)
  assert.equal(result.condition,'设备工况为维修')
  assert.match(result.yes,/设备工况.*本次.*时长/)
  assert.equal(result.no,'0')
  assert.equal(result.label.includes('getState'),false)
  assert.match(story(value,'en').label,/is Repair.*current continuous duration/)
  assert.equal(JSON.stringify(value),before)
  assert.equal(expressionToFormula(value.rule.expression,ruleFormulaReferences(value.template,value.rule)),undefined)
  value.rule.expression = '#current != 1 ? #metricValues["current"].getState().getDuration() : 0'
  assert.equal(story(value).condition,'设备工况不为在线')
})

test('只读AST保持三元右结合、嵌套优先级、转义字符串和布尔原类型', () => {
  const refs = [{ key:'a', expression:'a', label:'A' }]
  const parsed = parseDisplayExpression("a > 0 ? 'it''s:?' : a == 0 ? true : false",refs)
  assert.equal(parsed.kind,'conditional'); assert.equal(parsed.yes.value,"it's:?")
  assert.equal(parsed.no.kind,'conditional'); assert.equal(parsed.no.yes.value,true); assert.equal(parsed.no.no.value,false)
  assert.equal(parseDisplayExpression('(a > 0 ? 2 : 3) * 4',refs).kind,'binary')
  for (const source of ['a ? 1', 'a ? : 2', 'a ? 1 : 2 +', 'a > 0 ? missing() : 0', 'T(java.lang.Runtime).getRuntime()', 'a.getState().getDuration()', 'a ? 1 : 2 trailing']) {
    assert.equal(parseDisplayExpression(source,refs),undefined,source)
  }
})

test('未知状态编码不翻译、字符串编码不等同数字、未知方法完整回退', () => {
  const value = example()
  value.rule.expression = "current == '3' ? metricValues['current'].getState().getDuration() : 0"
  assert.equal(story(value).condition.includes('维修'),false)
  value.rule.expression = "current == 99 ? metricValues['current'].getState().getDuration() : 0"
  assert.match(story(value).condition,/99/)
  for (const expression of ["current == 3 ? metricValues['current'].getState().other() : 0", "current == 3 ? metricValues[current].getState().getDuration() : 0", "current == 3 ? metricValues['unknown'].getState().getDuration() : 0"]) {
    value.rule.expression = expression; assert.equal(story(value),undefined)
  }
})

test('状态常量按声明支持负数、字符串与布尔值，嵌套分支仍保留各自条件', () => {
  const value = example()
  value.state.options.stateLabels.push({ value:-1,name:'未知' },{ value:'maintenance',name:'保养' },{ value:false,name:'停用' })
  for (const [source,label] of [['-1','未知'],["'maintenance'",'保养'],['false','停用']]) {
    value.rule.expression = `current == ${source} ? 1 : 0`
    assert.equal(story(value).condition,`设备工况为${label}`)
  }
  value.rule.expression = 'current == 1 ? 10 : current == 3 ? 20 : 0'
  assert.match(story(value).no,/设备工况为维修.*20.*0/)
})

test('输入只复用唯一直接映射，冲突、变换和缺声明均不猜测；未定义值和未知时长不变0', () => {
  const { template,state } = example()
  assert.equal(metricValueLabels(template,'sensor')[1].value,1)
  const t = translate('zh')
  assert.equal(semanticValueText(1,{ labels:metricValueLabels(template,'sensor') },t),'在线')
  assert.equal(semanticValueText('1',{ labels:metricValueLabels(template,'sensor') },t),'未定义状态（1）')
  assert.equal(semanticValueText(2,{ labels:metricValueLabels(template,'sensor') },t),'未定义状态（2）')
  assert.equal(semanticValueText(null,{ unit:'s' },t),'未提供值')
  assert.equal(semanticValueText(0,{ unit:'s' },t),'0秒')
  template.definitions.push({ ...state,id:'other',options:{ stateLabels:[{ value:1,name:'运行' }] } })
  assert.deepEqual(metricValueLabels(template,'sensor'),[])
  template.definitions.pop(); state.expression = 'sourceAlias + 1'
  assert.deepEqual(metricValueLabels(template,'sensor'),[])
})

test('对象投影合并当前语言字段目录、保留自定义名称和真实未知字段，不注入缺失字段', () => {
  const { template } = example()
  const spec = { provider:'sample', providerVersion:'1', parameters:{ operation:'aggregate' }, outputType:{ type:'object', properties:[{ id:'seconds', valueType:{ type:'double' } }] } }
  template.definitions.push({ id:'statistics',calculator:spec })
  const descriptors = [{ configuration:{ ...spec, outputType:{ type:'object', properties:[{ id:'seconds',name:'持续时长',valueType:{ type:'double',unit:'s' } }, { id:'newField',name:'新增字段',valueType:{ type:'boolean' } }, { id:'absent',name:'不存在' }] } } }]
  const before = JSON.stringify({ template,descriptors })
  const fields = metricValueFields({ seconds:60, newField:false, extra:false },metricValueSchema(template,'statistics',descriptors))
  assert.deepEqual(fields.map(item => [item.id,item.name,item.unit]),[['seconds','持续时长','s'],['newField','新增字段',undefined],['extra','extra',undefined]])
  assert.equal(JSON.stringify({ template,descriptors }),before)
  spec.outputType.properties[0].name = 'seconds'
  assert.equal(metricValueFields({ seconds:60 },metricValueSchema(template,'statistics',descriptors))[0].name,'持续时长')
  const english = [{ configuration:{ ...spec, outputType:{ type:'object', properties:[{ id:'seconds',name:'Duration',valueType:{ type:'double',unit:'s' } }] } } }]
  assert.equal(metricValueFields({ seconds:60 },metricValueSchema(template,'statistics',english))[0].name,'Duration')
  assert.equal(spec.outputType.properties[0].name,'seconds')
  spec.outputType.properties[0].name = '自定义'
  assert.equal(metricValueFields({ seconds:60 },metricValueSchema(template,'statistics',descriptors))[0].name,'自定义')
  assert.equal(semanticValueText({ seconds:60, extra:false },{},translate('zh')),'2项结果')
})

test('状态选择保留原类型、异常样本入口可用、只读不写入，中英文切换不改样本', async () => {
  const locale = ref('zh')
  const Sample = createMetricLoader({
    'vue-i18n':{ useI18n:() => ({ locale,t:(...args) => translate(locale.value)(...args) }) },
    [resolve(sourceRoot,'components/Editable/index.vue')]:{ __esModule:true,default:defineComponent({ inheritAttrs:false,setup:(_props,{attrs,expose}) => { expose({ edit:async () => {} }); return () => h('external-shell',attrs) } }) },
  })('components/Metric/template/TemplateSampleValue.vue').default
  const { template } = example(), changes = []
  const props = reactive({ template,input:template.inputDefinitions[0],value:2,disabled:false })
  const { renderer,root } = createMetricRenderer()
  const app = renderer.createApp({ setup:() => () => h(Sample,{ ...props,onChange:value => changes.push(value) }) })
  app.component('APopover',passthrough('a-popover')); app.mount(root)
  try {
    await flush(); assert.match(textContent(root),/未定义状态（2）/)
    const buttons = () => walk(root,item => item.type === 'button')
    const online = buttons().find(item => textContent(item).includes('在线'))
    assert.ok(online); await online.props.onClick(); assert.deepEqual(changes,[1])
    locale.value = 'en'; props.value = 1; await flush(); assert.match(textContent(root),/Online/)
    await buttons().find(item => textContent(item).includes('Other value')).props.onClick(); await flush()
    const editor = walk(root,item => item.type === 'external-shell' && item.props.type === 'number')[0]
    assert.ok(editor); editor.props.onChange(2); props.value = 2; await flush()
    assert.match(textContent(root),/Undefined state \(2\)/)
    assert.ok(buttons().some(item => textContent(item).includes('Online')))
    assert.deepEqual(changes,[1,2])
    props.disabled = true; await flush()
    await buttons().find(item => textContent(item).includes('Repair')).props.onClick()
    assert.deepEqual(changes,[1,2]); assert.equal(props.value,2)
  } finally { app.unmount() }
})

test('日期样本以格式化文本进入完整日期时间编辑，提交毫秒并遵守禁用状态', async () => {
  const Sample = createMetricLoader({ 'vue-i18n':{ useI18n:() => ({ locale:ref('zh'),t:translate('zh') }) } })('components/Metric/template/TemplateSampleValue.vue').default
  const time = new Date(2030,0,2,3,4,5).valueOf(), changes = [], sample = ref()
  const props = reactive({ input:{ id:'measuredAt', name:'采集时间', valueType:{ type:'date' } }, value:time, disabled:false })
  const { renderer,root } = createMetricRenderer()
  const app = renderer.createApp({ setup:() => () => h(Sample,{ ...props,ref:sample,onChange:value => changes.push(value) }) })
  app.component('APopover',passthrough('a-popover'))
  app.component('ADatePicker',defineComponent({ inheritAttrs:false,setup:(_, { attrs }) => () => h('date-control',attrs) }))
  app.config.warnHandler = () => {}; app.mount(root)
  try {
    assert.match(textContent(root),/2030-01-02 03:04:05/)
    await sample.value.edit(); await flush()
    assert.equal(walk(root,node=>node.type === 'a-popover')[0].props.open,true)
    const field = walk(root,node=>node.type === 'date-control')[0]
    assert.equal(field.props.value.valueOf(),time)
    const next = field.props.value.add(1,'second')
    field.props.onChange(next); await flush()
    assert.deepEqual(changes,[time+1000]); assert.equal(typeof changes[0],'number')
    field.props.onChange(undefined); assert.deepEqual(changes,[time+1000,null])
    props.disabled = true; await flush(); await sample.value.edit(); field.props.onChange(next)
    assert.equal(walk(root,node=>node.type === 'a-popover')[0].props.open,false)
    assert.deepEqual(changes,[time+1000,null])
  } finally { app.unmount() }
})
