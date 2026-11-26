import assert from 'node:assert/strict'
import test from 'node:test'
import { defineComponent, h } from 'vue'
import { resolve } from 'node:path'
import { createMetricLoader, createMetricRenderer, sourceRoot, walk, textContent, flush } from './helpers/metricRuntime.mjs'

const load = createMetricLoader({
  'vue-i18n': { useI18n: () => ({ t: (key, values) => values ? `${key}:${JSON.stringify(values)}` : key, locale: { value: 'zh' } }) },
  [resolve(sourceRoot, 'components/Metric/template/formula/TemplateFormulaDisplay.vue')]: { default: defineComponent({ props: ['expression'], setup: props => () => h('math-display', props.expression) }), __esModule: true },
  ...Object.fromEntries(['TemplateNodeEditor', 'TemplatePresentation'].map(name=>[resolve(sourceRoot, `components/Metric/template/${name}.vue`),{default:defineComponent({setup:()=>()=>h('editor-boundary')}),__esModule:true}])),
})
const Catalog = load('components/Metric/template/TemplateCatalog.vue').default
const { starterCatalog, templateCatalog } = load('components/Metric/template/templateCatalog.ts')
const Designer = load('components/Metric/template/TemplateDesigner.vue').default
const { simulationOperation } = load('components/Metric/template/simulationFlow.ts')
const { nodeLabel, expressionLabel } = load('components/Metric/template/designer.ts')
const { ruleFormulaReferences } = load('components/Metric/template/formula.ts')
const mount = (component, props) => {
  const view = createMetricRenderer(); const app = view.renderer.createApp(component, props)
  app.mount(view.root); return { ...view, app }
}

test('场景卡片按业务分段，点击直接选择原起点，概览不引入额外预览弹窗', async () => {
  const selected = []
  const starters = ['A', 'B', 'C'].map((name,index) => ({ id:name,name,description:`${name} purpose`,groupId:index<2?'energy':undefined,template:{ name, options:{description:`${name} purpose`}, inputDefinitions:[], definitions:[], parameterDefinitions:[], outputs:[{metricId:'value',label:'Result'}] } }))
  const view = mount(Catalog, { groups:starterCatalog(starters, 'zh', [{value:'energy',label:'Energy'}], 'Other'), onSelect:value=>selected.push(value) })
  try {
    assert.deepEqual(walk(view.root,node=>node.type==='h3').map(textContent), ['Energy', 'Other'])
    const buttons = walk(view.root,node=>node.type==='button')
    assert.equal(buttons.length,3)
    buttons[1].props.onClick()
    await flush()
    assert.equal(selected.length,1)
    assert.equal(selected[0].starter.id,starters[1].id)
    assert.equal(selected[0].starter.template.name,starters[1].template.name)
    assert.deepEqual(selected[0].starter.template.outputs,starters[1].template.outputs)
    assert.equal(starters[1].providerName,undefined)
    assert.equal(walk(view.root,node=>node.type==='a-modal').length,0)
    assert.ok(textContent(view.root).includes('B purpose'))
  } finally { view.app.unmount() }
})

test('已有模板按稳定分类与当前语言展示，未注册分类归其他且不改写历史内容', () => {
  const template = { id:'unrelated-id', name:'能耗', version:'1', inputDefinitions:[], definitions:[], outputs:[], parameterDefinitions:[], options:{ category:'energy', custom:false, i18nMessages:{ name:{ en:'Energy' } } } }
  const entities = [
    { id:'one', template, released:true, available:true, draft:{ ...template, name:'未发布名称' } },
    { id:'two', template:{ ...template, options:{ category:'unregistered' } } },
    { id:'three', template:{ ...template, options:{} } },
  ]
  const before = JSON.stringify(entities)
  const groups = templateCatalog(entities, [{ value:'energy', label:'Energy & water' }, { value:'fire', label:'Fire' }], 'en', 'Other')
  assert.deepEqual(groups.map(item=>[item.id,item.label,item.items.length]), [['energy','Energy & water',1],['','Other',2]])
  assert.equal(groups[0].items[0].template.name,'Energy')
  assert.ok(groups[0].items[0].entity.draft)
  assert.equal(JSON.stringify(entities),before)
})

test('主体说明与参数收进属性面板，更新保留扩展，不以表单承载', async () => {
  const changes=[]
  const template={id:'runtime',version:'1',name:'Runtime',inputDefinitions:[],definitions:[],outputs:[],parameterDefinitions:[{id:'limit',name:'Limit',valueType:{type:'double',unit:'Pa'}}],parameters:{limit:0},options:{description:'Observe pressure',notes:'Site baseline',custom:false}}
  const view=mount(Designer,{template,disabled:false,categories:[{value:'maintenance',label:'Maintenance'}],'onUpdate:template':value=>changes.push(value)})
  try {
    await flush()
    assert.ok(textContent(view.root).includes('parameterSettings'))
    const number=walk(view.root,node=>node.type==='external-shell' && node.props.class?.includes('metric-parameter-value'))[0]
    assert.equal(number.props.value,0)
    number.props.onChange(12.5)
    assert.equal(changes.at(-1).parameters.limit,12.5)
    assert.equal(changes.at(-1).options.custom,false)
    const category = walk(view.root,node=>node.type==='external-shell' && node.props.type==='select' && node.props['component-props']?.['aria-label']==='templateCategory')[0]
    category.props.onChange('maintenance')
    assert.equal(changes.at(-1).options.category,'maintenance')
    assert.equal(changes.at(-1).options.custom,false)
    assert.equal(template.parameters.limit,0)
    const editable=walk(view.root,node=>node.type==='external-shell'&&node.props.value==='Observe pressure')[0]
    assert.ok(editable)
    editable.props.onChange({ value: 'Observe comparable pressure', i18nMessages: { description: { zh: 'Observe comparable pressure', en: 'Observe pressure' } } })
    assert.equal(changes.at(-1).options.description,'Observe comparable pressure')
    assert.equal(changes.at(-1).options.notes,'Site baseline')
    assert.equal(changes.at(-1).options.custom,false)
    assert.equal(walk(view.root,node=>node.type==='a-form').length,0)
  } finally { view.app.unmount() }
})

test('算法叙述读取真实规则参数，未知计算器保持通用扩展', () => {
  const t=(key,values)=>`${key}:${JSON.stringify(values||{})}`
  const state=simulationOperation({calculator:{provider:'state',parameters:{duration:'PT1H',maxHold:'PT20M'}}},t)
  assert.match(state,/stateCalculationSummary/)
  assert.match(state,/20/)
  assert.match(simulationOperation({calculator:{provider:'measurement',parameters:{operation:'increase'}},inputs:[{id:'reading'}]},t),/increaseCalculationSummary.*reading/)
  assert.equal(simulationOperation({calculator:{provider:'custom-model'}},t),'custom-model')
})

test('未公开的中间计算使用已有名称，显示名不改写公式引用', () => {
  const intermediate = { id: 'mainUsage', name: '总表用水' }
  const rule = { id: 'difference', dependsOn: ['mainUsage'], expression: 'mainUsage - 1' }
  const template = { inputDefinitions: [], definitions: [intermediate, rule], outputs: [], parameterDefinitions: [] }
  assert.equal(nodeLabel(template, { kind: 'rule', index: 0 }), '总表用水')
  assert.equal(expressionLabel(template, rule.expression), '总表用水 - 1')
  const reference = ruleFormulaReferences(template, rule)[0]
  assert.equal(reference.label, '总表用水')
  assert.equal(reference.expression, 'mainUsage')
  assert.equal(rule.expression, 'mainUsage - 1')
})
