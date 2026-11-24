import assert from 'node:assert/strict'
import test from 'node:test'
import { effectScope, ref } from 'vue'
import { createMetricLoader, flush } from './helpers/metricRuntime.mjs'

const listeners = new Map()
let confirmOptions, confirmed = 0, destroyed = 0
const load = createMetricLoader({ '@vueuse/core':{ useEventListener:(_target,name,handler) => { listeners.set(name,handler) } },
  'ant-design-vue':{ Modal:{ confirm:options => { confirmOptions = options; confirmed++; return { destroy:() => { destroyed++ } } } } },
})
const { canvasAnchor,canvasFit,canvasScale,canvasKeyTarget,useCanvasViewport } = load('hooks/useCanvasViewport.ts')
const { useTemplateNodeRemoval } = load('components/Metric/template/useTemplateNodeRemoval.ts')
class ElementBoundary {
  constructor({ protectedEditor=false,node=false,outside=false } = {}) { Object.assign(this,{protectedEditor,node,outside}) }
  closest(selector) { return this.protectedEditor && selector.includes('input,textarea') || this.node && selector === 'button[data-node]' ? this : null }
}
globalThis.Element = ElementBoundary
function viewport() {
  const root = new ElementBoundary()
  Object.assign(root,{ clientWidth:500,clientHeight:400,scrollLeft:100,scrollTop:80,contains:target => target instanceof ElementBoundary && !target.outside,
    getBoundingClientRect:() => ({left:10,top:20}),ownerDocument:{activeElement:root},setPointerCapture() {},hasPointerCapture:() => false })
  return root
}

test('缩放围绕同一世界坐标、居中图层不漂移，适应不会放大或越过边界', () => {
  assert.equal(canvasAnchor(100,200,500,1000,1,1.5),250)
  assert.equal(canvasAnchor(0,250,500,200,1,2),0)
  assert.equal(canvasFit({width:1000,height:800},{width:524,height:424}),.5)
  assert.equal(canvasFit({width:100,height:100},{width:1000,height:1000}),1)
  assert.equal(canvasScale(99),2);assert.equal(canvasScale(.01),.2)
  assert.equal(canvasFit({width:5000,height:3000},{width:524,height:424},.05),.1,'large read-only graphs can fit below the editor minimum')
})

test('仅图内空白和节点拥有快捷键；嵌套编辑器、组合输入、弹层和图外不被接管', async () => {
  const scope = effectScope(),element = viewport(),root = ref(element),blocked = ref(false),calls = []
  let stopped=0
  const view = scope.run(() => useCanvasViewport(root,ref({width:1000,height:800}),{clear:() => calls.push('clear'),remove:() => calls.push('remove'),blocked:() => blocked.value}))
  const key = (value,target=element,extra={}) => { let prevented=false;view.keydown({key:value,target,preventDefault:() => {prevented=true},stopPropagation() {stopped++},...extra});return prevented }
  try {
    assert.equal(canvasKeyTarget(element,new ElementBoundary({outside:true})),false)
    assert.equal(key('Delete',new ElementBoundary({protectedEditor:true})),false)
    assert.equal(key('Delete',element,{isComposing:true}),false)
    assert.equal(key('Delete',element,{metaKey:true}),false)
    assert.equal(key('Delete',element,{repeat:true}),true);assert.deepEqual(calls,[])
    key('Backspace',new ElementBoundary({node:true}));assert.deepEqual(calls,['remove'])
    blocked.value=true;key('Delete');assert.deepEqual(calls,['remove'])
    blocked.value=false;key('Escape');assert.deepEqual(calls,['remove','clear'])
    assert.ok(stopped>0,'handled Escape must not close the outer drawer')
    key('+');await flush();assert.equal(view.scale.value,1.2)
    key('1');await flush();assert.equal(view.scale.value,1)
    key('0');await flush();assert.equal(view.scale.value,.47)
  } finally {scope.stop()}
})

test('自动适应可保留可读比例；显式适应和快捷键仍能查看全图', async () => {
  const scope=effectScope(),element=viewport()
  const view=scope.run(() => useCanvasViewport(ref(element),ref({width:1600,height:800}),{clear() {},remove() {},blocked:()=>false},{minimumScale:.05}))
  try {
    await view.fit(.85)
    assert.equal(view.scale.value,.85)
    assert.equal(element.scrollLeft,430); assert.equal(element.scrollTop,0)
    await view.fit()
    assert.equal(view.scale.value,canvasFit({width:1600,height:800},{width:500,height:400},.05))
    await view.fit(.85)
    view.keydown({key:'0',target:element,preventDefault() {},stopPropagation() {}})
    await flush()
    assert.ok(view.scale.value<.85)
  } finally {scope.stop()}
})

test('修饰滚轮只在已聚焦画布内缩放，普通滚轮、输入区域和图外焦点保留默认行为', async () => {
  const scope=effectScope(),element=viewport()
  const state=scope.run(() => useCanvasViewport(ref(element),ref({width:1000,height:800}),{clear() {},remove() {},blocked:()=>false}))
  let prevented=0
  const wheel=(extra={}) => listeners.get('wheel')({target:element,deltaY:-100,clientX:210,clientY:220,preventDefault() {prevented++},...extra})
  try {
    wheel();assert.equal(prevented,0)
    element.ownerDocument.activeElement=new ElementBoundary({outside:true});wheel({ctrlKey:true});assert.equal(prevented,0)
    element.ownerDocument.activeElement=element
    wheel({ctrlKey:true,target:new ElementBoundary({protectedEditor:true})});assert.equal(prevented,0)
    wheel({ctrlKey:true});await flush();assert.ok(state.scale.value>1);assert.equal(prevented,1)
    const previous=state.scale.value;wheel({metaKey:true});await flush();assert.ok(state.scale.value>previous);assert.equal(prevented,2)
  } finally {scope.stop()}
})

test('空格拖动只平移内部滚动，阻止随后的节点点击，失焦与卸载释放手势', () => {
  const scope=effectScope(),element=viewport()
  const view=scope.run(() => useCanvasViewport(ref(element),ref({width:1000,height:800}),{clear() {},remove() {},blocked:()=>false}))
  try {
    view.keydown({key:' ',target:element,preventDefault() {},stopPropagation() {}})
    view.down({target:element,button:0,pointerId:1,clientX:200,clientY:200,preventDefault() {},stopPropagation() {}})
    view.move({pointerId:1,clientX:150,clientY:120})
    assert.equal(element.scrollLeft,150);assert.equal(element.scrollTop,160)
    view.end();let stopped=false;view.click({preventDefault() {},stopPropagation() {stopped=true}});assert.equal(stopped,true)
    view.focusout({relatedTarget:new ElementBoundary({outside:true})});assert.equal(view.space.value,false);assert.equal(view.dragging.value,false)
  } finally {scope.stop()}
})

test('鼠标与快捷键删除同一确认入口，禁止只读／无效／发布输入输出，确认时重查权限与节点身份', () => {
  const scope=effectScope(),state={node:{kind:'input',index:0},identity:'input:a',disabled:false,invalid:false,published:false}
  let removed=0
  const removal=scope.run(() => useTemplateNodeRemoval(() => state,() => {removed++},key=>key))
  try {
    const before=confirmed
    state.disabled=true;removal.requestRemove();state.disabled=false;state.invalid=true;removal.requestRemove();state.invalid=false
    state.published=true;removal.requestRemove();assert.equal(confirmed,before)
    state.node={kind:'rule',index:0};state.identity='rule:a';removal.requestRemove();removal.requestRemove();assert.equal(confirmed,before+1)
    state.identity='rule:b';confirmOptions.onOk();assert.equal(removed,0)
    removal.requestRemove();state.disabled=true;confirmOptions.onOk();assert.equal(removed,0)
    state.disabled=false;removal.requestRemove();confirmOptions.onCancel();assert.equal(removed,0)
    removal.requestRemove();confirmOptions.onOk();assert.equal(removed,1)
    removal.requestRemove();scope.stop();assert.equal(destroyed,1)
  } finally {scope.stop()}
})
