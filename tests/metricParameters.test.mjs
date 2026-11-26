import assert from 'node:assert/strict'
import test from 'node:test'
import { defineComponent, h, reactive, ref, provide } from 'vue'
import { createMetricLoader, createMetricRenderer, flush, walk, textContent } from './helpers/metricRuntime.mjs'

const locale = ref('zh')
const t = (key, values) => values ? `${key}:${JSON.stringify(values)}` : key
const load = createMetricLoader({ 'vue-i18n':{ useI18n:() => ({ t, locale }) } })
const TemplateParameters = load('components/Metric/template/TemplateParameters.vue').default
const Parameters = load('components/Metric/MetricParameters.vue').default
const Value = load('components/Metric/MetricParameterValue.vue').default
const Settings = load('components/Metric/template/TemplateParameterSettings.vue').default
const { parameterRange, parameterConstraints, parameterPrecision } = load('components/Metric/parameterPresentation.ts')
const { localizedTemplate, parameterEnumField } = load('components/Metric/template/text.ts')
const { templateParameterReferences, updateTemplateParameter, removeTemplateParameter, templateParameterDefault } = load('components/Metric/template/parameters.ts')
const { templateReferenceKey } = load('components/Metric/template/templateReference.ts')
const { parameterOverrides } = load('components/Metric/service.ts')
const base = () => ({
  id:'filter', version:'1', name:'滤网', inputDefinitions:[], outputs:[], definitions:[{ id:'attention', name:'压差偏高', expression:'reading > params.limit' }],
  parameterDefinitions:[{ id:'limit', name:'压差提醒值', description:'压差高于此值时提醒', valueType:{ type:'double', min:0, max:1000, scale:0, unit:'Pa' }, expands:{ editable:true } }],
  parameters:{ limit:0 }, options:{ custom:false, i18nMessages:{ 'parameter.limit.name':{ en:'Pressure limit' }, 'parameter.limit.description':{ en:'Notify above this pressure difference' } } },
})
function mount(component, props, context) {
  const view = createMetricRenderer()
  const app = view.renderer.createApp({ setup:() => { if (context) provide(templateReferenceKey, context); return () => h(component, props) } })
  for (const name of ['a-button','a-empty','a-dropdown','a-menu','a-menu-item','AIcon']) app.component(name, defineComponent({ inheritAttrs:false, setup:(_, { attrs, slots }) => () => h(name, attrs, Object.values(slots).flatMap(slot => slot?.())) }))
  app.config.warnHandler = () => {}
  app.mount(view.root)
  return { ...view, close:() => app.unmount() }
}
const fields = root => walk(root, node => node.type === 'external-shell')
const editor = (root, label) => fields(root).find(node => node.props['component-props']?.['aria-label'] === label)
const blocks = root => walk(root, node => node.type === 'article' && node.props['data-parameter'])
const toggle = block => walk(block, node => node.type === 'button' && node.props.class === 'metric-parameter__toggle')[0]
const body = block => walk(block, node => node.props.class === 'metric-parameter__body')[0]

test('模板参数每次展开一项，折叠保留值编辑器和草稿，名称编辑不改变展开项', async () => {
  const template = base()
  template.parameterDefinitions.push({ id:'enabled', name:'提醒开关', valueType:{ type:'boolean' }, expands:{ editable:true } })
  template.parameters.enabled = false
  const props = reactive({ template, disabled:false, published:false })
  props['onUpdate:template'] = value => { props.template = value }
  const view = mount(TemplateParameters, props)
  try {
    let items = blocks(view.root)
    assert.equal(toggle(items[0]).props['aria-expanded'], true)
    assert.equal(body(items[1]).style.display, 'none')
    assert.match(textContent(walk(items[1], node => node.props.class === 'metric-parameter__summary')[0]), /parameterOff/)
    const draftEditor = fields(items[0]).find(node => node.props.class?.includes('metric-parameter-value'))
    draftEditor.props.onChange(320); await flush()
    toggle(items[1]).props.onClick(); await flush()
    items = blocks(view.root)
    assert.equal(body(items[0]).style.display, 'none')
    assert.notEqual(body(items[1]).style.display, 'none')
    assert.equal(toggle(items[1]).props['aria-controls'], body(items[1]).props.id)
    assert.deepEqual(toggle(items[1]).focused, { preventScroll:true })
    assert.equal(fields(items[0]).find(node => node.props.class?.includes('metric-parameter-value')), draftEditor)
    assert.match(textContent(walk(items[0], node => node.props.class === 'metric-parameter__summary')[0]), /320.*Pa/)
    fields(items[1]).find(node => node.props.field === 'parameter.enabled.name').props.onChange({ value:'运行提醒', i18nMessages:{} }); await flush()
    assert.equal(toggle(blocks(view.root)[1]).props['aria-expanded'], true)
    toggle(blocks(view.root)[1]).props.onClick(); await flush()
    assert.equal(blocks(view.root).every(item => toggle(item).props['aria-expanded'] === false), true)
    assert.equal(props.template.parameters.limit, 320)
    assert.equal(props.template.parameters.enabled, false)
  } finally { view.close() }
})

test('新增参数自动展开，删除其他参数保留展开归属，切换模板重置到首项', async () => {
  const props = reactive({ template:base(), disabled:false, published:false })
  props['onUpdate:template'] = value => { props.template = value }
  const view = mount(TemplateParameters, props)
  try {
    const addMenu = walk(view.root, node => node.type === 'a-menu' && typeof node.props.onClick === 'function')[0]
    await addMenu.props.onClick({ key:'boolean' }); await flush()
    assert.equal(toggle(blocks(view.root)[0]).props['aria-expanded'], false)
    assert.equal(toggle(blocks(view.root)[1]).props['aria-expanded'], true)
    walk(blocks(view.root)[0], node => node.type === 'a-menu-item')[0].props.onClick(); await flush()
    assert.equal(toggle(blocks(view.root)[0]).props['aria-expanded'], true)
    props.template = { ...base(), id:'other' }; await flush()
    assert.equal(toggle(blocks(view.root)[0]).props['aria-expanded'], true)
    assert.equal(props.template.parameterDefinitions[0].id, 'limit')
  } finally { view.close() }
})

test('业务参数折叠摘要保留false与0，折叠状态不因值更新或定义刷新被打开', async () => {
  const props = reactive({ definitions:[
    { id:'enabled', name:'提醒开关', valueType:{ type:'boolean' }, expands:{ editable:true } },
    { id:'amount', name:'数量', valueType:{ type:'int' }, expands:{ editable:true } },
  ], values:{ enabled:false, amount:0 }, defaults:{} })
  const view = mount(Parameters, props)
  try {
    toggle(blocks(view.root)[1]).props.onClick(); await flush()
    assert.match(textContent(walk(blocks(view.root)[0], node => node.props.class === 'metric-parameter__summary')[0]), /parameterOff/)
    toggle(blocks(view.root)[1]).props.onClick(); await flush()
    assert.match(textContent(walk(blocks(view.root)[1], node => node.props.class === 'metric-parameter__summary')[0]), /0/)
    props.values.amount = 2; props.definitions = [...props.definitions]; await flush()
    assert.equal(blocks(view.root).every(item => toggle(item).props['aria-expanded'] === false), true)
    assert.match(textContent(walk(blocks(view.root)[1], node => node.props.class === 'metric-parameter__summary')[0]), /2/)
  } finally { view.close() }
})

test('参数展示覆盖零边界、单边界、无范围和精度0，不把业务默认值当约束', () => {
  const parameter = base().parameterDefinitions[0]
  assert.deepEqual(parameterRange(parameter, 0), { min:0, max:1000, position:0 })
  assert.equal(parameterRange(parameter, 500).position, 50)
  assert.equal(parameterRange(parameter, 2000).position, undefined)
  assert.equal(parameterRange({ ...parameter, valueType:{ type:'double', min:0 } }, 0), undefined)
  assert.match(parameterConstraints({ ...parameter, valueType:{ type:'double', min:0 } }, t), /parameterAtLeast:.*"min":0/)
  assert.match(parameterConstraints({ ...parameter, valueType:{ type:'double', max:0 } }, t), /parameterAtMost:.*"max":0/)
  assert.equal(parameterConstraints({ ...parameter, valueType:{ type:'double' } }, t), 'parameterNumber')
  assert.equal(parameterPrecision(parameter), 0)
  assert.equal(parameterPrecision({ ...parameter, valueType:{ type:'int', scale:3 } }), 0)
  assert.equal(parameterRange({ ...parameter, valueType:{ type:'double', min:5, max:5 } }, 5), undefined)
  assert.equal(parameterConstraints({ id:'text', valueType:{ type:'string', maxLength:5 } }, t), 'parameterText')
})

test('国际化只生成显示副本，名称、用途和枚举文字按稳定编码翻译', () => {
  const template = base()
  template.parameterDefinitions.push({ id:'mode', name:'工况', valueType:{ type:'enum', elements:[{ value:'normal', text:'正常' }, { value:"special.'key", text:'特殊' }] } })
  template.options.i18nMessages[parameterEnumField('mode','normal')] = { en:'Normal' }
  template.options.i18nMessages[parameterEnumField('mode',"special.'key")] = { en:'Special' }
  const original = JSON.stringify(template)
  const en = localizedTemplate(template, 'en-US')
  assert.equal(en.parameterDefinitions[0].name, 'Pressure limit')
  assert.equal(en.parameterDefinitions[0].description, 'Notify above this pressure difference')
  assert.deepEqual(en.parameterDefinitions[1].valueType.elements.map(item => [item.value,item.text]), [['normal','Normal'],["special.'key",'Special']])
  template.parameterDefinitions[1].valueType.elements.reverse()
  assert.equal(localizedTemplate(template, 'en').parameterDefinitions[1].valueType.elements[0].text, 'Special')
  template.parameterDefinitions[1].valueType.elements.reverse()
  assert.equal(JSON.stringify(template), original)
})

test('参数改标识、删除同步默认值和对应翻译，不影响其他参数或扩展', () => {
  const template = base()
  template.parameterDefinitions.push({ id:'limit.extra', name:'其他' })
  template.options.i18nMessages['parameter.limit.extra.name'] = { en:'Other' }
  const updated = updateTemplateParameter(template, 0, { id:'pressure' })
  assert.equal(updated.parameters.pressure, 0)
  assert.equal(Object.hasOwn(updated.parameters, 'limit'), false)
  assert.equal(updated.options.i18nMessages['parameter.pressure.name'].en, 'Pressure limit')
  assert.equal(updated.options.i18nMessages['parameter.limit.name'], undefined)
  assert.equal(updated.options.i18nMessages['parameter.limit.extra.name'].en, 'Other')
  const removed = removeTemplateParameter(updated, 0)
  assert.deepEqual(removed.parameters, {})
  assert.equal(removed.options.i18nMessages['parameter.pressure.description'], undefined)
  assert.equal(removed.options.custom, false)
  assert.equal(template.parameters.limit, 0)
})

test('引用覆盖计算、条件、工况及进入恢复表达式，忽略字符串与动态算法常量', () => {
  const template = base()
  template.definitions = [
    { id:'r', expression:"params.limit + params['special-''key']", applicabilityExpression:'#params.limit > 0', contextKeyExpression:'params.mode', temporalCondition:{ enterExpression:'params.enter', exitExpression:'params.exit' } },
    { id:'legacy', expression:"#sample.getTags()['parameters']['limit']" },
    { id:'literal', expression:"'params.limit' + \"params.mode\" + object.params.limit", calculator:{ parameters:{ literal:'params.limit' } } },
  ]
  const refs = templateParameterReferences(template)
  assert.deepEqual(refs.get('limit').map(item => item.id), ['r','legacy'])
  assert.equal(refs.get("special-'key")[0].id, 'r')
  for (const id of ['mode','enter','exit']) assert.equal(refs.get(id)[0].id, 'r')
  assert.equal([...refs.values()].flat().some(item => item.id === 'literal'), false)
})

test('模板参数块原位编辑保留扩展、默认0，引用悬停与定位沿用画布上下文', async () => {
  const props = reactive({ template:base(), disabled:false, published:false })
  const changes = [], previews = [], locations = []
  props['onUpdate:template'] = value => { changes.push(value); props.template = value }
  const view = mount(TemplateParameters, props, { preview:id => previews.push(id), locate:id => locations.push(id) })
  try {
    assert.equal(walk(view.root, node => node.type === 'a-form').length, 0)
    assert.equal(walk(view.root, node => node.type === 'article').length, 1)
    const value = fields(view.root).find(node => node.props.class?.includes('metric-parameter-value'))
    assert.equal(value.props.value, 0)
    value.props.onChange(200); await flush()
    assert.equal(props.template.parameters.limit, 200)
    assert.equal(props.template.options.custom, false)
    const reference = walk(view.root, node => node.props['data-reference'] === 'attention')[0]
    reference.props.onMouseenter(); reference.props.onMouseleave()
    assert.deepEqual(previews, ['attention',undefined])
    walk(reference, node => node.type === 'a-button')[0].props.onClick({ stopPropagation() {} })
    assert.deepEqual(locations, ['attention'])
    const purpose = fields(view.root).find(node => node.props.field === 'parameter.limit.description')
    purpose.props.onChange({ value:'新的用途', i18nMessages:{ ...props.template.options.i18nMessages, 'parameter.limit.description':{ zh:'新的用途', en:'New purpose' } } })
    await flush()
    assert.equal(props.template.parameterDefinitions[0].description, '新的用途')
    assert.equal(props.template.options.i18nMessages['parameter.limit.description'].en, 'New purpose')
    const before = JSON.stringify(props.template)
    locale.value = 'en'; await flush()
    assert.equal(JSON.stringify(props.template), before)
    assert.equal(fields(view.root).find(node => node.props.class?.includes('metric-parameter-value')).props['component-props']['aria-label'], 'Pressure limit')
    props.disabled = true; await flush()
    value.props.onChange(300)
    assert.equal(props.template.parameters.limit, 200)
  } finally { locale.value = 'zh'; view.close() }
})

test('业务参数仅展示开放项，保留0与false，恢复默认移除覆盖并恢复绑定模板值', async () => {
  const definitions = [
    { id:'factor', name:'系数', valueType:{ type:'double' }, expands:{ editable:true, defaultValue:9 } },
    { id:'enabled', name:'开关', valueType:{ type:'boolean' }, expands:{ editable:true } },
    { id:'fixed', name:'固定', expands:{ editable:false } },
  ]
  const props = reactive({ definitions, values:{ factor:0, enabled:false, fixed:99 }, defaults:{ factor:5, enabled:true }, disabled:false })
  props.onChange = (id,value) => { props.values[id] = value }
  props.onReset = id => { delete props.values[id] }
  const view = mount(Parameters, props)
  try {
    assert.equal(walk(view.root, node => node.type === 'article').length, 2)
    assert.equal(walk(view.root, node => node.type === 'a-form').length, 0)
    const value = fields(view.root).filter(node => node.props.class?.includes('metric-parameter-value'))
    assert.equal(value[0].props.value, 0)
    assert.equal(value[1].props.value, 'false')
    const reset = walk(view.root, node => node.type === 'a-button' && textContent(node).includes('parameterRestoreDefault'))[0]
    reset.props.onClick(); await flush()
    assert.equal(Object.hasOwn(props.values,'factor'), false)
    assert.equal(fields(view.root).find(node => node.props.class?.includes('metric-parameter-value')).props.value, 5)
    const overrides = parameterOverrides({ parameterDefinitions:definitions }, props.values)
    assert.deepEqual(overrides, { enabled:false })
    props.disabled = true; await flush()
    walk(view.root, node => node.type === 'a-button')[0].props.onClick()
    assert.equal(props.values.enabled, false)
  } finally { view.close() }
})

test('枚举显示与编码分离，布尔切换保留原生值，类型改变不改写旧默认值', async () => {
  const values = []
  const props = reactive({ parameter:{ id:'mode', valueType:{ type:'enum', elements:[{ value:'0', text:'停机' }] } }, modelValue:'0', inline:true, 'onUpdate:modelValue':value => values.push(value) })
  const view = mount(Value, props)
  try {
    assert.equal(textContent(view.root), '停机')
    fields(view.root)[0].props.onChange('0')
    assert.equal(values.at(-1), '0')
    props.parameter.valueType = { type:'boolean' }; props.modelValue = false; await flush()
    assert.equal(textContent(view.root), 'parameterOff')
    fields(view.root)[0].props.onChange('true')
    assert.equal(values.at(-1), true)
    props.parameter.valueType = { type:'double', min:0, max:10, scale:0 }; props.modelValue = '旧文本'; await flush()
    assert.equal(textContent(view.root), '旧文本')
    assert.equal(values.length, 2)
    assert.equal(fields(view.root)[0].props['component-props'].precision, 0)
    assert.equal(fields(view.root)[0].props['component-props'].min, 0)
  } finally { view.close() }
})

test('枚举编辑一次提交文字与翻译，编码迁移不丢翻译，已发布状态阻止结构修改', async () => {
  const props = reactive({ parameter:{ id:'mode', valueType:{ type:'enum', elements:[{ value:'normal', text:'正常' }] } }, messages:{ [parameterEnumField('mode','normal')]:{ en:'Normal' } }, disabled:false, published:false })
  const changes = []
  props.onPatch = (fields,messages) => { changes.push([fields,messages]); props.parameter = { ...props.parameter,...fields }; if (messages) props.messages = messages }
  const view = mount(Settings, props)
  try {
    fields(view.root).find(node => node.props.field === parameterEnumField('mode','normal')).props.onChange({ value:'运行', i18nMessages:{ [parameterEnumField('mode','normal')]:{ en:'Running' } } })
    await flush()
    assert.equal(changes.length, 1)
    assert.equal(props.parameter.valueType.elements[0].text, '运行')
    assert.equal(props.messages[parameterEnumField('mode','normal')].en, 'Running')
    editor(view.root,'parameterChoiceCode').props.onChange('running'); await flush()
    assert.equal(props.messages[parameterEnumField('mode','normal')], undefined)
    assert.equal(props.messages[parameterEnumField('mode','running')].en, 'Running')
    props.published = true; await flush()
    const count = changes.length
    editor(view.root,'parameterChoiceCode').props.onChange('bad')
    assert.equal(changes.length, count)
    assert.equal(props.parameter.id, 'mode')
    fields(view.root).find(node => node.props.field === parameterEnumField('mode','running')).props.onChange({ value:'已运行', i18nMessages:{ [parameterEnumField('mode','running')]:{ zh:'已运行', en:'Running' } } })
    await flush()
    assert.equal(props.parameter.valueType.elements[0].text, '运行')
    assert.equal(props.messages[parameterEnumField('mode','running')].zh, '已运行')
    assert.deepEqual(changes.at(-1)[0], {})
  } finally { view.close() }
})

test('发布后名称、用途及默认值可改，身份与权限的事件不能绕过限制', async () => {
  const props = reactive({ template:base(), disabled:false, published:true })
  const changes = []
  props['onUpdate:template'] = value => { changes.push(value); props.template = value }
  const view = mount(TemplateParameters, props)
  try {
    editor(view.root,'declarationId').props.onChange('other')
    editor(view.root,'parameterType').props.onChange('string')
    const permission = walk(view.root, node => node.type === 'button' && node.props.class === 'metric-parameters__permission')[0]
    permission.props.onClick()
    assert.equal(changes.length, 0)
    fields(view.root).find(node => node.props.class?.includes('metric-parameter-value')).props.onChange(300)
    await flush()
    assert.equal(props.template.parameters.limit, 300)
    assert.equal(templateParameterDefault(props.template, props.template.parameterDefinitions[0]), 300)
    assert.equal(walk(view.root, node => node.type === 'a-dropdown').length, 0)
  } finally { view.close() }
})

test('开关参数不产生空的设置区，类型与标识直接编辑，移除位于更多菜单', async () => {
  const template = base()
  template.parameterDefinitions = [{ id:'enabled', name:'启用提醒', valueType:{ type:'boolean' }, expands:{ editable:false } }]
  template.parameters = { enabled:false }
  const props = reactive({ template, disabled:false, published:false })
  props['onUpdate:template'] = value => { props.template = value }
  const view = mount(TemplateParameters, props)
  try {
    assert.equal(walk(view.root, node => node.type === 'details').length, 0)
    assert.ok(editor(view.root, 'declarationId'))
    assert.ok(editor(view.root, 'parameterType'))
    assert.equal(walk(view.root, node => node.type === 'a-button' && textContent(node).includes('remove')).length, 0)
    const menu = walk(view.root, node => node.type === 'a-menu-item' && textContent(node).includes('remove'))[0]
    assert.ok(menu)
    editor(view.root,'parameterType').props.onChange('double'); await flush()
    assert.equal(props.template.parameters.enabled, false)
    assert.equal(walk(view.root, node => node.type === 'details').length, 1)
    menu.props.onClick(); await flush()
    assert.equal(props.template.parameterDefinitions.length, 0)
  } finally { view.close() }
})
