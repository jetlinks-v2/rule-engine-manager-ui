import assert from 'node:assert/strict'
import test from 'node:test'
import { defineComponent, h, reactive, ref } from 'vue'
import { createMetricLoader, createMetricRenderer, flush, walk } from './helpers/metricRuntime.mjs'

test('共用分界线限制主区宽度，支持拖动取消、键盘与卸载释放', async () => {
  const width = ref(1000)
  const Handle = createMetricLoader({ '@vueuse/core': { useElementSize: () => ({ width }) } })('components/PanelResizeHandle/index.vue').default
  const props = reactive({ modelValue:360, 'onUpdate:modelValue': value => { props.modelValue = value } })
  const { renderer, root } = createMetricRenderer()
  const app = renderer.createApp({ setup: () => () => h(Handle, props) }); app.mount(root)
  const separator = walk(root, node => node.props.role === 'separator')[0]
  let captured
  separator.setPointerCapture = id => { captured = id }
  separator.hasPointerCapture = id => captured === id
  separator.releasePointerCapture = () => { captured = undefined }
  const pointer = (x, id = 1) => ({ button:0, clientX:x, pointerId:id, currentTarget:separator, preventDefault() {} })
  const key = value => ({ key:value, preventDefault() {} })
  const press = value => [].concat(separator.props.onKeydown).forEach(handler => handler(key(value)))
  let closed = false
  try {
    separator.props.onPointerdown(pointer(500)); separator.props.onPointermove(pointer(200)); await flush()
    assert.equal(props.modelValue, 640); assert.equal(captured, 1)
    press('Escape'); await flush()
    assert.equal(props.modelValue, 360); assert.equal(captured, undefined)
    separator.props.onPointerdown(pointer(500)); separator.props.onPointermove(pointer(400)); separator.props.onPointerup(); await flush()
    assert.equal(props.modelValue, 460)
    press('ArrowLeft'); await flush(); assert.equal(props.modelValue, 476)
    separator.props.onDblclick(); await flush(); assert.equal(props.modelValue, 360)
    width.value = 700; await flush(); assert.equal(props.modelValue, 340)
    press('End'); await flush(); assert.equal(props.modelValue, 340)
    separator.props.onPointerdown(pointer(500)); separator.props.onPointermove(pointer(900)); await flush()
    assert.equal(props.modelValue, 320)
    separator.props.onPointercancel(); await flush(); assert.equal(props.modelValue, 340)
    separator.props.onPointerdown(pointer(500)); app.unmount(); closed = true; assert.equal(captured, undefined)
  } finally { if (!closed) app.unmount() }
})

test('公式适配保留字号下限，容器变宽与内容缩短会恢复字号，隐藏与卸载不测量', async () => {
  const saved = Object.fromEntries(['requestAnimationFrame','cancelAnimationFrame','ResizeObserver','getComputedStyle','document'].map(key => [key, globalThis[key]]))
  const queue = new Map(), observers = [], fontListeners = new Set()
  let id = 0, fit, units = 35, reads = 0, closed = false
  globalThis.requestAnimationFrame = callback => { queue.set(++id, callback); return id }
  globalThis.cancelAnimationFrame = id => queue.delete(id)
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); this.elements = new Set() }
    observe(element) { this.elements.add(element) }
    disconnect() { this.elements.clear() }
  }
  globalThis.document = { fonts: { ready:Promise.resolve(), addEventListener:(_name, listener) => fontListeners.add(listener), removeEventListener:(_name, listener) => fontListeners.delete(listener) } }
  globalThis.getComputedStyle = () => ({ fontSize:String(fit.fontSize.value), paddingLeft:'12px', paddingRight:'12px' })
  const viewport = ref({ clientWidth:500 })
  const content = ref({ get scrollWidth() { reads++; return units * fit.fontSize.value + 24 }, getBoundingClientRect: () => ({ width:units * fit.fontSize.value + 24 }) })
  const useContentFit = createMetricLoader()('hooks/useContentFit.ts').useContentFit
  const { renderer, root } = createMetricRenderer()
  const app = renderer.createApp(defineComponent({ setup() { fit = useContentFit({ viewport, content, minSize:14, maxSize:20 }); return () => h('div') } }))
  const settle = async () => { await flush(); for (let step = 0; queue.size && step < 8; step++) { const work = [...queue.values()]; queue.clear(); work.forEach(callback => callback()); await flush() } }
  try {
    app.mount(root); await settle(); assert.equal(fit.fontSize.value, 14)
    viewport.value.clientWidth = 1000; observers[0].callback(); await settle(); assert.equal(fit.fontSize.value, 20)
    viewport.value.clientWidth = 500; observers[0].callback(); await settle(); assert.equal(fit.fontSize.value, 14)
    units = 15; fit.refresh(); await settle(); assert.equal(fit.fontSize.value, 20)
    units = 100; fit.refresh(); await settle(); assert.equal(fit.fontSize.value, 14)
    viewport.value.clientWidth = 0; const before = reads; fit.refresh(); await settle(); assert.equal(reads, before)
    fit.refresh(); app.unmount(); closed = true; await settle()
    assert.equal(queue.size, 0); assert.equal(fontListeners.size, 0); assert.equal(observers[0].elements.size, 0)
    fit.refresh(); assert.equal(queue.size, 0)
  } finally { if (!closed) app.unmount(); Object.assign(globalThis, saved) }
})

test('固定高度缩略图同时适配宽高，复杂分支缩小且内容变短后恢复',async()=>{
  const keys=['requestAnimationFrame','cancelAnimationFrame','ResizeObserver','getComputedStyle','document']
  const saved=Object.fromEntries(keys.map(key=>[key,globalThis[key]])),queue=new Map()
  let id=0,fit,height=10
  globalThis.requestAnimationFrame=callback=>{queue.set(++id,callback);return id}
  globalThis.cancelAnimationFrame=id=>queue.delete(id)
  globalThis.ResizeObserver=undefined;globalThis.document=undefined
  globalThis.getComputedStyle=()=>({fontSize:String(fit.fontSize.value),paddingLeft:'0',paddingRight:'0'})
  const viewport=ref({clientWidth:182,clientHeight:50})
  // 视口坐标模拟画布已放大两倍；字号必须仅根据未缩放的布局尺寸计算。
  const content=ref({get scrollWidth(){return fit.fontSize.value*8},get scrollHeight(){return fit.fontSize.value*height},get offsetWidth(){return fit.fontSize.value*8},get offsetHeight(){return fit.fontSize.value*height},getBoundingClientRect:()=>({width:fit.fontSize.value*16,height:fit.fontSize.value*height*2})})
  const {renderer,root}=createMetricRenderer()
  const app=renderer.createApp({setup(){fit=createMetricLoader()('hooks/useContentFit.ts').useContentFit({viewport,content,minSize:4,maxSize:12,axis:'both'});return()=>h('div')}})
  const settle=async()=>{await flush();for(let step=0;queue.size && step<8;step++){const work=[...queue.values()];queue.clear();work.forEach(callback=>callback());await flush()}}
  try {
    app.mount(root);await settle();assert.equal(fit.fontSize.value,4.8)
    height=3;fit.refresh();await settle();assert.equal(fit.fontSize.value,12)
    viewport.value.clientWidth=50;fit.refresh();await settle();assert.equal(fit.fontSize.value,6)
    height=30;fit.refresh();await settle();assert.equal(fit.fontSize.value,4)
  }finally{app.unmount();Object.assign(globalThis,saved)}
})
