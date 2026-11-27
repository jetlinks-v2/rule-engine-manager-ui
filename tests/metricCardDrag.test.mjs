import assert from 'node:assert/strict'
import test from 'node:test'
import {ref,nextTick} from 'vue'
import {createMetricLoader,createMetricRenderer} from './helpers/metricRuntime.mjs'
const {useMetricCardDrag}=createMetricLoader()('components/Metric/useMetricCardDrag.ts')

test('拖拽保持原占位，释放才提交，Esc、权限或修订变化取消',async()=>{
  const oldWindow=globalThis.window,oldDocument=globalThis.document,listeners=new Map(),writes=[]
  globalThis.window={addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key)}
  const target={dataset:{metricConfig:'b'},closest(){return this},getBoundingClientRect:()=>({top:0,bottom:100,height:100,left:100,width:100})}
  globalThis.document={elementFromPoint:()=>target}
  let captured=false
  const handle={focus(){},closest:()=>({getBoundingClientRect:()=>({top:0,bottom:100})}),setPointerCapture(){captured=true},hasPointerCapture:()=>captured,releasePointerCapture(){captured=false}}
  const configs=ref([{id:'a',revision:1},{id:'b',revision:1}]),context=ref({ownerType:'device',ownerId:'a',editable:true})
  let drag
  const {renderer,root}=createMetricRenderer(),app=renderer.createApp({setup(){drag=useMetricCardDrag(configs,context,()=>configs.value,()=>context.value.editable,
    async(config,ids)=>{writes.push(ids);return true},ref(''));return()=>null}})
  const pointer=(x,y)=>({pointerId:1,button:0,isPrimary:true,currentTarget:handle,clientX:x,clientY:y})
  try{
    app.mount(root)
    drag.start(configs.value[0],pointer(0,0));drag.move(pointer(120,80))
    assert.equal(drag.destination.value.horizontal,true);assert.equal(drag.destination.value.after,false)
    drag.move(pointer(180,80))
    assert.equal(drag.moving.value,'a');assert.deepEqual(configs.value.map(item=>item.id),['a','b']);assert.equal(writes.length,0)
    await drag.finish(pointer(180,80));assert.deepEqual(writes,[['b','a']]);assert.equal(captured,false)
    for(const cancel of [()=>listeners.get('keydown')({key:'Escape'}),()=>{configs.value[0].revision++},()=>{context.value.editable=false}]){
      context.value.editable=true;await nextTick();drag.start(configs.value[0],pointer(0,0));drag.move(pointer(180,80));cancel();await nextTick();await drag.finish(pointer(180,80))
      assert.equal(writes.length,1);assert.equal(drag.moving.value,'')
    }
  }finally{app.unmount();globalThis.window=oldWindow;globalThis.document=oldDocument}
  assert.equal(listeners.size,0)
})
