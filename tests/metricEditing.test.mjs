import assert from 'node:assert/strict'
import test from 'node:test'
import { defineComponent, h, reactive } from 'vue'
import { resolve } from 'node:path'
import { createMetricLoader, createMetricRenderer, flush, walk, textContent, sourceRoot } from './helpers/metricRuntime.mjs'

const load = createMetricLoader({ 'vue-i18n': { useI18n: () => ({ t: key => key }) } })
const Editable = load('components/Editable/InputEditable.vue').default
const focusOutEvent = () => ({ relatedTarget: null, currentTarget: { contains: () => false, ownerDocument: { activeElement: null } } })
const editableShell = root => walk(root, node => node.props.class?.split(' ').includes('input-editable'))[0]

test('从画布添加样本时统一在右栏交接编辑，简单值和复杂值行为一致', async () => {
  const Input=load('components/Metric/template/TemplateSimulationInput.vue').default
  const {renderer,root}=createMetricRenderer(),added=[],details=[]
  const props=reactive({input:{id:'reading',valueType:{type:'double'}},snapshot:{},disabled:false,
    trial:{facts:{samples:[]},addSample:id=>added.push(id)},onDetails:value=>details.push(value)})
  const app=renderer.createApp({setup:()=>()=>h(Input,props)});app.config.warnHandler=()=>{};app.mount(root)
  try {
    const add=()=>walk(root,node=>node.props.class==='trial-input__add')[0].props.onClick()
    add();props.input.valueType.type='object';await flush();add()
    assert.deepEqual(added,['reading','reading']);assert.deepEqual(details,[true,true])
    props.disabled=true;await flush();add();assert.equal(added.length,2)
  } finally {app.unmount()}
})

test('图文选项只用于显式元数据，选中态保留图标和简短名称且值类型不变', async () => {
  const Choice = load('components/SelectOption/index.vue').default
  const control = defineComponent({ inheritAttrs:false, setup:(_, { attrs, slots }) => () => h('select-control', attrs,
    attrs.options?.flatMap(option => slots.option?.(option) || []) || []) })
  const Inline = createMetricLoader({
    'ant-design-vue':{ Input:control, InputNumber:control, Select:control, DatePicker:control, TimePicker:control },
    [resolve(sourceRoot,'components/SelectOption/index.vue')]:{ default:Choice, __esModule:true },
  })('components/Editable/index.vue').default
  const props = reactive({ value:0, type:'select', componentProps:{ options:[
    { value:0, label:'最新值', icon:'ThunderboltOutlined', description:'来源最近的可用值' },
    { value:1, label:'历史序列', icon:'HistoryOutlined', description:'指定时间范围内的记录' },
  ] }, onChange:value => { props.value = value } })
  const { renderer, root } = createMetricRenderer()
  const app = renderer.createApp({ setup:() => () => h(Inline, props) })
  app.config.globalProperties.$t = key => key
  app.component('AIcon', defineComponent({ setup:(_, { attrs }) => () => h('icon', attrs) }))
  app.config.warnHandler = () => {}; app.mount(root)
  try {
    assert.equal(textContent(walk(root, node => node.props.role === 'button')[0]).trim(), '最新值')
    assert.equal(walk(walk(root, node => node.props.role === 'button')[0],node=>node.type==='icon')[0].props.type,'ThunderboltOutlined')
    walk(root, node => node.props.role === 'button')[0].props.onClick(); await flush()
    const field = walk(root, node => node.type === 'select-control')[0]
    assert.equal(field.props['dropdown-match-select-width'], false)
    assert.equal(textContent(walk(root, node => node.type === 'small')[0]), '来源最近的可用值')
    assert.equal(walk(root, node => node.type === 'icon')[0].props.type, 'ThunderboltOutlined')
    field.props['onUpdate:value'](1); field.props.onChange(1); await flush()
    assert.equal(props.value, 1)
    assert.equal(textContent(walk(root, node => node.props.role === 'button')[0]).trim(), '历史序列')
    assert.equal(walk(walk(root, node => node.props.role === 'button')[0],node=>node.type==='icon')[0].props.type,'HistoryOutlined')
    props.componentProps.options = [{ value:1, label:'普通选项' }]; await flush()
    walk(root, node => node.props.role === 'button')[0].props.onClick(); await flush()
    assert.equal(walk(root, node => node.type === 'small').length, 0)
    assert.equal(walk(root, node => node.type === 'select-control')[0].props['dropdown-match-select-width'], undefined)
  } finally { app.unmount() }
})

test('共享句内编辑默认展示文本，键盘进入、提交、取消和撤权均保留单一编辑会话', async () => {
  const control = defineComponent({ inheritAttrs: false, setup: (_props, { attrs, expose }) => {
    expose({ focus() {} }); return () => h('inline-control', attrs)
  } })
  const Inline = createMetricLoader({ 'ant-design-vue': {
    Input: control, InputNumber: control, Select: control,
    DatePicker: Object.assign(control, { RangePicker: control }),
    TimePicker: Object.assign(control, { RangePicker: control }),
  } })('components/Editable/index.vue').default
  const { renderer, root } = createMetricRenderer(); const changes = []
  const props = reactive({ value: '原值', type: 'string', componentProps: { 'aria-label': '句内值' },
    'onUpdate:value': value => { props.value = value }, onChange: value => changes.push(value) })
  const app = renderer.createApp({ setup: () => () => h(Inline, props) })
  app.config.globalProperties.$t = key => key
  app.config.warnHandler = () => {}; app.mount(root)
  const shell = () => walk(root, node => node.props.class === 'editable-field')[0]
  const text = () => walk(root, node => node.props.role === 'button')[0]
  const field = () => walk(root, node => node.type === 'inline-control')[0]
  const key = key => shell().props.onKeydown({ key, preventDefault() {}, stopPropagation() {} })
  try {
    assert.equal(field(), undefined); assert.equal(text().props['aria-label'], '句内值')
    key('Enter'); await flush()
    field().props['onUpdate:value']('新值'); const staleBlur = shell().props.onFocusout
    key('Enter'); await staleBlur(focusOutEvent()); await flush()
    assert.deepEqual(changes, ['新值']); assert.equal(field(), undefined)
    text().props.onClick(); await flush()
    field().props['onUpdate:value']('取消值'); key('Escape'); await flush()
    assert.equal(props.value, '新值'); assert.equal(field(), undefined)
    text().props.onClick(); await flush()
    assert.equal(field().props.value, '新值')
    field().props['onUpdate:value']('撤权值'); const pendingBlur = shell().props.onFocusout
    props.componentProps.disabled = true; await flush(); await pendingBlur(focusOutEvent()); await flush()
    assert.equal(field(), undefined); assert.deepEqual(changes, ['新值'])
    props.componentProps.disabled = false; props.type = 'select'
    props.componentProps.options = [{ value: 0, label: '停机' }, { value: 1, label: '运行' }]
    props.value = 0; await flush(); text().props.onClick(); await flush()
    field().props['onUpdate:value'](1); field().props.onChange(1); await flush()
    assert.equal(props.value, 1); assert.deepEqual(changes, ['新值', 1])
  } finally { app.unmount() }
})

test('句内编辑可直接进入并聚焦输入，保持滚动位置且遵守禁用状态', async () => {
  const input = defineComponent({ inheritAttrs:false, setup:(_, { attrs }) => () => h('input', attrs) })
  const Inline = createMetricLoader({ 'ant-design-vue':{ Input:input, InputNumber:input, Select:input, DatePicker:input, TimePicker:input } })('components/Editable/index.vue').default
  const { renderer, root } = createMetricRenderer()
  const props = reactive({ value:0, type:'number', componentProps:{ disabled:false } })
  const app = renderer.createApp(Inline, props)
  app.config.globalProperties.$t = key => key
  const editor = app.mount(root)
  try {
    assert.equal(walk(root, node => node.type === 'input').length, 0)
    await editor.edit(); await flush()
    assert.deepEqual(walk(root, node => node.type === 'input')[0].focused, { preventScroll:true })
    props.componentProps.disabled = true; await flush()
    await editor.edit(); await flush()
    assert.equal(walk(root, node => node.type === 'input').length, 0)
  } finally { app.unmount() }
})

test('共享原位编辑保留操作槽，Enter与失焦只提交一次，Esc和撤权丢弃输入', async () => {
  const { renderer, root } = createMetricRenderer(); const changes = []
  const props = reactive({ value: '原名称', disabled: false, 'onUpdate:value': value => { changes.push(value); props.value = value } })
  const app = renderer.createApp({ setup: () => () => h(Editable, props) })
  app.config.globalProperties.$t = key => key
  app.component('a-input', defineComponent({ setup: (_props, { attrs, expose }) => { expose({ focus() {} }); return () => h('editable-input', attrs) } }))
  app.config.warnHandler = () => {}; app.mount(root)
  const start = async () => { walk(root, node => node.type === 'a-button')[0].props.onClick(); await flush() }
  const field = () => walk(root, node => node.type === 'editable-input')[0]
  try {
    await start(); field().props['onUpdate:value']('新名称'); field().props.onPressEnter({ isComposing: false })
    await editableShell(root).props.onFocusout(focusOutEvent()); await flush()
    assert.deepEqual(changes, ['新名称'])
    await start(); field().props['onUpdate:value']('取消内容'); field().props.onKeydown({ key: 'Escape', preventDefault() {}, stopPropagation() {} }); await flush()
    assert.equal(props.value, '新名称')
    await start(); field().props['onUpdate:value']('撤权后内容'); props.disabled = true; await flush()
    assert.equal(walk(root, node => node.type === 'editable-input').length, 0)
    assert.equal(walk(root, node => node.type === 'a-button').length, 1)
    assert.deepEqual(changes, ['新名称'])
  } finally { app.unmount() }
})

test('名称异步保存拒绝时保留文本和错误，重复失焦不重发，文字入口不显示额外图标', async () => {
  const { renderer, root } = createMetricRenderer(); const changes = [], requests = []
  let complete
  const props = reactive({ value:'原名称', trigger:'text', error:'', size:'small',
    save:value => { requests.push(value); return new Promise(resolve => { complete = resolve }) },
    'onUpdate:value':value => { changes.push(value); props.value = value } })
  const app = renderer.createApp({ setup:() => () => h(Editable, props) })
  app.config.globalProperties.$t = key => key
  app.component('a-input', defineComponent({ setup:(_props, { attrs, expose }) => {
    expose({ focus() {} }); return () => h('editable-input', attrs)
  } }))
  app.config.warnHandler = () => {}; app.mount(root)
  const field = () => walk(root, node => node.type === 'editable-input')[0]
  try {
    assert.equal(walk(root, node => node.type === 'a-button').length, 0)
    walk(root, node => node.type === 'button')[0].props.onClick(); await flush()
    field().props['onUpdate:value']('重复名称')
    const pending = field().props.onPressEnter({ isComposing: false })
    const blur = editableShell(root).props.onFocusout
    await blur(focusOutEvent()); await flush()
    assert.deepEqual(requests, ['重复名称']); assert.equal(field().props.disabled, true)
    props.error = '名称已存在'; complete(false); await pending; await flush()
    assert.equal(field().props.value, '重复名称'); assert.deepEqual(changes, [])
    assert.equal(textContent(walk(root, node => node.props.role === 'alert')[0]), '名称已存在')
    props.error = ''; field().props['onUpdate:value']('可用名称')
    const accepted = editableShell(root).props.onFocusout(focusOutEvent())
    await flush(); complete(true); await accepted; await flush()
    assert.deepEqual(changes, ['可用名称']); assert.equal(field(), undefined)
  } finally { app.unmount() }
})

test('自定义时长在输入中清空或变成有效ISO时仍保留文本控件，离开后才转换', async () => {
  const Duration = load('components/Metric/template/TemplateDuration.vue').default
  const { renderer, root } = createMetricRenderer()
  const props = reactive({ modelValue: '15m', 'onUpdate:modelValue': value => { props.modelValue = value } })
  const app = renderer.createApp({ setup: () => () => h(Duration, props) }); app.config.warnHandler = () => {}; app.mount(root)
  try {
    const wrapper = walk(root, node => node.props.class === 'template-duration')[0]
    wrapper.props.onFocusin()
    walk(root, node => node.type === 'a-input')[0].props['onUpdate:value'](''); await flush()
    assert.equal(walk(root, node => node.type === 'a-input').length, 1)
    walk(root, node => node.type === 'a-input')[0].props['onUpdate:value']('PT5M'); await flush()
    assert.equal(walk(root, node => node.type === 'a-input').length, 1)
    wrapper.props.onFocusout({ currentTarget: { contains: () => false }, relatedTarget: null }); await flush()
    assert.equal(walk(root, node => node.type === 'external-shell' && node.props.type === 'number')[0].props.value, 5)
  } finally { app.unmount() }
})
